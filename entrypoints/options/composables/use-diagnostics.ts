/**
 * @fileoverview Composable for diagnostic event log operations.
 *
 * Encapsulates diagnostic events state, hydration from storage,
 * clipboard copy, and clear with immediate persistence via StorageService.
 */
import { ref } from 'vue';
import type { StorageService } from '@/modules/storage';
import type { DiagnosticEvent } from '@/shared/types';

export function useDiagnostics(storageService: StorageService) {
  const diagnosticEvents = ref<DiagnosticEvent[]>([]);

  function hydrate(events: DiagnosticEvent[]): void {
    diagnosticEvents.value = events;
  }

  function copyDiagnosticLog(): void {
    const json = JSON.stringify(diagnosticEvents.value, null, 2);
    void navigator.clipboard.writeText(json);
  }

  function clearDiagnosticLog(): void {
    diagnosticEvents.value = [];
    void storageService.saveDiagnosticLog([]);
  }

  return { diagnosticEvents, hydrate, copyDiagnosticLog, clearDiagnosticLog };
}
