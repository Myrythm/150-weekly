<script setup>
/* The evidence list (web/index.html #evidence; renderFacts). A row shows only when its stat, claim
   and url are all filled. The first fact takes the age group's own wording (children and 65 and
   over); under 5 and an unset age show the adult one. */
import { computed } from 'vue';
import { useDataStore } from '../stores/data.js';
import { FACTS } from '../core/facts.js';
import { GUIDE, hasTargets } from '../core/guide.js';

const data = useDataStore();

const facts = computed(function () {
  const g = hasTargets(data.prefs.age) ? data.guide : GUIDE.adult;
  return FACTS.map(function (f0) {
    return (f0.id === 'FACT_1' && g.copy.fact) ? Object.assign({}, f0, g.copy.fact) : f0;
  }).filter(function (f) { return f.stat && f.claim && f.url; }).map(function (f) {
    return { key: 'fact-' + f.id.toLowerCase().replace('_', '-'), stat: f.stat, claim: f.claim, url: f.url, label: f.sourceLabel || f.url };
  });
});
</script>

<template>
  <section class="section" id="evidence" aria-labelledby="evidence-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="label">The evidence</p>
        <h2 class="h2" id="evidence-heading">Why bother, briefly.</h2>
      </div>
      <p class="section-intro">You already know exercise is good for you. Here is how little it takes to matter.</p>
      <ul class="facts" id="facts">
        <li v-for="f in facts" :key="f.key" class="fact" :id="f.key">
          <p class="fact-stat">{{ f.stat }}</p>
          <p class="fact-claim">{{ f.claim }}</p>
          <p class="small fact-source">Source: <a :href="f.url" target="_blank" rel="noopener">{{ f.label }}</a><span class="sr-only"> (opens in a new tab)</span></p>
        </li>
      </ul>
    </div>
  </section>
</template>
