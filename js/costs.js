// Чистая логика раздела «Расходы»: расход топлива «полный бак → полный бак», суммы по месяцам и категориям,
// проверки форм. Без браузера и хранилища — проверяется в tests/logic.test.js.

import {
  EXPENSE_CATEGORIES, FUEL_CATEGORY, FUEL_L100_MAX, FUEL_L100_MIN, FUEL_ODD_MIN_SEGMENTS, FUEL_ODD_SHARE,
  FUEL_PRICE_MAX, FUEL_PRICE_MIN, MONTH_KM_BASE_DAYS, MONTHS, SERVICE_CATEGORY, TANK_LITERS, TANK_SLACK_LITERS,
} from './config.js';
import { daysBetween, formatDate, formatKm, latestReading, parseKm } from './logic.js';
import { parseMoney, workTotal, workTitle } from './maintenance.js';

// «42,5» → 42.5 (до двух знаков после запятой). Пусто или мусор → null.
export function parseAmount(value) {
  const n = parseMoney(value);
  return n ? n : null;
}

// 8.43 → «8,4»; 58 → «58,00» (digits — знаков после запятой).
export function formatDecimal(n, digits = 1) {
  const [int, frac] = Number(n).toFixed(digits).split('.');
  return frac ? `${formatKm(Number(int))},${frac}` : formatKm(Number(int));
}

export const monthKey = (iso) => iso.slice(0, 7);

// «2026-09» → «Сентябрь 2026».
export function monthTitle(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Соседний месяц: shiftMonth('2026-01', -1) → '2025-12'.
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------- Расход топлива ----------

const byKm = (a, b) => a.km - b.km || a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '');

// Отрезки «полный бак → полный бак». Литры отрезка = все заправки после первого полного бака
// до следующего полного включительно (неполные досуммируются). До первого полного бака расход не известен.
// Возвращает { segments, byFill, avgL100 }:
//   segments — [{ from, to, liters, km, l100, odd: null | 'low' | 'high' }];
//   byFill — Map id → { kind: 'start' | 'partial' | 'segment', segment };
//   avgL100 — средний расход без подозрительных отрезков (или null).
export function fuelSegments(fills) {
  const sorted = fills.filter((f) => f.km != null && f.liters > 0).sort(byKm);
  const segments = [];
  const byFill = new Map();
  let start = null;
  let liters = 0;
  for (const f of sorted) {
    if (start) liters += f.liters;
    if (!f.full) {
      byFill.set(f.id, { kind: 'partial' });
      continue;
    }
    const km = start ? f.km - start.km : 0;
    if (start && km > 0) {
      const segment = { from: start, to: f, liters, km, l100: (liters / km) * 100, odd: null };
      segments.push(segment);
      byFill.set(f.id, { kind: 'segment', segment });
    } else {
      byFill.set(f.id, { kind: 'start' });
    }
    start = f;
    liters = 0;
  }
  markOdd(segments);
  const good = segments.filter((s) => !s.odd);
  const totalKm = good.reduce((s, x) => s + x.km, 0);
  const avgL100 = totalKm ? (good.reduce((s, x) => s + x.liters, 0) / totalKm) * 100 : null;
  return { segments, byFill, avgL100 };
}

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Подозрительный отрезок: вне разумных рамок или сильно отличается от обычного.
// Слишком мало — скорее всего, пропущена заправка; слишком много — бак в начале был не полный.
function markOdd(segments) {
  for (const s of segments) {
    if (s.l100 < FUEL_L100_MIN) s.odd = 'low';
    else if (s.l100 > FUEL_L100_MAX) s.odd = 'high';
  }
  const sane = segments.filter((s) => !s.odd);
  if (sane.length < FUEL_ODD_MIN_SEGMENTS) return;
  for (const s of sane) {
    // Обычный расход считаем по остальным отрезкам, чтобы странный не тянул медиану к себе.
    const others = sane.filter((x) => x !== s).map((x) => x.l100);
    const usual = median(others);
    if (s.l100 < usual * (1 - FUEL_ODD_SHARE)) s.odd = 'low';
    else if (s.l100 > usual * (1 + FUEL_ODD_SHARE)) s.odd = 'high';
  }
}

// Средняя цена литра по заправкам (сумма / литры) или null.
export function avgPrice(fills) {
  const liters = fills.reduce((s, f) => s + (f.liters || 0), 0);
  return liters ? fills.reduce((s, f) => s + (f.sum || 0), 0) / liters : null;
}

// Проверка формы «Заправка». others — остальные заправки (для проверки пробега по порядку дат).
// Возвращает { error } или { fill, warn? } — warn: переспросить перед сохранением.
export function validateFuelInput(raw, today, others) {
  const liters = parseAmount(raw.liters);
  const sum = parseAmount(raw.sum);
  if (liters == null) return { error: 'Сколько литров залила? Цифрами, например 42,5' };
  if (sum == null) return { error: 'Укажи сумму цифрами' };
  if (!raw.date) return { error: 'Укажи дату' };
  if (raw.date > today) return { error: 'Дата не может быть в будущем' };
  const km = parseKm(raw.km);
  if (km == null) return { error: 'Укажи пробег цифрами — по нему считается расход' };
  const station = String(raw.station || '').trim();
  if (!station) return { error: 'Выбери АЗС или напиши название' };
  const before = others.filter((f) => f.date < raw.date && f.km != null && f.km > km);
  if (before.length) {
    const f = before.reduce((a, b) => (b.km > a.km ? b : a));
    return { error: `Пробег меньше, чем на заправке ${formatDate(f.date)} (${formatKm(f.km)} км) — проверь цифры` };
  }
  const after = others.filter((f) => f.date > raw.date && f.km != null && f.km < km);
  if (after.length) {
    const f = after.reduce((a, b) => (b.km < a.km ? b : a));
    return { error: `Пробег больше, чем на заправке ${formatDate(f.date)} (${formatKm(f.km)} км) — проверь цифры` };
  }
  const price = sum / liters;
  const fill = {
    date: raw.date, km, liters, sum, price: Math.round(price * 100) / 100, station,
    fuelType: raw.fuelType || '', full: Boolean(raw.full),
  };
  if (liters > TANK_LITERS + TANK_SLACK_LITERS) {
    return { fill, warn: `В бак Malibu помещается ~${TANK_LITERS} л, а тут ${formatDecimal(liters, liters % 1 ? 1 : 0)} л. Всё верно?` };
  }
  if (price < FUEL_PRICE_MIN || price > FUEL_PRICE_MAX) {
    return { fill, warn: `Получается ${formatDecimal(price, 2)} грн за литр — может, перепутаны литры и сумма?` };
  }
  return { fill };
}

// Проверка формы «Расход».
export function validateExpenseInput(raw, today) {
  if (!EXPENSE_CATEGORIES.some((c) => c.key === raw.category)) return { error: 'Выбери, на что потратила' };
  const sum = parseAmount(raw.sum);
  if (sum == null) return { error: 'Укажи сумму цифрами' };
  if (!raw.date) return { error: 'Укажи дату' };
  if (raw.date > today) return { error: 'Дата не может быть в будущем' };
  return { expense: { category: raw.category, sum, date: raw.date, note: String(raw.note || '').trim() } };
}

// ---------- Все расходы вместе ----------

export function costCategory(key) {
  if (key === FUEL_CATEGORY.key) return FUEL_CATEGORY;
  if (key === SERVICE_CATEGORY.key) return SERVICE_CATEGORY;
  return EXPENSE_CATEGORIES.find((c) => c.key === key) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

// Заправки, расходы и работы на СТО — одним списком, новые первыми.
// Элемент: { kind: 'fuel' | 'expense' | 'work', id, date, category, title, sum }.
export function costItems({ fuel = [], expenses = [], works = [] }) {
  const items = [
    ...fuel.map((f) => ({ kind: 'fuel', id: f.id, date: f.date, category: FUEL_CATEGORY.key,
      title: `Заправка ${f.station || ''}`.trim(), sum: f.sum || 0, liters: f.liters })),
    ...expenses.map((e) => ({ kind: 'expense', id: e.id, date: e.date, category: e.category,
      title: e.note || costCategory(e.category).label, sum: e.sum || 0 })),
    ...works.map((w) => ({ kind: 'work', id: w.id, date: w.date, category: SERVICE_CATEGORY.key,
      title: workTitle(w), sum: workTotal(w).total })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.sum - a.sum);
}

// Суммы по категориям, от большей к меньшей: [{ key, total }].
export function totalsByCategory(items) {
  const sums = new Map();
  for (const it of items) if (it.sum) sums.set(it.category, (sums.get(it.category) || 0) + it.sum);
  return [...sums.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}

// Сколько проехала за месяц — по записям пробега (любым: вручную, из работ, из заправок).
// Начало — последняя запись до месяца, если она не старше MONTH_KM_BASE_DAYS дней до его начала
// (иначе туда попали бы километры прошлых месяцев), а так — первая запись в месяце. Нет данных — null.
export function kmInMonth(readings, key) {
  const start = `${key}-01`;
  const end = `${key}-31`;
  const inMonth = readings.filter((r) => r.km != null && r.date >= start && r.date <= end);
  if (!inMonth.length) return null;
  const before = latestReading(readings.filter((r) => r.km != null && r.date < start));
  const fresh = before && daysBetween(before.date, start) <= MONTH_KM_BASE_DAYS;
  const base = fresh ? before : inMonth.reduce((a, b) => (b.km < a.km ? b : a));
  const km = latestReading(inMonth).km - base.km;
  return km > 0 ? km : null;
}
