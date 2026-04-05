/** Base class for all extension errors. */
export class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

/** Aria2 RPC communication errors. */
export class RpcError extends ExtensionError {
  constructor(
    message: string,
    public readonly rpcCode?: number,
    cause?: unknown,
  ) {
    super(message, 'RPC_ERROR', cause);
    this.name = 'RpcError';
  }
}

/** RPC endpoint is unreachable (network error, timeout). */
export class RpcUnreachableError extends RpcError {
  constructor(cause?: unknown) {
    super('Cannot connect to Motrix Next RPC', -1, cause);
    this.name = 'RpcUnreachableError';
  }
}

/** RPC secret is incorrect. */
export class RpcAuthError extends RpcError {
  constructor() {
    super('RPC secret is incorrect', 7);
    this.name = 'RpcAuthError';
  }
}

/** RPC call timed out. */
export class RpcTimeoutError extends RpcError {
  constructor(timeoutMs: number) {
    super(`RPC call timed out after ${timeoutMs}ms`, -2);
    this.name = 'RpcTimeoutError';
  }
}

/** Download interception errors. */
export class DownloadError extends ExtensionError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DOWNLOAD_ERROR', cause);
    this.name = 'DownloadError';
  }
}

/** Permission not granted for an operation. */
export class PermissionError extends ExtensionError {
  constructor(permission: string) {
    super(`Permission not granted: ${permission}`, 'PERMISSION_ERROR');
    this.name = 'PermissionError';
  }
}

/**
 * URL points to a document page (text/html) rather than a downloadable file.
 *
 * Thrown by sendUrl when HEAD resolution discovers the target is a webpage —
 * e.g. cloud storage landing pages that use JavaScript to generate the actual
 * download link. The caller should open this URL in the browser so that the
 * page's JavaScript executes and triggers the real download, which will be
 * intercepted by handleCreated().
 */
export class DocumentUrlError extends ExtensionError {
  constructor(public readonly documentUrl: string) {
    super(`URL is a document page, not a downloadable file: ${documentUrl}`, 'DOCUMENT_URL_ERROR');
    this.name = 'DocumentUrlError';
  }
}
