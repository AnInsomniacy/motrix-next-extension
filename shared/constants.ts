import type { DownloadSettings, RpcConfig, UiPrefs } from './types';

export const DEFAULT_RPC_CONFIG: Readonly<RpcConfig> = {
  host: '127.0.0.1',
  port: 16800,
  secret: '',
  apiPort: 16801,
  apiSecret: '',
} as const;

export const DEFAULT_DOWNLOAD_SETTINGS: Readonly<DownloadSettings> = {
  enabled: true,
  minFileSize: 0,
  fallbackToBrowser: true,
  hideDownloadBar: false,
  notifyOnStart: true,
  notifyOnComplete: false,
  autoLaunchApp: true,
} as const;

export const DEFAULT_UI_PREFS: Readonly<UiPrefs> = {
  theme: 'system',
  colorScheme: 'amber',
  locale: 'auto',
} as const;

/** Maximum number of diagnostic events to retain in storage. */
export const MAX_DIAGNOSTIC_EVENTS = 30;

/** HTTP timeout for API calls in milliseconds. */
export const RPC_TIMEOUT_MS = 5000;

/** Number of retry attempts for failed API calls. */
export const RPC_MAX_RETRIES = 1;

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
