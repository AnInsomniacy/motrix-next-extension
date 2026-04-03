import { describe, it, expect } from 'vitest';
import { decodeThunderLink } from '../../shared/thunder';

describe('decodeThunderLink', () => {
  it('returns non-thunder URLs unchanged', () => {
    expect(decodeThunderLink('http://example.com/file.zip')).toBe('http://example.com/file.zip');
    expect(decodeThunderLink('https://cdn.example.com/app.dmg')).toBe(
      'https://cdn.example.com/app.dmg',
    );
    expect(decodeThunderLink('magnet:?xt=urn:btih:abc')).toBe('magnet:?xt=urn:btih:abc');
  });

  it('decodes a valid thunder:// link', () => {
    // "AA" + "http://example.com/file.zip" + "ZZ" → base64
    const inner = 'http://example.com/file.zip';
    const encoded = 'thunder://' + btoa('AA' + inner + 'ZZ');
    expect(decodeThunderLink(encoded)).toBe(inner);
  });

  it('decodes thunder links with FTP URLs', () => {
    const inner = 'ftp://files.example.com/pub/archive.tar.gz';
    const encoded = 'thunder://' + btoa('AA' + inner + 'ZZ');
    expect(decodeThunderLink(encoded)).toBe(inner);
  });

  it('returns original URL on malformed base64', () => {
    const malformed = 'thunder://not-valid-base64!!!';
    expect(decodeThunderLink(malformed)).toBe(malformed);
  });

  it('handles empty string', () => {
    expect(decodeThunderLink('')).toBe('');
  });
});
