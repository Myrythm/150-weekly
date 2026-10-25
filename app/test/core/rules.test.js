import { credit, calc, weekCredit } from '../../src/core/rules.js';
import { activeGuide, ageGroup } from '../../src/core/guide.js';
import { fmtWeekRange, parseYmd } from '../../src/core/dates.js';
const run = (min, intensity, extra) => ({ id: 'x', date: '2026-10-22', type: 'run', minutes: min, intensity, balance: false, ...extra });
test('vigorous counts double for adults, 1:1 for children', () => {
  expect(credit(run(18, 'vigorous'), activeGuide(30))).toBe(36);
  expect(credit(run(18, 'vigorous'), activeGuide(12))).toBe(18);
});
test('light and strength earn no aerobic credit', () => {
  expect(credit(run(15, 'light'), activeGuide(30))).toBe(0);
  expect(credit({ ...run(20, 'moderate'), type: 'strength' }, activeGuide(30))).toBe(0);
});
test('age groups', () => {
  expect([null, 4, 5, 17, 18, 64, 65].map(ageGroup)).toEqual(['unset', 'under5', 'child', 'child', 'adult', 'adult', 'older']);
});
test('balance days need moderate effort or more', () => {
  const now = parseYmd('2026-10-24');
  const s = [{ ...run(20, 'light'), type: 'balance', date: '2026-10-20' }, { ...run(20, 'moderate'), type: 'dance', date: '2026-10-21' }];
  expect(calc(s, 70, now).balanceDays).toBe(1);
});
test('week ranges', () => {
  expect(fmtWeekRange(parseYmd('2026-10-19'))).toBe('19 to 25 Oct 2026');
  expect(fmtWeekRange(parseYmd('2026-10-27'))).toBe('27 Oct to 2 Nov 2026');
  expect(fmtWeekRange(parseYmd('2025-12-29'))).toBe('29 Dec 2025 to 4 Jan 2026');
});
test('weekCredit sums one week only', () => {
  const s = [run(30, 'moderate', { date: '2026-10-19' }), run(30, 'moderate', { date: '2026-10-26' })];
  expect(weekCredit(s, parseYmd('2026-10-19'), activeGuide(30))).toEqual({ credit: 30, count: 1 });
});
