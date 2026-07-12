import { extractFilenameFromContentDisposition } from './url';
import sanitizeFilename from 'sanitize-filename';

export const UNRESOLVED_FILENAME = 'unresolved-filename';

export type FilenameSource = 'content-disposition';

export interface FilenameMetadata {
  filename: string;
  source: FilenameSource;
}

export interface FilenameMetadataDownloadItem {
  url: string;
  finalUrl?: string;
}

interface MetadataEntry extends FilenameMetadata {
  createdAt: number;
}

const DEFAULT_WAIT_MS = 300;
const DEFAULT_TTL_MS = 30_000;
const POLL_INTERVAL_MS = 25;
const GENERIC_FILENAMES = new Set(['download', UNRESOLVED_FILENAME]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127 && (code < 128 || code > 159);
    })
    .join('');
}

export function normalizeFilename(filename: string): string {
  const basename = filename.trim().replace(/^.*[/\\]/, '');
  const stripped = stripControlCharacters(basename).replace(/[. ]+$/, '');
  return sanitizeFilename(stripped, { replacement: '_' })
    .trim()
    .replace(/[. ]+$/, '');
}

function isUsableFilename(filename: string): boolean {
  const normalized = normalizeFilename(filename);
  if (!normalized || normalized === '.' || normalized === '..') return false;
  if (GENERIC_FILENAMES.has(normalized.toLowerCase())) return false;
  return true;
}

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export class DownloadFilenameMetadataStore {
  private readonly byUrl = new Map<string, MetadataEntry>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  rememberContentDisposition(url: string, header: string): void {
    const filename = extractFilenameFromContentDisposition(header);
    if (!filename || !isUsableFilename(filename)) return;
    this.byUrl.set(canonicalUrl(url), {
      filename: normalizeFilename(filename),
      source: 'content-disposition',
      createdAt: this.now(),
    });
    this.prune();
  }

  async resolve(
    item: FilenameMetadataDownloadItem,
    waitMs: number = DEFAULT_WAIT_MS,
  ): Promise<FilenameMetadata | undefined> {
    const deadline = this.now() + waitMs;
    while (true) {
      const found = this.find(item);
      if (found) return { filename: found.filename, source: found.source };
      if (this.now() >= deadline) return undefined;
      await sleep(POLL_INTERVAL_MS);
    }
  }

  private find(item: FilenameMetadataDownloadItem): MetadataEntry | undefined {
    this.prune();
    const byFinalUrl = this.byUrl.get(canonicalUrl(item.finalUrl || item.url));
    const byOriginalUrl = this.byUrl.get(canonicalUrl(item.url));
    return byFinalUrl ?? byOriginalUrl;
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [url, entry] of this.byUrl) {
      if (entry.createdAt < cutoff) this.byUrl.delete(url);
    }
  }
}
