import { describe, expect, it } from 'vitest';
import { parseFirefoxDownloadResponse } from '@/lib/download/firefox-response';

describe('parseFirefoxDownloadResponse', () => {
  it('creates a download candidate from an explicit attachment response', () => {
    const parsed = parseFirefoxDownloadResponse({
      url: 'https://cdn.example.com/releases/asset',
      method: 'GET',
      type: 'main_frame',
      statusCode: 200,
      originUrl: 'https://example.com/releases',
      responseHeaders: [
        { name: 'Content-Disposition', value: 'attachment; filename="release.zip"' },
        { name: 'Content-Type', value: 'application/zip' },
        { name: 'Content-Length', value: '10485760' },
      ],
    });

    expect(parsed).toEqual({
      item: {
        url: 'https://cdn.example.com/releases/asset',
        finalUrl: 'https://cdn.example.com/releases/asset',
        filename: 'release.zip',
        fileSize: 10_485_760,
        totalBytes: 10_485_760,
        mime: 'application/zip',
        referrer: 'https://example.com/releases',
      },
      metadata: {
        filename: 'release.zip',
        source: 'content-disposition',
      },
    });
  });

  it('rejects responses that are not explicit document downloads', () => {
    expect(
      parseFirefoxDownloadResponse({
        url: 'https://example.com/',
        method: 'GET',
        type: 'main_frame',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
      }),
    ).toBeNull();

    expect(
      parseFirefoxDownloadResponse({
        url: 'https://example.com/api/export',
        method: 'GET',
        type: 'xmlhttprequest',
        statusCode: 200,
        responseHeaders: [
          { name: 'Content-Disposition', value: 'attachment; filename="export.zip"' },
        ],
      }),
    ).toBeNull();
  });
});
