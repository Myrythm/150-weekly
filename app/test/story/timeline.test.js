import { FPS, DURATION, MOTION, FRAMES, ease, progress, ANIMATED, isAnimated, countText } from '../../src/story/timeline.js';

test('timing constants', () => {
  expect([FPS, DURATION, MOTION, FRAMES]).toEqual([30, 5, 3, 150]);
  expect(FRAMES).toBe(FPS * DURATION);
});

test('progress is eased and clamped to 0..1', () => {
  expect(progress(0.3, 0.3, 2.3)).toBe(0);
  expect(progress(2.6, 0.3, 2.3)).toBe(1);
  expect(progress(9, 0.3, 2.3)).toBe(1);
  expect(progress(-1, 0, 1)).toBe(0);
  expect(progress(NaN, 0, 1)).toBe(0);
  const mid = progress(1.45, 0.3, 2.3);
  expect(mid).toBeGreaterThan(0.45);
  expect(mid).toBeLessThan(0.55);
});

test('ease starts at 0, ends at 1 and never goes down', () => {
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  const v = [0, 0.25, 0.5, 0.75, 1].map(ease);
  for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
});

test('C, D and E are the animated templates', () => {
  expect(ANIMATED).toEqual(['C', 'D', 'E']);
  ['C', 'D', 'E'].forEach(id => expect(isAnimated(id)).toBe(true));
  ['A', 'B', 'F', 'X', undefined].forEach(id => expect(isAnimated(id)).toBe(false));
});

test('countText formats intermediate values like the final value', () => {
  expect(countText('5.02', 0)).toBe('0.00');
  expect(countText('5.02', 1)).toBe('5.02');
  expect(countText('5.02', 0.5)).toBe('2.51');
  expect(countText('850', 0.5)).toBe('425');
  expect(countText('6:39', 0)).toBe('0:00');
  expect(countText('6:39', 0.5)).toMatch(/^\d:\d\d$/);
  expect(countText('33:24', 0.5)).toBe('16:42');
  expect(countText('4:05:33', 0)).toBe('0:00:00');
  expect(countText('4:05:33', 0.5)).toMatch(/^\d:\d\d:\d\d$/);
  expect(countText('4:05:33', 1)).toBe('4:05:33');
  expect(countText('abc', 0.5)).toBe('abc');
});
