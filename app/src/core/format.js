/* GPX formatting helpers. Moved from the formatting section of web/js/app.js. */
import { GPX } from './gpx.js';
import { isNum } from './gpxEffort.js';
import { WD, MON, pad, dayIndex } from './dates.js';

export function fmtMinSec(s) { if (!isNum(s) || s <= 0) return null; const t = Math.round(s); return Math.floor(t / 60) + ':' + pad(t % 60); }
export function fmtDistShort(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km'; }
export function fmtStartTime(ms) { const d = new Date(ms); return WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
/* average pace line for a type: pace for run, walk and other; speed for cycle; pace per 100 m for swim */
export function paceLine(m, type) {
  if (type === 'cycle') return isNum(m.avgSpeedKmh) ? ['Avg speed', GPX.fmtSpeed(m.avgSpeedKmh)] : null;
  if (type === 'swim') return isNum(m.avgPaceSPer100m) ? ['Avg pace', GPX.fmtSwimPace(m.avgPaceSPer100m)] : null;
  return isNum(m.avgPaceSPerKm) ? ['Avg pace', GPX.fmtPace(m.avgPaceSPerKm)] : null;
}
