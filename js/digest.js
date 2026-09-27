// «Сводка» для напоминаний в Telegram (решение 27.09): телефон считает, что подходит, и кладёт одну запись
// в Google Таблицу (раздел digest). Бекап-сервер (backend/Telegram.gs) в 12:00 пишет по ней в Telegram:
// сроки документов пересчитывает по дате сам, остальное берёт как есть. Чистая логика — tests/logic.test.js.

import { DIGEST_ID } from './config.js';

// statuses — узлы регламента со статусами (как в «Обслуживании»), plans — планы, docs — документы и сроки.
export function buildDigest({ statuses, plans, docs, km, avgL100, today }) {
  const items = [];
  for (const { node, status } of statuses) {
    // «Нет данных» (не записано, когда меняли) в Telegram не шлём — иначе будет каждую неделю одно и то же.
    const unknown = node.kind !== 'season' && !status.last && !status.lastCheck && status.level !== 'bad';
    // Масло — всегда (в сводке «через ~N км»), остальное — только если подходит.
    if (!unknown && (status.level !== 'ok' || node.key === 'oil')) {
      items.push({ key: `node:${node.key}`, kind: 'node', title: node.title, level: status.level, label: status.label });
    }
  }
  // Срочные планы — в сводку (без отдельного «срочного» сообщения).
  for (const p of plans) {
    if (!p.done && p.urgent) items.push({ key: `plan:${p.id}`, kind: 'plan', title: p.title, level: 'wa', label: p.due || 'в планах' });
  }
  for (const d of docs) {
    items.push({ key: `doc:${d.id}`, kind: 'doc', title: d.title, until: d.until, remindDays: d.remindDays });
  }
  return { id: DIGEST_ID, date: today, km, avgL100: avgL100 ? Math.round(avgL100 * 10) / 10 : null, items };
}

// Нужно ли перезаписать сводку (сравниваем без служебных полей).
export function digestChanged(prev, next) {
  if (!prev) return true;
  const strip = ({ id, createdAt, updatedAt, deleted, ...rest }) => rest;
  return JSON.stringify(strip(prev)) !== JSON.stringify(strip(next));
}
