<script setup>
/* The hero band (web/index.html #week; renderHero, setBibNumber, nextStepLine, fillBoxes,
   renderBalance, buildLane and the hero half of applyGuide). Left: heading, lead and the age chip.
   Middle: the bib, the lane, the legend, the next step, strength and balance days, last week.
   Right: the age step or the log panel. All of it follows data.summary and the age group. */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useDataStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';
import { MON } from '../core/dates.js';
import { GUIDE_NOTE, hasTargets } from '../core/guide.js';
import { reduced } from '../core/motion.js';
import AgeStep from './AgeStep.vue';
import LogForm from './LogForm.vue';

const logStatus = defineModel('logStatus', { type: String, default: '' });

const data = useDataStore();
const auth = useAuthStore();
const ui = useUiStore();

const heading = ref(null);
const changeBtn = ref(null);
const ageStep = ref(null);
const logForm = ref(null);

const c = computed(function () { return data.summary; });
const g = computed(function () { return c.value.guide; });
const sample = computed(function () { return data.meta.sampleActive; });
const u5 = computed(function () { return data.group === 'under5'; });
const covered = computed(function () { return hasTargets(data.prefs.age); });
const name = computed(function () { return (auth.profile && auth.profile.displayName) || ''; });

const h1 = computed(function () { return u5.value ? GUIDE_NOTE.under5H1 : g.value.copy.h1; });
const lead = computed(function () { return u5.value ? GUIDE_NOTE.under5Lead : g.value.copy.lead; });
const chip = computed(function () { return data.group === 'unset' ? GUIDE_NOTE.unsetChip : u5.value ? GUIDE_NOTE.under5Chip : g.value.copy.chip; });

/* ----- bib ----- */
const target = computed(function () { return c.value.target; });
const total = computed(function () { return c.value.total; });
const mult = computed(function () { return g.value.vigorousMultiplier; });
const bibLabel = computed(function () { return 'This week: ' + total.value + ' of ' + target.value + ' active minutes'; });
const bibWeek = computed(function () { return 'Week of ' + c.value.ws.getDate() + ' ' + MON[c.value.ws.getMonth()].toUpperCase(); });
const bibStatus = computed(function () {
  const t = total.value, tg = target.value;
  return t >= tg ? 'Target met' + (t > tg ? ' +' + (t - tg) + ' extra' : '') : c.value.remaining + ' to go';
});

/* the number counts up over 400 ms (instantly when motion is reduced); the first value never animates */
function fmtBib(n) { return String(Math.round(n)).padStart(3, '0'); }
const bibText = ref(fmtBib(total.value));
let bibShown = total.value, bibRaf = 0, bibSettle = 0;
function setBibNumber(n) {
  cancelAnimationFrame(bibRaf);
  clearTimeout(bibSettle);
  if (reduced() || bibShown === n) { bibText.value = fmtBib(n); bibShown = n; return; }
  const from = bibShown, t0 = performance.now();
  bibShown = n;
  (function step(now) {
    const p = Math.min(1, (now - t0) / 400);
    bibText.value = fmtBib(from + (n - from) * p);
    if (p < 1) bibRaf = requestAnimationFrame(step);
  })(t0);
  /* safety net: if frames are throttled (background tab), still land on the exact value */
  bibSettle = setTimeout(function () { cancelAnimationFrame(bibRaf); bibText.value = fmtBib(n); }, 450);
}
watch(total, setBibNumber);
onBeforeUnmount(function () { cancelAnimationFrame(bibRaf); clearTimeout(bibSettle); });

/* ----- lane ----- */
const denom = computed(function () { return Math.max(target.value, total.value); });
const modWidth = computed(function () { return (c.value.mod / denom.value * 100) + '%'; });
const vigCredit = computed(function () { return c.value.vig * mult.value; });
const vigWidth = computed(function () { return (vigCredit.value / denom.value * 100) + '%'; });
const marker = computed(function () { return total.value > target.value ? target.value + '+' : String(total.value); });
const markerPct = computed(function () { return Math.min(total.value, target.value) / target.value * 100; });
const over = computed(function () { return total.value > target.value; });
const stretchShown = computed(function () { return !!(g.value.stretch && total.value >= target.value); });
const meterText = computed(function () {
  return total.value >= target.value ? total.value + ' of ' + target.value + ' minutes, target met' : total.value + ' of ' + target.value + ' minutes, ' + c.value.remaining + ' to go';
});
/* ticks go in the DOM last first, as the reference inserts each one before the first child */
const ticks = computed(function () {
  const tg = g.value.aerobic, tick = g.value.lane.tick, step = g.value.lane.label, out = [];
  for (let m = 0; m < tg; m += tick) out.push({ left: (m / tg * 100) + '%', tall: m % step === 0 });
  return out.reverse();
});
const laneLabels = computed(function () {
  const tg = g.value.aerobic, step = g.value.lane.label;
  const out = [{ left: 0, text: '0', cls: 'l-first' }];
  for (let m = step; m < tg; m += step) out.push({ left: m / tg * 100, text: String(m), cls: 'l-desk' });
  out.push({ left: 50, text: String(tg / 2), cls: 'l-mob' });
  out.push({ left: 100, text: tg + ' FINISH', cls: '' });
  return out;
});
const legendVig = computed(function () {
  return mult.value > 1 ? 'Vigorous ' + c.value.vig + ' min x' + mult.value + ' = ' + vigCredit.value : 'Vigorous ' + c.value.vig + ' min';
});

/* ----- next step ----- */
const nextStep = computed(function () {
  const x = c.value, gd = g.value, rem = x.remaining, m = gd.vigorousMultiplier;
  if (x.total >= x.target && gd.stretch) {
    if (x.total >= gd.stretch) return 'Stretch goal met: ' + x.total + ' minutes this week. Anything extra still counts.';
    return 'Target met. Stretch goal: ' + gd.stretch + ' minutes for extra benefit, ' + (gd.stretch - x.total) + ' to go.';
  }
  if (x.total >= x.target) return gd.copy.met;
  if (x.daysLeft === 1) return rem + ' minutes to go today. ' + (m > 1 ? 'A ' + Math.ceil(rem / m) + '-minute run would do it, so would a long walk.' : gd.copy.lastDay);
  if (x.total === 0) return x.target + ' minutes to go with ' + x.daysLeft + ' days left. ' + gd.copy.zero;
  return rem + ' minutes to go with ' + x.daysLeft + ' days left. That is about ' + Math.ceil(rem / x.daysLeft) + ' minutes a day' + (m > 1 ? ', or ' + Math.ceil(rem / m) + ' minutes of running in total.' : '.');
});

/* ----- strength, vigorous and balance days: n boxes, the first `on` filled ----- */
function boxes(count, on) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(i < on);
  return out;
}
const strengthDays = computed(function () { return Math.min(c.value.strengthDays, g.value.muscleDays); });
const vigDays = computed(function () { return g.value.vigorousDays ? Math.min(c.value.vigDays, g.value.vigorousDays) : 0; });
const balanceDays = computed(function () { return g.value.balanceDays > 0 ? Math.min(c.value.balanceDays, g.value.balanceDays) : 0; });
const lastWeek = computed(function () {
  const lw = c.value.lastWeek;
  return lw.count > 0 ? 'Last week: ' + lw.credit + ' of ' + target.value + '.' + (lw.credit >= target.value ? ' Target met.' : '') : '';
});

function onAgeDone() {
  /* the Change age button shows once the step has closed */
  setTimeout(function () { if (changeBtn.value) changeBtn.value.focus(); }, 0);
}

defineExpose({
  focusHeading: function () { if (heading.value) heading.value.focus(); },
  focusAge: function () { if (ageStep.value) ageStep.value.focusInput(); },
  focusLog: function () { if (logForm.value) logForm.value.focusActivity(); }
});
</script>

<template>
  <section class="band" id="week" aria-labelledby="week-heading">
    <div class="wrap">
      <div class="band-grid" id="band-grid" :class="{ 'is-asking': ui.ageStepOpen }">
        <div class="band-intro">
          <p class="label">This week</p>
          <h1 class="h1" id="week-heading" tabindex="-1" ref="heading">{{ h1 }}</h1>
          <p class="lead" id="week-lead">{{ lead }}</p>
          <div class="age-row" id="age-row">
            <span class="label age-chip" :class="{ 'is-preview': !covered }" id="age-chip">{{ chip }}</span>
            <button class="btn-text" id="age-change" type="button" ref="changeBtn" :hidden="ui.ageStepOpen" @click="ui.openAge()">Change age</button>
          </div>
        </div>

        <div class="band-targets" id="targets" :hidden="u5">
          <div class="bib-stage">
            <div class="bib" :class="{ 'is-sample': sample }" id="bib" role="group" :aria-label="bibLabel">
              <span class="pin pin-tl"></span><span class="pin pin-tr"></span><span class="pin pin-bl"></span><span class="pin pin-br"></span>
              <div class="bib-sponsor label"><span id="bib-week">{{ bibWeek }}</span><span>Weekly 150</span></div>
              <p class="bib-name" id="bib-name" :hidden="!name">{{ name }}</p>
              <div class="bib-number-row"><span class="bib-number" id="bib-number" aria-hidden="true">{{ bibText }}</span></div>
              <div class="bib-meta label"><span>Active minutes</span><span id="bib-target">Target {{ target }}</span></div>
              <div class="bib-status"><span id="bib-status">{{ bibStatus }}</span><span class="tag tag-sample" id="bib-sample-tag" :hidden="!sample">Sample</span></div>
            </div>
          </div>

          <div class="lane-wrap" id="lane-wrap" role="meter" :aria-label="'Active minutes this week toward ' + target" aria-valuemin="0" :aria-valuemax="target" :aria-valuenow="Math.min(total, target)" :aria-valuetext="meterText">
            <div class="lane-top"><span class="lane-stretch" id="lane-stretch" :hidden="!stretchShown">{{ stretchShown ? 'Stretch ' + g.stretch + ': ' + total : '' }}</span><span class="lane-marker" id="lane-marker" :style="{ '--pct': String(markerPct) }">{{ marker }}</span></div>
            <div class="lane" :class="{ 'is-sample': sample }" id="lane">
              <div class="lane-scale" id="lane-scale">
                <span v-for="(t, i) in ticks" :key="i" class="tick" :class="{ 'tick-tall': t.tall }" :style="{ left: t.left }"></span>
                <div class="lane-fill"><span class="seg seg-mod" id="seg-mod" :style="{ width: modWidth }"></span><span class="seg seg-vig" id="seg-vig" :style="{ width: vigWidth }"></span></div>
                <div class="lane-finish"></div>
              </div>
              <span class="lane-over" id="lane-over" :hidden="!over">{{ over ? '+' + (total - target) : '' }}</span>
            </div>
            <div class="lane-labels" id="lane-labels"><span v-for="(l, i) in laneLabels" :key="i" :class="l.cls" :style="{ left: l.left + '%' }">{{ l.text }}</span></div>
          </div>
          <ul class="legend">
            <li><span class="sw sw-mod"></span><span id="legend-mod">Moderate {{ c.mod }} min</span></li>
            <li><span class="sw sw-vig"></span><span id="legend-vig">{{ legendVig }}</span></li>
            <li><span class="sw sw-light" id="legend-light-sw"></span><span id="legend-light">Light: {{ c.lightMin }} min this week (not counted)</span></li>
          </ul>
          <p class="next-step" id="next-step">{{ nextStep }}</p>
          <div class="strength" id="strength" :title="g.copy.muscleHelp">
            <div class="strength-row"><span><span id="strength-label">{{ g.muscleLabel }}</span>: <span id="strength-count">{{ strengthDays }} of {{ g.muscleDays }}</span></span><span class="boxes" id="strength-boxes" aria-hidden="true"><i v-for="(on, i) in boxes(g.muscleDays, strengthDays)" :key="i" :class="{ on: on }"></i></span></div>
            <div class="strength-row" id="vig-days" :hidden="!g.vigorousDays"><span>Vigorous days: <span id="vig-count">{{ vigDays }} of {{ g.vigorousDays }}</span></span><span class="boxes" id="vig-boxes" aria-hidden="true"><i v-for="(on, i) in boxes(g.vigorousDays, vigDays)" :key="i" :class="{ on: on }"></i></span></div>
            <p class="small strength-help" id="strength-help">{{ g.copy.muscleHelp }}</p>
            <p class="small strength-rule" id="strength-rule">Strength work counts toward muscle days, not minutes.</p>
          </div>
          <div class="balance" id="balance" :hidden="!(g.balanceDays > 0)">
            <div class="strength-row"><span>Balance days: <span id="balance-count">{{ balanceDays }} of {{ g.balanceDays }}</span></span><span class="boxes" id="balance-boxes" aria-hidden="true"><i v-for="(on, i) in boxes(g.balanceDays, balanceDays)" :key="i" :class="{ on: on }"></i></span></div>
            <p class="small strength-help" id="balance-help">{{ g.copy.balanceHelp }}</p>
          </div>
          <p class="small lastweek" id="lastweek" :hidden="!lastWeek">{{ lastWeek }}</p>
        </div>

        <div class="band-right">
          <AgeStep ref="ageStep" @done="onAgeDone" />
          <LogForm ref="logForm" v-model:status="logStatus" />
        </div>
      </div>
    </div>
  </section>
</template>
