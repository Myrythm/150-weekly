<script setup>
/* The 12-week consistency grid (web/index.html #streak; renderGrid and the streak half of
   applyGuide). One square per day, darker with more aerobic minutes; a ringed square is a
   strength-only day, a dotted one a light-only day, a flag marks a week at target. The tiles and
   the message follow data.summary. Under 5 has no target, so the tiles, message and flag legend hide. */
import { computed } from 'vue';
import { useDataStore } from '../stores/data.js';
import { WD, MON, addDays, ymd, plural } from '../core/dates.js';
import { credit, isStrength, isLight, weekCredit } from '../core/rules.js';

const data = useDataStore();

const c = computed(function () { return data.summary; });
const u5 = computed(function () { return c.value.group === 'under5'; });
const sample = computed(function () { return data.meta.sampleActive; });

/* per-day sums over every session */
const days = computed(function () {
  const g = c.value.guide;
  const credits = {}, raw = {}, str = {}, light = {};
  data.sessions.forEach(function (s) {
    credits[s.date] = (credits[s.date] || 0) + credit(s, g);
    raw[s.date] = (raw[s.date] || 0) + s.minutes;
    if (isStrength(s)) str[s.date] = (str[s.date] || 0) + s.minutes;
    if (isLight(s)) light[s.date] = (light[s.date] || 0) + s.minutes;
  });
  return { credits: credits, raw: raw, str: str, light: light };
});

/* the 12 week columns, oldest first, with the month label and the flag */
const weeks = computed(function () {
  const cc = c.value;
  const list = [];
  for (let k = 0; k < 12; k++) {
    const ws = addDays(cc.ws, -7 * (11 - k));
    list.push({ ws: ws, hit: cc.group !== 'under5' && weekCredit(data.sessions, ws, cc.guide).credit >= cc.target });
  }
  return list.map(function (w, k) {
    const mo = w.ws.getMonth();
    const show = k === 0 ? (list[1].ws.getMonth() === mo) : (list[k - 1].ws.getMonth() !== mo);
    return { ws: w.ws, hit: w.hit, month: show ? MON[mo] : '' };
  });
});

const rows = computed(function () {
  const cc = c.value, dd = days.value, todayS = ymd(cc.today);
  const lvStep = cc.target / 7.5;   /* 20 and 40 min for a 150 target */
  const out = [];
  for (let r = 0; r < 7; r++) {
    const cells = weeks.value.map(function (w) {
      const d = addDays(w.ws, r), ds = ymd(d);
      const cr = dd.credits[ds] || 0, str = dd.str[ds] || 0, lt = dd.light[ds] || 0, raw = (dd.raw[ds] || 0) - str - lt;
      const future = ds > todayS;
      /* 'lvs' = strength work but no aerobic minutes; 'lvl' = light activity only. Both are active days, neither is aerobic. */
      const lv = cr === 0 ? (str > 0 ? 's' : lt > 0 ? 'l' : 0) : cr < lvStep ? 1 : cr < lvStep * 2 ? 2 : 3;
      const ltNote = lt > 0 ? ', plus ' + lt + ' min light (not counted)' : '';
      const name = WD[r] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
      const title = future ? name + ': upcoming'
        : lv === 's' ? name + ': muscle day, ' + str + ' min of strength (no aerobic minutes)' + ltNote
        : lv === 'l' ? name + ': ' + lt + ' min light activity (not counted toward ' + cc.target + ')'
        : name + ': ' + raw + ' min' + (cr !== raw ? ' (counts as ' + cr + ')' : '') + ltNote + (str > 0 ? ', plus a muscle day' : '');
      return { ds: ds, title: title, cls: (future ? 'future' : 'lv' + lv) + (ds === todayS ? ' today' : '') };
    });
    out.push({ r: r, label: r === 0 ? 'M' : r === 2 ? 'W' : r === 4 ? 'F' : '', cells: cells });
  }
  return out;
});

const hits = computed(function () { return weeks.value.filter(function (w) { return w.hit; }).length; });
const active = computed(function () {
  let n = 0;
  for (let i = 0; i < 28; i++) { if ((days.value.raw[ymd(addDays(c.value.today, -i))] || 0) > 0) n++; }
  return n;
});

const gridLabel = computed(function () {
  return '12-week activity grid. ' + (u5.value ? '' : hits.value + ' of 12 weeks reached ' + c.value.target + '. ') + active.value + ' active days in the last 28. Ringed squares are strength-only days. Dotted squares are light-only days.';
});
const intro = computed(function () {
  return 'One square per day. Darker means more aerobic minutes; a ringed square is a strength-only day and a dotted square is a light-only day. ' + (u5.value ? '' : 'A flag marks every week you reached ' + c.value.target + '. ') + 'Missed days happen; the week is what counts.';
});
const message = computed(function () {
  const cc = c.value;
  if (cc.thisHit) return 'This week is in the bank. Streak now ' + cc.streak + '.';
  if (cc.streak >= 1) return 'Keep the streak: ' + cc.remaining + ' minutes to go by Sunday.';
  if (cc.remaining < cc.target) return 'Start a streak this week: ' + cc.remaining + ' minutes to go by Sunday.';
  return 'Start a streak this week: ' + cc.target + ' minutes by Sunday.';
});
</script>

<template>
  <section class="section" id="streak" aria-labelledby="streak-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="label">Consistency</p>
        <h2 class="h2" id="streak-heading">Your last 12 weeks <span class="tag tag-sample" id="grid-sample-tag" :hidden="!sample">Sample</span></h2>
      </div>
      <p class="section-intro" id="streak-intro">{{ intro }}</p>
      <div class="streak-layout">
        <div class="streak-tiles tiles" id="tiles" :hidden="u5">
          <div class="tile"><p class="label">Week streak</p><p class="tile-value" id="tile-streak">{{ c.streak }}</p><p class="tile-unit" id="tile-streak-unit">{{ plural(c.streak, 'week', 'weeks') }} at {{ c.target }} in a row</p></div>
          <div class="tile"><p class="label" id="tile-weeks-label">Weeks at {{ c.target }}</p><p class="tile-value" id="tile-weeks">{{ hits }}</p><p class="tile-unit">of the last 12</p></div>
          <div class="tile"><p class="label">Active days</p><p class="tile-value" id="tile-days">{{ active }}</p><p class="tile-unit">in the last 28</p></div>
        </div>
        <p class="streak-msg" id="streak-msg" :hidden="u5">{{ message }}</p>
        <div class="grid-area">
          <p class="small grid-empty" id="grid-empty" :hidden="data.sessions.length > 0">Your 12 weeks fill in as you log. Today's square is outlined in red.</p>
          <div class="grid" id="grid" role="img" :aria-label="gridLabel">
            <span></span>
            <span v-for="(w, k) in weeks" :key="'m' + k" class="g-month">{{ w.month }}</span>
            <template v-for="row in rows" :key="row.r">
              <span class="g-row">{{ row.label }}</span>
              <span v-for="cell in row.cells" :key="cell.ds" class="cell" :class="cell.cls" :title="cell.title"></span>
            </template>
            <span></span>
            <span v-for="(w, k) in weeks" :key="'f' + k" class="g-flag"><svg v-if="w.hit" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1h1.6v12H3z" /><path d="M4.6 1.5L12 4.5 4.6 7.5z" /></svg></span>
          </div>
        </div>
        <div class="streak-legend legend-row" id="grid-legend">
          <span>Less</span>
          <span class="cell lv0"></span><span class="cell lv1"></span><span class="cell lv2"></span><span class="cell lv3"></span>
          <span>More</span>
          <span class="lg"><span class="cell lvs" id="legend-strength-cell"></span><span id="legend-strength">Strength only</span></span>
          <span class="lg"><span class="cell lvl" id="legend-light-cell"></span><span id="legend-light-day">Light only</span></span>
          <span class="lg" id="legend-hit-group" :hidden="u5"><span class="flag" id="legend-flag" aria-hidden="true" :hidden="u5"><svg viewBox="0 0 14 14"><path d="M3 1h1.6v12H3z" /><path d="M4.6 1.5L12 4.5 4.6 7.5z" /></svg></span><span id="legend-hit" :hidden="u5">Hit {{ c.target }}</span></span>
        </div>
      </div>
    </div>
  </section>
</template>
