// Раздел «Обслуживание»: экраны и действия. Расчёты — в maintenance.js.
// Вкладки: Обзор · Узлы · История · Планы · Расходники (решение 26.09, docs/DECISIONS.md).

import * as db from './db.js';
import * as L from './logic.js';
import * as M from './maintenance.js';
import * as D from './docs.js';
import { CATEGORIES, NODES } from './config.js';
import { icon } from './icons.js';
import { celebrate, clearSheet, confirmTwice, esc, hint, openSheet, sheet, showFormError, toast } from './ui.js';
import { serviceBookData } from './servicebook.js';
import { preparePdf, serviceBookPdf } from './pdf.js';
import { saveFile } from './backup.js';

const TABS = [
  ['overview', 'Обзор'], ['nodes', 'Узлы'], ['history', 'История'], ['plans', 'Планы'], ['parts', 'Расходники'],
];
const CASES = ['дело', 'дела', 'дел'];
const WORKS = ['работа', 'работы', 'работ'];
const YEARS = ['год', 'года', 'лет'];
const SHARE_COLORS = [0, 1, 2, 3, 4].map((i) => `var(--ring-${i})`); // цвета темы, см. styles.css
const LEVEL_CLASS = { ok: 'lv-ok', wa: 'lv-wa', bad: 'lv-bad' };

// ctx: { state, currentKm(), afterChange() } — связь с app.js.
export function createService(ctx) {
  const { state } = ctx;
  const today = () => L.todayIso();
  // Срочные планы первыми.
  const openPlans = () => state.plans.filter((p) => !p.done)
    .sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  // Расходники — в порядке узлов регламента, остальные в конце.
  const nodeOrder = (key) => { const i = NODES.findIndex((n) => n.key === key); return i < 0 ? NODES.length : i; };
  const sortedParts = () => [...state.parts].sort((a, b) => nodeOrder(a.nodeKey) - nodeOrder(b.nodeKey));
  const sortedWorks = () => [...state.works].sort((a, b) => b.date.localeCompare(a.date) || (b.km || 0) - (a.km || 0));

  function statuses() {
    const events = M.nodeEvents(state.works);
    const km = ctx.currentKm();
    return NODES.map((node) => ({ node, status: M.nodeStatus(node, events[node.key], km, today()), events: events[node.key] || [] }));
  }

  // ---------- Кусочки ----------

  const catTag = (key) => {
    const c = M.categoryOf(key);
    return `<span class="cat">${icon(c.icon)}${esc(c.label)}</span>`;
  };
  const dotLine = (level, title, label, href) => `<a class="line" href="${href}">
    <span class="dot ${LEVEL_CLASS[level]}"></span><span class="grow">${esc(title)}</span>
    <span class="lv-text ${LEVEL_CLASS[level]}">${esc(label)}</span></a>`;
  const bar = (progress, level) => (progress == null ? ''
    : `<div class="bar"><i class="${LEVEL_CLASS[level]}" style="width:${Math.round(progress * 100)}%"></i></div>`);
  const kmDate = (date, km) => [L.formatDate(date), km != null ? `${L.formatKm(km)} км` : ''].filter(Boolean).join(' · ');
  const chips = (active) => `<h1>Обслуживание</h1>
    <nav class="chips">${TABS.map(([id, label]) => `<a href="#/service/${id}" class="${id === active ? 'on' : ''}">${label}</a>`).join('')}</nav>`;
  const nodeHref = (key) => `#/service/node/${key}`;
  const soonHref = (item) => {
    if (item.kind === 'node') return nodeHref(item.key);
    return item.kind === 'doc' ? '#/more' : '#/service/plans';
  };
  // «Скоро пора»: узлы, срочные планы и подходящие сроки документов (решение 27.09). Срочное — первым,
  // среди одинаковых — сначала документы (у них настоящая дата, в отличие от «нет данных»).
  const RANK = { bad: 0, wa: 1 };
  const order = (i) => RANK[i.level] * 2 + (i.kind === 'doc' ? 0 : 1);
  const soonAll = (st) => [...M.soonItems(st, state.plans), ...D.docSoon(state.docs, today())]
    .sort((a, b) => order(a) - order(b));

  // ---------- Экраны ----------

  function overview() {
    const st = statuses();
    const soon = soonAll(st);
    const oil = st.find((s) => s.node.key === 'oil');
    const plans = openPlans();
    const last = sortedWorks()[0];
    const bubble = soon.length
      ? `${soon.length} ${L.plural(soon.length, CASES)} ждут — многое можно сделать за один визит на СТО`
      : 'По регламенту всё в порядке. Хорошей дороги!';
    return `${chips('overview')}
      ${hint(bubble)}
      ${soon.length ? `<div class="sec">Скоро пора · ${soon.length}</div>
        <section class="card lines">${soon.map((i) => dotLine(i.level, i.title, i.label, soonHref(i))).join('')}</section>` : ''}
      <div class="sec">Ближайшая замена масла</div>
      <a class="card block" href="${nodeHref('oil')}"><div class="row-between"><b>${esc(oil.status.label)}</b>
        <span class="muted">${oil.status.nextDate ? `или до ${L.formatDate(oil.status.nextDate).slice(3)}` : ''}</span></div>
        ${bar(oil.status.progress, oil.status.level)}</a>
      <div class="sec">В планах · ${plans.length} <a href="#/service/plans">все →</a></div>
      <section class="card lines">${plans.slice(0, 3).map((p) => `<a class="line" href="#/service/plans">
        <span class="dot ${p.urgent ? 'lv-bad' : 'lv-plan'}"></span><span class="grow">${esc(p.title)}</span>
        <span class="muted">${p.estimate ? M.formatMoney(p.estimate) : ''}</span></a>`).join('') || '<p class="muted">Пока пусто</p>'}</section>
      ${last ? `<div class="sec">Последняя работа <a href="#/service/history">история →</a></div>
        <a class="card block row-between" href="#/service/work/${esc(last.id)}"><span>${L.formatDate(last.date).slice(0, 5)} · ${esc(M.workTitle(last))}</span>
        <b>${M.formatMoney(M.workTotal(last).total)}</b></a>` : ''}`;
  }

  function nodesView() {
    return `${chips('nodes')}
      ${statuses().map(({ node, status, events }) => {
    const lastEv = status.last || status.lastCheck || events[0];
    return `<a class="card node" href="${nodeHref(node.key)}">
        <div class="node-head"><span class="ic-box">${icon(node.icon)}</span>
          <div class="grow"><div class="row-between"><b>${esc(node.title)}</b>
            <span class="lv-text ${LEVEL_CLASS[status.level]}">${esc(status.label)}</span></div>
            <div class="muted">${lastEv ? kmDate(lastEv.date, lastEv.km) : 'нет записей'}</div></div></div>
        ${bar(status.progress, status.level)}</a>`;
  }).join('')}`;
  }

  function historyView() {
    const works = sortedWorks();
    const total = works.reduce((s, w) => s + M.workTotal(w).total, 0);
    const cats = M.categoryTotals(works);
    const top = cats.slice(0, SHARE_COLORS.length - 1);
    const tail = cats.slice(SHARE_COLORS.length - 1);
    const rest = tail.reduce((s, c) => s + c.total, 0);
    const parts = tail.length > 1 ? [...top, { key: 'other', total: rest, label: 'остальное' }] : [...top, ...tail];
    return `${chips('history')}
      <section class="card">
        <div class="row-between"><div><div class="muted">С покупки на обслуживание</div><div class="big-sum">${M.formatMoney(total)}</div></div>
          <button class="btn outline small auto" data-action="newWork">${icon('plus')} Работа</button></div>
        <button class="btn link small" data-action="openServiceBook">${icon('file')} Сервисная книжка (PDF)</button>
        ${total ? `<div class="share">${parts.map((c, i) => `<i style="flex:${c.total};background:${SHARE_COLORS[i]}"></i>`).join('')}</div>
        <div class="legend">${parts.map((c, i) => `<span><i style="background:${SHARE_COLORS[i]}"></i>${esc(c.label || M.categoryOf(c.key).label)} ${M.formatMoney(c.total)}</span>`).join('')}</div>` : ''}
      </section>
      <div class="timeline">${works.map((w) => {
    const cs = M.workCategories(w);
    return `<a class="tl-item" href="#/service/work/${esc(w.id)}"><span class="tl-dot"></span>
        <div class="muted">${kmDate(w.date, w.km)}</div>
        <div class="card"><div class="row-between"><b class="grow">${esc(M.workTitle(w))}</b>${catTag(cs[0])}${cs.length > 1 ? `<span class="muted">+${cs.length - 1}</span>` : ''}</div>
          <div class="row-between muted"><span>${(w.lines || []).length > 1 ? `${w.lines.length} ${L.plural(w.lines.length, WORKS)}` : esc(w.shop || '')}</span>
          <b class="money">${M.formatMoney(M.workTotal(w).total)}</b></div></div></a>`;
  }).join('') || '<p class="muted">Работ пока нет — нажми «+ Работа».</p>'}</div>`;
  }

  // Строка запчасти: что, когда и где куплено, цена. Нажатие — изменить.
  const stockMeta = (s) => [s.date ? L.formatDate(s.date) : '', s.shop, s.note].filter(Boolean).map(esc).join(' · ');
  const stockLine = (s) => `<button class="line plain-btn" data-action="editStock" data-id="${esc(s.id)}">
    <span class="grow">${esc(s.name)}${stockMeta(s) ? `<span class="muted sub">${stockMeta(s)}</span>` : ''}</span>
    <b class="money">${s.price ? M.formatMoney(s.price) : ''}</b></button>`;

  // План: «Куплены запчасти» → полдела (полоска из двух половинок, решение 12.10) → «Сделано».
  function planCard(p) {
    const got = M.planStock(state.stock, p.id);
    return `<section class="card">
      <button class="plain-btn" data-action="editPlan" data-id="${esc(p.id)}">
        <div class="row-between"><b class="grow">${esc(p.title)}</b>${catTag(p.category)}</div>
        <div class="row-between muted"><span class="${p.urgent ? 'lv-text lv-bad' : ''}">${esc(p.due || '')}</span>
        <span>${p.estimate ? `~${M.formatMoney(p.estimate)}` : ''}</span></div>
        ${p.note ? `<div class="muted">${esc(p.note)}</div>` : ''}</button>
      <div class="halves" role="img" aria-label="${got.length ? 'Запчасти куплены, осталось СТО' : 'Запчасти ещё не куплены'}"><i class="${got.length ? 'on' : ''}"></i><i></i></div>
      ${got.length ? `<div class="plan-parts lines">${got.map(stockLine).join('')}</div>` : ''}
      <div class="row">
        <button class="btn outline small" data-action="buyParts" data-plan="${esc(p.id)}">${got.length ? `${icon('plus')} Ещё деталь` : `${icon('box')} Куплены запчасти`}</button>
        <button class="btn primary small" data-action="planDone" data-id="${esc(p.id)}">${icon('check')} Сделано</button>
      </div>
    </section>`;
  }

  function plansView() {
    const done = state.plans.filter((p) => p.done);
    const free = M.freeStock(state.stock);
    const freeSum = M.stockSum(free);
    return `${chips('plans')}
      <button class="btn outline small" data-action="editPlan">${icon('plus')} Добавить план</button>
      ${openPlans().map(planCard).join('') || '<p class="muted">Планов нет.</p>'}
      ${done.length ? `<div class="sec">Сделано · ${done.length}</div><section class="card lines">${done.map((p) => `<div class="line">
        <span class="dot lv-ok"></span><span class="grow muted">${esc(p.title)}</span></div>`).join('')}</section>` : ''}
      <div class="sec">В запасе, без плана${freeSum ? ` · ${M.formatMoney(freeSum)}` : ''} <button class="link-btn" data-action="editStock">+ добавить</button></div>
      ${free.length ? `<section class="card lines">${free.map(stockLine).join('')}</section>` : '<p class="muted">Пусто</p>'}`;
  }

  function partsView() {
    return `${chips('parts')}
      <p class="muted">Что покупать для твоей машины — марка, артикул, цена и где купить.</p>
      <button class="btn outline small" data-action="editPart">${icon('plus')} Добавить расходник</button>
      ${sortedParts().map((p) => {
    const node = NODES.find((n) => n.key === p.nodeKey);
    return `<section class="card">
        <button class="plain-btn" data-action="editPart" data-id="${esc(p.id)}"><div class="node-head">
          <span class="ic-box">${icon(node ? node.icon : 'box')}</span>
          <div class="grow"><div class="muted">${esc(p.name)}</div><b>${esc(p.brand || '')}</b>
          <div class="row-between muted"><span>${esc(p.spec || '')}</span><b class="money">${p.price ? `~${M.formatMoney(p.price)}` : ''}</b></div>
          ${p.note ? `<div class="note-warn">${esc(p.note)}</div>` : ''}</div></div></button>
        ${p.url ? `<a class="link-out" href="${esc(p.url)}" target="_blank" rel="noopener">${icon('link')} где купить</a>` : ''}
      </section>`;
  }).join('') || '<p class="muted">Пока пусто.</p>'}`;
  }

  function nodeView(key) {
    const item = statuses().find((s) => s.node.key === key);
    if (!item) return overview();
    const { node, status, events } = item;
    const months = !node.months ? '' : node.months % 12 === 0
      ? `${node.months / 12} ${L.plural(node.months / 12, YEARS)}` : `${node.months} мес.`;
    const interval = [node.km ? `${L.formatKm(node.km)} км` : '', months].filter(Boolean).join(' или ');
    const verb = node.kind === 'check' ? 'Отметить проверку' : node.kind === 'season' ? 'Отметить переобувку' : 'Отметить замену';
    const parts = state.parts.filter((p) => p.nodeKey === key);
    const works = new Map(state.works.map((w) => [w.id, w]));
    const noData = !status.last && !status.lastCheck && node.kind !== 'season';
    return `<div class="title-row"><a class="icon-btn" href="#/service/nodes" aria-label="Назад">${icon('back')}</a><h1>${esc(node.title)}</h1></div>
      ${noData ? hint(`Не знаю, когда это ${node.kind === 'check' ? 'проверяли' : 'меняли'}. Если знаешь — нажми внизу «${verb}» и укажи дату`) : ''}
      <section class="card"><div class="row-between"><span class="dot ${LEVEL_CLASS[status.level]}"></span><b class="grow">${esc(status.label)}</b>
        <span class="muted">${status.nextKm ? `след. ~${L.formatKm(status.nextKm)} км` : ''}</span></div>${bar(status.progress, status.level)}</section>
      ${node.kind !== 'season' ? `<section class="card"><div class="muted">Интервал</div><b>${node.kind === 'check' ? 'проверка ' : ''}${interval || '—'}</b>
        <div class="muted">завод GM: ${esc(node.gm)}</div></section>` : ''}
      <section class="card"><div class="muted">${node.kind === 'replace' ? 'Что ставить / заливать' : 'Что важно'}</div><b>${esc(node.what)}</b>
        ${node.tip ? `<div class="muted">${esc(node.tip)}</div>` : ''}</section>
      ${parts.length ? `<div class="sec">Мои расходники</div>${parts.map((p) => `<section class="card"><b>${esc(p.brand || p.name)}</b>
        <div class="row-between muted"><span>${esc(p.spec || '')}</span><span class="money">${p.price ? `~${M.formatMoney(p.price)}` : ''}</span></div>
        ${p.url ? `<a class="link-out" href="${esc(p.url)}" target="_blank" rel="noopener">${icon('link')} где купить</a>` : ''}</section>`).join('')}` : ''}
      <div class="sec">История</div>
      <section class="card lines">${events.map((e) => `<a class="line" href="#/service/work/${esc(e.workId)}">
        <span class="dot ${e.action === 'check' ? 'lv-plan' : 'lv-ok'}"></span><span class="grow">${kmDate(e.date, e.km)}</span>
        <span class="muted">${e.action === 'check' ? 'проверка' : esc(M.workTitle(works.get(e.workId) || {}))}</span></a>`).join('') || '<p class="muted">Записей пока нет</p>'}</section>
      <button class="btn primary" data-action="nodeDone" data-key="${esc(key)}">${icon('check')} ${verb}</button>`;
  }

  // Запчасти, купленные заранее к плану и ушедшие в эту работу (их деньги — в «Расходах» месяца покупки).
  const workStock = (w) => state.stock.filter((s) => s.usedWorkId === w.id);
  function prepaidCard(w) {
    const list = workStock(w);
    if (!list.length) return '';
    return `<section class="card"><div class="muted">Детали куплены заранее</div><div class="lines">${list.map((s) => `<div class="line">
      <span class="grow">${esc(s.name)}${stockMeta(s) ? `<span class="muted sub">${stockMeta(s)}</span>` : ''}</span>
      <b class="money">${s.price ? M.formatMoney(s.price) : ''}</b></div>`).join('')}</div>
      <div class="muted">В «Расходах» — в месяце покупки, здесь — в сумме работы</div></section>`;
  }

  function workView(id) {
    const w = state.works.find((x) => x.id === id);
    if (!w) return historyView();
    const t = M.workTotal(w);
    const one = (w.lines || []).length === 1;
    return `<div class="title-row"><a class="icon-btn" href="#/service/history" aria-label="Назад">${icon('back')}</a><h1>Работа</h1></div>
      <section class="card"><b class="big">${esc(M.workTitle(w))}</b><div class="muted">${kmDate(w.date, w.km)}</div></section>
      <section class="card lines">${one ? `<div class="row-between">${catTag(w.lines[0].category)}</div>` : (w.lines || []).map((l) => `<div class="line-col">
        <div class="row-between"><span class="grow">${esc(l.title)}</span>${catTag(l.category)}</div>
        <div class="row-between muted"><span>${l.action === 'check' ? 'проверка' : `работа ${M.formatMoney(l.labor || 0)} · детали ${M.formatMoney((Number(l.parts) || 0) + (Number(l.prepaid) || 0))}`}</span></div></div>`).join('')}
        <div class="row-between total"><b>Итого</b><b>${M.formatMoney(t.total)}</b></div>
        <div class="muted">работа ${M.formatMoney(t.labor)} · детали ${M.formatMoney(t.parts)}</div></section>
      ${prepaidCard(w)}
      ${w.shop ? `<section class="card"><div class="muted">СТО / мастер</div><b>${esc(w.shop)}</b></section>` : ''}
      ${w.note ? `<section class="card"><div class="muted">Заметка</div><div>${esc(w.note)}</div></section>` : ''}
      <div class="row"><button class="btn outline small" data-action="editWork" data-id="${esc(w.id)}">Изменить</button>
        <button class="btn link small danger" data-action="deleteWork" data-id="${esc(w.id)}">Удалить</button></div>
      ${one ? '' : '<p class="muted">В работе из нескольких строк можно поправить дату, пробег, СТО и заметку.</p>'}`;
  }

  function view(sub) {
    const [tab, param] = (sub || '').split('/');
    if (tab === 'node') return nodeView(param);
    if (tab === 'work') return workView(param);
    return ({ nodes: nodesView, history: historyView, plans: plansView, parts: partsView }[tab] || overview)();
  }

  // Карточка на главном экране.
  function homeCard() {
    const st = statuses();
    // Масло показываем всегда первой строкой, поэтому из «скоро пора» его убираем.
    const soon = soonAll(st).filter((i) => i.key !== 'oil').slice(0, 4);
    const oil = st.find((s) => s.node.key === 'oil');
    return `<section class="card">
      <div class="row-between"><h2>${state.docs.length ? 'Обслуживание и сроки' : 'Обслуживание'}</h2><a class="link-btn" href="#/service">всё →</a></div>
      <div class="lines">${dotLine(oil.status.level, 'Масло двигателя', oil.status.label, nodeHref('oil'))}
      ${soon.map((i) => dotLine(i.level, i.title, i.label, soonHref(i))).join('')}</div></section>`;
  }

  // ---------- Формы ----------

  // Итог в форме работы: заранее купленные детали + работа + детали на СТО.
  const totalText = (prepaid, labor, parts) => M.formatMoney(prepaid + (labor || 0) + (parts || 0));

  // opts.bought — запчасти плана, купленные заранее (при «Сделано»): они уже в «Расходах», вписать нужно только работу.
  function workForm(w, opts = {}) {
    const line = (w.lines || [])[0] || {};
    const multi = (w.lines || []).length > 1;
    const checked = new Set(opts.nodes || line.nodes || []);
    const v = (x) => esc(x ?? '');
    const bought = opts.bought || (w.id ? workStock(w) : []);
    const prepaid = opts.bought ? M.stockSum(opts.bought) : Number(line.prepaid) || 0;
    const pre = !multi && (prepaid > 0 || bought.length > 0);
    return sheet(w.id ? 'Изменить работу' : opts.planId ? 'Сделано' : 'Новая работа', `
      <label class="field"><span>Что сделали</span><input id="w-title" value="${v(w.title || line.title)}" placeholder="Замена масла и фильтра"></label>
      <div class="row">
        <label class="field"><span>Дата</span><input id="w-date" type="date" value="${v(w.date || today())}"></label>
        <label class="field"><span>Пробег, км</span><input id="w-km" inputmode="numeric" value="${w.km != null ? L.formatKm(w.km) : v(opts.km)}"></label>
      </div>
      ${multi ? '' : `<label class="field"><span>Категория</span><select id="w-cat">${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === (line.category || opts.category || 'to') ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
      ${pre ? `<div class="field"><span>Детали — уже учтены</span><div class="prepaid lines">${bought.map((s) => `<div class="line">
        <span class="grow">${esc(s.name)}${s.date ? `<span class="muted sub">куплено ${L.formatDate(s.date)}</span>` : ''}</span>
        <b class="money">${s.price ? M.formatMoney(s.price) : ''}</b></div>`).join('') || `<div class="line"><span class="grow">Куплены заранее</span><b class="money">${M.formatMoney(prepaid)}</b></div>`}</div></div>` : ''}
      <div class="row">
        <label class="field"><span>${pre ? 'Работа на СТО, грн' : 'Работа, грн'}</span><input id="w-labor" inputmode="decimal" value="${line.labor ? L.formatKm(line.labor) : ''}"></label>
        <label class="field"><span>${pre ? 'Ещё детали на СТО' : 'Детали, грн'}</span><input id="w-parts" inputmode="decimal" value="${line.parts ? L.formatKm(line.parts) : ''}"${pre ? ' placeholder="если были"' : ''}></label>
      </div>
      ${pre ? `<div class="card row-between work-total"><span>Итого за работу</span><b id="w-total" data-prepaid="${prepaid}">${totalText(prepaid, line.labor, line.parts)}</b></div>` : ''}`}
      <label class="field"><span>СТО / мастер <em>необязательно</em></span><input id="w-shop" value="${v(w.shop)}"></label>
      <label class="field"><span>Заметка <em>необязательно</em></span><input id="w-note" value="${v(w.note)}"></label>
      ${multi ? '' : `<div class="field"><span>Что заменили или проверили — для графика ТО</span>
        <div class="checks">${NODES.map((n) => `<label class="check"><input type="checkbox" name="w-node" value="${n.key}" ${checked.has(n.key) ? 'checked' : ''}>${esc(n.title)}</label>`).join('')}</div></div>`}
      <p class="error" id="w-error" role="alert"></p>
      <button class="btn primary" data-action="saveWork" data-id="${v(w.id)}" data-plan="${v(opts.planId)}">Сохранить</button>`);
  }

  function planForm(p) {
    const v = (x) => esc(x ?? '');
    return sheet(p.id ? 'План' : 'Новый план', `
      <label class="field"><span>Что сделать</span><input id="p-title" value="${v(p.title)}" placeholder="Втулки стабилизатора"></label>
      <label class="field"><span>Категория</span><select id="p-cat">${CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === (p.category || 'chassis') ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
      <div class="row">
        <label class="field"><span>Когда</span><input id="p-due" value="${v(p.due)}" placeholder="до зимы"></label>
        <label class="field"><span>Примерно, грн</span><input id="p-est" inputmode="decimal" value="${p.estimate ? L.formatKm(p.estimate) : ''}"></label>
      </div>
      <label class="field"><span>Заметка <em>необязательно</em></span><input id="p-note" value="${v(p.note)}"></label>
      <label class="check"><input type="checkbox" id="p-urgent" ${p.urgent ? 'checked' : ''}>Срочно — показывать в «Скоро пора»</label>
      <p class="error" id="p-error" role="alert"></p>
      <button class="btn primary" data-action="savePlan" data-id="${v(p.id)}">Сохранить</button>
      ${p.id ? `<button class="btn link danger" data-action="deletePlan" data-id="${v(p.id)}">Удалить план</button>` : ''}`);
  }

  function partForm(p) {
    const v = (x) => esc(x ?? '');
    return sheet(p.id ? 'Расходник' : 'Новый расходник', `
      <label class="field"><span>Что это</span><input id="r-name" value="${v(p.name)}" placeholder="Масляный фильтр"></label>
      <label class="field"><span>Марка и артикул</span><input id="r-brand" value="${v(p.brand)}" placeholder="ACDelco UPF64R"></label>
      <div class="row">
        <label class="field"><span>Характеристики</span><input id="r-spec" value="${v(p.spec)}" placeholder="5W-30, 4 л"></label>
        <label class="field narrow"><span>Цена, грн</span><input id="r-price" inputmode="decimal" value="${p.price ? L.formatKm(p.price) : ''}"></label>
      </div>
      <label class="field"><span>Ссылка, где купить</span><input id="r-url" type="url" value="${v(p.url)}" placeholder="https://…"></label>
      <label class="field"><span>Заметка</span><input id="r-note" value="${v(p.note)}"></label>
      <label class="field"><span>Для какого узла</span><select id="r-node"><option value="">—</option>${NODES.map((n) => `<option value="${n.key}" ${n.key === p.nodeKey ? 'selected' : ''}>${n.title}</option>`).join('')}</select></label>
      <p class="error" id="r-error" role="alert"></p>
      <button class="btn primary" data-action="savePart" data-id="${v(p.id)}">Сохранить</button>
      ${p.id ? `<button class="btn link danger" data-action="deletePart" data-id="${v(p.id)}">Удалить</button>` : ''}`);
  }

  // Запчасть: новая покупка к плану, правка купленной или «в запас» без плана (решение 12.10).
  // opts.planId — к какому плану, opts.tab: 'new' | 'stock' (взять из запаса).
  function stockForm(s, opts = {}) {
    const v = (x) => esc(x ?? '');
    const planId = s.planId || opts.planId || '';
    const plan = find(state.plans, planId);
    const free = M.freeStock(state.stock);
    const used = Boolean(s.usedWorkId || s.usedAt);
    const fromStock = !s.id && plan && opts.tab === 'stock';
    const seg = !s.id && plan && free.length ? `<div class="seg" role="tablist">
      <button class="${fromStock ? '' : 'on'}" data-action="buyParts" data-plan="${v(plan.id)}">Новая покупка</button>
      <button class="${fromStock ? 'on' : ''}" data-action="buyFromStock" data-plan="${v(plan.id)}">Взять из запаса</button></div>` : '';
    const title = s.id ? (plan ? 'Запчасть к плану' : 'В запасе') : plan ? 'Куплены запчасти' : 'Добавить в запас';
    const forPlan = plan ? `<p class="muted">для плана «${esc(plan.title)}»</p>` : '';
    if (fromStock) {
      return sheet(title, `${forPlan}${seg}
        <div class="card lines pick-list">${free.map((x, i) => `<label class="line pick-row">
          <input type="radio" name="s-pick" value="${v(x.id)}" ${i === 0 ? 'checked' : ''}>
          <span class="grow">${esc(x.name)}${stockMeta(x) ? `<span class="muted sub">${stockMeta(x)}</span>` : ''}</span>
          <b class="money">${x.price ? M.formatMoney(x.price) : ''}</b></label>`).join('')}</div>
        <p class="muted">Уйдёт из запаса в этот план, его цена войдёт в сумму работы. В «Расходах» второй раз не посчитается</p>
        <p class="error" id="s-error" role="alert"></p>
        <button class="btn primary" data-action="takeStock" data-plan="${v(plan.id)}">Взять в план</button>`);
    }
    return sheet(title, `${forPlan}${seg}
      <label class="field"><span>${plan ? 'Что купила' : 'Что лежит'}</span><input id="s-name" value="${v(s.name)}" placeholder="${plan ? 'Втулки Febi 41007, 2 шт' : 'Антифриз ACDelco Dex-Cool'}"></label>
      <div class="row">
        <label class="field"><span>Сколько потратила, грн</span><input id="s-price" inputmode="decimal" value="${s.price ? L.formatKm(s.price) : ''}"></label>
        <label class="field"><span>Дата покупки</span><input id="s-date" type="date" value="${v(s.id ? s.date : today())}"></label>
      </div>
      <label class="field"><span>Где купила <em>необязательно</em></span><input id="s-shop" value="${v(s.shop)}" placeholder="Rozetka"></label>
      <label class="field"><span>Заметка <em>необязательно</em></span><input id="s-note" value="${v(s.note)}" placeholder="${plan ? 'артикул, количество' : 'концентрат, 3,78 л'}"></label>
      <p class="muted">${used ? 'Уже ушло в работу — сумма учтена в ней' : 'Сумма попадёт в «Расходы» в месяц покупки'}</p>
      <p class="error" id="s-error" role="alert"></p>
      <button class="btn primary" data-action="saveStock" data-id="${v(s.id)}" data-plan="${v(planId)}">Сохранить</button>
      ${s.id && !used && s.planId ? `<button class="btn link" data-action="unplanStock" data-id="${v(s.id)}">Вернуть в запас (без плана)</button>` : ''}
      ${s.id && !used && !s.planId ? `<button class="btn link" data-action="useStock" data-id="${v(s.id)}">Использовано — убрать из запаса</button>` : ''}
      ${s.id && !used ? `<button class="btn link danger" data-action="deleteStock" data-id="${v(s.id)}">Удалить запись</button>` : ''}`);
  }

  // Выгрузка «сервисной книжки» (решение 26.09: строгий PDF). Перед сохранением — что показывать.
  function serviceBookSheet() {
    const cover = state.photos.find((p) => p.cover);
    const sw = (id, label, on) => `<label class="switch-row"><span>${label}</span><input type="checkbox" class="switch" id="${id}" ${on ? 'checked' : ''}></label>`;
    return sheet('Сервисная книжка (PDF)', `
      <p class="muted">Все работы по датам, итог и последние замены — удобно покупателю и мастеру. Для покупателя можно выключить суммы и заметки.</p>
      ${sw('pdf-sums', 'Суммы (цены работ)', true)}
      ${sw('pdf-vin', 'VIN', true)}
      ${sw('pdf-shop', 'СТО / мастер', true)}
      ${sw('pdf-notes', 'Мои заметки', false)}
      ${cover ? sw('pdf-photo', 'Фото машины (обложка из «Моя Malibu»)', true) : ''}
      <p class="error" id="pdf-error" role="alert"></p>
      <button class="btn primary" id="pdf-save" data-action="savePdf">${icon('file')} Сохранить PDF</button>`);
  }

  async function sharePdf(file) {
    const btn = document.getElementById('pdf-save');
    try {
      if (!(await saveFile(file))) return;
      state.pdfFile = null;
      clearSheet();
      toast('PDF сохранён');
    } catch (err) {
      // Пока готовился PDF, айфон «забыл» нажатие — просим нажать ещё раз, файл уже готов.
      if (err.name === 'NotAllowedError' && btn) {
        state.pdfFile = file;
        btn.textContent = 'Готово — нажми, чтобы сохранить';
        return;
      }
      showFormError('pdf-error', `Не получилось сохранить: ${err.message}`);
    }
  }

  const val = (id) => document.getElementById(id)?.value ?? '';
  const find = (list, id) => list.find((x) => x.id === id) || null;

  // С celebrate — акулёнок на весь экран (новая работа, «Сделано»), иначе — короткое сообщение внизу.
  async function done(message, { celebrate: cel = null } = {}) {
    clearSheet();
    if (cel) celebrate(cel.pose, cel.text);
    else toast(message);
    await ctx.afterChange();
  }

  // ---------- Действия ----------

  const actions = {
    openServiceBook() {
      state.pdfFile = null;
      openSheet(serviceBookSheet());
      preparePdf().catch(() => {});
    },

    async savePdf() {
      if (state.pdfFile) { await sharePdf(state.pdfFile); return; }
      const checked = (id) => Boolean(document.getElementById(id)?.checked);
      const opts = { sums: checked('pdf-sums'), vin: checked('pdf-vin'), shop: checked('pdf-shop'), notes: checked('pdf-notes') };
      const btn = document.getElementById('pdf-save');
      btn.textContent = 'Готовлю PDF…';
      const cover = checked('pdf-photo') ? state.photos.find((p) => p.cover) : null;
      let file;
      try {
        const data = serviceBookData({ car: state.car, works: state.works, currentKm: ctx.currentKm(), today: today() }, opts);
        file = await serviceBookPdf(data, { photo: cover ? cover.data : null, sums: opts.sums });
      } catch (err) {
        btn.innerHTML = `${icon('file')} Сохранить PDF`;
        showFormError('pdf-error', `Не получилось сделать PDF: ${err.message}`);
        return;
      }
      btn.innerHTML = `${icon('file')} Сохранить PDF`;
      await sharePdf(file);
    },

    newWork() { openSheet(workForm({}, { km: L.formatKm(ctx.currentKm()) })); },

    editWork(el) {
      const w = find(state.works, el.dataset.id);
      if (w) openSheet(workForm(w));
    },

    nodeDone(el) {
      const node = NODES.find((n) => n.key === el.dataset.key);
      const prefix = node.kind === 'check' ? 'Проверка' : node.kind === 'season' ? 'Переобувка' : 'Замена';
      openSheet(workForm({ title: `${prefix}: ${node.title.toLowerCase()}` }, {
        nodes: [node.key], category: 'to', km: L.formatKm(ctx.currentKm()),
      }), { focus: false });
    },

    async saveWork(el) {
      const res = M.validateWorkInput({
        title: val('w-title'), date: val('w-date'), km: val('w-km'), labor: val('w-labor'), parts: val('w-parts'),
      }, today());
      if (res.error) { showFormError('w-error', res.error); return; }
      const existing = find(state.works, el.dataset.id);
      const header = { date: res.date, km: res.km, shop: val('w-shop').trim(), note: val('w-note').trim() };
      let work;
      if (existing && existing.lines.length > 1) {
        work = { ...existing, ...header, title: res.title };
      } else {
        const nodes = [...document.querySelectorAll('input[name=w-node]:checked')].map((i) => i.value);
        const line = { ...(existing?.lines?.[0] || {}), title: res.title, category: val('w-cat') || 'to', labor: res.labor, parts: res.parts, nodes };
        work = { ...(existing || {}), ...header, title: '', lines: [line] };
      }
      // «Сделано» у плана: запчасти, купленные заранее, переходят в работу (сумма — в prepaid).
      const plan = find(state.plans, el.dataset.plan);
      const bought = plan ? M.planStock(state.stock, plan.id) : [];
      if (bought.length && work.lines.length === 1) {
        work.lines[0] = { ...work.lines[0], prepaid: M.stockSum(bought), stockIds: bought.map((s) => s.id) };
      }
      const saved = await db.put('works', work);
      for (const s of bought) await db.put('stock', { ...s, usedWorkId: saved.id });
      // Пробег из работы — тоже отметка одометра, если он больше последнего.
      if (res.km != null && res.km > ctx.currentKm()) {
        await db.put('odometer', { date: res.date, km: res.km, source: 'work' });
      }
      if (plan) await db.put('plans', { ...plan, done: true, doneWorkId: saved.id });
      let cel = null;
      if (plan) cel = { pose: 'excited', text: 'Сделано! Одним делом меньше' };
      else if (!existing) cel = { pose: 'proud', text: 'Записала! Спасибо, что заботишься обо мне' };
      await done('Работа сохранена', { celebrate: cel });
    },

    async deleteWork(el) {
      if (!confirmTwice(el)) return;
      const w = find(state.works, el.dataset.id);
      await db.put('works', { ...w, deleted: true });
      // Работа была «Сделано» у плана — план снова открыт, а его запчасти возвращаются к нему.
      const plans = state.plans.filter((p) => p.doneWorkId === w.id);
      for (const p of plans) await db.put('plans', { ...p, done: false, doneWorkId: null });
      for (const s of workStock(w)) await db.put('stock', { ...s, usedWorkId: null });
      location.hash = '#/service/history';
      await done(plans.length ? 'Работа удалена, план снова в «Планах»' : 'Работа удалена');
    },

    editPlan(el) { openSheet(planForm(find(state.plans, el.dataset.id) || {})); },

    async savePlan(el) {
      const title = val('p-title').trim();
      if (!title) { showFormError('p-error', 'Напиши, что сделать'); return; }
      const estimate = M.parseMoney(val('p-est'));
      if (estimate == null) { showFormError('p-error', 'Сумма — только цифры'); return; }
      const plan = find(state.plans, el.dataset.id) || { done: false };
      await db.put('plans', {
        ...plan, title, category: val('p-cat'), due: val('p-due').trim(), estimate: estimate || null,
        note: val('p-note').trim(), urgent: document.getElementById('p-urgent').checked,
      });
      await done('План сохранён');
    },

    async deletePlan(el) {
      if (!confirmTwice(el)) return;
      const plan = find(state.plans, el.dataset.id);
      await db.put('plans', { ...plan, deleted: true });
      // Купленные к плану запчасти не пропадают — уходят в запас без плана.
      const got = M.planStock(state.stock, plan.id);
      for (const s of got) await db.put('stock', { ...s, planId: null });
      await done(got.length ? 'План удалён, запчасти — в запасе' : 'План удалён');
    },

    planDone(el) {
      const p = find(state.plans, el.dataset.id);
      openSheet(workForm({ title: p.title }, {
        category: p.category, planId: p.id, km: L.formatKm(ctx.currentKm()), bought: M.planStock(state.stock, p.id),
      }), { focus: false });
    },

    editPart(el) { openSheet(partForm(find(state.parts, el.dataset.id) || {})); },

    async savePart(el) {
      const name = val('r-name').trim();
      if (!name) { showFormError('r-error', 'Напиши, что это'); return; }
      const price = M.parseMoney(val('r-price'));
      if (price == null) { showFormError('r-error', 'Цена — только цифры'); return; }
      const url = val('r-url').trim();
      if (url && !/^https?:\/\//.test(url)) { showFormError('r-error', 'Ссылка должна начинаться с https://'); return; }
      await db.put('parts', {
        ...(find(state.parts, el.dataset.id) || {}), name, brand: val('r-brand').trim(), spec: val('r-spec').trim(),
        price: price || null, url, note: val('r-note').trim(), nodeKey: val('r-node') || null,
      });
      await done('Сохранено');
    },

    async deletePart(el) {
      if (!confirmTwice(el)) return;
      await db.put('parts', { ...find(state.parts, el.dataset.id), deleted: true });
      await done('Удалено');
    },

    editStock(el) { openSheet(stockForm(find(state.stock, el.dataset.id) || {})); },

    buyParts(el) { openSheet(stockForm({}, { planId: el.dataset.plan, tab: 'new' })); },

    buyFromStock(el) { openSheet(stockForm({}, { planId: el.dataset.plan, tab: 'stock' }), { focus: false }); },

    async saveStock(el) {
      const res = M.validateStockInput({
        name: val('s-name'), price: val('s-price'), date: val('s-date'), shop: val('s-shop'), note: val('s-note'),
      }, today());
      if (res.error) { showFormError('s-error', res.error); return; }
      const existing = find(state.stock, el.dataset.id);
      const planId = el.dataset.plan || null;
      await db.put('stock', { ...(existing || {}), ...res.item, planId: existing ? existing.planId || null : planId });
      if (!existing && planId) await done('', { celebrate: { pose: 'proud', text: 'Запчасти есть! Полдела сделано' } });
      else await done('Сохранено');
    },

    async takeStock(el) {
      const picked = document.querySelector('input[name=s-pick]:checked');
      const s = picked && find(state.stock, picked.value);
      if (!s) { showFormError('s-error', 'Выбери, что берёшь из запаса'); return; }
      await db.put('stock', { ...s, planId: el.dataset.plan });
      await done(`«${s.name}» — в плане`);
    },

    async unplanStock(el) {
      await db.put('stock', { ...find(state.stock, el.dataset.id), planId: null });
      await done('Вернула в запас');
    },

    // Использовано без работы: из запаса уходит, а в «Расходах» остаётся (деньги-то потрачены).
    async useStock(el) {
      if (!confirmTwice(el)) return;
      await db.put('stock', { ...find(state.stock, el.dataset.id), usedAt: today() });
      await done('Убрано из запаса');
    },

    // Удаление — для ошибочной записи: пропадёт и из «Расходов».
    async deleteStock(el) {
      if (!confirmTwice(el)) return;
      await db.put('stock', { ...find(state.stock, el.dataset.id), deleted: true });
      await done('Запись удалена');
    },
  };

  // Итог в форме «Сделано» пересчитывается при вводе сумм.
  function onInput(e) {
    if (e.target.id !== 'w-labor' && e.target.id !== 'w-parts') return;
    const el = document.getElementById('w-total');
    if (!el) return;
    const num = (id) => M.parseMoney(val(id)) || 0;
    el.textContent = totalText(Number(el.dataset.prepaid) || 0, num('w-labor'), num('w-parts'));
  }

  return { view, homeCard, statuses, actions, onInput };
}
