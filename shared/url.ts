/**
 * URL filename extraction utility.
 *
 * Extracts a usable filename from a URL using two strategies:
 *   1. Content-Disposition query parameter (cloud drive presigned URLs)
 *   2. URL pathname basename (standard download URLs)
 *
 * Cloud storage providers (Aliyun OSS, AWS S3, GCS) embed the real
 * filename in a `response-content-disposition` query parameter when
 * the URL pathname is a hash or UUID. This is standard for Quark,
 * Baidu, 115, and Aliyun Drive presigned URLs.
 */
import contentDisposition from 'content-disposition';

/**
 * Extract a filename from a URL.
 *
 * Priority:
 *   1. `response-content-disposition` query param (RFC 6266 parse)
 *   2. `content-disposition` query param (alternative key)
 *   3. URL pathname basename (must contain a file extension)
 *
 * @example
 * // Standard URL → pathname extraction
 * extractFilenameFromUrl('https://cdn.example.com/files/app-v2.0.zip?token=abc')
 * // → 'app-v2.0.zip'
 *
 * @example
 * // Cloud drive presigned URL → Content-Disposition extraction
 * extractFilenameFromUrl('https://dl-pc-zb.pds.quark.cn/hash123?response-content-disposition=...')
 * // → '无常幽鬼全关V0.1.xmgic'
 *
 * @returns The decoded filename, or null if no filename can be determined.
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Priority 1: Content-Disposition query parameter (cloud drive presigned URLs)
    const cdFilename = extractFromContentDisposition(parsed);
    if (cdFilename) return cdFilename;

    // Priority 2: URL pathname basename
    const decoded = decodeURIComponent(parsed.pathname);
    const basename = decoded.split('/').pop();
    // Filter out empty segments and bare directory paths
    if (!basename || basename === '/' || !basename.includes('.')) {
      return null;
    }
    return basename;
  } catch {
    return null;
  }
}

/**
 * Extract filename from Content-Disposition query parameters.
 *
 * Cloud storage providers embed the real filename in URL query params:
 *   - `response-content-disposition` (Aliyun OSS, AWS S3, GCS)
 *   - `content-disposition` (some providers)
 *
 * Uses the RFC 6266–compliant `content-disposition` library for parsing,
 * which automatically handles `filename*` (RFC 5987) UTF-8 decoding
 * and prefers `filename*` over `filename` when both are present.
 */
function extractFromContentDisposition(parsed: URL): string | null {
  const raw =
    parsed.searchParams.get('response-content-disposition') ??
    parsed.searchParams.get('content-disposition');
  if (!raw) return null;

  // Try RFC 6266–compliant library first (handles filename* automatically)
  try {
    const { parameters } = contentDisposition.parse(raw);
    const filename = parameters.filename;
    if (filename) return filename;
  } catch {
    // Library rejects non-ASCII in filename param (strict RFC compliance).
    // Fall through to regex extraction for non-compliant servers.
  }

  // Fallback: manual extraction for non-RFC-compliant Content-Disposition values.
  // Some cloud providers use filename="中文.zip" (raw non-ASCII) without filename*.
  return extractFilenameFallback(raw);
}

/**
 * Manual Content-Disposition filename extraction fallback.
 *
 * Handles non-RFC-compliant servers that embed raw non-ASCII characters
 * in the `filename` parameter without using `filename*` (RFC 5987).
 *
 * Priority: `filename*` (with percent-decode) → `filename` (with unquoting).
 */
function extractFilenameFallback(header: string): string | null {
  // Try filename* first (RFC 5987): filename*=UTF-8''%E4%B8%AD%E6%96%87.txt
  const extMatch = /filename\*\s*=\s*(?:UTF-8|utf-8)?'[^']*'(.+?)(?:\s*;|$)/i.exec(header);
  if (extMatch?.[1]) {
    try {
      return decodeURIComponent(extMatch[1]);
    } catch {
      return extMatch[1];
    }
  }

  // Try filename: filename="中文.zip" or filename=file.zip
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  if (match?.[1]) {
    const value = match[1].trim();
    // Try percent-decode in case value is encoded
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}
