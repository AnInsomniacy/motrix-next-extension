<script lang="ts" setup>
/** Download rule settings section. */
import { computed } from 'vue';
import { NDynamicTags, NFormItem, NInputNumber, NSelect, NSwitch } from 'naive-ui';
import CollapsePanel from '@/shared/components/CollapsePanel.vue';
import type {
  DuplicateDownloadGuardSettings,
  FileExtensionRuleAction,
  FileExtensionRuleSettings,
  MinimumFileSizeSettings,
  SiteRule,
} from '@/lib/schema';
import { useI18n } from '@/shared/i18n/engine';
import { normalizeFileExtensionList } from '@/lib/file-extensions';
import SiteRulesSection from './SiteRulesSection.vue';

defineProps<{
  duplicateGuard: DuplicateDownloadGuardSettings;
  minimumFileSize: MinimumFileSizeSettings;
  fileExtensionRule: FileExtensionRuleSettings;
  siteRules: SiteRule[];
}>();

const emit = defineEmits<{
  'update:duplicateGuard': [value: Partial<DuplicateDownloadGuardSettings>];
  'update:minimumFileSize': [value: Partial<MinimumFileSizeSettings>];
  'update:fileExtensionRule': [value: Partial<FileExtensionRuleSettings>];
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

const extensionActionOptions = computed(() => [
  {
    label: i18n('options_file_extension_action_intercept', 'Send to Motrix Next'),
    value: 'intercept',
  },
  {
    label: i18n('options_file_extension_action_skip', 'Use browser'),
    value: 'skip',
  },
]);
</script>

<template>
  <div class="settings-section">
    <section class="settings-group">
      <div class="rule-block">
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

        <CollapsePanel :open="duplicateGuard.enabled">
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
                <template #suffix>{{ i18n('options_seconds_suffix', 's') }}</template>
              </NInputNumber>
            </NFormItem>
          </div>
        </CollapsePanel>
      </div>

      <div class="rule-block">
        <NFormItem
          class="settings-row"
          :show-feedback="false"
          :label="i18n('options_file_extension_rule_label', 'File Extension Rule')"
        >
          <NSwitch
            :value="fileExtensionRule.enabled"
            @update:value="emit('update:fileExtensionRule', { enabled: $event })"
          />
        </NFormItem>

        <CollapsePanel :open="fileExtensionRule.enabled">
          <div class="settings-subpanel">
            <NFormItem
              class="settings-row settings-row--nested"
              :show-feedback="false"
              :label="i18n('options_file_extension_list_label', 'Extensions')"
            >
              <NDynamicTags
                :value="fileExtensionRule.extensions"
                :input-props="{
                  placeholder: i18n('options_file_extension_list_placeholder', 'Add extension'),
                }"
                style="max-width: 420px"
                @update:value="
                  (value: string[]) =>
                    emit('update:fileExtensionRule', {
                      extensions: normalizeFileExtensionList(value),
                    })
                "
              />
            </NFormItem>

            <NFormItem
              class="settings-row settings-row--nested"
              :show-feedback="false"
              :label="i18n('options_file_extension_listed_action_label', 'Listed extensions')"
            >
              <NSelect
                :value="fileExtensionRule.listedAction"
                :options="extensionActionOptions"
                style="width: 210px"
                @update:value="
                  (value: FileExtensionRuleAction) =>
                    emit('update:fileExtensionRule', { listedAction: value })
                "
              />
            </NFormItem>

            <NFormItem
              class="settings-row settings-row--nested"
              :show-feedback="false"
              :label="i18n('options_file_extension_unknown_action_label', 'Unknown extension')"
            >
              <NSelect
                :value="fileExtensionRule.unknownAction"
                :options="extensionActionOptions"
                style="width: 210px"
                @update:value="
                  (value: FileExtensionRuleAction) =>
                    emit('update:fileExtensionRule', { unknownAction: value })
                "
              />
            </NFormItem>
          </div>
        </CollapsePanel>
      </div>

      <div class="rule-block">
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

        <CollapsePanel :open="minimumFileSize.enabled">
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
        </CollapsePanel>
      </div>
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

<style scoped>
.rule-block + .rule-block {
  margin-top: 12px;
}
</style>
