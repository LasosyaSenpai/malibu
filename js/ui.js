// Общие куски интерфейса: экранирование, окна снизу, всплывающие сообщения. Без бизнес-логики.

import { icon } from './icons.js';

const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const mascot = (cls = '') => `<div class="mascot ${cls}" aria-hidden="true">${icon('paw')}</div>`;

export function sheet(title, body) {
  return `<div class="sheet-backdrop" data-action="closeSheet">
    <section class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="grabber"></div>
      <h2>${esc(title)}</h2>
      ${body}
    </section></div>`;
}

export function openSheet(html, { focus = true } = {}) {
  $sheet.innerHTML = html;
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
