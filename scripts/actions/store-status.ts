import crypto from 'node:crypto';
import zlib from 'node:zlib';

import {
  appendStepSummary,
  configured,
  escapeCode,
  fetchJson,
  fetchText,
  isRecord,
  md,
  numberField,
  optionalEnv,
  requiredEnv,
  stringField,
} from './workflow-utils';

export type StoreStatusRow = {
  store: string;
  liveVersion: string;
  pendingVersion: string;
  reviewState: string;
  canPublishNow: 'Yes' | 'No' | 'Unknown';
  rawStatus: string;
  notes: string;
};

type StoreStatusReportInput = {
  checkedAt: string;
  releaseTag: string;
  releaseVersion: string;
  stores: StoreStatusRow[];
};

type ChromeConfig = {
  clientId: string;
  clientSecret: string;
  extensionId: string;
  publisherId: string;
  refreshToken: string;
};

type FirefoxConfig = {
  apiKey: string;
  apiSecret: string;
  slug: string;
};

type EdgeConfig = {
  apiKey: string;
  clientId: string;
  extensionId: string;
  operationId: string;
  operationRunId: string;
  operationSubmittedAt: string;
  operationVersion: string;
  productId: string;
};

export async function runStoreStatusFromEnv(): Promise<void> {
  const releaseTag = requiredEnv('RELEASE_TAG');
  const releaseVersion = requiredEnv('RELEASE_VERSION');
  const checkedAt = new Date().toISOString();
  const stores = await Promise.all([
    withStoreError('Chrome Web Store', () =>
      checkChrome({
        clientId: optionalEnv('CHROME_CLIENT_ID'),
        clientSecret: optionalEnv('CHROME_CLIENT_SECRET'),
        extensionId: optionalEnv('CHROME_EXTENSION_ID'),
        publisherId: optionalEnv('CHROME_PUBLISHER_ID'),
        refreshToken: optionalEnv('CHROME_REFRESH_TOKEN'),
      }),
    ),
    withStoreError('Firefox AMO', () =>
      checkFirefox({
        apiKey: optionalEnv('FIREFOX_API_KEY'),
        apiSecret: optionalEnv('FIREFOX_API_SECRET'),
        slug: optionalEnv('FIREFOX_ADDON_SLUG') || 'motrix-next-extension',
      }),
    ),
    withStoreError('Edge Add-ons', () =>
      checkEdge({
        apiKey: optionalEnv('EDGE_API_KEY'),
        clientId: optionalEnv('EDGE_CLIENT_ID'),
        extensionId: optionalEnv('EDGE_EXTENSION_ID'),
        operationId: optionalEnv('EDGE_LAST_OPERATION_ID'),
        operationRunId: optionalEnv('EDGE_LAST_OPERATION_RUN_ID'),
        operationSubmittedAt: optionalEnv('EDGE_LAST_OPERATION_SUBMITTED_AT'),
        operationVersion: optionalEnv('EDGE_LAST_OPERATION_VERSION'),
        productId: optionalEnv('EDGE_PRODUCT_ID'),
      }),
    ),
  ]);

  const report = renderStoreStatusReport({ checkedAt, releaseTag, releaseVersion, stores });
  appendStepSummary(report);
  console.log(report);
}

export function renderStoreStatusReport(input: StoreStatusReportInput): string {
  const decision = buildDecision(input.releaseVersion, input.stores);
  const lines = [
    '## Store Release Status',
    '',
    `Release: ${input.releaseTag}`,
    `Checked at: ${input.checkedAt}`,
    '',
    '| Store | Live version | Pending version | Review state | Can publish now |',
    '|---|---:|---:|---|---|',
    ...input.stores.map(
      (store) =>
        `| ${store.store} | ${md(store.liveVersion)} | ${md(store.pendingVersion)} | ${md(store.reviewState)} | ${md(store.canPublishNow)} |`,
    ),
    '',
    '### Details',
    '',
    '| Store | Raw status | Notes |',
    '|---|---|---|',
    ...input.stores.map(
      (store) => `| ${store.store} | \`${escapeCode(store.rawStatus)}\` | ${md(store.notes)} |`,
    ),
    '',
    '### Decision',
    '',
    decision,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function buildDecision(releaseVersion: string, stores: StoreStatusRow[]): string {
  const blockers = stores.filter((store) => store.canPublishNow === 'No');
  const behind = stores.filter(
    (store) => isVersion(store.liveVersion) && store.liveVersion !== releaseVersion,
  );
  const unknown = stores.filter((store) => store.canPublishNow === 'Unknown');

  if (blockers.length > 0) {
    return `Do not submit another release yet. ${storeNames(blockers)} already has an active submission or review blocker.`;
  }

  if (behind.length > 0 || unknown.length > 0) {
    return [
      'Review before publishing.',
      `Stores behind the target release: ${storeNames(behind) || 'none'}.`,
      `Stores with incomplete publishability data: ${storeNames(unknown) || 'none'}.`,
    ].join(' ');
  }

  return 'All checked stores match the target release and no active review blocker was detected.';
}

async function withStoreError(
  name: string,
  fn: () => Promise<StoreStatusRow>,
): Promise<StoreStatusRow> {
  try {
    return await fn();
  } catch (error) {
    return {
      store: name,
      liveVersion: 'Unavailable',
      pendingVersion: 'Unavailable',
      reviewState: 'Unavailable',
      canPublishNow: 'Unknown',
      rawStatus: error instanceof Error ? error.message : String(error),
      notes: 'Status query failed.',
    };
  }
}

async function checkChrome(chrome: ChromeConfig): Promise<StoreStatusRow> {
  const publicVersion = await getChromePublicVersion(chrome.extensionId);
  if (
    !configured(chrome.publisherId) ||
    !configured(chrome.clientId) ||
    !configured(chrome.clientSecret) ||
    !configured(chrome.refreshToken)
  ) {
    return {
      store: 'Chrome Web Store',
      liveVersion: publicVersion || 'Unavailable',
      pendingVersion: 'Not checked',
      reviewState: 'Not checked',
      canPublishNow: 'Unknown',
      rawStatus: 'missing Chrome publisher id or OAuth secrets',
      notes:
        'Public version was checked. Review status requires Chrome Web Store API v2 credentials.',
    };
  }

  const token = await getGoogleAccessToken(chrome);
  const name = `publishers/${chrome.publisherId}/items/${chrome.extensionId}`;
  const status = await fetchJson(`https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const published = getChromeRevision(
    isRecord(status) ? status.publishedItemRevisionStatus : undefined,
  );
  const submitted = getChromeRevision(
    isRecord(status) ? status.submittedItemRevisionStatus : undefined,
  );
  const liveVersion = published.version || publicVersion || 'Unavailable';
  const pendingVersion =
    submitted.version && submitted.version !== liveVersion ? submitted.version : '-';
  const reviewState = mapChromeState(submitted.state || published.state);
  const canPublishNow = submitted.version && submitted.state !== 'PUBLISHED' ? 'No' : 'Yes';

  return {
    store: 'Chrome Web Store',
    liveVersion,
    pendingVersion,
    reviewState,
    canPublishNow,
    rawStatus: [
      `published=${published.state || 'unset'}`,
      `submitted=${submitted.state || 'unset'}`,
      isRecord(status) && status.warned === true ? 'warned=true' : '',
      isRecord(status) && status.takenDown === true ? 'takenDown=true' : '',
    ]
      .filter(Boolean)
      .join(', '),
    notes:
      isRecord(status) && status.takenDown === true
        ? 'Item is taken down.'
        : isRecord(status) && status.warned === true
          ? 'Item has a policy warning.'
          : 'Chrome API status fetched.',
  };
}

async function getGoogleAccessToken(chrome: ChromeConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: chrome.clientId,
    client_secret: chrome.clientSecret,
    refresh_token: chrome.refreshToken,
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

function getChromeRevision(revision: unknown): { state: string; version: string } {
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

async function getChromePublicVersion(extensionId: string): Promise<string> {
  if (!configured(extensionId)) return '';
  const url = `https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=146.0.0.0&acceptformat=crx3&x=id%3D${encodeURIComponent(extensionId)}%26uc`;
  const text = await fetchText(url);
  const match = text.match(/<updatecheck\b[^>]*\bversion="([^"]+)"/);
  return match?.[1] || '';
}

function mapChromeState(state: string): string {
  switch (state) {
    case 'PENDING_REVIEW':
      return 'In review';
    case 'STAGED':
      return 'Approved, staged';
    case 'PUBLISHED':
      return 'Published';
    case 'PUBLISHED_TO_TESTERS':
      return 'Published to testers';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return state || 'No active submission';
  }
}

async function checkFirefox(firefox: FirefoxConfig): Promise<StoreStatusRow> {
  const publicVersions = await getFirefoxVersions(firefox.slug, '');
  const publicLive = publicVersions.find((version) => firefoxStatus(version) === 'public');
  const authHeader =
    configured(firefox.apiKey) && configured(firefox.apiSecret) ? createAmoJwt(firefox) : '';
  const versions = authHeader
    ? await getFirefoxVersions(firefox.slug, authHeader, 'all_without_unlisted')
    : publicVersions;
  const latest = versions[0];
  const pending = versions.find((version) => firefoxStatus(version) !== 'public');
  const liveVersion = stringField(publicLive, 'version') || 'Unavailable';
  const pendingVersion =
    stringField(pending, 'version') && stringField(pending, 'version') !== liveVersion
      ? stringField(pending, 'version')
      : '-';
  const activeStatus = pending ? firefoxStatus(pending) : firefoxStatus(latest);

  return {
    store: 'Firefox AMO',
    liveVersion,
    pendingVersion,
    reviewState: mapFirefoxState(activeStatus),
    canPublishNow: pending ? 'No' : 'Yes',
    rawStatus: activeStatus ? `file.status=${activeStatus}` : 'no versions returned',
    notes: authHeader
      ? 'AMO developer version list fetched.'
      : 'Public version was checked. Review status requires AMO API credentials.',
  };
}

async function getFirefoxVersions(
  slug: string,
  authHeader: string,
  filter = '',
): Promise<unknown[]> {
  const params = new URLSearchParams({ page_size: '10' });
  if (filter) params.set('filter', filter);
  const data = await fetchJson(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(slug)}/versions/?${params}`,
    {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  );
  return isRecord(data) && Array.isArray(data.results) ? data.results : [];
}

function createAmoJwt(firefox: FirefoxConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: firefox.apiKey,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto
    .createHmac('sha256', firefox.apiSecret)
    .update(unsigned)
    .digest('base64url');
  return `JWT ${unsigned}.${signature}`;
}

function firefoxStatus(version: unknown): string {
  const file = isRecord(version) ? version.file : undefined;
  return stringField(file, 'status');
}

function mapFirefoxState(status: string): string {
  switch (status) {
    case 'public':
      return 'Published';
    case 'unreviewed':
    case 'awaiting-review':
      return 'Awaiting review';
    case 'disabled':
      return 'Disabled or rejected';
    default:
      return status || 'No active submission';
  }
}

async function checkEdge(edge: EdgeConfig): Promise<StoreStatusRow> {
  const liveVersion = await getEdgePublicVersion(edge.extensionId);
  if (!configured(edge.operationId)) {
    return {
      store: 'Edge Add-ons',
      liveVersion: liveVersion || 'Unavailable',
      pendingVersion: 'Not tracked',
      reviewState: 'Not tracked',
      canPublishNow: 'Unknown',
      rawStatus: 'no Edge operation id provided',
      notes:
        'Live package was checked. Pending review state requires a saved Edge publish operation id.',
    };
  }

  if (!configured(edge.productId) || !configured(edge.clientId) || !configured(edge.apiKey)) {
    return {
      store: 'Edge Add-ons',
      liveVersion: liveVersion || 'Unavailable',
      pendingVersion: edge.operationVersion || 'Tracked operation',
      reviewState: 'Not checked',
      canPublishNow: 'Unknown',
      rawStatus: 'missing Edge API credentials',
      notes: 'Live package was checked. Operation lookup requires Edge API credentials.',
    };
  }

  const operation = await fetchJson(
    `https://api.addons.microsoftedge.microsoft.com/v1/products/${edge.productId}/submissions/operations/${edge.operationId}`,
    {
      headers: {
        Authorization: `ApiKey ${edge.apiKey}`,
        'X-ClientID': edge.clientId,
      },
    },
  );
  const status = stringField(operation, 'status') || stringField(operation, 'Status');
  const message = stringField(operation, 'message') || stringField(operation, 'Message');
  const errorCode = stringField(operation, 'errorCode') || stringField(operation, 'ErrorCode');

  return {
    store: 'Edge Add-ons',
    liveVersion: liveVersion || 'Unavailable',
    pendingVersion: edge.operationVersion || 'Tracked operation',
    reviewState: mapEdgeState(status, errorCode),
    canPublishNow: mapEdgeCanPublish(status, errorCode),
    rawStatus: [
      `operation.status=${status || 'unset'}`,
      errorCode ? `errorCode=${errorCode}` : '',
      message ? `message=${message}` : '',
      formatEdgeErrors(isRecord(operation) ? operation.errors : null),
      edge.operationRunId ? `run=${edge.operationRunId}` : '',
      edge.operationSubmittedAt ? `submitted=${edge.operationSubmittedAt}` : '',
    ]
      .filter(Boolean)
      .join(', '),
    notes: `Operation ${edge.operationId} checked.`,
  };
}

async function getEdgePublicVersion(extensionId: string): Promise<string> {
  if (!configured(extensionId)) return '';
  const url = `https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&prodversion=146.0.0.0&acceptformat=crx3&x=id%3D${encodeURIComponent(extensionId)}%26installsource%3Dondemand%26uc`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Edge public package request failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const manifest = readManifestFromCrx(buffer);
  return stringField(manifest, 'version');
}

function mapEdgeState(status: string, errorCode = ''): string {
  if (status === 'Failed' && errorCode === 'InProgressSubmission') {
    return 'Submission in progress';
  }
  if (status === 'Failed' && errorCode === 'NoModulesUpdated') {
    return 'No draft updates';
  }

  switch (status) {
    case 'InProgress':
      return 'In progress';
    case 'Succeeded':
      return 'Submitted, not live yet';
    case 'Failed':
      return 'Failed';
    default:
      return status || 'Not tracked';
  }
}

function mapEdgeCanPublish(status: string, errorCode: string): 'Yes' | 'No' | 'Unknown' {
  if (status === 'InProgress' || errorCode === 'InProgressSubmission') return 'No';
  if (status === 'Failed') return 'Unknown';
  return 'Yes';
}

function formatEdgeErrors(errors: unknown): string {
  if (errors === null || errors === undefined) return '';
  return `errors=${JSON.stringify(errors).slice(0, 500)}`;
}

function readManifestFromCrx(buffer: Buffer): unknown {
  const zipOffset = getZipOffset(buffer);
  const eocd = findEocd(buffer);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = zipOffset + buffer.readUInt32LE(eocd + 16);
  let cursor = centralOffset;
  const end = centralOffset + centralSize;

  while (cursor < end) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = zipOffset + buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    if (name === 'manifest.json') {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      const json =
        method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
      return JSON.parse(json) as unknown;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error('manifest.json not found in Edge package');
}

function getZipOffset(buffer: Buffer): number {
  if (buffer.subarray(0, 4).toString('ascii') !== 'Cr24') return 0;
  const version = buffer.readUInt32LE(4);
  if (version === 3) return 12 + buffer.readUInt32LE(8);
  if (version === 2) return 16 + buffer.readUInt32LE(8) + buffer.readUInt32LE(12);
  throw new Error(`Unsupported CRX version: ${version}`);
}

function findEocd(buffer: Buffer): number {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error('ZIP end of central directory not found');
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function storeNames(stores: StoreStatusRow[]): string {
  return stores.map((store) => store.store).join(', ');
}

function isVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z]+)*$/.test(value);
}

if (process.argv[1]?.endsWith('/store-status.ts')) {
  runStoreStatusFromEnv().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
