/** Session storage survives worker suspension without writing credentials to disk. */
import { z } from 'zod';
import type { ConnectionConfig } from '../schema';
import { AddDownloadRequestSchema, type AddDownloadRequest } from './contracts';
const PREFIX = 'pending-download:';
const PendingDownloadSchema = z.object({
  request: AddDownloadRequestSchema,
  connection: z.object({ port: z.number(), secret: z.string() }),
});
export async function rememberDownload(request: AddDownloadRequest, connection: ConnectionConfig) {
  await browser.storage.session.set({ [PREFIX + request.id]: { request, connection } });
}
export async function forgetDownload(id: string) {
  await browser.storage.session.remove(PREFIX + id);
}
export async function pendingDownloads(
  connection: ConnectionConfig,
): Promise<AddDownloadRequest[]> {
  const entries = await browser.storage.session.get(null);
  return Object.entries(entries).flatMap(([key, value]) => {
    if (!key.startsWith(PREFIX)) return [];
    const parsed = PendingDownloadSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.connection.port !== connection.port ||
      parsed.data.connection.secret !== connection.secret
    )
      return [];
    return [parsed.data.request];
  });
}
