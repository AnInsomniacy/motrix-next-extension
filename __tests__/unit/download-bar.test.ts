import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadBarService } from '@/lib/services/download-bar';

// ─── Tests ──────────────────────────────────────────────

describe('DownloadBarService', () => {
  let setUiOptions: ReturnType<typeof vi.fn<(options: { enabled: boolean }) => Promise<void>>>;
  let service: DownloadBarService;

  beforeEach(() => {
    setUiOptions = vi
      .fn<(options: { enabled: boolean }) => Promise<void>>()
      .mockResolvedValue(undefined);
    service = new DownloadBarService({ setUiOptions });
  });

  describe('apply', () => {
    it('hides download bar when hideDownloadBar is true', async () => {
      await service.apply({ hideDownloadBar: true });

      expect(setUiOptions).toHaveBeenCalledWith({ enabled: false });
    });

    it('shows download bar when hideDownloadBar is false', async () => {
      await service.apply({ hideDownloadBar: false });

      expect(setUiOptions).toHaveBeenCalledWith({ enabled: true });
    });

    it('does not throw when setUiOptions fails (graceful degradation)', async () => {
      setUiOptions.mockRejectedValueOnce(new Error('API not available'));

      await expect(service.apply({ hideDownloadBar: true })).resolves.not.toThrow();
    });
  });
});
