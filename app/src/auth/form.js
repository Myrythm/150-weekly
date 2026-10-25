/*
 * Small helpers shared by the auth screens: field errors (the `<id>-err` paragraphs and
 * aria-invalid), focus by element id, and the ?next= query that every auth screen passes on.
 */
import { reactive, nextTick } from 'vue';

export function focusId(id) {
  if (!id) return;
  nextTick(function () {
    const el = document.getElementById(id);
    if (el) el.focus();
  });
}

/* on mount: focus what the store asked for (false: nothing), else the screen title */
export function focusOnEnter(auth, titleId) {
  const f = auth.takeFocus();
  if (f === false) return;
  focusId(f || titleId);
}

export function useFieldErrors(ids) {
  const errs = reactive({});
  ids.forEach(function (id) { errs[id] = ''; });
  function setErr(id, text) { errs[id] = text || ''; }
  function clearErrs(list) { (list || ids).forEach(function (id) { errs[id] = ''; }); }
  return { errs: errs, setErr: setErr, clearErrs: clearErrs };
}

export function keepNext(route) {
  const next = route && route.query ? route.query.next : undefined;
  return typeof next === 'string' && next ? { next: next } : {};
}
