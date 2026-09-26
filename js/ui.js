// Общие куски интерфейса: экранирование, окна снизу, всплывающие сообщения. Без бизнес-логики.

import { icon } from './icons.js';

const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Живой акулёнок (решение 26.09): картинки пользователя от GPT на прозрачном фоне, без кружка — app/img/live.
// Живёт на главной у подсказки (дышит, покачивается, сам меняет выражение); в события выпрыгивает посреди экрана;
// при ошибке в форме выглядывает сбоку. На остальных экранах его нет — только облачко с текстом.
// Выражения: happy, closed (глаза закрыты), oh (любопытный), surprised, mischief (озорной), wink-tongue,
// proud, wave (машет плавником), lick (облизывается).
const POSE_FILES = ['happy', 'closed', 'oh', 'surprised', 'mischief', 'wink-tongue', 'proud', 'wave', 'lick'];
// Прежние названия настроений → выражения живого акулёнка.
const MOOD_POSE = { calm: 'happy', hero: 'wave', wink: 'wink-tongue', excited: 'wave', curious: 'oh', sleepy: 'closed' };
// В прыжке выражение меняется: [вылет, середина, конец].
const LEAP_POSES = {
  lick: ['lick', 'wink-tongue', 'lick'],
  proud: ['proud', 'mischief', 'proud'],
  excited: ['wave', 'happy', 'wave'],
};
const IDLE_POSES = ['closed', 'happy', 'oh', 'happy', 'closed', 'wink-tongue', 'happy'];
const IDLE_EVERY_MS = 3200;
const IDLE_HOLD_MS = 1300;
const DROPS = 12;
const ERROR_PEEK_MS = 1600;

const poseOf = (mood) => (POSE_FILES.includes(mood) ? mood : MOOD_POSE[mood] || 'happy');
const poseSrc = (pose) => `img/live/${poseOf(pose)}.webp`;
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Акулёнок на главной (и на первом запуске). cls: '' | 'xl'.
export function liveShark(mood = 'happy', cls = '') {
  return `<button class="live-shark ${cls}" data-action="liveTap" data-pose="${poseOf(mood)}" aria-label="Акулёнок">
    <img src="${poseSrc(mood)}" alt="" draggable="false"></button>`;
}

// Смена выражения, спрятанная за маленьким «пружинящим» движением (позы нарисованы чуть по-разному).
function setPose(el, pose) {
  const img = el.querySelector('img');
  img.src = poseSrc(pose);
  img.classList.remove('pop');
  void img.offsetWidth;
  img.classList.add('pop');
}

// «Жизнь» на экране: время от времени сам меняет выражение и возвращается к своему. Вызывать после отрисовки.
let lifeTimer = null;
export function startLife() {
  clearInterval(lifeTimer);
  const el = document.querySelector('.live-shark');
  if (!el || calm()) return;
  let i = 0;
  lifeTimer = setInterval(() => {
    if (!el.isConnected) { clearInterval(lifeTimer); return; }
    if (el.dataset.busy) return;
    setPose(el, IDLE_POSES[i++ % IDLE_POSES.length]);
    setTimeout(() => { if (!el.dataset.busy && el.isConnected) setPose(el, el.dataset.pose); }, IDLE_HOLD_MS);
  }, IDLE_EVERY_MS);
}

// Нажали на акулёнка: подпрыгивает с озорной рожицей.
export async function liveTap(el) {
  if (el.dataset.busy) return;
  el.dataset.busy = '1';
  setPose(el, 'mischief');
  el.classList.add('hop');
  await wait(900);
  el.classList.remove('hop');
  setPose(el, el.dataset.pose);
  delete el.dataset.busy;
}

// Брызги капель снизу экрана.
function splash(n = DROPS) {
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.className = 'drop';
    const s = 8 + Math.random() * 12;
    Object.assign(d.style, { left: `${40 + Math.random() * 20}%`, width: `${s}px`, height: `${s * 1.2}px` });
    document.body.append(d);
    const dx = (Math.random() - 0.5) * 260;
    const dy = -(120 + Math.random() * 200);
    d.animate([
      { transform: 'translate(0,0)', opacity: 1 },
      { transform: `translate(${dx * 0.6}px,${dy}px)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px,${dy + 260}px)`, opacity: 0 },
    ], { duration: 950 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' }).finished.then(() => d.remove());
  }
}

// Событие (заправка, работа на СТО, «Сделано», покупка): акулёнок выпрыгивает снизу посреди экрана,
// в воздухе покачивается «от хвоста» и меняет выражение, потом ныряет обратно. Нажатие — закрыть сразу.
let leaping = false;
export async function celebrate(mood, text) {
  if (leaping) return;
  leaping = true;
  document.querySelector('.peek-shark')?.remove();
  const poses = LEAP_POSES[mood] || [poseOf(mood), poseOf(mood), poseOf(mood)];
  const layer = document.createElement('div');
  layer.className = 'leap';
  layer.setAttribute('role', 'status');
  layer.innerHTML = `<div class="leap-shark"><img src="${poseSrc(poses[0])}" alt=""></div><div class="leap-text">${esc(text)}</div>`;
  document.body.append(layer);
  const sh = layer.querySelector('.leap-shark');
  let skip = false;
  layer.addEventListener('click', () => { skip = true; });
  requestAnimationFrame(() => layer.classList.add('on'));
  const below = `${window.innerHeight}px`;
  if (!calm()) {
    splash();
    await sh.animate([
      { transform: `translateY(${below}) scale(.8,1.2) rotate(-18deg)` },
      { transform: 'translateY(-30px) scale(1.06,.94) rotate(8deg)', offset: 0.62 },
      { transform: 'translateY(0) scale(1) rotate(0)' },
    ], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished;
  }
  layer.classList.add('said');
  const wiggle = calm() ? null : sh.animate([
    { transform: 'rotate(0)' }, { transform: 'rotate(-7deg) translateY(-5px)' },
    { transform: 'rotate(6deg) translateY(-10px)' }, { transform: 'rotate(0)' },
  ], { duration: 700, iterations: 3, easing: 'ease-in-out' });
  for (const pose of poses.slice(1)) {
    if (skip) break;
    await wait(700);
    setPose(sh, pose);
  }
  if (!skip) await wait(700);
  wiggle?.cancel();
  layer.classList.remove('said', 'on');
  if (!calm()) {
    await sh.animate([
      { transform: 'translateY(0) scale(1) rotate(0)' },
      { transform: 'translateY(-20px) scale(1.04,.96) rotate(-6deg)', offset: 0.25 },
      { transform: `translateY(${below}) scale(.85,1.15) rotate(24deg)` },
    ], { duration: 520, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }).finished;
    splash(8);
  }
  await wait(200);
  layer.remove();
  leaping = false;
}

// Ошибка в форме: удивлённый акулёнок выглядывает справа на уровне ошибки и качает головой.
async function peekSurprised(near) {
  if (calm() || document.querySelector('.peek-shark')) return;
  const el = document.createElement('div');
  el.className = 'peek-shark';
  el.innerHTML = `<img src="${poseSrc('surprised')}" alt="">`;
  // Над строкой ошибки, чтобы не закрывать её текст.
  const top = Math.min(Math.max(near.getBoundingClientRect().top - 128, 20), window.innerHeight - 160);
  el.style.top = `${top}px`;
  document.body.append(el);
  await el.animate([{ transform: 'translateX(110%) rotate(25deg)' }, { transform: 'translateX(-4%) rotate(-8deg)', offset: 0.7 },
    { transform: 'translateX(0) rotate(0)' }], { duration: 420, easing: 'ease-out' }).finished;
  await el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(0)' }],
    { duration: 480, iterations: 2 }).finished;
  await wait(ERROR_PEEK_MS);
  await el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(115%) rotate(25deg)' }],
    { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished;
  el.remove();
}

// Окно снизу. Шапка с «язычком» и крестиком прилипает сверху; окно можно смахнуть вниз.
export function sheet(title, body) {
  return `<div class="sheet-backdrop" data-action="closeSheet">
    <section class="sheet" role="dialog" aria-label="${esc(title)}">
      <header class="sheet-head"><div class="grabber"></div>
        <div class="sheet-title"><h2>${esc(title)}</h2>
        <button class="sheet-x" data-action="closeSheet" aria-label="Закрыть">${icon('close')}</button></div></header>
      ${body}
    </section></div>`;
}

const SWIPE_CLOSE_PX = 90;
let onSwipeClose = () => clearSheet();

// Кто закрывает окно при смахивании (app.js сбрасывает заодно своё состояние).
export function setSheetCloser(fn) {
  onSwipeClose = fn;
}

function enableSwipe(sheetEl) {
  let startY = null;
  let dy = 0;
  sheetEl.addEventListener('touchstart', (e) => {
    // Тянуть можно за шапку или когда окно прокручено в самый верх.
    const fromHead = e.target.closest('.sheet-head');
    if (!fromHead && sheetEl.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dy = 0;
    sheetEl.style.transition = 'none';
  }, { passive: true });
  sheetEl.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 0) sheetEl.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheetEl.addEventListener('touchend', () => {
    if (startY == null) return;
    startY = null;
    sheetEl.style.transition = 'transform .2s ease-out';
    if (dy > SWIPE_CLOSE_PX) {
      sheetEl.style.transform = 'translateY(100%)';
      setTimeout(() => onSwipeClose(), 180);
    } else {
      sheetEl.style.transform = '';
    }
  });
}

// focus: сразу открыть клавиатуру — только для маленьких окон с одним полем (пробег, код).
export function openSheet(html, { focus = false } = {}) {
  $sheet.innerHTML = html;
  const sheetEl = $sheet.querySelector('.sheet');
  if (sheetEl) enableSwipe(sheetEl);
  const input = $sheet.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=date])');
  if (focus && input) setTimeout(() => input.focus(), 250);
}

export function clearSheet() {
  $sheet.innerHTML = '';
}

let toastTimer = null;
export function toast(text, ms = 3000) {
  $toast.innerHTML = `<div class="toast">${esc(text)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.innerHTML = ''; }, ms);
}

// Ошибка в форме — и удивлённый акулёнок выглядывает сбоку (решения 26.09).
export function showFormError(id, text, warn = false) {
  const el = document.getElementById(id);
  el.className = warn ? 'error warn' : 'error';
  el.textContent = text;
  peekSurprised(el);
}

// Подсказка на экранах, где акулёнок не живёт (он только на главной) — просто облачко.
export function hint(text) {
  return `<div class="bubble solo">${esc(text)}</div>`;
}

export function kv(label, value) {
  return `<div class="list-row"><div class="muted grow">${label}</div><div class="strong right">${esc(value)}</div></div>`;
}

// Удаление в два нажатия: первое — меняет текст кнопки, второе — возвращает true.
export function confirmTwice(el) {
  if (el.dataset.sure) return true;
  el.dataset.sure = '1';
  el.textContent = 'Точно удалить? Нажми ещё раз';
  return false;
}
