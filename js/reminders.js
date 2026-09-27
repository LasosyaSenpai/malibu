// «Документы и сроки» (блок в «Ещё») и напоминания в Telegram (решения 27.09). Логика — docs.js, digest.js.

import * as db from './db.js';
import * as L from './logic.js';
import * as D from './docs.js';
import { buildDigest, digestChanged } from './digest.js';
import { BOTFATHER_URL, DIGEST_ID, DOC_KINDS, DOC_REMIND_CHOICES, DOC_REMIND_DAYS, TELEGRAM_HOUR } from './config.js';
import { api } from './sync.js';
import { icon } from './icons.js';
import { clearSheet, confirmTwice, esc, openSheet, sheet, showFormError, toast } from './ui.js';

const LEVEL_CLASS = { ok: 'lv-ok', wa: 'lv-wa', bad: 'lv-bad' };

// ctx: { state, afterChange(), saveMeta(), statuses(), currentKm(), avgL100() } — связь с app.js.
export function createReminders(ctx) {
  const { state } = ctx;
  const today = () => L.todayIso();
  const sortedDocs = () => [...state.docs].sort((a, b) => a.until.localeCompare(b.until));
  const val = (id) => document.getElementById(id)?.value ?? '';

  // ---------- Документы и сроки ----------

  function docsBlock() {
    const docs = sortedDocs();
    return `<section class="card">
      <div class="card-head"><h2>Документы и сроки</h2><button class="btn link small" data-action="editDoc">+ добавить</button></div>
      ${docs.map((d) => {
    const st = D.docStatus(d, today());
    return `<button class="list-row tappable" data-action="editDoc" data-id="${esc(d.id)}">
        <span class="dot ${LEVEL_CLASS[st.level]}"></span>
        <div class="grow"><div>${esc(d.title)}</div><div class="muted">до ${L.formatDate(d.until)}</div></div>
        <span class="lv-text ${LEVEL_CLASS[st.level]}">${esc(st.label)}</span></button>`;
  }).join('') || '<p class="muted">Автоцивилка, аптечка, огнетушитель — напомню заранее, здесь и в Telegram.</p>'}
    </section>`;
  }

  function docForm(d) {
    const kind = d.kind || 'osago';
    const remind = d.remindDays || DOC_REMIND_DAYS;
    return sheet(d.id ? d.title : 'Новый срок', `
      <div class="field"><span>Что</span><div class="pick" data-for="dc-kind">${DOC_KINDS.map((k) => `<button type="button"
        class="pick-btn ${k.key === kind ? 'on' : ''}" data-action="pickDocKind" data-value="${k.key}">${icon(k.icon)}${esc(k.label.replace(' (ОСЦПВ)', ''))}</button>`).join('')}</div>
        <input type="hidden" id="dc-kind" value="${esc(kind)}"></div>
      <label class="field ${kind === 'other' ? '' : 'hidden'}" id="dc-title-wrap"><span>Название</span>
        <input id="dc-title" value="${esc(kind === 'other' ? d.title || '' : '')}" placeholder="Например, КАСКО"></label>
      <div class="row">
        <label class="field"><span>Действует до</span><input id="dc-until" type="date" value="${esc(d.until || '')}"></label>
        <label class="field"><span>Напомнить за</span><select id="dc-remind">${DOC_REMIND_CHOICES.map((n) => `<option value="${n}" ${n === remind ? 'selected' : ''}>${n} дней</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Заметка <em>необязательно</em></span><input id="dc-note" value="${esc(d.note || '')}" placeholder="Страховая, № полиса"></label>
      ${d.id ? '<p class="muted">Продлила — впиши новую дату «Действует до» и сохрани: старая останется в истории.</p>' : ''}
      ${(d.history || []).length ? `<div class="muted">Раньше: ${d.history.map((h) => `до ${L.formatDate(h.until)}`).join(', ')}</div>` : ''}
      <p class="error" id="dc-error" role="alert"></p>
      <button class="btn primary" data-action="saveDoc" data-id="${esc(d.id || '')}">Сохранить</button>
      ${d.id ? `<button class="btn link danger" data-action="deleteDoc" data-id="${esc(d.id)}">Удалить</button>` : ''}`);
  }

  // ---------- Сводка для Telegram ----------

  // Пересчитать сводку и сохранить, если что-то поменялось (вызывается перед синхронизацией).
  async function refreshDigest() {
    const next = buildDigest({
      statuses: ctx.statuses(), plans: state.plans, docs: state.docs, km: ctx.currentKm(), avgL100: ctx.avgL100(), today: today(),
    });
    const prev = await db.get('digest', DIGEST_ID);
    if (digestChanged(prev, next)) await db.put('digest', { ...(prev || {}), ...next });
  }

  // ---------- Telegram ----------

  function tgSheet() {
    const tg = state.meta.tg || {};
    if (!state.meta.syncUrl) {
      return sheet('Напоминания в Telegram', '<p class="muted">Сначала подключи Google Таблицу (Ещё → Бекап) — напоминания присылает бекап-сервер.</p>');
    }
    const body = tg.linked
      ? `<div class="list-row plain">${icon('check', 'green')}<div class="grow"><div class="strong">Подключено — @${esc(tg.bot)}</div>
          <div class="muted">По понедельникам в ${TELEGRAM_HOUR}:00 — сводка. Срочное (документ через 7 / 3 дня, в последний день, «пора» по регламенту) — в тот же день в ${TELEGRAM_HOUR}:00.</div></div></div>
        <button class="btn primary" id="tg-btn" data-action="tgTest">${icon('send')} Прислать сводку сейчас</button>
        <button class="btn link danger" data-action="tgOff">Отключить напоминания</button>`
      : `<ol class="steps">
          <li>Открой в Telegram <a href="${BOTFATHER_URL}" target="_blank" rel="noopener">@BotFather</a> → «/newbot» → придумай имя (например «Malibu Акулёнок») и адрес, заканчивающийся на «bot». Он пришлёт <b>токен</b> — длинную строку с двоеточием. Скопируй её.</li>
          <li>Вставь токен сюда:
            <input id="tg-token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="123456789:AA…" ${tg.bot ? 'disabled' : ''}>
            ${tg.bot ? `<div class="muted">Бот @${esc(tg.bot)} подключён</div>` : ''}</li>
          <li>Открой своего бота${tg.bot ? ` — <a href="https://t.me/${esc(tg.bot)}" target="_blank" rel="noopener">@${esc(tg.bot)}</a>` : ''} и нажми <b>Start</b>.</li>
          <li>Нажми «Проверить» — бот пришлёт приветствие.</li>
        </ol>
        <p class="error" id="tg-error" role="alert"></p>
        ${tg.bot
    ? `<button class="btn primary" id="tg-btn" data-action="tgLink">Проверить</button>
           <button class="btn link" data-action="tgOff">Начать заново (другой бот)</button>`
    : '<button class="btn primary" id="tg-btn" data-action="tgSetup">Подключить бота</button>'}`;
    return sheet('Напоминания в Telegram', `${body}
      <p class="muted">Бот пишет только тебе. Токен хранится в твоём Google-скрипте, не в приложении.</p>`);
  }

  // Запрос к бекап-серверу с понятной ошибкой в окне.
  async function tgCall(body, busyText) {
    const btn = document.getElementById('tg-btn');
    const label = btn?.innerHTML;
    if (btn) btn.textContent = busyText;
    try {
      const out = await api(state.meta.syncUrl, body);
      if ('linked' in out) await ctx.saveMeta({ tg: { bot: out.bot || null, linked: Boolean(out.linked) } });
      return out;
    } catch (err) {
      if (btn) btn.innerHTML = label;
      if (document.getElementById('tg-error')) showFormError('tg-error', err.message);
      else toast(err.message, 6000);
      return null;
    }
  }

  const actions = {
    editDoc(el) {
      openSheet(docForm(state.docs.find((d) => d.id === el.dataset.id) || {}));
    },

    pickDocKind(el) {
      const box = el.closest('.pick');
      box.querySelectorAll('.pick-btn').forEach((b) => b.classList.toggle('on', b === el));
      document.getElementById('dc-kind').value = el.dataset.value;
      document.getElementById('dc-title-wrap').classList.toggle('hidden', el.dataset.value !== 'other');
    },

    async saveDoc(el) {
      const res = D.validateDocInput({
        kind: val('dc-kind'), title: val('dc-title'), until: val('dc-until'), remindDays: val('dc-remind'), note: val('dc-note'),
      }, today());
      if (res.error) { showFormError('dc-error', res.error); return; }
      const existing = state.docs.find((d) => d.id === el.dataset.id) || null;
      await db.put('docs', D.renewDoc(existing, res.doc, today()) || res.doc);
      clearSheet();
      toast(existing && existing.until !== res.doc.until ? 'Продлено — новая дата сохранена' : 'Сохранено');
      await ctx.afterChange();
    },

    async deleteDoc(el) {
      if (!confirmTwice(el)) return;
      const d = state.docs.find((x) => x.id === el.dataset.id);
      await db.put('docs', { ...d, deleted: true });
      clearSheet();
      toast('Удалено');
      await ctx.afterChange();
    },

    openTelegram() {
      openSheet(tgSheet());
      // Уточнить состояние у сервера (вдруг подключали с другого телефона).
      if (state.meta.syncUrl) {
        api(state.meta.syncUrl, { action: 'tgStatus' }).then(async (out) => {
          const was = state.meta.tg || {};
          if (out.bot !== (was.bot || null) || out.linked !== Boolean(was.linked)) {
            await ctx.saveMeta({ tg: { bot: out.bot || null, linked: out.linked } });
            if (document.getElementById('tg-btn')) openSheet(tgSheet());
          }
        }).catch(() => {});
      }
    },

    async tgSetup() {
      const token = val('tg-token').trim();
      if (!token) { showFormError('tg-error', 'Вставь токен от @BotFather'); return; }
      const out = await tgCall({ action: 'tgSetup', token }, 'Проверяю токен…');
      if (out) openSheet(tgSheet());
    },

    async tgLink() {
      const out = await tgCall({ action: 'tgLink' }, 'Проверяю…');
      if (!out) return;
      openSheet(tgSheet());
      toast('Готово! Бот прислал приветствие в Telegram');
    },

    async tgTest() {
      const out = await tgCall({ action: 'tgTest' }, 'Отправляю…');
      if (!out) return;
      openSheet(tgSheet());
      toast('Сводка отправлена в Telegram');
    },

    async tgOff(el) {
      if (!confirmTwice(el)) return;
      await tgCall({ action: 'tgOff' }, '…');
      openSheet(tgSheet());
      toast('Напоминания в Telegram отключены');
    },
  };

  return { docsBlock, refreshDigest, actions };
}
