import { PRESETS, INK, WHITE, luminance, onColor, highlight, rgba } from '../../src/story/colors.js';

test('presets keep the agreed order, ids, names and hex values', () => {
  expect(PRESETS).toEqual([
    { id: 'blue', name: 'Blue', hex: '#1E4FA0' },
    { id: 'red', name: 'Red', hex: '#C8281C' },
    { id: 'green', name: 'Green', hex: '#1E7A46' },
    { id: 'purple', name: 'Purple', hex: '#6B3FA0' },
    { id: 'black', name: 'Black', hex: '#111A2B' },
    { id: 'yellow', name: 'Yellow', hex: '#E8A317' },
    { id: 'paper', name: 'Paper white', hex: '#F1F2EE' },
  ]);
  expect(INK).toBe('#111A2B');
  expect(WHITE).toBe('#FFFFFF');
});

test('onColor is white on the dark presets', () => {
  for (const id of ['blue', 'red', 'green', 'purple', 'black']) {
    const preset = PRESETS.find((p) => p.id === id);
    expect(onColor(preset.hex)).toBe('#FFFFFF');
  }
});

test('onColor is ink on yellow and paper', () => {
  expect(onColor('#E8A317')).toBe('#111A2B');
  expect(onColor('#F1F2EE')).toBe('#111A2B');
});

test('hex is accepted in upper or lower case', () => {
  expect(onColor('#e8a317')).toBe('#111A2B');
  expect(onColor('#1e4fa0')).toBe('#FFFFFF');
  expect(luminance('#e8a317')).toBeCloseTo(luminance('#E8A317'), 10);
});

test('highlight contrasts with the background', () => {
  expect(highlight('#1E4FA0')).toEqual({ fill: '#E8A317', on: '#111A2B' });
  expect(highlight('#E8A317')).toEqual({ fill: '#C8281C', on: '#FFFFFF' });
  expect(highlight('#F1F2EE').fill).toBe('#C8281C');
});

test('luminance uses WCAG relative luminance at the extremes', () => {
  expect(luminance('#FFFFFF')).toBeCloseTo(1, 10);
  expect(luminance('#000000')).toBeCloseTo(0, 10);
});

test('rgba turns a hex colour into an rgba string', () => {
  expect(rgba('#1E4FA0', 0.5)).toBe('rgba(30, 79, 160, 0.5)');
});
