// Чистая логика домашней парковки: платим за каждые сутки, кроме ночей, когда машина не у дома.
// Решение 26.09 (docs/DECISIONS.md): календарь месяца (вариант А), по умолчанию все дни «дома»,
// кроме дней недели из настройки (у пользователя — суббота: в воскресенье к ночи обычно возвращается);
// любой день переключается нажатием.
// settings: { since, awayWeekdays: [0..6, 0 — воскресенье], rates: [{ from, rate }] };
// overrides: [{ date, home }] — дни, отмеченные вручную.

import { HOME_PARKING_CATEGORY } from './config.js';
import { parseMoney } from './maintenance.js';

const pad = (n) => String(n).padStart(2, '0');

// День недели: 0 — воскресенье, 6 — суббота.
export function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Дни недели «обычно не дома». Старая настройка weekendsAway (0.4.1) = суббота и воскресенье.
export function awayWeekdays(settings) {
  if (Array.isArray(settings.awayWeekdays)) return settings.awayWeekdays;
  return settings.weekendsAway ? [6, 0] : [];
}

// Цена суток на дату: последняя цена, действующая с этой даты или раньше.
export function rateOn(date, rates) {
  const sorted = [...(rates || [])].sort((a, b) => a.from.localeCompare(b.from));
  let rate = sorted.length ? sorted[0].rate : 0;
  for (const r of sorted) if (r.from <= date) rate = r.rate;
  return rate;
}

export const currentRate = (settings, today) => rateOn(today, settings.rates);

// Состояние дня: 'before' (до начала отсчёта), 'future', 'home' (платно), 'away' (не дома).
export function dayState(date, settings, overrides, today) {
  if (!settings || date < settings.since) return 'before';
  if (date > today) return 'future';
  const own = overrides.find((o) => o.date === date);
  if (own) return own.home ? 'home' : 'away';
  return defaultHome(date, settings) ? 'home' : 'away';
}

// Как день выглядел бы без ручной отметки.
export function defaultHome(date, settings) {
  return !awayWeekdays(settings).includes(weekday(date));
}

function daysOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${key}-${pad(i + 1)}`);
}

// Месяц для календаря и итога: { days: [{ date, state }], nights, away, sum, offset }.
// offset — сколько пустых клеток перед 1-м числом (неделя с понедельника).
export function parkingMonth(key, settings, overrides, today) {
  const days = daysOfMonth(key).map((date) => ({ date, state: dayState(date, settings, overrides, today) }));
  let nights = 0;
  let sum = 0;
  for (const d of days) {
    if (d.state !== 'home') continue;
    nights++;
    sum += rateOn(d.date, settings.rates);
  }
  const [y, m] = key.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  return { days, nights, away: days.filter((d) => d.state === 'away').length, sum, offset };
}

// Месяцы от начала отсчёта до сегодня: ['2026-09', '2026-10', …].
export function parkingMonths(settings, today) {
  if (!settings || settings.since > today) return [];
  const out = [];
  let [y, m] = settings.since.slice(0, 7).split('-').map(Number);
  const end = today.slice(0, 7);
  for (let key = `${y}-${pad(m)}`; key <= end; key = `${y}-${pad(m)}`) {
    out.push(key);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Итог месяца для «Расходов» — одной строкой на месяц.
export function parkingItems(settings, overrides, today) {
  return parkingMonths(settings, today).map((key) => {
    const month = parkingMonth(key, settings, overrides, today);
    const counted = month.days.filter((d) => d.state === 'home' || d.state === 'away');
    return { kind: 'parking', id: `parking-${key}`, date: counted[counted.length - 1].date, category: HOME_PARKING_CATEGORY.key,
      title: HOME_PARKING_CATEGORY.label, nights: month.nights, sum: month.sum };
  }).filter((it) => it.sum > 0);
}

// Проверка формы настройки. current — прежняя настройка (или null).
export function validateParkingInput(raw, current, today) {
  const rate = parseMoney(raw.rate);
  if (!rate) return { error: 'Укажи цену за сутки цифрами' };
  if (!raw.since) return { error: 'Укажи, с какого дня считать' };
  if (raw.since > today) return { error: 'Начало отсчёта не может быть в будущем' };
  let rates = current ? [...(current.rates || [])] : [];
  if (!rates.length) {
    rates = [{ from: raw.since, rate }];
  } else if (rate !== rateOn(today, rates)) {
    // Новая цена действует с указанной даты, старые дни не пересчитываются.
    const from = raw.rateFrom || today;
    if (from > today) return { error: 'Дата новой цены не может быть в будущем' };
    rates = [...rates.filter((r) => r.from !== from), { from, rate }].sort((a, b) => a.from.localeCompare(b.from));
  }
  const away = [...new Set((raw.awayWeekdays || []).map(Number))].filter((d) => d >= 0 && d <= 6).sort();
  return { settings: { since: raw.since, awayWeekdays: away, rates } };
}
