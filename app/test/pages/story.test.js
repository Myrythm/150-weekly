import { h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, RouterView } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../../src/router.js';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';
import { parseYmd } from '../../src/core/dates.js';
import { seedSessions } from '../../src/core/sample.js';
import { makeCtx } from '../story/fakeCtx.js';
import * as exp from '../../src/story/export.js';
import * as photoMod from '../../src/story/photo.js';
import StoryPage from '../../src/pages/StoryPage.vue';

/* the test environment has no canvas encoder: the export calls are stand-ins */
vi.mock('../../src/story/export.js', async function (importOriginal) {
  const real = await importOriginal();
  return Object.assign({}, real, {
    exportPng: vi.fn(function () { return Promise.resolve(new Blob(['png'], { type: 'image/png' })); }),
    exportVideo: vi.fn(function () { return Promise.resolve(null); }),
    canShareFile: vi.fn(function () { return false; }),
    shareFile: vi.fn(function () { return Promise.resolve(); }),
    downloadBlob: vi.fn()
  });
});

/* the real photo loader by default; a test can make it resolve out of order */
vi.mock('../../src/story/photo.js', async function (importOriginal) {
  const real = await importOriginal();
  return Object.assign({}, real, { loadPhoto: vi.fn(real.loadPhoto), releasePhoto: vi.fn(real.releasePhoto) });
});

const realGetContext = HTMLCanvasElement.prototype.getContext;
const realFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

let contexts = [];
beforeAll(function () {
  HTMLCanvasElement.prototype.getContext = function () { const c = makeCtx(); contexts.push(c); return c; };
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: function () { return Promise.resolve([]); } } });
});
afterAll(function () {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  if (realFonts) Object.defineProperty(document, 'fonts', realFonts);
  else delete document.fonts;
});

async function mountStory(path, opts) {
  opts = opts || {};
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  const auth = useAuthStore(pinia);
  auth.user = { id: 'u1' };
  auth.profile = { username: 'ana', displayName: 'Ana' };
  auth.ready = true;
  const data = useDataStore(pinia);
  data.today = parseYmd('2026-10-24');
  data.prefs.age = opts.age === undefined ? 30 : opts.age;
  data.sessions = opts.sessions || seedSessions(data.today);
  if (opts.tracks) data.tracks = opts.tracks;
  await router.push(path);
  await router.isReady();
  const component = opts.viaRouter ? { render: function () { return h(RouterView); } } : StoryPage;
  const wrapper = mount(component, { global: { plugins: [pinia, router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, data, router };
}

const q = (sel) => document.querySelector(sel);
const text = (sel) => q(sel).textContent.trim();
const pressed = (sel) => q(sel).getAttribute('aria-pressed') === 'true';
const NUMS = ['dist', 'time', 'pace', 'hr', 'best', 'maxhr', 'climb', 'cad'];
const pressedNums = () => NUMS.filter((k) => pressed('#story-num-' + k));
const MISSING = 'This run cannot be made into a story. A story needs a run with a stored route.';

const S = (id, type, trackId) => {
  const s = { id, date: '2026-10-20', type, minutes: 30, intensity: 'moderate', balance: false, source: 'gpx', sample: false, createdAt: 1 };
  if (trackId) s.trackId = trackId;
  return s;
};
const square = { lat: [-6.2, -6.2, -6.19, -6.19, -6.2], lon: [106.8, 106.81, 106.81, 106.8, 106.8], t: null, brk: [] };
const split = (index, pace, partial) => ({ index, distanceM: partial ? 500 : 1000, timeS: partial ? pace / 2 : pace, paceSPerKm: pace, partial: !!partial });
const trackRec = (metrics) => ({ name: 'Short one', type: 'run', startTime: new Date(2026, 9, 20, 7, 0).getTime(), metrics, track: square, importedAt: 1 });
const oneKm = trackRec({ distanceM: 1500, movingS: 600, avgPaceSPerKm: 400, bestKmPaceS: 395, splits: [split(1, 395), split(2, 410, true)] });
const routeOnly = trackRec({ distanceM: 3020, splits: [] });

beforeEach(function () { document.body.innerHTML = ''; document.title = ''; contexts = []; vi.clearAllMocks(); });

describe('story page for the sample run', function () {
  test('canvas, back link, title and the default controls', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    const c = q('#story-canvas');
    expect(c).not.toBeNull();
    expect(c.getAttribute('width')).toBe('1080');
    expect(c.getAttribute('height')).toBe('1920');
    expect(c.getAttribute('role')).toBe('img');
    expect(c.getAttribute('aria-label')).toMatch(/^Story preview, template Race bib\. Distance \d\.\d\d km, time \d+:\d\d, pace \d:\d\d per km, average heart rate \d+ bpm\.$/);
    expect(q('#story-missing').hidden).toBe(true);
    expect(text('#story-title')).toBe('Story');
    expect(document.title).toBe('Story, Morning loop, Weekly 150');
    expect(q('#story-back').getAttribute('href')).toBe('/activity/sample_32?from=log');
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((id) => expect(q('#story-tpl-' + id)).not.toBeNull());
    expect(pressed('#story-tpl-A')).toBe(true);
    expect(pressed('#story-tpl-B')).toBe(false);
    expect(text('#story-tpl-A')).toBe('Race bib Static');
    expect(text('#story-tpl-D')).toBe('Route trace Animated');
    expect(q('#story-tpl-note').hidden).toBe(true);
    expect(pressed('#story-hero-dist')).toBe(true);
    expect(pressedNums()).toEqual(['time', 'pace', 'hr']);
    expect(text('#story-num-count')).toBe('3 of 4 small numbers used.');
    expect(text('#story-create')).toBe('Create picture');
    expect(q('#story-share')).toBeNull();
    expect(q('#story-download')).toBeNull();
    expect(q('#story-status').getAttribute('role')).toBe('status');
    expect(q('#story-photo').getAttribute('type')).toBe('file');
    expect(q('#story-photo').getAttribute('accept')).toBe('image/*');
    expect(q('#story-photo').closest('label')).not.toBeNull();
    expect(q('#story-zoom').getAttribute('min')).toBe('1');
    expect(q('#story-zoom').getAttribute('max')).toBe('3');
    expect(q('#story-zoom').getAttribute('step')).toBe('0.05');
    expect(q('#story-color-blue').style.getPropertyValue('--c')).toBe('#1E4FA0');
    expect(q('#story-color-blue').getAttribute('aria-label')).toBe('Blue');
    expect(pressed('#story-color-blue')).toBe(true);
    expect(q('#story-color-custom').getAttribute('type')).toBe('color');
    expect(text('#story-opacity-out')).toBe('100%');
    wrapper.unmount();
  });

  test('from=week keeps from on the back link; the activity title follows the page', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=week');
    expect(q('#story-back').getAttribute('href')).toBe('/activity/sample_32?from=week');
    wrapper.unmount();
  });

  test('template choice is saved; an animated one makes a video', async function () {
    const { wrapper, data } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-tpl-D').trigger('click');
    expect(data.prefs.story.template).toBe('D');
    expect(pressed('#story-tpl-D')).toBe(true);
    expect(pressed('#story-tpl-A')).toBe(false);
    expect(text('#story-create')).toBe('Create video');
    expect(q('#story-canvas').getAttribute('aria-label')).toMatch(/^Story preview, template Route trace\./);
    wrapper.unmount();
  });

  test('small numbers: up to four, then nothing; back to recommended', async function () {
    const { wrapper, data } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-num-best').trigger('click');
    expect(pressedNums()).toEqual(['time', 'pace', 'hr', 'best']);
    expect(text('#story-num-count')).toBe('4 of 4 small numbers used.');
    expect(data.prefs.story.small).toEqual(['time', 'pace', 'hr', 'best']);
    await wrapper.find('#story-num-maxhr').trigger('click');
    expect(pressedNums()).toEqual(['time', 'pace', 'hr', 'best']);
    expect(text('#story-num-count')).toBe('4 of 4 small numbers used.');
    await wrapper.find('#story-num-time').trigger('click');
    expect(pressedNums()).toEqual(['pace', 'hr', 'best']);
    await wrapper.find('#story-hero-pace').trigger('click');
    expect(data.prefs.story.hero).toBe('pace');
    await wrapper.find('#story-num-rec').trigger('click');
    expect(data.prefs.story.hero).toBe('dist');
    expect(data.prefs.story.small).toBeNull();
    expect(pressed('#story-hero-dist')).toBe(true);
    expect(pressedNums()).toEqual(['time', 'pace', 'hr']);
    expect(text('#story-num-count')).toBe('3 of 4 small numbers used.');
    wrapper.unmount();
  });

  test('the main number cannot also be a small number', async function () {
    const { wrapper, data } = await mountStory('/story/sample_32?from=log');
    expect(q('#story-num-time').disabled).toBe(false);
    expect(q('#story-num-dist').disabled).toBe(true);
    await wrapper.find('#story-hero-time').trigger('click');
    expect(data.prefs.story.hero).toBe('time');
    expect(pressed('#story-hero-time')).toBe(true);
    expect(q('#story-num-time').disabled).toBe(true);
    expect(q('#story-num-time').getAttribute('aria-pressed')).toBe('false');
    expect(q('#story-num-dist').disabled).toBe(false);
    wrapper.unmount();
  });

  test('opacity and colour reset', async function () {
    const { wrapper, data } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-opacity').setValue('50');
    expect(data.prefs.story.opacity).toBe(50);
    expect(text('#story-opacity-out')).toBe('50%');
    await wrapper.find('#story-color-red').trigger('click');
    expect(data.prefs.story.color).toBe('#C8281C');
    expect(pressed('#story-color-red')).toBe(true);
    expect(pressed('#story-color-blue')).toBe(false);
    await wrapper.find('#story-color-custom').setValue('#123456');
    expect(data.prefs.story.color).toBe('#123456');
    await wrapper.find('#story-color-reset').trigger('click');
    expect(data.prefs.story.color).toBe('#1E4FA0');
    expect(data.prefs.story.opacity).toBe(100);
    expect(text('#story-opacity-out')).toBe('100%');
    expect(pressed('#story-color-blue')).toBe(true);
    wrapper.unmount();
  });

  test('a file that is not a picture shows the photo error', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    expect(q('#story-photo-error')).toBeNull();
    const input = q('#story-photo');
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await wrapper.find('#story-photo').trigger('change');
    await flushPromises();
    expect(text('#story-photo-error')).toBe('That file could not be read as a picture. Try a JPG or PNG.');
    expect(q('#story-nophoto').disabled).toBe(true);
    wrapper.unmount();
  });

  test('a saved template that this run cannot use falls back to A without changing the setting', async function () {
    const sessions = [S('r1', 'run', 't_one')];
    const { wrapper, data } = await mountStory('/story/r1', { sessions, tracks: { t_one: oneKm } });
    data.setStoryPrefs({ template: 'C' });
    await flushPromises();
    expect(pressed('#story-tpl-A')).toBe(true);
    expect(pressed('#story-tpl-C')).toBe(false);
    expect(data.prefs.story.template).toBe('C');
    wrapper.unmount();
  });
});

describe('story page, templates and numbers that need data', function () {
  test('one full km: C is unavailable with its reason', async function () {
    const { wrapper } = await mountStory('/story/r1', { sessions: [S('r1', 'run', 't_one')], tracks: { t_one: oneKm } });
    expect(q('#story-canvas')).not.toBeNull();
    expect(q('#story-tpl-C').disabled).toBe(true);
    expect(text('#story-tpl-note')).toContain('Needs at least 2 full km.');
    expect(q('#story-tpl-A').disabled).toBe(false);
    expect(document.title).toBe('Story, Short one, Weekly 150');
    expect(q('#story-back').getAttribute('href')).toBe('/activity/r1');
    wrapper.unmount();
  });

  test('no age: E is unavailable', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log', { age: null });
    expect(q('#story-tpl-E').disabled).toBe(true);
    expect(text('#story-tpl-note')).toContain('Needs a weekly target. Set your age first.');
    expect(q('#story-tpl-C').disabled).toBe(false);
    wrapper.unmount();
  });

  test('a route without times: no time or pace, the label names the distance', async function () {
    const { wrapper } = await mountStory('/story/r2', { sessions: [S('r2', 'run', 't_route')], tracks: { t_route: routeOnly } });
    expect(q('#story-hero-dist').disabled).toBe(false);
    expect(q('#story-hero-time').disabled).toBe(true);
    expect(q('#story-hero-pace').disabled).toBe(true);
    expect(q('#story-num-time').disabled).toBe(true);
    expect(q('#story-num-pace').disabled).toBe(true);
    expect(q('#story-canvas').getAttribute('aria-label')).toBe('Story preview, template Race bib. Distance 3.02 km.');
    expect(text('#story-num-count')).toBe('0 of 4 small numbers used.');
    wrapper.unmount();
  });
});

describe('story page, not available', function () {
  const cases = [
    ['an unknown id', '/story/nope', {}, '/log'],
    ['a walk session', '/story/w1', { sessions: [S('w1', 'walk', 't_one')], tracks: { t_one: oneKm } }, '/activity/w1'],
    ['a run with no trackId', '/story/r3', { sessions: [S('r3', 'run')] }, '/activity/r3'],
    ['a run whose track is gone', '/story/r4?from=week', { sessions: [S('r4', 'run', 't_gone')] }, '/activity/r4?from=week']
  ];
  cases.forEach(function (c) {
    test(c[0], async function () {
      const { wrapper } = await mountStory(c[1], c[2]);
      expect(q('#story-canvas')).toBeNull();
      expect(q('#story-missing').hidden).toBe(false);
      expect(text('#story-missing-text')).toBe(MISSING);
      expect(q('#story-missing-link').getAttribute('href')).toBe(c[3]);
      expect(q('#story-tpl-A')).toBeNull();
      wrapper.unmount();
    });
  });
});

describe('story page, preview and export', function () {
  test('the preview is drawn once the fonts are loaded', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    expect(contexts).toHaveLength(1);
    const fills = contexts[0].calls.filter((c) => c.op === 'fillRect');
    expect(fills[0]).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, fillStyle: '#1E4FA0' });
    expect(contexts[0].calls.some((c) => c.op === 'fillText')).toBe(true);
    wrapper.unmount();
  });

  test('create a picture, download it, and a change brings Create back', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-create').trigger('click');
    await flushPromises();
    expect(exp.exportPng).toHaveBeenCalledTimes(1);
    expect(exp.exportPng.mock.calls[0][0].width).toBe(1080);
    expect(text('#story-status')).toBe('Your picture is ready.');
    expect(q('#story-create')).toBeNull();
    expect(q('#story-share')).toBeNull();
    await wrapper.find('#story-download').trigger('click');
    expect(exp.downloadBlob).toHaveBeenCalledTimes(1);
    const name = exp.downloadBlob.mock.calls[0][1];
    expect(name).toMatch(/^weekly150-run-2026-\d\d-\d\d\.png$/);
    expect(exp.downloadBlob.mock.calls[0][0].type).toBe('image/png');
    expect(text('#story-status')).toBe('Your picture is ready.');
    await wrapper.find('#story-opacity').setValue('60');
    expect(q('#story-create')).not.toBeNull();
    expect(q('#story-download')).toBeNull();
    expect(text('#story-status')).toBe('');
    wrapper.unmount();
  });

  test('no MP4 for an animated template: the picture of the final state instead', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-tpl-D').trigger('click');
    await wrapper.find('#story-create').trigger('click');
    await flushPromises();
    expect(exp.exportVideo).toHaveBeenCalledTimes(1);
    expect(exp.exportPng).toHaveBeenCalledTimes(1);
    expect(text('#story-status')).toBe('This browser cannot make a video that Instagram accepts. Here is the picture instead.');
    await wrapper.find('#story-download').trigger('click');
    expect(exp.downloadBlob.mock.calls[0][1]).toMatch(/\.png$/);
    wrapper.unmount();
  });

  test('a video when the browser can make one; Share when the file can be shared, closing the sheet is no error', async function () {
    exp.exportVideo.mockImplementationOnce(function (canvas, drawFrame, onProgress) {
      drawFrame(0);
      onProgress(0.5);
      return Promise.resolve({ blob: new Blob(['mp4'], { type: 'video/mp4' }), path: 'webcodecs' });
    });
    exp.canShareFile.mockImplementationOnce(function () { return true; });
    const abort = new Error('closed');
    abort.name = 'AbortError';
    exp.shareFile.mockImplementationOnce(function () { return Promise.reject(abort); });
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-tpl-C').trigger('click');
    expect(text('#story-create')).toBe('Create video');
    await wrapper.find('#story-create').trigger('click');
    await flushPromises();
    expect(text('#story-status')).toBe('Your video is ready.');
    expect(q('#story-share')).not.toBeNull();
    await wrapper.find('#story-share').trigger('click');
    await flushPromises();
    expect(exp.shareFile).toHaveBeenCalledTimes(1);
    expect(exp.shareFile.mock.calls[0][0].name).toMatch(/\.mp4$/);
    expect(text('#story-status')).toBe('Your video is ready.');
    wrapper.unmount();
  });

  test('on an iPhone the status says where the download went', async function () {
    const desc = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    try {
      const { wrapper } = await mountStory('/story/sample_32?from=log');
      await wrapper.find('#story-create').trigger('click');
      await flushPromises();
      await wrapper.find('#story-download').trigger('click');
      expect(text('#story-status')).toBe('Your picture is ready. Saved to Files, in Downloads.');
      wrapper.unmount();
    } finally {
      if (desc) Object.defineProperty(navigator, 'userAgent', desc);
      else delete navigator.userAgent;
    }
  });
});

function deferred() {
  const d = {};
  d.promise = new Promise(function (resolve, reject) { d.resolve = resolve; d.reject = reject; });
  return d;
}
const fakePhoto = () => ({ bitmap: { width: 800, height: 1200, close: vi.fn() }, w: 800, h: 1200 });
async function pick(wrapper, name) {
  const input = q('#story-photo');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], name, { type: 'image/jpeg' })] });
  await wrapper.find('#story-photo').trigger('change');
}
const lastImage = () => {
  const c = contexts[0].calls.filter((x) => x.op === 'drawImage');
  return c.length ? c[c.length - 1].args[0] : null;
};
const twoRuns = { sessions: [S('r1', 'run', 't_one'), S('r5', 'run', 't_five')], tracks: { t_one: oneKm, t_five: oneKm } };

describe('story page, late photos and exports', function () {
  test('an older pick that finishes last is dropped and released; Create waits for the load', async function () {
    const d1 = deferred(), d2 = deferred();
    photoMod.loadPhoto.mockImplementationOnce(() => d1.promise).mockImplementationOnce(() => d2.promise);
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await pick(wrapper, 'a.jpg');
    await pick(wrapper, 'b.jpg');
    expect(q('#story-create').disabled).toBe(true);
    const A = fakePhoto(), B = fakePhoto();
    d2.resolve(B);
    await flushPromises();
    expect(q('#story-create').disabled).toBe(false);
    expect(lastImage()).toBe(B.bitmap);
    d1.resolve(A);
    await flushPromises();
    expect(photoMod.releasePhoto).toHaveBeenCalledWith(A);
    expect(photoMod.releasePhoto).not.toHaveBeenCalledWith(B);
    expect(q('#story-nophoto').disabled).toBe(false);
    expect(q('#story-canvas').getAttribute('aria-label')).toMatch(/ With your photo\.$/);
    expect(lastImage()).toBe(B.bitmap);
    wrapper.unmount();
    expect(photoMod.releasePhoto).toHaveBeenCalledWith(B);
  });

  test('a late failure of an older pick shows no error over a good photo', async function () {
    const d1 = deferred(), d2 = deferred();
    photoMod.loadPhoto.mockImplementationOnce(() => d1.promise).mockImplementationOnce(() => d2.promise);
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await pick(wrapper, 'a.jpg');
    await pick(wrapper, 'b.jpg');
    d2.resolve(fakePhoto());
    await flushPromises();
    d1.reject(new Error('decode-failed'));
    await flushPromises();
    expect(q('#story-photo-error')).toBeNull();
    expect(q('#story-nophoto').disabled).toBe(false);
    wrapper.unmount();
  });

  test('a bad file after a good photo shows the error and keeps the good photo', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    const A = fakePhoto();
    photoMod.loadPhoto.mockImplementationOnce(() => Promise.resolve(A));
    await pick(wrapper, 'a.jpg');
    await flushPromises();
    expect(q('#story-canvas').getAttribute('aria-label')).toMatch(/ With your photo\.$/);
    photoMod.loadPhoto.mockImplementationOnce(() => Promise.reject(new Error('decode-failed')));
    await pick(wrapper, 'note.jpg');
    await flushPromises();
    expect(text('#story-photo-error')).toBe('That file could not be read as a picture. Try a JPG or PNG.');
    expect(q('#story-canvas').getAttribute('aria-label')).toMatch(/ With your photo\.$/);
    expect(photoMod.releasePhoto).not.toHaveBeenCalledWith(A);
    expect(q('#story-nophoto').disabled).toBe(false);
    expect(lastImage()).toBe(A.bitmap);
    wrapper.unmount();
  });

  test('No photo during a load, or a move to another run, drops the load', async function () {
    const d1 = deferred(), d2 = deferred();
    const { wrapper, router } = await mountStory('/story/r1', twoRuns);
    const A = fakePhoto(), B = fakePhoto(), C = fakePhoto();
    /* a photo first, so No photo is enabled */
    photoMod.loadPhoto.mockImplementationOnce(() => Promise.resolve(C));
    await pick(wrapper, 'c.jpg');
    await flushPromises();
    expect(q('#story-nophoto').disabled).toBe(false);
    photoMod.loadPhoto.mockImplementationOnce(() => d1.promise).mockImplementationOnce(() => d2.promise);
    await pick(wrapper, 'a.jpg');
    await wrapper.find('#story-nophoto').trigger('click');
    d1.resolve(A);
    await flushPromises();
    expect(photoMod.releasePhoto).toHaveBeenCalledWith(C);
    expect(photoMod.releasePhoto).toHaveBeenCalledWith(A);
    expect(q('#story-nophoto').disabled).toBe(true);
    expect(q('#story-create').disabled).toBe(false);
    await pick(wrapper, 'b.jpg');
    await router.push('/story/r5');
    await flushPromises();
    d2.resolve(B);
    await flushPromises();
    expect(photoMod.releasePhoto).toHaveBeenCalledWith(B);
    expect(q('#story-nophoto').disabled).toBe(true);
    expect(q('#story-create').disabled).toBe(false);
    expect(q('#story-canvas').getAttribute('aria-label')).not.toMatch(/photo/);
    wrapper.unmount();
  });

  test('a change while the file is made drops the file', async function () {
    const dp = deferred();
    exp.exportPng.mockImplementationOnce(() => dp.promise);
    const { wrapper, data } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-create').trigger('click');
    expect(q('#story-create').disabled).toBe(true);
    data.setStoryPrefs({ opacity: 50 });
    await flushPromises();
    dp.resolve(new Blob(['png'], { type: 'image/png' }));
    await flushPromises();
    expect(q('#story-download')).toBeNull();
    expect(q('#story-create').disabled).toBe(false);
    expect(text('#story-status')).toBe('');
    wrapper.unmount();
  });

  test('an export left behind by another run stops at its next frame; no second export meanwhile', async function () {
    const dv = deferred();
    let frame = null;
    exp.exportVideo.mockImplementationOnce(function (canvas, drawFrame) { frame = drawFrame; return dv.promise; });
    const { wrapper, router } = await mountStory('/story/r1', twoRuns);
    await wrapper.find('#story-tpl-D').trigger('click');
    await wrapper.find('#story-create').trigger('click');
    expect(() => frame(0)).not.toThrow();
    await router.push('/story/r5');
    await flushPromises();
    expect(() => frame(0.1)).toThrow();
    expect(q('#story-create').disabled).toBe(true);
    expect(text('#story-status')).toBe('');
    dv.resolve(null);
    await flushPromises();
    expect(exp.exportVideo).toHaveBeenCalledTimes(1);
    expect(exp.exportPng).not.toHaveBeenCalled();
    expect(q('#story-create').disabled).toBe(false);
    expect(q('#story-download')).toBeNull();
    expect(text('#story-status')).toBe('');
    wrapper.unmount();
  });

  test('an export still running when the page is left draws no more frames', async function () {
    const dv = deferred();
    let frame = null;
    exp.exportVideo.mockImplementationOnce(function (canvas, drawFrame) { frame = drawFrame; return dv.promise; });
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-tpl-D').trigger('click');
    await wrapper.find('#story-create').trigger('click');
    wrapper.unmount();
    expect(() => frame(0)).toThrow();
    dv.resolve(null);
    await flushPromises();
    expect(exp.exportPng).not.toHaveBeenCalled();
  });
});

describe('story page, fonts before the export', function () {
  test('Create waits for the story fonts before the first frame', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    const df = deferred();
    const load = vi.fn(() => df.promise);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    try {
      await wrapper.find('#story-create').trigger('click');
      await flushPromises();
      expect(load).toHaveBeenCalled();
      expect(q('#story-create').disabled).toBe(true);
      expect(exp.exportPng).not.toHaveBeenCalled();
      df.resolve([]);
      await flushPromises();
      expect(exp.exportPng).toHaveBeenCalledTimes(1);
      expect(q('#story-download')).not.toBeNull();
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: { load: function () { return Promise.resolve([]); } } });
      wrapper.unmount();
    }
  });

  test('an export whose run changed while the fonts loaded makes no file', async function () {
    const { wrapper, router } = await mountStory('/story/r1', twoRuns);
    const df = deferred();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn(() => df.promise) } });
    try {
      await wrapper.find('#story-create').trigger('click');
      await router.push('/story/r5');
      await flushPromises();
      df.resolve([]);
      await flushPromises();
      expect(exp.exportPng).not.toHaveBeenCalled();
      expect(q('#story-create').disabled).toBe(false);
      expect(q('#story-download')).toBeNull();
      expect(text('#story-status')).toBe('');
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: { load: function () { return Promise.resolve([]); } } });
      wrapper.unmount();
    }
  });
});

describe('story page, text alternative on Week lap', function () {
  test('cadence is read as spm', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-num-cad').trigger('click');
    expect(q('#story-canvas').getAttribute('aria-label')).toMatch(/, cadence \d+ spm\.$/);
    wrapper.unmount();
  });

  test('E with 4 small numbers notes that only the first 3 are shown', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-tpl-E').trigger('click');
    expect(q('#story-num-e-note')).toBeNull();
    await wrapper.find('#story-num-best').trigger('click');
    expect(text('#story-num-e-note')).toBe('Week lap shows the first 3.');
    await wrapper.find('#story-tpl-A').trigger('click');
    expect(q('#story-num-e-note')).toBeNull();
    wrapper.unmount();
  });

  test('E names the main number and at most 3 small numbers, as it draws them', async function () {
    const { wrapper } = await mountStory('/story/sample_32?from=log');
    await wrapper.find('#story-num-best').trigger('click');
    expect(q('#story-canvas').getAttribute('aria-label')).toMatch(/, best km \d:\d\d per km\.$/);
    await wrapper.find('#story-tpl-E').trigger('click');
    const label = q('#story-canvas').getAttribute('aria-label');
    expect(label).toMatch(/^Story preview, template Week lap\. Distance \d\.\d\d km, time \d+:\d\d, pace \d:\d\d per km, average heart rate \d+ bpm\.$/);
    expect(label).not.toMatch(/best km/);
    expect(text('#story-num-count')).toBe('4 of 4 small numbers used.');
    wrapper.unmount();
  });
});
