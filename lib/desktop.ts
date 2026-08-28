/** Native Messaging activation and readiness coordination for Motrix Next. */
import { z } from 'zod';

z.config({ jitless: true });

export const MOTRIX_NEXT_NATIVE_HOST = 'com.motrix.next.browser';

const NativeHostErrorCodeSchema = z.enum([
  'untrusted_caller',
  'incomplete_frame',
  'invalid_size',
  'invalid_request',
  'activation_failed',
  'response_failed',
]);

const NativeHostResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), error: NativeHostErrorCodeSchema }),
]);

export type NativeHostErrorCode = z.output<typeof NativeHostErrorCodeSchema>;
export type NativeMessageSender = (hostName: string, message: object) => Promise<unknown>;

export class DesktopActivationError extends Error {
  constructor(
    public readonly code: NativeHostErrorCode | 'host_unavailable' | 'invalid_response',
    public readonly cause?: unknown,
  ) {
    super(`Motrix Next activation failed: ${code}`);
    this.name = 'DesktopActivationError';
  }
}

/** Activate Motrix Next through its allowlisted one-shot native host. */
export async function activateDesktop(sendNativeMessage: NativeMessageSender): Promise<void> {
  let rawResponse: unknown;
  try {
    rawResponse = await sendNativeMessage(MOTRIX_NEXT_NATIVE_HOST, { action: 'activate' });
  } catch (error) {
    throw new DesktopActivationError('host_unavailable', error);
  }

  const response = NativeHostResponseSchema.safeParse(rawResponse);
  if (!response.success) throw new DesktopActivationError('invalid_response', response.error);
  if (!response.data.ok) throw new DesktopActivationError(response.data.error);
}

export interface DesktopActivationOptions {
  /** Activate the desktop app through Native Messaging. */
  activate: () => Promise<void>;
  /** Return true when both the desktop app and its engine are ready. */
  checkReady: () => Promise<boolean>;
  /** Maximum time to wait for readiness. */
  maxWaitMs: number;
  /** Interval between readiness checks. */
  pollIntervalMs?: number;
}

export type ActivateDesktopAndWait = (options: DesktopActivationOptions) => Promise<boolean>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function checkReadySafely(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

async function activateAndWaitForApi(options: DesktopActivationOptions): Promise<boolean> {
  if (await checkReadySafely(options.checkReady)) return true;

  await options.activate();
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const deadline = Date.now() + options.maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    if (await checkReadySafely(options.checkReady)) return true;
  }
  return false;
}

/** Create one coordinator that coalesces concurrent activation attempts. */
export function createDesktopActivationCoordinator(): ActivateDesktopAndWait {
  let pending: Promise<boolean> | null = null;

  return (options) => {
    if (pending) return pending;
    pending = activateAndWaitForApi(options).finally(() => {
      pending = null;
    });
    return pending;
  };
}
