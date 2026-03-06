"""
Единая система логирования для всего проекта.

Использование:
    from logger import get_logger
    log = get_logger(__name__)

    log.info("Бот запущен")
    log.error("Ошибка API", exc_info=True)
    log.warning("Слот не найден", extra={"slot_id": "abc"})

Логи пишутся в:
    - консоль (цветной вывод)
    - logs/app.log (ротация по 5 MB, хранится 3 файла)
    - logs/errors.log (только ERROR+, ротация по 5 MB, хранится 5 файлов)
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from datetime import datetime

# Папка для логов
LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

# Формат
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class ColorFormatter(logging.Formatter):
    """Цветной вывод в консоль для быстрого чтения."""

    COLORS = {
        logging.DEBUG: "\033[36m",     # cyan
        logging.INFO: "\033[32m",      # green
        logging.WARNING: "\033[33m",   # yellow
        logging.ERROR: "\033[31m",     # red
        logging.CRITICAL: "\033[1;31m",  # bold red
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelno, "")
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def _setup_root_logger():
    """Настройка корневого логгера (вызывается один раз)."""
    root = logging.getLogger()

    if root.handlers:
        return  # уже настроен

    root.setLevel(logging.DEBUG)

    # 1. Консоль — INFO+
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(ColorFormatter(LOG_FORMAT, DATE_FORMAT))
    root.addHandler(console)

    # 2. Файл app.log — DEBUG+ (всё)
    app_file = RotatingFileHandler(
        os.path.join(LOGS_DIR, "app.log"),
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding="utf-8",
    )
    app_file.setLevel(logging.DEBUG)
    app_file.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    root.addHandler(app_file)

    # 3. Файл errors.log — ERROR+ (только ошибки)
    err_file = RotatingFileHandler(
        os.path.join(LOGS_DIR, "errors.log"),
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    err_file.setLevel(logging.ERROR)
    err_file.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    root.addHandler(err_file)


def get_logger(name: str) -> logging.Logger:
    """Получить логгер с именем модуля."""
    _setup_root_logger()
    return logging.getLogger(name)
