import { storyEligible, weekNumbers, lanes, routePath, templateState, buildModel } from '../../src/story/model.js';

const S = (id, date, type, minutes, intensity, createdAt) => ({ id, date, type, minutes, intensity, balance: false, source: 'log', sample: false, createdAt });
const sessions = [
  S('a', '2026-10-05', 'walk', 30, 'moderate', 1),
  S('b', '2026-10-07', 'run', 14, 'vigorous', 2),      // 28 credit, earlier the same day
  S('c', '2026-10-07', 'strength', 40, 'moderate', 3), // 0 credit
  S('run', '2026-10-07', 'run', 34, 'moderate', 4),
  S('d', '2026-10-09', 'cycle', 60, 'moderate', 5),    // later in the week, not "before"
  S('e', '2026-09-30', 'run', 50, 'moderate', 0)       // previous week
];

const split = (index, paceSPerKm, partial) => ({ index, distanceM: partial ? 420 : 1000, timeS: partial ? paceSPerKm * 0.42 : paceSPerKm, paceSPerKm, partial: !!partial });
const fiveKm = { distanceM: 5420, movingS: 2145, avgPaceSPerKm: 396, bestKmPaceS: 372, splits: [split(1, 412), split(2, 405), split(3, 399), split(4, 391), split(5, 372), split(6, 380, true)] };
const square = { lat: [0, 0, 0.01, 0.01, 0], lon: [0, 0.01, 0.01, 0, 0], t: null, brk: [] };
const rec = (metrics, track) => ({ name: 'Morning', type: 'run', startTime: new Date(2026, 9, 7, 1, 48).getTime(), metrics, track: track || square });

test('week numbers are for the run\'s week, up to the run', () => {
  const w = weekNumbers(sessions[3], sessions, 30);
  expect(w).toMatchObject({ target: 150, before: 58, add: 34, after: 92 });
  expect(w.days.map(d => d.on)).toEqual([true, false, true, false, true, false, false]);
  expect(w.days.map(d => d.today)).toEqual([false, false, true, false, false, false, false]);
});
test('a light run adds 0', () => {
  expect(weekNumbers({ ...sessions[3], intensity: 'light' }, sessions, 30).add).toBe(0);
});
test('a vigorous run counts double toward the adult target', () => {
  expect(weekNumbers({ ...sessions[3], intensity: 'vigorous' }, sessions, 30)).toMatchObject({ before: 58, add: 68, after: 126 });
});
test('a child counts vigorous 1:1 toward 420', () => {
  expect(weekNumbers(sessions[1], sessions, 10)).toMatchObject({ target: 420, before: 30, add: 14, after: 44 });
});
test('no age or under 5: no week numbers, E unavailable, A still ok', () => {
  expect(weekNumbers(sessions[3], sessions, null)).toBeNull();
  expect(weekNumbers(sessions[3], sessions, undefined)).toBeNull();
  expect(weekNumbers(sessions[3], sessions, 3)).toBeNull();
  const m = buildModel(sessions[3], rec(fiveKm), sessions, null);
  expect(m.week).toBeNull();
  const t = templateState(m);
  expect(t.E).toEqual({ ok: false, reason: 'Needs a weekly target. Set your age first.' });
  expect(t.A).toEqual({ ok: true });
  expect(templateState(buildModel(sessions[3], rec(fiveKm), sessions, 3)).E.ok).toBe(false);
});

test('lanes: one per full km, fastest is best', () => {
  const l = lanes(fiveKm);
  expect(l).toHaveLength(5);
  expect(l.map(x => x.label)).toEqual(['1', '2', '3', '4', '5']);
  expect(l[4]).toMatchObject({ best: true, frac: 1, paceText: '6:12' });
  expect(l[0].frac).toBeCloseTo(0.55, 10);
  expect(l[0].paceText).toBe('6:52');
  expect(l.filter(x => x.best)).toHaveLength(1);
  for (let i = 1; i < 5; i++) expect(l[i].frac).toBeGreaterThan(l[i - 1].frac);
});
test('lanes: equal paces give frac 1 everywhere and still one best', () => {
  const l = lanes({ splits: [split(1, 400), split(2, 400), split(3, 400)] });
  expect(l.map(x => x.frac)).toEqual([1, 1, 1]);
  expect(l.filter(x => x.best)).toHaveLength(1);
});
test('lanes: 10 full km stay one per km', () => {
  const sp = [];
  for (let i = 1; i <= 10; i++) sp.push(split(i, 360 + i));
  expect(lanes({ splits: sp }).map(x => x.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
});
test('lanes: more than 10 full km become complete 5 km blocks', () => {
  const sp = [];
  for (let i = 1; i <= 12; i++) sp.push(split(i, i <= 5 ? 400 : 380));
  sp.push(split(13, 390, true));
  const l = lanes({ splits: sp });
  expect(l.map(x => x.label)).toEqual(['5', '10']);
  expect(l[0]).toMatchObject({ paceText: '6:40', frac: 0.55, best: false });
  expect(l[1]).toMatchObject({ paceText: '6:20', frac: 1, best: true });
});
test('lanes: block pace uses split time over block distance, time from pace when missing', () => {
  const sp = [];
  for (let i = 1; i <= 11; i++) sp.push({ index: i, distanceM: 1000, paceSPerKm: i <= 5 ? 300 : 330, partial: false });
  const l = lanes({ splits: sp });
  expect(l.map(x => x.paceText)).toEqual(['5:00', '5:30']);
});
test('lanes: 1 full km or no splits give none, and C is unavailable', () => {
  const one = { distanceM: 1500, splits: [split(1, 400), split(2, 410, true)] };
  expect(lanes(one)).toEqual([]);
  expect(templateState(buildModel(sessions[3], rec(one), sessions, 30)).C).toEqual({ ok: false, reason: 'Needs at least 2 full km.' });
  const routeOnly = { distanceM: 3100, movingS: null, avgPaceSPerKm: null, splits: [] };
  expect(lanes(routeOnly)).toEqual([]);
  expect(lanes({})).toEqual([]);
  expect(templateState(buildModel(sessions[3], rec(routeOnly), sessions, 30)).C).toEqual({ ok: false, reason: 'Needs at least 2 full km.' });
});
test('lanes: splits without a pace are not full', () => {
  expect(lanes({ splits: [split(1, 400), { index: 2, distanceM: 1000, timeS: null, paceSPerKm: null, partial: false }] })).toEqual([]);
});

test('routePath keeps the square inside the box, centred, with running length', () => {
  const r = routePath(square, 400, 300);
  expect(r.pts).toHaveLength(5);
  r.pts.forEach(([x, y]) => {
    expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(400 + 1e-9);
    expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(300 + 1e-9);
  });
  const xs = r.pts.map(p => p[0]), ys = r.pts.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  expect(h).toBeCloseTo(300, 6);
  expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(200, 6);
  expect(w / h).toBeCloseTo((111320 * Math.cos(0.005 * Math.PI / 180)) / 110574, 3);
  expect(r.cum).toHaveLength(5);
  expect(r.cum[0]).toBe(0);
  expect(r.cum[4]).toBe(r.total);
  expect(r.total).toBeCloseTo(2 * w + 2 * h, 6);
  // north is up: the first point (lat 0) is below the third (lat 0.01)
  expect(r.pts[0][1]).toBeGreaterThan(r.pts[2][1]);
});
test('routePath handles a straight line and a single point', () => {
  const line = routePath({ lat: [0, 0], lon: [0, 0.01], brk: [] }, 200, 100);
  line.pts.forEach(([x, y]) => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(200 + 1e-9); expect(y).toBeCloseTo(50, 6); });
  expect(line.total).toBeCloseTo(200, 6);
  const dot = routePath({ lat: [1], lon: [1], brk: [] }, 200, 100);
  expect(dot.pts).toEqual([[100, 50]]);
  expect(dot.total).toBe(0);
});

test('storyEligible needs a run session with a stored route of 2 or more points', () => {
  expect(storyEligible(sessions[3], rec(fiveKm))).toBe(true);
  expect(storyEligible(sessions[0], rec(fiveKm))).toBe(false);
  expect(storyEligible(sessions[3], null)).toBe(false);
  expect(storyEligible(null, rec(fiveKm))).toBe(false);
  expect(storyEligible(undefined, rec(fiveKm))).toBe(false);
  expect(storyEligible(sessions[3], rec(fiveKm, { lat: [0], lon: [0], brk: [] }))).toBe(false);
});

test('buildModel puts it all together', () => {
  const r = rec(fiveKm);
  const m = buildModel(sessions[3], r, sessions, 30);
  expect(m.kicker).toBe('RUN · WED 7 OCT');
  expect(m.dateText).toBe('WED 7 OCT');
  expect(m.values.dist.value).toBe('5.42');
  expect(m.values.best.value).toBe('6:12');
  expect(m.week).toMatchObject({ before: 58, add: 34, after: 92, target: 150 });
  expect(m.lanes).toHaveLength(5);
  expect(m.track).toBe(r.track);
  expect(m.templates).toEqual({ A: { ok: true }, B: { ok: true }, C: { ok: true }, D: { ok: true }, E: { ok: true }, F: { ok: true } });
});
test('buildModel kicker falls back to the session date without a start time', () => {
  const m = buildModel({ ...sessions[3], date: '2026-10-09' }, { ...rec(fiveKm), startTime: null }, sessions, 30);
  expect(m.kicker).toBe('RUN · FRI 9 OCT');
});
test('buildModel is null when the session cannot have a story', () => {
  expect(buildModel(sessions[0], rec(fiveKm), sessions, 30)).toBeNull();
  expect(buildModel(sessions[3], null, sessions, 30)).toBeNull();
});

test('the sample run record fits the assumed shape', async () => {
  const { sampleTrack } = await import('../../src/core/sample.js');
  const r = sampleTrack('2026-10-07', 30);
  const s = { ...sessions[3], trackId: 't_sample', sample: true };
  expect(storyEligible(s, r)).toBe(true);
  const m = buildModel(s, r, sessions, 30);
  expect(m.kicker).toBe('RUN · WED 7 OCT');
  expect(m.values.dist).not.toBeNull();
  expect(m.lanes.length).toBeGreaterThanOrEqual(2);
  const p = routePath(m.track, 1080, 1920);
  expect(p.pts.length).toBe(m.track.lat.length);
  expect(p.total).toBeGreaterThan(0);
});
