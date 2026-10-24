/*
 * The UI store: the theme and the live region text. Ported from web/js/app.js (loadTheme,
 * saveTheme, applyTheme, the theme toggle handler and announce).
 *
 *   theme          'auto' | 'light' | 'dark'; read from browser localStorage (w150.theme) on creation
 *   live           text of the live region (#live)
 *   noticeSeq      last auth notice sequence number the live region announced
 *   cycleTheme()   auto, light, dark, auto; applies data-theme on <html> and stores the choice
 *   announce(text) clear the region, then set the text after 60 ms so a screen reader repeats it
 *
 * The theme is the only value kept outside the server (browser localStorage, always in try/catch:
 * storage can throw). readTheme and applyTheme are exported so the auth store shows the auth
 * screens in the same theme before this store exists.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

const THEME_KEY = 'w150.theme';
const ANNOUNCE_DELAY_MS = 60;

export function readTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    const v = raw ? JSON.parse(raw) : 'auto';
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch (e) { return 'auto'; }
}

function writeTheme(v) { try { localStorage.setItem(THEME_KEY, JSON.stringify(v)); } catch (e) { /* storage blocked: the choice lasts until reload */ } }

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export const useUiStore = defineStore('ui', function () {
  const theme = ref(readTheme());
  const live = ref('');
  const noticeSeq = ref(0);   /* last auth.notice.seq the live region handled */
  let timer = null;

  applyTheme(theme.value);

  function cycleTheme() {
    theme.value = theme.value === 'auto' ? 'light' : theme.value === 'light' ? 'dark' : 'auto';
    applyTheme(theme.value);
    writeTheme(theme.value);
  }

  function announce(text) {
    live.value = '';
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; live.value = String(text || ''); }, ANNOUNCE_DELAY_MS);
  }

  return { theme, live, noticeSeq, cycleTheme, announce };
});
