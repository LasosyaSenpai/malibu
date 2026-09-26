// Страница «Моя Malibu» (решение 26.09, вариант Б): свои фото машины, одно — обложка.
// Фото хранятся только на телефоне (IndexedDB) и в файле-бекапе — в Google Таблицу не идут (слишком большие),
// в код и на GitHub не попадают (на настоящем фото виден номер).

import * as db from './db.js';
import * as L from './logic.js';
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_SIDE } from './config.js';
import { icon } from './icons.js';
import { clearSheet, confirmTwice, esc, hint, openSheet, sheet, toast } from './ui.js';

// Уменьшить фото перед сохранением: длинная сторона — не больше PHOTO_MAX_SIDE, JPEG.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('это не картинка')); };
    img.src = url;
  });
}

// ctx: { state, afterChange(), saveMeta() } — связь с app.js.
export function createPhotos(ctx) {
  const { state } = ctx;
  const sorted = () => [...state.photos].sort((a, b) => Number(Boolean(b.cover)) - Number(Boolean(a.cover))
    || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const cover = () => state.photos.find((p) => p.cover) || null;
  const bg = (p) => `style="background-image:url('${p.data}')"`;
  const addInput = () => '<input type="file" accept="image/*" multiple hidden data-change="addPhotos">';

  // Обложка для главной, если так выбрано (иначе — картинка GPT).
  function homePhoto() {
    const c = cover();
    return state.meta.photoOnHome && c ? c.data : null;
  }

  function view() {
    const c = cover();
    const list = sorted();
    return `<div class="title-row"><a class="icon-btn" href="#/more" aria-label="Назад">${icon('back')}</a><h1>Моя Malibu</h1></div>
      ${c ? `<button class="photo-cover plain-btn" data-action="openPhoto" data-id="${esc(c.id)}" ${bg(c)}>
          ${c.caption ? `<span class="photo-cap">${esc(c.caption)}</span>` : ''}</button>`
    : hint('Добавь фото своей Malibu — первое станет обложкой')}
      <div class="photo-grid">${list.filter((p) => p !== c).map((p) => `<button class="photo-tile plain-btn" data-action="openPhoto" data-id="${esc(p.id)}" ${bg(p)}></button>`).join('')}
        <label class="photo-add">${icon('plus')}<span>фото</span>${addInput()}</label></div>
      ${c ? `<label class="switch-row"><span><b>Обложка на главной</b><div class="muted">вместо картинки в шапке</div></span>
        <input type="checkbox" class="switch" data-action="togglePhotoHome" ${state.meta.photoOnHome ? 'checked' : ''}></label>` : ''}
      <p class="muted">Фото хранятся только на этом телефоне и в файле-бекапе («Ещё → Экспорт»). В Google Таблицу и в интернет они не попадают.</p>`;
  }

  function photoSheet(p) {
    return sheet(p.cover ? 'Обложка' : 'Фото', `
      <img class="photo-full" src="${p.data}" alt="">
      <label class="field"><span>Подпись <em>необязательно</em></span><input id="ph-cap" value="${esc(p.caption || '')}" placeholder="Карпаты, сентябрь"></label>
      <button class="btn primary" data-action="savePhoto" data-id="${esc(p.id)}">Сохранить</button>
      ${p.cover ? '' : `<button class="btn outline" data-action="makeCover" data-id="${esc(p.id)}">${icon('check')} Сделать обложкой</button>`}
      <button class="btn link danger" data-action="deletePhoto" data-id="${esc(p.id)}">Удалить фото</button>`);
  }

  const find = (id) => state.photos.find((p) => p.id === id) || null;

  // Выбрали фото в галерее телефона.
  async function addFiles(files) {
    if (!files || !files.length) return;
    toast('Сохраняю фото…');
    let hasCover = Boolean(cover());
    try {
      for (const file of files) {
        const data = await shrink(file);
        await db.put('photos', { data, caption: '', date: L.todayIso(), cover: !hasCover });
        hasCover = true;
      }
    } catch (err) {
      toast(`Не получилось добавить фото: ${err.message}`);
    }
    await ctx.afterChange();
    toast(files.length > 1 ? `Добавлено фото: ${files.length}` : 'Фото добавлено');
  }

  const actions = {
    openPhoto(el) {
      const p = find(el.dataset.id);
      if (p) openSheet(photoSheet(p));
    },

    async savePhoto(el) {
      await db.put('photos', { ...find(el.dataset.id), caption: document.getElementById('ph-cap').value.trim() });
      clearSheet();
      await ctx.afterChange();
    },

    async makeCover(el) {
      for (const p of state.photos) {
        const isCover = p.id === el.dataset.id;
        if (Boolean(p.cover) !== isCover) await db.put('photos', { ...p, cover: isCover });
      }
      clearSheet();
      toast('Теперь это обложка');
      await ctx.afterChange();
    },

    async deletePhoto(el) {
      if (!confirmTwice(el)) return;
      const p = find(el.dataset.id);
      await db.put('photos', { ...p, deleted: true, data: '' });
      // Удалили обложку — обложкой становится следующее фото.
      const next = p.cover ? sorted().find((x) => x.id !== p.id) : null;
      if (next) await db.put('photos', { ...next, cover: true });
      clearSheet();
      toast('Фото удалено');
      await ctx.afterChange();
    },

    async togglePhotoHome(el) {
      await ctx.saveMeta({ photoOnHome: el.checked });
    },
  };

  return { view, homePhoto, addFiles, actions };
}
