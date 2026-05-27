import { describe, expect, it } from 'vitest';
import { DuplicateDownloadGuard } from '@/lib/download/duplicate-guard';

const settings = { enabled: true, windowSeconds: 10 };

describe('DuplicateDownloadGuard', () => {
  it('blocks a repeated URL inside the configured window and notifies once', () => {
    let now = 1_000;
    const guard = new DuplicateDownloadGuard(() => now);

    const first = guard.reserve(
      {
        url: 'https://example.com/file.zip',
        finalUrl: 'https://cdn.example.com/file.zip',
        filename: 'file.zip',
        fileSize: 1024,
        totalBytes: 1024,
        mime: 'application/zip',
      },
      settings,
    );
    expect(first.blocked).toBe(false);

    const second = guard.reserve(
      {
        url: 'https://example.com/file.zip',
        finalUrl: 'https://cdn.example.com/file.zip',
        filename: 'file.zip',
        fileSize: 1024,
        totalBytes: 1024,
        mime: 'application/zip',
      },
      settings,
    );
    expect(second).toEqual({ blocked: true, shouldNotify: true });

    const third = guard.reserve(
      {
        url: 'https://example.com/file.zip',
        finalUrl: 'https://cdn.example.com/file.zip',
        filename: 'file.zip',
        fileSize: 1024,
        totalBytes: 1024,
        mime: 'application/zip',
      },
      settings,
    );
    expect(third).toEqual({ blocked: true, shouldNotify: false });

    now += 10_001;
    expect(
      guard.reserve(
        {
          url: 'https://example.com/file.zip',
          finalUrl: 'https://cdn.example.com/file.zip',
          filename: 'file.zip',
          fileSize: 1024,
          totalBytes: 1024,
          mime: 'application/zip',
        },
        settings,
      ).blocked,
    ).toBe(false);
  });

  it('releases a reserved download when routing fails', () => {
    const guard = new DuplicateDownloadGuard(() => 1_000);
    const first = guard.reserve(
      {
        url: 'https://example.com/file.zip',
        finalUrl: 'https://example.com/file.zip',
        filename: 'file.zip',
        fileSize: 1024,
        totalBytes: 1024,
        mime: 'application/zip',
      },
      settings,
    );
    expect(first.blocked).toBe(false);
    if (first.blocked) throw new Error('expected reservation');
    guard.release(first.reservation);

    expect(
      guard.reserve(
        {
          url: 'https://example.com/file.zip',
          finalUrl: 'https://example.com/file.zip',
          filename: 'file.zip',
          fileSize: 1024,
          totalBytes: 1024,
          mime: 'application/zip',
        },
        settings,
      ).blocked,
    ).toBe(false);
  });

  it('does not block when disabled', () => {
    const guard = new DuplicateDownloadGuard(() => 1_000);
    const disabled = { enabled: false, windowSeconds: 10 };
    const first = guard.reserve(
      {
        url: 'https://example.com/file.zip',
        finalUrl: 'https://example.com/file.zip',
        filename: 'file.zip',
        fileSize: 1024,
        totalBytes: 1024,
        mime: 'application/zip',
      },
      disabled,
    );
    const second = guard.reserve(
      {
        url: 'https://example.com/file.zip',
        finalUrl: 'https://example.com/file.zip',
        filename: 'file.zip',
        fileSize: 1024,
        totalBytes: 1024,
        mime: 'application/zip',
      },
      disabled,
    );

    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
  });
});
