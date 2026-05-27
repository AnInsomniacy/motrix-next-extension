<script lang="ts" setup>
/**
 * @fileoverview Download rule settings section.
 *
 * Groups rule-like decisions that change whether downloads are routed,
 * skipped, or treated as duplicates.
 */
import { computed } from 'vue';
import { NFormItem, NInputNumber, NSelect, NSwitch } from 'naive-ui';
import { motion } from 'motion-v';
import type {
  DuplicateDownloadGuardSettings,
  MinimumFileSizeSettings,
  SiteRule,
} from '@/shared/types';
import { useI18n } from '@/shared/i18n/engine';
import SiteRulesSection from './SiteRulesSection.vue';

defineProps<{
  duplicateGuard: DuplicateDownloadGuardSettings;
  minimumFileSize: MinimumFileSizeSettings;
  siteRules: SiteRule[];
}>();

const emit = defineEmits<{
  'update:duplicateGuard': [value: Partial<DuplicateDownloadGuardSettings>];
  'update:minimumFileSize': [value: Partial<MinimumFileSizeSettings>];
  addSiteRule: [rule: Omit<SiteRule, 'id'>];
  removeSiteRule: [id: string];
}>();

const { t: i18n } = useI18n();

const unknownSizeOptions = computed(() => [
  {
    label: i18n('options_min_size_unknown_intercept', 'Send to Motrix Next'),
    value: 'intercept',
  },
  {
    label: i18n('options_min_size_unknown_skip', 'Use browser'),
    value: 'skip',
  },
]);
</script>

<template>
  <div class="settings-section">
    <section class="settings-group">
      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_duplicate_guard_label', 'Duplicate Download Guard')"
      >
        <NSwitch
          :value="duplicateGuard.enabled"
          @update:value="emit('update:duplicateGuard', { enabled: $event })"
        />
      </NFormItem>

      <motion.div
        class="settings-panel-motion"
        :initial="false"
        :animate="
          duplicateGuard.enabled ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }
        "
        :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
      >
        <div class="settings-subpanel">
          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_duplicate_guard_window_label', 'Guard Window')"
          >
            <NInputNumber
              :value="duplicateGuard.windowSeconds"
              :min="1"
              :max="300"
              :step="1"
              style="width: 132px"
              @update:value="
                (v: number | null) => emit('update:duplicateGuard', { windowSeconds: v ?? 10 })
              "
            >
              <template #suffix>s</template>
            </NInputNumber>
          </NFormItem>
        </div>
      </motion.div>
    </section>

    <section class="settings-group">
      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_min_size_label', 'Small File Filter')"
      >
        <NSwitch
          :value="minimumFileSize.enabled"
          @update:value="emit('update:minimumFileSize', { enabled: $event })"
        />
      </NFormItem>

      <motion.div
        class="settings-panel-motion"
        :initial="false"
        :animate="
          minimumFileSize.enabled ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }
        "
        :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
      >
        <div class="settings-subpanel">
          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_min_size_value_label', 'File smaller than')"
          >
            <NInputNumber
              :value="minimumFileSize.sizeMb"
              :min="0"
              :step="1"
              style="width: 132px"
              @update:value="
                (v: number | null) => emit('update:minimumFileSize', { sizeMb: v ?? 0 })
              "
            >
              <template #suffix>MB</template>
            </NInputNumber>
          </NFormItem>

          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_min_size_unknown_label', 'When size is unknown')"
          >
            <NSelect
              :value="minimumFileSize.unknownSizeAction"
              :options="unknownSizeOptions"
              style="width: 210px"
              @update:value="
                (value: 'intercept' | 'skip') =>
                  emit('update:minimumFileSize', { unknownSizeAction: value })
              "
            />
          </NFormItem>
        </div>
      </motion.div>
    </section>

    <section class="settings-group">
      <h3 class="settings-group-title">
        {{ i18n('options_site_rules_label', 'Site Rules') }}
      </h3>
      <SiteRulesSection
        :rules="siteRules"
        @add="emit('addSiteRule', $event)"
        @remove="emit('removeSiteRule', $event)"
      />
    </section>
  </div>
</template>
