<script setup>
/* A router link without RouterLink's own active state: vue-router ignores the hash, so every
   "/#section" link would read as the current page on the week page. `current` is set by the caller. */
defineOptions({ inheritAttrs: false });
defineProps({
  to: { type: String, required: true },
  current: { type: Boolean, default: false }
});
</script>

<template>
  <RouterLink :to="to" custom v-slot="{ href, navigate }">
    <a v-bind="$attrs" :href="href" :aria-current="current ? 'page' : null" @click="navigate"><slot /></a>
  </RouterLink>
</template>
