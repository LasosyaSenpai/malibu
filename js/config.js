// Все константы приложения. Никаких «магических» чисел и строк в других файлах.

export const APP_VERSION = '0.5.0';
export const APP_ID = 'malibu-assistant';

// Хранилище на телефоне (IndexedDB). Новые разделы — добавлять в STORES и поднимать DB_VERSION.
export const DB_NAME = 'malibu-assistant';
export const DB_VERSION = 5;
export const STORES = ['car', 'odometer', 'meta', 'works', 'plans', 'parts', 'stock', 'fuel', 'expenses', 'settings', 'parkingDays', 'photos'];

// Что попадает в файл-бекап и в Google Таблицу. `meta` — настройки этого телефона, туда не идут.
// `settings` — общие настройки (домашняя парковка), `parkingDays` — дни, отмеченные в календаре парковки.
export const BACKUP_STORES = ['car', 'odometer', 'works', 'plans', 'parts', 'stock', 'fuel', 'expenses', 'settings', 'parkingDays'];
// Только в файле-бекапе: фото слишком большие для Google Таблицы (решение 26.09).
export const FILE_ONLY_STORES = ['photos'];
export const FILE_BACKUP_STORES = [...BACKUP_STORES, ...FILE_ONLY_STORES];
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
// Фото в шапке главного экрана — Malibu из картинки GPT «Forest Sunset» (решение 26.09).
export const CAR_PHOTO = 'img/car-header.jpg';
export const TIP_EXPORT_DAYS = 14; // напомнить про файл-бекап, если не делали дольше
export const TIP_KM_DAYS = 7; // напомнить обновить пробег
export const BIG_JUMP_KM = 3000; // переспросить, если пробег вырос больше чем на столько
export const MIN_DAYS_FOR_AVG = 7; // «км в день» считаем, когда данных хотя бы за неделю
export const SLEEPY_DAYS = 14; // не открывала приложение столько дней — акулёнок «проснулся»

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
  work: 'из работы',
  fuel: 'из заправки',
};

// ---------- Обслуживание ----------

// Категории работ. Все одного лавандового цвета, различаются иконкой (решение 26.09).
export const CATEGORIES = [
  { key: 'to', label: 'ТО', icon: 'droplet' },
  { key: 'engine', label: 'Двигатель', icon: 'gear' },
  { key: 'chassis', label: 'Ходовая', icon: 'wheel' },
  { key: 'brakes', label: 'Тормоза', icon: 'disc' },
  { key: 'body', label: 'Кузов', icon: 'car' },
  { key: 'options', label: 'Опции', icon: 'radar' },
  { key: 'care', label: 'Уход', icon: 'sparkles' },
  { key: 'other', label: 'Другое', icon: 'box' },
];

// Регламент для Malibu 1.5 Turbo (LFV) + АКПП 6T40 — одобрен пользователем 26.09.2026 (docs/MAINTENANCE.md).
// kind: replace — по интервалу замены; check — по интервалу проверки; season — сезонная переобувка.
export const NODES = [
  { key: 'oil', title: 'Масло двигателя', icon: 'droplet', kind: 'replace', km: 7000, months: 12,
    what: 'dexos1 Gen 3 · SAE 5W-30 · 4 л + фильтр ACDelco UPF64R',
    gm: 'по датчику ресурса масла, минимум раз в год',
    tip: 'Для турбомотора с прямым впрыском, города и жары — чаще, чем по заводу. Dexos1 Gen 3 лучше защищает турбину.' },
  { key: 'atf', title: 'Масло АКПП', icon: 'gear', kind: 'replace', km: 40000,
    what: 'DEXRON-VI · слив-залив ~4–6 л (коробка 6T40)',
    gm: '72 000 км в тяжёлых условиях',
    tip: 'За один слив-залив меняется примерно половина масла — поэтому чаще, чем по заводу.' },
  { key: 'plugs', title: 'Свечи зажигания', icon: 'bolt', kind: 'replace', km: 70000,
    what: 'ACDelco 41-153 (GM 12673527) · зазор 0,6–0,7 мм', gm: '96 000 км' },
  { key: 'coolant', title: 'Антифриз', icon: 'snowflake', kind: 'replace', months: 60,
    what: 'DEX-COOL, 50/50 с дистиллированной водой · система 6,1 л', gm: '5 лет / 240 000 км' },
  { key: 'brakeFluid', title: 'Тормозная жидкость', icon: 'disc', kind: 'replace', months: 24,
    what: 'DOT 3', gm: '5 лет', tip: 'Чаще, чем по заводу, — из-за поездок в горы.' },
  { key: 'airFilter', title: 'Воздушный фильтр', icon: 'filter', kind: 'replace', km: 30000, months: 24,
    what: 'GM 23430312 (WIX WA9853, ACDelco A3208C)', gm: '72 000 км / 4 года' },
  { key: 'cabinFilter', title: 'Салонный фильтр', icon: 'fan', kind: 'replace', km: 15000, months: 12,
    what: 'GM 13508023 (WIX WP9357, ACDelco CF185)', gm: '36 000 км / 2 года' },
  { key: 'tires', title: 'Шины: переобувка', icon: 'wheel', kind: 'season',
    what: 'Зимние — когда днём стабильно ниже +7 °C (в Одессе обычно ноябрь), летние — в апреле',
    gm: 'сезонно' },
  { key: 'battery', title: 'Аккумулятор', icon: 'battery', kind: 'check', months: 12,
    what: 'Только AGM (есть старт-стоп): H6 / group 48, ~70 А·ч, например ACDelco 48AGM',
    gm: 'проверка перед зимой', tip: 'Менять не нужно, пока проверка показывает, что он в порядке.' },
  { key: 'belt', title: 'Ремень навесного', icon: 'refresh', kind: 'check', months: 12,
    what: 'Осмотр на трещины и износ — мастер смотрит глазами за минуту', gm: 'осмотр в 10 лет / 240 000 км' },
  { key: 'inspection', title: 'Осмотр ходовой и тормозов', icon: 'wheel', kind: 'check', km: 12000, months: 12,
    what: 'Колодки и диски, подвеска, утечки', gm: 'каждые 12 000 км' },
];

// Сезонная переобувка (месяц-день). from — начинаем напоминать, due — после этого срочно.
export const TIRE_SEASONS = [
  { to: 'winter', label: 'зимние', from: '10-15', due: '11-15' },
  { to: 'summer', label: 'летние', from: '03-20', due: '04-20' },
];

export const NODE_WARN_SHARE = 0.85; // «скоро пора», когда израсходовано 85% интервала
export const CHECK_FRESH_MONTHS = 12; // «проверено» считается свежим год

// ---------- Расходы и заправки (решения 26.09: обзор-кольцо, быстрая форма заправки) ----------

// Бак Malibu 2016 1.5T — 15,8 галлона ≈ 60 л. Нужен только для проверки: больше не поместится.
export const TANK_LITERS = 60;
export const TANK_SLACK_LITERS = 2; // горловина и погрешность колонки
// Цена за литр вне этих рамок — скорее всего, перепутаны литры и сумма.
export const FUEL_PRICE_MIN = 20;
export const FUEL_PRICE_MAX = 150;
// АЗС кнопками. Свои названия («Другая») запоминаются и тоже становятся кнопками.
export const FUEL_STATIONS = ['OKKO', 'WOG', 'SOCAR', 'UPG', 'Укрнафта'];
export const FUEL_TYPES = ['А-92', 'А-95', 'А-95 премиум'];
export const FUEL_TYPE_DEFAULT = 'А-95';
// Расход «полный бак → полный бак». Отрезок вне рамок или сильно не как обычно — подсвечивается
// и не входит в средний (скорее всего, пропущена заправка или бак был не полный).
export const FUEL_L100_MIN = 4;
export const FUEL_L100_MAX = 25;
export const FUEL_ODD_SHARE = 0.3; // отклонение от обычного больше чем на 30%
export const FUEL_ODD_MIN_SEGMENTS = 3; // сравнивать с обычным, когда отрезков хотя бы столько

// Категории расходов. Топливо и «ТО и ремонт» собираются сами — из заправок и работ на СТО.
export const FUEL_CATEGORY = { key: 'fuel', label: 'Топливо', icon: 'fuel' };
export const SERVICE_CATEGORY = { key: 'service', label: 'ТО и ремонт', icon: 'tool' };
export const EXPENSE_CATEGORIES = [
  { key: 'wash', label: 'Мойка', icon: 'droplet' },
  { key: 'parking', label: 'Парковка', icon: 'parking' },
  { key: 'insurance', label: 'Страховка', icon: 'shield' },
  { key: 'fine', label: 'Штраф', icon: 'alert' },
  { key: 'accessories', label: 'Аксессуары', icon: 'bag' },
  { key: 'care', label: 'Уход', icon: 'sparkles' },
  { key: 'other', label: 'Другое', icon: 'box' },
];

// ---------- Фото «Моя Malibu» и PDF сервисной книжки (решения 26.09) ----------

// Фото уменьшаются на телефоне перед сохранением (хранятся в IndexedDB и файле-бекапе).
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_JPEG_QUALITY = 0.82;
// Библиотека PDF и шрифт с кириллицей лежат в приложении — выгрузка работает без интернета.
export const PDF_LIBS = ['vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'];
export const PDF_FONTS = { normal: 'vendor/Montserrat-Regular.ttf', bold: 'vendor/Montserrat-SemiBold.ttf' };

// Домашняя парковка (решение 26.09): платно каждые сутки, кроме ночей «не дома». Итог — одной строкой на месяц.
export const HOME_PARKING_CATEGORY = { key: 'homeParking', label: 'Парковка у дома', icon: 'home' };
export const HOME_PARKING_ID = 'homeParking'; // id записи настройки в `settings`

// «Проехала за месяц»: запись пробега до начала месяца берём за точку отсчёта, только если она не старше.
export const MONTH_KM_BASE_DAYS = 7;

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
