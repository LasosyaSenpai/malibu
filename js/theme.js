// Оформление (решение 27.09): «Как на телефоне» / светлая / тёмная «Night Drive».
// Выбор хранится в localStorage (чтобы тема ставилась сразу при открытии, без белой вспышки — см. index.html)
// и дублируется в meta этого телефона.

export const THEMES = [['auto', 'Как на телефоне'], ['light', 'Светлая'], ['dark', 'Тёмная']];
const KEY = 'malibu-theme';
const BAR_COLOR = { light: '#F6F4FC', dark: '#101826' };
const media = matchMedia('(prefers-color-scheme: dark)');

export function savedTheme() {
  try {
    return localStorage.getItem(KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(pref = savedTheme()) {
  try { localStorage.setItem(KEY, pref); } catch { /* приватный режим — просто не запомним */ }
  const dark = pref === 'dark' || (pref === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR_COLOR.dark : BAR_COLOR.light);
}

// Айфон сам переключил светлое/тёмное оформление — следуем, если выбрано «Как на телефоне».
media.addEventListener?.('change', () => { if (savedTheme() === 'auto') applyTheme('auto'); });
