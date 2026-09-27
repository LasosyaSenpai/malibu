// Синхронизация с Google Таблицей: отправляем изменённое, забираем всё и сливаем (новее — побеждает).
// Ничего не удаляется ни на телефоне, ни в Таблице.

import * as L from './logic.js';
import { SYNC_ERRORS, SYNC_TIMEOUT_MS } from './config.js';
import { applyPlan, localBackupData } from './backup.js';

async function call(url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SYNC_TIMEOUT_MS);
  let res;
  try {
    // text/plain — чтобы браузер не делал предварительный запрос, который Apps Script не понимает.
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    console.warn('sync fetch failed', err);
    throw new Error(`${SYNC_ERRORS.network} (${err.name || 'ошибка'})`);
  } finally {
    clearTimeout(timer);
  }
  let out;
  try {
    out = await res.json();
  } catch {
    throw new Error(SYNC_ERRORS.server);
  }
  if (!out.ok) throw new Error(SYNC_ERRORS[out.error] || SYNC_ERRORS.server);
  return out;
}

// Любое другое действие бекап-сервера (напоминания в Telegram): { action, ... } → ответ сервера.
export function api(url, body) {
  return call(url, body);
}

// Проверить код подключения. Возвращает адрес Google Таблицы.
export async function ping(url) {
  const out = await call(url, { action: 'ping' });
  return out.spreadsheetUrl;
}

// Одна синхронизация. Возвращает { pushed, pulled, startedAt }.
export async function syncNow(url, lastSyncAt) {
  const startedAt = new Date().toISOString();
  const local = await localBackupData();
  const records = L.recordsToPush(local, lastSyncAt);
  const out = await call(url, { action: 'sync', records });
  const plan = L.planMerge(await localBackupData(), out.data || {});
  try {
    await applyPlan(plan);
  } catch (err) {
    console.warn('sync apply failed', err);
    throw new Error(`не удалось сохранить на телефоне (${err.name || err.message})`);
  }
  return { pushed: records.length, pulled: plan.added + plan.updated, startedAt };
}
