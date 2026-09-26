// Экраны и действия пользователя. Расчёты — в logic.js, хранение — в db.js, бекап — в backup.js.

import * as db from './db.js';
import * as L from './logic.js';
import { APP_VERSION, CAR_DEFAULTS, CAR_PHOTO, FILE_BACKUP_STORES, HOME_PARKING_ID, SLEEPY_DAYS, SOURCE_LABELS, SYNC_DEBOUNCE_MS } from './config.js';
import { applyPlan, exportBackup, localBackupData, readBackupFile } from './backup.js';
import { ping, syncNow } from './sync.js';
import { icon } from './icons.js';
import { clearSheet, esc, kv, mascot, mascotTap, openSheet, setSheetCloser, sheet, showFormError, toast } from './ui.js';
import { createService } from './service.js';
import { createExpenses } from './expenses.js';
import { createPhotos } from './photos.js';

const $app = document.getElementById('app');

const state = {
  car: null,
  readings: [],
  works: [],
  plans: [],
  parts: [],
  stock: [],
  fuel: [],
  expenses: [],
  parkingSettings: null,
  parkingDays: [],
  photos: [],
  meta: { id: 'meta' },
  onboarding: false,
  step: 1,
  draft: null,
  pendingImport: null,
  kmWarnFor: null,
  sync: { busy: false, again: false, error: '' },
};

async function load() {
  state.car = await db.get('car', 'car');
  state.readings = await db.getAll('odometer');
  state.works = await db.getAll('works');
  state.plans = await db.getAll('plans');
  state.parts = await db.getAll('parts');
  state.stock = await db.getAll('stock');
  state.fuel = await db.getAll('fuel');
  state.expenses = await db.getAll('expenses');
  state.parkingSettings = await db.get('settings', HOME_PARKING_ID);
  state.parkingDays = await db.getAll('parkingDays');
  state.photos = await db.getAll('photos');
  state.meta = (await db.get('meta', 'meta')) || { id: 'meta' };
}

// После любого изменения данных: перечитать, перерисовать, отправить в Google Таблицу.
async function afterChange() {
  state.sleepyDays = 0;
  await load();
  render();
  scheduleSync();
}

async function saveMeta(changes) {
  state.meta = await db.put('meta', { ...state.meta, ...changes });
}

// ---------- Синхронизация с Google Таблицей ----------

let syncTimer = null;

// Вызывать после каждого изменения данных: отправка уйдёт пачкой через пару секунд.
function scheduleSync() {
  if (!state.meta.syncUrl) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, SYNC_DEBOUNCE_MS);
}

async function runSync() {
  if (!state.meta.syncUrl) return;
  if (state.sync.busy) { state.sync.again = true; return; }
  state.sync.busy = true;
  refreshSyncStatus();
  try {
    const res = await syncNow(state.meta.syncUrl, state.meta.lastSyncAt);
    await saveMeta({ lastSyncAt: res.startedAt });
    state.sync.error = '';
    if (res.pulled) await load();
  } catch (err) {
    state.sync.error = err.message;
  } finally {
    state.sync.busy = false;
  }
  if (state.sync.again) { state.sync.again = false; runSync(); return; }
  // Данные машины пришли из Таблицы, пока открыт первый запуск (например, восстановление на новом телефоне).
  if (state.onboarding && state.car) {
    state.onboarding = false;
    closeSheet();
    location.hash = '#/home';
  }
  if (!state.onboarding) render();
}

function syncStatusText() {
  if (!state.meta.syncUrl) return 'не подключена';
  if (state.sync.busy) return 'сохраняю…';
  if (state.sync.error) return state.sync.error;
  if (state.meta.lastSyncAt) return `сохранено ${L.formatDateTime(state.meta.lastSyncAt)}`;
  return 'подключена';
}

// Обновить только строку статуса, не перерисовывая экран.
function refreshSyncStatus() {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = syncStatusText();
}

// Последний пробег; если записей нет — пробег при покупке.
function currentReading() {
  return L.latestReading(state.readings)
    || { km: state.car.purchaseKm, date: state.car.purchaseDate, source: 'purchase' };
}

// ---------- Общие куски ----------

function closeSheet() {
  clearSheet();
  state.kmWarnFor = null;
  state.pendingImport = null;
}

setSheetCloser(closeSheet);

const service = createService({ state, currentKm: () => currentReading().km, afterChange });
const expenses = createExpenses({ state, currentKm: () => currentReading().km, afterChange });
const photos = createPhotos({ state, afterChange, saveMeta });

const importInput = () => '<input type="file" accept=".json,application/json" hidden data-change="importFile">';

// ---------- Форма «Моя машина» (первый запуск и «Изменить») ----------

function carFormHtml(c, withCurrentKm) {
  const v = (x) => esc(x ?? '');
  return `
    <div class="row">
      <label class="field"><span>Марка</span><input id="f-make" value="${v(c.make)}" autocomplete="off"></label>
      <label class="field"><span>Модель</span><input id="f-model" value="${v(c.model)}" autocomplete="off"></label>
    </div>
    <div class="row">
      <label class="field narrow"><span>Год</span><input id="f-year" inputmode="numeric" value="${v(c.year)}"></label>
      <label class="field"><span>Двигатель</span><input id="f-engine" value="${v(c.engine)}" autocomplete="off"></label>
    </div>
    <label class="field"><span>VIN <em>необязательно</em></span>
      <input id="f-vin" value="${v(c.vin)}" maxlength="17" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>
    <div class="row">
      <label class="field"><span>Куплена</span><input id="f-pdate" type="date" value="${v(c.purchaseDate)}"></label>
      <label class="field"><span>Пробег тогда, км</span><input id="f-pkm" inputmode="numeric" value="${v(c.purchaseKm === '' ? '' : L.formatKm(c.purchaseKm))}"></label>
    </div>
    ${withCurrentKm ? `<label class="field hl"><span>Пробег сейчас, км</span>
      <input id="f-km" inputmode="numeric" placeholder="посмотри на приборке" value="${v(c.currentKm)}"></label>` : ''}
    <p class="error" id="f-error" role="alert"></p>`;
}

function readCarFormRaw() {
  const val = (id) => document.getElementById(id)?.value ?? '';
  return {
    make: val('f-make'), model: val('f-model'), year: val('f-year'), engine: val('f-engine'),
    vin: val('f-vin'), purchaseDate: val('f-pdate'), purchaseKm: val('f-pkm'), currentKm: val('f-km'),
  };
}

// ---------- Первый запуск ----------

function progress(step) {
  return `<div class="progress">${[1, 2, 3].map((i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
    <div class="muted">Шаг ${step} из 3</div>`;
}

function onboardingView() {
  if (state.step === 1) {
    return `<div class="welcome">
      ${mascot('xl', 'hero')}
      <h1>Привет!<br>Я — твоя Malibu</h1>
      <p class="muted">Буду помнить про масло, ТО и расходы, чтобы тебе не приходилось</p>
    </div>
    <button class="btn primary" data-action="onbNext">Начать</button>
    <button class="btn link" data-action="openRestore">${icon('refresh')} Восстановить из бекапа</button>`;
  }
  if (state.step === 2) {
    return `${progress(2)}
      <div class="title-row"><button class="icon-btn" data-action="onbBack" aria-label="Назад">${icon('back')}</button><h1>Моя машина</h1></div>
      ${carFormHtml(state.draft, true)}
      <div class="grow"></div>
      <button class="btn primary" data-action="onbNext">Далее</button>`;
  }
  return `${progress(3)}
    <div class="title-row"><button class="icon-btn" data-action="onbBack" aria-label="Назад">${icon('back')}</button><h1>Бекап</h1></div>
    <div class="hello">${mascot('', 'wink')}<div class="bubble">Подключи бекап — тогда я ничего не забуду, даже если потеряешь телефон</div></div>
    <section class="card stack">
      <div class="list-row plain">${icon('table', 'green')}<div class="grow"><div class="strong">Google Таблица</div>
        <div class="muted">автосохранение после каждой записи</div></div>
        ${state.meta.syncUrl ? '<span class="tag ok">подключена</span>' : ''}</div>
      ${state.meta.syncUrl ? '' : '<button class="btn outline" data-action="openConnect">Подключить</button>'}
    </section>
    <section class="card"><div class="list-row plain">${icon('download', 'accent')}<div class="grow"><div class="strong">Файл-бекап</div>
      <div class="muted">кнопка «Экспорт» в разделе «Ещё»</div></div></div></section>
    <div class="grow"></div>
    <button class="btn primary" data-action="onbFinish">Готово</button>
    <p class="muted center-text">бекап можно подключить позже</p>`;
}

// ---------- Экраны ----------

function homeView() {
  const c = state.car;
  const latest = currentReading();
  const today = L.todayIso();
  const stats = L.drivingStats(c, latest, today);
  const backups = [state.meta.lastExportAt, state.meta.lastSyncAt].filter(Boolean).sort();
  const tip = L.pickTip({ latest, lastBackupAt: backups.pop() || null, today });
  // Шапка — фото Malibu с пробегом (решение 26.09), акулёнок — только ниже, у напоминания.
  // Своё фото из «Моя Malibu» — если включено «Обложка на главной». Нажатие — страница с фото.
  return `
    <a class="car-photo" href="#/more/photos" style="background-image:url('${photos.homePhoto() || CAR_PHOTO}')">
      <div class="car-shade"></div>
      <div class="car-info">
        <div class="car-line">${esc(c.make)} ${esc(c.model)} · ${esc(c.year)} · ${esc(c.engine)} <span class="heart">${icon('heart')}</span></div>
        <div class="km-big">${L.formatKm(latest.km)} <small>км</small></div>
        <div class="car-date">обновлено ${L.formatDate(latest.date)}</div>
      </div>
    </a>
    <button class="btn outline small" data-action="openKm">${icon('gauge')} Обновить пробег</button>
    ${state.sleepyDays
    ? `<div class="hello">${mascot('', 'sleepy')}<div class="bubble">Давно не виделись — ${state.sleepyDays} ${L.plural(state.sleepyDays, L.DAYS)}! Обнови пробег, и я проверю, не пора ли что-то менять</div></div>`
    : `<div class="hello">${mascot('', tip.mood === 'calm' ? 'happy' : tip.mood)}<div class="bubble">${esc(tip.text)}</div></div>`}
    <div class="tiles">
      <div class="card tile"><div class="label">С покупки</div><div class="value">+${L.formatKm(stats.kmSince)} км</div>
        <div class="muted">за ${stats.days} ${L.plural(stats.days, L.DAYS)}</div></div>
      <div class="card tile"><div class="label">В среднем</div>
        <div class="value">${stats.perDay == null ? '—' : `~${L.formatKm(stats.perDay)} км/день`}</div>
        <div class="muted">${stats.perDay == null ? 'нужна неделя данных' : `~${L.formatKm(stats.perDay * 30)} км в месяц`}</div></div>
    </div>
    ${service.homeCard()}`;
}

function moreView() {
  const c = state.car;
  const exp = state.meta.lastExportAt;
  const readings = [...state.readings]
    .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)
    .slice(0, 10);
  return `<h1>Ещё</h1>
    <section class="card">
      <div class="card-head"><h2>Машина</h2><button class="btn link small" data-action="editCar">Изменить</button></div>
      ${kv('Модель', `${c.make} ${c.model}`)}
      ${kv('Год', c.year)}
      ${kv('Двигатель', c.engine || '—')}
      ${kv('VIN', c.vin || '—')}
      ${kv('Куплена', `${L.formatDate(c.purchaseDate)} · ${L.formatKm(c.purchaseKm)} км`)}
    </section>
    <a class="list-btn" href="#/more/photos">${icon('camera', 'accent')}<span class="grow">Моя Malibu — фото</span>
      <span class="muted">${state.photos.length || ''}</span>${icon('chevron')}</a>
    <button class="list-btn" data-action="openServiceBook">${icon('file', 'accent')}<span class="grow">Сервисная книжка (PDF)</span>${icon('chevron')}</button>
    <section class="card stack">
      <h2>Бекап</h2>
      <div class="list-row plain">${icon('table', 'green')}<div class="grow"><div class="strong">Google Таблица</div>
        <div class="muted ${state.sync.error ? 'err-text' : ''}" id="sync-status">${esc(syncStatusText())}</div></div></div>
      ${state.meta.syncUrl ? `<div class="row">
          <button class="btn outline small" data-action="syncNow">${icon('refresh')} Сохранить сейчас</button>
          ${state.meta.spreadsheetUrl ? `<a class="btn outline small" href="${esc(state.meta.spreadsheetUrl)}" target="_blank" rel="noopener">${icon('table')} Открыть</a>` : ''}
        </div>`
    : '<button class="btn outline small" data-action="openConnect">Подключить</button>'}
      <hr>
      <div class="list-row plain">${icon('download', 'accent')}<div class="grow"><div class="strong">Файл-бекап</div>
        <div class="muted">${exp ? `последний: ${L.formatDate(L.todayIso(new Date(exp)))}` : 'ещё не делали'}</div></div></div>
      <div class="row">
        <button class="btn primary small" data-action="doExport">${icon('download')} Экспорт</button>
        <label class="btn outline small">${icon('upload')} Импорт${importInput()}</label>
      </div>
    </section>
    <section class="card">
      <h2>История пробега</h2>
      ${readings.map((r) => (r.source === 'purchase'
    ? `<div class="list-row"><div class="strong grow">${L.formatKm(r.km)} км</div>
        <div class="muted">${SOURCE_LABELS[r.source]} · ${L.formatDate(r.date)}</div></div>`
    : `<button class="list-row tappable" data-action="editReading" data-id="${esc(r.id)}">
        <div class="strong grow">${L.formatKm(r.km)} км</div>
        <div class="muted">${SOURCE_LABELS[r.source] || ''} · ${L.formatDate(r.date)}</div>${icon('chevron', 'muted-ic')}</button>`)).join('')}
      <p class="muted">Нажми на запись, чтобы исправить или удалить. Пробег при покупке — в «Машина → Изменить».</p>
    </section>
    ${state.meta.syncUrl ? '<button class="btn link small" data-action="disconnect">Отключить Google Таблицу на этом телефоне</button>' : ''}
    <p class="muted center-text">Malibu Assistant · версия ${APP_VERSION}</p>`;
}

// Эмблема Chevrolet на вкладке «Главная» (решение 26.09): активная — золотая, иначе — контуром.
function bowtie(active) {
  return `<svg class="ic bowtie" viewBox="0 0 48 24" aria-hidden="true">
    ${active ? '<defs><linearGradient id="bt-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7DC7A"/><stop offset=".55" stop-color="#E0B43F"/><stop offset="1" stop-color="#B8862A"/></linearGradient></defs>' : ''}
    <path d="M4 8h13l2-5h12l-2 5h17l-4 8H29l-2 5H15l2-5H0z" fill="${active ? 'url(#bt-gold)' : 'none'}"
      stroke="${active ? '#8A6420' : 'currentColor'}" stroke-width="${active ? 1.4 : 2.4}" stroke-linejoin="round"/></svg>`;
}

function tabbar(route) {
  const tab = (id, ic, label) => `<a href="#/${id}" class="tab ${route === id ? 'on' : ''}">${icon(ic)}<span>${label}</span></a>`;
  return `<nav class="tabbar">
    <a href="#/home" class="tab ${route === 'home' ? 'on' : ''}">${bowtie(route === 'home')}<span>Главная</span></a>
    ${tab('service', 'tool', 'ТО')}
    <button class="tab-plus" data-action="openAdd" aria-label="Добавить">${icon('plus')}</button>
    ${tab('expenses', 'wallet', 'Расходы')}
    ${tab('more', 'dots', 'Ещё')}
  </nav>`;
}

function render() {
  if (state.onboarding) {
    $app.innerHTML = `<main class="screen onboard">${onboardingView()}</main>`;
    return;
  }
  // Адрес вида #/service/node/oil: раздел — первая часть, остальное — внутри раздела.
  const [route, ...rest] = (location.hash.replace(/^#\//, '') || 'home').split('/');
  const views = {
    home: homeView,
    service: () => service.view(rest.join('/')),
    expenses: () => expenses.view(rest.join('/')),
    more: () => (rest[0] === 'photos' ? photos.view() : moreView()),
  };
  $app.innerHTML = `<main class="screen">${(views[route] || homeView)()}</main>${tabbar(route)}`;
}

// ---------- Окна (снизу) ----------

// Повторный ввод в тот же день исправляет сегодняшнюю запись, а не плодит новые.
// Поэтому сравниваем с последней записью до сегодняшней.
function kmBase() {
  const today = L.todayIso();
  const todays = state.readings.find((r) => r.date === today && r.source === 'manual') || null;
  const base = L.latestReading(state.readings.filter((r) => r !== todays)) || currentReading();
  return { todays, base };
}

function kmSheet() {
  const { todays, base } = kmBase();
  return sheet('Пробег сейчас', `
    <p class="muted">Прошлая запись: ${L.formatKm(base.km)} км, ${L.formatDate(base.date)}</p>
    ${todays ? `<p class="muted">Сегодня уже записано ${L.formatKm(todays.km)} км — новое значение заменит его</p>` : ''}
    <label class="field hl"><span>Пробег, км</span><input id="km-input" inputmode="numeric" placeholder="посмотри на приборке"></label>
    <p class="error" id="km-error" role="alert"></p>
    <button class="btn primary" id="km-save" data-action="saveKm">Сохранить</button>`);
}

function editReadingSheet(r) {
  return sheet('Исправить пробег', `
    <p class="muted">Запись от ${L.formatDate(r.date)}</p>
    <label class="field hl"><span>Пробег, км</span><input id="edit-km" inputmode="numeric" value="${L.formatKm(r.km)}"></label>
    <p class="error" id="edit-error" role="alert"></p>
    <button class="btn primary" data-action="saveReading" data-id="${esc(r.id)}">Сохранить</button>
    <button class="btn link danger" id="del-btn" data-action="deleteReading" data-id="${esc(r.id)}">Удалить запись</button>`);
}

function addSheet() {
  const row = (action, ic, label) => `<button class="list-btn" data-action="${action}">${icon(ic, 'accent')}<span class="grow">${label}</span>${icon('chevron')}</button>`;
  return sheet('Добавить', `
    ${row('newFuel', 'fuel', 'Заправка')}
    ${row('newExpense', 'wallet', 'Расход')}
    ${row('addKm', 'gauge', 'Пробег')}
    ${row('newWork', 'tool', 'Работа на СТО')}
    ${row('editPlan', 'list', 'План')}`);
}

// restore: подключение на новом телефоне — после подключения сразу забираем данные.
function connectSheet(restore) {
  return sheet(restore ? 'Восстановить из Google Таблицы' : 'Подключить Google Таблицу', `
    <p class="muted">Вставь код подключения — длинную ссылку, которая начинается с https://script.google.com/macros/s/</p>
    <label class="field hl"><span>Код подключения</span>
      <input id="sync-code" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…"></label>
    <p class="error" id="sync-error" role="alert"></p>
    <button class="btn primary" id="sync-connect" data-action="connect" data-restore="${restore ? 1 : ''}">Подключить</button>`);
}

function restoreSheet() {
  return sheet('Восстановить из бекапа', `
    <button class="list-btn" data-action="openConnect" data-restore="1">${icon('table', 'green')}
      <span class="grow">Из Google Таблицы</span>${icon('chevron')}</button>
    <label class="list-btn">${icon('download', 'accent')}<span class="grow">Из файла-бекапа</span>${icon('chevron')}${importInput()}</label>`);
}

function importSheet(backup, plan) {
  const nothing = plan.added + plan.updated === 0;
  return sheet('Восстановить из бекапа', `
    <p>Бекап от <b>${L.formatDate(L.todayIso(new Date(backup.exportedAt)))}</b></p>
    <div class="card">
      ${kv('Новых записей', plan.added)}
      ${kv('Обновится', plan.updated)}
      ${kv('Уже есть, без изменений', plan.unchanged)}
    </div>
    <p class="muted">Ничего из того, что уже есть в приложении, не удалится.</p>
    ${nothing
    ? '<button class="btn outline" data-action="closeSheet">Закрыть — всё уже есть</button>'
    : '<button class="btn primary" data-action="confirmImport">Восстановить</button>'}`);
}

// ---------- Действия ----------

async function handleImportFile(file) {
  if (!file) return;
  try {
    const backup = await readBackupFile(file);
    const plan = L.planMerge(await localBackupData(FILE_BACKUP_STORES), backup.data, FILE_BACKUP_STORES);
    openSheet(importSheet(backup, plan));
    state.pendingImport = plan;
  } catch (err) {
    toast(err.message);
  }
}

const actions = {
  onbNext() {
    if (state.step === 1) {
      state.draft = state.draft || { ...CAR_DEFAULTS, currentKm: '' };
      state.step = 2;
      render();
      return;
    }
    const raw = readCarFormRaw();
    const res = L.validateCarInput(raw, L.todayIso(), true);
    state.draft = raw;
    if (res.error) {
      showFormError('f-error', res.error);
      return;
    }
    state.step = 3;
    render();
  },

  onbBack() {
    if (state.step === 2) state.draft = readCarFormRaw();
    state.step -= 1;
    render();
  },

  async onbFinish() {
    const res = L.validateCarInput(state.draft, L.todayIso(), true);
    if (res.error) { state.step = 2; render(); showFormError('f-error', res.error); return; }
    await db.put('car', { id: 'car', ...res.car });
    await db.put('odometer', { date: res.car.purchaseDate, km: res.car.purchaseKm, source: 'purchase' });
    if (res.currentKm !== res.car.purchaseKm) {
      await db.put('odometer', { date: L.todayIso(), km: res.currentKm, source: 'manual' });
    }
    await load();
    state.onboarding = false;
    location.hash = '#/home';
    render();
    navigator.storage?.persist?.();
    scheduleSync();
  },

  openRestore() { openSheet(restoreSheet()); },
  openConnect(el) { openSheet(connectSheet(Boolean(el.dataset.restore)), { focus: true }); },

  async connect(el) {
    const parsed = L.parseSyncCode(document.getElementById('sync-code').value);
    if (parsed.error) { showFormError('sync-error', parsed.error); return; }
    const btn = document.getElementById('sync-connect');
    btn.textContent = 'Проверяю…';
    try {
      const spreadsheetUrl = await ping(parsed.url);
      // При новом подключении отправляем в Таблицу всё, что есть на телефоне.
      await saveMeta({ syncUrl: parsed.url, spreadsheetUrl, lastSyncAt: null });
    } catch (err) {
      btn.textContent = 'Подключить';
      showFormError('sync-error', err.message);
      return;
    }
    closeSheet();
    if (el.dataset.restore) {
      toast('Подключено, забираю данные…');
      // Здесь синхронизация идёт напрямую, чтобы показать настоящую ошибку, а не «нет данных».
      try {
        const res = await syncNow(state.meta.syncUrl, null);
        await saveMeta({ lastSyncAt: res.startedAt });
        state.sync.error = '';
        await load();
      } catch (err) {
        toast(`Не получилось забрать данные: ${err.message}. Попробуй ещё раз`, 10000);
        return;
      }
      if (state.car) {
        state.onboarding = false;
        location.hash = '#/home';
        toast('Данные восстановлены из Google Таблицы');
      } else {
        toast('В Таблице пока нет данных — заполни машину');
      }
      render();
      return;
    }
    toast('Google Таблица подключена');
    render();
    if (state.car) runSync();
  },

  syncNow() { runSync(); },

  async disconnect() {
    await saveMeta({ syncUrl: null, spreadsheetUrl: null, lastSyncAt: null });
    state.sync.error = '';
    toast('Отключено. Данные в Таблице и на телефоне остались');
    render();
  },

  openAdd() { openSheet(addSheet()); },
  addKm() { actions.openKm(); },

  openKm() {
    state.kmWarnFor = null;
    openSheet(kmSheet(), { focus: true });
  },

  async saveKm() {
    const km = L.parseKm(document.getElementById('km-input').value);
    const { todays, base } = kmBase();
    const res = L.checkNewKm(km, base);
    if (res.error) { showFormError('km-error', res.error); return; }
    if (res.warn && state.kmWarnFor !== km) {
      state.kmWarnFor = km;
      showFormError('km-error', res.warn, true);
      document.getElementById('km-save').textContent = 'Да, всё верно';
      return;
    }
    await db.put('odometer', { ...(todays || {}), date: L.todayIso(), km, source: 'manual' });
    closeSheet();
    await load();
    toast('Пробег сохранён');
    render();
    scheduleSync();
  },

  editReading(el) {
    const r = state.readings.find((x) => x.id === el.dataset.id);
    if (r) openSheet(editReadingSheet(r), { focus: true });
  },

  async saveReading(el) {
    const r = state.readings.find((x) => x.id === el.dataset.id);
    const km = L.parseKm(document.getElementById('edit-km').value);
    const res = L.checkEditedKm(km, r, state.readings);
    if (res.error) { showFormError('edit-error', res.error); return; }
    await db.put('odometer', { ...r, km });
    closeSheet();
    await load();
    toast('Исправлено');
    render();
    scheduleSync();
  },

  // Удаление — в два нажатия. Запись помечается удалённой (в Google Таблице остаётся с пометкой «да»).
  async deleteReading(el) {
    if (!el.dataset.sure) {
      el.dataset.sure = '1';
      el.textContent = 'Точно удалить? Нажми ещё раз';
      return;
    }
    const r = state.readings.find((x) => x.id === el.dataset.id);
    await db.put('odometer', { ...r, deleted: true });
    closeSheet();
    await load();
    toast('Запись удалена');
    render();
    scheduleSync();
  },

  editCar() {
    openSheet(sheet('Моя машина', `${carFormHtml(state.car, false)}
      <button class="btn primary" data-action="saveCar">Сохранить</button>`));
  },

  async saveCar() {
    const res = L.validateCarInput(readCarFormRaw(), L.todayIso(), false);
    if (res.error) { showFormError('f-error', res.error); return; }
    const others = state.readings.filter((r) => r.source !== 'purchase');
    if (others.length && Math.min(...others.map((r) => r.km)) < res.car.purchaseKm) {
      showFormError('f-error', 'Пробег при покупке больше, чем уже записанный пробег — проверь цифры');
      return;
    }
    await db.put('car', { ...state.car, ...res.car });
    const purchase = state.readings.find((r) => r.source === 'purchase');
    await db.put('odometer', { ...(purchase || { source: 'purchase' }), date: res.car.purchaseDate, km: res.car.purchaseKm });
    closeSheet();
    await load();
    toast('Сохранено');
    render();
    scheduleSync();
  },

  async doExport() {
    try {
      const done = await exportBackup();
      if (!done) return;
      await saveMeta({ lastExportAt: new Date().toISOString() });
      toast('Файл-бекап сохранён');
      render();
    } catch (err) {
      toast(`Не получилось сохранить файл: ${err.message}`);
    }
  },

  async confirmImport() {
    if (!state.pendingImport) return;
    await applyPlan(state.pendingImport);
    closeSheet();
    await load();
    if (state.car) state.onboarding = false;
    toast('Бекап восстановлен');
    render();
    scheduleSync();
  },

  closeSheet(el, e) {
    if (el.classList.contains('sheet-backdrop') && e.target !== el) return;
    closeSheet();
  },

  mascotTap(el) { mascotTap(el); },

  ...service.actions,
  ...expenses.actions,
  ...photos.actions,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

document.addEventListener('change', (e) => {
  if (e.target.dataset.change === 'importFile') {
    handleImportFile(e.target.files[0]);
    e.target.value = '';
  }
  if (e.target.dataset.change === 'addPhotos') {
    photos.addFiles([...e.target.files]);
    e.target.value = '';
  }
});

document.addEventListener('input', (e) => expenses.onInput(e));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'km-input') actions.saveKm();
  if (e.target.id === 'sync-code') actions.connect(document.getElementById('sync-connect'));
});

// Досохранить в Таблицу, когда появился интернет или приложение снова открыли.
window.addEventListener('online', scheduleSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.car) scheduleSync();
});

window.addEventListener('hashchange', () => {
  closeSheet();
  render();
  window.scrollTo(0, 0);
});

async function boot() {
  await load();
  state.onboarding = !state.car;
  // Давно не открывала приложение — акулёнок «спал» (показываем один раз, до следующего действия).
  const lastOpen = state.meta.lastOpenAt;
  const away = lastOpen ? L.daysBetween(L.todayIso(new Date(lastOpen)), L.todayIso()) : 0;
  state.sleepyDays = state.car && away >= SLEEPY_DAYS ? away : 0;
  await saveMeta({ lastOpenAt: new Date().toISOString() });
  if (!location.hash) history.replaceState(null, '', '#/home');
  render();
  if (state.car) scheduleSync();
  if ('serviceWorker' in navigator) {
    // Пришла новая версия приложения — один раз перезагрузиться, чтобы сразу её показать.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  }
}

boot().catch((err) => {
  $app.innerHTML = `<main class="screen"><h1>Что-то пошло не так</h1><p class="muted">${esc(err.message)}</p></main>`;
});
