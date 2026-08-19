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
      url: 'https://cdn.example.com/releases/asset',
      finalUrl: 'https://cdn.example.com/releases/asset',
      filename: 'release.zip',
      filenameSource: 'content-disposition',
      fileSize: 10_485_760,
      totalBytes: 10_485_760,
      mime: 'application/zip',
      referrer: 'https://example.com/releases',
    });
  });

  it('recognizes an octet-stream download without Content-Disposition', () => {
    const parsed = parseFirefoxDownloadResponse({
      url: 'https://cdn.example.com/MicrosoftEdgeEnterpriseX64.msi',
      method: 'GET',
      type: 'main_frame',
      statusCode: 200,
      originUrl: 'https://go.microsoft.com/fwlink/?LinkID=2093437',
      responseHeaders: [
        { name: 'Content-Type', value: 'application/octet-stream' },
        { name: 'Content-Length', value: '213393408' },
      ],
    });

    expect(parsed).toEqual({
      url: 'https://cdn.example.com/MicrosoftEdgeEnterpriseX64.msi',
      finalUrl: 'https://cdn.example.com/MicrosoftEdgeEnterpriseX64.msi',
      filename: '',
      fileSize: 213_393_408,
      totalBytes: 213_393_408,
      mime: 'application/octet-stream',
      referrer: 'https://go.microsoft.com/fwlink/?LinkID=2093437',
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
        url: 'https://example.com/report.pdf',
        method: 'GET',
        type: 'main_frame',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/pdf' }],
      }),
    ).toBeNull();

    expect(
      parseFirefoxDownloadResponse({
        url: 'https://example.com/api',
        method: 'GET',
        type: 'main_frame',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/problem+json' }],
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
