// Чистая логика «сервисной книжки» (решение 26.09: строгий PDF для покупателя / СТО).
// Готовит строки и итоги, рисует PDF — pdf.js. Проверяется в tests/logic.test.js.

import { NODES } from './config.js';
import { formatDate, formatKm, plural } from './logic.js';
import { categoryOf, formatMoney, nodeEvents, workTotal } from './maintenance.js';

const VISITS = ['визит', 'визита', 'визитов'];
const CHECK_LABEL = 'проверка';

// opts: { sums, vin, notes, shop } — что показывать (выключается перед сохранением).
export function serviceBookData({ car, works, currentKm, today }, opts) {
  const list = [...works].sort((a, b) => a.date.localeCompare(b.date) || (a.km || 0) - (b.km || 0));
  const total = list.reduce((s, w) => s + workTotal(w).total, 0);
  const rows = list.map((w) => {
    const lines = w.lines || [];
    const what = lines.length === 1
      ? [lineTitle(lines[0])]
      : [...(w.title ? [w.title] : []), ...lines.map((l) => `• ${lineTitle(l)}`)];
    if (opts.notes && w.note) what.push(`Заметка: ${w.note}`);
    const cats = [...new Set(lines.map((l) => categoryOf(l.category).label))].join(' · ');
    return {
      date: formatDate(w.date),
      km: w.km != null ? formatKm(w.km) : '—',
      what: what.join('\n'),
      cats: [cats, opts.shop && w.shop ? w.shop : ''].filter(Boolean).join('\n'),
      sum: formatKm(workTotal(w).total),
    };
  });
  const events = nodeEvents(works);
  const last = NODES.map((node) => {
    const ev = (events[node.key] || []).find((e) => node.kind !== 'replace' || e.action !== 'check') || (events[node.key] || [])[0];
    if (!ev) return null;
    const when = [formatDate(ev.date), ev.km != null ? `${formatKm(ev.km)} км` : ''].filter(Boolean).join(' · ');
    return [node.title, `${when}${ev.action === 'check' ? ` (${CHECK_LABEL})` : ''}`];
  }).filter(Boolean);
  const n = list.length;
  return {
    title: 'Сервисная история',
    subtitle: [`${car.make} ${car.model} ${car.year}`, car.engine, opts.vin && car.vin ? `VIN ${car.vin}` : ''].filter(Boolean).join(' · '),
    facts: [
      ['Пробег сейчас', `${formatKm(currentKm)} км`],
      ['Владею с', `${formatDate(car.purchaseDate)} (${formatKm(car.purchaseKm)} км)`],
      ['Записей', `${n} ${plural(n, VISITS)}${opts.sums ? ` · ${formatMoney(total)}` : ''}`],
    ],
    rows,
    total: formatKm(total),
    last,
    footer: `Сформировано в Malibu Assistant · ${formatDate(today)}`,
    fileName: `malibu-service-history-${today}.pdf`,
  };
}

function lineTitle(line) {
  return line.action === 'check' && !/провер/i.test(line.title) ? `${line.title} (${CHECK_LABEL})` : line.title;
}
