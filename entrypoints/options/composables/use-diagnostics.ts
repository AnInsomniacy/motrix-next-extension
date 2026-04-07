/**
 * @fileoverview Composable for diagnostic event log operations.
 *
 * Encapsulates diagnostic events state, hydration from storage,
 * clipboard copy, export report, and clear with immediate
 * persistence via StorageService.
 */
import { ref } from 'vue';
import type { StorageService } from '@/lib/storage';
import type { DiagnosticEvent } from '@/shared/types';

export function useDiagnostics(storageService: StorageService) {
  const diagnosticEvents = ref<DiagnosticEvent[]>([]);

  function hydrate(events: DiagnosticEvent[]): void {
    diagnosticEvents.value = events;
  }

  function clearDiagnosticLog(): void {
    diagnosticEvents.value = [];
    void storageService.saveDiagnosticLog([]);
  }

  /**
   * Export a complete diagnostic report as a downloadable JSON file.
   *
   * Includes extension version, browser info, all configuration
   * (except RPC secret), and the full diagnostic event log.
   */
  async function exportDiagnosticReport(): Promise<void> {
    const data = await storageService.load();

    const report = {
      exportedAt: new Date().toISOString(),
      extension: {
        version: chrome.runtime.getManifest().version,
        manifestVersion: chrome.runtime.getManifest().manifest_version,
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
      },
      config: {
        rpc: { host: data.rpc.host, port: data.rpc.port },
        settings: data.settings,
        siteRules: data.siteRules,
        uiPrefs: data.uiPrefs,
      },
      diagnosticLog: data.diagnosticLog,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `motrix-next-diagnostic-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    diagnosticEvents,
    hydrate,
    clearDiagnosticLog,
    exportDiagnosticReport,
  };
}
