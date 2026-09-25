// Хранилище на телефоне (IndexedDB). Только чтение и запись записей, без бизнес-логики.
// Записи не удаляются физически: для удаления ставится deleted: true (нужно для синхронизации с Google Таблицей).

import { DB_NAME, DB_VERSION, STORES } from './config.js';

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function read(name, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(name, 'readonly').objectStore(name));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function write(name, record) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function get(name, id) {
  const rec = await read(name, (s) => s.get(id));
  return rec && !rec.deleted ? rec : null;
}

// Все записи, включая помеченные удалёнными (для бекапа).
export function getAllRaw(name) {
  return read(name, (s) => s.getAll());
}

export async function getAll(name) {
  return (await getAllRaw(name)).filter((r) => !r.deleted);
}

// Сохранить запись: проставляет id, createdAt и updatedAt.
export function put(name, record) {
  const now = new Date().toISOString();
  return write(name, {
    ...record,
    id: record.id || newId(),
    createdAt: record.createdAt || now,
    updatedAt: now,
  });
}

// Сохранить запись как есть (восстановление из бекапа).
export function putRaw(name, record) {
  return write(name, record);
}
