/* Dates (local time only). Moved from web/js/app.js. */
export const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pad(n) { return String(n).padStart(2, '0'); }
export function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function parseYmd(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
export function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
export function today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
/* Monday = 0 */
export function dayIndex(d) { return (d.getDay() + 6) % 7; }
export function weekStart(d) { return addDays(d, -dayIndex(d)); }
export function plural(n, one, many) { return n === 1 ? one : many; }
export function fmtDay(ds) { const d = parseYmd(ds); return WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
export function fmtWeekRange(ws) {
  const we = addDays(ws, 6);
  if (ws.getFullYear() !== we.getFullYear()) return ws.getDate() + ' ' + MON[ws.getMonth()] + ' ' + ws.getFullYear() + ' to ' + we.getDate() + ' ' + MON[we.getMonth()] + ' ' + we.getFullYear();
  if (ws.getMonth() !== we.getMonth()) return ws.getDate() + ' ' + MON[ws.getMonth()] + ' to ' + we.getDate() + ' ' + MON[we.getMonth()] + ' ' + we.getFullYear();
  return ws.getDate() + ' to ' + we.getDate() + ' ' + MON[we.getMonth()] + ' ' + we.getFullYear();
}
