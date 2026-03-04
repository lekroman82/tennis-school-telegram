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
/* 2. ДАННЫЕ ПРИЛОЖЕНИЯ                           */
/* Реалистичные данные школы тенниса              */
/* Для изменения — редактируй объекты ниже        */
/* ---------------------------------------------- */

// Тренеры
const COACHES = [
  {
    id: 'c1',
    name: 'Роман Лекомцев',
    title: 'Автор методики обучения',
    experience: 15,
    emoji: '👨‍🏫'
  }
];

// Услуги (каталог)
// Данные с сайта bolshoitennis.ru — Первая Школа Тенниса, Саратов
const SERVICES = [
  {
    id: 's1',
    title: 'Индивидуальная тренировка',
    description: 'Персональное занятие с тренером. Работа над техникой подхода к мячу, подачей и приёмом по авторской методике.',
    duration: 60,
    price: 2900,
    category: 'individual',
    emoji: '🎾',
    coachId: 'c1',
    maxParticipants: 1,
    spotsLeft: 4
  },
  {
    id: 's2',
    title: 'Абонемент (8 занятий/мес)',
    description: 'Групповые тренировки 2 раза в неделю в мини-группе до 4 детей. Ежемесячная аттестация по 21 показателю. Оборудование предоставляется.',
    duration: 60,
    price: 8000,
    category: 'group',
    emoji: '📋',
    coachId: 'c1',
    maxParticipants: 4,
    spotsLeft: 2
  },
  {
    id: 's3',
    title: 'Групповое занятие (разовое)',
    description: 'Разовая тренировка в мини-группе до 4 человек. Подготовка детей от 4 до 8 лет по авторской методике. Оборудование предоставляется.',
    duration: 60,
    price: 1200,
    category: 'group',
    emoji: '👥',
    coachId: 'c1',
    maxParticipants: 4,
    spotsLeft: 3
  },
  {
    id: 's4',
    title: 'Аренда корта',
    description: 'Аренда теннисного корта на 1 час. Для самостоятельных тренировок или игры с партнёром.',
    duration: 60,
    price: 1400,
    category: 'rent',
    emoji: '🏟️',
    coachId: null,
    maxParticipants: 4,
    spotsLeft: 5
  },
  {
    id: 's5',
    title: 'Пробная тренировка',
    description: 'Бесплатное ознакомительное занятие для детей от 4 до 8 лет. Познакомитесь с тренером и авторской методикой, оцените уровень ребёнка.',
    duration: 60,
    price: 0,
    category: 'trial',
    emoji: '⭐',
    coachId: 'c1',
    maxParticipants: 1,
    spotsLeft: 6
  }
];

// Генерация расписания на 14 дней вперёд
function generateSlots() {
  const slots = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Возможные времена начала занятий
  const possibleTimes = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = formatDateKey(date);

    // Для каждой услуги генерируем 3–6 случайных слотов
    SERVICES.forEach(service => {
      // Пропускаем часть дней, чтобы было реалистично
      if (Math.random() < 0.2) return;

      const shuffled = [...possibleTimes].sort(() => Math.random() - 0.5);
      const count = 3 + Math.floor(Math.random() * 4); // 3-6 слотов
      const daySlots = shuffled.slice(0, count).sort();

      // Если сегодня — убираем прошедшие слоты
      const filtered = daySlots.filter(time => {
        if (dayOffset === 0) {
          const [h, m] = time.split(':').map(Number);
          const slotTime = new Date(today);
          slotTime.setHours(h, m);
          return slotTime > now;
        }
        return true;
      });

      if (filtered.length > 0) {
        const key = `${service.id}_${dateStr}`;
        slots[key] = filtered;
      }
    });
  }

  return slots;
}

// Все слоты на 14 дней
const SCHEDULE = generateSlots();

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

  updateTelegramButtons();
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
  if (screen === 'catalog' || screen === 'success' || screen === 'onboarding') {
    tg.BackButton.hide();
  } else {
    tg.BackButton.show();
  }

  // --- MainButton ---
  switch (screen) {
    case 'onboarding':
    case 'catalog':
    case 'bookings':
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
      <div class="service-card__image">${service.emoji}</div>
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
  const coach = COACHES.find(c => c.id === service.coachId);

  // Фото услуги (эмодзи-заглушка)
  document.getElementById('detail-image').textContent = service.emoji;

  // Текст
  document.getElementById('detail-title').textContent = service.title;
  document.getElementById('detail-duration').textContent = `${service.duration} мин`;
  document.getElementById('detail-description').textContent = service.description;

  // Тренер (скрываем блок если нет тренера — например, для аренды корта)
  const coachBlock = document.getElementById('detail-coach');
  const coachDivider = coachBlock.previousElementSibling; // divider перед блоком тренера
  if (coach) {
    coachBlock.style.display = '';
    coachDivider.style.display = '';
    document.getElementById('coach-avatar').textContent = coach.emoji;
    document.getElementById('coach-name').textContent = coach.name;
    document.getElementById('coach-meta').textContent = `${coach.title} · Опыт ${coach.experience} лет`;
  } else {
    coachBlock.style.display = 'none';
    coachDivider.style.display = 'none';
  }

  // Доступность
  const spotsEl = document.getElementById('detail-spots');
  spotsEl.textContent = `Осталось ${service.spotsLeft} ${pluralize(service.spotsLeft, 'место', 'места', 'мест')}`;
  spotsEl.className = service.spotsLeft <= 3
    ? 'detail__spots detail__spots--low'
    : 'detail__spots';

  // Ближайший слот
  const nextSlot = findNextSlot(service.id);
  const nextSlotEl = document.getElementById('detail-next-slot');
  if (nextSlot) {
    nextSlotEl.textContent = `Ближайшее: ${nextSlot}`;
  } else {
    nextSlotEl.textContent = 'Расписание формируется';
  }
}

/* --- Экран 3: Выбор даты и времени --- */

/**
 * Отрисовка экрана выбора даты и времени
 */
function renderDateTimeScreen() {
  // Сбросить выбор при каждом входе
  state.selectedDate = null;
  state.selectedTime = null;

  // Начинаем с текущего месяца
  const now = new Date();
  state.calendarMonth = now.getMonth();
  state.calendarYear = now.getFullYear();

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
    const hasSlots = state.selectedService
      && SCHEDULE[`${state.selectedService.id}_${dateKey}`]?.length > 0;

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
function renderTimeSlots(serviceId, dateKey) {
  const key = `${serviceId}_${dateKey}`;
  const times = SCHEDULE[key] || [];

  const section = document.getElementById('time-section');
  const container = document.getElementById('time-slots');
  const emptyState = document.getElementById('no-slots');

  if (times.length === 0) {
    section.classList.add('time-section--hidden');
    emptyState.classList.remove('empty-state--hidden');
    return;
  }

  emptyState.classList.add('empty-state--hidden');
  section.classList.remove('time-section--hidden');
  container.innerHTML = '';

  times.forEach(time => {
    const chip = document.createElement('button');
    chip.className = 'time-chip';
    chip.textContent = time;

    if (state.selectedTime === time) {
      chip.classList.add('time-chip--selected');
    }

    chip.addEventListener('click', () => {
      state.selectedTime = time;

      // Обновляем выделение
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
  const coach = COACHES.find(c => c.id === service.coachId);
  const date = state.selectedDate;
  const time = state.selectedTime;

  // Карточка-резюме
  document.getElementById('summary-title').textContent = service.title;
  document.getElementById('summary-date').textContent = formatDateFull(date);
  document.getElementById('summary-time').textContent = formatTimeRange(time, service.duration);

  // Строка тренера — скрываем если тренера нет (аренда корта)
  const summaryCoachRow = document.getElementById('summary-coach').closest('.summary-card__row');
  if (coach) {
    summaryCoachRow.style.display = '';
    document.getElementById('summary-coach').textContent = coach.name;
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
function submitBooking() {
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

  // Имитация отправки на сервер (300ms)
  setTimeout(() => {
    if (tg) {
      tg.MainButton.hideProgress();
      tg.MainButton.enable();
    }

    // Увеличиваем номер записи
    state.bookingNumber++;

    // Заполняем экран успеха
    renderSuccessScreen();

    // Переход на экран успеха
    navigateTo('success');

    // Haptic feedback — успех!
    haptic('notification', 'success');

    // Отправляем данные боту (если запущено в Telegram)
    sendDataToBot();

  }, 300);
}

/* --- Экран 5: Успех --- */

/**
 * Заполнить экран успеха данными записи
 */
function renderSuccessScreen() {
  const service = state.selectedService;
  const coach = COACHES.find(c => c.id === service.coachId);

  document.getElementById('success-title').textContent = service.title;
  document.getElementById('success-date').textContent = formatDateFull(state.selectedDate);
  document.getElementById('success-time').textContent = formatTimeRange(state.selectedTime, service.duration);

  // Строка тренера — скрываем если тренера нет (аренда корта)
  const successCoachRow = document.getElementById('success-coach').closest('.summary-card__row');
  if (coach) {
    successCoachRow.style.display = '';
    document.getElementById('success-coach').textContent = coach.name;
  } else {
    successCoachRow.style.display = 'none';
  }

  document.getElementById('success-number').textContent = `Запись #${state.bookingNumber}`;
}

/**
 * Отправить данные записи боту через sendData
 */
function sendDataToBot() {
  if (!tg) return;

  const service = state.selectedService;
  const coach = COACHES.find(c => c.id === service.coachId);
  const comment = document.getElementById('confirm-comment').value.trim();

  const data = {
    action: 'booking',
    bookingNumber: state.bookingNumber,
    service: service.title,
    date: formatDateKey(state.selectedDate),
    time: state.selectedTime,
    duration: service.duration,
    price: service.price,
    coach: coach?.name || '',
    phone: document.getElementById('confirm-phone').value.trim(),
    comment: comment,
    userName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
  };

  // sendData закрывает Mini App, поэтому не вызываем его сразу
  // Вместо этого данные можно отправить через API бэкенда
  // tg.sendData(JSON.stringify(data));

  // Для демо — выводим в консоль
  console.log('Данные записи:', data);

  // Сохраняем запись в localStorage
  saveBookingToStorage(data);
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
        <button class="bookings-empty__btn" onclick="navigateBack()">Перейти в каталог</button>
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
 * Найти ближайший доступный слот для услуги
 * @param {string} serviceId
 * @returns {string|null} — 'завтра, 10:00' или null
 */
function findNextSlot(serviceId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateKey = formatDateKey(date);
    const key = `${serviceId}_${dateKey}`;
    const slots = SCHEDULE[key];

    if (slots && slots.length > 0) {
      const time = slots[0];

      if (dayOffset === 0) {
        return `сегодня, ${time}`;
      } else if (dayOffset === 1) {
        return `завтра, ${time}`;
      } else {
        return `${date.getDate()} ${months[date.getMonth()]}, ${time}`;
      }
    }
  }
  return null;
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

  // Кнопка «Начать»
  document.getElementById('onboarding-btn').addEventListener('click', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');

    // Переход на каталог
    navigateTo('catalog');

    // Сбрасываем историю — каталог теперь корневой экран
    state.screenHistory = ['catalog'];

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

function init() {
  // Показываем скелетоны
  showSkeletons();

  // Инициализация обработчиков
  initEventHandlers();

  // Имитация загрузки данных (скелетоны видны 400ms)
  setTimeout(() => {
    renderCatalog();

    // Сообщаем Telegram, что приложение готово
    if (tg) {
      tg.ready();
    }

    updateTelegramButtons();

    // Онбординг → если не показан, после него покажется оффер
    // Если онбординг уже был — показываем только оффер
    if (!showOnboardingIfNeeded()) {
      showOfferIfNeeded();
    }
  }, 400);
}

// Запуск
document.addEventListener('DOMContentLoaded', init);
