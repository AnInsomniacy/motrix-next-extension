/**
 * @fileoverview Composable that centralizes dirty-tracking, save/reset lifecycle
 * for the extension Options page.
 *
 * Architecture mirrors desktop Motrix Next `usePreferenceForm.ts`:
 * - Reactive `form` ref with dirty detection against a saved snapshot
 * - `handleSave()` persists and updates the snapshot
 * - `handleReset()` reverts the form to the saved snapshot
 * - `patchSnapshot()` for fields that persist immediately (theme, site rules)
 *
 * Stripped of desktop-specific concerns: Tauri invoke, Pinia store sync,
 * engine hot-reload, route guards. Persistence target is `chrome.storage.local`.
 *
 * @see /motrix-next/src/composables/usePreferenceForm.ts (desktop reference)
 */
import { ref, computed, type Ref } from 'vue';

// ── Deep equality (avoids lodash dependency) ────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }

  return false;
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── Public API ──────────────────────────────────────────────────────

export interface UsePreferenceFormOptions<T extends object> {
  /**
   * Factory that builds the initial form state from the current persisted
   * config. Called once on setup to create both the live form and the
   * saved baseline snapshot.
   */
  buildForm: () => T;

  /**
   * Persistence callback. Receives the validated form and must write it
   * to `chrome.storage.local` (or equivalent).
   */
  persist: (form: T) => Promise<void>;

  /**
   * Optional pre-save hook. Return `false` to abort the save.
   * Use for validation or confirmation dialogs.
   */
  beforeSave?: (form: T) => boolean | Promise<boolean>;

  /**
   * Optional post-save hook for side-effects (e.g. applying theme,
   * showing a success toast).
   */
  afterSave?: (form: T) => void | Promise<void>;
}

export interface UsePreferenceFormReturn<T> {
  /** The live, mutable form state. Bind to UI controls via v-model. */
  form: Ref<T>;

  /**
   * Computed flag: `true` when the form has diverged from the saved
   * snapshot. Drives the action bar's dirty styling.
   *
   * Uses JSON snapshot + deep equality (same as desktop `isEqual`).
   */
  isDirty: Ref<boolean>;

  /** Persist the current form and update the saved baseline. */
  handleSave: () => Promise<void>;

  /** Revert the form to the last saved baseline. */
  handleReset: () => void;

  /**
   * Marks the current form state as the saved baseline.
   * Use after loading initial data from storage.
   */
  resetSnapshot: () => void;

  /**
   * Partially update the saved snapshot without marking the entire form
   * clean. Use for fields that persist immediately (e.g. theme toggle)
   * so they don't contribute to dirty state while other unsaved edits
   * retain their dirty flag.
   *
   * Ref: desktop usePreferenceForm.ts L138-140
   */
  patchSnapshot: (patch: Partial<T>) => void;
}

/**
 * Creates a preference form with snapshot-based dirty tracking.
 *
 * @example
 * ```ts
 * const { form, isDirty, handleSave, handleReset } = usePreferenceForm({
 *   buildForm: () => ({ port: 16800, secret: '' }),
 *   persist: async (f) => chrome.storage.local.set({ connection: f }),
 * });
 * ```
 */
export function usePreferenceForm<T extends object>(
  options: UsePreferenceFormOptions<T>,
): UsePreferenceFormReturn<T> {
  // ── Reactive State ──────────────────────────────────────────────

  const form: Ref<T> = ref(options.buildForm()) as Ref<T>;
  const savedSnapshot: Ref<T> = ref(snapshot(options.buildForm())) as Ref<T>;

  // Ref: desktop usePreferenceForm.ts L65
  const isDirty = computed(() => !deepEqual(snapshot(form.value), savedSnapshot.value));

  // ── Save ────────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    if (options.beforeSave && !(await options.beforeSave(form.value as T))) {
      return;
    }

    await options.persist(form.value as T);

    // Only update snapshot AFTER persistence succeeds.
    // Ref: desktop usePreferenceForm.ts L113-116
    savedSnapshot.value = snapshot(form.value) as T;

    await options.afterSave?.(form.value as T);
  }

  // ── Reset ───────────────────────────────────────────────────────

  function handleReset(): void {
    // Revert form to the saved baseline.
    // Ref: desktop usePreferenceForm.ts L123-126
    Object.assign(form.value as object, snapshot(savedSnapshot.value));
  }

  // ── Snapshot Management ─────────────────────────────────────────

  function resetSnapshot(): void {
    // Ref: desktop usePreferenceForm.ts L128-131
    savedSnapshot.value = snapshot(form.value) as T;
  }

  function patchSnapshot(patch: Partial<T>): void {
    // Ref: desktop usePreferenceForm.ts L138-140
    savedSnapshot.value = { ...savedSnapshot.value, ...patch } as T;
  }

  return {
    form,
    isDirty: isDirty as Ref<boolean>,
    handleSave,
    handleReset,
    resetSnapshot,
    patchSnapshot,
  };
}
