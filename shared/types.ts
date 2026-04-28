// ─── Download Engine Types (used by download orchestrator) ──

export interface Aria2GlobalStat {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
  numStoppedTotal: string;
}

export interface Aria2Task {
  gid: string;
  status: 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';
  totalLength: string;
  completedLength: string;
  uploadLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  dir: string;
  files: Aria2File[];
  bittorrent?: { info?: { name?: string } };
  errorCode?: string;
  errorMessage?: string;
}

export interface Aria2File {
  index: string;
  path: string;
  length: string;
  completedLength: string;
  selected: string;
  uris: Array<{ status: string; uri: string }>;
}

export interface Aria2InputOptions {
  dir?: string;
  out?: string;
  header?: string[];
  referer?: string;
  'user-agent'?: string;
}

// ─── Connection Config Types ────────────────────────────

export interface ConnectionConfig {
  /** Port for the desktop app's HTTP API. */
  port: number;
  /** Shared secret for the HTTP API Bearer token auth. */
  secret: string;
}

// ─── Download Filter Types ──────────────────────────────

export interface FilterContext {
  url: string;
  finalUrl: string;
  filename: string;
  fileSize: number; // -1 = unknown
  mimeType: string;
  tabUrl: string;
  byExtensionId?: string;
}

export type FilterVerdict = 'intercept' | 'skip';

export interface FilterStage {
  readonly name: string;
  evaluate(ctx: FilterContext, config: DownloadSettings): FilterVerdict | null;
}

// ─── Extension Config Types ─────────────────────────────

export interface DownloadSettings {
  enabled: boolean;
  minFileSize: number; // MB, 0 = no limit
  hideDownloadBar: boolean;
  autoLaunchApp: boolean;
}

export interface SiteRule {
  id: string;
  pattern: string; // glob: "*.github.com", "drive.google.com"
  action: 'always-intercept' | 'always-skip' | 'use-global';
}

export interface UiPrefs {
  theme: 'system' | 'light' | 'dark';
  colorScheme: string;
  locale: string;
}

// ─── Diagnostic Log Types ───────────────────────────────

export type DiagnosticCode =
  // ── API connectivity ──────────────────────────────────
  | 'api_connected'
  | 'api_unreachable'
  | 'api_auth_failed'
  // ── Download interception lifecycle ───────────────────
  | 'download_intercepted'
  | 'download_skipped'
  | 'download_fallback'
  | 'download_failed'
  | 'download_routed'
  | 'download_cancel_failed'
  | 'download_handler_error'
  // ── Wake lifecycle ────────────────────────────────────
  | 'download_wake_attempt'
  | 'wake_success'
  | 'wake_timeout'
  // ── Cookie & permission ───────────────────────────────
  | 'cookie_collect_failed'
  | 'permission_granted'
  | 'permission_revoked'
  // ── Extension lifecycle ───────────────────────────────
  | 'extension_started'
  | 'extension_installed'
  | 'extension_updated'
  // ── Configuration ─────────────────────────────────────
  | 'config_loaded'
  | 'config_load_failed'
  | 'config_changed'
  // ── User-initiated actions ────────────────────────────
  | 'context_menu_triggered'
  | 'magnet_intercepted'
  // ── Infrastructure ────────────────────────────────────
  | 'storage_persist_failed'
  | 'storage_migrated'
  | 'download_bar_error'
  | 'tab_query_failed'
  // ── Notification ───────────────────────────────────────
  | 'notification_create_failed'
  | 'download_route_failed';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEvent {
  id: string;
  ts: number;
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  context?: Record<string, string | number | boolean>;
}

// ─── Download Metadata Types ────────────────────────────

export interface DownloadMetadata {
  filename: string;
  cookies: string | null;
  referer: string;
  userAgent?: string;
}
