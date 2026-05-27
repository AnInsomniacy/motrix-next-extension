import type { DuplicateDownloadGuardSettings } from '@/shared/types';

export interface DuplicateDownloadInput {
  url: string;
  finalUrl?: string;
  filename?: string;
  fileSize: number;
  totalBytes: number;
  mime: string;
}

export interface DuplicateDownloadReservation {
  keys: string[];
}

export type DuplicateDownloadDecision =
  | { blocked: true; shouldNotify: boolean }
  | { blocked: false; reservation?: DuplicateDownloadReservation };

interface GuardEntry {
  expiresAt: number;
  notified: boolean;
}

const MAX_WINDOW_SECONDS = 300;

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function filenameKey(filename: string): string {
  return filename
    .trim()
    .replace(/^.*[/\\]/, '')
    .toLowerCase();
}

function hostname(input: DuplicateDownloadInput): string {
  for (const value of [input.finalUrl, input.url]) {
    if (!value) continue;
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      continue;
    }
  }
  return '';
}

function knownSize(input: DuplicateDownloadInput): number | null {
  if (input.totalBytes > 0) return input.totalBytes;
  if (input.fileSize > 0) return input.fileSize;
  return null;
}

function windowMs(settings: DuplicateDownloadGuardSettings): number {
  return Math.max(1, Math.min(MAX_WINDOW_SECONDS, settings.windowSeconds)) * 1000;
}

export class DuplicateDownloadGuard {
  private readonly entries = new Map<string, GuardEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  reserve(
    input: DuplicateDownloadInput,
    settings: DuplicateDownloadGuardSettings,
  ): DuplicateDownloadDecision {
    if (!settings.enabled || settings.windowSeconds <= 0) {
      return { blocked: false };
    }

    const now = this.now();
    this.prune(now);
    const keys = this.buildKeys(input);
    const existing = keys.map((key) => this.entries.get(key)).find(Boolean);

    if (existing) {
      const shouldNotify = !existing.notified;
      existing.notified = true;
      return { blocked: true, shouldNotify };
    }

    const entry: GuardEntry = {
      expiresAt: now + windowMs(settings),
      notified: false,
    };
    for (const key of keys) {
      this.entries.set(key, entry);
    }

    return { blocked: false, reservation: { keys } };
  }

  commit(reservation: DuplicateDownloadReservation | undefined): void {
    if (!reservation) return;
    const now = this.now();
    for (const key of reservation.keys) {
      const entry = this.entries.get(key);
      if (entry && entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  release(reservation: DuplicateDownloadReservation | undefined): void {
    if (!reservation) return;
    for (const key of reservation.keys) {
      this.entries.delete(key);
    }
  }

  private buildKeys(input: DuplicateDownloadInput): string[] {
    const keys = new Set<string>();
    if (input.finalUrl) keys.add(`url:${canonicalUrl(input.finalUrl)}`);
    if (input.url) keys.add(`url:${canonicalUrl(input.url)}`);

    const size = knownSize(input);
    const name = input.filename ? filenameKey(input.filename) : '';
    const mime = input.mime.trim().toLowerCase();
    const host = hostname(input);
    if (host && name && size !== null) {
      keys.add(`file:${host}:${name}:${size}:${mime}`);
    }

    return [...keys];
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
