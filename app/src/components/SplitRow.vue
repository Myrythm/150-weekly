<script setup>
/* One results row (web/js/app.js splitRow). idPrefix '' is this week's table, 'hist-' the full log,
   which names the full date for screen readers. Details (GPX sessions only) is a link to the
   activity page; Remove is reported to the parent. The row sits inside a table body. */
import { computed } from 'vue';
import { WD, WD_LONG, MON, parseYmd, dayIndex } from '../core/dates.js';
import { credit, actLabel, isStrength, isLight, countsAsBalance } from '../core/rules.js';

const props = defineProps({
  session: { type: Object, required: true },
  guide: { type: Object, required: true },
  idPrefix: { type: String, default: '' },
  from: { type: String, default: 'week' }
});
const emit = defineEmits(['remove']);

const d = computed(function () { return parseYmd(props.session.date); });
const di = computed(function () { return dayIndex(d.value); });
const label = computed(function () { return actLabel(props.session); });
const muscle = computed(function () { return isStrength(props.session); });
const light = computed(function () { return isLight(props.session); });
const balance = computed(function () { return props.guide.balanceDays > 0 && countsAsBalance(props.session); });
const gpx = computed(function () { return props.session.source === 'gpx'; });
const when = computed(function () {
  const x = d.value;
  return props.idPrefix ? WD_LONG[di.value] + ' ' + x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear() : WD_LONG[di.value];
});
const day = computed(function () { return WD[di.value] + ' ' + d.value.getDate(); });
const effortClass = computed(function () {
  return props.session.intensity === 'vigorous' ? 'tag-vig' : light.value ? 'tag-neutral' : 'tag-mod';
});
const counts = computed(function () { return muscle.value ? 'Muscle day' : light.value ? 'Not counted' : String(credit(props.session, props.guide)); });
const countsClass = computed(function () { return muscle.value ? ' is-muscle' : light.value ? ' is-light' : ''; });
</script>

<template>
  <tr role="row" :data-id="session.id" :class="session.sample ? 'is-sample' : ''">
    <td class="c-day" role="cell">{{ day }}</td>
    <td class="c-act" role="cell">{{ label }}<template v-if="gpx">{{ ' ' }}<span class="tag tag-neutral" title="Imported from a GPX file">GPX</span></template><template v-if="session.sample">{{ ' ' }}<span class="tag tag-sample">Sample</span></template><template v-if="balance">{{ ' ' }}<span class="tag tag-neutral">Balance</span></template></td>
    <td class="c-min num" role="cell">{{ session.minutes }}</td>
    <td class="c-eff" role="cell">
      <template v-if="muscle"><span class="muted" aria-hidden="true">-</span><span class="sr-only">Not applicable</span></template>
      <span v-else class="tag" :class="effortClass">{{ session.intensity }}</span>
    </td>
    <td class="c-counts num" :class="countsClass" role="cell">{{ counts }}</td>
    <td class="c-rm" role="cell">
      <span class="c-btns">
        <RouterLink
          v-if="gpx"
          class="btn-text"
          :id="idPrefix + 'details-' + session.id"
          :to="{ name: 'activity', params: { id: session.id }, query: { from: from } }"
          :aria-label="'Details for ' + label + ', ' + when"
        >Details</RouterLink>
        <button
          class="btn-text"
          type="button"
          :id="idPrefix + 'remove-' + session.id"
          :aria-label="'Remove ' + label + ', ' + session.minutes + ' minutes, ' + when"
          @click="emit('remove', session.id)"
        >Remove</button>
      </span>
    </td>
  </tr>
</template>
