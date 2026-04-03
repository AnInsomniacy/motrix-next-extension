import { describe, it, expect } from 'vitest';
import { extractFilenameFromUrl } from '../../shared/url';

describe('extractFilenameFromUrl', () => {
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
});
