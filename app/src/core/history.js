/* Full log grouping. This is the computation inside renderHistory in web/js/app.js, with the closure reads
   (sessions, HIST.period, calc()) turned into parameters. No DOM. */
import { ymd, parseYmd, addDays, weekStart, fmtWeekRange } from './dates.js';
import { credit, weekCredit } from './rules.js';

/* guide is activeGuide(age); now is today's date at local midnight; period is 'all' or a year string.
   A period no session falls in is treated as 'all' (the reference resets it the same way).
   weeks holds every week, newest first; the caller slices for "Show older weeks".
   week.hit is total >= target; the view hides it for under-5s. */
export function buildHistory(sessions, guide, now, period) {
  const target = guide.aerobic;
  const years = Array.from(new Set(sessions.map(function (s) { return s.date.slice(0, 4); }))).sort().reverse();
  const per = (period !== 'all' && years.indexOf(period) < 0) ? 'all' : period;
  const list = sessions.filter(function (s) { return per === 'all' || s.date.slice(0, 4) === per; });
  const byWeek = {};
  list.forEach(function (s) { const k = ymd(weekStart(parseYmd(s.date))); (byWeek[k] = byWeek[k] || []).push(s); });
  const keys = Object.keys(byWeek).sort().reverse();
  let minutes = 0, hit = 0;
  list.forEach(function (s) { minutes += credit(s, guide); });
  const curWs = ymd(weekStart(now)), lastWs = ymd(addDays(weekStart(now), -7));
  const weeks = keys.map(function (k) {
    const ws = parseYmd(k);
    const rows = byWeek[k].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt; });
    /* a week's total always counts the whole week, even when the period cuts it at New Year */
    const total = weekCredit(sessions, ws, guide).credit;
    const wHit = total >= target;
    if (wHit) hit++;
    const muscleDays = new Set(sessions.filter(function (s) { return s.type === 'strength' && ymd(weekStart(parseYmd(s.date))) === k; }).map(function (s) { return s.date; })).size;
    const title = (k === curWs ? 'This week, ' : k === lastWs ? 'Last week, ' : '') + fmtWeekRange(ws);
    return { key: k, title: title, rows: rows, total: total, muscleDays: muscleDays, hit: wHit };
  });
  return { years: years, period: per, count: list.length, minutes: minutes, hit: hit, weeks: weeks };
}
