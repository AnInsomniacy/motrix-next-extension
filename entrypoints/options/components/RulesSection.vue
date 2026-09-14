<script lang="ts" setup>
/** Download rule settings section. */
import { computed } from 'vue';
import SettingsRow from './SettingsRow.vue';
import { NDynamicTags, NInputNumber, NSelect, NSwitch, NCollapseTransition } from 'naive-ui';
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
  addRule: (rule: Omit<SiteRule, 'id'>) => Promise<boolean>;
}>();

const emit = defineEmits<{
  'update:duplicateGuard': [value: Partial<DuplicateDownloadGuardSettings>];
  'update:minimumFileSize': [value: Partial<MinimumFileSizeSettings>];
  'update:fileExtensionRule': [value: Partial<FileExtensionRuleSettings>];
  removeSiteRule: [id: string];
}>();

const { t: i18n } = useI18n();

const unknownSizeOptions = computed(() => [
  {
    label: i18n('options_min_size_unknown_intercept', 'Send to Rayburst'),
    value: 'intercept',
  },
  {
    label: i18n('options_min_size_unknown_skip', 'Use browser'),
    value: 'skip',
  },
]);

const extensionActionOptions = computed(() => [
  {
    label: i18n('options_file_extension_action_intercept', 'Send to Rayburst'),
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
        <SettingsRow
          compact
          :label="i18n('options_duplicate_guard_label', 'Duplicate Download Guard')"
        >
          <NSwitch
            :aria-label="i18n('options_duplicate_guard_label', 'Duplicate Download Guard')"
            :value="duplicateGuard.enabled"
            @update:value="emit('update:duplicateGuard', { enabled: $event })"
          />
        </SettingsRow>

        <NCollapseTransition :show="duplicateGuard.enabled"
          ><div class="settings-subpanel" :inert="!duplicateGuard.enabled">
            <SettingsRow :label="i18n('options_duplicate_guard_window_label', 'Guard Window')">
              <NInputNumber
                :aria-label="i18n('options_duplicate_guard_window_label', 'Guard Window')"
                :value="duplicateGuard.windowSeconds"
                :min="1"
                :max="300"
                :step="1"
                class="setting-number"
                @update:value="
                  (v: number | null) => emit('update:duplicateGuard', { windowSeconds: v ?? 10 })
                "
              >
                <template #suffix>{{ i18n('options_seconds_suffix', 's') }}</template>
              </NInputNumber>
            </SettingsRow>
          </div>
        </NCollapseTransition>
      </div>

      <div class="rule-block">
        <SettingsRow
          compact
          :label="i18n('options_file_extension_rule_label', 'File Extension Rule')"
        >
          <NSwitch
            :aria-label="i18n('options_file_extension_rule_label', 'File Extension Rule')"
            :value="fileExtensionRule.enabled"
            @update:value="emit('update:fileExtensionRule', { enabled: $event })"
          />
        </SettingsRow>

        <NCollapseTransition :show="fileExtensionRule.enabled"
          ><div class="settings-subpanel" :inert="!fileExtensionRule.enabled">
            <SettingsRow :label="i18n('options_file_extension_list_label', 'Extensions')">
              <NDynamicTags
                :value="fileExtensionRule.extensions"
                :input-props="{
                  placeholder: i18n('options_file_extension_list_placeholder', 'Add extension'),
                }"
                class="setting-tags"
                @update:value="
                  (value: string[]) =>
                    emit('update:fileExtensionRule', {
                      extensions: normalizeFileExtensionList(value),
                    })
                "
              />
            </SettingsRow>

            <SettingsRow
              :label="i18n('options_file_extension_listed_action_label', 'Listed extensions')"
            >
              <NSelect
                :aria-label="
                  i18n('options_file_extension_listed_action_label', 'Listed extensions')
                "
                :value="fileExtensionRule.listedAction"
                :options="extensionActionOptions"
                class="setting-control"
                @update:value="
                  (value: FileExtensionRuleAction) =>
                    emit('update:fileExtensionRule', { listedAction: value })
                "
              />
            </SettingsRow>

            <SettingsRow
              :label="i18n('options_file_extension_unknown_action_label', 'Unknown extension')"
            >
              <NSelect
                :aria-label="
                  i18n('options_file_extension_unknown_action_label', 'Unknown extension')
                "
                :value="fileExtensionRule.unknownAction"
                :options="extensionActionOptions"
                class="setting-control"
                @update:value="
                  (value: FileExtensionRuleAction) =>
                    emit('update:fileExtensionRule', { unknownAction: value })
                "
              />
            </SettingsRow>
          </div>
        </NCollapseTransition>
      </div>

      <div class="rule-block">
        <SettingsRow compact :label="i18n('options_min_size_label', 'Small File Filter')">
          <NSwitch
            :aria-label="i18n('options_min_size_label', 'Small File Filter')"
            :value="minimumFileSize.enabled"
            @update:value="emit('update:minimumFileSize', { enabled: $event })"
          />
        </SettingsRow>

        <NCollapseTransition :show="minimumFileSize.enabled"
          ><div class="settings-subpanel" :inert="!minimumFileSize.enabled">
            <SettingsRow :label="i18n('options_min_size_value_label', 'File smaller than')">
              <NInputNumber
                :aria-label="i18n('options_min_size_value_label', 'File smaller than')"
                :value="minimumFileSize.sizeMb"
                :min="0"
                :step="1"
                class="setting-number"
                @update:value="
                  (v: number | null) => emit('update:minimumFileSize', { sizeMb: v ?? 0 })
                "
              >
                <template #suffix>MB</template>
              </NInputNumber>
            </SettingsRow>

            <SettingsRow :label="i18n('options_min_size_unknown_label', 'When size is unknown')">
              <NSelect
                :aria-label="i18n('options_min_size_unknown_label', 'When size is unknown')"
                :value="minimumFileSize.unknownSizeAction"
                :options="unknownSizeOptions"
                class="setting-control"
                @update:value="
                  (value: 'intercept' | 'skip') =>
                    emit('update:minimumFileSize', { unknownSizeAction: value })
                "
              />
            </SettingsRow>
          </div>
        </NCollapseTransition>
      </div>
    </section>

    <section class="settings-group">
      <h2 class="settings-group-title">
        {{ i18n('options_site_rules_label', 'Site Rules') }}
      </h2>
      <SiteRulesSection
        :rules="siteRules"
        :add-rule="addRule"
        @remove="emit('removeSiteRule', $event)"
      />
    </section>
  </div>
</template>
