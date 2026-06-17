import { readFile } from 'node:fs/promises';

import {
  fetchJson,
  findZipByNamePart,
  isRecord,
  optionalEnv,
  requiredEnv,
  setOutput,
  stringField,
  numberField,
} from './workflow-utils';

type ChromeConfig = {
  clientId: string;
  clientSecret: string;
  extensionId: string;
  publisherId: string;
  refreshToken: string;
};

type ChromeRevision = {
  state: string;
  version: string;
};

type ChromeStoreStatus = {
  lastAsyncUploadState: string;
  published: ChromeRevision;
  submitted: ChromeRevision;
};

type ChromePublishDecision = {
  action: 'publish' | 'skip';
  outcome: string;
  reason: string;
};

export function readChromeStoreStatus(value: unknown): ChromeStoreStatus {
  return {
    lastAsyncUploadState: stringField(value, 'lastAsyncUploadState'),
    published: readChromeRevision(isRecord(value) ? value.publishedItemRevisionStatus : undefined),
    submitted: readChromeRevision(isRecord(value) ? value.submittedItemRevisionStatus : undefined),
  };
}

export function decideChromePublishAction(
  status: ChromeStoreStatus,
  targetVersion: string,
): ChromePublishDecision {
  if (status.published.version === targetVersion) {
    return {
      action: 'skip',
      outcome: 'skipped-version-exists',
      reason: `Chrome Web Store already has version ${targetVersion} live`,
    };
  }

  if (status.submitted.version === targetVersion && status.submitted.state !== 'PUBLISHED') {
    return {
      action: 'skip',
      outcome: 'skipped-pending-review',
      reason: `Chrome Web Store already has version ${targetVersion} submitted as ${status.submitted.state || 'unknown'}`,
    };
  }

  if (status.submitted.version && status.submitted.state !== 'PUBLISHED') {
    return {
      action: 'skip',
      outcome: 'skipped-pending-review',
      reason: `Chrome Web Store has version ${status.submitted.version} submitted as ${status.submitted.state || 'unknown'}`,
    };
  }

  return { action: 'publish', outcome: 'published', reason: 'Chrome Web Store can accept upload' };
}

export async function publishChromeFromEnv(): Promise<void> {
  const config = {
    clientId: requiredEnv('CHROME_CLIENT_ID'),
    clientSecret: requiredEnv('CHROME_CLIENT_SECRET'),
    extensionId: requiredEnv('CHROME_EXTENSION_ID'),
    publisherId: requiredEnv('CHROME_PUBLISHER_ID'),
    refreshToken: requiredEnv('CHROME_REFRESH_TOKEN'),
  };
  const version = requiredEnv('VERSION');
  const zipPath = optionalEnv('ZIP_PATH') || findZipByNamePart('chromium-mv3');
  const token = await getGoogleAccessToken(config);
  const status = await fetchChromeStatus(config, token);
  const decision = decideChromePublishAction(status, version);

  if (decision.action === 'skip') {
    console.log(`::notice::${decision.reason}`);
    setOutput('outcome', decision.outcome);
    return;
  }

  const upload = await uploadChromePackage({ config, token, zipPath });
  if (upload.uploadState !== 'SUCCEEDED') {
    const latestStatus = await fetchChromeStatus(config, token);
    throw new Error(formatChromeUploadFailure(upload.uploadState, latestStatus));
  }

  const publish = await publishChromeItem(config, token);
  console.log(`Chrome Web Store publish state: ${publish.state || 'unknown'}`);
  setOutput(
    'outcome',
    publish.state === 'PENDING_REVIEW' ? 'published-state-pending' : 'published',
  );
}

function readChromeRevision(revision: unknown): ChromeRevision {
  const channels =
    isRecord(revision) && Array.isArray(revision.distributionChannels)
      ? revision.distributionChannels
      : [];
  const channel =
    channels.find((candidate) => numberField(candidate, 'deployPercentage') === 100) ||
    channels.find((candidate) => isRecord(candidate)) ||
    {};
  return {
    state: stringField(revision, 'state'),
    version: stringField(channel, 'crxVersion'),
  };
}

async function getGoogleAccessToken(config: ChromeConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });
  const data = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = stringField(data, 'access_token');
  if (!token) throw new Error('Chrome OAuth token response did not include access_token');
  return token;
}

async function fetchChromeStatus(config: ChromeConfig, token: string): Promise<ChromeStoreStatus> {
  const response = await fetchJson(`${chromeItemUrl(config)}:fetchStatus`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readChromeStoreStatus(response);
}

async function uploadChromePackage(input: {
  config: ChromeConfig;
  token: string;
  zipPath: string;
}): Promise<{ uploadState: string }> {
  const response = await fetch(`${chromeUploadUrl(input.config)}:upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'X-Goog-Upload-Protocol': 'raw',
      'X-Goog-Upload-File-Name': 'extension.zip',
    },
    body: await readFile(input.zipPath),
  });
  const data = (await response.json()) as unknown;
  if (!response.ok) throw new Error(formatChromeApiError('Chrome Web Store upload failed', data));
  return { uploadState: stringField(data, 'uploadState') };
}

async function publishChromeItem(config: ChromeConfig, token: string): Promise<{ state: string }> {
  const response = await fetch(`${chromeItemUrl(config)}:publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  });
  const data = (await response.json()) as unknown;
  if (!response.ok) throw new Error(formatChromeApiError('Chrome Web Store publish failed', data));
  return { state: stringField(data, 'state') };
}

function chromeItemUrl(config: ChromeConfig): string {
  return `https://chromewebstore.googleapis.com/v2/${chromeItemName(config)}`;
}

function chromeUploadUrl(config: ChromeConfig): string {
  return `https://chromewebstore.googleapis.com/upload/v2/${chromeItemName(config)}`;
}

function chromeItemName(config: ChromeConfig): string {
  return `publishers/${config.publisherId}/items/${config.extensionId}`;
}

function formatChromeUploadFailure(uploadState: string, status: ChromeStoreStatus): string {
  return [
    `Chrome Web Store upload did not succeed: ${uploadState || 'unknown'}`,
    status.lastAsyncUploadState ? `lastAsyncUploadState=${status.lastAsyncUploadState}` : '',
    status.submitted.version
      ? `submitted=${status.submitted.version}/${status.submitted.state || 'unknown'}`
      : '',
    status.published.version
      ? `published=${status.published.version}/${status.published.state || 'unknown'}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function formatChromeApiError(prefix: string, data: unknown): string {
  const error = isRecord(data) ? data.error : undefined;
  const message = stringField(error, 'message') || JSON.stringify(data).slice(0, 500);
  return `${prefix}: ${message}`;
}

if (process.argv[1]?.endsWith('/publish-chrome.ts')) {
  publishChromeFromEnv().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
