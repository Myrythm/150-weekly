import { makeCtx } from './fakeCtx.js';
import { drawStory, W, H, SAFE_TOP, SAFE_BOTTOM } from '../../src/story/render.js';
import { buildModel } from '../../src/story/model.js';
import { resolveNumbers, DEFAULT_STORY_PREFS } from '../../src/story/numbers.js';
import { INK, WHITE } from '../../src/story/colors.js';
import { fitFont } from '../../src/story/draw.js';

const S = (id, date, type, minutes, intensity, createdAt) => ({ id, date, type, minutes, intensity, balance: false, source: 'log', sample: false, createdAt });
const sessions = [
  S('a', '2026-10-05', 'walk', 30, 'moderate', 1),
  S('b', '2026-10-07', 'run', 14, 'vigorous', 2),
  S('c', '2026-10-07', 'strength', 40, 'moderate', 3),
  S('run', '2026-10-07', 'run', 34, 'moderate', 4),
  S('d', '2026-10-09', 'cycle', 60, 'moderate', 5)
];
const split = (index, paceSPerKm) => ({ index, distanceM: 1000, timeS: paceSPerKm, paceSPerKm, partial: false });
const fiveKm = { distanceM: 5020, movingS: 2004, avgPaceSPerKm: 399, bestKmPaceS: 372, avgHr: 152, maxHr: 171,
  splits: [split(1, 412), split(2, 405), split(3, 399), split(4, 391), split(5, 372)] };
const marathon = { distanceM: 42200, movingS: 14733, avgPaceSPerKm: 602, maxHr: 171, elevGainM: 912 };
const square = { lat: [0, 0, 0.01, 0.01, 0], lon: [0, 0.01, 0.01, 0, 0], t: null, brk: [] };
const rec = (metrics) => ({ name: 'Morning', type: 'run', startTime: new Date(2026, 9, 7, 7, 48).getTime(), metrics, track: square });

const bitmap = { width: 4000, height: 3000, close() {} };
const PHOTO = { bitmap, w: 4000, h: 3000 };

function state(id, over) {
  const o = over || {};
  const model = buildModel(sessions[3], rec(o.metrics || fiveKm), sessions, o.age === undefined ? 30 : o.age);
  const prefs = Object.assign({}, DEFAULT_STORY_PREFS, o.prefs || {});
  return {
    template: id,
    model: model,
    numbers: resolveNumbers(prefs, model.values),
    color: o.color || '#1E4FA0',
    opacity: o.opacity === undefined ? 100 : o.opacity,
    photo: o.photo === undefined ? PHOTO : o.photo,
    view: { zoom: 1, x: 0, y: 0 }
  };
}

const texts = (ctx) => ctx.calls.filter(c => c.op === 'fillText' || c.op === 'strokeText');

function expectInBounds(ctx) {
  const t = texts(ctx);
  expect(t.length).toBeGreaterThan(3);
  t.forEach(c => {
    expect(c.x, c.text).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width, c.text).toBeLessThanOrEqual(1080);
    expect(c.y, c.text).toBeGreaterThanOrEqual(250);
    expect(c.y, c.text).toBeLessThanOrEqual(1580);
  });
  return t.map(c => c.text);
}

test('canvas constants', () => {
  expect([W, H, SAFE_TOP, SAFE_BOTTOM]).toEqual([1080, 1920, 250, 1580]);
});

test.each(['A', 'B', 'F'])('template %s: every text is inside the canvas and the safe area', (id) => {
  const ctx = makeCtx();
  drawStory(ctx, state(id), 0);
  const shown = expectInBounds(ctx);
  expect(shown).toEqual(expect.arrayContaining(['5.02', '33:24', '6:39', 'WEEKLY 150', 'RUN · WED 7 OCT']));
});

test.each(['A', 'B', 'F'])('template %s: the same holds without a photo', (id) => {
  const ctx = makeCtx();
  drawStory(ctx, state(id, { photo: null }), 0);
  expect(expectInBounds(ctx)).toEqual(expect.arrayContaining(['5.02', '33:24', '6:39', 'WEEKLY 150', 'RUN · WED 7 OCT']));
});

test.each(['A', 'B', 'F'])('template %s: marathon numbers still fit', (id) => {
  const ctx = makeCtx();
  const st = state(id, { metrics: marathon, prefs: { small: ['time', 'pace', 'maxhr', 'climb'] } });
  expect(st.numbers.small).toEqual(['time', 'pace', 'maxhr', 'climb']);
  drawStory(ctx, st, 0);
  const shown = expectInBounds(ctx);
  expect(shown).toEqual(expect.arrayContaining(['42.20', '4:05:33', '10:02', '171', '+912', 'WEEKLY 150', 'RUN · WED 7 OCT']));
});

test.each(['A', 'B', 'F'])('template %s: time and pace as the main number fit', (id) => {
  ['time', 'pace'].forEach(hero => {
    const ctx = makeCtx();
    drawStory(ctx, state(id, { metrics: marathon, prefs: { hero } }), 0);
    expectInBounds(ctx);
  });
});

test('A: the week bar text is there with an age and absent without', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('A'), 0);
  expect(texts(ctx).map(c => c.text)).toContain('92 OF 150 MIN THIS WEEK');
  const ctx2 = makeCtx();
  const st = state('A', { age: null });
  expect(st.model.week).toBeNull();
  drawStory(ctx2, st, 0);
  expect(texts(ctx2).some(c => c.text.indexOf('THIS WEEK') >= 0)).toBe(false);
});

test('WEEKLY 150 and the kicker are each one text call', () => {
  ['A', 'B', 'F'].forEach(id => {
    const ctx = makeCtx();
    drawStory(ctx, state(id), 0);
    const t = texts(ctx).map(c => c.text);
    expect(t.filter(x => x === 'WEEKLY 150')).toHaveLength(1);
    expect(t.filter(x => x === 'RUN · WED 7 OCT')).toHaveLength(1);
  });
});

const colourLayer = (ctx, color, alpha) => ctx.calls.filter(c => (c.op === 'fillRect' || c.op === 'fill') && c.fillStyle === color && c.globalAlpha === alpha);

test('opacity 50 draws the colour layer at alpha 0.5; opacity 0 draws no colour layer', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('F', { opacity: 50 }), 0);
  const layer = colourLayer(ctx, '#1E4FA0', 0.5);
  expect(layer).toHaveLength(1);
  expect(layer[0]).toMatchObject({ op: 'fillRect', x: 0, y: 0, w: 1080, h: 1920 });

  const ctx0 = makeCtx();
  drawStory(ctx0, state('F', { opacity: 0 }), 0);
  expect(ctx0.calls.filter(c => (c.op === 'fillRect' || c.op === 'fill') && c.fillStyle === '#1E4FA0')).toHaveLength(0);
  expectInBounds(ctx0);

  const full = makeCtx();
  drawStory(full, state('F', { opacity: 100 }), 0);
  expect(colourLayer(full, '#1E4FA0', 1)).toHaveLength(1);
});

test('A: the bib card follows the opacity and the photo under it is blurred below 100', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('A', { opacity: 50 }), 0);
  expect(ctx.calls.filter(c => c.op === 'fill' && c.fillStyle === WHITE && c.globalAlpha === 0.5)).toHaveLength(1);
  const blurred = ctx.calls.filter(c => c.op === 'drawImage' && /blur\(/.test(c.filter));
  expect(blurred).toHaveLength(1);
  expect(ctx.filter).toBe('none');
  const filters = ctx.calls.filter(c => c.op === 'filter');
  expect(filters[filters.length - 1].value).toBe('none');

  const full = makeCtx();
  drawStory(full, state('A', { opacity: 100 }), 0);
  expect(full.calls.filter(c => c.op === 'filter')).toHaveLength(0);

  const zero = makeCtx();
  drawStory(zero, state('A', { opacity: 0 }), 0);
  expect(zero.calls.filter(c => (c.op === 'fill' || c.op === 'fillRect') && c.fillStyle === WHITE)).toHaveLength(0);
  expectInBounds(zero);

  const noFilter = makeCtx({ filter: false });
  expect('filter' in noFilter).toBe(false);
  drawStory(noFilter, state('A', { opacity: 50 }), 0);
  expect(noFilter.calls.filter(c => c.op === 'drawImage')).toHaveLength(1);
});

test('A: text on the bib card is ink', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('A'), 0);
  const t = texts(ctx);
  ['5.02', '33:24', 'RUN · WED 7 OCT', '92 OF 150 MIN THIS WEEK'].forEach(x => {
    expect(t.find(c => c.text === x).fillStyle).toBe(INK);
  });
});

test('B: text is white over a photo and follows the colour without one', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('B'), 0);
  expect(texts(ctx).find(c => c.text === '5.02').fillStyle).toBe(WHITE);
  const yellow = makeCtx();
  drawStory(yellow, state('B', { photo: null, color: '#E8A317' }), 0);
  expect(texts(yellow).find(c => c.text === '5.02').fillStyle).toBe(INK);
});

test('F on yellow uses ink text, on blue uses white', () => {
  const y = makeCtx();
  drawStory(y, state('F', { color: '#E8A317' }), 0);
  expect(texts(y).find(c => c.text === '5.02').fillStyle).toBe(INK);
  const b = makeCtx();
  drawStory(b, state('F', { color: '#1E4FA0' }), 0);
  expect(texts(b).find(c => c.text === '5.02').fillStyle).toBe(WHITE);
});

test('no photo: the background is the colour and drawImage is never called', () => {
  ['A', 'B', 'F'].forEach(id => {
    const ctx = makeCtx();
    drawStory(ctx, state(id, { photo: null }), 0);
    expect(ctx.calls.filter(c => c.op === 'drawImage')).toHaveLength(0);
    const first = ctx.calls.find(c => c.op === 'fillRect');
    expect(first).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, fillStyle: '#1E4FA0', globalAlpha: 1 });
  });
});

test('with a photo, the image drawn is the photo bitmap and nothing else', () => {
  ['A', 'B', 'F'].forEach(id => {
    const ctx = makeCtx();
    drawStory(ctx, state(id, { opacity: 40 }), 0);
    const imgs = ctx.calls.filter(c => c.op === 'drawImage');
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach(c => expect(c.args[0]).toBe(bitmap));
  });
});

test('the route outline is stroked in B and F', () => {
  ['B', 'F'].forEach(id => {
    const ctx = makeCtx();
    drawStory(ctx, state(id), 0);
    expect(ctx.calls.filter(c => c.op === 'stroke').length).toBeGreaterThan(0);
  });
});

test('static templates ignore t', () => {
  ['A', 'B', 'F'].forEach(id => {
    const a = makeCtx(), b = makeCtx();
    drawStory(a, state(id), 0);
    drawStory(b, state(id), 3);
    expect(JSON.stringify(b.calls)).toBe(JSON.stringify(a.calls));
  });
});

test('fitFont returns the base size when the text fits and the largest fitting size when not', () => {
  const ctx = makeCtx();
  expect(fitFont(ctx, '5.02', 1000, 200, 'X', 800)).toBe(200);
  const px = fitFont(ctx, '5.02', 300, 200, 'X', 800);
  expect(px * 4 * 0.5).toBeLessThanOrEqual(300);
  expect((px + 1) * 4 * 0.5).toBeGreaterThan(300);
});
