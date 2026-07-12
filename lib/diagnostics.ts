import type { DiagnosticCode, DiagnosticEvent, DiagnosticLevel } from './schema';

/** Maximum number of diagnostic events retained in memory and storage. */
export const MAX_DIAGNOSTIC_EVENTS = 100;

export interface DiagnosticInput {
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  context?: Record<string, string | number | boolean>;
}

/**
 * In-memory ring buffer for diagnostic events. Pure data structure —
 * persistence is the caller's concern.
 */
export class DiagnosticLog {
  private events: DiagnosticEvent[] = [];
  private counter = 0;

  constructor(private readonly max: number = MAX_DIAGNOSTIC_EVENTS) {}

  append(input: DiagnosticInput): void {
    this.events.push({
      ...input,
      id: `diag_${++this.counter}_${Date.now().toString(36)}`,
      ts: Date.now(),
    });
    if (this.events.length > this.max) {
      this.events.splice(0, this.events.length - this.max);
    }
  }

  getAll(): DiagnosticEvent[] {
    return [...this.events];
  }

  /** Restore events from storage, keeping only the newest `max`. */
  hydrate(events: DiagnosticEvent[]): void {
    this.events = events.slice(-this.max);
  }
}
