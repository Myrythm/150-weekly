import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { createAppRouter } from './router.js';
import { useAuthStore } from './stores/auth.js';
import { captureInitialLink, routeForLink } from './auth/link.js';
import './styles/app.css';

/* supabase-js reads and clears the hash of an email link when the client starts: read it first */
const initial = captureInitialLink();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const auth = useAuthStore(pinia);
auth.configure();
auth.installWindowHooks();
auth.boot(initial.link);

const router = createAppRouter(pinia);
app.use(router);

/* an email link picks the first screen. Called right after install, before the first navigation
   runs its guards, so that navigation is cancelled and the link URL never becomes a ?next= */
const target = auth.client ? routeForLink(initial.link) : null;
if (target) {
  auth.setMsg(target.msg || '', target.tone);
  auth.setFocus(target.focus);
  router.replace({ path: target.path, query: target.query || {} });
}

app.mount('#root');
