-- ============================================================
-- Tennis SaaS — Инициализация базы данных
-- Версия: 1.0
-- Дата: 2026-03-05
-- Описание: Все таблицы, индексы, функции для multi-tenant SaaS
-- ============================================================
-- Запускать в Supabase SQL Editor одним блоком (копировать всё и нажать Run)

-- ============================================================
-- 1. МАСТЕРА (тренеры/специалисты)
-- Метафора: это "арендаторы" нашей платформы. Каждый мастер —
-- как отдельный магазин в торговом центре.
-- ============================================================
CREATE TABLE IF NOT EXISTS masters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT UNIQUE NOT NULL,
  slug          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  title         VARCHAR(200),
  photo_url     TEXT,
  experience    INT,
  phone         VARCHAR(20),
  address       TEXT,
  working_hours VARCHAR(100),
  website       VARCHAR(200),
  theme_accent  VARCHAR(7) DEFAULT '#2AABEE',
  theme_name    VARCHAR(50) DEFAULT 'default',
  plan          VARCHAR(20) DEFAULT 'free',
  plan_expires  TIMESTAMPTZ,
  max_services  INT DEFAULT 5,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. УСЛУГИ
-- Метафора: товары в витрине магазина мастера.
-- У каждого мастера свой набор услуг.
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  title             VARCHAR(200) NOT NULL,
  description       TEXT,
  duration_minutes  INT NOT NULL DEFAULT 60,
  price             INT NOT NULL DEFAULT 0,
  category          VARCHAR(50) NOT NULL,
  emoji             VARCHAR(10),
  image_url         TEXT,
  max_participants  INT DEFAULT 1,
  is_active         BOOLEAN DEFAULT TRUE,
  sort_order        INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_master
  ON services(master_id) WHERE is_active = TRUE;

-- ============================================================
-- 3. КАТЕГОРИИ УСЛУГ (фильтры-чипы: "Все", "Индивидуальные"...)
-- Метафора: ярлычки-разделители в каталоге товаров.
-- ============================================================
CREATE TABLE IF NOT EXISTS master_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  slug        VARCHAR(50) NOT NULL,
  label       VARCHAR(100) NOT NULL,
  sort_order  INT DEFAULT 0,
  UNIQUE(master_id, slug)
);

-- ============================================================
-- 4. ШАБЛОНЫ РАСПИСАНИЯ
-- Метафора: "будильник с повтором". Мастер один раз настраивает
-- "каждый понедельник с 10 до 11" — и система сама создаёт
-- конкретные слоты на ближайшие дни.
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id        UUID REFERENCES services(id) ON DELETE CASCADE,
  day_of_week       INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  max_participants  INT DEFAULT 1,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_master
  ON schedule_templates(master_id) WHERE is_active = TRUE;

-- ============================================================
-- 5. СЛОТЫ РАСПИСАНИЯ (конкретные окна для записи)
-- Метафора: конкретные ячейки в ежедневнике.
-- "15 марта, 10:00–11:00" — одна ячейка, в которую можно записаться.
-- Создаются автоматически из шаблонов ИЛИ вручную мастером.
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_slots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id        UUID REFERENCES services(id) ON DELETE SET NULL,
  template_id       UUID REFERENCES schedule_templates(id) ON DELETE SET NULL,
  date              DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  max_participants  INT DEFAULT 1,
  is_cancelled      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Уникальность: один слот на одно время у одного мастера (с учётом service_id = NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_unique
  ON schedule_slots(master_id, date, start_time, COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::UUID));

CREATE INDEX IF NOT EXISTS idx_slots_master_date
  ON schedule_slots(master_id, date) WHERE is_cancelled = FALSE;

-- ============================================================
-- 6. ЗАПИСИ КЛИЕНТОВ
-- Метафора: чек из магазина. Клиент выбрал услугу, выбрал время —
-- получил запись (бронь).
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id         UUID NOT NULL REFERENCES masters(id),
  service_id        UUID NOT NULL REFERENCES services(id),
  slot_id           UUID NOT NULL REFERENCES schedule_slots(id),
  telegram_user_id  BIGINT NOT NULL,
  user_first_name   VARCHAR(100),
  user_last_name    VARCHAR(100),
  user_phone        VARCHAR(20) NOT NULL,
  comment           TEXT,
  status            VARCHAR(20) DEFAULT 'confirmed',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user
  ON bookings(telegram_user_id, master_id);
CREATE INDEX IF NOT EXISTS idx_bookings_master
  ON bookings(master_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique
  ON bookings(slot_id, telegram_user_id) WHERE status = 'confirmed';

-- ============================================================
-- 7. СВЯЗЬ КЛИЕНТ ↔ МАСТЕР
-- Метафора: "визитка мастера в кошельке клиента".
-- Когда клиент впервые переходит по ссылке мастера,
-- мы запоминаем эту связь. В следующий раз бот сразу
-- предложит "Записаться к Роману".
-- ============================================================
CREATE TABLE IF NOT EXISTS client_master_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id  BIGINT NOT NULL,
  master_id         UUID NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  first_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(telegram_user_id, master_id)
);

CREATE INDEX IF NOT EXISTS idx_client_links_user
  ON client_master_links(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_client_links_master
  ON client_master_links(master_id);

-- ============================================================
-- 8. ЛОГ УВЕДОМЛЕНИЙ
-- Метафора: журнал отправленных писем. Если напоминание
-- уже отправлено — не отправлять повторно.
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type                    VARCHAR(50) NOT NULL,
  recipient_telegram_id   BIGINT NOT NULL,
  sent_at                 TIMESTAMPTZ DEFAULT NOW(),
  success                 BOOLEAN DEFAULT TRUE,
  error_message           TEXT,
  UNIQUE(booking_id, type, recipient_telegram_id)
);

-- ============================================================
-- 9. ПОДПИСКИ МАСТЕРОВ (история платежей)
-- Метафора: чеки за аренду "места в ТЦ".
-- Каждая оплата — отдельная запись.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       UUID NOT NULL REFERENCES masters(id),
  plan            VARCHAR(20) NOT NULL,
  amount          INT NOT NULL,
  payment_method  VARCHAR(50),
  payment_id      TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. ХРАНИМАЯ ПРОЦЕДУРА: СОЗДАНИЕ ЗАПИСИ (АТОМАРНАЯ)
--
-- Зачем: когда два клиента одновременно нажимают "Записаться"
-- на последнее свободное место — только один из них получит запись.
-- Второй увидит "Место занято".
--
-- Метафора: турникет в метро. Даже если два человека подошли
-- одновременно — пройдёт только один. Второй подождёт и увидит
-- "проход закрыт".
--
-- Как это работает:
--   1. FOR UPDATE — "блокируем турникет" (строку слота)
--   2. COUNT — считаем сколько людей уже прошло
--   3. Если мест нет — EXCEPTION (отказ)
--   4. Если место есть — INSERT (запись)
--   5. Всё внутри одной транзакции — либо всё, либо ничего
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking(
  p_master_id        UUID,
  p_service_id       UUID,
  p_slot_id          UUID,
  p_telegram_user_id BIGINT,
  p_first_name       VARCHAR,
  p_last_name        VARCHAR,
  p_phone            VARCHAR,
  p_comment          TEXT
) RETURNS TABLE(booking_id UUID, booking_number BIGINT) AS $$
DECLARE
  v_max_participants INT;
  v_current_count    INT;
  v_booking_id       UUID;
  v_booking_number   BIGINT;
BEGIN
  -- 1. Блокируем слот (FOR UPDATE)
  SELECT s.max_participants INTO v_max_participants
  FROM schedule_slots s
  WHERE s.id = p_slot_id
    AND s.master_id = p_master_id
    AND s.is_cancelled = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND';
  END IF;

  -- 2. Считаем подтверждённые записи
  SELECT COUNT(*) INTO v_current_count
  FROM bookings
  WHERE slot_id = p_slot_id AND status = 'confirmed';

  -- 3. Проверяем: есть ли место
  IF v_current_count >= v_max_participants THEN
    RAISE EXCEPTION 'SLOT_FULL';
  END IF;

  -- 4. Проверяем: не записан ли уже
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE slot_id = p_slot_id
      AND telegram_user_id = p_telegram_user_id
      AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'ALREADY_BOOKED';
  END IF;

  -- 5. Номер записи (per-master)
  SELECT COUNT(*) + 1 INTO v_booking_number
  FROM bookings WHERE master_id = p_master_id;

  -- 6. Создаём запись
  INSERT INTO bookings (
    master_id, service_id, slot_id, telegram_user_id,
    user_first_name, user_last_name, user_phone, comment
  ) VALUES (
    p_master_id, p_service_id, p_slot_id, p_telegram_user_id,
    p_first_name, p_last_name, p_phone, p_comment
  ) RETURNING id INTO v_booking_id;

  RETURN QUERY SELECT v_booking_id, v_booking_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. ФУНКЦИЯ: ДОСТУПНЫЕ СЛОТЫ НА ДАТУ
-- Возвращает слоты с подсчитанным количеством свободных мест.
-- Используется в Client API: GET /api/masters/{slug}/services/{id}/slots
-- ============================================================
CREATE OR REPLACE FUNCTION get_available_slots(
  p_master_id  UUID,
  p_service_id UUID,
  p_date       DATE
) RETURNS TABLE(
  slot_id          UUID,
  start_time       TIME,
  end_time         TIME,
  max_participants INT,
  spots_left       INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.start_time,
    s.end_time,
    s.max_participants,
    (s.max_participants - COUNT(b.id)::INT) AS spots_left
  FROM schedule_slots s
  LEFT JOIN bookings b
    ON b.slot_id = s.id AND b.status = 'confirmed'
  WHERE s.master_id = p_master_id
    AND s.date = p_date
    AND s.is_cancelled = FALSE
    AND (s.service_id IS NULL OR s.service_id = p_service_id)
  GROUP BY s.id, s.start_time, s.end_time, s.max_participants
  HAVING s.max_participants - COUNT(b.id)::INT > 0
  ORDER BY s.start_time;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 12. ФУНКЦИЯ: ДАТЫ СО СВОБОДНЫМИ СЛОТАМИ
-- Для зелёных точек в календаре: "на эти даты есть окошки"
-- ============================================================
CREATE OR REPLACE FUNCTION get_available_dates(
  p_master_id  UUID,
  p_service_id UUID,
  p_date_from  DATE,
  p_date_to    DATE
) RETURNS TABLE(available_date DATE) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT s.date
  FROM schedule_slots s
  LEFT JOIN bookings b
    ON b.slot_id = s.id AND b.status = 'confirmed'
  WHERE s.master_id = p_master_id
    AND s.date BETWEEN p_date_from AND p_date_to
    AND s.is_cancelled = FALSE
    AND (s.service_id IS NULL OR s.service_id = p_service_id)
  GROUP BY s.id, s.date, s.max_participants
  HAVING s.max_participants - COUNT(b.id)::INT > 0
  ORDER BY s.date;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 13. ТРИГГЕР: АВТООБНОВЛЕНИЕ updated_at
-- При любом изменении записи автоматически ставим текущее время
-- в поле updated_at. Не нужно делать это вручную в коде.
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_masters_updated
  BEFORE UPDATE ON masters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_services_updated
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_bookings_updated
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 14. ПОЛЯ ДЛЯ БОТА МАСТЕРА
-- Каждый мастер может подключить своего Telegram-бота.
-- bot_token — секретный ключ от BotFather
-- bot_username — @имя бота (для отображения)
-- ============================================================
ALTER TABLE masters ADD COLUMN IF NOT EXISTS bot_token TEXT;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS bot_username VARCHAR(100);

-- ============================================================
-- ГОТОВО! После выполнения этого скрипта в базе будут:
--   9 таблиц: masters, services, master_categories,
--             schedule_templates, schedule_slots, bookings,
--             client_master_links, notifications_log, subscriptions
--   3 функции: create_booking, get_available_slots, get_available_dates
--   3 триггера: auto-update updated_at
-- ============================================================
