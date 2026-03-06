"""
Уведомления мастеру и клиенту через Telegram Bot API.

Когда клиент записывается — мастер получает сообщение в свой бот.
Когда мастер отменяет запись — клиент получает сообщение.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import httpx

from logger import get_logger
from app.database import db

log = get_logger('notifications')


def send_telegram_message(bot_token: str, chat_id: int, text: str):
    """Отправляет сообщение через Telegram Bot API."""
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
    except Exception as e:
        log.error('Не удалось отправить Telegram-сообщение chat_id=%s: %s', chat_id, e)


def notify_master_new_booking(master: dict, user: dict, service: dict, slot: dict, phone: str, booking_number: int):
    """Уведомляет мастера о новой записи клиента."""
    bot_token = master.get("bot_token")
    if not bot_token:
        return

    master_tg_id = master.get("telegram_id")
    if not master_tg_id:
        return

    first_name = user.get("first_name", "")
    last_name = user.get("last_name", "")
    client_name = f"{first_name} {last_name}".strip() or "Клиент"

    service_title = service.get("title", "Услуга") if service else "Услуга"

    slot_date = slot.get("date", "") if slot else ""
    start_time = slot.get("start_time", "") if slot else ""
    end_time = slot.get("end_time", "") if slot else ""

    # Убираем секунды из времени (10:00:00 → 10:00)
    if start_time and len(start_time) > 5:
        start_time = start_time[:5]
    if end_time and len(end_time) > 5:
        end_time = end_time[:5]

    text = (
        f"<b>Новая запись #{booking_number}!</b>\n\n"
        f"Клиент: {client_name}\n"
        f"Телефон: {phone}\n"
        f"Услуга: {service_title}\n"
        f"Дата: {slot_date}\n"
        f"Время: {start_time}-{end_time}"
    )

    send_telegram_message(bot_token, master_tg_id, text)


def notify_client_booking_confirmed(master: dict, client_tg_id: int, service: dict, slot: dict, booking_number: int):
    """Уведомляет клиента об успешной записи."""
    bot_token = master.get("bot_token")
    if not bot_token:
        return

    service_title = service.get("title", "Услуга") if service else "Услуга"

    slot_date = slot.get("date", "") if slot else ""
    start_time = slot.get("start_time", "") if slot else ""

    if start_time and len(start_time) > 5:
        start_time = start_time[:5]

    text = (
        f"<b>Вы записаны!</b> (#{booking_number})\n\n"
        f"Услуга: {service_title}\n"
        f"Дата: {slot_date}, {start_time}\n"
        f"Мастер: {master.get('name', '')}\n"
    )

    if master.get("address"):
        text += f"Адрес: {master['address']}\n"

    text += "\nДля отмены используйте раздел «Мои записи» в приложении."

    send_telegram_message(bot_token, client_tg_id, text)


def notify_master_booking_cancelled(master: dict, user: dict, service: dict, slot: dict, booking_number: int):
    """Уведомляет мастера об отмене записи клиентом."""
    bot_token = master.get("bot_token")
    if not bot_token:
        return

    master_tg_id = master.get("telegram_id")
    if not master_tg_id:
        return

    first_name = user.get("first_name", "")
    last_name = user.get("last_name", "")
    client_name = f"{first_name} {last_name}".strip() or "Клиент"

    service_title = service.get("title", "Услуга") if service else "Услуга"

    slot_date = slot.get("date", "") if slot else ""
    start_time = slot.get("start_time", "") if slot else ""

    if start_time and len(start_time) > 5:
        start_time = start_time[:5]

    text = (
        f"<b>Запись отменена #{booking_number}</b>\n\n"
        f"Клиент: {client_name}\n"
        f"Услуга: {service_title}\n"
        f"Дата: {slot_date}\n"
        f"Время: {start_time}"
    )

    send_telegram_message(bot_token, master_tg_id, text)
