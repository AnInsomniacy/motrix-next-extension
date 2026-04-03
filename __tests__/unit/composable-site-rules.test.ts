import { describe, it, expect, vi } from 'vitest';
import { useSiteRules } from '@/entrypoints/options/composables/use-site-rules';
import type { StorageService } from '@/modules/storage/storage-service';

// ─── Mock StorageService ────────────────────────────────

function mockStorageService(): StorageService {
  return {
    load: vi.fn(),
    saveRpcConfig: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    saveSiteRules: vi.fn().mockResolvedValue(undefined),
    saveUiPrefs: vi.fn().mockResolvedValue(undefined),
    saveDiagnosticLog: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
}

// ─── Tests ──────────────────────────────────────────────

describe('useSiteRules', () => {
  it('starts with an empty rules array', () => {
    const storage = mockStorageService();
    const { siteRules } = useSiteRules(storage);
    expect(siteRules.value).toEqual([]);
  });

  it('hydrate() replaces the rules array', () => {
    const storage = mockStorageService();
    const { siteRules, hydrate } = useSiteRules(storage);

    hydrate([
      { id: 'r1', pattern: '*.example.com', action: 'always-intercept' },
    ]);

    expect(siteRules.value).toHaveLength(1);
    expect(siteRules.value[0]!.pattern).toBe('*.example.com');
  });

  it('addRule() appends a rule with generated id and persists via StorageService', () => {
    const storage = mockStorageService();
    const { siteRules, addRule } = useSiteRules(storage);

    addRule({ pattern: '*.test.com', action: 'always-skip' });

    expect(siteRules.value).toHaveLength(1);
    expect(siteRules.value[0]!.pattern).toBe('*.test.com');
    expect(siteRules.value[0]!.action).toBe('always-skip');
    expect(siteRules.value[0]!.id).toMatch(/^rule-\d+$/);
    expect(storage.saveSiteRules).toHaveBeenCalledWith(siteRules.value);
  });

  it('removeRule() filters out the rule by id and persists', () => {
    const storage = mockStorageService();
    const { siteRules, hydrate, removeRule } = useSiteRules(storage);

    hydrate([
      { id: 'r1', pattern: 'a.com', action: 'always-intercept' },
      { id: 'r2', pattern: 'b.com', action: 'always-skip' },
    ]);

    removeRule('r1');

    expect(siteRules.value).toHaveLength(1);
    expect(siteRules.value[0]!.id).toBe('r2');
    expect(storage.saveSiteRules).toHaveBeenCalled();
  });

  it('removeRule() with non-existent id is a no-op (still persists for consistency)', () => {
    const storage = mockStorageService();
    const { siteRules, hydrate, removeRule } = useSiteRules(storage);

    hydrate([{ id: 'r1', pattern: 'a.com', action: 'always-intercept' }]);

    removeRule('nonexistent');

    expect(siteRules.value).toHaveLength(1);
  });
});
