// Чистая логика «Документы и сроки» (решение 27.09): автоцивилка, аптечка, огнетушитель, права, своё.
// Напоминаем в «Скоро пора» и в Telegram за remindDays дней (по умолчанию 14). Проверяется в tests/logic.test.js.

import { DOC_KINDS, DOC_REMIND_DAYS, DOC_URGENT_DAYS } from './config.js';
import { daysBetween, formatDate, plural } from './logic.js';

const DAYS = ['день', 'дня', 'дней'];
const MONTH_DAYS = 30;
const SHOW_MONTHS_FROM = 60;

export const docKind = (key) => DOC_KINDS.find((k) => k.key === key) || DOC_KINDS[DOC_KINDS.length - 1];

// Статус срока: { level: ok | wa | bad, label, short, days }.
export function docStatus(doc, today) {
  const days = daysBetween(today, doc.until);
  const remind = doc.remindDays || DOC_REMIND_DAYS;
  const short = `до ${formatDate(doc.until).slice(0, 5)}`;
  if (days < 0) return { level: 'bad', label: `просрочено ${-days} ${plural(-days, DAYS)}`, short: 'просрочено', days };
  if (days === 0) return { level: 'bad', label: 'сегодня последний день', short: 'сегодня', days };
  if (days <= remind) {
    return { level: days <= DOC_URGENT_DAYS ? 'bad' : 'wa', label: `осталось ${days} ${plural(days, DAYS)}`, short, days };
  }
  const label = days >= SHOW_MONTHS_FROM ? `через ${Math.round(days / MONTH_DAYS)} мес.` : `через ${days} ${plural(days, DAYS)}`;
  return { level: 'ok', label, short, days };
}

// Сроки, которые подходят: для «Скоро пора» (как узлы регламента).
export function docSoon(docs, today) {
  return docs.map((d) => ({ d, st: docStatus(d, today) }))
    .filter(({ st }) => st.level !== 'ok')
    .map(({ d, st }) => ({ kind: 'doc', key: d.id, title: d.title, level: st.level, label: st.short }));
}

// Подсказка акулёнка на главной — про самый близкий срок, если он подходит.
export function docTip(docs, today) {
  const soon = docs.map((d) => ({ d, st: docStatus(d, today) })).filter(({ st }) => st.level !== 'ok')
    .sort((a, b) => a.st.days - b.st.days)[0];
  if (!soon) return null;
  const { d, st } = soon;
  if (st.days < 0) return `${d.title}: срок закончился ${formatDate(d.until)} — продли и отметь «Продлено»`;
  if (st.days === 0) return `${d.title}: сегодня последний день!`;
  return `${d.title} заканчивается через ${st.days} ${plural(st.days, DAYS)} — продли заранее`;
}

// Проверка формы. Возвращает { error } или { doc }.
export function validateDocInput(raw, today) {
  const kind = docKind(raw.kind);
  if (!DOC_KINDS.some((k) => k.key === raw.kind)) return { error: 'Выбери, что это' };
  const title = kind.key === 'other' ? String(raw.title || '').trim() : kind.label;
  if (!title) return { error: 'Напиши, что это за срок' };
  if (!raw.until) return { error: 'Укажи, до какого числа действует' };
  const remindDays = Number(raw.remindDays) || DOC_REMIND_DAYS;
  return { doc: { kind: kind.key, title, until: raw.until, remindDays, note: String(raw.note || '').trim() } };
}

// Продление: старая дата уходит в историю.
export function renewDoc(existing, doc, today) {
  if (!existing || existing.until === doc.until) return { ...existing, ...doc };
  return { ...existing, ...doc, history: [...(existing.history || []), { until: existing.until, changedAt: today }] };
}
