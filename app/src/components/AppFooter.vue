<script setup>
/* The week page footer (guideline line, storage line, disclaimer, and a slot for the Clear all
   controls that come with the week page) on `/`; the short footer of log.html and activity.html
   elsewhere. The guideline line follows the age like applyGuide in web/js/app.js. */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useDataStore } from '../stores/data.js';
import { hasTargets, GUIDE_NOTE } from '../core/guide.js';

const data = useDataStore();
const route = useRoute();

const isWeek = computed(function () { return route.name === 'week'; });
const guideText = computed(function () {
  return hasTargets(data.prefs.age) ? data.guide.copy.footer : GUIDE_NOTE.footer;
});
</script>

<template>
  <footer class="site-footer">
    <div class="wrap">
      <p v-if="isWeek"><span id="footer-guide">{{ guideText }}</span> <a href="https://www.who.int/publications/i/item/9789240015128" target="_blank" rel="noopener">Read the WHO guideline<span class="sr-only"> (opens in a new tab)</span></a></p>
      <p id="footer-storage">Your log is saved to your account. Only you can see it.</p>
      <p class="small muted">General information, not medical advice. If you have a heart condition or other health concern, check with a clinician before starting vigorous exercise.</p>
      <div v-if="isWeek && $slots.actions" class="footer-actions">
        <slot name="actions" />
      </div>
    </div>
  </footer>
</template>
