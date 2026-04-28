import { describe, it, expect } from 'vitest';
import { extractFilenameFromUrl } from '../../shared/url';

describe('extractFilenameFromUrl', () => {
  // ── Existing pathname-based tests ──

  it('extracts filename from a standard URL', () => {
    expect(extractFilenameFromUrl('https://cdn.example.com/files/app-v2.0.zip')).toBe(
      'app-v2.0.zip',
    );
  });

  it('extracts filename ignoring query parameters', () => {
    expect(
      extractFilenameFromUrl('https://cdn.apple.com/ipsw/iPhone_Restore.ipsw?accessKey=abc'),
    ).toBe('iPhone_Restore.ipsw');
  });

  it('decodes percent-encoded characters', () => {
    expect(extractFilenameFromUrl('https://example.com/files/%E6%96%87%E4%BB%B6.zip')).toBe(
      '文件.zip',
    );
  });

  it('returns null for URLs without file extension', () => {
    expect(extractFilenameFromUrl('https://example.com/download')).toBeNull();
    expect(extractFilenameFromUrl('https://example.com/api/getFile')).toBeNull();
  });

  it('returns null for bare domain URLs', () => {
    expect(extractFilenameFromUrl('https://example.com/')).toBeNull();
    expect(extractFilenameFromUrl('https://example.com')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(extractFilenameFromUrl('not-a-url')).toBeNull();
    expect(extractFilenameFromUrl('')).toBeNull();
  });

  it('handles URLs with multiple path segments', () => {
    expect(extractFilenameFromUrl('https://cdn.example.com/a/b/c/release-notes.pdf')).toBe(
      'release-notes.pdf',
    );
  });

  it('handles magnet URIs (returns null — no path)', () => {
    expect(extractFilenameFromUrl('magnet:?xt=urn:btih:abc123')).toBeNull();
  });

  // ── Content-Disposition query param extraction (cloud drive presigned URLs) ──

  it('extracts filename from response-content-disposition query param (Quark/OSS)', () => {
    const url =
      'https://dl-pc-zb.pds.quark.cn/hash123?response-content-disposition=' +
      encodeURIComponent('attachment; filename="test-file.zip"');
    expect(extractFilenameFromUrl(url)).toBe('test-file.zip');
  });

  it('extracts filename from filename* with UTF-8 encoding (RFC 5987)', () => {
    const cdValue = "attachment; filename*=UTF-8''%E6%97%A0%E5%B8%B8.xmgic";
    const url =
      'https://cdn.example.com/hash?' +
      'response-content-disposition=' +
      encodeURIComponent(cdValue);
    expect(extractFilenameFromUrl(url)).toBe('无常.xmgic');
  });

  it('prefers filename* over filename when both present', () => {
    const cdValue =
      "attachment; filename=\"fallback.txt\"; filename*=UTF-8''%E4%B8%AD%E6%96%87.txt";
    const url =
      'https://cdn.example.com/hash?' +
      'response-content-disposition=' +
      encodeURIComponent(cdValue);
    expect(extractFilenameFromUrl(url)).toBe('中文.txt');
  });

  it('extracts from content-disposition query param (alternative key)', () => {
    const url =
      'https://cdn.example.com/hash?content-disposition=' +
      encodeURIComponent('attachment; filename="alt-key.zip"');
    expect(extractFilenameFromUrl(url)).toBe('alt-key.zip');
  });

  it('Content-Disposition query param takes priority over pathname', () => {
    const url =
      'https://cdn.example.com/real-path-file.zip?response-content-disposition=' +
      encodeURIComponent('attachment; filename="override.zip"');
    expect(extractFilenameFromUrl(url)).toBe('override.zip');
  });

  it('falls back to pathname when content-disposition param is malformed', () => {
    const url =
      'https://cdn.example.com/files/good.zip?response-content-disposition=garbage';
    expect(extractFilenameFromUrl(url)).toBe('good.zip');
  });

  it('falls back to pathname when no content-disposition query param exists', () => {
    const url = 'https://cdn.example.com/files/normal.zip?token=abc';
    expect(extractFilenameFromUrl(url)).toBe('normal.zip');
  });
});

