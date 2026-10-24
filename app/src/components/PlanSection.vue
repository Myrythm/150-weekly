<script setup>
/* The habit builder (web/index.html #plan; planSessionToday, renderPlan, showPlanError,
   onPlanSubmit, resetBuilder, buildPlanChips, planDidToday, planUndoToday and the plan handlers of
   wireWeek). Left: the three blanks with suggestion chips and the minutes. Right: the plan card
   with the last 7 days, "Did it today" (logs a habit session), Undo, Edit and a delete question.
   Clear all (data.clearSeq) empties the builder, as the reference's clearAllData does. */
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { useDataStore } from '../stores/data.js';
import { useUiStore } from '../stores/ui.js';
import { WD, addDays, dayIndex, ymd, plural } from '../core/dates.js';

const PLAN_CHIPS = {
  after: ['pour my morning coffee', 'park the car', 'close my laptop', 'brush my teeth'],
  will: ['do 10 squats', 'walk around the block', 'climb the stairs twice', 'hold a 30 second plank'],
  where: ['the kitchen counter', 'my front door', 'my desk', 'the bottom of the stairs']
};
const FIELDS = ['after', 'will', 'where'];

const data = useDataStore();
const ui = useUiStore();

const form = reactive({ after: '', will: '', where: '', minutes: '2' });
const invalid = reactive({ after: false, will: false, where: false, minutes: false });
const error = ref('');
const status = ref('');
const confirming = ref(false);
const els = { after: ref(null), will: ref(null), where: ref(null), minutes: ref(null) };
const saveBtn = ref(null);
const doneBtn = ref(null);
const undoBtn = ref(null);
const delBtn = ref(null);
const delNo = ref(null);

const plan = computed(function () { return data.plan; });

/* the plan session logged today, if any */
const todaySession = computed(function () {
  const ts = ymd(data.today);
  return data.sessions.find(function (s) { return s.source === 'plan' && s.date === ts; }) || null;
});

/* the last 7 days, oldest first; a day is on when a plan session sits on it */
const week = computed(function () {
  const planDates = {};
  data.sessions.forEach(function (s) { if (s.source === 'plan') planDates[s.date] = true; });
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(data.today, -i), ds = ymd(d);
    out.push({ ds: ds, on: !!planDates[ds], today: i === 0, letter: WD[dayIndex(d)].charAt(0) });
  }
  return out;
});
const doneCount = computed(function () { return week.value.filter(function (d) { return d.on; }).length; });

function focusEl(r, opts) { if (r.value) r.value.focus(opts); }

function resetBuilder() {
  form.after = ''; form.will = ''; form.where = ''; form.minutes = '2';
  FIELDS.concat('minutes').forEach(function (k) { invalid[k] = false; });
  error.value = '';
}

function onChip(key, text) {
  form[key] = text;
  invalid[key] = false;
  error.value = '';
  const next = FIELDS.find(function (k) { return !form[k].trim(); });
  if (next) focusEl(els[next]); else focusEl(saveBtn);
}

function onSubmit() {
  const after = form.after.trim().slice(0, 60), will = form.will.trim().slice(0, 60), where = form.where.trim().slice(0, 60);
  /* the raw text of the field (a number v-model would turn 1e2 into 100) */
  const raw = (els.minutes.value ? els.minutes.value.value : String(form.minutes)).trim(), mins = Number(raw);
  FIELDS.concat('minutes').forEach(function (k) { invalid[k] = false; });
  status.value = '';
  if (!after || !will || !where) {
    error.value = 'Fill in all three blanks to save your plan.';
    invalid.after = !after; invalid.will = !will; invalid.where = !where;
    focusEl(!after ? els.after : !will ? els.will : els.where);
    return;
  }
  if (!/^\d+$/.test(raw) || mins < 1 || mins > 30) {
    error.value = 'Enter minutes from 1 to 30.';
    invalid.minutes = true;
    focusEl(els.minutes);
    return;
  }
  error.value = '';
  data.savePlan({ after: after, will: will, where: where, minutes: mins });
  resetBuilder();
  status.value = 'Plan saved.';
  ui.announce('Plan saved.');
}

function onClear() {
  resetBuilder();
  status.value = '';
  focusEl(els.after);
}

function onEdit() {
  if (!plan.value) return;
  form.after = plan.value.after; form.will = plan.value.will; form.where = plan.value.where; form.minutes = String(plan.value.minutes);
  error.value = '';
  focusEl(els.after);
}

async function onDone() {
  if (!plan.value || todaySession.value) return;
  /* logging a sample plan makes it the user's own: addSession would otherwise clear it with the sample */
  if (plan.value.sample) plan.value.sample = false;
  data.addSession({ type: 'habit', minutes: plan.value.minutes, intensity: 'moderate', source: 'plan', note: plan.value.will });
  await nextTick();
  focusEl(undoBtn);
}

async function onUndo() {
  const s = todaySession.value;
  if (!s) return;
  data.removeSession(s.id);
  await nextTick();
  focusEl(doneBtn);
}

async function askDelete() { confirming.value = true; await nextTick(); focusEl(delNo); }
async function keepPlan() { confirming.value = false; await nextTick(); focusEl(delBtn); }
async function deletePlan() {
  data.deletePlan();
  confirming.value = false;
  await nextTick();
  focusEl(els.after, { preventScroll: true });
}

watch(function () { return data.clearSeq; }, function () {
  resetBuilder();
  status.value = '';
  confirming.value = false;
});
</script>

<template>
  <section class="section" id="plan" aria-labelledby="plan-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="label">Start small</p>
        <h2 class="h2" id="plan-heading">Pick a trigger you already have.</h2>
      </div>
      <p class="section-intro">Tie a tiny bit of movement to something you do every day anyway. Make it so small you could do it on your worst day. You can always do more.</p>
      <div class="plan-layout">
        <form id="plan-form" novalidate @submit.prevent="onSubmit">
          <div class="builder">
            <div class="pf">
              <span class="sword" aria-hidden="true">After I</span>
              <label class="label pf-label" for="plan-after">After I</label>
              <input class="input" id="plan-after" name="after" type="text" maxlength="60" placeholder="pour my morning coffee" autocomplete="off" :ref="els.after" v-model="form.after" :aria-invalid="invalid.after ? 'true' : null">
              <span class="sword" aria-hidden="true">,</span>
            </div>
            <div class="chips-wrap" role="group" aria-label="After I suggestions">
              <span class="label" aria-hidden="true">After I</span>
              <div class="chips" id="plan-chips-after">
                <button v-for="(t, i) in PLAN_CHIPS.after" :key="t" class="chip" type="button" :id="'plan-chip-after-' + i" @click="onChip('after', t)">{{ t }}</button>
              </div>
            </div>
            <div class="pf">
              <span class="sword" aria-hidden="true">I will</span>
              <label class="label pf-label" for="plan-will">I will</label>
              <input class="input" id="plan-will" name="will" type="text" maxlength="60" placeholder="do 10 squats" autocomplete="off" :ref="els.will" v-model="form.will" :aria-invalid="invalid.will ? 'true' : null">
            </div>
            <div class="chips-wrap" role="group" aria-label="I will suggestions">
              <span class="label" aria-hidden="true">I will</span>
              <div class="chips" id="plan-chips-will">
                <button v-for="(t, i) in PLAN_CHIPS.will" :key="t" class="chip" type="button" :id="'plan-chip-will-' + i" @click="onChip('will', t)">{{ t }}</button>
              </div>
            </div>
            <div class="pf">
              <span class="sword" aria-hidden="true">at</span>
              <label class="label pf-label" for="plan-where">At</label>
              <input class="input" id="plan-where" name="where" type="text" maxlength="60" placeholder="the kitchen counter" autocomplete="off" :ref="els.where" v-model="form.where" :aria-invalid="invalid.where ? 'true' : null">
              <span class="sword" aria-hidden="true">.</span>
            </div>
            <div class="chips-wrap" role="group" aria-label="At suggestions">
              <span class="label" aria-hidden="true">At</span>
              <div class="chips" id="plan-chips-where">
                <button v-for="(t, i) in PLAN_CHIPS.where" :key="t" class="chip" type="button" :id="'plan-chip-where-' + i" @click="onChip('where', t)">{{ t }}</button>
              </div>
            </div>
            <div class="builder-more">
              <div class="field" style="max-width:260px">
                <label class="label" for="plan-minutes">It takes about</label>
                <div class="minutes-row">
                  <input class="input" id="plan-minutes" name="minutes" type="number" inputmode="numeric" min="1" max="30" step="1" :ref="els.minutes" :value="form.minutes" :aria-invalid="invalid.minutes ? 'true' : null" @input="form.minutes = $event.target.value">
                  <span>minutes</span>
                </div>
              </div>
              <p class="error" id="plan-error" role="alert" :hidden="!error">{{ error }}</p>
              <div class="builder-actions">
                <button class="btn btn-accent" id="plan-save" type="submit" ref="saveBtn">Save my plan</button>
                <button class="btn-text" id="plan-clear" type="button" @click="onClear">Clear</button>
              </div>
              <p class="status" id="plan-status" role="status" aria-live="polite">{{ status }}</p>
            </div>
          </div>
        </form>

        <div class="plan-card" id="plan-card" :class="{ 'is-sample': !!(plan && plan.sample) }">
          <span class="pin pin-tl"></span><span class="pin pin-tr"></span><span class="pin pin-bl"></span><span class="pin pin-br"></span>
          <div id="plan-empty" class="plan-empty" :hidden="!!plan"><p>No plan yet. Fill in the three blanks and save it here.</p></div>
          <div id="plan-filled" :hidden="!plan">
            <template v-if="plan">
              <p class="label" id="plan-card-label">{{ plan.sample ? 'Sample plan' : 'My plan' }}</p>
              <p class="plan-sentence" id="plan-sentence">After I {{ plan.after }}, I will {{ plan.will }} at {{ plan.where }}.</p>
              <p class="small muted" id="plan-takes">About {{ plan.minutes }} {{ plural(plan.minutes, 'minute', 'minutes') }}.</p>
              <div class="plan-days" id="plan-days" aria-hidden="true">
                <span v-for="d in week" :key="d.ds" class="plan-day" :class="{ on: d.on, today: d.today }"><i></i><span>{{ d.letter }}</span></span>
              </div>
              <p class="small plan-caption" id="plan-caption">Done {{ doneCount }} of the last 7 days</p>
            </template>
            <div class="plan-actions">
              <button class="btn btn-accent" id="plan-done" type="button" ref="doneBtn" :hidden="!!todaySession" @click="onDone">Did it today</button>
              <p class="plan-done-msg" id="plan-done-msg" :hidden="!todaySession"><span>Done today. See you tomorrow.</span><button class="btn-text" id="plan-undo" type="button" ref="undoBtn" @click="onUndo">Undo</button></p>
            </div>
            <div class="plan-links">
              <button class="btn-text" id="plan-edit" type="button" @click="onEdit">Edit plan</button>
              <button class="btn-text" id="plan-delete" type="button" ref="delBtn" @click="askDelete">Delete plan</button>
            </div>
            <div class="confirm" id="plan-del-confirm" role="group" aria-label="Confirm delete" :hidden="!confirming">
              <p>Delete this plan? Your logged sessions stay.</p>
              <div class="row">
                <button class="btn btn-accent btn-small" id="plan-del-yes" type="button" @click="deletePlan">Delete</button>
                <button class="btn btn-outline btn-small" id="plan-del-no" type="button" ref="delNo" @click="keepPlan">Keep it</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
