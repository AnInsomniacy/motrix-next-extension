import picomatch from 'picomatch';
import type { SiteRule } from './schema';

/** First matching rule wins across the source page and resource hosts. */
export function matchSiteRule(rules: SiteRule[], urls: string[]): SiteRule['action'] | null {
  const hosts = new Set(
    urls.flatMap((value) => {
      try {
        return [new URL(value).hostname];
      } catch {
        return [];
      }
    }),
  );
  for (const rule of rules) {
    const matches = picomatch(rule.pattern);
    if ([...hosts].some((host) => matches(host))) return rule.action;
  }
  return null;
}
