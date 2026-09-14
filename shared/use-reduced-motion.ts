import { onScopeDispose, ref } from 'vue';

/** Follow the browser's native accessibility preference. */
export function useReducedMotion() {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = ref(query.matches);
  const update = (event: MediaQueryListEvent) => {
    reduced.value = event.matches;
  };
  query.addEventListener('change', update);
  onScopeDispose(() => query.removeEventListener('change', update));
  return reduced;
}
