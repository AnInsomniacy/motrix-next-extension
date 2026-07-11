export interface RequestHeader {
  name: string;
  value: string;
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
  totalBytes: number; // -1 = unknown
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
  hideDownloadBar: boolean;
  desktopUnavailable: DesktopUnavailableSettings;
  forwardRequestHeaders: boolean;
  forwardCookies: boolean;
  duplicateGuard: DuplicateDownloadGuardSettings;
  minimumFileSize: MinimumFileSizeSettings;
  fileExtensionRule: FileExtensionRuleSettings;
  interceptionScope: InterceptionScope;
}

export type DesktopUnavailableAction = 'launch' | 'browser';

export interface DesktopUnavailableSettings {
  action: DesktopUnavailableAction;
  startupTimeoutSeconds: number;
}

export interface DuplicateDownloadGuardSettings {
  enabled: boolean;
  windowSeconds: number;
}

export interface MinimumFileSizeSettings {
  enabled: boolean;
  sizeMb: number;
  unknownSizeAction: 'intercept' | 'skip';
}

export type FileExtensionRuleAction = 'intercept' | 'skip';

export interface FileExtensionRuleSettings {
  enabled: boolean;
  extensions: string[];
  listedAction: FileExtensionRuleAction;
  unknownAction: FileExtensionRuleAction;
}

export interface InterceptionScope {
  browserDownloads: boolean;
  magnet: boolean;
  ed2k: boolean;
  thunder: boolean;
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
  | 'download_duplicate_blocked'
  | 'download_cancel_failed'
  | 'download_handler_error'
  | 'request_headers_listener_ready'
  | 'request_headers_listener_downgraded'
  | 'request_headers_listener_failed'
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
  | 'protocol_intercepted'
  // ── Infrastructure ────────────────────────────────────
  | 'storage_persist_failed'
  | 'download_bar_error'
  // ── Notification ───────────────────────────────────────
  | 'notification_create_failed';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEvent {
  id: string;
  ts: number;
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  context?: Record<string, string | number | boolean>;
}
