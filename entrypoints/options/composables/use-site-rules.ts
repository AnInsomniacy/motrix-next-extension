/**
 * @fileoverview Composable for site rules CRUD with immediate persistence.
 *
 * Encapsulates rule state, add/remove operations, and storage persistence.
 * Rules are immediately persisted on every mutation (no dirty tracking needed).
 * Accepts a StorageService for DI-friendly persistence.
 */
import { ref } from 'vue';
import type { StorageService } from '@/modules/storage';
import type { SiteRule } from '@/shared/types';

export function useSiteRules(storageService: StorageService) {
  const siteRules = ref<SiteRule[]>([]);

  function hydrate(rules: SiteRule[]): void {
    siteRules.value = rules;
  }

  function persistSiteRules(): void {
    void storageService.saveSiteRules(siteRules.value);
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
