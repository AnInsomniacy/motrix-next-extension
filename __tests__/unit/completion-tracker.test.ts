import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CompletionTracker,
  type CompletionTrackerDeps,
} from '@/lib/services/completion-tracker';

describe('CompletionTracker', () => {
  let tracker: CompletionTracker;
  let mockTellStatus: ReturnType<typeof vi.fn<(gid: string) => Promise<{ status: string }>>>;
  let mockOnComplete: ReturnType<typeof vi.fn<(gid: string, filename: string) => void>>;

  beforeEach(() => {
    mockTellStatus = vi.fn<(gid: string) => Promise<{ status: string }>>();
    mockOnComplete = vi.fn<(gid: string, filename: string) => void>();
    tracker = new CompletionTracker({
      tellStatus: mockTellStatus as CompletionTrackerDeps['tellStatus'],
      onComplete: mockOnComplete,
    });
  });

  // ─── Track / Untrack ─────────────────────────────────

  it('should track a GID with associated filename', () => {
    tracker.track('abc123', 'archive.zip');
    expect(tracker.trackedCount).toBe(1);
  });

  it('should untrack a GID', () => {
    tracker.track('abc123', 'archive.zip');
    tracker.untrack('abc123');
    expect(tracker.trackedCount).toBe(0);
  });

  it('should not call onComplete if nothing is tracked', async () => {
    await tracker.poll();
    expect(mockTellStatus).not.toHaveBeenCalled();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  // ─── Polling ─────────────────────────────────────────

  it('should call tellStatus for each tracked GID on poll', async () => {
    mockTellStatus.mockResolvedValue({ status: 'active' });
    tracker.track('gid1', 'file1.zip');
    tracker.track('gid2', 'file2.zip');

    await tracker.poll();

    expect(mockTellStatus).toHaveBeenCalledTimes(2);
    expect(mockTellStatus).toHaveBeenCalledWith('gid1');
    expect(mockTellStatus).toHaveBeenCalledWith('gid2');
  });

  it('should fire onComplete and untrack when status is "complete"', async () => {
    mockTellStatus.mockResolvedValue({ status: 'complete' });
    tracker.track('gid1', 'file1.zip');

    await tracker.poll();

    expect(mockOnComplete).toHaveBeenCalledWith('gid1', 'file1.zip');
    expect(tracker.trackedCount).toBe(0);
  });

  it('should NOT fire onComplete for active tasks', async () => {
    mockTellStatus.mockResolvedValue({ status: 'active' });
    tracker.track('gid1', 'file1.zip');

    await tracker.poll();

    expect(mockOnComplete).not.toHaveBeenCalled();
    expect(tracker.trackedCount).toBe(1);
  });

  it('should fire onComplete for "error" status and untrack', async () => {
    mockTellStatus.mockResolvedValue({ status: 'error' });
    tracker.track('gid1', 'file1.zip');

    await tracker.poll();

    // Error is a terminal state — untrack but don't fire onComplete
    expect(mockOnComplete).not.toHaveBeenCalled();
    expect(tracker.trackedCount).toBe(0);
  });

  it('should fire onComplete for "removed" status and untrack', async () => {
    mockTellStatus.mockResolvedValue({ status: 'removed' });
    tracker.track('gid1', 'file1.zip');

    await tracker.poll();

    expect(mockOnComplete).not.toHaveBeenCalled();
    expect(tracker.trackedCount).toBe(0);
  });

  it('should gracefully handle tellStatus rejection (keep tracking)', async () => {
    mockTellStatus.mockRejectedValue(new Error('network error'));
    tracker.track('gid1', 'file1.zip');

    await tracker.poll();

    // Should not crash, and keep tracking for next poll
    expect(tracker.trackedCount).toBe(1);
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it('should handle mixed statuses in a single poll', async () => {
    mockTellStatus
      .mockResolvedValueOnce({ status: 'complete' })
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ status: 'error' });

    tracker.track('gid1', 'done.zip');
    tracker.track('gid2', 'active.zip');
    tracker.track('gid3', 'failed.zip');

    await tracker.poll();

    expect(mockOnComplete).toHaveBeenCalledTimes(1);
    expect(mockOnComplete).toHaveBeenCalledWith('gid1', 'done.zip');
    expect(tracker.trackedCount).toBe(1); // Only gid2 still active
  });

  // ─── Clear ───────────────────────────────────────────

  it('should clear all tracked GIDs', () => {
    tracker.track('gid1', 'f1.zip');
    tracker.track('gid2', 'f2.zip');
    tracker.clear();
    expect(tracker.trackedCount).toBe(0);
  });
});
