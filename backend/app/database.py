"""
Подключение к базе данных Supabase через REST API.

Supabase предоставляет PostgREST — это HTTP API поверх PostgreSQL.
Вместо SQL-запросов мы отправляем HTTP-запросы:
  GET /rest/v1/masters?slug=eq.roman  →  SELECT * FROM masters WHERE slug = 'roman'

Мы используем service_key для полного доступа (обход Row Level Security).
"""

import httpx
from app.config import settings

# Базовый URL для REST API
REST_URL = f"{settings.SUPABASE_URL}/rest/v1"

# Заголовки для всех запросов
HEADERS = {
    "apikey": settings.SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# HTTP-клиент (переиспользуется для всех запросов)
http_client = httpx.Client(base_url=REST_URL, headers=HEADERS, timeout=30.0)


class SupabaseDB:
    """
    Обёртка над Supabase REST API.
    Позволяет работать с базой данных через простые методы.
    """

    def select(self, table: str, columns: str = "*", **filters) -> list:
        """
        SELECT из таблицы с фильтрами.

        Пример:
            db.select("masters", slug="eq.roman", is_active="eq.true")
            → SELECT * FROM masters WHERE slug = 'roman' AND is_active = true
        """
        params = {"select": columns}
        for key, value in filters.items():
            params[key] = value

        response = http_client.get(f"/{table}", params=params)
        response.raise_for_status()
        return response.json()

    def select_one(self, table: str, columns: str = "*", **filters) -> dict | None:
        """SELECT одной записи. Возвращает dict или None."""
        params = {"select": columns, "limit": 1}
        for key, value in filters.items():
            params[key] = value

        response = http_client.get(f"/{table}", params=params)
        response.raise_for_status()
        data = response.json()
        return data[0] if data else None

    def insert(self, table: str, data: dict | list) -> list:
        """INSERT одной или нескольких записей."""
        response = http_client.post(f"/{table}", json=data)
        response.raise_for_status()
        return response.json()

    def update(self, table: str, data: dict, **filters) -> list:
        """
        UPDATE записей по фильтрам.

        Пример:
            db.update("masters", {"name": "Роман"}, id="eq.abc-123")
            → UPDATE masters SET name = 'Роман' WHERE id = 'abc-123'
        """
        params = {}
        for key, value in filters.items():
            params[key] = value

        response = http_client.patch(f"/{table}", json=data, params=params)
        response.raise_for_status()
        return response.json()

    def delete(self, table: str, **filters) -> None:
        """DELETE записей по фильтрам."""
        params = {}
        for key, value in filters.items():
            params[key] = value

        response = http_client.delete(f"/{table}", params=params)
        response.raise_for_status()

    def upsert(self, table: str, data: dict | list, on_conflict: str = "") -> list:
        """INSERT ... ON CONFLICT DO UPDATE."""
        headers = {**HEADERS, "Prefer": "return=representation,resolution=merge-duplicates"}
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict

        response = http_client.post(
            f"/{table}", json=data, headers=headers, params=params
        )
        response.raise_for_status()
        return response.json()

    def rpc(self, function_name: str, params: dict = None) -> list:
        """
        Вызов хранимой функции (RPC).

        Пример:
            db.rpc("create_booking", {"p_master_id": "abc", ...})
            → SELECT * FROM create_booking(p_master_id := 'abc', ...)
        """
        response = http_client.post(
            f"{settings.SUPABASE_URL}/rest/v1/rpc/{function_name}",
            json=params or {},
        )
        response.raise_for_status()
        return response.json()

    def count(self, table: str, **filters) -> int:
        """COUNT записей в таблице."""
        params = {"select": "*"}
        for key, value in filters.items():
            params[key] = value

        headers_with_count = {**HEADERS, "Prefer": "count=exact"}
        response = http_client.head(f"/{table}", params=params, headers=headers_with_count)
        response.raise_for_status()
        content_range = response.headers.get("content-range", "*/0")
        total = content_range.split("/")[-1]
        return int(total) if total != "*" else 0


# Глобальный экземпляр
db = SupabaseDB()
