/* Reduced motion preference (web/js/app.js reduced). matchMedia can throw or be missing. */
export function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
