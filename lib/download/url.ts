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
import { decodeMimeWords } from 'lettercoder';

export interface ParsedContentDisposition {
  type: string;
  filename?: string;
}

/**
 * Decode RFC 2047 MIME encoded-words when servers put them in filename fields.
 *
 * RFC 6266 prefers `filename*` for HTTP, but some mail/CDN download endpoints
 * still emit `filename="=?UTF-8?B?...?="`. Keep malformed values unchanged so
 * filename extraction remains best-effort and never blocks routing.
 */
export function decodeMimeEncodedWords(value: string): string {
  if (!value.includes('=?')) return value;

  try {
    const decoded = decodeMimeWords(value);
    return decoded || value;
  } catch {
    return value;
  }
}

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
    const raw =
      parsed.searchParams.get('response-content-disposition') ??
      parsed.searchParams.get('content-disposition');
    const cdFilename = raw ? extractFilenameFromContentDisposition(raw) : null;
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

export function extractFilenameFromContentDisposition(header: string): string | null {
  return parseContentDispositionHeader(header)?.filename ?? null;
}

/** Cookies can only be collected for network schemes. */
export function isCookieCollectableUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'ftp:';
  } catch {
    return false;
  }
}

export function parseContentDispositionHeader(header: string): ParsedContentDisposition | null {
  try {
    const { type, parameters } = contentDisposition.parse(header);
    const filename = parameters.filename;
    return {
      type: type.toLowerCase(),
      ...(filename ? { filename: decodeMimeEncodedWords(filename) } : {}),
    };
  } catch {
    return null;
  }
}
