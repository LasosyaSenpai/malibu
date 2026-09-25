// Чистая логика: расчёты, проверки, форматирование. Без обращений к браузеру и хранилищу —
// поэтому проверяется тестами в Node.js (tests/logic.test.js).

import {
  APP_ID, BACKUP_STORES, BACKUP_VERSION, BIG_JUMP_KM, MIN_CAR_YEAR,
  MIN_DAYS_FOR_AVG, SYNC_CODE_PREFIX, TIP_EXPORT_DAYS, TIP_KM_DAYS,
} from './config.js';

const NBSP = ' ';
const DAY_MS = 86400000;
export const DAYS = ['день', 'дня', 'дней'];

export function formatKm(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// «28 640», «28640», «28 640 км» → 28640. Всё остальное → null.
export function parseKm(value) {
  if (value == null) return null;
  const clean = String(value).replace(/[\s ]|км/g, '');
  if (!/^\d{1,7}$/.test(clean)) return null;
  return Number(clean);
}

// Дата в формате 2026-09-25 по местному времени телефона.
export function todayIso(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatDate(todayIso(d))} в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function daysBetween(fromIso, toIso) {
  const toUtc = (iso) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

// plural(3, DAYS) → «дня»
export function plural(n, [one, few, many]) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

// Последний пробег = самый большой (одометр не уменьшается). При равенстве — более поздняя запись.
export function latestReading(readings) {
  let best = null;
  for (const r of readings) {
    if (!best || r.km > best.km || (r.km === best.km && r.date > best.date)) best = r;
  }
  return best;
}

// Проверка нового пробега. error — сохранять нельзя, warn — переспросить.
export function checkNewKm(km, latest) {
  if (km == null) return { error: 'Введи пробег цифрами' };
  if (latest && km < latest.km) {
    return { error: `Меньше последнего записанного (${formatKm(latest.km)} км) — проверь цифры` };
  }
  if (latest && km - latest.km > BIG_JUMP_KM) {
    return { warn: `Это на ${formatKm(km - latest.km)} км больше прошлого раза. Всё верно?` };
  }
  return {};
}

// Исправление старой записи пробега: число должно помещаться между соседними записями по датам.
export function checkEditedKm(km, target, readings) {
  if (km == null) return { error: 'Введи пробег цифрами' };
  const others = readings.filter((r) => r.id !== target.id);
  const before = others.filter((r) => r.date < target.date || (r.date === target.date && r.source === 'purchase'));
  const after = others.filter((r) => r.date > target.date);
  const prev = latestReading(before);
  if (prev && km < prev.km) {
    return { error: `Меньше, чем записано раньше (${formatKm(prev.km)} км, ${formatDate(prev.date)})` };
  }
  const next = after.reduce((min, r) => (!min || r.km < min.km ? r : min), null);
  if (next && km > next.km) {
    return { error: `Больше, чем записано позже (${formatKm(next.km)} км, ${formatDate(next.date)})` };
  }
  return {};
}

export function drivingStats(car, latest, today) {
  const kmSince = Math.max(0, (latest ? latest.km : car.purchaseKm) - car.purchaseKm);
  const days = Math.max(0, daysBetween(car.purchaseDate, today));
  const perDay = days >= MIN_DAYS_FOR_AVG ? Math.round(kmSince / days) : null;
  return { kmSince, days, perDay };
}

export function isValidVin(vin) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}

// Проверка формы «Моя машина». Возвращает { error } или { car, currentKm }.
export function validateCarInput(raw, today, needCurrentKm) {
  const make = String(raw.make || '').trim();
  const model = String(raw.model || '').trim();
  const engine = String(raw.engine || '').trim();
  const vin = String(raw.vin || '').trim().toUpperCase();
  const year = Number(raw.year);
  const purchaseDate = String(raw.purchaseDate || '');
  const purchaseKm = parseKm(raw.purchaseKm);
  const currentKm = needCurrentKm ? parseKm(raw.currentKm) : null;
  const maxYear = Number(today.slice(0, 4)) + 1;

  if (!make || !model) return { error: 'Укажи марку и модель' };
  if (!Number.isInteger(year) || year < MIN_CAR_YEAR || year > maxYear) return { error: 'Проверь год выпуска' };
  if (vin && !isValidVin(vin)) return { error: 'VIN — это 17 латинских букв и цифр (без I, O, Q)' };
  if (!purchaseDate) return { error: 'Укажи дату покупки' };
  if (purchaseDate > today) return { error: 'Дата покупки не может быть в будущем' };
  if (purchaseKm == null) return { error: 'Укажи пробег при покупке цифрами' };
  if (needCurrentKm) {
    if (currentKm == null) return { error: 'Укажи пробег сейчас — он на приборке' };
    if (currentKm < purchaseKm) return { error: 'Пробег сейчас меньше, чем при покупке — проверь цифры' };
  }
  return { car: { make, model, year, engine, vin, purchaseDate, purchaseKm }, currentKm };
}

// Подсказка талисмана на главном экране — самое важное из того, что стоит сделать.
// lastBackupAt — последний файл-бекап или последняя синхронизация с Google Таблицей (что позже).
// Возвращает { text, mood }: mood — настроение талисмана (wink — совет, calm — всё хорошо).
export function pickTip({ latest, lastBackupAt, today }) {
  if (!lastBackupAt) {
    return { text: 'Подключи Google Таблицу в разделе «Ещё» — так твои записи точно не потеряются', mood: 'wink' };
  }
  const sinceExport = daysBetween(todayIso(new Date(lastBackupAt)), today);
  if (sinceExport > TIP_EXPORT_DAYS) {
    return { text: `Последний бекап был ${sinceExport} ${plural(sinceExport, DAYS)} назад — пора обновить`, mood: 'wink' };
  }
  if (latest) {
    const sinceKm = daysBetween(latest.date, today);
    if (sinceKm > TIP_KM_DAYS) {
      return { text: `Обнови пробег — последний раз ${sinceKm} ${plural(sinceKm, DAYS)} назад`, mood: 'wink' };
    }
  }
  return { text: 'Всё записано. Хорошей дороги!', mood: 'calm' };
}

export function buildBackup(data, nowIso) {
  return { app: APP_ID, version: BACKUP_VERSION, exportedAt: nowIso, data };
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== APP_ID) return { error: 'Это не файл-бекап Malibu Assistant' };
  if (!Number.isInteger(obj.version) || obj.version > BACKUP_VERSION) {
    return { error: 'Бекап сделан в более новой версии приложения — сначала обнови приложение' };
  }
  if (!obj.data || typeof obj.data !== 'object') return { error: 'В файле нет данных' };
  for (const store of BACKUP_STORES) {
    const list = obj.data[store];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.some((r) => !r || typeof r.id !== 'string')) {
      return { error: `Файл повреждён (раздел «${store}»)` };
    }
  }
  return { ok: true };
}

// Код подключения к Google Таблице: адрес веб-приложения Apps Script с ключом, одна строка.
export function parseSyncCode(value) {
  const code = String(value || '').trim();
  if (!code) return { error: 'Вставь код подключения' };
  if (!code.startsWith(SYNC_CODE_PREFIX) || !/\/exec\?k=[A-Za-z0-9]{16,}$/.test(code)) {
    return { error: 'Это не похоже на код подключения — он начинается с https://script.google.com/macros/s/' };
  }
  return { url: code };
}

// Что отправить в Google Таблицу: всё, что менялось после прошлой синхронизации.
export function recordsToPush(local, sinceIso) {
  const since = sinceIso || '';
  const out = [];
  for (const store of BACKUP_STORES) {
    for (const record of local[store] || []) {
      if ((record.updatedAt || '') > since) out.push({ store, record });
    }
  }
  return out;
}

// Слияние бекапа с тем, что уже есть. Ничего не удаляет: новые записи добавляются,
// существующие заменяются, только если в бекапе версия новее (по updatedAt).
export function planMerge(local, incoming) {
  const toWrite = {};
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const store of BACKUP_STORES) {
    const byId = new Map((local[store] || []).map((r) => [r.id, r]));
    toWrite[store] = [];
    for (const rec of incoming[store] || []) {
      const cur = byId.get(rec.id);
      if (!cur) {
        toWrite[store].push(rec);
        added++;
      } else if ((rec.updatedAt || '') > (cur.updatedAt || '')) {
        toWrite[store].push(rec);
        updated++;
      } else {
        unchanged++;
      }
    }
  }
  return { toWrite, added, updated, unchanged };
}
