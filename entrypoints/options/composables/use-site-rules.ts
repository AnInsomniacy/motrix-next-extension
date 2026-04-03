/**
 * @fileoverview Composable for site rules CRUD with immediate persistence.
 *
 * Encapsulates rule state, add/remove operations, and storage persistence.
 * Rules are immediately persisted on every mutation (no dirty tracking needed).
 */
import { ref } from 'vue';
import type { SiteRule } from '@/shared/types';

export function useSiteRules() {
  const siteRules = ref<SiteRule[]>([]);

  function hydrate(rules: SiteRule[]): void {
    siteRules.value = rules;
  }

  function persistSiteRules(): void {
    void chrome.storage.local.set({ siteRules: siteRules.value });
  }

  function addRule(rule: Omit<SiteRule, 'id'>): void {
    siteRules.value.push({
      id: `rule-${Date.now()}`,
      pattern: rule.pattern,
      action: rule.action,
    });
    persistSiteRules();
  }

  function removeRule(id: string): void {
    siteRules.value = siteRules.value.filter((r) => r.id !== id);
    persistSiteRules();
  }

  return { siteRules, hydrate, addRule, removeRule };
}
