import type {
  FilterContext,
  FilterVerdict,
  DownloadSettings,
  SiteRule,
  FilterStage,
} from '@/shared/types';
import { INTERCEPTABLE_SCHEMES } from '@/shared/constants';

// ─── Stages ─────────────────────────────────────────────

/**
 * Stage 1: Check if download interception is globally enabled.
 */
export class EnabledStage implements FilterStage {
  readonly name = 'enabled';

  evaluate(_ctx: FilterContext, config: DownloadSettings): FilterVerdict | null {
    return config.enabled ? null : 'skip';
  }
}

/**
 * Stage 2: Skip downloads triggered by another extension (including ourselves)
 * to prevent infinite loops.
 */
export class SelfTriggerStage implements FilterStage {
  readonly name = 'self-trigger';

  evaluate(ctx: FilterContext, _config: DownloadSettings): FilterVerdict | null {
    return ctx.byExtensionId ? 'skip' : null;
  }
}

/**
 * Stage 3: Only intercept http/https/ftp schemes.
 * Reject blob:, data:, chrome:, chrome-extension:, about:.
 */
export class SchemeStage implements FilterStage {
  readonly name = 'scheme';

  evaluate(ctx: FilterContext, _config: DownloadSettings): FilterVerdict | null {
    try {
      const scheme = new URL(ctx.url).protocol;
      const isInterceptable = (INTERCEPTABLE_SCHEMES as readonly string[]).includes(scheme);
      return isInterceptable ? null : 'skip';
    } catch {
      return 'skip';
    }
  }
}

/**
 * Stage 4: Skip files smaller than the configured minimum size.
 * Unknown sizes (-1) pass through (intercept to be safe).
 */
export class FileSizeStage implements FilterStage {
  readonly name = 'file-size';

  evaluate(ctx: FilterContext, config: DownloadSettings): FilterVerdict | null {
    if (config.minFileSize <= 0) return null;
    if (ctx.fileSize < 0) return null; // Unknown size — pass through
    const minBytes = config.minFileSize * 1024 * 1024;
    return ctx.fileSize >= minBytes ? null : 'skip';
  }
}

/**
 * Stage 5: Apply per-site rules.
 *
 * `SiteRuleStage` takes an additional `rules` parameter because it needs
 * external state (the rule list) that isn't part of `DownloadSettings`.
 * The pipeline orchestrator passes this separately.
 */
export class SiteRuleStage {
  readonly name = 'site-rule';

  evaluate(
    ctx: FilterContext,
    _config: DownloadSettings,
    rules?: SiteRule[],
  ): FilterVerdict | null {
    if (!rules?.length) return null;

    const hostname = this.extractHostname(ctx.tabUrl);
    if (!hostname) return null;

    for (const rule of rules) {
      if (this.matchPattern(hostname, rule.pattern)) {
        switch (rule.action) {
          case 'always-intercept':
            return 'intercept';
          case 'always-skip':
            return 'skip';
          case 'use-global':
            return null;
        }
      }
    }

    return null;
  }

  private extractHostname(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private matchPattern(hostname: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    }
    return hostname === pattern;
  }
}

// ─── Pipeline ───────────────────────────────────────────

const BASIC_STAGES: FilterStage[] = [new EnabledStage(), new SelfTriggerStage(), new SchemeStage()];

const SITE_RULE_STAGE = new SiteRuleStage();
const FILE_SIZE_STAGE = new FileSizeStage();

/**
 * Evaluate the full filter pipeline against a download context.
 *
 * Pipeline order:
 * 1. Enabled → 2. SelfTrigger → 3. Scheme → 4. SiteRule → 5. FileSize
 *
 * Site rules are evaluated BEFORE file size so that "always-intercept"
 * can override the minimum size filter.
 *
 * Returns 'intercept' or 'skip'. Default (all stages pass) = 'intercept'.
 */
export function evaluateFilterPipeline(
  ctx: FilterContext,
  config: DownloadSettings,
  rules: SiteRule[],
): FilterVerdict {
  // Stages 1-3: basic checks
  for (const stage of BASIC_STAGES) {
    const verdict = stage.evaluate(ctx, config);
    if (verdict !== null) return verdict;
  }

  // Stage 4: site rules can override file size
  const siteVerdict = SITE_RULE_STAGE.evaluate(ctx, config, rules);
  if (siteVerdict !== null) return siteVerdict;

  // Stage 5: file size (only checked if site rule didn't decide)
  const sizeVerdict = FILE_SIZE_STAGE.evaluate(ctx, config);
  if (sizeVerdict !== null) return sizeVerdict;

  // Default: intercept
  return 'intercept';
}
