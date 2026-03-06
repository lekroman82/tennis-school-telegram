# DEPLOYMENT.md — Деплой на VPS

Пошаговая инструкция по развёртыванию проекта на сервере.

---

## Что где работает

```
+-----------------------+------------------------------------------+
| Компонент             | Где работает                             |
+-----------------------+------------------------------------------+
| Mini App (tg-app/)    | Vercel (автодеплой из GitHub)            |
| FastAPI (backend/)    | Beget VPS (Docker)                       |
| База данных           | Supabase (облако, бесплатный тариф)      |
| Боты мастеров         | Telegram → webhook → FastAPI на VPS      |
+-----------------------+------------------------------------------+
```

**Vercel** раздаёт фронтенд (HTML/CSS/JS).
**VPS** запускает API-сервер и принимает webhook от Telegram-ботов.
**Supabase** хранит данные (PostgreSQL в облаке).

---

## Этап 0. Что уже сделано

- [x] Mini App задеплоен на Vercel: https://tennis-school-telegram.vercel.app
- [x] База данных создана в Supabase (таблицы, функции, триггеры)
- [x] Ключи Supabase в `.env`
- [x] Backend написан: FastAPI + auth + client/admin/webhook роутеры
- [ ] VPS ещё не куплен

---

## Этап 1. Покупка VPS на Beget

### Шаг 1.1. Заходим на beget.com

1. Открой https://beget.com/ru/cloud
2. Нажми "Заказать"
3. Выбери тариф:
   - **Минимальный** (достаточно для старта): 1 CPU, 1 GB RAM, 10 GB SSD (~200 руб/мес)
4. Операционная система: **Ubuntu 22.04**
5. Оплати и дождись создания (1-5 минут)

### Шаг 1.2. Запиши данные

После создания VPS ты получишь:
- **IP-адрес** сервера (например: `185.123.45.67`)
- **root-пароль** (придёт на почту или в панели)

Запиши их — они понадобятся дальше.

---

## Этап 2. Подключение к серверу

### Шаг 2.1. Открой терминал

- **Windows**: открой PowerShell или установи Git Bash
- Введи команду:

```bash
ssh root@ТВОЙ_IP
```

Замени `ТВОЙ_IP` на IP-адрес сервера. Введи пароль, когда попросят.

Если видишь `root@server:~#` — ты подключён.

### Шаг 2.2. Обнови систему

```bash
apt update && apt upgrade -y
```

Жди, пока закончится (1-3 минуты). Если спрашивает что-то — нажимай Enter.

### Шаг 2.3. Создай пользователя (не работай от root)

```bash
adduser deploy
```

Введи пароль для нового пользователя. Остальные поля (имя, комната...) — пропускай Enter.

```bash
usermod -aG sudo deploy
```

Это даёт пользователю `deploy` права администратора.

### Шаг 2.4. Установи Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

### Шаг 2.5. Установи Docker Compose

```bash
apt install docker-compose-plugin -y
```

Проверь:

```bash
docker compose version
```

Должно вывести что-то вроде `Docker Compose version v2.x.x`.

### Шаг 2.6. Настрой фаервол

```bash
ufw allow 22     # SSH (чтобы не заблокировать себя!)
ufw allow 80     # HTTP
ufw allow 443    # HTTPS
ufw enable
```

На вопрос `Command may disrupt existing SSH connections. Proceed?` ответь `y`.

---

## Этап 3. Загрузка проекта на сервер

### Шаг 3.1. Переключись на пользователя deploy

```bash
su - deploy
```

### Шаг 3.2. Клонируй репозиторий

```bash
git clone https://github.com/lekroman82/tennis-school-telegram.git
cd tennis-school-telegram
```

### Шаг 3.3. Создай файл .env

```bash
nano .env
```

Вставь содержимое (замени значения на свои):

```env
BOT_TOKEN=your_bot_token_here

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here

# Публичный URL сервера (замени на свой IP или домен)
API_BASE_URL=https://YOUR_IP_OR_DOMAIN

# ID суперадмина (твой Telegram ID)
SUPERADMIN_TELEGRAM_ID=0
```

Сохрани: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Этап 4. Создание Docker-файлов

### Шаг 4.1. Dockerfile для API

Создай файл в корне проекта:

```bash
nano Dockerfile
```

Вставь:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Копируем зависимости и устанавливаем
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY backend/app ./app

# Запускаем FastAPI через uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Шаг 4.2. docker-compose.yml

```bash
nano docker-compose.yml
```

Вставь:

```yaml
services:
  api:
    build: .
    restart: always
    env_file: .env
    ports:
      - "80:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Что это делает:**
- `build: .` — собирает образ из Dockerfile
- `restart: always` — перезапускает если упал
- `env_file: .env` — передаёт секреты из .env
- `ports: "80:8000"` — порт 80 снаружи → 8000 внутри контейнера
- `healthcheck` — проверяет что сервер жив

> Мы НЕ поднимаем свой PostgreSQL — используем Supabase в облаке.
> Это проще: не надо настраивать бэкапы, обновления, мониторинг БД.

---

## Этап 5. Запуск

### Шаг 5.1. Собери и запусти

```bash
cd /home/deploy/tennis-school-telegram
docker compose up -d --build
```

- `--build` — собрать образ
- `-d` — запустить в фоне

Первый запуск займёт 1-2 минуты (скачивает Python, устанавливает пакеты).

### Шаг 5.2. Проверь что работает

```bash
docker compose ps
```

Должно показать статус `Up` или `running`:

```
NAME       IMAGE                          STATUS          PORTS
api        tennis-school-telegram-api     Up (healthy)    0.0.0.0:80->8000/tcp
```

### Шаг 5.3. Проверь API

```bash
curl http://localhost:8000/api/health
```

Ответ:

```json
{"status":"ok"}
```

Теперь проверь снаружи — открой в браузере:

```
http://ТВОЙ_IP/api/health
```

Если видишь `{"status":"ok"}` — сервер работает!

---

## Этап 6. Домен и HTTPS (опционально, но рекомендуется)

Telegram требует HTTPS для webhook. Есть два варианта:

### Вариант А: Домен + Let's Encrypt (рекомендуется)

1. Купи домен (например, на reg.ru или beget.com)
2. В DNS направь домен на IP сервера (A-запись)
3. На сервере:

```bash
# Останови контейнер (порт 80 нужен для certbot)
docker compose down

# Установи certbot
sudo apt install certbot -y

# Получи сертификат
sudo certbot certonly --standalone -d твойдомен.ru

# Запомни пути к сертификатам:
# /etc/letsencrypt/live/твойдомен.ru/fullchain.pem
# /etc/letsencrypt/live/твойдомен.ru/privkey.pem
```

4. Обнови `docker-compose.yml` — добавь nginx:

```yaml
services:
  api:
    build: .
    restart: always
    env_file: .env
    expose:
      - "8000"

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
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

5. Создай `nginx/nginx.conf`:

```bash
mkdir -p nginx
nano nginx/nginx.conf
```

```nginx
events { worker_connections 1024; }

http {
    server {
        listen 80;
        server_name твойдомен.ru;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name твойдомен.ru;

        ssl_certificate /etc/letsencrypt/live/твойдомен.ru/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/твойдомен.ru/privkey.pem;

        location / {
            proxy_pass http://api:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

6. Перезапусти:

```bash
docker compose up -d --build
```

7. Обнови `.env`:

```
API_BASE_URL=https://твойдомен.ru
```

### Вариант Б: Без домена (через IP)

Telegram НЕ позволяет webhook на голый IP без SSL. Но можно использовать self-signed сертификат:

```bash
# Генерируем самоподписанный сертификат
openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout webhook_key.pem -x509 -days 365 \
  -out webhook_cert.pem \
  -subj "/CN=ТВОЙ_IP"
```

Затем при установке webhook нужно передать сертификат — это уже сделано в коде `admin.py` `/bot/connect`. Но для self-signed нужна доработка. Лучше купить домен.

---

## Этап 7. Обновление кода (деплой)

Когда ты внёс изменения и запушил в GitHub:

```bash
# Подключаемся к серверу
ssh deploy@ТВОЙ_IP

# Переходим в проект
cd tennis-school-telegram

# Тянем новый код
git pull

# Пересобираем и перезапускаем
docker compose up -d --build
```

Это занимает 30-60 секунд. Сервер перезапустится с новым кодом.

### Скрипт для быстрого деплоя

Создай на сервере файл `deploy.sh`:

```bash
nano /home/deploy/deploy.sh
```

```bash
#!/bin/bash
set -e
cd /home/deploy/tennis-school-telegram
echo "Pulling latest code..."
git pull origin master
echo "Rebuilding..."
docker compose up -d --build
echo "Done! Checking status..."
docker compose ps
```

```bash
chmod +x /home/deploy/deploy.sh
```

Теперь деплой одной командой:

```bash
./deploy.sh
```

---

## Полезные команды

```bash
# Посмотреть статус контейнеров
docker compose ps

# Посмотреть логи API (последние 100 строк)
docker compose logs api --tail 100

# Посмотреть логи в реальном времени
docker compose logs api -f

# Перезапустить API
docker compose restart api

# Остановить всё
docker compose down

# Пересобрать и запустить
docker compose up -d --build
```

---

## Мониторинг (бесплатно)

1. Зайди на https://uptimerobot.com (бесплатная регистрация)
2. Создай монитор:
   - Type: HTTP(s)
   - URL: `https://твойдомен.ru/api/health` (или `http://ТВОЙ_IP/api/health`)
   - Interval: 5 minutes
3. Настрой оповещения на Telegram или email

UptimeRobot будет пинговать сервер каждые 5 минут и уведомит, если он упадёт.

---

## Чек-лист перед запуском

- [ ] VPS куплен и настроен (Docker, firewall)
- [ ] Проект клонирован на сервер
- [ ] `.env` создан с правильными ключами
- [ ] `Dockerfile` и `docker-compose.yml` созданы
- [ ] `docker compose up -d --build` запущен
- [ ] `curl http://localhost:8000/api/health` возвращает `{"status":"ok"}`
- [ ] Сервер доступен снаружи: `http://ТВОЙ_IP/api/health`
- [ ] (Опционально) Домен + HTTPS настроен
- [ ] `API_BASE_URL` в `.env` указывает на публичный адрес
- [ ] UptimeRobot настроен
