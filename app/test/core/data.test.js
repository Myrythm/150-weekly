import { readFileSync } from 'node:fs';
import { seedSessions } from '../../src/core/sample.js';
import { calc } from '../../src/core/rules.js';
import { sanitizeSessions } from '../../src/core/sanitize.js';
import { buildHistory } from '../../src/core/history.js';
import { activeGuide } from '../../src/core/guide.js';
import { parseYmd } from '../../src/core/dates.js';
import { GPX } from '../../src/core/gpx.js';
import { judgeEffort, gpxOpts } from '../../src/core/gpxEffort.js';
const now = parseYmd('2026-10-24');
test('sample week: 96 aerobic minutes, 1 muscle day, 65+ reads 1 balance day', () => {
  const s = seedSessions(now);
  expect(s.map((x) => x.id)).toContain('sample_33');
  expect(calc(s, 30, now).total).toBe(96);
  expect(calc(s, 30, now).strengthDays).toBe(1);
  expect(calc(s, 70, now).balanceDays).toBe(1);
});
test('sanitizeSessions drops bad rows and keeps valid trackIds', () => {
  const ok = { id: 'a', date: '2026-10-20', type: 'run', minutes: 30, intensity: 'vigorous', source: 'gpx', trackId: 't_abc' };
  const out = sanitizeSessions([ok, { ...ok, minutes: 0 }, { ...ok, minutes: 241 }, { ...ok, date: '20-10-2026' }, { ...ok, type: 'fly' }, { ...ok, trackId: 'bad' }]);
  expect(out.length).toBe(2);
  expect(out[0].trackId).toBe('t_abc');
  expect('trackId' in out[1]).toBe(false);
});
test('history: weeks newest first, whole-week total across New Year, year filter', () => {
  const s = [
    { id: 'a', date: '2025-12-30', type: 'walk', minutes: 100, intensity: 'moderate', createdAt: 1 },
    { id: 'b', date: '2026-01-02', type: 'run', minutes: 30, intensity: 'vigorous', createdAt: 2 },
    { id: 'c', date: '2026-10-20', type: 'strength', minutes: 20, intensity: 'moderate', createdAt: 3 }
  ];
  const all = buildHistory(s, activeGuide(30), now, 'all');
  expect(all.years).toEqual(['2026', '2025']);
  expect(all.weeks.map((w) => w.title)).toEqual(['This week, 19 to 25 Oct 2026', '29 Dec 2025 to 4 Jan 2026']);
  expect(all.weeks[1].total).toBe(160);
  expect(all.weeks[1].hit).toBe(true);
  expect(all.weeks[0].muscleDays).toBe(1);
  const y = buildHistory(s, activeGuide(30), now, '2026');
  expect(y.count).toBe(2);
  expect(y.weeks[1].rows.map((r) => r.id)).toEqual(['b']);
  expect(y.weeks[1].total).toBe(160);
});
test('judgeEffort uses heart rate when the age is known, speed otherwise', () => {
  const text = readFileSync('tools/gpx/fixtures/garmin-run-hr-ele.gpx', 'utf8');
  const m = GPX.analyze(text, gpxOpts('run', 30)).metrics;   // avgHr 144, avgSpeedKmh 10.82
  expect(judgeEffort(m, 'run', 30).basis).toBe('hr');
  const noAge = judgeEffort(m, 'run', null);
  expect(noAge.basis).toBe('speed');
  expect(noAge.text.startsWith('Heart rate needs your age, which is not set yet')).toBe(true);
});
