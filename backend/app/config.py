"""
Конфигурация приложения.

Метафора: это "паспортный стол" приложения — здесь хранятся
все ключи, пароли и настройки. Мы читаем их из файла .env,
чтобы секреты не попали в код.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env из корня проекта (на два уровня вверх от этого файла)
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(env_path)


class Settings:
    # Telegram
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Суперадмин (твой Telegram ID)
    SUPERADMIN_TELEGRAM_ID: int = int(os.getenv("SUPERADMIN_TELEGRAM_ID", "0"))

    # Сервер
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))

    # Публичный URL сервера (для webhook)
    # Пример: https://api.mytennis.ru или https://abc123.ngrok.io
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")


settings = Settings()
