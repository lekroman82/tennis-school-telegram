"""
Admin API — эндпоинты для мастеров (Admin Mini App).

Каждый мастер видит ТОЛЬКО свои данные — это обеспечивается
проверкой master_id на каждом запросе.
"""

import re
from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.config import settings
from app.database import db

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_master(user: dict) -> dict:
    """Проверяет что пользователь — зарегистрированный мастер."""
    if user.get("role") != "master":
        raise HTTPException(status_code=403, detail="Доступ только для мастеров")
    return user["master"]


# ─── 1. Регистрация мастера ────────────────────────────────────

@router.post("/register")
async def register_master(data: dict, user: dict = Depends(get_current_user)):
    """
    Body: { name, slug, phone }
    Slug — уникальное имя для ссылки: t.me/Bot?start=m_roman
    """
    if user.get("role") == "master":
        raise HTTPException(400, "Вы уже зарегистрированы как мастер")

    name = data.get("name", "").strip()
    slug = data.get("slug", "").strip().lower()
    phone = data.get("phone", "").strip()

    if not name or len(name) < 2:
        raise HTTPException(400, "Имя слишком короткое")
    if not slug or len(slug) < 3:
        raise HTTPException(400, "Slug должен быть минимум 3 символа")
    if not re.match(r"^[a-z0-9_]+$", slug):
        raise HTTPException(400, "Slug может содержать только a-z, 0-9, _")
    if not phone or len(phone) < 10:
        raise HTTPException(400, "Укажите корректный телефон")

    existing = db.select("masters", columns="id", slug=f"eq.{slug}")
    if existing:
        raise HTTPException(409, "Этот slug уже занят, выберите другой")

    result = db.insert("masters", {
        "telegram_id": user["telegram_user_id"],
        "slug": slug,
        "name": name,
        "phone": phone,
    })

    if not result:
        raise HTTPException(500, "Ошибка при регистрации")

    master = result[0]

    db.insert("master_categories", [
        {"master_id": master["id"], "slug": "all", "label": "Все", "sort_order": 0},
        {"master_id": master["id"], "slug": "individual", "label": "Индивидуальные", "sort_order": 1},
        {"master_id": master["id"], "slug": "group", "label": "Групповые", "sort_order": 2},
    ])

    return {"master_id": master["id"], "slug": master["slug"]}


# ─── 2. Проверка slug ──────────────────────────────────────────

@router.get("/check-slug/{slug}")
async def check_slug(slug: str):
    """GET /api/admin/check-slug/roman → { available: true }"""
    slug = slug.strip().lower()
    if not re.match(r"^[a-z0-9_]+$", slug) or len(slug) < 3:
        return {"available": False, "reason": "Неверный формат"}

    existing = db.select("masters", columns="id", slug=f"eq.{slug}")
    return {"available": len(existing) == 0}


# ─── 3. Профиль мастера ────────────────────────────────────────

@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    master = require_master(user)

    services_used = db.count("services", master_id=f"eq.{master['id']}", is_active="eq.true")

    return {
        **master,
        "services_used": services_used,
        "deeplink": f"t.me/bot?start=m_{master['slug']}",
    }


@router.put("/profile")
async def update_profile(data: dict, user: dict = Depends(get_current_user)):
    master = require_master(user)

    allowed = {
        "name", "title", "phone", "address", "working_hours",
        "website", "theme_accent", "theme_name", "photo_url",
    }
    update_data = {k: v for k, v in data.items() if k in allowed and v is not None}

    if not update_data:
        raise HTTPException(400, "Нет данных для обновления")

    db.update("masters", update_data, id=f"eq.{master['id']}")
    return {"updated": True}


# ─── 3b. Подключение бота мастера ─────────────────────────────

@router.post("/bot/connect")
async def connect_bot(data: dict, user: dict = Depends(get_current_user)):
    """
    Body: { bot_token: "123456:ABC..." }

    Мастер вводит токен от BotFather — мы:
    1. Проверяем что токен рабочий (getMe)
    2. Устанавливаем webhook на наш сервер
    3. Сохраняем токен и username в БД
    """
    master = require_master(user)
    bot_token = data.get("bot_token", "").strip()

    if not bot_token or ":" not in bot_token:
        raise HTTPException(400, "Неверный формат токена. Токен выглядит как: 123456789:ABCdefGHI...")

    # 1. Проверяем токен — вызываем getMe
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
            result = resp.json()
    except Exception:
        raise HTTPException(400, "Не удалось подключиться к Telegram API")

    if not result.get("ok"):
        raise HTTPException(400, "Токен недействителен. Проверьте что скопировали полностью из BotFather")

    bot_info = result["result"]
    bot_username = bot_info.get("username", "")

    # 2. Проверяем что этот бот не подключен к другому мастеру
    existing = db.select_one("masters", columns="id", bot_username=f"eq.{bot_username}")
    if existing and existing["id"] != master["id"]:
        raise HTTPException(409, "Этот бот уже подключен к другому мастеру")

    # 3. Устанавливаем webhook
    webhook_url = f"{settings.API_BASE_URL}/webhook/{master['id']}"
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"https://api.telegram.org/bot{bot_token}/setWebhook",
                json={"url": webhook_url, "allowed_updates": ["message"]},
            )
            wh_result = resp.json()
    except Exception:
        raise HTTPException(500, "Ошибка при установке webhook")

    if not wh_result.get("ok"):
        raise HTTPException(500, f"Telegram отклонил webhook: {wh_result.get('description', '')}")

    # 4. Сохраняем в БД
    db.update("masters", {
        "bot_token": bot_token,
        "bot_username": bot_username,
    }, id=f"eq.{master['id']}")

    return {
        "connected": True,
        "bot_username": bot_username,
        "bot_name": bot_info.get("first_name", ""),
        "webhook_url": webhook_url,
    }


@router.delete("/bot/disconnect")
async def disconnect_bot(user: dict = Depends(get_current_user)):
    """Отключает бота мастера — удаляет webhook и очищает токен."""
    master = require_master(user)

    if not master.get("bot_token"):
        raise HTTPException(400, "Бот не подключен")

    # Удаляем webhook
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(
                f"https://api.telegram.org/bot{master['bot_token']}/deleteWebhook",
            )
    except Exception:
        pass  # Не страшно если не удалось

    db.update("masters", {
        "bot_token": None,
        "bot_username": None,
    }, id=f"eq.{master['id']}")

    return {"disconnected": True}


@router.get("/bot/status")
async def bot_status(user: dict = Depends(get_current_user)):
    """Статус подключённого бота."""
    master = require_master(user)

    if not master.get("bot_token"):
        return {"connected": False}

    return {
        "connected": True,
        "bot_username": master.get("bot_username"),
    }


# ─── 4. Услуги (CRUD) ──────────────────────────────────────────

@router.get("/services")
async def get_services(user: dict = Depends(get_current_user)):
    master = require_master(user)
    return db.select("services", master_id=f"eq.{master['id']}", order="sort_order")


@router.post("/services")
async def create_service(data: dict, user: dict = Depends(get_current_user)):
    master = require_master(user)

    count = db.count("services", master_id=f"eq.{master['id']}", is_active="eq.true")
    if count >= master["max_services"]:
        raise HTTPException(403, f"Лимит услуг: {master['max_services']}. Перейдите на Pro.")

    if not data.get("title"):
        raise HTTPException(400, "Укажите название услуги")

    result = db.insert("services", {
        "master_id": master["id"],
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "duration_minutes": data.get("duration_minutes", 60),
        "price": data.get("price", 0),
        "category": data.get("category", "individual"),
        "emoji": data.get("emoji", "🎾"),
        "max_participants": data.get("max_participants", 1),
        "sort_order": data.get("sort_order", 0),
    })
    return result[0] if result else {}


@router.put("/services/{service_id}")
async def update_service(service_id: str, data: dict, user: dict = Depends(get_current_user)):
    master = require_master(user)

    existing = db.select("services", columns="id", id=f"eq.{service_id}", master_id=f"eq.{master['id']}")
    if not existing:
        raise HTTPException(404, "Услуга не найдена")

    allowed = {
        "title", "description", "duration_minutes", "price",
        "category", "emoji", "image_url", "max_participants",
        "is_active", "sort_order",
    }
    update_data = {k: v for k, v in data.items() if k in allowed}
    db.update("services", update_data, id=f"eq.{service_id}")
    return {"updated": True}


@router.delete("/services/{service_id}")
async def delete_service(service_id: str, user: dict = Depends(get_current_user)):
    master = require_master(user)

    existing = db.select("services", columns="id", id=f"eq.{service_id}", master_id=f"eq.{master['id']}")
    if not existing:
        raise HTTPException(404, "Услуга не найдена")

    db.update("services", {"is_active": False}, id=f"eq.{service_id}")
    return {"deleted": True}


# ─── 5. Шаблоны расписания ─────────────────────────────────────

@router.get("/schedule/templates")
async def get_templates(user: dict = Depends(get_current_user)):
    master = require_master(user)
    return db.select(
        "schedule_templates",
        columns="*,services(title)",
        master_id=f"eq.{master['id']}",
        is_active="eq.true",
        order="day_of_week",
    )


@router.post("/schedule/templates")
async def create_template(data: dict, user: dict = Depends(get_current_user)):
    """
    Body: { days: [0,1,2,3,4], start_time: "10:00", end_time: "11:00",
            service_id?, max_participants }
    """
    master = require_master(user)

    days = data.get("days", [])
    start_time = data.get("start_time")
    end_time = data.get("end_time")
    service_id = data.get("service_id")
    max_participants = data.get("max_participants", 1)

    if not days or not start_time or not end_time:
        raise HTTPException(400, "Укажите дни, время начала и конца")

    templates = []
    for day in days:
        templates.append({
            "master_id": master["id"],
            "service_id": service_id,
            "day_of_week": day,
            "start_time": start_time,
            "end_time": end_time,
            "max_participants": max_participants,
        })

    created = db.insert("schedule_templates", templates)
    template_ids = [t["id"] for t in created]

    # Генерируем слоты из шаблонов
    horizon = 90 if master["plan"] == "pro" else 14
    slots_created = 0
    today = date.today()

    for day_offset in range(horizon):
        slot_date = today + timedelta(days=day_offset)
        weekday = slot_date.weekday()

        for tpl in created:
            if tpl["day_of_week"] == weekday:
                try:
                    db.insert("schedule_slots", {
                        "master_id": master["id"],
                        "service_id": tpl["service_id"],
                        "template_id": tpl["id"],
                        "date": slot_date.isoformat(),
                        "start_time": tpl["start_time"],
                        "end_time": tpl["end_time"],
                        "max_participants": tpl["max_participants"],
                    })
                    slots_created += 1
                except Exception:
                    pass  # Слот уже существует

    return {"template_ids": template_ids, "slots_created": slots_created}


@router.delete("/schedule/templates/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(get_current_user)):
    master = require_master(user)

    existing = db.select("schedule_templates", columns="id", id=f"eq.{template_id}", master_id=f"eq.{master['id']}")
    if not existing:
        raise HTTPException(404, "Шаблон не найден")

    db.update("schedule_templates", {"is_active": False}, id=f"eq.{template_id}")

    # Удаляем будущие слоты без записей
    today = date.today().isoformat()
    future_slots = db.select("schedule_slots", columns="id", template_id=f"eq.{template_id}", date=f"gte.{today}")

    for slot in future_slots:
        booked = db.count("bookings", slot_id=f"eq.{slot['id']}", status="eq.confirmed")
        if booked == 0:
            db.delete("schedule_slots", id=f"eq.{slot['id']}")

    return {"deleted": True}


# ─── 6. Слоты (ручное управление) ──────────────────────────────

@router.get("/schedule")
async def get_schedule(date_from: str, date_to: str, user: dict = Depends(get_current_user)):
    master = require_master(user)

    slots = db.select(
        "schedule_slots",
        columns="*,bookings(id,status)",
        master_id=f"eq.{master['id']}",
        date=f"gte.{date_from}",
        order="date,start_time",
    )

    # Фильтр по date_to и подсчёт записей
    result = []
    for slot in slots:
        if slot.get("date", "") > date_to:
            continue
        bookings = slot.pop("bookings", [])
        slot["booked_count"] = len([b for b in bookings if b["status"] == "confirmed"])
        result.append(slot)

    return result


@router.post("/schedule/slots")
async def create_manual_slot(data: dict, user: dict = Depends(get_current_user)):
    master = require_master(user)

    result = db.insert("schedule_slots", {
        "master_id": master["id"],
        "service_id": data.get("service_id"),
        "date": data["date"],
        "start_time": data["start_time"],
        "end_time": data["end_time"],
        "max_participants": data.get("max_participants", 1),
    })
    return result[0] if result else {}


@router.delete("/schedule/slots/{slot_id}")
async def cancel_slot(slot_id: str, user: dict = Depends(get_current_user)):
    master = require_master(user)

    booked = db.count("bookings", slot_id=f"eq.{slot_id}", status="eq.confirmed")
    if booked > 0:
        raise HTTPException(409, "Нельзя отменить слот с записями")

    db.update("schedule_slots", {"is_cancelled": True}, id=f"eq.{slot_id}", master_id=f"eq.{master['id']}")
    return {"cancelled": True}


# ─── 7. Записи клиентов ────────────────────────────────────────

@router.get("/bookings")
async def get_bookings(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    master = require_master(user)

    filters = {
        "master_id": f"eq.{master['id']}",
        "order": "created_at.desc",
        "columns": "*,services(title,emoji),schedule_slots(date,start_time,end_time)",
    }
    if status:
        filters["status"] = f"eq.{status}"

    bookings = db.select("bookings", **filters)

    if date_from:
        bookings = [b for b in bookings if (b.get("schedule_slots") or {}).get("date", "") >= date_from]
    if date_to:
        bookings = [b for b in bookings if (b.get("schedule_slots") or {}).get("date", "") <= date_to]

    return bookings


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, data: dict, user: dict = Depends(get_current_user)):
    master = require_master(user)
    new_status = data.get("status")

    if new_status not in ("completed", "cancelled"):
        raise HTTPException(400, "Статус должен быть completed или cancelled")

    existing = db.select("bookings", columns="id", id=f"eq.{booking_id}", master_id=f"eq.{master['id']}")
    if not existing:
        raise HTTPException(404, "Запись не найдена")

    db.update("bookings", {"status": new_status}, id=f"eq.{booking_id}")
    return {"updated": True}


# ─── 8. Категории ──────────────────────────────────────────────

@router.get("/categories")
async def get_categories(user: dict = Depends(get_current_user)):
    master = require_master(user)
    return db.select("master_categories", master_id=f"eq.{master['id']}", order="sort_order")


@router.post("/categories")
async def create_category(data: dict, user: dict = Depends(get_current_user)):
    master = require_master(user)
    result = db.insert("master_categories", {
        "master_id": master["id"],
        "slug": data["slug"],
        "label": data["label"],
        "sort_order": data.get("sort_order", 0),
    })
    return result[0] if result else {}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, user: dict = Depends(get_current_user)):
    master = require_master(user)
    db.delete("master_categories", id=f"eq.{category_id}", master_id=f"eq.{master['id']}")
    return {"deleted": True}
