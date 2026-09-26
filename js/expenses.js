// Раздел «Расходы»: экраны и действия. Расчёты — в costs.js.
// Вкладки: Обзор (кольцо по категориям) · Заправки · Все расходы. Решения 26.09 — docs/DECISIONS.md.

import * as db from './db.js';
import * as L from './logic.js';
import * as C from './costs.js';
import { formatMoney } from './maintenance.js';
import {
  EXPENSE_CATEGORIES, FUEL_STATIONS, FUEL_TYPE_DEFAULT, FUEL_TYPES, MONTHS, MONTHS_IN,
} from './config.js';
import { icon } from './icons.js';
import { celebrate, clearSheet, confirmTwice, esc, mascot, openSheet, sheet, showFormError, toast } from './ui.js';

const TABS = [['overview', 'Обзор'], ['fuel', 'Заправки'], ['all', 'Все расходы']];
const RING_COLORS = ['#1B2345', '#7C5CD6', '#A993EA', '#D3C8F5', '#E6E1F5'];
const RING_R = 52;
const OTHER_STATION = 'Другая';
// После покупок акулёнок гордый (решение 26.09).
const PROUD_CATEGORIES = ['accessories', 'care'];

// ctx: { state, currentKm(), afterChange() } — связь с app.js.
export function createExpenses(ctx) {
  const { state } = ctx;
  const today = () => L.todayIso();
  const items = () => C.costItems(state);
  const sortedFuel = () => [...state.fuel].sort((a, b) => b.date.localeCompare(a.date) || (b.km || 0) - (a.km || 0));

  // ---------- Кусочки ----------

  const chips = (active) => `<h1>Расходы</h1>
    <nav class="chips">${TABS.map(([id, label]) => `<a href="#/expenses/${id}" class="${id === active ? 'on' : ''}">${label}</a>`).join('')}</nav>`;
  const money = (n) => formatMoney(n).replace(' грн', '');
  const addButtons = () => `<div class="row">
    <button class="btn primary small" data-action="newFuel">${icon('fuel')} Заправка</button>
    <button class="btn outline small" data-action="newExpense">${icon('plus')} Расход</button></div>`;

  // Кольцо: самые крупные категории + «остальное».
  function ringParts(totals) {
    if (totals.length <= RING_COLORS.length) return totals;
    const top = totals.slice(0, RING_COLORS.length - 1);
    const rest = totals.slice(RING_COLORS.length - 1).reduce((s, c) => s + c.total, 0);
    return [...top, { key: 'rest', total: rest, label: 'Остальное' }];
  }

  function ring(parts, total, caption) {
    const len = 2 * Math.PI * RING_R;
    let offset = 0;
    const arcs = total ? parts.map((p, i) => {
      const part = (len * p.total) / total;
      const gap = parts.length > 1 ? 1.5 : 0;
      const arc = `<circle cx="70" cy="70" r="${RING_R}" fill="none" stroke="${RING_COLORS[i]}" stroke-width="18"
        stroke-dasharray="${Math.max(part - gap, 0.5)} ${len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
      offset += part;
      return arc;
    }).join('') : `<circle cx="70" cy="70" r="${RING_R}" fill="none" stroke="#EEEAF8" stroke-width="18"/>`;
    return `<svg class="ring" viewBox="0 0 140 140" aria-hidden="true">${arcs}
      <text x="70" y="64" text-anchor="middle" class="ring-cap">${esc(caption)}</text>
      <text x="70" y="84" text-anchor="middle" class="ring-sum">${money(total)}</text></svg>`;
  }

  const partLabel = (p) => p.label || C.costCategory(p.key).label;
  // «Топливо» → «топливо», но «ТО и ремонт» остаётся как есть.
  const lower = (s) => (/^[А-ЯЁA-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));

  // Метка расхода у заправки.
  function consTag(info) {
    if (!info || info.kind === 'partial') return '<span class="cons part">не до полного</span>';
    if (info.kind === 'start') return '<span class="cons part">точка отсчёта</span>';
    const s = info.segment;
    const v = `${C.formatDecimal(s.l100)} л/100`;
    if (s.odd === 'low') return `<span class="cons odd">${v} — пропущена заправка?</span>`;
    if (s.odd === 'high') return `<span class="cons odd">${v} — бак был не полный?</span>`;
    return `<span class="cons">${v}</span>`;
  }

  // ---------- Экраны ----------

  function overview(param) {
    const now = C.monthKey(today());
    const month = /^\d{4}-\d{2}$/.test(param || '') && param <= now ? param : now;
    const first = C.monthKey(state.car.purchaseDate || today());
    const list = items().filter((i) => C.monthKey(i.date) === month);
    const totals = C.totalsByCategory(list);
    const total = totals.reduce((s, c) => s + c.total, 0);
    const parts = ringParts(totals);
    const km = C.kmInMonth([...state.readings, ...state.fuel], month);
    const { avgL100 } = C.fuelSegments(state.fuel);
    const monthIn = MONTHS_IN[Number(month.slice(5)) - 1];
    const top = totals[0];
    const bubble = top
      ? `Больше всего в ${monthIn} ушло на ${lower(partLabel(top))} — ${Math.round((top.total / total) * 100)}%`
      : `В ${monthIn} расходов пока нет. Заправилась? Нажми «Заправка»`;
    const prev = month > first ? `<a class="icon-btn" href="#/expenses/overview/${C.shiftMonth(month, -1)}" aria-label="Прошлый месяц">${icon('back')}</a>` : '<span class="icon-btn off">' + icon('back') + '</span>';
    const next = month < now ? `<a class="icon-btn flip" href="#/expenses/overview/${C.shiftMonth(month, 1)}" aria-label="Следующий месяц">${icon('back')}</a>` : `<span class="icon-btn flip off">${icon('back')}</span>`;
    return `${chips('overview')}
      <div class="month-nav">${prev}<b>${C.monthTitle(month)}</b>${next}</div>
      <section class="card ring-card">${ring(parts, total, MONTHS[Number(month.slice(5)) - 1].toLowerCase())}
        <div class="grow">${parts.map((p, i) => `<div class="row-between ring-row"><span class="ring-lbl"><i style="background:${RING_COLORS[i]}"></i>${esc(partLabel(p))}</span>
          <b>${money(p.total)}</b></div>`).join('') || '<p class="muted">Пусто</p>'}</div></section>
      <section class="card lines">
        <div class="row-between line"><span>Средний расход</span><b>${avgL100 ? `${C.formatDecimal(avgL100)} л/100 км` : '<span class="muted">после 2 полных баков</span>'}</b></div>
        <div class="row-between line"><span>1 км обходится</span><b>${km && total ? `${C.formatDecimal(total / km, 2)} грн` : '—'}</b></div>
        <div class="row-between line"><span>Проехала за месяц</span><b>${km ? `~${L.formatKm(km)} км` : '—'}</b></div>
      </section>
      <div class="hello">${mascot('', 'lick')}<div class="bubble">${esc(bubble)}</div></div>
      ${addButtons()}`;
  }

  function fuelView() {
    const fills = sortedFuel();
    const { byFill, avgL100 } = C.fuelSegments(state.fuel);
    const price = C.avgPrice(state.fuel);
    if (!fills.length) {
      return `${chips('fuel')}
        <div class="hello">${mascot('', 'curious')}<div class="bubble">Заправок пока нет. Записывай каждую — после двух полных баков посчитаю расход</div></div>
        <button class="btn primary" data-action="newFuel">${icon('fuel')} Заправка</button>`;
    }
    return `${chips('fuel')}
      <section class="card row-between">
        <div><div class="muted">Средний расход</div><b class="big">${avgL100 ? `${C.formatDecimal(avgL100)} л/100 км` : '—'}</b></div>
        <div class="right"><div class="muted">Средняя цена</div><b>${price ? `${C.formatDecimal(price, 2)} грн/л` : '—'}</b></div></section>
      <button class="btn primary small" data-action="newFuel">${icon('fuel')} Заправка</button>
      ${fills.map((f) => `<button class="card plain-btn fill" data-action="editFuel" data-id="${esc(f.id)}">
        <div class="row-between"><span class="node-head"><span class="ic-box">${icon('fuel')}</span>
          <span><b>${esc(f.station)}</b> · ${C.formatDecimal(f.liters, f.liters % 1 ? 1 : 0)} л
          <div class="muted">${L.formatDate(f.date).slice(0, 5)} · ${L.formatKm(f.km)} км</div></span></span>
          <b class="money">${money(f.sum)}</b></div>
        <div class="row-between fill-foot"><span class="muted">${esc(f.fuelType || '')}</span>${consTag(byFill.get(f.id))}</div></button>`).join('')}
      <p class="muted">Расход считается от полного бака до полного. Неполные заправки прибавляются к следующему полному баку.</p>`;
  }

  function allView(cat) {
    const all = items();
    const present = C.totalsByCategory(all).map((c) => c.key);
    const list = cat ? all.filter((i) => i.category === cat) : all;
    const months = [];
    for (const it of list) {
      const key = C.monthKey(it.date);
      if (!months.length || months[months.length - 1].key !== key) months.push({ key, items: [] });
      months[months.length - 1].items.push(it);
    }
    const filter = `<nav class="chips small">${[['', 'Все'], ...present.map((k) => [k, C.costCategory(k).label])]
      .map(([k, label]) => `<a href="#/expenses/all${k ? `/${k}` : ''}" class="${(cat || '') === k ? 'on' : ''}">${esc(label)}</a>`).join('')}</nav>`;
    const row = (it) => {
      const c = C.costCategory(it.category);
      const sub = [L.formatDate(it.date).slice(0, 5),
        it.kind === 'work' ? 'из ТО' : it.kind === 'fuel' ? `${C.formatDecimal(it.liters, it.liters % 1 ? 1 : 0)} л` : ''].filter(Boolean).join(' · ');
      const inner = `<span class="ic-box">${icon(c.icon)}</span><span class="grow"><b>${esc(it.title)}</b><div class="muted">${sub}</div></span><b class="money">${money(it.sum)}</b>`;
      if (it.kind === 'work') return `<a class="line" href="#/service/work/${esc(it.id)}">${inner}</a>`;
      return `<button class="line plain-btn" data-action="${it.kind === 'fuel' ? 'editFuel' : 'editExpense'}" data-id="${esc(it.id)}">${inner}</button>`;
    };
    return `${chips('all')}${filter}
      <button class="btn outline small" data-action="newExpense">${icon('plus')} Расход (мойка, парковка, покупки…)</button>
      ${months.map((m) => `<div class="sec">${C.monthTitle(m.key)} · ${formatMoney(m.items.reduce((s, i) => s + i.sum, 0))}</div>
        <section class="card lines">${m.items.map(row).join('')}</section>`).join('') || '<p class="muted">Пока пусто.</p>'}
      <p class="muted">Работы на СТО попадают сюда сами из «Обслуживания».</p>`;
  }

  function view(sub) {
    const [tab, param] = (sub || '').split('/');
    if (tab === 'fuel') return fuelView();
    if (tab === 'all') return allView(param);
    return overview(param);
  }

  // ---------- Формы ----------

  // Кнопки-выбор (АЗС, категория): значение хранится в скрытом поле.
  const picker = (id, options, value) => `<div class="pick" data-for="${id}">${options.map(([v, label]) => `<button type="button"
      class="pick-btn ${v === value ? 'on' : ''}" data-action="pick" data-value="${esc(v)}">${label}</button>`).join('')}</div>
    <input type="hidden" id="${id}" value="${esc(value || '')}">`;

  // АЗС: стандартный список + свои названия из прошлых заправок.
  function stationOptions() {
    const own = [];
    for (const f of sortedFuel()) {
      if (f.station && !FUEL_STATIONS.includes(f.station) && !own.includes(f.station)) own.push(f.station);
    }
    return [...FUEL_STATIONS, ...own];
  }

  // Заправка перед этой (для новой — самая последняя).
  const prevFill = (f) => sortedFuel().find((x) => x.id !== f.id && (!f.date || x.date <= f.date)) || null;

  function priceHint(liters, sum) {
    const last = prevFill(state.editingFuel || {});
    const now = liters && sum ? `= ${C.formatDecimal(sum / liters, 2)} грн/л` : 'цена за литр посчитается сама';
    return `${now}${last ? ` · в прошлый раз ${C.formatDecimal(last.price || last.sum / last.liters, 2)}` : ''}`;
  }

  function fuelForm(f) {
    const last = prevFill(f);
    const stations = stationOptions();
    const station = f.station || (last && last.station) || '';
    const known = !station || stations.includes(station);
    const fuelType = f.fuelType || (last && last.fuelType) || FUEL_TYPE_DEFAULT;
    const km = f.km != null ? f.km : ctx.currentKm();
    const amount = (n) => (n ? C.formatDecimal(n, n % 1 ? 2 : 0) : '');
    return sheet('Заправка', `
      <div class="field"><span>АЗС</span>${picker('fu-station', [...stations.map((s) => [s, esc(s)]), [OTHER_STATION, OTHER_STATION]], known ? station : OTHER_STATION)}</div>
      <label class="field ${known ? 'hidden' : ''}" id="fu-other-wrap"><span>Название АЗС</span><input id="fu-other" value="${known ? '' : esc(station)}" placeholder="например, Shell"></label>
      <div class="row">
        <label class="field hl big-input"><span>Литры</span><input id="fu-liters" inputmode="decimal" value="${amount(f.liters)}" placeholder="42"></label>
        <label class="field hl big-input"><span>Сумма, грн</span><input id="fu-sum" inputmode="decimal" value="${amount(f.sum)}" placeholder="2 436"></label>
      </div>
      <div class="muted" id="fu-price">${esc(priceHint(f.liters, f.sum))}</div>
      <label class="switch-row"><span><b>До полного бака</b><div class="muted">для расчёта расхода</div></span>
        <input type="checkbox" class="switch" id="fu-full" ${f.full === false ? '' : 'checked'}></label>
      <label class="field"><span>Пробег, км${last ? ` · прошлая заправка ${L.formatKm(last.km)}` : ''}</span>
        <input id="fu-km" inputmode="numeric" value="${km != null ? L.formatKm(km) : ''}"></label>
      <div class="row">
        <label class="field"><span>Дата</span><input id="fu-date" type="date" value="${esc(f.date || today())}"></label>
        <label class="field"><span>Топливо</span><select id="fu-type">${FUEL_TYPES.map((t) => `<option ${t === fuelType ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="error" id="fu-error" role="alert"></p>
      <button class="btn primary" id="fu-save" data-action="saveFuel" data-id="${esc(f.id || '')}">Сохранить</button>
      ${f.id ? `<button class="btn link danger" data-action="deleteFuel" data-id="${esc(f.id)}">Удалить заправку</button>` : ''}`);
  }

  function expenseForm(e) {
    const amount = e.sum ? C.formatDecimal(e.sum, e.sum % 1 ? 2 : 0) : '';
    return sheet(e.id ? 'Расход' : 'Новый расход', `
      <div class="field"><span>На что</span>${picker('ex-cat', EXPENSE_CATEGORIES.map((c) => [c.key, `${icon(c.icon)}${c.label}`]), e.category || '')}</div>
      <label class="field hl big-input"><span>Сумма, грн</span><input id="ex-sum" inputmode="decimal" value="${amount}" placeholder="350"></label>
      <label class="field"><span>Заметка <em>необязательно</em></span><input id="ex-note" value="${esc(e.note || '')}" placeholder="Мойка у дома"></label>
      <label class="field"><span>Дата</span><input id="ex-date" type="date" value="${esc(e.date || today())}"></label>
      <p class="error" id="ex-error" role="alert"></p>
      <button class="btn primary" data-action="saveExpense" data-id="${esc(e.id || '')}">Сохранить</button>
      ${e.id ? `<button class="btn link danger" data-action="deleteExpense" data-id="${esc(e.id)}">Удалить</button>` : ''}`);
  }

  const val = (id) => document.getElementById(id)?.value ?? '';
  const find = (list, id) => list.find((x) => x.id === id) || null;

  async function done(message, cel = null) {
    clearSheet();
    state.editingFuel = null;
    state.fuelWarnFor = null;
    if (cel) celebrate(cel.pose, cel.text);
    else toast(message);
    await ctx.afterChange();
  }

  // Пересчитать цену за литр, пока вводятся литры и сумма.
  function onInput(e) {
    if (e.target.id !== 'fu-liters' && e.target.id !== 'fu-sum') return;
    const el = document.getElementById('fu-price');
    if (el) el.textContent = priceHint(C.parseAmount(val('fu-liters')), C.parseAmount(val('fu-sum')));
  }

  // ---------- Действия ----------

  const actions = {
    newFuel() {
      state.editingFuel = null;
      state.fuelWarnFor = null;
      openSheet(fuelForm({}));
    },

    editFuel(el) {
      const f = find(state.fuel, el.dataset.id);
      if (!f) return;
      state.editingFuel = f;
      state.fuelWarnFor = null;
      openSheet(fuelForm(f));
    },

    pick(el) {
      const box = el.closest('.pick');
      box.querySelectorAll('.pick-btn').forEach((b) => b.classList.toggle('on', b === el));
      document.getElementById(box.dataset.for).value = el.dataset.value;
      if (box.dataset.for === 'fu-station') {
        const other = el.dataset.value === OTHER_STATION;
        document.getElementById('fu-other-wrap').classList.toggle('hidden', !other);
        if (other) document.getElementById('fu-other').focus();
      }
    },

    async saveFuel(el) {
      const picked = val('fu-station');
      const raw = {
        station: picked === OTHER_STATION ? val('fu-other') : picked,
        liters: val('fu-liters'), sum: val('fu-sum'), km: val('fu-km'), date: val('fu-date'),
        fuelType: val('fu-type'), full: document.getElementById('fu-full').checked,
      };
      const existing = find(state.fuel, el.dataset.id);
      const others = state.fuel.filter((f) => f.id !== el.dataset.id);
      const res = C.validateFuelInput(raw, today(), others);
      if (res.error) { showFormError('fu-error', res.error); return; }
      const key = JSON.stringify(res.fill);
      if (res.warn && state.fuelWarnFor !== key) {
        state.fuelWarnFor = key;
        showFormError('fu-error', res.warn, true);
        document.getElementById('fu-save').textContent = 'Да, всё верно';
        return;
      }
      const saved = await db.put('fuel', { ...(existing || {}), ...res.fill });
      // Пробег с заправки — тоже отметка одометра, если он больше последнего.
      if (res.fill.km > ctx.currentKm()) await db.put('odometer', { date: res.fill.date, km: res.fill.km, source: 'fuel' });
      if (existing) { await done('Заправка исправлена'); return; }
      const info = C.fuelSegments([...others, saved]).byFill.get(saved.id);
      const text = info && info.kind === 'segment' && !info.segment.odd
        ? `Ммм, вкусно! Расход — ${C.formatDecimal(info.segment.l100)} л/100 км`
        : 'Ммм, вкусно! Заправка записана';
      await done('', { pose: 'lick', text });
    },

    async deleteFuel(el) {
      if (!confirmTwice(el)) return;
      await db.put('fuel', { ...find(state.fuel, el.dataset.id), deleted: true });
      await done('Заправка удалена');
    },

    newExpense() { openSheet(expenseForm({})); },

    editExpense(el) {
      const e = find(state.expenses, el.dataset.id);
      if (e) openSheet(expenseForm(e));
    },

    async saveExpense(el) {
      const res = C.validateExpenseInput({
        category: val('ex-cat'), sum: val('ex-sum'), date: val('ex-date'), note: val('ex-note'),
      }, today());
      if (res.error) { showFormError('ex-error', res.error); return; }
      const existing = find(state.expenses, el.dataset.id);
      await db.put('expenses', { ...(existing || {}), ...res.expense });
      const proud = !existing && PROUD_CATEGORIES.includes(res.expense.category);
      await done(existing ? 'Исправлено' : 'Расход сохранён', proud ? { pose: 'proud', text: 'Обновка! Записала' } : null);
    },

    async deleteExpense(el) {
      if (!confirmTwice(el)) return;
      await db.put('expenses', { ...find(state.expenses, el.dataset.id), deleted: true });
      await done('Расход удалён');
    },
  };

  return { view, actions, onInput };
}
