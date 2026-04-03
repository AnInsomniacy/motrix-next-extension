import { describe, it, expect, vi } from 'vitest';
import { useAppearance } from '@/entrypoints/options/composables/use-appearance';
import type { StorageService } from '@/lib/storage/storage-service';

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

describe('useAppearance', () => {
  it('starts with default theme and color scheme', () => {
    const storage = mockStorageService();
    const setTheme = vi.fn();
    const setColorSchemeId = vi.fn();

    const { uiTheme, uiColorScheme } = useAppearance(storage, setTheme, setColorSchemeId);

    expect(uiTheme.value).toBe('system');
    expect(uiColorScheme.value).toBe('amber');
  });

  it('hydrate() updates theme and color scheme, calls setTheme and setColorSchemeId', () => {
    const storage = mockStorageService();
    const setTheme = vi.fn();
    const setColorSchemeId = vi.fn();

    const { uiTheme, uiColorScheme, hydrate } = useAppearance(storage, setTheme, setColorSchemeId);

    hydrate({ theme: 'dark', colorScheme: 'ocean-blue' });

    expect(uiTheme.value).toBe('dark');
    expect(uiColorScheme.value).toBe('ocean-blue');
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(setColorSchemeId).toHaveBeenCalledWith('ocean-blue');
  });

  it('handleThemeChange() updates theme, calls setTheme, and persists via StorageService', () => {
    const storage = mockStorageService();
    const setTheme = vi.fn();
    const setColorSchemeId = vi.fn();

    // Mock window.matchMedia for applyTheme()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({ matches: false })),
    });

    const { handleThemeChange } = useAppearance(storage, setTheme, setColorSchemeId);

    handleThemeChange('dark');

    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(storage.saveUiPrefs).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('handleColorSchemeChange() updates color scheme and persists via StorageService', () => {
    const storage = mockStorageService();
    const setTheme = vi.fn();
    const setColorSchemeId = vi.fn();

    const { handleColorSchemeChange } = useAppearance(storage, setTheme, setColorSchemeId);

    handleColorSchemeChange('midnight-purple');

    expect(setColorSchemeId).toHaveBeenCalledWith('midnight-purple');
    expect(storage.saveUiPrefs).toHaveBeenCalledWith(
      expect.objectContaining({ colorScheme: 'midnight-purple' }),
    );
  });
});
