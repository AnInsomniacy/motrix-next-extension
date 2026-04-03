/**
 * @fileoverview Unit tests for usePreferenceForm composable.
 *
 * Validates the full snapshot-based dirty-tracking lifecycle:
 * - isDirty starts false
 * - isDirty becomes true when a field changes
 * - isDirty becomes false when reverted to original value
 * - handleSave: persists + clears dirty
 * - handleReset: reverts form + clears dirty
 * - patchSnapshot: partial baseline update
 * - beforeSave: abort on false
 *
 * @see /motrix-next/src/composables/__tests__/useTaskDetailOptions.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';
import { usePreferenceForm } from '@/shared/use-preference-form';

interface TestForm {
  port: number;
  secret: string;
  enabled: boolean;
}

function createDefaults(): TestForm {
  return { port: 16800, secret: 'abc', enabled: true };
}

describe('usePreferenceForm', () => {
  function setup(overrides?: Partial<Parameters<typeof usePreferenceForm<TestForm>>[0]>) {
    const persist = vi.fn(async () => {});
    const result = usePreferenceForm<TestForm>({
      buildForm: createDefaults,
      persist,
      ...overrides,
    });
    return { ...result, persist };
  }

  // ── isDirty ─────────────────────────────────────────────────

  it('isDirty starts as false', () => {
    const { isDirty } = setup();
    expect(isDirty.value).toBe(false);
  });

  it('isDirty becomes true when a field changes', async () => {
    const { form, isDirty } = setup();
    form.value.port = 9999;
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('isDirty becomes true when string field changes', async () => {
    const { form, isDirty } = setup();
    form.value.secret = 'changed';
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('isDirty becomes true when boolean field changes', async () => {
    const { form, isDirty } = setup();
    form.value.enabled = false;
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('isDirty returns to false when reverted to original value', async () => {
    const { form, isDirty } = setup();
    form.value.port = 9999;
    await nextTick();
    expect(isDirty.value).toBe(true);

    form.value.port = 16800;
    await nextTick();
    expect(isDirty.value).toBe(false);
  });

  it('isDirty tracks multiple field changes', async () => {
    const { form, isDirty } = setup();
    form.value.port = 9999;
    form.value.secret = 'new';
    await nextTick();
    expect(isDirty.value).toBe(true);

    // Revert only one field — still dirty
    form.value.port = 16800;
    await nextTick();
    expect(isDirty.value).toBe(true);

    // Revert the other field — now clean
    form.value.secret = 'abc';
    await nextTick();
    expect(isDirty.value).toBe(false);
  });

  // ── handleSave ──────────────────────────────────────────────

  it('handleSave calls persist and clears dirty', async () => {
    const { form, isDirty, handleSave, persist } = setup();
    form.value.port = 9999;
    await nextTick();
    expect(isDirty.value).toBe(true);

    await handleSave();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ port: 9999 }));
    expect(isDirty.value).toBe(false);
  });

  it('handleSave updates the snapshot baseline', async () => {
    const { form, isDirty, handleSave } = setup();
    form.value.port = 9999;
    await handleSave();

    // Reverting to default now makes it dirty again (baseline is 9999)
    form.value.port = 16800;
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  // ── handleReset ─────────────────────────────────────────────

  it('handleReset reverts form to saved snapshot', async () => {
    const { form, isDirty, handleReset } = setup();
    form.value.port = 9999;
    form.value.secret = 'changed';
    await nextTick();
    expect(isDirty.value).toBe(true);

    handleReset();
    await nextTick();

    expect(form.value.port).toBe(16800);
    expect(form.value.secret).toBe('abc');
    expect(isDirty.value).toBe(false);
  });

  it('handleReset reverts to last saved state (not initial)', async () => {
    const { form, isDirty, handleSave, handleReset } = setup();
    form.value.port = 9999;
    await handleSave();

    form.value.port = 1111;
    await nextTick();
    expect(isDirty.value).toBe(true);

    handleReset();
    await nextTick();

    // Reverts to 9999 (the last saved state), not 16800 (initial)
    expect(form.value.port).toBe(9999);
    expect(isDirty.value).toBe(false);
  });

  // ── resetSnapshot ───────────────────────────────────────────

  it('resetSnapshot marks current form as clean', async () => {
    const { form, isDirty, resetSnapshot } = setup();
    form.value.port = 9999;
    await nextTick();
    expect(isDirty.value).toBe(true);

    resetSnapshot();
    await nextTick();
    expect(isDirty.value).toBe(false);
  });

  // ── patchSnapshot ───────────────────────────────────────────

  it('patchSnapshot updates single field without clearing others', async () => {
    const { form, isDirty, patchSnapshot } = setup();

    // Change two fields
    form.value.port = 9999;
    form.value.enabled = false;
    await nextTick();
    expect(isDirty.value).toBe(true);

    // Patch only enabled → port is still dirty
    patchSnapshot({ enabled: false });
    await nextTick();
    expect(isDirty.value).toBe(true);

    // Now also patch port → clean
    patchSnapshot({ port: 9999 });
    await nextTick();
    expect(isDirty.value).toBe(false);
  });

  // ── beforeSave ──────────────────────────────────────────────

  it('beforeSave returning false aborts the save', async () => {
    const { form, isDirty, handleSave, persist } = setup({
      beforeSave: () => false,
    });
    form.value.port = 9999;
    await nextTick();

    await handleSave();

    expect(persist).not.toHaveBeenCalled();
    expect(isDirty.value).toBe(true);
  });

  it('beforeSave returning true allows the save', async () => {
    const { form, isDirty, handleSave, persist } = setup({
      beforeSave: () => true,
    });
    form.value.port = 9999;
    await nextTick();

    await handleSave();

    expect(persist).toHaveBeenCalledOnce();
    expect(isDirty.value).toBe(false);
  });

  it('async beforeSave is awaited', async () => {
    const { form, isDirty, handleSave, persist } = setup({
      beforeSave: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return false;
      },
    });
    form.value.port = 9999;
    await nextTick();

    await handleSave();

    expect(persist).not.toHaveBeenCalled();
    expect(isDirty.value).toBe(true);
  });

  // ── afterSave ───────────────────────────────────────────────

  it('afterSave is called after successful persist', async () => {
    const afterSave = vi.fn();
    const { form, handleSave } = setup({ afterSave });
    form.value.port = 9999;
    await nextTick();

    await handleSave();

    expect(afterSave).toHaveBeenCalledOnce();
    expect(afterSave).toHaveBeenCalledWith(expect.objectContaining({ port: 9999 }));
  });

  // ── Edge cases ──────────────────────────────────────────────

  it('deep clone isolation: modifying form does not affect snapshot', async () => {
    const { form, isDirty, handleSave } = setup();
    await handleSave(); // snapshot baseline

    // Mutate form — snapshot should be independent
    form.value.port = 1234;
    await nextTick();
    expect(isDirty.value).toBe(true);
  });
});
