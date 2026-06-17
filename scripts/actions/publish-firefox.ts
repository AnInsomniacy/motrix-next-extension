import crypto from 'node:crypto';
import { join } from 'node:path';

import {
  fetchJson,
  isRecord,
  optionalEnv,
  requiredEnv,
  runCommand,
  setOutput,
  stringField,
} from './workflow-utils';

type FirefoxPublishDecision = {
  action: 'publish' | 'skip';
  outcome: string;
  reason: string;
};

type FirefoxSignArgsInput = {
  apiKey: string;
  apiSecret: string;
  sourceCodePath: string;
  sourceDir: string;
};

export function decideFirefoxPublishAction(
  versions: unknown[],
  targetVersion: string,
): FirefoxPublishDecision {
  const exists = versions.some((version) => stringField(version, 'version') === targetVersion);
  if (exists) {
    return {
      action: 'skip',
      outcome: 'skipped-version-exists',
      reason: `Firefox AMO already has version ${targetVersion}`,
    };
  }
  return { action: 'publish', outcome: 'published', reason: 'Firefox AMO can accept upload' };
}

export function buildFirefoxSignArgs(input: FirefoxSignArgsInput): string[] {
  return [
    'sign',
    '--source-dir',
    input.sourceDir,
    '--channel',
    'listed',
    '--api-key',
    input.apiKey,
    '--api-secret',
    input.apiSecret,
    '--upload-source-code',
    input.sourceCodePath,
    '--approval-timeout',
    '0',
  ];
}

export async function publishFirefoxFromEnv(): Promise<void> {
  const apiKey = requiredEnv('FIREFOX_API_KEY');
  const apiSecret = requiredEnv('FIREFOX_API_SECRET');
  const version = requiredEnv('VERSION');
  const slug = optionalEnv('FIREFOX_ADDON_SLUG') || 'motrix-next-extension';
  const authHeader = createAmoJwt({ apiKey, apiSecret });
  const versions = await getFirefoxVersions(slug, authHeader);
  const decision = decideFirefoxPublishAction(versions, version);

  if (decision.action === 'skip') {
    console.log(`::notice::${decision.reason}`);
    setOutput('outcome', decision.outcome);
    return;
  }

  const output = runCommand(
    getWorkflowBinary('web-ext'),
    buildFirefoxSignArgs({
      apiKey,
      apiSecret,
      sourceDir: '.output/firefox-mv3',
      sourceCodePath: 'source-code.zip',
    }),
  );
  console.log(output.output);
  if (output.exitCode !== 0) {
    throw new Error(`Firefox AMO signing failed: ${output.output.slice(0, 500)}`);
  }
  setOutput('outcome', 'published');
}

function getWorkflowBinary(name: string): string {
  const runtimeDir = optionalEnv('ACTIONS_RUNTIME_DIR') || '.';
  return join(runtimeDir, 'node_modules', '.bin', name);
}

async function getFirefoxVersions(slug: string, authHeader: string): Promise<unknown[]> {
  const params = new URLSearchParams({ page_size: '10', filter: 'all_without_unlisted' });
  const data = await fetchJson(
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(slug)}/versions/?${params}`,
    { headers: { Authorization: authHeader } },
  );
  return isRecord(data) && Array.isArray(data.results) ? data.results : [];
}

function createAmoJwt(input: { apiKey: string; apiSecret: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: input.apiKey,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto
    .createHmac('sha256', input.apiSecret)
    .update(unsigned)
    .digest('base64url');
  return `JWT ${unsigned}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

if (process.argv[1]?.endsWith('/publish-firefox.ts')) {
  publishFirefoxFromEnv().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
