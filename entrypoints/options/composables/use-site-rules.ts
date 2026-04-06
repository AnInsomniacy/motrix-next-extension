/**
 * @fileoverview Composable for site rules CRUD with immediate persistence.
 *
 * Encapsulates rule state, add/remove operations, and storage persistence.
 * Rules are immediately persisted on every mutation (no dirty tracking needed).
 * Accepts a StorageService for DI-friendly persistence.
 *
 * NOTE: `toRaw()` is required before passing reactive arrays to
 * `chrome.storage.local.set()`. Chrome's structured clone algorithm
 * serializes Vue Proxy arrays as plain objects with numeric keys
 * (`{"0": {...}}`) instead of proper arrays (`[{...}]`).
 */
import { ref, toRaw } from 'vue';
import type { StorageService } from '@/lib/storage';
import type { SiteRule } from '@/shared/types';

export function useSiteRules(storageService: StorageService) {
  const siteRules = ref<SiteRule[]>([]);

  function hydrate(rules: SiteRule[]): void {
    siteRules.value = rules;
  }

  function persistSiteRules(): void {
    // toRaw strips Vue's reactive Proxy so chrome.storage sees a real array
    const plain = toRaw(siteRules.value).map((r) => ({ ...toRaw(r) }));
    void storageService.saveSiteRules(plain);
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

