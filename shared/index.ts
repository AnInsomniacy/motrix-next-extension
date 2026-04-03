/**
 * @fileoverview Barrel exports for shared utilities.
 *
 * Re-exports all public APIs from the shared module so consumers can
 * use a single import path: `import { ... } from '@/shared'`.
 *
 * Note: `types.ts` is intentionally not re-exported here — consumers
 * should use `import type { ... } from '@/shared/types'` for clarity.
 */

// ─── Constants ──────────────────────────────────────────
export {
  DEFAULT_RPC_CONFIG,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_UI_PREFS,
} from './constants';

// ─── Utilities ──────────────────────────────────────────
export { extractFilenameFromUrl } from './url';
export { decodeThunderLink } from './thunder';

// ─── Error Types ────────────────────────────────────────
export {
  RpcError,
  RpcTimeoutError,
  RpcAuthError,
  RpcUnreachableError,
  DownloadError,
  PermissionError,
} from './errors';

// ─── Composables ────────────────────────────────────────
export { usePolling } from './use-polling';
export type { PollingOptions, PollingHandle, VisibilityApi } from './use-polling';
export { usePreferenceForm } from './use-preference-form';
export { useTheme } from './use-theme';
