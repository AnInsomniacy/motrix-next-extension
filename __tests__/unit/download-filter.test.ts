import { describe, it, expect } from 'vitest';
import {
  evaluateFilterPipeline,
  createFilterPipeline,
  EnabledStage,
  SelfTriggerStage,
  SchemeStage,
  SiteRuleStage,
  MimeTypeStage,
  InterceptionScopeStage,
  MinimumFileSizeStage,
} from '@/lib/download/filter';
import type { FilterContext, DownloadSettings, SiteRule } from '@/shared/types';

// ─── Fixtures ───────────────────────────────────────────

const DEFAULT_SETTINGS: DownloadSettings = {
  enabled: true,
  hideDownloadBar: false,
  autoLaunchApp: true,
  forwardRequestHeaders: true,
  forwardCookies: false,
  duplicateGuard: {
    enabled: true,
    windowSeconds: 10,
  },
  minimumFileSize: {
    enabled: false,
    sizeMb: 0,
    unknownSizeAction: 'intercept',
  },
  interceptionScope: {
    browserDownloads: true,
    magnet: true,
    ed2k: true,
    thunder: true,
  },
};

function createContext(overrides?: Partial<FilterContext>): FilterContext {
  return {
    url: 'https://example.com/file.zip',
    finalUrl: 'https://example.com/file.zip',
    filename: 'file.zip',
    fileSize: 10485760, // 10 MB
    totalBytes: 10485760,
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

// ─── Interception Scope Stage ───────────────────────────

describe('InterceptionScopeStage', () => {
  const stage = new InterceptionScopeStage();

  it('skips browser downloads when browser download interception is disabled', () => {
    const result = stage.evaluate(createContext(), {
      ...DEFAULT_SETTINGS,
      interceptionScope: {
        ...DEFAULT_SETTINGS.interceptionScope,
        browserDownloads: false,
      },
    });

    expect(result).toBe('skip');
  });
});

// ─── Site Rule Stage ────────────────────────────────────

describe('SiteRuleStage', () => {
  // ── Existing behavior (must remain green) ──

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

  // ── Glob patterns via picomatch ──

  it('matches mid-domain wildcard (*.lanzou*.com)', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '*.lanzou*.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://www.lanzoux.com/download' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('does not match unrelated domain against mid-domain wildcard', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '*.lanzou*.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://developer2.lanrar.com/file' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('matches private IP range pattern (192.168.*.*)', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '192.168.*.*', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://192.168.1.100/files' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('does not match public IP against private IP pattern', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '192.168.*.*', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://10.0.0.1/files' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('matches 10.* intranet range', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '10.*.*.*', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({ tabUrl: 'https://10.0.0.1/nas' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  // ── Triple-hostname matching (tabUrl + url + finalUrl) ──

  it('matches rule against download finalUrl when tabUrl does not match', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '*.webgetstore.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({
      tabUrl: 'https://developer2.lanrar.com/page',
      url: 'https://developer2.lanrar.com/file/abc',
      finalUrl: 'https://zip1.webgetstore.com/file.zip',
    });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('matches rule against download url when tabUrl does not match', () => {
    const rules: SiteRule[] = [
      { id: '1', pattern: '*.cdn.example.com', action: 'always-intercept' },
    ];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({
      tabUrl: 'https://example.com/page',
      url: 'https://files.cdn.example.com/big.zip',
      finalUrl: 'https://files.cdn.example.com/big.zip',
    });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('intercept');
  });

  it('matches rule against tabUrl even when download url differs', () => {
    const rules: SiteRule[] = [
      { id: '1', pattern: 'trusted-site.com', action: 'always-intercept' },
    ];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({
      tabUrl: 'https://trusted-site.com/page',
      url: 'https://cdn.other.com/file.zip',
      finalUrl: 'https://cdn.other.com/file.zip',
    });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('intercept');
  });

  it('deduplicates hostnames when tabUrl and url share same host', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({
      tabUrl: 'https://example.com/page',
      url: 'https://example.com/file.zip',
      finalUrl: 'https://example.com/file.zip',
    });
    // Should still work (dedup doesn't break matching)
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns null when no hostname matches across all three URLs', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: '*.blocked.com', action: 'always-skip' }];
    const stage = new SiteRuleStage(() => rules);
    const ctx = createContext({
      tabUrl: 'https://pagehost.com/page',
      url: 'https://downloadhost.com/file.zip',
      finalUrl: 'https://cdnhost.com/file.zip',
    });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });
});

// ─── MIME Type Stage ────────────────────────────────────

describe('MimeTypeStage', () => {
  const stage = new MimeTypeStage();

  it('returns skip for text/html', () => {
    const ctx = createContext({ mimeType: 'text/html' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns skip for text/html with charset parameter', () => {
    const ctx = createContext({ mimeType: 'text/html; charset=utf-8' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns skip for text/xml', () => {
    const ctx = createContext({ mimeType: 'text/xml' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns skip for application/xhtml+xml', () => {
    const ctx = createContext({ mimeType: 'application/xhtml+xml' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('returns null for application/octet-stream', () => {
    const ctx = createContext({ mimeType: 'application/octet-stream' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns null for application/zip', () => {
    const ctx = createContext({ mimeType: 'application/zip' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns null for application/pdf', () => {
    const ctx = createContext({ mimeType: 'application/pdf' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns null for application/x-bittorrent', () => {
    const ctx = createContext({ mimeType: 'application/x-bittorrent' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('returns null when mime is empty string (unknown)', () => {
    const ctx = createContext({ mimeType: '' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBeNull();
  });

  it('handles case-insensitive MIME types', () => {
    const ctx = createContext({ mimeType: 'Text/HTML' });
    expect(stage.evaluate(ctx, DEFAULT_SETTINGS)).toBe('skip');
  });

  it('implements FilterStage interface', () => {
    expect(stage.name).toBe('mime-type');
    expect(typeof stage.evaluate).toBe('function');
  });
});

// ─── Minimum File Size Stage ────────────────────────────

describe('MinimumFileSizeStage', () => {
  const stage = new MinimumFileSizeStage();
  const enabledSettings: DownloadSettings = {
    ...DEFAULT_SETTINGS,
    minimumFileSize: {
      enabled: true,
      sizeMb: 5,
      unknownSizeAction: 'intercept',
    },
  };

  it('skips known downloads smaller than the configured threshold', () => {
    const ctx = createContext({ totalBytes: 1 * 1024 * 1024, fileSize: 1 * 1024 * 1024 });

    expect(stage.evaluate(ctx, enabledSettings)).toBe('skip');
  });

  it('does not skip small torrent files identified by MIME type', () => {
    const ctx = createContext({
      url: 'https://example.com/linux',
      finalUrl: 'https://example.com/linux',
      filename: 'download',
      mimeType: 'application/x-bittorrent',
      totalBytes: 27 * 1024,
      fileSize: 27 * 1024,
    });

    expect(stage.evaluate(ctx, enabledSettings)).toBeNull();
  });

  it('does not skip small torrent files identified by final URL filename', () => {
    const ctx = createContext({
      url: 'https://example.com/download?id=1',
      finalUrl: 'https://cdn.example.com/linux.torrent',
      filename: 'download',
      mimeType: 'application/octet-stream',
      totalBytes: 27 * 1024,
      fileSize: 27 * 1024,
    });

    expect(stage.evaluate(ctx, enabledSettings)).toBeNull();
  });

  it('does not skip small torrent files identified by content disposition filename', () => {
    const ctx = createContext({
      url:
        'https://cdn.example.com/hash?response-content-disposition=' +
        encodeURIComponent('attachment; filename="linux.torrent"'),
      finalUrl: 'https://cdn.example.com/hash',
      filename: 'download',
      mimeType: 'application/octet-stream',
      totalBytes: 27 * 1024,
      fileSize: 27 * 1024,
    });

    expect(stage.evaluate(ctx, enabledSettings)).toBeNull();
  });

  it('uses fileSize when totalBytes is unknown', () => {
    const ctx = createContext({ totalBytes: -1, fileSize: 1 * 1024 * 1024 });

    expect(stage.evaluate(ctx, enabledSettings)).toBe('skip');
  });

  it('intercepts unknown-size downloads by default', () => {
    const ctx = createContext({ totalBytes: -1, fileSize: -1 });

    expect(stage.evaluate(ctx, enabledSettings)).toBeNull();
  });

  it('skips unknown-size downloads when configured to use the browser', () => {
    const ctx = createContext({ totalBytes: -1, fileSize: -1 });
    const settings: DownloadSettings = {
      ...enabledSettings,
      minimumFileSize: {
        ...enabledSettings.minimumFileSize,
        unknownSizeAction: 'skip',
      },
    };

    expect(stage.evaluate(ctx, settings)).toBe('skip');
  });
});

// ─── Full Pipeline ──────────────────────────────────────

describe('evaluateFilterPipeline', () => {
  it('returns intercept with null stageName for a normal download', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(createContext(), DEFAULT_SETTINGS, stages);
    expect(result.verdict).toBe('intercept');
    expect(result.stageName).toBeNull();
  });

  it('returns skip with "enabled" stageName when disabled', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext(),
      { ...DEFAULT_SETTINGS, enabled: false },
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('enabled');
  });

  it('returns skip with "scheme" stageName for blob URL', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({ url: 'blob:https://example.com/abc' }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('scheme');
  });

  it('returns skip with "interception-scope" stageName when browser downloads are disabled', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext(),
      {
        ...DEFAULT_SETTINGS,
        interceptionScope: {
          ...DEFAULT_SETTINGS.interceptionScope,
          browserDownloads: false,
        },
      },
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('interception-scope');
  });

  it('skips small files when minimum file size filtering is enabled', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({ fileSize: 512, totalBytes: 512 }),
      {
        ...DEFAULT_SETTINGS,
        minimumFileSize: {
          enabled: true,
          sizeMb: 1,
          unknownSizeAction: 'intercept',
        },
      },
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('minimum-file-size');
  });

  it('returns skip with "site-rule" stageName when rule says always-skip', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-skip' }];
    const stages = createFilterPipeline(() => rules);
    const result = evaluateFilterPipeline(
      createContext({ tabUrl: 'https://example.com/page' }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('site-rule');
  });

  it('returns intercept with "site-rule" stageName when rule says always-intercept', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-intercept' }];
    const stages = createFilterPipeline(() => rules);
    const result = evaluateFilterPipeline(
      createContext({ tabUrl: 'https://example.com/page', fileSize: 100 }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result.verdict).toBe('intercept');
    expect(result.stageName).toBe('site-rule');
  });

  it('returns skip with "self-trigger" stageName when extension triggered the download', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({ byExtensionId: 'my-extension' }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('self-trigger');
  });

  it('returns skip with "mime-type" stageName for text/html MIME type', () => {
    const stages = createFilterPipeline(() => []);
    const result = evaluateFilterPipeline(
      createContext({
        url: 'https://lanzou.com/file/?xyz&toolsdown',
        mimeType: 'text/html',
      }),
      DEFAULT_SETTINGS,
      stages,
    );
    expect(result.verdict).toBe('skip');
    expect(result.stageName).toBe('mime-type');
  });

  it('site rule always-intercept overrides MIME type skip', () => {
    const rules: SiteRule[] = [{ id: '1', pattern: 'example.com', action: 'always-intercept' }];
    const stages = createFilterPipeline(() => rules);
    const result = evaluateFilterPipeline(
      createContext({
        tabUrl: 'https://example.com/page',
        mimeType: 'text/html',
      }),
      DEFAULT_SETTINGS,
      stages,
    );
    // Site rule (always-intercept) fires before MimeTypeStage → intercept wins
    expect(result.verdict).toBe('intercept');
    expect(result.stageName).toBe('site-rule');
  });
});
