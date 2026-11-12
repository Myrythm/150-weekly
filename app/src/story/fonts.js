/*
 * The story fonts, as loaded by app/index.html: Barlow Condensed 600, 700, 800 and IBM Plex Mono 500.
 * The preview waits for them before its first draw and the export waits before its first frame, so a
 * story is never drawn in a fallback face.
 */
export const FONTS = ['600 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', '800 40px "Barlow Condensed"', '500 40px "IBM Plex Mono"'];

/** Resolves once every story font is loaded; also resolves without document.fonts or when a load fails. */
export function loadStoryFonts() {
  const f = typeof document !== 'undefined' ? document.fonts : null;
  if (!f || typeof f.load !== 'function') return Promise.resolve();
  try {
    return Promise.all(FONTS.map(function (spec) { return f.load(spec); })).then(function () {}, function () {});
  } catch (e) {
    return Promise.resolve();
  }
}
