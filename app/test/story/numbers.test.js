import { numberValues, resolveNumbers, toggleSmall, sanitizeStoryPrefs, DEFAULT_STORY_PREFS } from '../../src/story/numbers.js';

const full = { distanceM: 5020, movingS: 2004, avgPaceSPerKm: 399, bestKmPaceS: 372, avgHr: 151.6, maxHr: 171, elevGainM: 38.2, avgCad: 164 };
const miFitness = { distanceM: 2020, movingS: 807, avgPaceSPerKm: 399.5, bestKmPaceS: 380, avgHr: null, maxHr: null, elevGainM: null, avgCad: null };
const routeOnly = { distanceM: 3100, movingS: null, avgPaceSPerKm: null, bestKmPaceS: null, avgHr: null, maxHr: null, elevGainM: null, avgCad: null };

test('values match the activity page formatting', () => {
  const v = numberValues(full);
  expect(v.dist).toEqual({ value: '5.02', unit: 'KM', label: 'KM' });
  expect(v.time.value).toBe('33:24');
  expect(v.pace).toEqual({ value: '6:39', unit: '/KM', label: 'PACE /KM' });
  expect(v.hr.value).toBe('152');
  expect(v.climb.value).toBe('+38');
  expect(numberValues({ distanceM: 640 }).dist).toEqual({ value: '640', unit: 'M', label: 'M' });
  expect(numberValues({ distanceM: 42195, movingS: 14733 }).time.value).toBe('4:05:33');
});
test('recommended set with everything available', () => {
  expect(resolveNumbers(DEFAULT_STORY_PREFS, numberValues(full))).toEqual({ hero: 'dist', small: ['time', 'pace', 'hr'] });
});
test('a Mi Fitness file: heart rate is replaced by the next available number', () => {
  expect(resolveNumbers(DEFAULT_STORY_PREFS, numberValues(miFitness))).toEqual({ hero: 'dist', small: ['time', 'pace', 'best'] });
});
test('route only file: hero falls back to distance, no small numbers', () => {
  const p = { ...DEFAULT_STORY_PREFS, hero: 'pace' };
  expect(resolveNumbers(p, numberValues(routeOnly))).toEqual({ hero: 'dist', small: [] });
});
test('hero is never also a small number; recommended refills to three', () => {
  const p = { ...DEFAULT_STORY_PREFS, hero: 'time' };
  expect(resolveNumbers(p, numberValues(full))).toEqual({ hero: 'time', small: ['dist', 'pace', 'hr'] });
});
test('toggle adds up to four, then ignores more, and removes', () => {
  const v = numberValues(full);
  let p = toggleSmall(DEFAULT_STORY_PREFS, 'best', v);
  expect(p.small).toEqual(['time', 'pace', 'hr', 'best']);
  expect(toggleSmall(p, 'climb', v).small).toEqual(['time', 'pace', 'hr', 'best']);
  expect(toggleSmall(p, 'pace', v).small).toEqual(['time', 'hr', 'best']);
});
test('toggling the hero or an unavailable number changes nothing', () => {
  const v = numberValues(miFitness);
  expect(toggleSmall(DEFAULT_STORY_PREFS, 'dist', v)).toEqual(DEFAULT_STORY_PREFS);
  expect(toggleSmall(DEFAULT_STORY_PREFS, 'hr', v)).toEqual(DEFAULT_STORY_PREFS);
});
test('broken stored settings become valid settings', () => {
  expect(sanitizeStoryPrefs(null)).toEqual(DEFAULT_STORY_PREFS);
  expect(sanitizeStoryPrefs('x')).toEqual(DEFAULT_STORY_PREFS);
  expect(sanitizeStoryPrefs({ template: 'Z', color: 'red', opacity: 250, hero: 'kcal', small: ['kcal', 'time', 'time', 'pace', 'hr', 'best', 'climb', 'cad', 'dist'] }))
    .toEqual({ template: 'A', color: '#1E4FA0', opacity: 100, hero: 'dist', small: ['dist', 'time', 'pace', 'hr'] });
  expect(sanitizeStoryPrefs({ template: 'D', color: '#abcdef', opacity: 47, hero: 'pace', small: [] }))
    .toEqual({ template: 'D', color: '#ABCDEF', opacity: 45, hero: 'pace', small: [] });
});
