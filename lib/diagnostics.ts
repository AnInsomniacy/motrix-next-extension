import {
  DIAGNOSTIC_CONTEXT_KEY_MAX_LENGTH,
  DIAGNOSTIC_CONTEXT_MAX_FIELDS,
  DIAGNOSTIC_CONTEXT_VALUE_MAX_LENGTH,
  DIAGNOSTIC_MESSAGE_MAX_LENGTH,
  type DiagnosticCode,
  type DiagnosticEvent,
  type DiagnosticLevel,
} from './schema';

const URL_CONTEXT_KEYS = new Set(['url', 'finalUrl', 'tabUrl', 'pageUrl', 'referer']);

export interface DiagnosticInput {
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  context?: Record<string, string | number | boolean>;
}

export interface DiagnosticJournalOptions {
  load: () => Promise<DiagnosticEvent[]>;
  save: (events: DiagnosticEvent[]) => Promise<void>;
  maxEvents: number;
  now?: () => number;
  onPersistError?: (error: unknown) => void;
}

export interface DiagnosticJournal {
  initialize: () => Promise<void>;
  append: (input: DiagnosticInput) => void;
  clear: () => Promise<void>;
  flush: () => Promise<void>;
  getAll: () => DiagnosticEvent[];
  setMaxEvents: (maxEvents: number) => void;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function sanitizeText(value: string, max: number): string {
  const singleLine = value.replace(/[\r\n\t]+/g, ' ').trim();
  const withoutRawUrls = singleLine.replace(/\b(?:https?|magnet|ed2k|thunder):[^\s]+/gi, (url) =>
    sanitizeDiagnosticUrl(url),
  );
  return truncate(withoutRawUrls, max);
}

export function sanitizeDiagnosticUrl(value: string): string {
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (protocol && !['http', 'https'].includes(protocol)) return `${protocol}:[redacted]`;

  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}

function sanitizeContext(
  context: DiagnosticInput['context'],
): DiagnosticEvent['context'] | undefined {
  if (!context) return undefined;

  const entries = Object.entries(context)
    .slice(0, DIAGNOSTIC_CONTEXT_MAX_FIELDS)
    .map(([rawKey, rawValue]) => {
      const key = sanitizeText(rawKey, DIAGNOSTIC_CONTEXT_KEY_MAX_LENGTH);
      if (typeof rawValue !== 'string') return [key, rawValue] as const;
      const value = URL_CONTEXT_KEYS.has(key)
        ? truncate(sanitizeDiagnosticUrl(rawValue), DIAGNOSTIC_CONTEXT_VALUE_MAX_LENGTH)
        : sanitizeText(rawValue, DIAGNOSTIC_CONTEXT_VALUE_MAX_LENGTH);
      return [key, value] as const;
    })
    .filter(([key]) => key.length > 0);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function createEvent(input: DiagnosticInput, now: number, sequence: number): DiagnosticEvent {
  const context = sanitizeContext(input.context);
  return {
    id: `diag_${now.toString(36)}_${sequence.toString(36)}`,
    ts: now,
    level: input.level,
    code: input.code,
    message: sanitizeText(input.message, DIAGNOSTIC_MESSAGE_MAX_LENGTH) || input.code,
    ...(context ? { context } : {}),
  };
}

export function createDiagnosticJournal(options: DiagnosticJournalOptions): DiagnosticJournal {
  const now = options.now ?? Date.now;
  let maxEvents = options.maxEvents;
  let events: DiagnosticEvent[] = [];
  let pendingBeforeInitialization: DiagnosticEvent[] = [];
  let initialization: Promise<void> | null = null;
  let initialized = false;
  let sequence = 0;
  let mutation = 0;
  let persistedMutation = 0;
  let persistence: Promise<void> | null = null;
  let lastPersistError: unknown = null;

  function retainLatest(input: DiagnosticEvent[]): DiagnosticEvent[] {
    return input.slice(-maxEvents);
  }

  function schedulePersistence(): Promise<void> {
    if (!initialized) return Promise.resolve();
    if (persistence) return persistence;

    persistence = (async () => {
      while (persistedMutation < mutation) {
        const targetMutation = mutation;
        const snapshot = [...events];
        try {
          await options.save(snapshot);
          lastPersistError = null;
        } catch (error) {
          lastPersistError = error;
          options.onPersistError?.(error);
        }
        persistedMutation = targetMutation;
      }
    })().finally(() => {
      persistence = null;
      if (persistedMutation < mutation) void schedulePersistence();
    });
    return persistence;
  }

  function mutate(nextEvents: DiagnosticEvent[]): void {
    events = retainLatest(nextEvents);
    mutation += 1;
    void schedulePersistence();
  }

  function initialize(): Promise<void> {
    initialization ??= (async () => {
      let stored: DiagnosticEvent[] = [];
      try {
        stored = await options.load();
      } catch (error) {
        options.onPersistError?.(error);
      }
      events = retainLatest([...stored, ...pendingBeforeInitialization]);
      const hadPending = pendingBeforeInitialization.length > 0;
      pendingBeforeInitialization = [];
      initialized = true;
      if (hadPending || events.length !== stored.length) {
        mutation += 1;
        await schedulePersistence();
      }
    })();
    return initialization;
  }

  function append(input: DiagnosticInput): void {
    const event = createEvent(input, now(), ++sequence);
    if (!initialized) {
      pendingBeforeInitialization.push(event);
      return;
    }
    mutate([...events, event]);
  }

  async function clear(): Promise<void> {
    await initialize();
    mutate([]);
    await flush();
  }

  async function flush(): Promise<void> {
    await initialize();
    while (persistedMutation < mutation || persistence) {
      await schedulePersistence();
    }
    if (lastPersistError) throw lastPersistError;
  }

  function setMaxEvents(value: number): void {
    if (value === maxEvents) return;
    maxEvents = value;
    if (initialized && events.length > maxEvents) mutate(events);
  }

  return {
    initialize,
    append,
    clear,
    flush,
    getAll: () => [...events],
    setMaxEvents,
  };
}
