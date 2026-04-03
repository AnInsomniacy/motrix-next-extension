/**
 * @fileoverview Composable for enhanced permissions management.
 *
 * Encapsulates grant/revoke lifecycle for optional chrome permissions
 * (cookies, downloads.ui, wildcard origins).
 */
import { ref } from 'vue';

const ENHANCED_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ['cookies', 'downloads.ui'],
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
