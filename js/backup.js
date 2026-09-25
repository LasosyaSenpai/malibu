// Файл-бекап: экспорт в JSON и восстановление из него.

import * as db from './db.js';
import * as L from './logic.js';
import { BACKUP_STORES } from './config.js';

export async function localBackupData() {
  const data = {};
  for (const store of BACKUP_STORES) data[store] = await db.getAllRaw(store);
  return data;
}

// На телефоне открывает меню «Поделиться» (там есть «Сохранить в Файлы»), на компьютере — скачивает файл.
// Возвращает false, если пользователь закрыл меню, ничего не сохранив.
export async function exportBackup() {
  const backup = L.buildBackup(await localBackupData(), new Date().toISOString());
  const name = `malibu-backup-${L.todayIso()}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });

  const isPhone = matchMedia('(pointer: coarse)').matches;
  if (isPhone && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  }

  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function readBackupFile(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    throw new Error('Это не файл-бекап Malibu Assistant (не читается)');
  }
  const check = L.validateBackup(obj);
  if (check.error) throw new Error(check.error);
  return obj;
}

export async function applyPlan(plan) {
  for (const [store, records] of Object.entries(plan.toWrite)) {
    for (const rec of records) await db.putRaw(store, rec);
  }
}
