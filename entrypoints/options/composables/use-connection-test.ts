/**
 * @fileoverview Composable for API connection testing.
 *
 * Encapsulates connection state (status, version, error, loading)
 * and the testConnection flow with minimum visual delay.
 */
import { ref, type Ref, type ComputedRef } from 'vue';
import { DesktopApiClient } from '@/lib/rpc';
import { ConnectionService, ConnectionStatus } from '@/lib/services';
import type { RpcConfig } from '@/shared/types';

export function useConnectionTest(rpcConfig: Ref<RpcConfig> | ComputedRef<RpcConfig>) {
  const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
  const connectionVersion = ref<string | null>(null);
  const connectionError = ref<string | null>(null);
  const testingConnection = ref(false);

  async function testConnection(): Promise<void> {
    testingConnection.value = true;
    connectionError.value = null;

    const apiClient = new DesktopApiClient({
      port: rpcConfig.value.apiPort,
      secret: rpcConfig.value.apiSecret,
    });
    const svc = new ConnectionService(apiClient);

    // Minimum 600ms so loading animation doesn't flash on fast local connections
    const minDelay = new Promise((r) => setTimeout(r, 600));
    const [result] = await Promise.all([svc.checkConnection(), minDelay]);

    connectionStatus.value = result.status;
    connectionVersion.value = result.version;
    connectionError.value = result.error ?? null;
    testingConnection.value = false;
  }

  return {
    connectionStatus,
    connectionVersion,
    connectionError,
    testingConnection,
    testConnection,
  };
}
