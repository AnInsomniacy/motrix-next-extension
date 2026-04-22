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

    it('throws when setUiOptions fails (caller handles graceful degradation)', async () => {
      setUiOptions.mockRejectedValueOnce(new Error('API not available'));

      await expect(service.apply({ hideDownloadBar: true })).rejects.toThrow('API not available');
    });
  });
});
