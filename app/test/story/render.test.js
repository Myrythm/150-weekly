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

function expectInBounds(ctx, min) {
  const t = texts(ctx);
  expect(t.length).toBeGreaterThanOrEqual(min === undefined ? 4 : min);
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

/* Task 6: the animated templates C, D and E */
const marathonSplits = Object.assign({}, marathon, {
  splits: Array.from({ length: 42 }, (_, i) => split(i + 1, 560 + (i % 7) * 12))
});
const tenKm = Object.assign({}, fiveKm, {
  distanceM: 10050,
  splits: Array.from({ length: 10 }, (_, i) => split(i + 1, 420 - i * 5))
});
const marathonFor = (id) => (id === 'C' ? marathonSplits : marathon);
const ANIM_T = [0, 1.5, 3, 5];
const sameCalls = (a, b) => expect(JSON.stringify(b.calls)).toBe(JSON.stringify(a.calls));

function animStates(id) {
  return [
    state(id),
    state(id, { photo: null }),
    state(id, { opacity: 40 }),
    state(id, { metrics: marathonFor(id), prefs: { small: ['time', 'pace', 'maxhr', 'climb'] } }),
    state(id, { metrics: marathonFor(id), prefs: { hero: 'time' } }),
    state(id, { metrics: marathonFor(id), prefs: { hero: 'pace' } })
  ];
}

test.each(['C', 'D', 'E'])('template %s: every text is inside the canvas and the safe area at t 0, 1.5, 3 and 5', (id) => {
  ANIM_T.forEach(t => {
    animStates(id).forEach(st => {
      const ctx = makeCtx();
      drawStory(ctx, st, t);
      /* at t 0 D with time as the main number shows only the wordmark, the kicker and the count */
      expectInBounds(ctx, 3);
    });
  });
});

test.each(['C', 'D', 'E'])('template %s: every frame keeps its text in the safe area', (id) => {
  [state(id), state(id, { metrics: marathonFor(id), prefs: { small: ['time', 'pace', 'maxhr', 'climb'] } })].forEach(st => {
    for (let f = 0; f <= 150; f++) {
      const ctx = makeCtx();
      drawStory(ctx, st, f / 30);
      texts(ctx).forEach(c => {
        expect(c.x, c.text + ' @' + f).toBeGreaterThanOrEqual(0);
        expect(c.x + c.width, c.text + ' @' + f).toBeLessThanOrEqual(1080);
        expect(c.y, c.text + ' @' + f).toBeGreaterThanOrEqual(250);
        expect(c.y, c.text + ' @' + f).toBeLessThanOrEqual(1580);
      });
    }
  });
});

test.each(['C', 'D', 'E'])('template %s: the frame at t 3 equals the frame at t 5', (id) => {
  animStates(id).forEach(st => {
    const a = makeCtx(), b = makeCtx();
    drawStory(a, st, 3);
    drawStory(b, st, 5);
    sameCalls(a, b);
  });
});

test.each(['C', 'D', 'E'])('template %s: the final frame has the wordmark and the kicker once each', (id) => {
  const ctx = makeCtx();
  drawStory(ctx, state(id), 5);
  const t = texts(ctx).map(c => c.text);
  expect(t.filter(x => x === 'WEEKLY 150')).toHaveLength(1);
  expect(t.filter(x => x === 'RUN · WED 7 OCT')).toHaveLength(1);
});

test('final values at t 5', () => {
  const c = makeCtx();
  drawStory(c, state('C'), 5);
  expect(texts(c).map(x => x.text)).toEqual(expect.arrayContaining(['5.02', '6:52', '6:45', '6:39', '6:31', '6:12', 'SPLITS PER KM']));
  const d = makeCtx();
  drawStory(d, state('D'), 5);
  expect(texts(d).map(x => x.text)).toEqual(expect.arrayContaining(['5.02', '33:24', '6:39', '152']));
  const e = makeCtx();
  drawStory(e, state('E'), 5);
  expect(texts(e).map(x => x.text)).toEqual(expect.arrayContaining(['92', '+34 MIN TODAY', 'OF 150 MIN']));
});

test('start values at t 0', () => {
  const d = makeCtx();
  drawStory(d, state('D'), 0);
  const dt = texts(d).map(x => x.text);
  expect(dt).toContain('0.00');
  expect(dt).not.toContain('5.02');
  const e = makeCtx();
  drawStory(e, state('E'), 0);
  const et = texts(e).map(x => x.text);
  expect(et).toContain('58');
  expect(et).not.toContain('+34 MIN TODAY');
});

test('D counts the main number in the format of the final value', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('D', { metrics: marathon, prefs: { hero: 'time' } }), 0);
  expect(texts(ctx).map(x => x.text)).toContain('0:00:00');
  const mid = makeCtx();
  drawStory(mid, state('D'), 1.45);
  const hero = texts(mid).find(x => /^\d\.\d\d$/.test(x.text));
  expect(hero).toBeTruthy();
  expect(Number(hero.text)).toBeGreaterThan(0);
  expect(Number(hero.text)).toBeLessThan(5.02);
});

test('C with 10 lanes shows all 10 pace texts at t 3', () => {
  const ctx = makeCtx();
  const st = state('C', { metrics: tenKm });
  expect(st.model.lanes).toHaveLength(10);
  drawStory(ctx, st, 3);
  const t = texts(ctx).map(x => x.text);
  st.model.lanes.forEach(l => expect(t).toContain(l.paceText));
  expectInBounds(ctx);
});

test('C: lanes grow one after another and the paces fade in', () => {
  const st = state('C');
  const early = makeCtx();
  drawStory(early, st, 0.5);
  expect(texts(early).some(x => x.text === '6:52')).toBe(false);
  const later = makeCtx();
  drawStory(later, st, 1.5);
  const t = texts(later).map(x => x.text);
  expect(t).toContain('6:52');
  expect(t).not.toContain('6:12');
});

test('C: the fastest lane uses the highlight colour, the others onColor', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('C'), 5);
  const bars = ctx.calls.filter(c => c.op === 'fillRect' && (c.fillStyle === '#E8A317' || c.fillStyle === WHITE));
  expect(bars.filter(c => c.fillStyle === '#E8A317')).toHaveLength(1);
  expect(bars.filter(c => c.fillStyle === WHITE)).toHaveLength(4);
});

test('C: the band follows the opacity and the photo under it is blurred below 100', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('C', { opacity: 50 }), 5);
  expect(colourLayer(ctx, '#1E4FA0', 0.5)).toHaveLength(1);
  expect(ctx.calls.filter(c => c.op === 'drawImage' && /blur\(/.test(c.filter))).toHaveLength(1);
  expect(ctx.filter).toBe('none');
  const full = makeCtx();
  drawStory(full, state('C'), 5);
  expect(full.calls.filter(c => c.op === 'filter')).toHaveLength(0);
  const zero = makeCtx();
  drawStory(zero, state('C', { opacity: 0 }), 5);
  expect(zero.calls.filter(c => (c.op === 'fill' || c.op === 'fillRect') && c.fillStyle === '#1E4FA0')).toHaveLength(0);
});

test('D and E: the colour wash follows the opacity', () => {
  ['D', 'E'].forEach(id => {
    const ctx = makeCtx();
    drawStory(ctx, state(id, { opacity: 50 }), 5);
    const wash = ctx.calls.filter(c => c.op === 'fillRect' && c.fillStyle && c.fillStyle.kind === 'linear');
    expect(wash).toHaveLength(1);
    expect(wash[0]).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920, globalAlpha: 0.5 });
    const zero = makeCtx();
    drawStory(zero, state(id, { opacity: 0 }), 5);
    expect(zero.calls.filter(c => c.op === 'fillRect' && c.fillStyle && c.fillStyle.kind === 'linear')).toHaveLength(0);
  });
});

test('D: the route is drawn and the dot uses the highlight colour', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('D'), 5);
  expect(ctx.calls.filter(c => c.op === 'stroke').length).toBeGreaterThanOrEqual(2);
  expect(ctx.calls.filter(c => c.op === 'fill' && c.fillStyle === '#E8A317')).toHaveLength(1);
  const start = makeCtx();
  drawStory(start, state('D'), 0);
  expect(start.calls.filter(c => c.op === 'stroke' && c.strokeStyle === WHITE)).toHaveLength(1);
});

test('D: a break in the track starts a new sub path and is never joined by a line', () => {
  const st = state('D', { prefs: { small: [] } });
  expect(st.numbers.small).toEqual([]);
  st.model.track = { lat: [0, 0, 0.01, 0.02, 0.02], lon: [0, 0.01, 0.01, 0.01, 0.02], t: null, brk: [3] };
  const ctx = makeCtx();
  drawStory(ctx, st, 5);
  /* ghost and drawn line: moveTo at points 0 and 3, lineTo at points 1, 2 and 4, twice */
  expect(ctx.calls.filter(c => c.op === 'moveTo')).toHaveLength(4);
  expect(ctx.calls.filter(c => c.op === 'lineTo')).toHaveLength(6);
  const mid = makeCtx();
  drawStory(mid, st, 1.5);
  expect(mid.calls.filter(c => c.op === 'moveTo')).toHaveLength(3);
});

test('E: the sliding tag never comes lower than its gap above the numbers', () => {
  const tagRect = (t) => {
    const ctx = makeCtx();
    drawStory(ctx, state('E'), t);
    const rects = ctx.calls.filter(c => c.op === 'fillRect' && c.fillStyle === '#E8A317');
    return rects.reduce((a, b) => (b.y < a.y ? b : a));
  };
  const final = tagRect(5);
  [2.61, 2.7, 2.8, 2.95].forEach(t => {
    const r = tagRect(t);
    expect(r.y).toBeGreaterThanOrEqual(final.y);
    expect(r.y + r.h).toBeLessThanOrEqual(final.y + final.h + 32);
  });
});

test('E: the run part uses the highlight colour; above the target the lap stops full and the counter ends at the true value', () => {
  const ctx = makeCtx();
  drawStory(ctx, state('E'), 5);
  expect(ctx.calls.filter(c => c.op === 'stroke' && c.strokeStyle === '#E8A317')).toHaveLength(1);

  const st = state('E');
  st.model.week = Object.assign({}, st.model.week, { before: 140, add: 34, after: 174 });
  const over = makeCtx();
  expect(() => drawStory(over, st, 5)).not.toThrow();
  const t = texts(over).map(x => x.text);
  expect(t).toContain('174');
  expect(t).toContain('+34 MIN TODAY');
  expectInBounds(over);
  over.calls.filter(c => c.op === 'arc').forEach(a => expect(Math.abs(a.a1 - a.a0)).toBeLessThanOrEqual(Math.PI + 1e-9));
});

test('E without a week and C without lanes draw without throwing', () => {
  const e = state('E', { age: null });
  expect(e.model.week).toBeNull();
  const c = state('C', { metrics: marathon });
  expect(c.model.lanes).toEqual([]);
  [e, c].forEach(st => {
    [0, 5].forEach(t => {
      const ctx = makeCtx();
      expect(() => drawStory(ctx, st, t)).not.toThrow();
      if (t === 5) expectInBounds(ctx);
    });
  });
});

test('an undefined opacity counts as 100 in every template', () => {
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(id => {
    const ctx = makeCtx();
    const st = state(id);
    delete st.opacity;
    drawStory(ctx, st, 5);
    ctx.calls.forEach(c => {
      if (c.globalAlpha !== undefined) expect(Number.isNaN(c.globalAlpha), id).toBe(false);
    });
    const ref = makeCtx();
    drawStory(ref, state(id), 5);
    sameCalls(ref, ctx);
  });
});
