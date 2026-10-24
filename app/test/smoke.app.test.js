import { mount } from '@vue/test-utils';
import App from '../src/App.vue';
test('App mounts', () => { expect(mount(App, { global: { stubs: ['router-view'] } }).exists()).toBe(true); });
test('GPX global is loaded', () => { expect(typeof globalThis.GPX.analyze).toBe('function'); });
