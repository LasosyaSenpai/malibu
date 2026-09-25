// Чистая логика раздела «Обслуживание»: статусы узлов по регламенту, суммы работ.
// Без браузера и хранилища — проверяется в tests/logic.test.js.

import { CATEGORIES, CHECK_FRESH_MONTHS, NODE_WARN_SHARE, TIRE_SEASONS } from './config.js';
import { daysBetween, formatDate, formatKm } from './logic.js';

const DAYS_IN_MONTH = 30.44;
const ROUND_KM = 100;
const TIRE_REMIND_DAYS = 45;

export function addMonths(iso, months) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay));
  return date.toISOString().slice(0, 10);
}

const monthYear = (iso) => formatDate(iso).slice(3);

// «1 606», «2434,02», «» → число; мусор → null. Пусто = 0 (сумма не указана).
export function parseMoney(value) {
  const clean = String(value ?? '').replace(/[\s ]|грн/g, '').replace(',', '.');
  if (!clean) return 0;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

export function formatMoney(n) {
  return `${formatKm(Math.round(n))} грн`;
}

// Название работы: своё или первой строки.
export function workTitle(work) {
  const lines = work.lines || [];
  if (work.title) return work.title;
  if (!lines.length) return 'Работа';
  return lines.length === 1 ? lines[0].title : `${lines[0].title} и ещё ${lines.length - 1}`;
}

// Проверка формы «Работа». Возвращает { error } или { work } (поля шапки + одна строка).
export function validateWorkInput(raw, today) {
  const title = String(raw.title || '').trim();
  if (!title) return { error: 'Напиши, что сделали' };
  if (!raw.date) return { error: 'Укажи дату' };
  if (raw.date > today) return { error: 'Дата не может быть в будущем' };
  const kmText = String(raw.km || '').trim();
  const km = kmText ? parseKmLoose(kmText) : null;
  if (kmText && km == null) return { error: 'Пробег — только цифры' };
  const labor = parseMoney(raw.labor);
  const parts = parseMoney(raw.parts);
  if (labor == null || parts == null) return { error: 'Суммы — только цифры' };
  return { title, date: raw.date, km, labor, parts };
}

function parseKmLoose(text) {
  const clean = text.replace(/[\s ]|км/g, '');
  return /^\d{1,7}$/.test(clean) ? Number(clean) : null;
}

// Работа = визит (дата, пробег, СТО) + строки. Строка: { title, category, labor, parts, nodes[], action, season }.
export function workTotal(work) {
  let labor = 0;
  let parts = 0;
  for (const line of work.lines || []) {
    labor += Number(line.labor) || 0;
    parts += Number(line.parts) || 0;
  }
  return { labor, parts, total: labor + parts };
}

// Суммы по категориям, от большей к меньшей.
export function categoryTotals(works) {
  const sums = new Map();
  for (const w of works) {
    for (const line of w.lines || []) {
      const sum = (Number(line.labor) || 0) + (Number(line.parts) || 0);
      if (sum) sums.set(line.category, (sums.get(line.category) || 0) + sum);
    }
  }
  return [...sums.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total);
}

// Категории одной работы (без повторов) — для метки в истории.
export function workCategories(work) {
  return [...new Set((work.lines || []).map((l) => l.category))];
}

export function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

// События по узлам из всех работ: { nodeKey: [{ action, date, km, season, workId }] }, новые первыми.
export function nodeEvents(works) {
  const out = {};
  for (const w of works) {
    for (const line of w.lines || []) {
      for (const key of line.nodes || []) {
        (out[key] = out[key] || []).push({
          action: line.action || 'replace', date: w.date, km: w.km ?? null, season: line.season || null, workId: w.id,
        });
      }
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

function levelFor(used) {
  if (used >= 1) return 'bad';
  if (used >= NODE_WARN_SHARE) return 'wa';
  return 'ok';
}

// Статус узла. level: ok | wa (скоро / нет данных) | bad (пора). progress — доля израсходованного (0..1) или null.
export function nodeStatus(node, events, currentKm, today) {
  if (node.kind === 'season') return tireStatus(events, today);
  const list = events || [];
  const resets = node.kind === 'check' ? list : list.filter((e) => e.action === 'replace');
  const last = resets[0] || null;
  const lastCheck = list.find((e) => e.action === 'check') || null;

  if (!last) {
    if (lastCheck && daysBetween(lastCheck.date, today) <= CHECK_FRESH_MONTHS * DAYS_IN_MONTH) {
      return { level: 'ok', label: `проверено ${formatDate(lastCheck.date)}`, progress: null, last: null, lastCheck };
    }
    return { level: 'wa', label: node.kind === 'check' ? 'проверить' : 'нет данных', progress: null, last: null, lastCheck };
  }

  let kmShare = null;
  let nextKm = null;
  if (node.km && last.km != null && currentKm != null) {
    nextKm = last.km + node.km;
    kmShare = (currentKm - last.km) / node.km;
  }
  let timeShare = null;
  let nextDate = null;
  if (node.months) {
    nextDate = addMonths(last.date, node.months);
    timeShare = daysBetween(last.date, today) / daysBetween(last.date, nextDate);
  }
  const byKm = kmShare != null && (timeShare == null || kmShare >= timeShare);
  const used = Math.max(kmShare ?? 0, timeShare ?? 0);
  const level = levelFor(used);

  let label;
  if (byKm) {
    const left = Math.round((nextKm - currentKm) / ROUND_KM) * ROUND_KM;
    label = left > 0 ? `через ~${formatKm(left)} км` : `пора (${formatKm(-left)} км сверху)`;
  } else if (nextDate) {
    label = level === 'bad' ? `пора (с ${monthYear(nextDate)})` : `до ${monthYear(nextDate)}`;
  } else {
    label = 'в порядке';
  }
  if (node.kind === 'check' && level === 'ok') label = `проверено ${formatDate(last.date)}`;
  return { level, label, progress: Math.min(1, Math.max(0, used)), nextKm, nextDate, last, lastCheck };
}

// Какой сезон шин сейчас «должен стоять» и когда следующая переобувка.
function seasonWindows(today) {
  const year = Number(today.slice(0, 4));
  const list = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const s of TIRE_SEASONS) list.push({ ...s, fromDate: `${y}-${s.from}`, dueDate: `${y}-${s.due}` });
  }
  return list.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

export function tireStatus(events, today) {
  const windows = seasonWindows(today);
  const current = [...windows].reverse().find((w) => w.fromDate <= today);
  const next = windows.find((w) => w.fromDate > today);
  const lastChange = (events || [])[0] || null;
  const done = lastChange && lastChange.date >= current.fromDate;
  // Нет записей — напоминаем в окне переобувки (45 дней), потом считаем, что переобулась.
  if (done || !lastChange) {
    const needNow = !lastChange && daysBetween(current.fromDate, today) <= TIRE_REMIND_DAYS;
    if (needNow) {
      const level = today > current.dueDate ? 'bad' : 'wa';
      return { level, label: `пора на ${current.label} (до ${formatDate(current.dueDate).slice(0, 5)})`, progress: null, season: current };
    }
    return { level: 'ok', label: `на ${next.label} — с ${formatDate(next.fromDate).slice(0, 5)}`, progress: null, season: next };
  }
  const level = today > current.dueDate ? 'bad' : 'wa';
  return { level, label: `пора на ${current.label} (до ${formatDate(current.dueDate).slice(0, 5)})`, progress: null, season: current };
}

// Всё, что «скоро пора»: узлы wa/bad + срочные планы. Сначала срочное.
export function soonItems(statuses, plans) {
  const rank = { bad: 0, wa: 1 };
  const items = statuses
    .filter((s) => s.status.level !== 'ok')
    .map((s) => ({ kind: 'node', key: s.node.key, title: s.node.title, level: s.status.level, label: s.status.label }));
  for (const p of plans) {
    if (!p.done && p.urgent) items.push({ kind: 'plan', key: p.id, title: p.title, level: 'bad', label: p.due || 'срочно' });
  }
  return items.sort((a, b) => rank[a.level] - rank[b.level]);
}
