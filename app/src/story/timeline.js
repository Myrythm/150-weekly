/*
 * Timing for the animated story templates. A story is DURATION seconds at FPS frames per second; all
 * motion is finished by MOTION seconds and the final state holds until the end, so the last frame
 * equals a static version. Templates ask progress(t, start, length) for each moving part.
 */
export const FPS = 30;
export const DURATION = 5;
export const MOTION = 3;
export const FRAMES = FPS * DURATION;

export const ANIMATED = ['C', 'D', 'E'];

export function isAnimated(id) {
  return ANIMATED.indexOf(id) >= 0;
}

/* Ease in out (quadratic), as the mockup's count up: ease(0) = 0, ease(1) = 1. */
export function ease(p) {
  if (!(p > 0)) return 0;
  if (p >= 1) return 1;
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/* The eased progress of a part that starts at `start` and lasts `length` seconds, clamped to 0..1.
   Exactly 1 from start + length on, so frames after the motion are identical. */
export function progress(t, start, length) {
  if (!(length > 0)) return t >= start ? 1 : 0;
  return ease((t - start) / length);
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/* The value `final` (a display string) at fraction p of its count from 0, formatted like the final
   value: the same decimals for a plain number, m:ss for m:ss, h:mm:ss for h:mm:ss. Anything else is
   returned as it is. */
export function countText(final, p) {
  const s = String(final);
  if (p >= 1) return s;
  const f = p > 0 ? p : 0;
  const clock = /^(\d+):(\d\d)(?::(\d\d))?$/.exec(s);
  if (clock) {
    const hours = clock[3] !== undefined;
    const total = hours
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
    const v = Math.round(total * f);
    if (hours) return Math.floor(v / 3600) + ':' + pad2(Math.floor(v / 60) % 60) + ':' + pad2(v % 60);
    return Math.floor(v / 60) + ':' + pad2(v % 60);
  }
  const plain = /^\d+(?:\.(\d+))?$/.exec(s);
  if (plain) {
    const dec = plain[1] ? plain[1].length : 0;
    return (Number(s) * f).toFixed(dec);
  }
  return s;
}
