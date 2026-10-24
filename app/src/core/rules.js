/* Exercise rules (aerobic credit, balance days, weekly derived values). Moved from web/js/app.js;
   the closure reads of prefs.age, sessions and today() are now parameters. */
import { ymd, addDays, weekStart, dayIndex } from './dates.js';
import { ageGroup, activeGuide } from './guide.js';

export const TYPE_LABEL = { walk: 'Walk', run: 'Run', cycle: 'Cycle', strength: 'Strength', swim: 'Swim', yoga: 'Yoga or stretching', sport: 'Sport', stairs: 'Stairs', other: 'Other', balance: 'Balance or tai chi', dance: 'Dance' };
export const VALID_TYPES = ['walk', 'run', 'cycle', 'strength', 'swim', 'yoga', 'sport', 'stairs', 'other', 'habit', 'balance', 'dance'];
/* Types that make a balance day on their own (65+ group). Any other session can count through its "balance work" flag. */
export const BALANCE_TYPES = ['balance', 'yoga', 'dance'];

/* Aerobic credit only. Strength sessions count toward muscle days, never toward minutes (WHO 2020 treats them separately). */
export function isStrength(s) { return s.type === 'strength'; }
/* Light activity (below about 3 METs) is recorded and shown but earns no aerobic credit in any age group. */
export function isLight(s) { return !isStrength(s) && s.intensity === 'light'; }
/* Qualifying session for the 65+ balance guideline: a balance, yoga or dance session, or any session flagged "included balance work". Effort is not checked here. */
export function isBalance(s) { return s.balance === true || BALANCE_TYPES.indexOf(s.type) >= 0; }
/* The one balance-day check, used by calc(), the splits tag, the log messages and the routines: a qualifying session at moderate effort or more (WHO 2020). Strength is stored as moderate, so a flagged strength session still counts. credit() still follows effort. */
export function countsAsBalance(s) { return isBalance(s) && s.intensity !== 'light'; }
/* The only route for aerobic minutes. guide is activeGuide(age). */
export function credit(s, guide) { return (isStrength(s) || isLight(s)) ? 0 : (s.intensity === 'vigorous' ? s.minutes * guide.vigorousMultiplier : s.minutes); }
export function actLabel(s) { return s.type === 'habit' ? 'Plan: ' + (s.note || 'habit') : TYPE_LABEL[s.type]; }
export function weekCredit(sessions, ws, guide) {
  const a = ymd(ws), b = ymd(addDays(ws, 6));
  let sum = 0, n = 0;
  sessions.forEach(function (s) { if (s.date >= a && s.date <= b) { sum += credit(s, guide); n++; } });
  return { credit: sum, count: n };
}
/* now is a Date at local midnight (today() in the app, a fixed date in tests). */
export function calc(sessions, age, now) {
  const g = activeGuide(age), target = g.aerobic;
  const t = now, ws = weekStart(t), di = dayIndex(t);
  const a = ymd(ws), b = ymd(addDays(ws, 6));
  const cur = sessions.filter(function (s) { return s.date >= a && s.date <= b; });
  let mod = 0, vig = 0;
  let strengthMin = 0, lightMin = 0;
  cur.forEach(function (s) { if (isStrength(s)) strengthMin += s.minutes; else if (isLight(s)) lightMin += s.minutes; else if (s.intensity === 'vigorous') vig += s.minutes; else mod += s.minutes; });
  const total = mod + vig * g.vigorousMultiplier;
  const strengthDays = new Set(cur.filter(function (s) { return s.type === 'strength'; }).map(function (s) { return s.date; })).size;
  const balanceDays = new Set(cur.filter(countsAsBalance).map(function (s) { return s.date; })).size;
  const vigDays = new Set(cur.filter(function (s) { return s.intensity === 'vigorous' && !isStrength(s); }).map(function (s) { return s.date; })).size;
  const lw = weekCredit(sessions, addDays(ws, -7), g);
  let streak = 0;
  for (let k = 1; k <= 20; k++) { if (weekCredit(sessions, addDays(ws, -7 * k), g).credit >= target) streak++; else break; }
  const thisHit = total >= target;
  if (thisHit) streak++;
  return { guide: g, target: target, group: ageGroup(age), today: t, ws: ws, di: di, daysLeft: 7 - di, cur: cur, mod: mod, vig: vig, total: total, remaining: Math.max(0, target - total), strengthDays: strengthDays, strengthMin: strengthMin, lightMin: lightMin, balanceDays: balanceDays, vigDays: vigDays, lastWeek: lw, streak: streak, thisHit: thisHit };
}
