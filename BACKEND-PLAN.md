# BACKEND-PLAN.md — Архитектура SaaS-платформы

> Версия: 2.0
> Дата: 5 марта 2026
> Основа: research.md (5 конкурентов), текущий MVP, ответы заказчика
> Изменения v2.0: исправлены гонки данных, модель расписания, недостающие таблицы, DevOps, инфраструктура БД

---

## Концепция

**Что строим:** Multi-tenant SaaS-платформа для мастеров/тренеров.
Один Telegram-бот → мастер регистрируется → настраивает услуги/расписание/фото → получает персональную ссылку → его клиенты записываются через Mini App, видя только этого мастера.

**Монетизация:** Freemium — 5 услуг бесплатно, далее подписка (~500₽/мес) с расширенными возможностями (больше услуг, кастомная тема, аналитика).

---

## Архитектура (обзор)

```
┌────────────────────────────────────────────────────────┐
│                    TELEGRAM                             │
│                                                        │
│  Клиент                        Мастер                  │
│  t.me/bot?start=m_roman        t.me/bot?start=admin    │
│       │                              │                  │
│       ▼                              ▼                  │
│  ┌──────────┐                 ┌──────────────┐         │
│  │Client    │                 │Admin         │         │
│  │Mini App  │                 │Mini App      │         │
│  │(запись)  │                 │(управление)  │         │
│  └────┬─────┘                 └──────┬───────┘         │
│       │                              │                  │
└───────┼──────────────────────────────┼──────────────────┘
        │           HTTPS              │
        ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│  Beget VPS (Docker Compose)                             │
│                                                         │
│  ┌─────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │  nginx  │──▶│  FastAPI      │──▶│  Telegram    │    │
│  │ (proxy  │   │  (API + Bot   │   │  Bot API     │    │
│  │  + SSL  │   │   webhook)    │   │  (webhook)   │    │
│  │  + static)  └──────┬───────┘   └──────────────┘    │
│  └─────────┘          │                                 │
│   ↑ раздаёт           ▼                                │
│   tg-app/      ┌──────────────┐                        │
│   tg-admin/    │ PostgreSQL   │  ← БД на VPS           │
│                │ (контейнер)  │                         │
│                └──────────────┘                         │
│                                                         │
│                       │ фото                            │
│                       ▼                                 │
│              ┌──────────────────┐                       │
│              │ Supabase Storage │  ← только фото        │
│              │ (бесплатно 1GB) │                        │
│              └──────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### Почему PostgreSQL на VPS, а не Supabase

| Критерий | Supabase Free | PostgreSQL на VPS |
|----------|--------------|-------------------|
| Засыпает через 7 дней | Да — клиенты не смогут записаться | Нет — работает 24/7 |
| Лимит БД | 500MB | Ограничен только диском VPS |
| Бэкапы | Нет на free | Настроим pg_dump cron |
| Стоимость | $0 (но ненадёжно) | $0 (уже на VPS) |
| Латентность | ~50-100ms (через интернет) | <1ms (localhost) |

**Решение:** PostgreSQL в Docker на VPS. Supabase оставляем **только для Storage** (хранение фото, 1GB бесплатно).

---

## Стек технологий

| Слой | Технология | Почему |
|------|-----------|--------|
| **Backend API** | Python FastAPI | Async, быстрый, типизация, research.md рекомендует |
| **БД** | PostgreSQL 16 (Docker) | На VPS, не засыпает, полный контроль, <1ms латентность |
| **ORM** | SQLAlchemy 2.0 + asyncpg | Async, миграции через Alembic, типизация |
| **Миграции** | Alembic | Версионирование схемы БД, безопасные изменения |
| **Хранение фото** | Supabase Storage | До 1GB бесплатно, CDN, простой API |
| **Bot** | FastAPI webhook endpoint | Один процесс, без отдельного сервиса |
| **Фронт (клиент)** | Текущий HTML/CSS/JS → подключаем к API | Без фреймворков, < 30KB |
| **Фронт (админ)** | Отдельный HTML/CSS/JS Mini App | Аналогичный стек, отдельная папка |
| **Proxy** | nginx | SSL (Let's Encrypt), static files, reverse proxy |
| **Контейнеры** | Docker Compose | FastAPI + PostgreSQL + nginx |
| **VPS** | Beget | Полный контроль, Docker support |
| **Мониторинг** | UptimeRobot (бесплатно) | Пинг каждые 5 мин, алерт в Telegram |

---

## Модель данных

### Таблица: `masters` (мастера/тренеры)

```sql
CREATE TABLE masters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT UNIQUE NOT NULL,     -- Telegram user ID мастера
  slug          VARCHAR(50) UNIQUE NOT NULL, -- URL-slug: "roman", "anna_tennis"
  name          VARCHAR(100) NOT NULL,       -- "Роман Лекомцев"
  title         VARCHAR(200),               -- "Тренер по теннису, автор методики"
  photo_url     TEXT,                       -- URL фото в Supabase Storage
  experience    INT,                        -- лет опыта
  phone         VARCHAR(20),               -- контактный телефон
  address       TEXT,                       -- "ул. Чернышевского, 94 к3, Саратов"
  working_hours VARCHAR(100),              -- "Пн–Вс: 10:00–21:00"
  website       VARCHAR(200),              -- "bolshoitennis.ru"
  -- Настройки темы (WhiteLabel)
  theme_accent  VARCHAR(7),                -- "#2AABEE" (hex-цвет акцента)
  theme_name    VARCHAR(50),               -- "default" | "dark" | "sport" и т.д.
  -- Подписка
  plan          VARCHAR(20) DEFAULT 'free', -- "free" | "pro"
  plan_expires  TIMESTAMPTZ,               -- NULL = бессрочный free
  max_services  INT DEFAULT 5,             -- лимит услуг (free=5, pro=unlimited)
  -- Мета
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Таблица: `services` (услуги мастера)

```sql
CREATE TABLE services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  title             VARCHAR(200) NOT NULL,     -- "Индивидуальная тренировка"
  description       TEXT,                      -- "Персональное занятие..."
  duration_minutes  INT NOT NULL DEFAULT 60,   -- 60
  price             INT NOT NULL DEFAULT 0,    -- в рублях, 0 = бесплатно
  category          VARCHAR(50) NOT NULL,      -- "individual" | "group" | "rent" | "trial"
  emoji             VARCHAR(10),               -- "🎾" (для карточки)
  image_url         TEXT,                      -- URL фото в Supabase Storage
  max_participants  INT DEFAULT 1,             -- 1 для индивид., 4-6 для группы
  is_active         BOOLEAN DEFAULT TRUE,
  sort_order        INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс: услуги мастера
CREATE INDEX idx_services_master ON services(master_id) WHERE is_active = TRUE;
```

### Таблица: `schedule_templates` (шаблоны расписания) — НОВАЯ

```sql
-- Мастер настраивает шаблон один раз: "Пн-Пт с 10:00 до 20:00, каждый час"
-- Cron-задача генерирует конкретные слоты из шаблонов на N дней вперёд
CREATE TABLE schedule_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id        UUID REFERENCES services(id) ON DELETE CASCADE, -- NULL = для всех услуг
  day_of_week       INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Пн, 6=Вс
  start_time        TIME NOT NULL,           -- "10:00"
  end_time          TIME NOT NULL,           -- "11:00"
  max_participants  INT DEFAULT 1,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс: шаблоны мастера
CREATE INDEX idx_templates_master ON schedule_templates(master_id) WHERE is_active = TRUE;

-- Пример: мастер создаёт шаблон "Пн-Пт, 10:00-11:00, индивидуальная"
-- Cron каждую ночь проверяет: на какие даты нужно сгенерировать слоты
-- и создаёт записи в schedule_slots
```

### Таблица: `schedule_slots` (конкретные слоты)

```sql
-- Конкретные слоты на конкретные даты.
-- Создаются двумя способами:
--   1. Автоматически из schedule_templates (cron)
--   2. Вручную мастером (разовый слот)
CREATE TABLE schedule_slots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id        UUID REFERENCES services(id) ON DELETE SET NULL,
  template_id       UUID REFERENCES schedule_templates(id) ON DELETE SET NULL, -- NULL = создан вручную
  date              DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  max_participants  INT DEFAULT 1,
  is_cancelled      BOOLEAN DEFAULT FALSE,   -- мастер отменил слот
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  -- Уникальность: один слот на одно время у одного мастера
  UNIQUE(master_id, date, start_time, service_id)
);

-- Индекс: доступные слоты мастера на дату
CREATE INDEX idx_slots_master_date ON schedule_slots(master_id, date)
  WHERE is_cancelled = FALSE;
```

**Важно:** Убран `booked_count` и `is_available`. Доступность слота вычисляется на лету:

```sql
-- Проверка доступности слота (вместо booked_count):
SELECT s.*,
  s.max_participants - COUNT(b.id) AS spots_left
FROM schedule_slots s
LEFT JOIN bookings b ON b.slot_id = s.id AND b.status = 'confirmed'
WHERE s.master_id = :master_id
  AND s.date = :date
  AND s.is_cancelled = FALSE
GROUP BY s.id
HAVING s.max_participants - COUNT(b.id) > 0;
```

### Таблица: `bookings` (записи клиентов)

```sql
CREATE TABLE bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id),
  service_id        UUID NOT NULL REFERENCES services(id),
  slot_id           UUID NOT NULL REFERENCES schedule_slots(id),
  -- Данные клиента
  telegram_user_id  BIGINT NOT NULL,
  user_first_name   VARCHAR(100),
  user_last_name    VARCHAR(100),
  user_phone        VARCHAR(20) NOT NULL,
  comment           TEXT,
  -- Статус
  status            VARCHAR(20) DEFAULT 'confirmed', -- "confirmed" | "cancelled" | "completed"
  -- Мета
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс: записи клиента
CREATE INDEX idx_bookings_user ON bookings(telegram_user_id, master_id);
-- Индекс: записи мастера
CREATE INDEX idx_bookings_master ON bookings(master_id, status);
-- Уникальность: один клиент — один слот
CREATE UNIQUE INDEX idx_bookings_unique ON bookings(slot_id, telegram_user_id)
  WHERE status = 'confirmed';
```

**Номер записи** генерируется per-master (не глобальный SERIAL):

```sql
-- При создании записи:
-- booking_number = (SELECT COUNT(*) + 1 FROM bookings WHERE master_id = :master_id)
-- Хранится отдельно для отображения клиенту: "#42"
```

### Таблица: `client_master_links` (привязка клиентов к мастерам) — НОВАЯ

```sql
-- Когда клиент переходит по deep link мастера, создаётся связь.
-- При повторном открытии бота клиент видит "Записаться к Роману".
CREATE TABLE client_master_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id  BIGINT NOT NULL,
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  first_name        VARCHAR(100),    -- имя из Telegram
  last_name         VARCHAR(100),
  first_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(telegram_user_id, master_id)
);

-- Индекс: все мастера клиента
CREATE INDEX idx_client_links_user ON client_master_links(telegram_user_id);
-- Индекс: все клиенты мастера
CREATE INDEX idx_client_links_master ON client_master_links(master_id);
```

### Таблица: `notifications_log` (лог уведомлений) — НОВАЯ

```sql
-- Отслеживаем отправленные уведомления, чтобы не слать дважды.
-- Cron-задача проверяет: есть ли запись в логе перед отправкой.
CREATE TABLE notifications_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,  -- "confirmation_client" | "confirmation_master"
                                       -- | "reminder_24h" | "reminder_2h"
                                       -- | "cancellation_client" | "cancellation_master"
  recipient_telegram_id  BIGINT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  success       BOOLEAN DEFAULT TRUE,
  error_message TEXT,                  -- если не удалось отправить
  UNIQUE(booking_id, type, recipient_telegram_id)  -- не слать дважды
);
```

### Таблица: `master_categories` (категории-фильтры)

```sql
CREATE TABLE master_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  slug        VARCHAR(50) NOT NULL,  -- "individual", "group", "rent"
  label       VARCHAR(100) NOT NULL, -- "Индивидуальные", "Групповые", "Аренда"
  sort_order  INT DEFAULT 0,
  UNIQUE(master_id, slug)
);
```

### Таблица: `subscriptions` (подписки мастеров)

```sql
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       UUID NOT NULL REFERENCES masters(id),
  plan            VARCHAR(20) NOT NULL,      -- "pro"
  amount          INT NOT NULL,              -- сумма в рублях
  payment_method  VARCHAR(50),               -- "telegram_stars" | "card" | "manual"
  payment_id      TEXT,                      -- ID платежа (Telegram/Stripe)
  starts_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) DEFAULT 'active', -- "active" | "expired" | "cancelled"
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Хранимая процедура: `create_booking()` — НОВАЯ

```sql
-- Атомарная запись: проверка + создание в одной транзакции.
-- Защита от гонок: два клиента одновременно записываются на один слот.
CREATE OR REPLACE FUNCTION create_booking(
  p_master_id       UUID,
  p_service_id      UUID,
  p_slot_id         UUID,
  p_telegram_user_id BIGINT,
  p_first_name      VARCHAR,
  p_last_name       VARCHAR,
  p_phone           VARCHAR,
  p_comment         TEXT
) RETURNS TABLE(booking_id UUID, booking_number BIGINT) AS $$
DECLARE
  v_max_participants INT;
  v_current_count    INT;
  v_booking_id       UUID;
  v_booking_number   BIGINT;
BEGIN
  -- 1. Блокируем слот (SELECT FOR UPDATE — никто другой не сможет
  --    параллельно читать этот слот, пока транзакция не завершится)
  SELECT s.max_participants INTO v_max_participants
  FROM schedule_slots s
  WHERE s.id = p_slot_id
    AND s.master_id = p_master_id
    AND s.is_cancelled = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND: Слот не найден или отменён';
  END IF;

  -- 2. Считаем текущие подтверждённые записи на этот слот
  SELECT COUNT(*) INTO v_current_count
  FROM bookings
  WHERE slot_id = p_slot_id AND status = 'confirmed';

  -- 3. Проверяем: есть ли место
  IF v_current_count >= v_max_participants THEN
    RAISE EXCEPTION 'SLOT_FULL: Все места заняты (% из %)', v_current_count, v_max_participants;
  END IF;

  -- 4. Проверяем: не записан ли уже этот клиент на этот слот
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE slot_id = p_slot_id
      AND telegram_user_id = p_telegram_user_id
      AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'ALREADY_BOOKED: Вы уже записаны на это время';
  END IF;

  -- 5. Генерируем номер записи (per-master)
  SELECT COALESCE(MAX(b.booking_number), 0) + 1 INTO v_booking_number
  FROM (
    SELECT ROW_NUMBER() OVER (ORDER BY created_at) AS booking_number
    FROM bookings WHERE master_id = p_master_id
  ) b;

  -- 6. Создаём запись
  INSERT INTO bookings (master_id, service_id, slot_id, telegram_user_id,
                        user_first_name, user_last_name, user_phone, comment)
  VALUES (p_master_id, p_service_id, p_slot_id, p_telegram_user_id,
          p_first_name, p_last_name, p_phone, p_comment)
  RETURNING id INTO v_booking_id;

  RETURN QUERY SELECT v_booking_id, v_booking_number;
END;
$$ LANGUAGE plpgsql;
```

**Как это защищает от гонок:**
1. `FOR UPDATE` блокирует строку слота — второй запрос ждёт
2. После блокировки считаем `COUNT(*)` — точное значение
3. Если мест нет — `RAISE EXCEPTION` → транзакция откатывается
4. Всё внутри одной транзакции — атомарно

### Cron-задача: генерация слотов из шаблонов — НОВАЯ

```python
# Запускается каждую ночь в 03:00 (или каждые 6 часов)
# Логика:
async def generate_slots_from_templates():
    """
    Для каждого активного мастера:
    1. Берём его schedule_templates
    2. Определяем горизонт: free = 14 дней, pro = 90 дней
    3. Для каждого дня в горизонте проверяем day_of_week
    4. Если шаблон подходит и слота ещё нет — создаём слот
    """
    masters = await db.fetch("SELECT * FROM masters WHERE is_active = TRUE")
    for master in masters:
        horizon = 90 if master['plan'] == 'pro' else 14
        templates = await db.fetch(
            "SELECT * FROM schedule_templates WHERE master_id = $1 AND is_active = TRUE",
            master['id']
        )
        for day_offset in range(horizon):
            date = today + timedelta(days=day_offset)
            weekday = date.weekday()  # 0=Пн, 6=Вс
            for tpl in templates:
                if tpl['day_of_week'] == weekday:
                    # INSERT ... ON CONFLICT DO NOTHING (слот уже есть = пропускаем)
                    await db.execute("""
                        INSERT INTO schedule_slots
                          (master_id, service_id, template_id, date, start_time, end_time, max_participants)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (master_id, date, start_time, service_id) DO NOTHING
                    """, master['id'], tpl['service_id'], tpl['id'],
                         date, tpl['start_time'], tpl['end_time'], tpl['max_participants'])
```

---

## API-эндпоинты

### Аутентификация

Каждый запрос содержит заголовок `X-Telegram-Init-Data` с initData из Telegram SDK.
Бэкенд валидирует HMAC-SHA256 подпись с bot token (research.md, п.10).

```python
# auth.py — пошаговая реализация:

import hmac, hashlib, urllib.parse, json, time

async def validate_init_data(init_data: str, bot_token: str) -> dict:
    """
    1. Парсим init_data как URL query string
    2. Извлекаем hash (это подпись от Telegram)
    3. Собираем data_check_string: все параметры (кроме hash)
       отсортированные по алфавиту, через \n: "key=value\nkey=value"
    4. Вычисляем secret_key = HMAC-SHA256("WebAppData", bot_token)
    5. Вычисляем check_hash = HMAC-SHA256(secret_key, data_check_string)
    6. Сравниваем check_hash == hash
    7. Проверяем auth_date: не старше 1 часа (защита от replay)
    """
    parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop('hash', '')

    # Сортируем и собираем строку
    data_check_string = '\n'.join(f'{k}={v}' for k, v in sorted(parsed.items()))

    # HMAC
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    check_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if check_hash != received_hash:
        raise HTTPException(401, 'Invalid initData signature')

    # Проверка свежести (1 час)
    auth_date = int(parsed.get('auth_date', 0))
    if time.time() - auth_date > 3600:
        raise HTTPException(401, 'initData expired')

    # Извлекаем user
    user = json.loads(parsed.get('user', '{}'))
    return {
        'telegram_user_id': user.get('id'),
        'first_name': user.get('first_name', ''),
        'last_name': user.get('last_name', ''),
    }
```

### Определение роли

```python
async def get_current_user(init_data: str = Header(alias='X-Telegram-Init-Data')):
    """
    FastAPI dependency — вызывается на каждом защищённом эндпоинте.
    1. Валидируем initData
    2. Проверяем: есть ли telegram_id в таблице masters → роль master
    3. Проверяем: совпадает ли с SUPERADMIN_TELEGRAM_ID → роль superadmin
    4. Иначе → роль client
    """
    user_data = await validate_init_data(init_data, BOT_TOKEN)
    tg_id = user_data['telegram_user_id']

    master = await db.fetchone("SELECT * FROM masters WHERE telegram_id = $1", tg_id)
    if master:
        user_data['role'] = 'master'
        user_data['master'] = master
    elif tg_id == SUPERADMIN_TELEGRAM_ID:
        user_data['role'] = 'superadmin'
    else:
        user_data['role'] = 'client'

    return user_data
```

### Client API (Mini App клиента)

```
GET  /api/masters/{slug}
  → Публичный профиль мастера (имя, фото, адрес, тема, категории)
  → БЕЗ initData (для предпросмотра)
  → Ответ: { name, photo_url, address, working_hours, theme_accent, categories[] }

GET  /api/masters/{slug}/services
  → Список активных услуг мастера
  → Фильтр: ?category=individual
  → Ответ: [ { id, title, description, price, duration_minutes, emoji, image_url, category, max_participants } ]

GET  /api/masters/{slug}/services/{id}
  → Детали услуги + тренер + ближайший слот
  → Ответ: { ...service, master: { name, photo_url, title, experience }, next_available_slot }

GET  /api/masters/{slug}/slots/dates?service_id=xxx
  → Даты с доступными слотами (для зелёных точек в календаре)
  → Ответ: { dates: ["2026-03-10", "2026-03-11", ...] }

GET  /api/masters/{slug}/services/{id}/slots?date=2026-03-15
  → Доступные слоты на конкретную дату
  → Использует запрос с LEFT JOIN bookings для подсчёта spots_left
  → Ответ: [ { id, start_time, end_time, spots_left } ]

POST /api/masters/{slug}/bookings
  → Создание записи (ВЫЗЫВАЕТ ХРАНИМУЮ ПРОЦЕДУРУ create_booking)
  → Требует initData
  → Body: { service_id, slot_id, phone, comment }
  → Ответ: { booking_id, booking_number, service_title, date, time, master_name }
  → Ошибки: SLOT_NOT_FOUND | SLOT_FULL | ALREADY_BOOKED | INVALID_PHONE

GET  /api/my/bookings?master_slug=xxx
  → Список записей текущего клиента у мастера
  → Требует initData
  → Ответ: [ { id, booking_number, service_title, date, start_time, status } ]

POST /api/my/bookings/{id}/cancel
  → Отмена записи клиентом
  → Требует initData, проверка что booking.telegram_user_id == текущий user
  → Ответ: { success: true }
```

### Admin API (Mini App мастера)

```
--- Регистрация и профиль ---

POST /api/admin/register
  → Регистрация мастера (первый вход)
  → Требует initData
  → Body: { name, slug, phone }
  → Валидация: slug уникален, 3-50 символов, a-z0-9_
  → Создаёт запись в masters + дефолтные категории
  → Ответ: { master_id, slug }

GET  /api/admin/profile
  → Профиль мастера (для редактирования)
  → Требует initData, роль=master
  → Ответ: { name, slug, phone, address, photo_url, theme_accent, plan, ... }

PUT  /api/admin/profile
  → Обновление профиля
  → Body: { name?, title?, phone?, address?, working_hours?, website?, theme_accent? }
  → Ответ: { updated: true }

--- Услуги ---

GET    /api/admin/services
  → Все услуги мастера (включая неактивные)
  → Ответ: [ { id, title, price, is_active, sort_order, ... } ]

POST   /api/admin/services
  → Создание услуги
  → ПРОВЕРКА ЛИМИТА: COUNT(services WHERE is_active) < master.max_services
  → Body: { title, description, price, duration_minutes, category, emoji, max_participants }
  → Ошибка если лимит: LIMIT_REACHED (подсказка: "Перейдите на Pro")
  → Ответ: { service_id }

PUT    /api/admin/services/{id}
  → Редактирование услуги
  → Проверка: service.master_id == текущий мастер
  → Body: { title?, description?, price?, ... }

DELETE /api/admin/services/{id}
  → Мягкое удаление: is_active = false
  → Слоты и записи сохраняются

--- Категории ---

GET    /api/admin/categories
POST   /api/admin/categories      → Body: { slug, label }
PUT    /api/admin/categories/{id} → Body: { label?, sort_order? }
DELETE /api/admin/categories/{id}

--- Расписание ---

GET  /api/admin/schedule?date_from=...&date_to=...
  → Слоты мастера за период + количество записей на каждый
  → Ответ: [ { id, date, start_time, end_time, max_participants, booked_count, is_cancelled } ]

POST /api/admin/schedule/templates
  → Создание шаблона расписания
  → Body: { days: [0,1,2,3,4], start_time: "10:00", end_time: "11:00",
            service_id?, max_participants }
  → Создаёт N записей в schedule_templates (по одной на день)
  → Сразу генерирует слоты на горизонт (14 или 90 дней)
  → Ответ: { template_ids: [...], slots_created: 42 }

GET  /api/admin/schedule/templates
  → Список шаблонов мастера
  → Ответ: [ { id, day_of_week, start_time, end_time, service_title, is_active } ]

DELETE /api/admin/schedule/templates/{id}
  → Деактивация шаблона (is_active = false)
  → Будущие слоты БЕЗ записей удаляются
  → Слоты С записями остаются

POST /api/admin/schedule/slots
  → Ручное создание разового слота (без шаблона)
  → Body: { date, start_time, end_time, service_id?, max_participants }

DELETE /api/admin/schedule/slots/{id}
  → Отмена слота (is_cancelled = true)
  → Только если нет подтверждённых записей

--- Записи ---

GET  /api/admin/bookings?status=confirmed&date_from=...&date_to=...
  → Список записей клиентов
  → Ответ: [ { id, booking_number, client_name, client_phone, service_title,
               date, start_time, status } ]

PUT  /api/admin/bookings/{id}/status
  → Изменение статуса записи
  → Body: { status: "completed" | "cancelled" }
  → Если отмена: отправка уведомления клиенту через бота

--- Загрузка файлов ---

POST /api/admin/upload
  → Загрузка фото (аватар мастера или фото услуги)
  → Content-Type: multipart/form-data
  → Валидация:
    - Только image/jpeg, image/png, image/webp
    - Максимум 5MB
    - Генерируем уникальное имя: {master_id}/{uuid}.{ext}
  → Загружаем в Supabase Storage (bucket: "photos")
  → Ответ: { url: "https://srwauhuhxqfwjcszooyv.supabase.co/storage/v1/object/public/photos/..." }

--- Подписка ---

GET  /api/admin/subscription
  → Текущий план, лимиты, дата окончания
  → Ответ: { plan, max_services, services_used, plan_expires, can_upgrade }

POST /api/admin/subscription/create-payment
  → Создание платежа через Telegram Stars
  → Ответ: { invoice_link } — для tg.openInvoice()

--- Аналитика (только pro) ---

GET  /api/admin/stats?period=month
  → Проверка: master.plan == "pro"
  → Ответ: { total_bookings, new_clients, popular_services[], bookings_by_day[] }
```

### Bot Webhook

```
POST /bot/webhook
  → Обработка обновлений от Telegram
  → Типы обновлений:

  message.text == "/start m_{slug}":
    1. Найти мастера по slug
    2. Создать/обновить запись в client_master_links
    3. Отправить приветствие: "👋 {Мастер} приветствует вас!"
    4. Кнопка InlineKeyboard: "📋 Открыть каталог" → WebApp(url + ?master=slug)

  message.text == "/start admin":
    1. Проверить: есть ли мастер с этим telegram_id
    2. Если да → "Добро пожаловать!" + кнопка "Панель управления"
    3. Если нет → "Создайте профиль!" + кнопка "Зарегистрироваться" → Admin Mini App

  message.text == "/start":
    1. Проверить client_master_links: есть ли привязанные мастера
    2. Если есть → показать кнопки с мастерами
    3. Если нет → общее приветствие

  message.text == "/help":
    → Справка с командами

  message.text == "/contact":
    → Контакт поддержки

  pre_checkout_query (оплата подписки):
    → Подтвердить платёж → активировать Pro
```

---

## Роли и доступ

| Роль | Что видит | Что может делать |
|------|----------|-----------------|
| **Клиент** | Услуги/расписание конкретного мастера, свои записи | Записаться, отменить запись |
| **Мастер (free)** | Свой профиль, записи клиентов, до 5 услуг | Управлять услугами/шаблонами расписания, загружать фото |
| **Мастер (pro)** | Всё из free + аналитика | Безлимит услуг, кастомная тема, 90 дней расписания |
| **Суперадмин (ты)** | Все мастера, все данные | Управление подписками, блокировка мастеров |

### Защита данных между мастерами

```python
# Каждый admin-эндпоинт автоматически фильтрует по master_id:
@router.get("/api/admin/services")
async def get_services(user = Depends(get_current_user)):
    if user['role'] != 'master':
        raise HTTPException(403)
    master_id = user['master']['id']
    # ← ВСЕ запросы содержат WHERE master_id = master_id
    return await db.fetch("SELECT * FROM services WHERE master_id = $1", master_id)
```

---

## Flow пользователей

### Flow мастера (регистрация и настройка)

```
1. Мастер открывает бота → /start admin
2. Бот: "Добро пожаловать! Создайте свой профиль"
   → Кнопка "Открыть панель управления" (Admin Mini App)
3. Admin Mini App → экран регистрации:
   - Имя (предзаполнено из Telegram)
   - Slug (проверка уникальности через API в реальном времени)
     → t.me/bot?start=m_slug
   - Телефон
4. После регистрации → дашборд:
   - "Добавить услугу" (до 5 бесплатно)
   - "Настроить расписание" (через шаблоны)
   - "Мой профиль" (фото, адрес, описание)
   - "Моя ссылка" → копировать ссылку для клиентов
5. Мастер добавляет услуги:
   - Название, описание, цена, длительность, категория, фото
6. Мастер настраивает расписание через шаблоны:
   - Выбирает дни недели: ☑Пн ☑Вт ☑Ср ☑Чт ☑Пт ☐Сб ☐Вс
   - Выбирает время: 10:00 — 20:00
   - Интервал: каждый час
   - → API создаёт шаблоны + сразу генерирует слоты на 14 дней
   - Мастер видит календарь с зелёными точками на днях со слотами
7. Мастер копирует ссылку и шлёт клиентам:
   → t.me/BotName?start=m_roman
```

### Flow клиента (запись)

```
1. Клиент переходит по ссылке мастера:
   → t.me/BotName?start=m_roman
2. Бот:
   → Создаёт запись в client_master_links
   → "{Имя мастера} приветствует вас!"
   → Кнопка "Открыть каталог" (Client Mini App + ?master=roman)
3. Client Mini App загружается:
   → GET /api/masters/roman → профиль, тема, название
   → GET /api/masters/roman/services → каталог услуг
   → Показывает профиль мастера, его услуги, его тему
4. Далее стандартный flow:
   Каталог → Детали → Дата/Время → Подтверждение → Успех
5. POST /api/masters/roman/bookings
   → Вызывает create_booking() — атомарная проверка + создание
   → Ответ: booking_number, детали
6. Бот отправляет подтверждение клиенту в чат
   → Запись в notifications_log (type: confirmation_client)
7. Бот отправляет уведомление мастеру
   → Запись в notifications_log (type: confirmation_master)
```

---

## Один бот — много мастеров (как это работает)

### Deep links

```
Клиент:  t.me/BotName?start=m_roman     → slug="roman"
Мастер:  t.me/BotName?start=admin        → переход в Admin Mini App
```

### Mini App URL-ы

```
Клиент:  https://yourdomain.ru/?master=roman
Админ:   https://yourdomain.ru/admin/
```

Бот передаёт slug мастера через URL параметр Mini App.

### Привязка клиента к мастеру

При переходе по deep link `m_roman`:
1. Бот создаёт/обновляет запись в `client_master_links`
2. При повторном `/start` (без параметров) — бот показывает кнопки с привязанными мастерами
3. Клиент может быть привязан к нескольким мастерам одновременно

---

## Подписка и лимиты

### Free (бесплатно)

| Возможность | Лимит |
|------------|-------|
| Услуги | до 5 |
| Расписание | до 14 дней вперёд |
| Записи клиентов | без ограничений |
| Фото услуг | до 5 |
| Тема | стандартная |
| Аналитика | нет |
| Брендинг | "Powered by [Название платформы]" в футере |

### Pro (~500₽/мес)

| Возможность | Лимит |
|------------|-------|
| Услуги | без ограничений |
| Расписание | до 90 дней вперёд |
| Записи | без ограничений |
| Фото | без ограничений |
| Тема | кастомные цвета, логотип |
| Аналитика | записи, клиенты, популярные услуги |
| Брендинг | без "Powered by" |
| Напоминания | 24ч + 2ч до визита |

### Оплата подписки

- **Telegram Stars** — нативно внутри Telegram (openInvoice)
- **Ручная** — для первых клиентов (суперадмин подтверждает через бота)

---

## Структура файлов

```
tennis-school-telegram/
├── docker-compose.yml           ← PostgreSQL + FastAPI + nginx
├── Dockerfile                   ← FastAPI app
├── .env                         ← секреты (не в git!)
├── .env.example                 ← шаблон .env (в git)
├── nginx/
│   ├── nginx.conf               ← reverse proxy + static
│   └── certbot/                 ← SSL-сертификаты Let's Encrypt
├── deploy.sh                    ← скрипт деплоя (ssh + pull + restart)
├── backup.sh                    ← скрипт бэкапа БД (pg_dump, cron)
├── backend/
│   ├── requirements.txt         ← fastapi, uvicorn, asyncpg, sqlalchemy, alembic, python-multipart
│   ├── alembic.ini              ← конфигурация Alembic
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/            ← файлы миграций (001_initial.py, 002_add_templates.py, ...)
│   └── app/
│       ├── main.py              ← FastAPI app, подключение роутеров, CORS, middleware
│       ├── config.py            ← Pydantic BaseSettings, чтение .env
│       ├── database.py          ← AsyncEngine, AsyncSession, get_db dependency
│       ├── auth.py              ← validate_init_data(), get_current_user()
│       ├── models/
│       │   ├── __init__.py
│       │   ├── master.py        ← SQLAlchemy модель Master
│       │   ├── service.py       ← SQLAlchemy модель Service
│       │   ├── slot.py          ← SQLAlchemy модель ScheduleSlot, ScheduleTemplate
│       │   ├── booking.py       ← SQLAlchemy модель Booking
│       │   └── notification.py  ← SQLAlchemy модель NotificationLog, ClientMasterLink
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── master.py        ← Pydantic схемы (request/response) для мастеров
│       │   ├── service.py       ← Pydantic схемы для услуг
│       │   ├── slot.py          ← Pydantic схемы для слотов
│       │   └── booking.py       ← Pydantic схемы для записей
│       ├── routers/
│       │   ├── client.py        ← /api/masters/{slug}/...
│       │   ├── admin.py         ← /api/admin/...
│       │   ├── upload.py        ← /api/admin/upload (Supabase Storage)
│       │   └── subscription.py  ← /api/admin/subscription/...
│       ├── bot/
│       │   ├── webhook.py       ← POST /bot/webhook, маршрутизация обновлений
│       │   ├── handlers.py      ← /start, /help, /contact, deep links
│       │   └── notifications.py ← send_booking_confirmation(), send_reminder()
│       └── services/
│           ├── booking.py       ← create_booking() → вызывает SQL-функцию
│           ├── schedule.py      ← generate_slots_from_templates(), CRUD шаблонов
│           ├── subscription.py  ← check_limits(), create_invoice()
│           └── cron.py          ← APScheduler задачи: генерация слотов, напоминания, бэкапы
├── tg-app/                      ← Client Mini App (текущий, доработанный)
│   ├── index.html
│   ├── styles.css
│   └── app.js                   ← fetch к API вместо хардкода
└── tg-admin/                    ← Admin Mini App (новый)
    ├── index.html
    ├── styles.css
    └── admin.js
```

---

## Что меняется в текущем фронтенде (tg-app)

### Было → Стало

| Что | Было (MVP) | Стало (SaaS) |
|-----|-----------|--------------|
| Данные услуг | Захардкожены в `SERVICES[]` | `fetch('/api/masters/{slug}/services')` |
| Данные тренера | `COACHES[]` | `fetch('/api/masters/{slug}')` |
| Расписание | `generateSlots()` (рандом) | `fetch('/api/.../slots?date=')` |
| Запись | `setTimeout()` имитация | `POST /api/.../bookings` → create_booking() |
| Подтверждение | `console.log()` | Бэкенд → бот шлёт сообщение |
| Фото | Эмодзи-заглушки | Реальные фото из Supabase Storage |
| Тема/цвета | Фиксированные | Из профиля мастера (`theme_accent`) |
| Название школы | "Первая Школа Тенниса" | Из `masters.name` |
| Адрес | Захардкожен | Из `masters.address` |
| Мои записи | localStorage | `fetch('/api/my/bookings')` |

### Что НЕ меняется

- HTML-структура экранов (5 основных + табы)
- CSS-стили и анимации
- Навигация (navigateTo/navigateBack)
- Telegram SDK интеграция (BackButton, MainButton, HapticFeedback)
- Маска телефона, валидация

---

## Уведомления бота

| Событие | Кому | Когда | Сообщение |
|---------|------|-------|-----------|
| Новая запись | Клиенту | Сразу после записи | "✅ Вы записаны! [детали]" |
| Новая запись | Мастеру | Сразу после записи | "📋 Новая запись: [клиент, услуга, дата]" |
| Напоминание | Клиенту | За 24 часа | "⏰ Напоминаем: завтра в [время] — [услуга]" |
| Напоминание | Клиенту | За 2 часа | "🔔 Через 2 часа: [услуга] у [мастер]" |
| Отмена клиентом | Мастеру | Сразу | "❌ Клиент [имя] отменил запись на [дата]" |
| Отмена мастером | Клиенту | Сразу | "⚠️ Ваша запись на [дата] отменена мастером" |

### Реализация уведомлений

```python
# APScheduler задача — каждые 15 минут:
async def send_reminders():
    """
    1. Найти записи с status='confirmed' и датой через 24ч (±15 мин)
    2. Для каждой: проверить notifications_log — отправляли ли reminder_24h?
    3. Если нет → отправить через Bot API → записать в notifications_log
    4. То же для 2ч напоминаний
    """
    now = datetime.utcnow()

    # 24-часовые напоминания
    bookings_24h = await db.fetch("""
        SELECT b.*, s.title as service_title, sl.date, sl.start_time,
               m.name as master_name
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        JOIN schedule_slots sl ON sl.id = b.slot_id
        JOIN masters m ON m.id = b.master_id
        WHERE b.status = 'confirmed'
          AND (sl.date + sl.start_time) BETWEEN $1 AND $2
          AND NOT EXISTS (
            SELECT 1 FROM notifications_log nl
            WHERE nl.booking_id = b.id AND nl.type = 'reminder_24h'
          )
    """, now + timedelta(hours=23, minutes=45), now + timedelta(hours=24, minutes=15))

    for booking in bookings_24h:
        success = await send_telegram_message(
            booking['telegram_user_id'],
            f"⏰ Напоминаем: завтра в {booking['start_time']} — {booking['service_title']}"
        )
        await db.execute("""
            INSERT INTO notifications_log (booking_id, type, recipient_telegram_id, success)
            VALUES ($1, 'reminder_24h', $2, $3)
        """, booking['id'], booking['telegram_user_id'], success)
```

---

## DevOps и инфраструктура — НОВЫЙ РАЗДЕЛ

### Покупка и настройка Beget VPS

```
1. Зайти на beget.com → VPS → выбрать тариф:
   - Минимальный: 1 CPU, 1GB RAM, 10GB SSD (~200₽/мес)
   - Рекомендуемый: 2 CPU, 2GB RAM, 20GB SSD (~400₽/мес)
   - ОС: Ubuntu 22.04 LTS
2. После создания: получить IP, root-пароль
3. Привязать домен (или использовать IP + поддомен)
```

### Первоначальная настройка VPS

```bash
# 1. Подключиться по SSH
ssh root@YOUR_IP

# 2. Обновить систему
apt update && apt upgrade -y

# 3. Создать пользователя (не работать от root)
adduser deploy
usermod -aG sudo deploy
su - deploy

# 4. Установить Docker и Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy

# 5. Установить certbot для SSL
sudo apt install certbot -y

# 6. Настроить firewall
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### SSL-сертификат (Let's Encrypt)

```bash
# Получить сертификат (нужен домен, направленный на IP сервера):
sudo certbot certonly --standalone -d yourdomain.ru -d www.yourdomain.ru

# Сертификаты будут в:
# /etc/letsencrypt/live/yourdomain.ru/fullchain.pem
# /etc/letsencrypt/live/yourdomain.ru/privkey.pem

# Автообновление (certbot ставит cron автоматически):
sudo certbot renew --dry-run
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: tennis_saas
      POSTGRES_USER: tennis
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"  # только localhost, не наружу!
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tennis"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: .
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql+asyncpg://tennis:${DB_PASSWORD}@postgres:5432/tennis_saas
    ports:
      - "127.0.0.1:8000:8000"  # только localhost, nginx проксирует

  nginx:
    image: nginx:alpine
    restart: always
    depends_on:
      - api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./tg-app:/usr/share/nginx/html/app:ro
      - ./tg-admin:/usr/share/nginx/html/admin:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro

volumes:
  postgres_data:
```

### nginx.conf

```nginx
server {
    listen 80;
    server_name yourdomain.ru;
    # Редирект HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.ru;

    ssl_certificate /etc/letsencrypt/live/yourdomain.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.ru/privkey.pem;

    # Client Mini App (статика)
    location / {
        root /usr/share/nginx/html/app;
        try_files $uri $uri/ /index.html;
    }

    # Admin Mini App (статика)
    location /admin/ {
        alias /usr/share/nginx/html/admin/;
        try_files $uri $uri/ /admin/index.html;
    }

    # API (проксируем в FastAPI)
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Bot webhook (проксируем в FastAPI)
    location /bot/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Скрипт деплоя (deploy.sh)

```bash
#!/bin/bash
# Запускать на VPS: ./deploy.sh
set -e

echo "📦 Pulling latest code..."
cd /home/deploy/tennis-school-telegram
git pull origin master

echo "🔄 Rebuilding and restarting..."
docker compose build api
docker compose up -d

echo "🗄️ Running migrations..."
docker compose exec api alembic upgrade head

echo "✅ Deploy complete!"
docker compose ps
```

### Бэкап базы данных (backup.sh)

```bash
#!/bin/bash
# Запускать по cron: 0 3 * * * /home/deploy/backup.sh
BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M)
mkdir -p $BACKUP_DIR

# Дамп базы
docker compose exec -T postgres pg_dump -U tennis tennis_saas | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Удалить бэкапы старше 30 дней
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup saved: $BACKUP_DIR/db_$DATE.sql.gz"
```

### Мониторинг

```
1. UptimeRobot (бесплатно, uptimerobot.com):
   - Создать монитор: HTTPS, https://yourdomain.ru/api/health
   - Интервал: 5 мин
   - Алерт: Telegram бот (или email)

2. Эндпоинт /api/health в FastAPI:
   @app.get("/api/health")
   async def health():
       # Проверяем подключение к БД
       try:
           await db.execute("SELECT 1")
           return {"status": "ok", "db": "connected"}
       except:
           return JSONResponse(status_code=503, content={"status": "error"})
```

### Миграции (Alembic)

```bash
# Первоначальная настройка (один раз):
cd backend
alembic init alembic
# Настроить alembic.ini: sqlalchemy.url = postgresql+asyncpg://...

# Создание миграции после изменения моделей:
alembic revision --autogenerate -m "add schedule_templates table"

# Применение миграций:
alembic upgrade head

# Откат на одну миграцию назад:
alembic downgrade -1
```

---

## Этапы разработки

### Этап 1: Инфраструктура и фундамент
- [ ] Купить Beget VPS (Ubuntu 22.04, 2 CPU, 2GB RAM)
- [ ] Настроить VPS: Docker, firewall, пользователь deploy
- [ ] Привязать домен, получить SSL-сертификат (Let's Encrypt)
- [ ] docker-compose.yml: PostgreSQL + FastAPI + nginx
- [ ] Структура FastAPI проекта: config, database, auth
- [ ] Alembic: инициализация, первая миграция (все таблицы)
- [ ] Хранимая процедура `create_booking()` в PostgreSQL
- [ ] Эндпоинт /api/health
- [ ] deploy.sh, backup.sh, cron для бэкапов
- [ ] UptimeRobot мониторинг
- [ ] Первый деплой: убедиться что всё запускается

### Этап 2: Client API
- [ ] GET /api/masters/{slug} — публичный профиль
- [ ] GET /api/masters/{slug}/services — каталог
- [ ] GET /api/masters/{slug}/slots/dates — даты со слотами
- [ ] GET /api/masters/{slug}/services/{id}/slots?date= — слоты на дату
- [ ] POST /api/masters/{slug}/bookings — запись (через create_booking())
- [ ] GET /api/my/bookings — мои записи
- [ ] POST /api/my/bookings/{id}/cancel — отмена записи
- [ ] Переключить tg-app на API (вместо хардкода)
- [ ] Тест: записать клиента через Mini App → проверить в БД

### Этап 3: Bot webhook
- [ ] POST /bot/webhook — обработка обновлений
- [ ] /start m_{slug} → client_master_links + приветствие
- [ ] /start admin → кнопка Admin Mini App
- [ ] /start (без параметров) → список привязанных мастеров
- [ ] /help, /contact
- [ ] Уведомления: подтверждение записи → клиенту + мастеру
- [ ] Cron: напоминания 24ч + 2ч (с проверкой notifications_log)
- [ ] Зарегистрировать webhook в Telegram API

### Этап 4: Admin Mini App
- [ ] Экран регистрации мастера (имя, slug, телефон)
- [ ] Дашборд: записи на сегодня, статистика
- [ ] CRUD услуг: добавление, редактирование, удаление
- [ ] Загрузка фото через Supabase Storage
- [ ] Шаблоны расписания: создание, просмотр, удаление
- [ ] Ручное создание разовых слотов
- [ ] Календарь с визуализацией слотов и записей
- [ ] Настройки профиля: адрес, время работы, фото
- [ ] "Моя ссылка" — копирование deeplink
- [ ] Управление записями: просмотр, отмена

### Этап 5: Подписка и лимиты
- [ ] Проверка лимитов (5 услуг, 5 фото, 14 дней на free)
- [ ] Экран подписки в Admin Mini App
- [ ] Оплата через Telegram Stars (createInvoiceLink + pre_checkout)
- [ ] Активация Pro-фич после оплаты
- [ ] Cron: проверка истёкших подписок → понижение до free

### Этап 6: WhiteLabel и темы
- [ ] Мастер выбирает акцентный цвет в настройках
- [ ] Client Mini App подхватывает тему из API
- [ ] Логотип/фото мастера в шапке вместо эмодзи
- [ ] Скрытие "Powered by" на Pro

### Этап 7: Тестирование и запуск
- [ ] Тестирование полного flow: регистрация мастера → настройка → запись клиента
- [ ] Тест гонки: два клиента одновременно на один слот
- [ ] Light/dark тема
- [ ] Safe area на разных устройствах
- [ ] Нагрузочный тест (10+ мастеров, 100+ записей)
- [ ] Документация для мастеров: "Как начать за 5 минут"

---

## Переменные окружения (.env)

```env
# Telegram
BOT_TOKEN=xxx                              # Токен бота от @BotFather
WEBAPP_URL=https://yourdomain.ru           # URL клиентского Mini App
ADMIN_URL=https://yourdomain.ru/admin      # URL админского Mini App

# PostgreSQL (на VPS, в Docker)
DB_PASSWORD=xxx                            # Пароль PostgreSQL
DATABASE_URL=postgresql+asyncpg://tennis:${DB_PASSWORD}@postgres:5432/tennis_saas

# Supabase (ТОЛЬКО для Storage — хранение фото)
SUPABASE_URL=https://srwauhuhxqfwjcszooyv.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_xxx         # Для загрузки файлов

# Подписка
SUPERADMIN_TELEGRAM_ID=123456789           # Твой Telegram ID
PRO_PRICE_STARS=500                        # Цена Pro в Telegram Stars

# Сервер
API_HOST=0.0.0.0
API_PORT=8000
```

---

## Безопасность

| Угроза | Защита | Реализация |
|--------|--------|------------|
| Подделка запроса | HMAC-SHA256 валидация initData | auth.py: validate_init_data() на каждом запросе |
| Replay-атака | Проверка auth_date (не старше 1 часа) | auth.py: time.time() - auth_date > 3600 → 401 |
| Мастер видит чужие данные | WHERE master_id = текущий мастер | Каждый admin-эндпоинт фильтрует по master_id |
| Двойная запись на слот | Хранимая процедура с FOR UPDATE | create_booking(): блокировка строки + COUNT |
| SQL-инъекция | Параметризованные запросы | SQLAlchemy / asyncpg: $1, $2 (не f-strings) |
| Загрузка вредоносных файлов | Проверка типа + лимит размера | upload.py: image/jpeg,png,webp, max 5MB |
| DDoS на API | Rate limiting | FastAPI slowapi: 60 req/min на user |
| Неоплаченный Pro | Проверка plan_expires | Middleware на admin-роутах |
| Утечка секретов | .env не в git, .env.example как шаблон | .gitignore: .env, postgres_data/ |
| Доступ к БД снаружи | PostgreSQL только на localhost | docker: 127.0.0.1:5432, не 0.0.0.0 |

---

## Что НЕ входит в V1

| Фича | Почему не сейчас | Когда |
|------|-----------------|------|
| Онлайн-оплата клиентом (Telegram Payments) | Нужен платёжный провайдер, юрлицо | V2 |
| Абонементы для клиентов | Сложная логика баланса | V2 |
| Отзывы от клиентов | Нужно накопить базу | V2 |
| Несколько тренеров у одного мастера | Усложняет модель | V2 |
| Интеграция с Google Calendar | Доп. фича | V2 |
| Свой бот мастера (индивидуальный) | Premium WhiteLabel | V3 |
| Реферальная программа | Маркетинг | V3 |
| Мобильное приложение (не Mini App) | Другой стек | V3+ |

---

## Чеклист перед началом разработки

- [ ] Куплен Beget VPS
- [ ] Привязан домен к IP
- [ ] Сохранены ключи Supabase (для Storage)
- [ ] Сохранён BOT_TOKEN
- [ ] Определён SUPERADMIN_TELEGRAM_ID (твой Telegram ID)
