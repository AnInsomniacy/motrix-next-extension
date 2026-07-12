import type { DiagnosticEvent, DiagnosticCode, DiagnosticLevel } from '@/shared/types';
import { MAX_DIAGNOSTIC_EVENTS } from '@/shared/constants';

// ─── Input Type ─────────────────────────────────────────

export interface DiagnosticInput {
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  context?: Record<string, string | number | boolean>;
}

// ─── Diagnostic Log ─────────────────────────────────────

/**
 * In-memory ring buffer for diagnostic events.
 *
 * Design:
 * - Pure data structure, no chrome.storage dependency
 * - Serializable: toJSON() for clipboard copy, hydrate() for storage restore
 * - Oldest events evicted first when capacity is exceeded
 */
export class DiagnosticLog {
  private events: DiagnosticEvent[] = [];
  private readonly max: number;
  private counter = 0;

  constructor(maxEvents: number = MAX_DIAGNOSTIC_EVENTS) {
    this.max = maxEvents;
  }

  /** Append a diagnostic event with auto-generated id and timestamp. */
  append(input: DiagnosticInput): void {
    const event: DiagnosticEvent = {
      id: this.generateId(),
      ts: Date.now(),
      level: input.level,
      code: input.code,
      message: input.message,
      context: input.context,
    };

    this.events.push(event);

    if (this.events.length > this.max) {
      this.events.splice(0, this.events.length - this.max);
    }
  }

  /** Return a copy of all events in chronological order. */
  getAll(): DiagnosticEvent[] {
    return [...this.events];
  }

  /** Remove all events. */
  clear(): void {
    this.events = [];
  }

  /** Serialize all events to JSON string. */
  toJSON(): string {
    return JSON.stringify(this.events);
  }

  /** Restore events from a previously serialized array (e.g. from storage). */
  hydrate(events: DiagnosticEvent[]): void {
    if (events.length > this.max) {
      this.events = events.slice(events.length - this.max);
    } else {
      this.events = [...events];
    }
  }

  private generateId(): string {
    return `diag_${++this.counter}_${Date.now().toString(36)}`;
  }
}
