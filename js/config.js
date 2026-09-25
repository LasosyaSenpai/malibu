// Все константы приложения. Никаких «магических» чисел и строк в других файлах.

export const APP_VERSION = '0.1.0';
export const APP_ID = 'malibu-assistant';

// Хранилище на телефоне (IndexedDB). Новые разделы — добавлять в STORES и поднимать DB_VERSION.
export const DB_NAME = 'malibu-assistant';
export const DB_VERSION = 1;
export const STORES = ['car', 'odometer', 'meta'];

// Что попадает в файл-бекап. `meta` — настройки этого телефона, в бекап не идут.
export const BACKUP_STORES = ['car', 'odometer'];
export const BACKUP_VERSION = 1;

// Подставляется в форму при первом запуске. Личных данных (VIN и т.п.) здесь быть не должно — код публичный.
export const CAR_DEFAULTS = {
  make: 'Chevrolet',
  model: 'Malibu',
  year: 2016,
  engine: '1.5 Turbo',
  vin: '',
  purchaseDate: '',
  purchaseKm: '',
};

export const MIN_CAR_YEAR = 1950;
export const TIP_EXPORT_DAYS = 14; // напомнить про файл-бекап, если не делали дольше
export const TIP_KM_DAYS = 7; // напомнить обновить пробег
export const BIG_JUMP_KM = 3000; // переспросить, если пробег вырос больше чем на столько
export const MIN_DAYS_FOR_AVG = 7; // «км в день» считаем, когда данных хотя бы за неделю

// Синхронизация с Google Таблицей через Apps Script пользователя (папка backend/).
export const SYNC_CODE_PREFIX = 'https://script.google.com/macros/s/';
export const SYNC_DEBOUNCE_MS = 1500; // ждём, пока пользователь закончит вводить, и отправляем пачкой
export const SYNC_TIMEOUT_MS = 30000;
export const SYNC_ERRORS = {
  bad_key: 'Код подключения не подходит — проверь, что он скопирован целиком',
  too_many: 'Слишком много записей за раз — нажми «Сохранить сейчас» ещё раз',
  server: 'Ошибка в Google Таблице — попробуй позже',
  network: 'Нет связи с Google — сохраню, когда появится интернет',
};

export const SOURCE_LABELS = {
  purchase: 'при покупке',
  manual: 'вручную',
};
