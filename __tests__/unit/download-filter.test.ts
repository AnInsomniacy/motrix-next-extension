import { describe, it, expect } from 'vitest';
import {
  evaluateFilterPipeline,
  createFilterPipeline,
  EnabledStage,
  SelfTriggerStage,
  SchemeStage,
  FileSizeStage,
  SiteRuleStage,
} from '@/lib/download/filter';
import type { FilterContext, DownloadSettings, SiteRule } from '@/shared/types';

// ─── Fixtures ───────────────────────────────────────────

const DEFAULT_SETTINGS: DownloadSettings = {
  enabled: true,
  minFileSize: 0,
  fallbackToBrowser: true,
  hideDownloadBar: false,
  notifyOnStart: true,
  notifyOnComplete: false,
};

function createContext(overrides?: Partial<FilterContext>): FilterContext {
  return {
    url: 'https://example.com/file.zip',
    finalUrl: 'https://example.com/file.zip',
    filename: 'file.zip',
    fileSize: 10485760, // 10 MB
    mimeType: 'application/zip',
    tabUrl: 'https://example.com',
    ...overrides,
  };
}

// ─── Enabled Stage ──────────────────────────────────────

describe('EnabledStage', () => {
  const stage = new EnabledStage();

  it('returns skip when extension is disabled', () => {
    const result = stage.evaluate(createContext(), { ...DEFAULT_SETTINGS, enabled: false });
    expect(result).toBe('skip');
  });

  it('returns null (pass-through) when enabled', () => {
    const result = stage.evaluate(createContext(), DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });
});

// ─── Self-Trigger Stage ─────────────────────────────────

describe('SelfTriggerStage', () => {
  const stage = new SelfTriggerStage();

  it('returns skip when download was triggered by this extension', () => {
    const ctx = createContext({ byExtensionId: 'some-extension-id' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBe('skip');
  });

  it('returns null when no extension triggered the download', () => {
    const ctx = createContext({ byExtensionId: undefined });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });
});

// ─── Scheme Stage ───────────────────────────────────────

describe('SchemeStage', () => {
  const stage = new SchemeStage();

  it('returns null for http URLs', () => {
    const ctx = createContext({ url: 'http://example.com/file.zip' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns null for https URLs', () => {
    const ctx = createContext({ url: 'https://example.com/file.zip' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns null for ftp URLs', () => {
    const ctx = createContext({ url: 'ftp://example.com/file.zip' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns skip for blob URLs', () => {
    const ctx = createContext({ url: 'blob:https://example.com/abc' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns skip for data URLs', () => {
    const ctx = createContext({ url: 'data:application/octet-stream;base64,abc' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns skip for chrome-extension URLs', () => {
    const ctx = createContext({ url: 'chrome-extension://abc/file.zip' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });
});

// ─── File Size Stage ────────────────────────────────────

describe('FileSizeStage', () => {
  const stage = new FileSizeStage();

  it('returns null when minFileSize is 0 (no limit)', () => {
    const result = stage.evaluate(createContext({ fileSize: 100 }), DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });

  it('returns null when file size is unknown (-1)', () => {
    const settings = { ...DEFAULT_SETTINGS, minFileSize: 5 };
    const result = stage.evaluate(createContext({ fileSize: -1 }), settings);
    expect(result).toBeNull();
  });

  it('returns null when file exceeds minimum size', () => {
    const settings = { ...DEFAULT_SETTINGS, minFileSize: 5 }; // 5 MB
    const ctx = createContext({ fileSize: 10 * 1024 * 1024 }); // 10 MB
    expect(stage.evaluate(ctx, settings)).toBeNull();
  });

  it('returns skip when file is smaller than minimum size', () => {
    const settings = { ...DEFAULT_SETTINGS, minFileSize: 5 }; // 5 MB
    const ctx = createContext({ fileSize: 1 * 1024 * 1024 }); // 1 MB
    expect(stage.evaluate(ctx, settings)).toBe('skip');
  });

  it('returns null when file equals minimum size exactly', () => {
    const settings = { ...DEFAULT_SETTINGS, minFileSize: 5 };
    const ctx = createContext({ fileSize: 5 * 1024 * 1024 });
    expect(stage.evaluate(ctx, settings)).toBeNull();
  });
});

// ─── Site Rule Stage ────────────────────────────────────

describe('SiteRuleStage', () => {
  it('returns null when no rules match', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'other.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://example.com/page' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });

  it('returns intercept when matching rule says always-intercept', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-intercept' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://example.com/page' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBe('intercept');
  });

  it('returns skip when matching rule says always-skip', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://example.com/page' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBe('skip');
  });

  it('returns null when matching rule says use-global', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'use-global' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://example.com/page' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });

  it('matches subdomain patterns', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '*.github.com', action: 'always-intercept' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://objects.github.com/download' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBe('intercept');
  });

  it('does not match unrelated domains for wildcard pattern', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '*.github.com', action: 'always-intercept' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://example.com/page' });
    const result = stage.evaluate(ctx, DEFAULT_SETTINGS);
    expect(result).toBeNull();
  });

  it('implements FilterStage interface', () => {
    const stage = new SiteRuleStage(() => []);
    // Should conform to FilterStage — has name and evaluate(ctx, config)
    expect(stage.name).toBe('site-rule');
    expect(typeof stage.evaluate).toBe('function');
    expect(stage.evaluate.length).toBe(2); // Only 2 params now
  });
});

// ─── Full Pipeline ──────────────────────────────────────

describe('evaluateFilterPipeline', () => {
  it('returns intercept for a normal download with default settings', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(createContext(), DEFAULT_SETTINGS, stages);
    expect(result).toBe('intercept');
  });

  it('returns skip when disabled', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext(),
      { ...DEFAULT_SETTINGS, enabled: false },
      stages,
    );
    expect(result).toBe('skip');
  });

  it('returns skip for blob URL even when enabled', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({ url: 'blob:https://example.com/abc' }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result).toBe('skip');
  });

  it('returns skip when file is too small', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({ fileSize: 512 }), // 512 bytes
      { ...DEFAULT_SETTINGS, minFileSize: 1 }, // min 1 MB
      stages,
    );
    expect(result).toBe('skip');
  });

  it('returns skip when site rule says always-skip', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-skip' }];
    const stages = createFilterPipeline(() => rules);
    const result = evaluateFilterPipeline(
      createContext({ tabUrl: 'https://example.com/page' }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result).toBe('skip');
  });

  it('returns intercept when site rule says always-intercept even with small file', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-intercept' }];
    const stages = createFilterPipeline(() => rules);
    const result = evaluateFilterPipeline(
      createContext({ tabUrl: 'https://example.com/page', fileSize: 100 }),
      { ...DEFAULT_SETTINGS, minFileSize: 10 },
      stages,
    );
    // Site rule (always-intercept) should override file size filter
    expect(result).toBe('intercept');
  });

  it('returns skip when extension triggered the download', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({ byExtensionId: 'my-extension' }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result).toBe('skip');
  });
});

