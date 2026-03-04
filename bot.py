"""
Telegram-бот «Первая Школа Тенниса»
Без внешних зависимостей — только стандартная библиотека Python.
Запуск: python bot.py
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
import time

# --- Конфигурация ---

# Токен из .env (BOT_TOKEN=...)
def load_token():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('BOT_TOKEN='):
                    return line.split('=', 1)[1].strip()
    # Fallback — переменная окружения
    return os.environ.get('BOT_TOKEN', '')

TOKEN = load_token()
if not TOKEN:
    print('Ошибка: BOT_TOKEN не найден в .env')
    sys.exit(1)

API = f'https://api.telegram.org/bot{TOKEN}'

# Ссылка на Mini App
WEBAPP_URL = 'https://tennis-school-telegram.vercel.app'

# --- Telegram API ---

def api_call(method, data=None):
    """Вызов метода Telegram Bot API."""
    url = f'{API}/{method}'
    if data:
        payload = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    else:
        req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f'API ошибка {e.code}: {body}')
        return None
    except Exception as e:
        print(f'Ошибка сети: {e}')
        return None

def send_message(chat_id, text, reply_markup=None, parse_mode='HTML'):
    """Отправить сообщение."""
    data = {
        'chat_id': chat_id,
        'text': text,
        'parse_mode': parse_mode,
    }
    if reply_markup:
        data['reply_markup'] = reply_markup
    return api_call('sendMessage', data)

# --- Клавиатура с кнопкой Mini App ---

def webapp_keyboard():
    """Клавиатура с кнопкой открытия Mini App."""
    return {
        'inline_keyboard': [[
            {
                'text': '\U0001f3be Открыть каталог услуг',
                'web_app': {'url': WEBAPP_URL}
            }
        ]]
    }

def main_reply_keyboard():
    """Постоянная клавиатура внизу чата."""
    return {
        'keyboard': [[
            {
                'text': '\U0001f4cb Записаться',
                'web_app': {'url': WEBAPP_URL}
            }
        ]],
        'resize_keyboard': True,
        'is_persistent': True
    }

# --- Обработчики команд ---

def handle_start(msg, start_param=''):
    """Команда /start."""
    chat_id = msg['chat']['id']
    first_name = msg['from'].get('first_name', '')

    if start_param == 'from_app':
        # Пришёл из оффера в Mini App
        text = (
            f'{first_name}, вы подписались! \U0001f389\n\n'
            'Теперь вы будете получать:\n'
            '\U00002022 Напоминания о записи за день\n'
            '\U00002022 Уведомления о свободных окошках\n'
            '\U00002022 Эксклюзивные акции для подписчиков\n\n'
            'Нажмите кнопку ниже, чтобы записаться на тренировку \U0001f447'
        )
    else:
        text = (
            f'Привет, {first_name}! \U0001f44b\n\n'
            'Я бот <b>Первой Школы Тенниса</b> в Саратове.\n\n'
            'Что я умею:\n'
            '\U0001f3be Записать на индивидуальную или групповую тренировку\n'
            '\U0001f3df\ufe0f Забронировать корт\n'
            '\U00002b50 Записать на бесплатную пробную тренировку\n\n'
            'Нажмите кнопку ниже, чтобы открыть каталог \U0001f447'
        )

    send_message(chat_id, text, reply_markup=webapp_keyboard())
    # Также ставим постоянную клавиатуру
    send_message(
        chat_id,
        '\U00002328\ufe0f Кнопка «Записаться» теперь всегда внизу экрана.',
        reply_markup=main_reply_keyboard()
    )

def handle_help(msg):
    """Команда /help."""
    chat_id = msg['chat']['id']
    text = (
        '<b>Как пользоваться ботом</b>\n\n'
        '1\ufe0f\u20e3 Нажмите <b>«Записаться»</b> внизу экрана\n'
        '2\ufe0f\u20e3 Выберите услугу из каталога\n'
        '3\ufe0f\u20e3 Выберите удобную дату и время\n'
        '4\ufe0f\u20e3 Подтвердите запись\n\n'
        'Готово! Мы напомним вам о занятии за день \U0001f4ac\n\n'
        '<b>Команды:</b>\n'
        '/start \u2014 открыть каталог\n'
        '/help \u2014 эта справка\n'
        '/contact \u2014 связаться с тренером'
    )
    send_message(chat_id, text, reply_markup=webapp_keyboard())

def handle_contact(msg):
    """Команда /contact."""
    chat_id = msg['chat']['id']
    text = (
        '<b>Связаться с нами</b>\n\n'
        '\U0001f468\u200d\U0001f3eb Тренер: Роман Лекомцев\n'
        '\U0001f4cd Адрес: ул. Чернышевского, 94 к3, Саратов\n'
        '\U0001f310 Сайт: bolshoitennis.ru\n\n'
        'Напишите в этот чат \u2014 мы ответим!'
    )
    send_message(chat_id, text)

def handle_unknown(msg):
    """Любое другое текстовое сообщение."""
    chat_id = msg['chat']['id']
    text = (
        'Я пока не умею отвечать на сообщения \U0001f60a\n\n'
        'Нажмите <b>«Записаться»</b> внизу, чтобы открыть каталог услуг, '
        'или используйте /help для справки.'
    )
    send_message(chat_id, text, reply_markup=webapp_keyboard())

# --- Обработка обновлений ---

def process_update(update):
    """Обработка одного обновления от Telegram."""
    msg = update.get('message')
    if not msg:
        return

    text = msg.get('text', '')

    if text.startswith('/start'):
        # Извлекаем параметр deep link: /start from_app
        parts = text.split(maxsplit=1)
        param = parts[1] if len(parts) > 1 else ''
        handle_start(msg, param)
    elif text == '/help':
        handle_help(msg)
    elif text == '/contact':
        handle_contact(msg)
    elif msg.get('web_app_data'):
        # Данные из Mini App — пока логируем
        print(f"Данные из Mini App: {msg['web_app_data']}")
    else:
        handle_unknown(msg)

# --- Long Polling ---

def run_polling():
    """Запуск бота в режиме long polling."""
    print(f'Бот запущен! Ожидаю сообщения...')
    print(f'Для остановки нажмите Ctrl+C\n')

    # Удаляем вебхук если был
    api_call('deleteWebhook', {'drop_pending_updates': False})

    offset = 0
    while True:
        try:
            result = api_call('getUpdates', {
                'offset': offset,
                'timeout': 30,
                'allowed_updates': ['message']
            })
            if result and result.get('ok'):
                for update in result['result']:
                    offset = update['update_id'] + 1
                    try:
                        process_update(update)
                    except Exception as e:
                        print(f'Ошибка обработки: {e}')
        except KeyboardInterrupt:
            print('\nБот остановлен.')
            break
        except Exception as e:
            print(f'Ошибка polling: {e}')
            time.sleep(3)

# --- Точка входа ---

if __name__ == '__main__':
    # Проверяем соединение
    me = api_call('getMe')
    if me and me.get('ok'):
        bot_info = me['result']
        print(f"Бот: @{bot_info.get('username')} ({bot_info.get('first_name')})")
    else:
        print('Не удалось подключиться к Telegram API. Проверьте токен.')
        sys.exit(1)

    run_polling()
