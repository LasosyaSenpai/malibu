// Общие куски интерфейса: экранирование, окна снизу, всплывающие сообщения. Без бизнес-логики.

import { icon } from './icons.js';

const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const mascot = (cls = '') => `<div class="mascot ${cls}" aria-hidden="true">${icon('paw')}</div>`;

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

export function showFormError(id, text, warn = false) {
  const el = document.getElementById(id);
  el.className = warn ? 'error warn' : 'error';
  el.textContent = text;
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
