/* The width of a box element, measured once it is mounted and again whenever it changes
   (ResizeObserver; environments without it, such as happy-dom, keep the first measure).
   The activity page draws its SVGs at the real box width so their text keeps its true size,
   as the reference does after layout and on resize (redrawDetailGraphics).

     const { width, mounted } = useBoxWidth(elRef)
       width     ref: 0 until mounted, then el.clientWidth
       mounted   ref: true once the box is in the DOM and measured (draw only then) */
import { ref, onMounted, onBeforeUnmount } from 'vue';

export function useBoxWidth(el) {
  const width = ref(0);
  const mounted = ref(false);
  let ro = null;
  function measure() {
    const w = el.value ? el.value.clientWidth : 0;
    if (w !== width.value) width.value = w;
  }
  onMounted(function () {
    measure();
    mounted.value = true;
    if (typeof ResizeObserver === 'function' && el.value) {
      ro = new ResizeObserver(measure);
      ro.observe(el.value);
    }
  });
  onBeforeUnmount(function () { if (ro) ro.disconnect(); ro = null; });
  return { width: width, mounted: mounted };
}
