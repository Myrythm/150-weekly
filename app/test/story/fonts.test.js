import { FONTS, loadStoryFonts } from '../../src/story/fonts.js';

const realFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
function setFonts(value) { Object.defineProperty(document, 'fonts', { configurable: true, value }); }
afterEach(() => {
  if (realFonts) Object.defineProperty(document, 'fonts', realFonts);
  else delete document.fonts;
});

test('the story fonts are the faces app/index.html loads', () => {
  expect(FONTS).toEqual(['600 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', '800 40px "Barlow Condensed"', '500 40px "IBM Plex Mono"']);
});

test('loadStoryFonts asks document.fonts for every face', async () => {
  const load = vi.fn(() => Promise.resolve([]));
  setFonts({ load });
  await expect(loadStoryFonts()).resolves.toBeUndefined();
  expect(load.mock.calls.map((c) => c[0])).toEqual(FONTS);
});

test('loadStoryFonts resolves without document.fonts', async () => {
  setFonts(undefined);
  await expect(loadStoryFonts()).resolves.toBeUndefined();
});

test('loadStoryFonts resolves when a load fails or throws', async () => {
  setFonts({ load: vi.fn(() => Promise.reject(new Error('network'))) });
  await expect(loadStoryFonts()).resolves.toBeUndefined();
  setFonts({ load: vi.fn(() => { throw new Error('bad font'); }) });
  await expect(loadStoryFonts()).resolves.toBeUndefined();
});
