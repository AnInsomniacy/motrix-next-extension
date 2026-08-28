import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDecision,
  isActiveFirefoxReviewStatus,
  renderStoreStatusReport,
  resolveEdgeStoreStatus,
  type StoreStatusRow,
} from '@/scripts/actions/store-status';
import { renderPublishSummary } from '@/scripts/actions/publish-summary';
import {
  decideChromePublishAction,
  isBlockingChromeSubmissionState,
  readChromeStoreStatus,
} from '@/scripts/actions/publish-chrome';
import {
  buildFirefoxSignArgs,
  decideFirefoxPublishAction,
} from '@/scripts/actions/publish-firefox';
import {
  buildEdgeVariableUpdates,
  decideEdgePreflightAction,
  classifyEdgePublishOperation,
  extractOperationIdFromLocation,
  fetchTrackedPublishOperation,
} from '@/scripts/actions/publish-edge';
import { normalizeReleaseInput } from '@/scripts/actions/resolve-release';

function chromeStatus(submittedVersion: string, state: string, liveVersion = '1.3.1') {
  return readChromeStoreStatus({
    publishedItemRevisionStatus: {
      state: 'PUBLISHED',
      distributionChannels: [{ crxVersion: liveVersion, deployPercentage: 100 }],
    },
    submittedItemRevisionStatus: {
      state,
      distributionChannels: [{ crxVersion: submittedVersion, deployPercentage: 100 }],
    },
  });
}

describe('release workflow decisions', () => {
  it('normalizes production releases and keeps workflow scripts on the checked-out tooling', () => {
    expect(normalizeReleaseInput('1.2.3')).toBe('v1.2.3');
    expect(normalizeReleaseInput('v1.2.3')).toBe('v1.2.3');
    expect(() => normalizeReleaseInput('1.2.3-beta.1')).toThrow('production SemVer');

    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/publish.yml'), 'utf8');
    expect(workflow).toContain('working-directory: workflow');
    expect(workflow).toContain('../workflow/node_modules/.bin/tsx');
  });

  it('covers Chrome publish, review, terminal, and existing-version decisions', () => {
    expect(
      decideChromePublishAction(chromeStatus('1.3.2', 'PUBLISHED', '1.3.2'), '1.3.2').outcome,
    ).toBe('skipped-version-exists');
    expect(
      decideChromePublishAction(chromeStatus('1.3.2', 'PENDING_REVIEW'), '1.3.2').outcome,
    ).toBe('skipped-pending-review');
    expect(decideChromePublishAction(chromeStatus('1.3.3', 'PENDING_REVIEW'), '1.3.2').action).toBe(
      'skip',
    );
    for (const state of ['CANCELLED', 'REJECTED']) {
      expect(decideChromePublishAction(chromeStatus('1.3.3', state), '1.3.4').action).toBe(
        'publish',
      );
      expect(isBlockingChromeSubmissionState(state)).toBe(false);
    }
    expect(isBlockingChromeSubmissionState('PENDING_REVIEW')).toBe(true);
  });

  it('covers Firefox duplicate detection, review states, and signing arguments', () => {
    expect(
      decideFirefoxPublishAction([{ version: '1.3.2', file: { status: 'unreviewed' } }], '1.3.2')
        .outcome,
    ).toBe('skipped-version-exists');
    expect(isActiveFirefoxReviewStatus('disabled')).toBe(false);
    expect(isActiveFirefoxReviewStatus('awaiting-review')).toBe(true);
    expect(
      buildFirefoxSignArgs({
        apiKey: 'key',
        apiSecret: 'secret',
        sourceDir: '.output/firefox-mv3',
        sourceCodePath: 'source.zip',
      }),
    ).toEqual(
      expect.arrayContaining(['--channel', 'listed', '--upload-source-code', 'source.zip', '0']),
    );
  });

  it('validates Edge operation identifiers and repository state updates', () => {
    expect(
      extractOperationIdFromLocation(
        'https://api.addons.microsoftedge.microsoft.com/v1/products/id/operations/op-123',
      ),
    ).toBe('op-123');
    expect(() => extractOperationIdFromLocation('')).toThrow('Location header');
    expect(
      buildEdgeVariableUpdates({
        operationId: 'op-123',
        runId: '100',
        submittedAt: '2026-05-02T00:00:00.000Z',
        version: '1.2.3',
      }),
    ).toEqual({
      EDGE_LAST_OPERATION_ID: 'op-123',
      EDGE_LAST_OPERATION_RUN_ID: '100',
      EDGE_LAST_OPERATION_SUBMITTED_AT: '2026-05-02T00:00:00.000Z',
      EDGE_LAST_OPERATION_VERSION: '1.2.3',
    });
  });

  it('handles tracked Edge preflight state without reusing stale operations', async () => {
    expect(
      decideEdgePreflightAction(
        { status: 'InProgress', message: '', errorCode: '', errors: null },
        '1.3.2',
        '1.3.2',
      ).outcome,
    ).toBe('skipped-in-review');

    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchTrackedPublishOperation({
        authHeaders: {},
        operationId: 'old',
        operationVersion: '1.3.2',
        productId: 'product',
        targetVersion: '1.3.4',
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('classifies successful, conflicting, empty, and invalid Edge operations', () => {
    const cases = [
      [
        {
          status: 'Succeeded',
          message: 'Successfully created submission',
          errorCode: '',
          errors: null,
        },
        { action: 'published', failed: false, terminal: true },
      ],
      [
        {
          status: 'Failed',
          message: 'submission is in progress',
          errorCode: 'InProgressSubmission',
          errors: null,
        },
        { action: 'skipped-in-review', failed: false, terminal: true },
      ],
      [
        {
          status: 'Failed',
          message: 'there are no updates',
          errorCode: 'NoModulesUpdated',
          errors: null,
        },
        { action: 'skipped-no-updates', failed: false, terminal: true },
      ],
      [
        {
          status: 'Failed',
          message: 'cannot publish',
          errorCode: 'Validation',
          errors: ['missing'],
        },
        { action: 'failed', failed: true, terminal: true },
      ],
    ] as const;
    for (const [operation, expected] of cases) {
      expect(classifyEdgePublishOperation(operation)).toEqual(expected);
    }
  });

  it('resolves Edge live, pending, and in-progress store states', () => {
    expect(
      resolveEdgeStoreStatus({
        errorCode: '',
        liveVersion: '1.1.6',
        operationStatus: 'Succeeded',
        operationVersion: '1.2.4',
      }).canPublishNow,
    ).toBe('No');
    expect(
      resolveEdgeStoreStatus({
        errorCode: '',
        liveVersion: '1.2.4',
        operationStatus: 'Succeeded',
        operationVersion: '1.2.4',
      }).reviewState,
    ).toBe('Published');
    expect(
      resolveEdgeStoreStatus({
        errorCode: 'InProgressSubmission',
        liveVersion: '1.1.6',
        operationStatus: 'Failed',
        operationVersion: '1.2.4',
      }).reviewState,
    ).toBe('Submission in progress');
  });

  it('renders publish and store summaries with blockers and incomplete states', () => {
    const publish = renderPublishSummary({
      chromeOutcome: 'published',
      chromeResult: 'success',
      edgeOutcome: 'published-state-pending-not-saved',
      edgeResult: 'success',
      firefoxOutcome: 'published',
      firefoxResult: 'success',
      qualityGateResult: 'success',
      tag: 'v1.2.4',
      version: '1.2.4',
    });
    expect(publish).toContain('| Edge Add-ons | Success, status pending, state not saved |');

    const rows: StoreStatusRow[] = [
      {
        store: 'Firefox AMO',
        liveVersion: '1.1.10',
        pendingVersion: '-',
        reviewState: 'Published',
        canPublishNow: 'Yes',
        rawStatus: 'public',
        notes: 'checked',
      },
      {
        store: 'Edge Add-ons',
        liveVersion: '1.1.6',
        pendingVersion: 'Not tracked',
        reviewState: 'Not tracked',
        canPublishNow: 'Unknown',
        rawStatus: 'missing operation',
        notes: 'checked',
      },
    ];
    expect(buildDecision('1.2.3', rows)).toContain('incomplete publishability data');
    expect(
      renderStoreStatusReport({
        checkedAt: '2026-05-02T00:00:00.000Z',
        releaseTag: 'v1.2.3',
        releaseVersion: '1.2.3',
        stores: rows,
      }),
    ).toContain('### Decision');
  });
});
