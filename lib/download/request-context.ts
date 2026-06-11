import type { RequestHeader } from '@/shared/types';

export type { RequestHeader };

export interface RawRequestHeader {
  name?: string;
  value?: string;
}

export interface RequestHeaderContext {
  url: string;
  createdAt: number;
  cookie?: string;
  referer?: string;
  userAgent?: string;
  requestHeaders: RequestHeader[];
}

export type RequestHeaderMatchSource = 'finalUrl' | 'url';
export type RequestHeaderMatchReason = 'matched' | 'not-found' | 'expired';

export interface RequestHeaderMatchResult {
  matched: boolean;
  reason: RequestHeaderMatchReason;
  context?: RequestHeaderContext;
  source?: RequestHeaderMatchSource;
  ageMs?: number;
}

export interface CaptureRequestHeaderContextInput {
  url: string;
  requestHeaders?: RawRequestHeader[];
  now?: number;
}

export type RequestHeaderBrowser = 'chromium' | 'firefox';

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 512;

const CANONICAL_REQUEST_HEADERS = new Map<string, string>([
  ['accept', 'Accept'],
  ['accept-language', 'Accept-Language'],
  ['accept-encoding', 'Accept-Encoding'],
  ['sec-ch-ua', 'Sec-CH-UA'],
  ['sec-ch-ua-mobile', 'Sec-CH-UA-Mobile'],
  ['sec-ch-ua-platform', 'Sec-CH-UA-Platform'],
  ['sec-fetch-dest', 'Sec-Fetch-Dest'],
  ['sec-fetch-mode', 'Sec-Fetch-Mode'],
  ['sec-fetch-site', 'Sec-Fetch-Site'],
  ['sec-fetch-user', 'Sec-Fetch-User'],
  ['upgrade-insecure-requests', 'Upgrade-Insecure-Requests'],
  ['dnt', 'DNT'],
  ['origin', 'Origin'],
]);

const USER_AGENT_HEADER = 'user-agent';
const REFERER_HEADER = 'referer';
const COOKIE_HEADER = 'cookie';
const FORBIDDEN_HEADER_NAMES = new Set([
  'authorization',
  'connection',
  'content-length',
  'host',
  'range',
  'transfer-encoding',
]);

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function isForbiddenHeaderName(name: string): boolean {
  return FORBIDDEN_HEADER_NAMES.has(name) || name.startsWith('proxy-') || name.startsWith('if-');
}

function sanitizeHeaderValue(value: string): string {
  return Array.from(value.replace(/[\r\n]+/g, ' '))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 32 || code > 31;
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function cloneContext(context: RequestHeaderContext): RequestHeaderContext {
  return {
    url: context.url,
    createdAt: context.createdAt,
    ...(context.cookie ? { cookie: context.cookie } : {}),
    ...(context.referer ? { referer: context.referer } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    requestHeaders: context.requestHeaders.map((header) => ({ ...header })),
  };
}

export function buildRequestHeaderExtraInfoSpec(browser: RequestHeaderBrowser): string[] {
  return browser === 'firefox' ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
}

export function captureRequestHeaderContext(
  input: CaptureRequestHeaderContextInput,
): RequestHeaderContext | null {
  const requestHeaders: RequestHeader[] = [];
  let cookie: string | undefined;
  let userAgent: string | undefined;
  let referer: string | undefined;

  for (const header of input.requestHeaders ?? []) {
    if (!header.name || header.value == null) continue;

    const normalizedName = header.name.trim().toLowerCase();
    if (!normalizedName || isForbiddenHeaderName(normalizedName)) continue;

    const value = sanitizeHeaderValue(header.value);
    if (!value) continue;

    if (normalizedName === COOKIE_HEADER) {
      cookie = value;
      continue;
    }

    if (normalizedName === USER_AGENT_HEADER) {
      userAgent = value;
      continue;
    }

    if (normalizedName === REFERER_HEADER) {
      referer = value;
      continue;
    }

    const canonicalName = CANONICAL_REQUEST_HEADERS.get(normalizedName);
    if (!canonicalName) continue;

    requestHeaders.push({ name: canonicalName, value });
  }

  if (!cookie && !userAgent && !referer && requestHeaders.length === 0) {
    return null;
  }

  return {
    url: input.url,
    createdAt: input.now ?? Date.now(),
    ...(cookie ? { cookie } : {}),
    ...(referer ? { referer } : {}),
    ...(userAgent ? { userAgent } : {}),
    requestHeaders,
  };
}

export class RequestHeaderContextStore {
  private readonly byUrl = new Map<string, RequestHeaderContext>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  remember(context: RequestHeaderContext): void {
    this.prune();
    this.byUrl.set(canonicalUrl(context.url), cloneContext(context));
    this.evictOverflow();
  }

  match(input: { url: string; finalUrl?: string }): RequestHeaderMatchResult {
    const now = this.now();
    const candidates: Array<{ url: string; source: RequestHeaderMatchSource }> = [];
    if (input.finalUrl) candidates.push({ url: input.finalUrl, source: 'finalUrl' });
    candidates.push({ url: input.url, source: 'url' });
    const seen = new Set<string>();
    let sawExpiredCandidate = false;

    for (const { url, source } of candidates) {
      const key = canonicalUrl(url);
      if (seen.has(key)) continue;
      seen.add(key);

      const context = this.byUrl.get(key);
      if (!context) continue;
      if (context.createdAt < now - this.ttlMs) {
        this.byUrl.delete(key);
        sawExpiredCandidate = true;
        continue;
      }

      this.consume(context);
      return {
        matched: true,
        reason: 'matched',
        context: cloneContext(context),
        source,
        ageMs: Math.max(0, now - context.createdAt),
      };
    }

    this.prune(now);
    return { matched: false, reason: sawExpiredCandidate ? 'expired' : 'not-found' };
  }

  private consume(context: RequestHeaderContext): void {
    for (const [key, candidate] of this.byUrl) {
      if (candidate === context) {
        this.byUrl.delete(key);
      }
    }
  }

  private prune(now: number = this.now()): void {
    const cutoff = now - this.ttlMs;
    for (const [url, context] of this.byUrl) {
      if (context.createdAt < cutoff) {
        this.byUrl.delete(url);
      }
    }
  }

  private evictOverflow(): void {
    while (this.byUrl.size > this.maxEntries) {
      let oldestUrl: string | undefined;
      let oldestTs = Number.POSITIVE_INFINITY;
      for (const [url, context] of this.byUrl) {
        if (context.createdAt < oldestTs) {
          oldestTs = context.createdAt;
          oldestUrl = url;
        }
      }
      if (!oldestUrl) return;
      this.byUrl.delete(oldestUrl);
    }
  }
}
