import type { Aria2Version } from '@/shared/types';

export enum ConnectionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
}

export interface ConnectionResult {
  status: ConnectionStatus;
  version: string | null;
  error?: string;
}

interface Aria2VersionClient {
  getVersion: () => Promise<Aria2Version>;
}

/**
 * Checks connectivity to the aria2 RPC endpoint.
 * Stateless — call checkConnection() on demand.
 */
export class ConnectionService {
  private readonly client: Aria2VersionClient;

  constructor(client: Aria2VersionClient) {
    this.client = client;
  }

  async checkConnection(): Promise<ConnectionResult> {
    try {
      const info = await this.client.getVersion();
      return { status: ConnectionStatus.Connected, version: info.version };
    } catch (error) {
      // Use error.name (manually set in our error constructors) instead of
      // error.constructor.name (which gets minified by esbuild/Vite).
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      return {
        status: ConnectionStatus.Disconnected,
        version: null,
        error: errorType,
      };
    }
  }
}
