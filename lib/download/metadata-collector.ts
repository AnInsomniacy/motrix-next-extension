import type { DownloadMetadata } from '@/shared/types';

// ─── Types ──────────────────────────────────────────────

interface CookieItem {
  name: string;
  value: string;
}

interface CookiesApi {
  getAll(details: { url: string }): Promise<CookieItem[]>;
}

export interface CollectInput {
  url: string;
  filename: string;
  tabUrl: string;
  cookiesApi: CookiesApi | null;
}

// ─── Collector ──────────────────────────────────────────

/**
 * Collects download metadata (cookies, referer, filename) for aria2.
 *
 * Design:
 * - Cookies always collected when cookiesApi is available (required permission)
 * - Graceful degradation: cookie failure returns null, never throws
 * - Pure dependency injection: cookiesApi passed in, no global chrome reference
 */
export class MetadataCollector {
  async collectMetadata(input: CollectInput): Promise<DownloadMetadata> {
    const referer = input.tabUrl || input.url;
    const cookies = await this.collectCookies(input.url, input.cookiesApi);

    return {
      filename: input.filename,
      cookies,
      referer,
    };
  }

  /**
   * Build aria2-compatible header array from metadata.
   * Returns headers like ["Cookie: ...", "Referer: ..."].
   */
  static buildAria2Headers(metadata: DownloadMetadata): string[] {
    const headers: string[] = [];

    if (metadata.cookies) {
      headers.push(`Cookie: ${metadata.cookies}`);
    }

    if (metadata.referer) {
      headers.push(`Referer: ${metadata.referer}`);
    }

    return headers;
  }

  private async collectCookies(url: string, cookiesApi: CookiesApi | null): Promise<string | null> {
    if (!cookiesApi) {
      return null;
    }

    try {
      const cookies = await cookiesApi.getAll({ url });
      if (!cookies.length) return null;
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch {
      return null;
    }
  }
}
