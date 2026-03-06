"""
Client API — эндпоинты для клиентов (Mini App для записи).

Все данные фильтруются по slug мастера — клиент Романа
видит только услуги Романа.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from logger import get_logger
from app.auth import get_current_user
from app.database import db
from app.notifications import notify_master_new_booking, notify_client_booking_confirmed, notify_master_booking_cancelled

log = get_logger('client_api')

router = APIRouter(prefix="/api/masters/{slug}", tags=["client"])


def get_master_by_slug(slug: str) -> dict:
    """Находит мастера по slug или возвращает 404."""
    master = db.select_one("masters", slug=f"eq.{slug}", is_active="eq.true")
    if not master:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    return master


# ─── 1. Профиль мастера (публичный) ───────────────────────────

@router.get("")
async def get_master_profile(slug: str):
    """GET /api/masters/roman — не требует авторизации."""
    master = get_master_by_slug(slug)

    categories = db.select(
        "master_categories",
        master_id=f"eq.{master['id']}",
        order="sort_order",
    )

    return {
        "id": master["id"],
        "name": master["name"],
        "title": master["title"],
        "photo_url": master["photo_url"],
        "experience": master["experience"],
        "phone": master["phone"],
        "address": master["address"],
        "working_hours": master["working_hours"],
        "website": master["website"],
        "theme_accent": master["theme_accent"],
        "theme_name": master["theme_name"],
        "categories": categories,
    }


# ─── 2. Каталог услуг ──────────────────────────────────────────

@router.get("/services")
async def get_services(slug: str, category: Optional[str] = None):
    """GET /api/masters/roman/services?category=individual"""
    master = get_master_by_slug(slug)

    filters = {
        "master_id": f"eq.{master['id']}",
        "is_active": "eq.true",
        "order": "sort_order",
    }
    if category:
        filters["category"] = f"eq.{category}"

    return db.select("services", **filters)


# ─── 3. Детали услуги ──────────────────────────────────────────

@router.get("/services/{service_id}")
async def get_service_detail(slug: str, service_id: str):
    """GET /api/masters/roman/services/abc-123"""
    master = get_master_by_slug(slug)

    service = db.select_one(
        "services",
        id=f"eq.{service_id}",
        master_id=f"eq.{master['id']}",
        is_active="eq.true",
    )
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    service["master"] = {
        "name": master["name"],
        "title": master["title"],
        "photo_url": master["photo_url"],
        "experience": master["experience"],
    }
    return service


# ─── 4. Даты с доступными слотами (для календаря) ──────────────

@router.get("/slots/dates")
async def get_available_dates(
    slug: str,
    service_id: str = Query(..., description="ID услуги"),
):
    """
    GET /api/masters/roman/slots/dates?service_id=abc
    → { dates: ["2026-03-10", "2026-03-11"] }
    """
    master = get_master_by_slug(slug)
    today = date.today()
    horizon = 90 if master["plan"] == "pro" else 14
    date_to = today + timedelta(days=horizon)

    result = db.rpc("get_available_dates", {
        "p_master_id": master["id"],
        "p_service_id": service_id,
        "p_date_from": today.isoformat(),
        "p_date_to": date_to.isoformat(),
    })

    dates = [row["available_date"] for row in (result or [])]
    return {"dates": dates}


# ─── 5. Слоты на дату ──────────────────────────────────────────

@router.get("/services/{service_id}/slots")
async def get_slots_for_date(
    slug: str,
    service_id: str,
    date: str = Query(..., description="YYYY-MM-DD"),
):
    """
    GET /api/masters/roman/services/abc/slots?date=2026-03-15
    → [{ id, start_time, end_time, spots_left }]
    """
    master = get_master_by_slug(slug)

    return db.rpc("get_available_slots", {
        "p_master_id": master["id"],
        "p_service_id": service_id,
        "p_date": date,
    })


# ─── 6. Создание записи ────────────────────────────────────────

@router.post("/bookings")
async def create_booking(
    slug: str,
    booking_data: dict,
    user: dict = Depends(get_current_user),
):
    """
    POST /api/masters/roman/bookings
    Body: { service_id, slot_id, phone, comment }
    """
    master = get_master_by_slug(slug)

    service_id = booking_data.get("service_id")
    slot_id = booking_data.get("slot_id")
    phone = booking_data.get("phone", "").strip()

    if not service_id or not slot_id:
        raise HTTPException(400, "Не указана услуга или время")
    if not phone or len(phone) < 10:
        raise HTTPException(400, "Укажите корректный номер телефона")

    try:
        result = db.rpc("create_booking", {
            "p_master_id": master["id"],
            "p_service_id": service_id,
            "p_slot_id": slot_id,
            "p_telegram_user_id": user["telegram_user_id"],
            "p_first_name": user.get("first_name", ""),
            "p_last_name": user.get("last_name", ""),
            "p_phone": phone,
            "p_comment": booking_data.get("comment", ""),
        })
    except Exception as e:
        error_msg = str(e)
        if "SLOT_NOT_FOUND" in error_msg:
            raise HTTPException(404, "Слот не найден или отменён")
        elif "SLOT_FULL" in error_msg:
            raise HTTPException(409, "Все места заняты")
        elif "ALREADY_BOOKED" in error_msg:
            raise HTTPException(409, "Вы уже записаны на это время")
        log.error('Ошибка создания записи: %s', error_msg, exc_info=True)
        raise HTTPException(500, f"Ошибка при создании записи: {error_msg}")

    if not result:
        raise HTTPException(500, "Не удалось создать запись")

    booking = result[0] if isinstance(result, list) else result

    # Сохраняем связь клиент↔мастер
    try:
        db.upsert("client_master_links", {
            "telegram_user_id": user["telegram_user_id"],
            "master_id": master["id"],
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name", ""),
        }, on_conflict="telegram_user_id,master_id")
    except Exception as e:
        log.warning('Не удалось сохранить client_master_link: %s', e)

    # Уведомления мастеру и клиенту
    try:
        service = db.select_one("services", id=f"eq.{service_id}")
        slot = db.select_one("schedule_slots", id=f"eq.{slot_id}")
        booking_number = booking.get("booking_number", 0)

        notify_master_new_booking(
            master, user, service, slot, phone, booking_number,
        )
        notify_client_booking_confirmed(
            master, user["telegram_user_id"], service, slot, booking_number,
        )
    except Exception as e:
        log.error('Не удалось отправить уведомления о записи: %s', e, exc_info=True)

    return {
        "booking_id": booking["booking_id"],
        "booking_number": booking["booking_number"],
    }


# ─── 7. Мои записи ────────────────────────────────────────────

@router.get("/my/bookings")
async def get_my_bookings(
    slug: str,
    user: dict = Depends(get_current_user),
):
    """GET /api/masters/roman/my/bookings"""
    master = get_master_by_slug(slug)

    return db.select(
        "bookings",
        columns="*,services(title,emoji,duration_minutes,price),schedule_slots(date,start_time,end_time)",
        master_id=f"eq.{master['id']}",
        telegram_user_id=f"eq.{user['telegram_user_id']}",
        order="created_at.desc",
    )


# ─── 8. Отмена записи ──────────────────────────────────────────

@router.post("/my/bookings/{booking_id}/cancel")
async def cancel_booking(
    slug: str,
    booking_id: str,
    user: dict = Depends(get_current_user),
):
    """POST /api/masters/roman/my/bookings/abc/cancel"""
    master = get_master_by_slug(slug)

    existing = db.select_one(
        "bookings",
        id=f"eq.{booking_id}",
        master_id=f"eq.{master['id']}",
        telegram_user_id=f"eq.{user['telegram_user_id']}",
        status="eq.confirmed",
    )
    if not existing:
        raise HTTPException(404, "Запись не найдена")

    db.update("bookings", {"status": "cancelled"}, id=f"eq.{booking_id}")

    # Уведомляем мастера об отмене
    try:
        service = db.select_one("services", id=f"eq.{existing['service_id']}")
        slot = db.select_one("schedule_slots", id=f"eq.{existing['slot_id']}")
        booking_number = existing.get("id", "")[:8]
        notify_master_booking_cancelled(master, user, service, slot, booking_number)
    except Exception as e:
        log.error('Не удалось отправить уведомление об отмене: %s', e)

    return {"success": True}
