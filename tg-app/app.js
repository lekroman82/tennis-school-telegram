/* ==============================================
   TELEGRAM MINI APP — ШКОЛА ТЕННИСА
   Главный файл логики приложения
   ============================================== */

'use strict';

/* ---------------------------------------------- */
/* 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP              */
/* ---------------------------------------------- */

// Объект Telegram WebApp (из SDK)
const tg = window.Telegram?.WebApp;

// Раскрываем Mini App на весь экран
if (tg) {
  tg.expand();
  tg.enableClosingConfirmation();
}

// Данные пользователя из Telegram
const tgUser = tg?.initDataUnsafe?.user || {};

/* ---------------------------------------------- */
/* 2. ДАННЫЕ ПРИЛОЖЕНИЯ (загружаются с API)        */
/* ---------------------------------------------- */

// API-сервер и slug мастера (из URL-параметра ?slug=roman)
const API_URL = 'https://tennis-slot.ru';
const SLUG = new URLSearchParams(window.location.search).get('slug') || 'roman';

// Данные загружаются с API
let master = null;       // профиль мастера
let SERVICES = [];       // услуги
let availableDates = []; // даты с доступными слотами (для выбранной услуги)
let daySlots = [];       // слоты на выбранную дату

// Запрос к API
async function api(path, options = {}) {
  const url = `${API_URL}/api/masters/${SLUG}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  // Добавляем авторизацию если есть initData
  if (tg?.initData) {
    headers['X-Telegram-Init-Data'] = tg.initData;
  }

  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// Загрузка профиля мастера и услуг
async function loadMasterData() {
  const [masterData, services] = await Promise.all([
    api(''),
    api('/services'),
  ]);
  master = masterData;
  SERVICES = services.map(s => ({
    id: s.id,
    title: s.title,
    description: s.description,
    duration: s.duration_minutes,
    price: s.price,
    category: s.category,
    emoji: s.emoji,
    maxParticipants: s.max_participants,
  }));
}

// Таб-экраны (нижнее меню)
const TAB_SCREENS = ['catalog', 'bookings', 'contacts'];

/* ---------------------------------------------- */
/* 3. СОСТОЯНИЕ ПРИЛОЖЕНИЯ                        */
/* ---------------------------------------------- */

const state = {
  currentScreen: 'catalog',   // текущий экран
  screenHistory: ['catalog'],  // стек навигации
  selectedCategory: 'all',     // выбранная категория
  selectedService: null,       // выбранная услуга (объект)
  selectedDate: null,          // выбранная дата (Date)
  selectedTime: null,          // выбранное время ('HH:MM')
  selectedSlotId: null,        // ID слота из API
  calendarMonth: new Date().getMonth(),  // месяц в календаре
  calendarYear: new Date().getFullYear(), // год в календаре
  bookingNumber: 1000 + Math.floor(Math.random() * 9000) // номер записи
};

/* ---------------------------------------------- */
/* 4. НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ                    */
/* ---------------------------------------------- */

/**
 * Переход на новый экран
 * @param {string} screenId — id экрана без префикса 'screen-'
 */
function navigateTo(screenId) {
  const currentEl = document.getElementById(`screen-${state.currentScreen}`);
  const nextEl = document.getElementById(`screen-${screenId}`);

  if (!currentEl || !nextEl || screenId === state.currentScreen) return;

  // Анимация: текущий уходит влево, новый приходит справа
  currentEl.classList.remove('screen--active');
  currentEl.classList.add('screen--exit-left');

  // Начальная позиция нового экрана (справа)
  nextEl.style.transform = 'translateX(30px)';
  nextEl.style.opacity = '0';
  nextEl.classList.add('screen--active');

  // Запуск анимации входа
  requestAnimationFrame(() => {
    nextEl.style.transform = '';
    nextEl.style.opacity = '';
  });

  // Очистка старого экрана
  setTimeout(() => {
    currentEl.classList.remove('screen--exit-left');
  }, 300);

  // Обновляем стек навигации
  state.screenHistory.push(screenId);
  state.currentScreen = screenId;

  // Скролл нового экрана вверх
  nextEl.scrollTop = 0;

  // Управляем таб-баром
  if (TAB_SCREENS.includes(screenId)) {
    showTabBar();
    updateTabBar(screenId);
  } else {
    hideTabBar();
  }

  // Обновляем кнопки Telegram
  updateTelegramButtons();

  // Haptic feedback
  haptic('impact', 'light');
}

/**
 * Навигация назад (по стеку)
 */
function navigateBack() {
  if (state.screenHistory.length <= 1) return;

  const currentEl = document.getElementById(`screen-${state.currentScreen}`);

  state.screenHistory.pop();
  const prevScreen = state.screenHistory[state.screenHistory.length - 1];
  const prevEl = document.getElementById(`screen-${prevScreen}`);

  if (!currentEl || !prevEl) return;

  // Анимация: текущий уходит вправо, предыдущий приходит слева
  currentEl.classList.remove('screen--active');
  currentEl.style.transform = 'translateX(30px)';
  currentEl.style.opacity = '0';

  prevEl.style.transform = 'translateX(-30px)';
  prevEl.style.opacity = '0';
  prevEl.classList.add('screen--active');

  requestAnimationFrame(() => {
    prevEl.style.transform = '';
    prevEl.style.opacity = '';
  });

  // Очистка
  setTimeout(() => {
    currentEl.style.transform = '';
    currentEl.style.opacity = '';
  }, 300);

  state.currentScreen = prevScreen;

  // Управляем таб-баром
  if (TAB_SCREENS.includes(prevScreen)) {
    showTabBar();
    updateTabBar(prevScreen);
  }

  updateTelegramButtons();
  haptic('impact', 'light');
}

/**
 * Возврат на главный экран (каталог)
 */
function navigateToHome() {
  // Скрываем все экраны
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.remove('screen--active', 'screen--exit-left');
    el.style.transform = '';
    el.style.opacity = '';
  });

  // Показываем каталог
  const catalog = document.getElementById('screen-catalog');
  catalog.classList.add('screen--active');

  // Сброс состояния навигации
  state.currentScreen = 'catalog';
  state.screenHistory = ['catalog'];
  state.selectedDate = null;
  state.selectedTime = null;

  showTabBar();
  updateTabBar('catalog');
  updateTelegramButtons();
}

/* ---------------------------------------------- */
/* 4.1 ПЕРЕКЛЮЧЕНИЕ ТАБОВ (нижнее меню)           */
/* ---------------------------------------------- */

/**
 * Переключение между табами
 */
function switchTab(tabName) {
  if (!TAB_SCREENS.includes(tabName)) return;
  if (state.currentScreen === tabName) return;

  // Скрываем все экраны без анимации
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.remove('screen--active', 'screen--exit-left');
    el.style.transform = '';
    el.style.opacity = '';
  });

  // Показываем целевой таб
  const targetEl = document.getElementById(`screen-${tabName}`);
  targetEl.classList.add('screen--active');

  // Обновляем состояние
  state.currentScreen = tabName;
  state.screenHistory = [tabName];
  state.selectedDate = null;
  state.selectedTime = null;

  // Обновляем таб-бар
  updateTabBar(tabName);
  showTabBar();

  // Рендерим контент если нужно
  if (tabName === 'bookings') renderBookingsScreen();

  updateTelegramButtons();
  haptic('selection');
}

function updateTabBar(activeTab) {
  document.querySelectorAll('.tab-bar__btn').forEach(btn => {
    btn.classList.toggle('tab-bar__btn--active', btn.dataset.tab === activeTab);
  });
}

function showTabBar() {
  document.getElementById('tab-bar').classList.remove('tab-bar--hidden');
}

function hideTabBar() {
  document.getElementById('tab-bar').classList.add('tab-bar--hidden');
}

/* ---------------------------------------------- */
/* 5. УПРАВЛЕНИЕ КНОПКАМИ TELEGRAM                */
/* ---------------------------------------------- */

/**
 * Обновить BackButton и MainButton в зависимости от экрана
 */
function updateTelegramButtons() {
  if (!tg) return;

  const screen = state.currentScreen;

  // --- BackButton ---
  if (TAB_SCREENS.includes(screen) || screen === 'success' || screen === 'onboarding') {
    tg.BackButton.hide();
  } else {
    tg.BackButton.show();
  }

  // --- MainButton ---
  switch (screen) {
    case 'onboarding':
    case 'catalog':
    case 'bookings':
    case 'contacts':
      tg.MainButton.hide();
      break;

    case 'detail': {
      const service = state.selectedService;
      const priceText = service.price === 0
        ? 'Записаться — Бесплатно'
        : `Записаться — ${formatPrice(service.price)}`;
      tg.MainButton.setText(priceText);
      tg.MainButton.show();
      tg.MainButton.enable();
      tg.MainButton.color = tg.themeParams.button_color || '#2AABEE';
      break;
    }

    case 'datetime':
      tg.MainButton.setText('Продолжить');
      tg.MainButton.show();
      if (state.selectedDate && state.selectedTime) {
        tg.MainButton.enable();
        tg.MainButton.color = tg.themeParams.button_color || '#2AABEE';
      } else {
        tg.MainButton.disable();
        // Серый цвет для неактивной кнопки
        tg.MainButton.color = '#999999';
      }
      break;

    case 'confirm':
      tg.MainButton.setText('Записаться');
      tg.MainButton.show();
      tg.MainButton.enable();
      tg.MainButton.color = tg.themeParams.button_color || '#2AABEE';
      break;

    case 'success':
      tg.MainButton.setText('Закрыть');
      tg.MainButton.show();
      tg.MainButton.enable();
      tg.MainButton.color = tg.themeParams.button_color || '#2AABEE';
      break;
  }
}

/**
 * Обработчик нажатия MainButton
 */
function onMainButtonClick() {
  switch (state.currentScreen) {
    case 'detail':
      renderDateTimeScreen();
      navigateTo('datetime');
      break;

    case 'datetime':
      if (state.selectedDate && state.selectedTime) {
        renderConfirmScreen();
        navigateTo('confirm');
      }
      break;

    case 'confirm':
      submitBooking();
      break;

    case 'success':
      if (tg) tg.close();
      break;
  }
}

// Привязка обработчиков Telegram
if (tg) {
  tg.BackButton.onClick(navigateBack);
  tg.MainButton.onClick(onMainButtonClick);
}

/* ---------------------------------------------- */
/* 6. РЕНДЕРИНГ ЭКРАНОВ                           */
/* ---------------------------------------------- */

/* --- Экран 1: Каталог --- */

/**
 * Показать скелетоны при загрузке каталога
 */
function showSkeletons() {
  const list = document.getElementById('service-list');
  list.innerHTML = '';

  for (let i = 0; i < 3; i++) {
    const skel = document.createElement('div');
    skel.className = 'skeleton-card';
    skel.innerHTML = `
      <div class="skeleton-image"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line skeleton-line--short"></div>
        <div class="skeleton-line skeleton-line--medium"></div>
        <div class="skeleton-line skeleton-line--price"></div>
      </div>
    `;
    list.appendChild(skel);
  }
}

/**
 * Отрисовка списка карточек услуг
 */
function renderCatalog() {
  const list = document.getElementById('service-list');
  list.innerHTML = '';

  const category = state.selectedCategory;
  const filtered = category === 'all'
    ? SERVICES
    : SERVICES.filter(s => s.category === category);

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🎾</div>
        <div class="empty-state__text">Услуги скоро появятся</div>
      </div>
    `;
    return;
  }

  filtered.forEach(service => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    // Определяем текст цены
    const priceText = service.price === 0
      ? '<span class="service-card__price service-card__price--free">Бесплатно</span>'
      : `<span class="service-card__price">${formatPrice(service.price)}</span>`;

    // Показываем "Осталось N" если мало мест
    let spotsHtml = '';
    if (service.spotsLeft <= 5) {
      const lowClass = service.spotsLeft <= 3 ? ' service-card__spots--low' : '';
      spotsHtml = `<span class="service-card__spots${lowClass}">Осталось ${service.spotsLeft}</span>`;
    }

    card.innerHTML = `
      <div class="service-card__image service-card__image--${service.category}">${service.emoji}</div>
      <div class="service-card__info">
        <div class="service-card__title">${service.title}</div>
        <div class="service-card__duration">${service.duration} мин</div>
        <div class="service-card__bottom">
          ${priceText}
          ${spotsHtml}
        </div>
      </div>
      <div class="service-card__arrow">›</div>
    `;

    // Тап по карточке → переход к деталям
    card.addEventListener('click', () => {
      state.selectedService = service;
      renderDetailScreen(service);
      navigateTo('detail');
    });

    list.appendChild(card);
  });
}

/* --- Экран 2: Детали услуги --- */

/**
 * Заполнить экран деталей данными выбранной услуги
 * @param {Object} service — объект услуги
 */
function renderDetailScreen(service) {
  // Фото услуги (эмодзи-заглушка) с цветным фоном категории
  const detailImage = document.getElementById('detail-image');
  detailImage.textContent = service.emoji;
  detailImage.className = 'detail__image detail__image--' + service.category;

  // Текст
  document.getElementById('detail-title').textContent = service.title;
  document.getElementById('detail-duration').textContent = `${service.duration} мин`;
  document.getElementById('detail-description').textContent = service.description;

  // Тренер (данные мастера)
  const coachBlock = document.getElementById('detail-coach');
  const coachDivider = coachBlock.previousElementSibling;
  if (master && master.name) {
    coachBlock.style.display = '';
    coachDivider.style.display = '';
    document.getElementById('coach-avatar').textContent = '👨‍🏫';
    document.getElementById('coach-name').textContent = master.name;
    const meta = [master.title, master.experience ? `Опыт более ${master.experience} лет` : ''].filter(Boolean).join(' · ');
    document.getElementById('coach-meta').textContent = meta;
  } else {
    coachBlock.style.display = 'none';
    coachDivider.style.display = 'none';
  }

  // Скрываем споты (теперь не хардкодятся)
  const spotsEl = document.getElementById('detail-spots');
  spotsEl.textContent = '';

  // Ближайший слот — загрузим с API
  const nextSlotEl = document.getElementById('detail-next-slot');
  nextSlotEl.textContent = 'Загрузка расписания...';
  api(`/slots/dates?service_id=${service.id}`)
    .then(data => {
      if (data.dates && data.dates.length > 0) {
        const d = new Date(data.dates[0] + 'T00:00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        if (d.getTime() === today.getTime()) {
          nextSlotEl.textContent = 'Ближайшее: сегодня';
        } else if (d.getTime() === tomorrow.getTime()) {
          nextSlotEl.textContent = 'Ближайшее: завтра';
        } else {
          nextSlotEl.textContent = `Ближайшее: ${d.getDate()} ${months[d.getMonth()]}`;
        }
      } else {
        nextSlotEl.textContent = 'Нет свободных дат';
      }
    })
    .catch(() => { nextSlotEl.textContent = 'Расписание формируется'; });
}

/* --- Экран 3: Выбор даты и времени --- */

/**
 * Отрисовка экрана выбора даты и времени
 */
async function renderDateTimeScreen() {
  // Сбросить выбор при каждом входе
  state.selectedDate = null;
  state.selectedTime = null;

  // Начинаем с текущего месяца
  const now = new Date();
  state.calendarMonth = now.getMonth();
  state.calendarYear = now.getFullYear();

  // Загружаем доступные даты с API
  try {
    const data = await api(`/slots/dates?service_id=${state.selectedService.id}`);
    availableDates = data.dates || [];
  } catch (e) {
    availableDates = [];
    console.error('Не удалось загрузить даты:', e);
  }

  renderCalendar();
  hideTimeSlots();
  updateTelegramButtons();
}

/**
 * Отрисовка календаря для текущего state.calendarMonth/Year
 */
function renderCalendar() {
  const year = state.calendarYear;
  const month = state.calendarMonth;

  // Название месяца
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  document.getElementById('cal-month').textContent = `${monthNames[month]} ${year}`;

  // Стрелки
  const now = new Date();
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');

  // Нельзя перейти в прошлый месяц
  prevBtn.disabled = (year === now.getFullYear() && month <= now.getMonth());

  // Нельзя перейти дальше, чем +1 месяц
  const maxMonth = now.getMonth() + 1;
  const maxYear = now.getFullYear() + (maxMonth > 11 ? 1 : 0);
  nextBtn.disabled = (year > maxYear || (year === maxYear && month >= maxMonth % 12));

  // Дни месяца
  const daysContainer = document.getElementById('cal-days');
  daysContainer.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // Пустые ячейки до первого дня (Пн = 0, Вс = 6)
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-day--empty';
    daysContainer.appendChild(empty);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let d = 1; d <= totalDays; d++) {
    const cellDate = new Date(year, month, d);
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = d;

    const isPast = cellDate < today;
    const isToday = cellDate.getTime() === today.getTime();
    const dateKey = formatDateKey(cellDate);
    const hasSlots = availableDates.includes(dateKey);

    if (isPast) {
      btn.classList.add('cal-day--past');
    } else if (!hasSlots) {
      btn.classList.add('cal-day--no-slots');
    } else {
      // День доступен для выбора
      btn.classList.add('cal-day--has-slots');

      btn.addEventListener('click', () => {
        state.selectedDate = cellDate;
        state.selectedTime = null;

        // Обновляем выделение дней
        daysContainer.querySelectorAll('.cal-day--selected').forEach(el => {
          el.classList.remove('cal-day--selected');
        });
        btn.classList.add('cal-day--selected');

        // Показываем слоты
        renderTimeSlots(state.selectedService.id, dateKey);

        haptic('selection');
        updateTelegramButtons();
      });
    }

    if (isToday) {
      btn.classList.add('cal-day--today');
    }

    // Восстановление выбора
    if (state.selectedDate && cellDate.getTime() === state.selectedDate.getTime()) {
      btn.classList.add('cal-day--selected');
    }

    daysContainer.appendChild(btn);
  }
}

/**
 * Показать временные слоты для услуги на дату
 * @param {string} serviceId
 * @param {string} dateKey — формат 'YYYY-MM-DD'
 */
async function renderTimeSlots(serviceId, dateKey) {
  const section = document.getElementById('time-section');
  const container = document.getElementById('time-slots');
  const emptyState = document.getElementById('no-slots');

  // Загружаем слоты с API
  container.innerHTML = '<div style="padding:12px;text-align:center;opacity:0.5">Загрузка...</div>';
  section.classList.remove('time-section--hidden');
  emptyState.classList.add('empty-state--hidden');

  try {
    daySlots = await api(`/services/${serviceId}/slots?date=${dateKey}`);
  } catch (e) {
    daySlots = [];
    console.error('Не удалось загрузить слоты:', e);
  }

  if (daySlots.length === 0) {
    section.classList.add('time-section--hidden');
    emptyState.classList.remove('empty-state--hidden');
    return;
  }

  container.innerHTML = '';

  daySlots.forEach(slot => {
    const time = slot.start_time.slice(0, 5); // "10:00:00" → "10:00"
    const chip = document.createElement('button');
    chip.className = 'time-chip';
    chip.textContent = time;

    if (state.selectedTime === time) {
      chip.classList.add('time-chip--selected');
    }

    chip.addEventListener('click', () => {
      state.selectedTime = time;
      state.selectedSlotId = slot.slot_id || slot.id;

      container.querySelectorAll('.time-chip--selected').forEach(el => {
        el.classList.remove('time-chip--selected');
      });
      chip.classList.add('time-chip--selected');

      haptic('selection');
      updateTelegramButtons();
    });

    container.appendChild(chip);
  });
}

/**
 * Скрыть секцию временных слотов
 */
function hideTimeSlots() {
  document.getElementById('time-section').classList.add('time-section--hidden');
  document.getElementById('no-slots').classList.add('empty-state--hidden');
}

/* --- Экран 4: Подтверждение --- */

/**
 * Заполнить экран подтверждения данными
 */
function renderConfirmScreen() {
  const service = state.selectedService;
  const date = state.selectedDate;
  const time = state.selectedTime;

  // Карточка-резюме
  document.getElementById('summary-title').textContent = service.title;
  document.getElementById('summary-date').textContent = formatDateFull(date);
  document.getElementById('summary-time').textContent = formatTimeRange(time, service.duration);

  // Строка тренера
  const summaryCoachRow = document.getElementById('summary-coach').closest('.summary-card__row');
  if (master && master.name) {
    summaryCoachRow.style.display = '';
    document.getElementById('summary-coach').textContent = master.name;
  } else {
    summaryCoachRow.style.display = 'none';
  }

  document.getElementById('summary-price').textContent = service.price === 0
    ? 'Бесплатно'
    : formatPrice(service.price);

  // Имя из Telegram
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Гость';
  document.getElementById('confirm-name').textContent = name;

  // Очистить поля
  document.getElementById('confirm-phone').value = '';
  document.getElementById('confirm-comment').value = '';

  // Убрать ошибку если была
  document.getElementById('confirm-phone').classList.remove('form-input--error');
}

/**
 * Отправка заявки (имитация)
 */
async function submitBooking() {
  const phoneInput = document.getElementById('confirm-phone');
  const phone = phoneInput.value.trim();

  // Валидация телефона
  if (!phone || phone.length < 10) {
    phoneInput.classList.add('form-input--error');
    phoneInput.focus();

    if (tg) {
      tg.showAlert('Укажите номер телефона');
    } else {
      alert('Укажите номер телефона');
    }
    return;
  }

  phoneInput.classList.remove('form-input--error');

  // Показываем прогресс на MainButton
  if (tg) {
    tg.MainButton.showProgress();
    tg.MainButton.disable();
  }

  try {
    const result = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        service_id: state.selectedService.id,
        slot_id: state.selectedSlotId,
        phone: phone,
        comment: document.getElementById('confirm-comment').value.trim(),
      }),
    });

    state.bookingNumber = result.booking_number || state.bookingNumber + 1;

    if (tg) {
      tg.MainButton.hideProgress();
      tg.MainButton.enable();
    }

    renderSuccessScreen();
    navigateTo('success');
    haptic('notification', 'success');

    // Сохраняем в localStorage как резерв
    saveBookingToStorage({
      bookingNumber: state.bookingNumber,
      service: state.selectedService.title,
      date: formatDateKey(state.selectedDate),
      time: state.selectedTime,
      duration: state.selectedService.duration,
      coach: master?.name || '',
      price: state.selectedService.price,
    });

  } catch (e) {
    if (tg) {
      tg.MainButton.hideProgress();
      tg.MainButton.enable();
      tg.showAlert(e.message || 'Ошибка при записи');
    } else {
      alert(e.message || 'Ошибка при записи');
    }
  }
}

/* --- Экран 5: Успех --- */

/**
 * Заполнить экран успеха данными записи
 */
function renderSuccessScreen() {
  const service = state.selectedService;

  document.getElementById('success-title').textContent = service.title;
  document.getElementById('success-date').textContent = formatDateFull(state.selectedDate);
  document.getElementById('success-time').textContent = formatTimeRange(state.selectedTime, service.duration);

  // Строка тренера
  const successCoachRow = document.getElementById('success-coach').closest('.summary-card__row');
  if (master && master.name) {
    successCoachRow.style.display = '';
    document.getElementById('success-coach').textContent = master.name;
  } else {
    successCoachRow.style.display = 'none';
  }

  document.getElementById('success-number').textContent = `Запись #${state.bookingNumber}`;
}

/* --- Экран: Мои записи --- */

const BOOKINGS_STORAGE_KEY = 'tennis_bookings';

/**
 * Сохранить запись в localStorage
 */
function saveBookingToStorage(data) {
  const bookings = JSON.parse(localStorage.getItem(BOOKINGS_STORAGE_KEY) || '[]');
  bookings.push({
    bookingNumber: data.bookingNumber,
    service: data.service,
    date: data.date,
    time: data.time,
    duration: data.duration,
    coach: data.coach,
    price: data.price,
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(bookings));
}

/**
 * Отрисовка экрана «Мои записи»
 */
function renderBookingsScreen() {
  const container = document.getElementById('bookings-list');
  const bookings = JSON.parse(localStorage.getItem(BOOKINGS_STORAGE_KEY) || '[]');

  if (bookings.length === 0) {
    container.innerHTML = `
      <div class="bookings-empty">
        <div class="bookings-empty__icon">📋</div>
        <div class="bookings-empty__text">У вас пока нет записей</div>
        <div class="bookings-empty__hint">Выберите услугу и запишитесь</div>
        <button class="bookings-empty__btn" onclick="switchTab('catalog')">Перейти в каталог</button>
      </div>
    `;
    return;
  }

  const now = new Date();
  container.innerHTML = '';

  // Показываем от новых к старым
  [...bookings].reverse().forEach(b => {
    const [y, m, d] = b.date.split('-').map(Number);
    const [hh, mm] = b.time.split(':').map(Number);
    const bookingDate = new Date(y, m - 1, d, hh, mm);
    const isPast = bookingDate < now;

    const card = document.createElement('div');
    card.className = 'booking-card' + (isPast ? ' booking-card--past' : '');

    const badgeClass = isPast ? 'booking-card__badge--past' : 'booking-card__badge--upcoming';
    const badgeText = isPast ? 'Прошла' : 'Предстоит';

    const dateObj = new Date(y, m - 1, d);
    const dateText = formatDateFull(dateObj);
    const timeText = formatTimeRange(b.time, b.duration);

    card.innerHTML = `
      <div class="booking-card__header">
        <div class="booking-card__service">${b.service}</div>
        <span class="booking-card__badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="booking-card__row">
        <span class="booking-card__icon">📅</span>
        <span>${dateText}</span>
      </div>
      <div class="booking-card__row">
        <span class="booking-card__icon">🕐</span>
        <span>${timeText}</span>
      </div>
      ${b.coach ? `<div class="booking-card__row">
        <span class="booking-card__icon">👤</span>
        <span>${b.coach}</span>
      </div>` : ''}
      <div class="booking-card__row">
        <span class="booking-card__icon">🔢</span>
        <span class="booking-card__number">Запись #${b.bookingNumber}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

/* ---------------------------------------------- */
/* 7. ОБРАБОТЧИКИ СОБЫТИЙ                         */
/* ---------------------------------------------- */

/**
 * Инициализация обработчиков при загрузке
 */
function initEventHandlers() {

  // --- Кнопки «Назад» (data-back) ---
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateBack();
    });
  });

  // --- Чипы категорий ---
  document.getElementById('category-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    // Обновляем активный чип
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');

    // Фильтруем каталог
    state.selectedCategory = chip.dataset.category;
    renderCatalog();
    haptic('selection');
  });

  // --- Стрелки календаря ---
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.calendarMonth--;
    if (state.calendarMonth < 0) {
      state.calendarMonth = 11;
      state.calendarYear--;
    }
    renderCalendar();
    hideTimeSlots();
    haptic('impact', 'light');
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    state.calendarMonth++;
    if (state.calendarMonth > 11) {
      state.calendarMonth = 0;
      state.calendarYear++;
    }
    renderCalendar();
    hideTimeSlots();
    haptic('impact', 'light');
  });

  // --- Кнопка "Вернуться в каталог" ---
  document.getElementById('btn-back-catalog').addEventListener('click', () => {
    navigateToHome();
    haptic('impact', 'light');
  });

  // --- Кнопка "Поделиться с другом" ---
  document.getElementById('btn-share').addEventListener('click', () => {
    shareBot();
  });

  // --- Таб-бар ---
  document.getElementById('tab-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-bar__btn');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  // --- Маска телефона ---
  const phoneInput = document.getElementById('confirm-phone');
  phoneInput.addEventListener('input', () => {
    phoneInput.classList.remove('form-input--error');
    let val = phoneInput.value.replace(/\D/g, '');
    if (val.length > 0 && val[0] === '8') val = '7' + val.slice(1);
    if (val.length > 11) val = val.slice(0, 11);

    if (val.length === 0) {
      phoneInput.value = '';
    } else if (val.length <= 1) {
      phoneInput.value = `+${val}`;
    } else if (val.length <= 4) {
      phoneInput.value = `+${val[0]} (${val.slice(1)}`;
    } else if (val.length <= 7) {
      phoneInput.value = `+${val[0]} (${val.slice(1, 4)}) ${val.slice(4)}`;
    } else if (val.length <= 9) {
      phoneInput.value = `+${val[0]} (${val.slice(1, 4)}) ${val.slice(4, 7)}-${val.slice(7)}`;
    } else {
      phoneInput.value = `+${val[0]} (${val.slice(1, 4)}) ${val.slice(4, 7)}-${val.slice(7, 9)}-${val.slice(9)}`;
    }
  });
}

/* ---------------------------------------------- */
/* 8. УТИЛИТЫ                                     */
/* ---------------------------------------------- */

/**
 * Форматирование цены: 3000 → "3 000 ₽"
 */
function formatPrice(price) {
  return price.toLocaleString('ru-RU') + ' ₽';
}

/**
 * Форматирование даты для ключа: Date → 'YYYY-MM-DD'
 */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Полное форматирование даты: Date → '15 марта, суббота'
 */
function formatDateFull(date) {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  return `${date.getDate()} ${months[date.getMonth()]}, ${days[date.getDay()]}`;
}

/**
 * Диапазон времени: '10:00' + 60мин → '10:00 — 11:00'
 */
function formatTimeRange(startTime, durationMin) {
  const [h, m] = startTime.split(':').map(Number);
  const endDate = new Date(2000, 0, 1, h, m + durationMin);
  const endH = String(endDate.getHours()).padStart(2, '0');
  const endM = String(endDate.getMinutes()).padStart(2, '0');
  return `${startTime} — ${endH}:${endM}`;
}

/**
 * Склонение слов: pluralize(2, 'место', 'места', 'мест') → 'места'
 */
function pluralize(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/**
 * HapticFeedback — вибрация при действиях
 * @param {string} type — 'impact', 'selection', 'notification'
 * @param {string} style — 'light', 'medium', 'heavy', 'success', 'error', 'warning'
 */
function haptic(type, style) {
  if (!tg?.HapticFeedback) return;

  switch (type) {
    case 'impact':
      tg.HapticFeedback.impactOccurred(style || 'light');
      break;
    case 'selection':
      tg.HapticFeedback.selectionChanged();
      break;
    case 'notification':
      tg.HapticFeedback.notificationOccurred(style || 'success');
      break;
  }
}

/**
 * Открыть внешнюю ссылку
 */
function openLink(url) {
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

/* ---------------------------------------------- */
/* 9. МОДАЛКА-ОФФЕР (показывается один раз)       */
/* ---------------------------------------------- */

const ONBOARDING_STORAGE_KEY = 'tennis_onboarding_shown';
const OFFER_STORAGE_KEY = 'tennis_offer_shown';
const BOT_DEEPLINK = 'https://t.me/Pervaya_school_tennis_Bot?start=from_app';
const BOT_SHARE_URL = 'https://t.me/Pervaya_school_tennis_Bot';

/**
 * Показать онбординг, если ещё не показывался
 */
function showOnboardingIfNeeded() {
  if (localStorage.getItem(ONBOARDING_STORAGE_KEY)) return false;

  // Обращение по имени из Telegram
  const firstName = tgUser.first_name || '';
  const title = firstName
    ? `${firstName}, добро пожаловать!`
    : 'Добро пожаловать!';
  document.getElementById('onboarding-title').textContent = title;

  // Показываем экран онбординга вместо каталога
  document.getElementById('screen-catalog').classList.remove('screen--active');
  const onboarding = document.getElementById('screen-onboarding');
  onboarding.classList.add('screen--active');

  state.currentScreen = 'onboarding';
  state.screenHistory = ['onboarding'];

  hideTabBar();

  // Кнопка «Начать»
  document.getElementById('onboarding-btn').addEventListener('click', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');

    // Переход на каталог
    navigateTo('catalog');

    // Сбрасываем историю — каталог теперь корневой экран
    state.screenHistory = ['catalog'];
    showTabBar();
    updateTabBar('catalog');

    haptic('impact', 'medium');

    // Показываем оффер после онбординга
    setTimeout(() => showOfferIfNeeded(), 400);
  });

  updateTelegramButtons();
  return true;
}

/**
 * Поделиться ботом с другом
 */
function shareBot() {
  const text = 'Записывайся на теннис! Удобно прямо в Telegram:';
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(BOT_SHARE_URL)}&text=${encodeURIComponent(text)}`);
  } else {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(BOT_SHARE_URL)}&text=${encodeURIComponent(text)}`, '_blank');
  }
  haptic('impact', 'light');
}

/**
 * Показать оффер, если ещё не показывался
 */
function showOfferIfNeeded() {
  if (localStorage.getItem(OFFER_STORAGE_KEY)) return;

  const overlay = document.getElementById('offer-overlay');
  overlay.classList.remove('offer-overlay--hidden');

  // Запускаем анимацию появления на следующем кадре
  requestAnimationFrame(() => {
    overlay.classList.add('offer-overlay--visible');
  });

  // Кнопка CTA — открываем бота через Telegram SDK и закрываем
  document.getElementById('offer-btn-cta').addEventListener('click', () => {
    dismissOffer();
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(BOT_DEEPLINK);
    } else {
      window.open(BOT_DEEPLINK, '_blank');
    }
  });

  // «Пропустить» — запоминаем и закрываем
  document.getElementById('offer-btn-skip').addEventListener('click', () => {
    dismissOffer();
  });

  // Тап по фону — закрыть
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismissOffer();
  });
}

/**
 * Закрыть оффер и запомнить в localStorage
 */
function dismissOffer() {
  localStorage.setItem(OFFER_STORAGE_KEY, '1');

  const overlay = document.getElementById('offer-overlay');
  overlay.classList.remove('offer-overlay--visible');

  // После завершения анимации — скрыть полностью
  setTimeout(() => {
    overlay.classList.add('offer-overlay--hidden');
  }, 350);

  haptic('impact', 'light');
}

/* ---------------------------------------------- */
/* 10. ЗАПУСК ПРИЛОЖЕНИЯ                          */
/* ---------------------------------------------- */

async function init() {
  // Показываем скелетоны
  showSkeletons();

  // Инициализация обработчиков
  initEventHandlers();

  // Загружаем данные с API
  try {
    await loadMasterData();
  } catch (e) {
    console.error('Не удалось загрузить данные:', e);
  }

  renderCatalog();

  // Сообщаем Telegram, что приложение готово
  if (tg) {
    tg.ready();
  }

  updateTelegramButtons();

  // Онбординг → если не показан, после него покажется оффер
  if (!showOnboardingIfNeeded()) {
    showOfferIfNeeded();
  }
}

// Запуск
document.addEventListener('DOMContentLoaded', init);
