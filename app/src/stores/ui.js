/*
 * The UI store: the theme, the live region text and the week page's age step state. Ported from
 * web/js/app.js (loadTheme, saveTheme, applyTheme, the theme toggle handler, announce, askingAge,
 * ageStepOpen and the header Log link handlers).
 *
 *   theme          'auto' | 'light' | 'dark'; read from browser localStorage (w150.theme) on creation
 *   live           text of the live region (#live)
 *   noticeSeq      last auth notice sequence number the live region announced
 *   askingAge      the visitor asked to change the age (Change age); the step also shows when the age is unset or under 5
 *   ageStepOpen    the age step replaces the log panel (unset, under 5, or askingAge)
 *   pendingFocus   '' | 'age' | 'log': a focus request for the week page (the header Log links, Change age)
 *   cycleTheme()   auto, light, dark, auto; applies data-theme on <html> and stores the choice
 *   announce(text) clear the region, then set the text after 60 ms so a screen reader repeats it
 *   openAge()      open the age step and ask for focus on its input
 *   requestFocus(w) ask the week page to focus the age input ('age') or the activity select ('log')
 *
 * The theme is the only value kept outside the server (browser localStorage, always in try/catch:
 * storage can throw). readTheme and applyTheme are exported so the auth store shows the auth
 * screens in the same theme before this store exists.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useDataStore } from './data.js';

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

  const askingAge = ref(false);
  const pendingFocus = ref('');
  const ageStepOpen = computed(function () {
    const g = useDataStore().group;
    return g === 'unset' || g === 'under5' || askingAge.value;
  });

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

  function requestFocus(which) { pendingFocus.value = which; }
  function openAge() {
    askingAge.value = true;
    pendingFocus.value = 'age';
  }

  return { theme, live, noticeSeq, askingAge, ageStepOpen, pendingFocus, cycleTheme, announce, requestFocus, openAge };
});
