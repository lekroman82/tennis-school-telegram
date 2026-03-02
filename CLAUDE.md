# Tennis School Telegram Mini App

## Структура проекта

```
tennis-school-telegram/
├── CLAUDE.md           ← ты здесь: документация проекта
├── research.md         ← исследование рынка и конкурентов
├── brief.md            ← бриф: экраны, элементы, переходы, модель данных
└── tg-app/             ← исходники Mini App
    ├── index.html      ← точка входа, HTML-разметка всех 5 экранов
    ├── styles.css      ← стили: тема Telegram, анимации, компоненты
    └── app.js          ← логика: навигация, данные, рендеринг, Telegram API
```

## Файлы и ответственность

### `tg-app/index.html`
- Разметка всех 5 экранов (div с id `screen-catalog`, `screen-detail`, `screen-datetime`, `screen-confirm`, `screen-success`)
- Подключение Telegram Web App SDK (`telegram-web-app.js`)
- Подключение `styles.css` и `app.js`
- **Не содержит логики** — только структура DOM

### `tg-app/styles.css`
- Все цвета через CSS-переменные Telegram (`--tg-theme-*`) с fallback-значениями
- Тёмная тема поддерживается автоматически через переменные Telegram
- Анимации переходов (300ms slide), скелетонов (pulse), галочки (draw)
- Компоненты: карточки, чипы, календарь, формы, кнопки
- Safe area: `--tg-safe-area-inset-top`, `--tg-content-safe-area-inset-top`, `--tg-safe-area-inset-bottom`

### `tg-app/app.js`
Разделён на секции:
1. **Инициализация Telegram** — `tg.expand()`, получение `tgUser`
2. **Данные** — массивы `COACHES`, `SERVICES`, генерация `SCHEDULE`
3. **Состояние** — объект `state` с текущим экраном, выбором, стеком навигации
4. **Навигация** — `navigateTo()`, `navigateBack()`, `navigateToHome()`
5. **Кнопки Telegram** — `updateTelegramButtons()` управляет BackButton/MainButton
6. **Рендеринг экранов** — функции `renderCatalog()`, `renderDetailScreen()`, `renderDateTimeScreen()` и т.д.
7. **Обработчики** — клики по чипам, календарю, слотам, форме
8. **Утилиты** — форматирование цен, дат, склонение слов, haptic feedback
9. **Запуск** — `init()` при DOMContentLoaded

## Навигация между экранами

```
Каталог → Детали → Дата/Время → Подтверждение → Успех
   1          2          3              4            5
```

- Вперёд: `navigateTo(screenId)` — анимация slide-right
- Назад: `navigateBack()` — по стеку `state.screenHistory`
- Домой: `navigateToHome()` — сброс стека, возврат на каталог
- BackButton Telegram: привязан к `navigateBack()`
- MainButton Telegram: действие зависит от экрана (см. `onMainButtonClick()`)

## Где менять данные

### Услуги (каталог)
Файл: `tg-app/app.js`, массив `SERVICES` (строка ~50)
```js
{
  id: 's1',
  title: 'Индивидуальная тренировка',
  description: 'Описание...',
  duration: 60,        // минуты
  price: 3000,         // рубли, 0 = бесплатно
  category: 'individual', // 'individual' | 'group' | 'trial'
  emoji: '🎾',
  coachId: 'c1',       // ссылка на COACHES[].id
  maxParticipants: 1,
  spotsLeft: 4
}
```

### Тренеры
Файл: `tg-app/app.js`, массив `COACHES` (строка ~33)
```js
{
  id: 'c1',
  name: 'Иван Петров',
  title: 'Автор методики обучения',
  experience: 15,
  emoji: '👨‍🏫'
}
```

### Расписание (слоты)
Файл: `tg-app/app.js`, функция `generateSlots()` (строка ~110)
- Автоматически генерирует слоты на 14 дней вперёд
- Времена начала: массив `possibleTimes`
- Для реального расписания — заменить на загрузку с API

### Адрес школы
Файл: `tg-app/index.html`, экран успеха — строка с `📍 ул. Чернышевского, 94 к3, Саратов`

### Название школы
Файл: `tg-app/index.html`, шапка каталога — `Первая Школа Тенниса`

## Запуск

### Локально (для разработки)
```bash
cd tg-app
# Любой статический сервер:
npx serve .
# или
python -m http.server 8080
```

### В Telegram (через ngrok)
```bash
ngrok http 8080
# Скопировать HTTPS-ссылку → BotFather → /setmenubutton → URL
```

## Технические заметки

- Фреймворки: нет (чистый HTML/CSS/JS)
- Размер: ~30KB (без SDK Telegram)
- Telegram SDK: загружается с `telegram.org/js/telegram-web-app.js`
- Данные: захардкожены в `app.js`, расписание генерируется динамически
- Оплата: не реализована в MVP (кнопка создаёт запись без оплаты)
- Бэкенд: не реализован в MVP (имитация с setTimeout)
