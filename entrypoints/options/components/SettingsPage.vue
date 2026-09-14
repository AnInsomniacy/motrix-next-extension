<script setup lang="ts">
import { ref, watch } from 'vue';
import { NForm } from 'naive-ui';

const props = defineProps<{
  id: string;
  title: string;
  active: boolean;
  disabled: boolean;
  wide?: boolean;
}>();
const visited = ref(props.active);
watch(
  () => props.active,
  (active) => {
    if (active) visited.value = true;
  },
);
</script>

<template>
  <Transition name="settings-page">
    <section
      v-if="visited"
      v-show="active"
      class="options-page"
      :inert="!active"
      :aria-labelledby="`${id}-title`"
    >
      <div class="options-content" :class="{ 'options-content--wide': wide }">
        <h1 :id="`${id}-title`" class="section-title">{{ title }}</h1>
        <NForm :disabled="disabled" :show-feedback="false" label-placement="top" @submit.prevent>
          <fieldset :disabled="disabled" class="settings-fieldset"><slot /></fieldset>
        </NForm>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.options-page {
  grid-area: 1 / 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.options-content {
  width: 100%;
  max-width: 784px;
  padding: 32px 40px 40px;
  container-type: inline-size;
}
.options-content--wide {
  max-width: 1040px;
}
.settings-fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.settings-page-enter-active,
.settings-page-leave-active {
  transition: opacity 160ms ease;
}
.settings-page-enter-from,
.settings-page-leave-to {
  opacity: 0;
}
.settings-page-leave-active {
  pointer-events: none;
}
@media (max-width: 640px) {
  .options-content {
    padding: 24px 20px;
  }
}
</style>
