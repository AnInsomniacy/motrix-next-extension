/**
 * @fileoverview Composable for RPC connection testing.
 *
 * Encapsulates connection state (status, version, error, loading)
 * and the testConnection flow with minimum visual delay.
 */
import { ref, type Ref, type ComputedRef } from 'vue';
import { Aria2Client } from '@/modules/rpc/aria2-client';
import { ConnectionService, ConnectionStatus } from '@/modules/services/connection';
import type { RpcConfig } from '@/shared/types';

export function useConnectionTest(rpcConfig: Ref<RpcConfig> | ComputedRef<RpcConfig>) {
  const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
  const connectionVersion = ref<string | null>(null);
  const connectionError = ref<string | null>(null);
  const testingConnection = ref(false);

  async function testConnection(): Promise<void> {
    testingConnection.value = true;
    connectionError.value = null;

    const client = new Aria2Client(rpcConfig.value, { timeoutMs: 5000 });
    const svc = new ConnectionService(client);

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
