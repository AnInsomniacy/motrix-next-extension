import type { DownloadSettings, ConnectionConfig, UiPrefs } from './types';

export const DEFAULT_CONNECTION_CONFIG: Readonly<ConnectionConfig> = {
  port: 16801,
  secret: '',
} as const;

export const DEFAULT_DOWNLOAD_SETTINGS: Readonly<DownloadSettings> = {
  enabled: true,
  minFileSize: 0,
  hideDownloadBar: false,
  autoLaunchApp: true,
} as const;

export const DEFAULT_UI_PREFS: Readonly<UiPrefs> = {
  theme: 'system',
  colorScheme: 'amber',
  locale: 'auto',
} as const;

/** Maximum number of diagnostic events to retain in storage. */
export const MAX_DIAGNOSTIC_EVENTS = 100;

/** HTTP timeout for API calls in milliseconds. */
export const API_TIMEOUT_MS = 5000;

/** Number of retry attempts for failed API calls. */
export const API_MAX_RETRIES = 1;

/** Interval for connection heartbeat checks in milliseconds. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/** URL schemes that the extension can intercept. */
export const INTERCEPTABLE_SCHEMES = ['http:', 'https:', 'ftp:'] as const;

/** URL schemes that should never be intercepted. */
export const NON_INTERCEPTABLE_SCHEMES = [
  'blob:',
  'data:',
  'chrome:',
  'chrome-extension:',
  'about:',
] as const;

/** The custom protocol for launching Motrix Next desktop app. */
export const MOTRIX_NEXT_PROTOCOL = 'motrixnext' as const;
