"""
Аутентификация через Telegram initData.

Когда человек заходит в Mini App, Telegram передаёт "паспорт" (initData) —
зашифрованную строку с данными пользователя. Мы проверяем подпись
с помощью секретного ключа бота. Если подпись совпадает — данным можно
доверять.
"""

import hmac
import hashlib
import json
import time
import urllib.parse
from typing import Optional

from fastapi import Header, HTTPException

from app.config import settings
from app.database import db


def validate_init_data(init_data: str) -> dict:
    """Проверяет подпись initData от Telegram."""
    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", "")

    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash in initData")

    # Собираем строку для проверки подписи
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )

    # Вычисляем HMAC-SHA256
    secret_key = hmac.new(
        b"WebAppData", settings.BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    check_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if check_hash != received_hash:
        raise HTTPException(status_code=401, detail="Invalid initData signature")

    # Проверяем свежесть (не старше 1 часа)
    auth_date = int(parsed.get("auth_date", "0"))
    if time.time() - auth_date > 3600:
        raise HTTPException(status_code=401, detail="initData expired")

    user = json.loads(parsed.get("user", "{}"))
    return {
        "telegram_user_id": user.get("id"),
        "first_name": user.get("first_name", ""),
        "last_name": user.get("last_name", ""),
    }


async def get_current_user(
    x_telegram_init_data: Optional[str] = Header(None),
) -> dict:
    """
    FastAPI dependency — определяет кто отправил запрос.
    Роли: master, superadmin, client.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Missing X-Telegram-Init-Data header")

    user_data = validate_init_data(x_telegram_init_data)
    tg_id = user_data["telegram_user_id"]

    if not tg_id:
        raise HTTPException(status_code=401, detail="Invalid user data")

    # Проверяем: это мастер?
    master = db.select_one(
        "masters",
        telegram_id=f"eq.{tg_id}",
        is_active="eq.true",
    )

    if master:
        user_data["role"] = "master"
        user_data["master"] = master
    elif tg_id == settings.SUPERADMIN_TELEGRAM_ID:
        user_data["role"] = "superadmin"
    else:
        user_data["role"] = "client"

    return user_data
