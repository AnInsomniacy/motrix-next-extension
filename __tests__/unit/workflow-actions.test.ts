import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  buildDecision,
  renderStoreStatusReport,
  resolveEdgeStoreStatus,
  type StoreStatusRow,
} from '../../scripts/actions/store-status';
import { renderPublishSummary } from '../../scripts/actions/publish-summary';
import {
  decideChromePublishAction,
  readChromeStoreStatus,
} from '../../scripts/actions/publish-chrome';
import {
  buildFirefoxSignArgs,
  decideFirefoxPublishAction,
} from '../../scripts/actions/publish-firefox';
import {
  buildEdgeVariableUpdates,
  decideEdgePreflightAction,
  classifyEdgePublishOperation,
  extractOperationIdFromLocation,
} from '../../scripts/actions/publish-edge';
import { normalizeReleaseInput } from '../../scripts/actions/resolve-release';

const root = resolve(import.meta.dirname ?? '.', '..', '..');

describe('workflow action helpers', () => {
  test('normalizes production release inputs and rejects prerelease versions', () => {
    expect(normalizeReleaseInput('1.2.3')).toBe('v1.2.3');
    expect(normalizeReleaseInput('v1.2.3')).toBe('v1.2.3');
    expect(() => normalizeReleaseInput('1.2.3-beta.1')).toThrow('production SemVer');
  });

  test('runs split-checkout publish scripts with workflow checkout tooling', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/publish.yml'), 'utf-8');

    expect(workflow).toContain('working-directory: workflow');
    expect(workflow).toContain('../workflow/node_modules/.bin/tsx');
    expect(workflow).not.toContain('run: pnpm exec tsx ../workflow/scripts/actions/publish-');
  });

  test('extracts Edge operation ids from API Location headers', () => {
    expect(
      extractOperationIdFromLocation(
        'https://api.addons.microsoftedge.microsoft.com/v1/products/product/submissions/operations/operation-123',
      ),
    ).toBe('operation-123');
    expect(() => extractOperationIdFromLocation('')).toThrow('Location header');
  });

  test('only builds the approved Edge repository variable updates', () => {
    expect(
      buildEdgeVariableUpdates({
        operationId: 'operation-123',
        runId: '100200300',
        submittedAt: '2026-05-02T00:00:00.000Z',
        version: '1.2.3',
      }),
    ).toEqual({
      EDGE_LAST_OPERATION_ID: 'operation-123',
      EDGE_LAST_OPERATION_RUN_ID: '100200300',
      EDGE_LAST_OPERATION_SUBMITTED_AT: '2026-05-02T00:00:00.000Z',
      EDGE_LAST_OPERATION_VERSION: '1.2.3',
    });
  });

  test('renders successful store publish jobs as action-level success', () => {
    const report = renderPublishSummary({
      chromeOutcome: 'published',
      chromeResult: 'success',
      edgeOutcome: 'published-state-not-saved',
      edgeResult: 'success',
      firefoxOutcome: 'published',
      firefoxResult: 'success',
      qualityGateResult: 'success',
      tag: 'v1.2.4',
      version: '1.2.4',
    });

    expect(report).toContain('| Chrome Web Store | Success |');
    expect(report).toContain('| Firefox AMO | Success |');
    expect(report).toContain('| Edge Add-ons | Success, state not saved |');
    expect(report).not.toContain('Published or submitted');
  });

  test('renders non-failing Edge publish operation outcomes precisely', () => {
    expect(renderPublishSummaryRow('published-state-pending')).toBe('Success, status pending');
    expect(renderPublishSummaryRow('published-state-pending-not-saved')).toBe(
      'Success, status pending, state not saved',
    );
    expect(renderPublishSummaryRow('skipped-no-updates')).toBe('Skipped, no updates');
  });

  test('skips Chrome publishing when the target version is already live', () => {
    const status = readChromeStoreStatus({
      publishedItemRevisionStatus: {
        state: 'PUBLISHED',
        distributionChannels: [{ crxVersion: '1.3.2', deployPercentage: 100 }],
      },
      submittedItemRevisionStatus: {
        state: 'PUBLISHED',
        distributionChannels: [{ crxVersion: '1.3.2', deployPercentage: 100 }],
      },
    });

    expect(decideChromePublishAction(status, '1.3.2')).toEqual({
      action: 'skip',
      outcome: 'skipped-version-exists',
      reason: 'Chrome Web Store already has version 1.3.2 live',
    });
  });

  test('skips Chrome publishing when the target version is already submitted', () => {
    const status = readChromeStoreStatus({
      publishedItemRevisionStatus: {
        state: 'PUBLISHED',
        distributionChannels: [{ crxVersion: '1.3.1', deployPercentage: 100 }],
      },
      submittedItemRevisionStatus: {
        state: 'PENDING_REVIEW',
        distributionChannels: [{ crxVersion: '1.3.2', deployPercentage: 100 }],
      },
    });

    expect(decideChromePublishAction(status, '1.3.2')).toEqual({
      action: 'skip',
      outcome: 'skipped-pending-review',
      reason: 'Chrome Web Store already has version 1.3.2 submitted as PENDING_REVIEW',
    });
  });

  test('blocks Chrome publishing while another version is under review', () => {
    const status = readChromeStoreStatus({
      publishedItemRevisionStatus: {
        state: 'PUBLISHED',
        distributionChannels: [{ crxVersion: '1.3.1', deployPercentage: 100 }],
      },
      submittedItemRevisionStatus: {
        state: 'PENDING_REVIEW',
        distributionChannels: [{ crxVersion: '1.3.3', deployPercentage: 100 }],
      },
    });

    expect(decideChromePublishAction(status, '1.3.2')).toEqual({
      action: 'skip',
      outcome: 'skipped-pending-review',
      reason: 'Chrome Web Store has version 1.3.3 submitted as PENDING_REVIEW',
    });
  });

  test('skips Firefox publishing when the target version already exists', () => {
    expect(
      decideFirefoxPublishAction(
        [
          {
            version: '1.3.2',
            file: { status: 'unreviewed' },
          },
        ],
        '1.3.2',
      ),
    ).toEqual({
      action: 'skip',
      outcome: 'skipped-version-exists',
      reason: 'Firefox AMO already has version 1.3.2',
    });
  });

  test('uses web-ext without waiting for AMO approval', () => {
    expect(
      buildFirefoxSignArgs({
        apiKey: 'api-key',
        apiSecret: 'api-secret',
        sourceDir: '.output/firefox-mv3',
        sourceCodePath: 'source-code.zip',
      }),
    ).toEqual([
      'sign',
      '--source-dir',
      '.output/firefox-mv3',
      '--channel',
      'listed',
      '--api-key',
      'api-key',
      '--api-secret',
      'api-secret',
      '--upload-source-code',
      'source-code.zip',
      '--approval-timeout',
      '0',
    ]);
  });

  test('skips Edge publishing when the tracked target submission is still active', () => {
    expect(
      decideEdgePreflightAction(
        {
          status: 'InProgress',
          message: '',
          errorCode: '',
          errors: null,
        },
        '1.3.2',
        '1.3.2',
      ),
    ).toEqual({
      action: 'skip',
      outcome: 'skipped-in-review',
      reason: 'Edge Add-ons already has version 1.3.2 submitted as InProgress',
    });
  });

  test('classifies terminal Edge publish operation responses', () => {
    expect(
      classifyEdgePublishOperation({
        status: 'Succeeded',
        message: 'Successfully created submission with ID submission-123',
        errorCode: '',
        errors: null,
      }),
    ).toEqual({ action: 'published', failed: false, terminal: true });

    expect(
      classifyEdgePublishOperation({
        status: 'Failed',
        message: "Can't publish extension as your extension submission is in progress.",
        errorCode: 'InProgressSubmission',
        errors: null,
      }),
    ).toEqual({ action: 'skipped-in-review', failed: false, terminal: true });

    expect(
      classifyEdgePublishOperation({
        status: 'Failed',
        message: "Can't publish extension since there are no updates.",
        errorCode: 'NoModulesUpdated',
        errors: null,
      }),
    ).toEqual({ action: 'skipped-no-updates', failed: false, terminal: true });

    expect(
      classifyEdgePublishOperation({
        status: 'Failed',
        message: 'Extension cannot be published.',
        errorCode: 'SubmissionValidationError',
        errors: ['Privacy information is missing'],
      }),
    ).toEqual({ action: 'failed', failed: true, terminal: true });
  });

  test('keeps Edge publishing blocked while a submitted version is not live', () => {
    expect(
      resolveEdgeStoreStatus({
        errorCode: '',
        liveVersion: '1.1.6',
        operationStatus: 'Succeeded',
        operationVersion: '1.2.4',
      }),
    ).toEqual({
      pendingVersion: '1.2.4',
      reviewState: 'Submitted, not live yet',
      canPublishNow: 'No',
    });

    expect(
      resolveEdgeStoreStatus({
        errorCode: '',
        liveVersion: '1.2.4',
        operationStatus: 'Succeeded',
        operationVersion: '1.2.4',
      }),
    ).toEqual({
      pendingVersion: '-',
      reviewState: 'Published',
      canPublishNow: 'Yes',
    });

    expect(
      resolveEdgeStoreStatus({
        errorCode: 'InProgressSubmission',
        liveVersion: '1.1.6',
        operationStatus: 'Failed',
        operationVersion: '1.2.4',
      }),
    ).toEqual({
      pendingVersion: '1.2.4',
      reviewState: 'Submission in progress',
      canPublishNow: 'No',
    });
  });

  test('renders store status with the summary table before the decision', () => {
    const stores: StoreStatusRow[] = [
      {
        store: 'Chrome Web Store',
        liveVersion: '1.2.3',
        pendingVersion: '-',
        reviewState: 'Published',
        canPublishNow: 'Yes',
        rawStatus: 'published=PUBLISHED',
        notes: 'Chrome API status fetched.',
      },
      {
        store: 'Edge Add-ons',
        liveVersion: '1.1.6',
        pendingVersion: '1.2.3',
        reviewState: 'In progress',
        canPublishNow: 'No',
        rawStatus: 'operation.status=InProgress',
        notes: 'Operation operation-123 checked.',
      },
    ];

    const report = renderStoreStatusReport({
      checkedAt: '2026-05-02T00:00:00.000Z',
      releaseTag: 'v1.2.3',
      releaseVersion: '1.2.3',
      stores,
    });

    expect(
      report.indexOf('| Store | Live version | Pending version | Review state | Can publish now |'),
    ).toBeLessThan(report.indexOf('### Decision'));
    expect(report).toContain('| Edge Add-ons | 1.1.6 | 1.2.3 | In progress | No |');
    expect(report).toContain('Do not submit another release yet.');
  });

  test('builds a publish decision from blockers, behind stores, and unknown states', () => {
    const rows: StoreStatusRow[] = [
      {
        store: 'Firefox AMO',
        liveVersion: '1.1.10',
        pendingVersion: '-',
        reviewState: 'Published',
        canPublishNow: 'Yes',
        rawStatus: 'file.status=public',
        notes: 'AMO developer version list fetched.',
      },
      {
        store: 'Edge Add-ons',
        liveVersion: '1.1.6',
        pendingVersion: 'Not tracked',
        reviewState: 'Not tracked',
        canPublishNow: 'Unknown',
        rawStatus: 'no Edge operation id provided',
        notes: 'Live package was checked.',
      },
    ];

    expect(buildDecision('1.2.3', rows)).toBe(
      'Review before publishing. Stores behind the target release: Firefox AMO, Edge Add-ons. Stores with incomplete publishability data: Edge Add-ons.',
    );
  });
});

function renderPublishSummaryRow(edgeOutcome: string): string {
  const report = renderPublishSummary({
    chromeOutcome: 'published',
    chromeResult: 'success',
    edgeOutcome,
    edgeResult: 'success',
    firefoxOutcome: 'published',
    firefoxResult: 'success',
    qualityGateResult: 'success',
    tag: 'v1.2.4',
    version: '1.2.4',
  });
  const row = report.split('\n').find((line) => line.startsWith('| Edge Add-ons |'));
  return row?.split('|')[2]?.trim() || '';
}
