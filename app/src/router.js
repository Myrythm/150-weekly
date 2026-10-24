/*
 * Routes and guards.
 *
 *   createAppRouter(pinia, { history }?)   history defaults to createWebHistory()
 *
 * App routes (meta.auth): week `/`, log `/log`, activity `/activity/:id?from=week|log`.
 * Auth routes (meta.guest): login, register, check-email, forgot, reset; each passes ?next= on.
 * Unknown paths go to `/`.
 *
 * Every navigation waits for auth.boot(). Logged out on an app route goes to /login?next=<path>
 * (no next for the bare week page); logged in on an auth route goes to next (same-site paths
 * only) or `/`. /reset only opens in recovery mode, otherwise the forgot screen shows the expired
 * copy. The first route of a page load drops any auth link left in the URL. Watchers move the
 * visitor when the state changes outside a navigation: login done, session ended, a recovery
 * event from another tab.
 *
 * scrollBehavior: an app route waits for the data to be ready and one tick, then scrolls to the hash
 * element (a section link such as /#splits) minus its scroll-margin-top, to a saved position (back and forward), or to the top.
 */
import { watch, nextTick } from 'vue';
import { createRouter, createWebHistory, START_LOCATION } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useDataStore } from './stores/data.js';
import { COPY } from './auth/copy.js';
import { cleanLocation, safeNext } from './auth/link.js';
import WeekPage from './pages/WeekPage.vue';
import LogPage from './pages/LogPage.vue';
import ActivityPage from './pages/ActivityPage.vue';
import LoginPage from './pages/auth/LoginPage.vue';
import RegisterPage from './pages/auth/RegisterPage.vue';
import CheckEmailPage from './pages/auth/CheckEmailPage.vue';
import ForgotPage from './pages/auth/ForgotPage.vue';
import ResetPage from './pages/auth/ResetPage.vue';

const DEFAULT_TITLE = 'Weekly 150';

function nextQuery(to) {
  return to.fullPath && to.fullPath !== '/' ? { next: to.fullPath } : {};
}

export function createAppRouter(pinia, opts) {
  opts = opts || {};
  const auth = useAuthStore(pinia);

  function loggedIn() { return !!auth.user && !auth.sessionEnded; }

  const routes = [
    { path: '/', name: 'week', component: WeekPage, meta: { auth: true } },
    { path: '/log', name: 'log', component: LogPage, meta: { auth: true, title: 'Full log, Weekly 150' } },
    { path: '/activity/:id', name: 'activity', component: ActivityPage, meta: { auth: true } },
    { path: '/login', name: 'login', component: LoginPage, meta: { guest: true } },
    { path: '/register', name: 'register', component: RegisterPage, meta: { guest: true } },
    { path: '/check-email', name: 'check-email', component: CheckEmailPage, meta: { guest: true } },
    { path: '/forgot', name: 'forgot', component: ForgotPage, meta: { guest: true } },
    {
      path: '/reset', name: 'reset', component: ResetPage, meta: { guest: true },
      beforeEnter: function () {
        if (auth.recoveryMode) return true;
        /* a logged-in visitor is sent away from the auth screens: no message for a screen they never see */
        if (loggedIn()) return { path: '/' };
        auth.setMsg(COPY.expired, 'error');
        auth.setFocus('forgot-identifier');
        return { name: 'forgot' };
      }
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ];

  const data = useDataStore(pinia);

  /* the page shows its sections only once the data is loaded, so a hash target exists after that */
  function whenDataReady() {
    return new Promise(function (resolve) {
      if (data.ready) { resolve(); return; }
      const stop = watch(function () { return data.ready; }, function (on) { if (on) { stop(); resolve(); } });
    });
  }

  function scrollMarginTop(el) {
    try { return parseFloat(window.getComputedStyle(el).getPropertyValue('scroll-margin-top')) || 0; } catch (e) { return 0; }
  }

  function scrollBehavior(to, from, saved) {
    const place = function () {
      if (saved) return saved;
      const id = to.hash.length > 1 ? to.hash.slice(1) : '';
      const el = id ? document.getElementById(id) : null;
      /* a target inside a hidden panel (the log panel while the age step shows) cannot be scrolled to */
      /* vue-router scrolls to the element's exact top; the sticky header needs the CSS scroll-margin-top (72px, 120px on phones) kept, as a native hash scroll does */
      if (el && !el.closest('[hidden]')) return { el: to.hash, top: scrollMarginTop(el) };
      return { top: 0 };
    };
    if (!to.meta.auth) return place();
    return whenDataReady().then(nextTick).then(place);
  }

  const router = createRouter({ history: opts.history || createWebHistory(), routes: routes, scrollBehavior: scrollBehavior });

  /* Back and Forward: the message of the screen being left must not show on the one reached, unless
     that navigation sets a new message (the /reset guard). A forward navigation (push, replace) keeps
     what the leaving screen set for the next one ("New password saved."). */
  let popSeq = null;
  router.options.history.listen(function (to, from, info) {
    if (info && info.type === 'pop') popSeq = auth.msgSeq;
  });

  router.beforeEach(async function (to, from) {
    await auth.whenReady();
    if (from === START_LOCATION) {
      const clean = cleanLocation(to);
      if (clean) return clean;
    }
    if (to.meta.auth && !loggedIn()) return { name: 'login', query: nextQuery(to) };
    if (to.meta.guest && loggedIn()) return safeNext(to.query.next);
    return true;
  });

  watch(loggedIn, function (on) {
    const cur = router.currentRoute.value;
    if (cur === START_LOCATION) return;
    if (on && cur.meta.guest) router.replace(safeNext(cur.query.next));
    else if (!on && auth.user && cur.meta.auth) router.replace({ name: 'login', query: nextQuery(cur) });
  });

  /* PASSWORD_RECOVERY after boot (a recovery link opened in another tab): open the new password form */
  watch(function () { return auth.recoveryMode; }, function (on) {
    const cur = router.currentRoute.value;
    if (!on || !auth.ready || auth.user || cur === START_LOCATION || cur.name === 'reset') return;
    auth.setMsg('');
    router.replace({ name: 'reset' });
  });

  /* the title of a page comes from route meta.title; a page that needs a dynamic title sets it itself after this runs */
  router.afterEach(function (to) {
    if (popSeq !== null && auth.msgSeq === popSeq) auth.setMsg('');
    popSeq = null;
    document.title = to.meta.title || DEFAULT_TITLE;
  });

  return router;
}
