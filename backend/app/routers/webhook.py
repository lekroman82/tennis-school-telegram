"""
Webhook — принимает сообщения от ботов мастеров.

Как это работает:
1. Каждый мастер подключает своего бота (токен от BotFather)
2. Мы настраиваем webhook: Telegram шлёт сообщения на наш сервер
3. URL вебхука: POST /webhook/{master_id}
4. По master_id мы знаем чей это бот → показываем каталог этого мастера
"""

import json
import hmac
import hashlib
import httpx

from fastapi import APIRouter, HTTPException, Request

from app.database import db

router = APIRouter(tags=["webhook"])


def telegram_api(bot_token: str, method: str, data: dict = None):
    """Вызов Telegram Bot API для конкретного бота."""
    url = f"https://api.telegram.org/bot{bot_token}/{method}"
    with httpx.Client(timeout=10.0) as client:
        if data:
            resp = client.post(url, json=data)
        else:
            resp = client.get(url)
        return resp.json()


def make_webapp_url(slug: str) -> str:
    """Формирует URL Mini App для конкретного мастера."""
    # Mini App открывается с параметром slug — по нему определяем чей каталог
    return f"https://tennis-school-telegram.vercel.app?slug={slug}"


@router.post("/webhook/{master_id}")
async def handle_webhook(master_id: str, request: Request):
    """
    Telegram отправляет сюда каждое сообщение от клиента.
    По master_id мы знаем — это бот Романа или бот Анны.
    """
    # Находим мастера
    master = db.select_one("masters", id=f"eq.{master_id}", is_active="eq.true")
    if not master or not master.get("bot_token"):
        raise HTTPException(404, "Master or bot not found")

    bot_token = master["bot_token"]
    slug = master["slug"]

    # Разбираем update от Telegram
    try:
        update = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    msg = update.get("message")
    if not msg:
        return {"ok": True}

    chat_id = msg["chat"]["id"]
    text = msg.get("text", "")
    first_name = msg.get("from", {}).get("first_name", "")

    webapp_url = make_webapp_url(slug)

    if text.startswith("/start"):
        # Параметр deep link: /start from_app
        param = text.split(maxsplit=1)[1] if " " in text else ""

        if param == "from_app":
            reply_text = (
                f"{first_name}, вы подписались!\n\n"
                "Теперь вы будете получать:\n"
                "- Напоминания о записи за день\n"
                "- Уведомления о свободных окошках\n\n"
                "Нажмите кнопку ниже, чтобы записаться:"
            )
        else:
            reply_text = (
                f"Привет, {first_name}!\n\n"
                f"Я бот <b>{master['name']}</b>.\n\n"
                "Нажмите кнопку ниже, чтобы открыть каталог услуг:"
            )

        # Кнопка открытия Mini App
        telegram_api(bot_token, "sendMessage", {
            "chat_id": chat_id,
            "text": reply_text,
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [[{
                    "text": "Открыть каталог",
                    "web_app": {"url": webapp_url},
                }]]
            },
        })

        # Постоянная кнопка внизу чата
        telegram_api(bot_token, "sendMessage", {
            "chat_id": chat_id,
            "text": "Кнопка «Записаться» теперь внизу экрана.",
            "reply_markup": {
                "keyboard": [[{
                    "text": "Записаться",
                    "web_app": {"url": webapp_url},
                }]],
                "resize_keyboard": True,
                "is_persistent": True,
            },
        })

    elif text == "/help":
        telegram_api(bot_token, "sendMessage", {
            "chat_id": chat_id,
            "text": (
                "<b>Как записаться</b>\n\n"
                "1. Нажмите «Записаться» внизу экрана\n"
                "2. Выберите услугу\n"
                "3. Выберите дату и время\n"
                "4. Подтвердите запись\n\n"
                "/start - открыть каталог\n"
                "/help - эта справка\n"
                "/contact - контакты"
            ),
            "parse_mode": "HTML",
        })

    elif text == "/contact":
        contact_text = f"<b>{master['name']}</b>\n"
        if master.get("phone"):
            contact_text += f"Телефон: {master['phone']}\n"
        if master.get("address"):
            contact_text += f"Адрес: {master['address']}\n"
        if master.get("website"):
            contact_text += f"Сайт: {master['website']}\n"

        telegram_api(bot_token, "sendMessage", {
            "chat_id": chat_id,
            "text": contact_text,
            "parse_mode": "HTML",
        })

    else:
        telegram_api(bot_token, "sendMessage", {
            "chat_id": chat_id,
            "text": (
                "Нажмите «Записаться» внизу, "
                "чтобы открыть каталог услуг, "
                "или используйте /help"
            ),
        })

    # Сохраняем связь клиент-мастер
    tg_user = msg.get("from", {})
    if tg_user.get("id"):
        try:
            db.upsert("client_master_links", {
                "telegram_user_id": tg_user["id"],
                "master_id": master["id"],
                "first_name": tg_user.get("first_name", ""),
                "last_name": tg_user.get("last_name", ""),
                "last_seen_at": "now()",
            }, on_conflict="telegram_user_id,master_id")
        except Exception:
            pass

    return {"ok": True}
