"""
Главный файл FastAPI приложения.

Метафора: это "входная дверь" нашего сервера. Все запросы
приходят сюда, а затем перенаправляются в нужный "кабинет":
- /api/masters/{slug}/... → client.py (для клиентов)
- /api/admin/... → admin.py (для мастеров)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import client, admin, webhook

app = FastAPI(
    title="Tennis SaaS API",
    description="Multi-tenant API для платформы записи к мастерам",
    version="1.0.0",
)

# CORS — разрешаем запросы от Mini App (Telegram открывает его в WebView)
# В продакшене заменить "*" на конкретные домены
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(client.router)
app.include_router(admin.router)
app.include_router(webhook.router)


@app.get("/api/health")
async def health():
    """
    Проверка что сервер жив.
    UptimeRobot будет пинговать этот эндпоинт каждые 5 минут.
    """
    return {"status": "ok"}
