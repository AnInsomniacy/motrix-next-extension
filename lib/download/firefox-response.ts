import type { DownloadCandidate } from './orchestrator';
import { normalizeFilename, type FilenameMetadata } from './filename-metadata';
import { parseContentDispositionHeader } from '@/shared/url';

export interface FirefoxResponseHeader {
  name?: string;
  value?: string;
}

export interface FirefoxResponseDetails {
  url: string;
  method: string;
  type: string;
  statusCode: number;
  originUrl?: string;
  documentUrl?: string;
  responseHeaders?: FirefoxResponseHeader[];
}

export interface FirefoxDownloadResponse {
  item: DownloadCandidate;
  metadata?: FilenameMetadata;
}

function headerValue(headers: FirefoxResponseHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name)?.value?.trim() ?? '';
}

function contentLength(headers: FirefoxResponseHeader[] | undefined): number {
  const value = Number.parseInt(headerValue(headers, 'content-length'), 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

export function parseFirefoxDownloadResponse(
  details: FirefoxResponseDetails,
): FirefoxDownloadResponse | null {
  if (details.method !== 'GET') return null;
  if (details.type !== 'main_frame' && details.type !== 'sub_frame') return null;
  if (details.statusCode < 200 || details.statusCode >= 300) return null;

  const disposition = parseContentDispositionHeader(
    headerValue(details.responseHeaders, 'content-disposition'),
  );
  if (disposition?.type !== 'attachment') return null;

  const filename = disposition.filename ? normalizeFilename(disposition.filename) : '';
  const size = contentLength(details.responseHeaders);

  return {
    item: {
      url: details.url,
      finalUrl: details.url,
      filename,
      fileSize: size,
      totalBytes: size,
      mime: headerValue(details.responseHeaders, 'content-type'),
      referrer: details.originUrl || details.documentUrl || '',
    },
    ...(filename
      ? {
          metadata: {
            filename,
            source: 'content-disposition',
          },
        }
      : {}),
  };
}
