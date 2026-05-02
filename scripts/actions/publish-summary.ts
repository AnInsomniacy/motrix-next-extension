import { appendStepSummary, optionalEnv, requiredEnv } from './workflow-utils';

export function pipelineResult(result: string): string {
  switch (result) {
    case 'success':
      return 'Passed';
    case 'failure':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    default:
      return result || 'Unknown';
  }
}

export function storeResult(result: string, outcome: string): string {
  if (result === 'failure') return 'Failed';
  if (result === 'skipped') return 'Skipped';
  if (result !== 'success') return result || 'Unknown';
  switch (outcome) {
    case 'published':
      return 'Success';
    case 'published-state-not-saved':
      return 'Success, state not saved';
    case 'published-state-pending':
      return 'Success, status pending';
    case 'published-state-pending-not-saved':
      return 'Success, status pending, state not saved';
    case 'skipped-pending-review':
      return 'Skipped, pending review';
    case 'skipped-version-exists':
      return 'Skipped, version exists';
    case 'skipped-in-review':
      return 'Skipped, in review';
    case 'skipped-no-updates':
      return 'Skipped, no updates';
    default:
      return outcome || 'Success';
  }
}

export function renderPublishSummary(input: {
  chromeOutcome: string;
  chromeResult: string;
  edgeOutcome: string;
  edgeResult: string;
  firefoxOutcome: string;
  firefoxResult: string;
  qualityGateResult: string;
  tag: string;
  version: string;
}): string {
  return [
    '## Publish Summary',
    '',
    `Version: ${input.version}`,
    `Tag: ${input.tag}`,
    '',
    '### Pipeline',
    '',
    '| Stage | Result |',
    '|---|---|',
    `| Quality Gate | ${pipelineResult(input.qualityGateResult)} |`,
    '',
    '### Store Publishing',
    '',
    '| Store | Result |',
    '|---|---|',
    `| Chrome Web Store | ${storeResult(input.chromeResult, input.chromeOutcome)} |`,
    `| Firefox AMO | ${storeResult(input.firefoxResult, input.firefoxOutcome)} |`,
    `| Edge Add-ons | ${storeResult(input.edgeResult, input.edgeOutcome)} |`,
    '',
  ].join('\n');
}

export function writePublishSummaryFromEnv(): void {
  appendStepSummary(
    renderPublishSummary({
      chromeOutcome: optionalEnv('CHROME_OUTCOME'),
      chromeResult: optionalEnv('CHROME_RESULT'),
      edgeOutcome: optionalEnv('EDGE_OUTCOME'),
      edgeResult: optionalEnv('EDGE_RESULT'),
      firefoxOutcome: optionalEnv('FIREFOX_OUTCOME'),
      firefoxResult: optionalEnv('FIREFOX_RESULT'),
      qualityGateResult: optionalEnv('QG_RESULT'),
      tag: requiredEnv('TAG'),
      version: requiredEnv('VERSION'),
    }),
  );
}

if (process.argv[1]?.endsWith('/publish-summary.ts')) {
  try {
    writePublishSummaryFromEnv();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
