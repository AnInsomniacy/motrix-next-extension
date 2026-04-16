/**
 * @fileoverview Composable for enhanced permissions management.
 *
 * Encapsulates grant/revoke lifecycle for optional browser permissions.
 * On Chromium: cookies + downloads.ui + wildcard origins.
 * On Firefox: cookies + wildcard origins (downloads.ui is unsupported).
 */
import { ref } from 'vue';

// downloads.ui is Chromium-only (used for setUiOptions to hide download bar).
// Firefox does not support this permission, so it must be excluded.
const ENHANCED_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: import.meta.env.FIREFOX ? ['cookies'] : ['cookies', 'downloads.ui'],
  origins: ['https://*/*', 'http://*/*'],
};

export function useEnhancedPermissions() {
  const enhancedGranted = ref(false);

  async function checkPermissions(): Promise<void> {
    try {
      enhancedGranted.value = await chrome.permissions.contains(ENHANCED_PERMISSIONS);
    } catch {
      enhancedGranted.value = false;
    }
  }

  async function grantEnhanced(): Promise<void> {
    try {
      const granted = await chrome.permissions.request(ENHANCED_PERMISSIONS);
      enhancedGranted.value = granted;
    } catch {
      enhancedGranted.value = false;
    }
  }

  async function revokeEnhanced(): Promise<void> {
    try {
      await chrome.permissions.remove(ENHANCED_PERMISSIONS);
      enhancedGranted.value = false;
    } catch {
      // silent
    }
  }

  return { enhancedGranted, checkPermissions, grantEnhanced, revokeEnhanced };
}
