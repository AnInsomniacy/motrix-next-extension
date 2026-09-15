import { onMounted, onScopeDispose, ref, type Ref } from 'vue';

/** Reactive content-box width and height of an element. */
export function useElementSize(target: Ref<HTMLElement | null>) {
  const width = ref(0);
  const height = ref(0);
  let observer: ResizeObserver | undefined;
  onMounted(() => {
    if (!target.value) return;
    width.value = target.value.clientWidth;
    height.value = target.value.clientHeight;
    observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width.value = entry.contentRect.width;
      height.value = entry.contentRect.height;
    });
    observer.observe(target.value);
  });
  onScopeDispose(() => observer?.disconnect());
  return { width, height };
}
