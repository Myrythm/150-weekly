export const INK = '#111A2B';
export const WHITE = '#FFFFFF';

const HIGHLIGHT_ON_DARK = { fill: '#E8A317', on: INK };
const HIGHLIGHT_ON_LIGHT = { fill: '#C8281C', on: WHITE };
const INK_LUMINANCE_THRESHOLD = 0.36;

export const PRESETS = [
  { id: 'blue', name: 'Blue', hex: '#1E4FA0' },
  { id: 'red', name: 'Red', hex: '#C8281C' },
  { id: 'green', name: 'Green', hex: '#1E7A46' },
  { id: 'purple', name: 'Purple', hex: '#6B3FA0' },
  { id: 'black', name: 'Black', hex: '#111A2B' },
  { id: 'yellow', name: 'Yellow', hex: '#E8A317' },
  { id: 'paper', name: 'Paper white', hex: '#F1F2EE' },
];

function channels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

function linearise(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// WCAG relative luminance of a hex colour, 0 (black) to 1 (white).
export function luminance(hex) {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Ink text on light backgrounds, white text on dark ones.
export function onColor(hex) {
  return luminance(hex) > INK_LUMINANCE_THRESHOLD ? INK : WHITE;
}

// Accent for highlighted values, chosen to stand out against the background.
export function highlight(hex) {
  return onColor(hex) === WHITE ? { ...HIGHLIGHT_ON_DARK } : { ...HIGHLIGHT_ON_LIGHT };
}

export function rgba(hex, alpha) {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
