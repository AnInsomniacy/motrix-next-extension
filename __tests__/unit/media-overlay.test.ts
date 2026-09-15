import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as messages from '@/lib/media/messages';
import { fakeBrowser } from 'wxt/testing';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createPlayerOverlay } from '@/lib/media/player-overlay';

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers();
  document.body.replaceChildren();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('keeps a dismissed player hidden across scrolling, resets for a new source, and removes its UI on invalidation', async () => {
  vi.spyOn(messages, 'sendMediaCommand').mockResolvedValue({
    host: 'example.com',
    enabled: true,
    excluded: false,
    items: [],
  });
  let shadow: ShadowRoot | undefined;
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, options) {
    const result = attach.call(this, options);
    if (this.localName === 'rayburst-media-control') shadow = result;
    return result;
  });
  const ctx = new ContentScriptContext('media-overlay-test');
  const overlay = await createPlayerOverlay(ctx, (key) => key);
  const video = document.createElement('video');
  video.src = 'https://example.com/one.mp4';
  document.body.append(video);
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 400, 200));
  await overlay.show(video);
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('rayburst-media-control')).not.toBeNull();
  const buttons = shadow?.querySelectorAll('button');
  expect(buttons?.length).toBe(2);
  buttons?.[0]?.click();
  expect(document.querySelector('iframe')).toBeNull(); // Synthetic page clicks cannot open the UI.
  buttons?.[1]?.click();
  window.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('rayburst-media-control')).toBeNull();
  video.src = 'https://example.com/two.mp4';
  await overlay.show(video);
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('rayburst-media-control')).not.toBeNull();
  ctx.abort();
  window.dispatchEvent(new Event('resize'));
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('rayburst-media-control')).toBeNull();
});
