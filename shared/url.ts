/**
 * URL filename extraction utility.
 *
 * Extracts a usable filename from a URL's pathname, handling
 * percent-encoded characters and query strings.
 */

/**
 * Extract a filename from a URL's pathname.
 *
 * @example
 * extractFilenameFromUrl('https://cdn.example.com/files/app-v2.0.zip?token=abc')
 * // → 'app-v2.0.zip'
 *
 * extractFilenameFromUrl('https://cdn.example.com/download?id=123')
 * // → null  (no extension in path segment)
 *
 * @returns The decoded basename if it contains a dot (file extension), or null.
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    // Decode percent-encoded characters (e.g. %20 → space)
    const decoded = decodeURIComponent(pathname);
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
