/**
 * Thunder (迅雷) protocol link decoder.
 *
 * Thunder links encode a regular HTTP/FTP URL as base64 with "AA" prefix
 * and "ZZ" suffix: `thunder://` + base64("AA" + url + "ZZ").
 *
 * Ported from motrix-next desktop (shared/utils/resource.ts).
 */

/**
 * Decodes a `thunder://` protocol link to its original HTTP/FTP URL.
 * Returns the input unchanged if it is not a Thunder link.
 *
 * @example
 * decodeThunderLink('thunder://QUFodHRwOi8vZXhhbXBsZS5jb20vZmlsZS56aXBaWg==')
 * // → 'http://example.com/file.zip'
 */
export function decodeThunderLink(url: string): string {
  if (!url.startsWith('thunder://')) return url;
  try {
    const encoded = url.slice('thunder://'.length);
    const decoded = atob(encoded);
    // Strip the "AA" prefix (2 chars) and "ZZ" suffix (2 chars)
    return decoded.substring(2, decoded.length - 2);
  } catch {
    // Malformed base64 — return original URL as-is
    return url;
  }
}
