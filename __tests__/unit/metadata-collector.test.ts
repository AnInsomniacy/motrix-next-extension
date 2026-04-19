import { describe, it, expect, vi } from 'vitest';
import { MetadataCollector } from '@/lib/download/metadata-collector';
import type { CollectInput } from '@/lib/download/metadata-collector';
import type { DownloadMetadata } from '@/shared/types';

// ─── Mock Chrome APIs ───────────────────────────────────

type CookiesApi = NonNullable<CollectInput['cookiesApi']>;

function createMockCookiesApi(
  getAll: CookiesApi['getAll'] = vi.fn<CookiesApi['getAll']>().mockResolvedValue([]),
): CookiesApi {
  return { getAll };
}

// ─── Tests ──────────────────────────────────────────────

describe('MetadataCollector', () => {
  describe('collectMetadata', () => {
    it('returns metadata with filename and referer', async () => {
      const collector = new MetadataCollector();

      const result = await collector.collectMetadata({
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        tabUrl: 'https://example.com/page',
        cookiesApi: null,
      });

      expect(result.filename).toBe('file.zip');
      expect(result.referer).toBe('https://example.com/page');
      expect(result.cookies).toBeNull();
    });

    it('collects cookies when cookies API is available', async () => {
      const getAllFn = vi.fn<CookiesApi['getAll']>().mockResolvedValue([
        { name: 'session', value: 'abc123' },
        { name: 'token', value: 'xyz789' },
      ]);
      const mockCookies = createMockCookiesApi(getAllFn);

      const collector = new MetadataCollector();

      const result = await collector.collectMetadata({
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        tabUrl: 'https://example.com/page',
        cookiesApi: mockCookies,
      });

      expect(result.cookies).toBe('session=abc123; token=xyz789');
      expect(mockCookies.getAll).toHaveBeenCalledWith({ url: 'https://example.com/file.zip' });
    });

    it('returns null cookies when cookies API is null', async () => {
      const collector = new MetadataCollector();

      const result = await collector.collectMetadata({
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        tabUrl: 'https://example.com/page',
        cookiesApi: null,
      });

      expect(result.cookies).toBeNull();
    });

    it('returns null cookies when cookie collection fails gracefully', async () => {
      const getAllFn = vi
        .fn<CookiesApi['getAll']>()
        .mockRejectedValue(new Error('Permission denied'));
      const mockCookies = createMockCookiesApi(getAllFn);

      const collector = new MetadataCollector();

      const result = await collector.collectMetadata({
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        tabUrl: 'https://example.com/page',
        cookiesApi: mockCookies,
      });

      expect(result.cookies).toBeNull();
    });

    it('returns null cookies when cookie array is empty', async () => {
      const mockCookies = createMockCookiesApi();

      const collector = new MetadataCollector();

      const result = await collector.collectMetadata({
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        tabUrl: 'https://example.com/page',
        cookiesApi: mockCookies,
      });

      expect(result.cookies).toBeNull();
    });

    it('uses download URL as referer when tabUrl is empty', async () => {
      const collector = new MetadataCollector();

      const result = await collector.collectMetadata({
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        tabUrl: '',
        cookiesApi: null,
      });

      expect(result.referer).toBe('https://example.com/file.zip');
    });
  });

  describe('buildAria2Headers', () => {
    it('builds header array with cookie and referer', () => {
      const metadata: DownloadMetadata = {
        filename: 'file.zip',
        cookies: 'session=abc123',
        referer: 'https://example.com',
      };

      const headers = MetadataCollector.buildAria2Headers(metadata);

      expect(headers).toContain('Cookie: session=abc123');
      expect(headers).toContain('Referer: https://example.com');
    });

    it('omits cookie header when cookies is null', () => {
      const metadata: DownloadMetadata = {
        filename: 'file.zip',
        cookies: null,
        referer: 'https://example.com',
      };

      const headers = MetadataCollector.buildAria2Headers(metadata);

      expect(headers).not.toContainEqual(expect.stringContaining('Cookie:'));
      expect(headers).toContain('Referer: https://example.com');
    });

    it('returns empty array when no headers needed', () => {
      const metadata: DownloadMetadata = {
        filename: 'file.zip',
        cookies: null,
        referer: '',
      };

      const headers = MetadataCollector.buildAria2Headers(metadata);

      expect(headers).toEqual([]);
    });
  });
});
