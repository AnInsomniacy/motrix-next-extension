import { createIframeUi, createShadowRootUi } from '#imports';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { browser } from 'wxt/browser';
import { sendMediaCommand } from './messages';
import logo from '@/assets/rayburst-connect.svg?raw';

/** One movable, frame-local entry point. The full UI runs in an extension iframe. */
export async function createPlayerOverlay(
  ctx: ContentScriptContext,
  translate: (key: string) => string,
) {
  let player: HTMLMediaElement | undefined;
  let playerSource = '';
  let dismissed: HTMLMediaElement | undefined;
  let dismissedSource = '';
  let stopped = false;
  let panel: ReturnType<typeof createIframeUi> | undefined;
  let scheduled = 0;
  let revision = 0;
  const button = document.createElement('button');
  const label = document.createElement('span');
  const mark = new DOMParser().parseFromString(logo, 'image/svg+xml').documentElement;
  mark.setAttribute('width', '18');
  mark.setAttribute('height', '18');
  mark.setAttribute('aria-hidden', 'true');
  mark.querySelector('title')?.remove();
  button.append(document.importNode(mark, true), label);
  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  const ui = await createShadowRootUi(ctx, {
    name: 'rayburst-media-control',
    mode: 'closed',
    position: 'inline',
    isolateEvents: ['click', 'keydown', 'keyup', 'pointerdown'],
    css: `:host{position:fixed!important;z-index:2147483647!important;display:block!important}
      div{display:flex;gap:6px;font:500 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
      button{display:inline-flex;align-items:center;gap:7px;font:inherit;cursor:pointer;max-width:calc(100vw - 52px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;border-radius:999px;padding:8px 14px 8px 10px;background:linear-gradient(135deg,#a580ef 0%,#7945c8 100%);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 2px 6px rgba(0,0,0,.18),0 8px 22px -8px rgba(121,69,200,.6);transition:filter .12s ease,transform .12s ease}
      button:hover{filter:brightness(1.06)}button:active{transform:scale(.98)}
      button.close{padding:0;width:32px;justify-content:center;background:rgba(20,12,36,.72);color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.18)}
      svg{flex-shrink:0}span{overflow:hidden;text-overflow:ellipsis}
      button:focus-visible{outline:2px solid #fff;outline-offset:2px}
      @media(prefers-reduced-motion:reduce){button{transition:none}}`,
    onMount(container) {
      const bar = document.createElement('div');
      bar.append(button, close);
      container.append(bar);
    },
  });
  function localize() {
    label.textContent = `${translate('media_download')} · Rayburst`;
    button.setAttribute('aria-expanded', String(Boolean(panel)));
    close.setAttribute('aria-label', translate('media_close'));
    if (panel) panel.iframe.title = translate('media_options');
  }
  function closePanel() {
    panel?.remove();
    panel = undefined;
    localize();
  }
  function position() {
    scheduled = 0;
    if (stopped || !player || (dismissed === player && dismissedSource === playerSource)) return;
    const rect = player.getBoundingClientRect();
    const visible =
      player.isConnected &&
      rect.width >= 80 &&
      rect.height >= 24 &&
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth;
    if (!visible) {
      ui.remove();
      closePanel();
      return;
    }
    const anchor = document.fullscreenElement ?? document.body;
    // Native video fullscreen cannot contain siblings; leave playback unobstructed.
    if (!anchor || anchor instanceof HTMLMediaElement) {
      ui.remove();
      closePanel();
      return;
    }
    if (!ui.shadowHost.isConnected) ui.mount();
    if (ui.shadowHost.parentElement !== anchor) anchor.append(ui.shadowHost);
    const x = Math.max(
      8,
      Math.min(
        rect.right - ui.shadowHost.getBoundingClientRect().width - 8,
        innerWidth - ui.shadowHost.getBoundingClientRect().width - 8,
      ),
    );
    const y = Math.max(8, Math.min(rect.top + 8, innerHeight - 40));
    ui.shadowHost.style.left = `${x}px`;
    ui.shadowHost.style.top = `${y}px`;
    if (panel) {
      if (panel.wrapper.parentElement !== anchor) anchor.append(panel.wrapper);
      panel.wrapper.style.left = `${Math.max(0, Math.min(x, innerWidth - Math.min(420, innerWidth)))}px`;
      panel.wrapper.style.top = `${Math.max(0, Math.min(y + 38, innerHeight - Math.min(480, innerHeight - 48)))}px`;
    }
  }
  function schedule() {
    if (!scheduled && !stopped) scheduled = requestAnimationFrame(position);
  }
  const resize = new ResizeObserver(schedule);
  const intersection = new IntersectionObserver(schedule);
  async function show(next: HTMLMediaElement) {
    const source = next.currentSrc || next.src;
    if (stopped || (dismissed === next && dismissedSource === source)) return;
    if (player === next && playerSource === source && ui.shadowHost.isConnected) {
      schedule();
      return;
    }
    const generation = ++revision;
    // The background applies top-level site exclusions even for cross-origin frames.
    const state = await sendMediaCommand({ type: 'MEDIA_LIST', tabId: 0 }, true).catch(() => null);
    if (stopped || generation !== revision || !state?.enabled || state.excluded) return;
    closePanel();
    player = next;
    playerSource = source;
    resize.disconnect();
    intersection.disconnect();
    resize.observe(next);
    intersection.observe(next);
    localize();
    schedule();
  }
  button.addEventListener('click', (event) => {
    if (!event.isTrusted || !player) return;
    if (panel) {
      closePanel();
      return;
    }
    panel = createIframeUi(ctx, {
      page: '/media.html',
      position: 'inline',
      onBeforeMount(wrapper, iframe) {
        const url = new URL(browser.runtime.getURL('/media.html'));
        url.searchParams.set('source', player?.currentSrc || player?.src || '');
        iframe.src = url.href;
        iframe.title = translate('media_options');
        wrapper.style.cssText =
          'position:fixed;z-index:2147483646;width:min(420px,100vw);height:min(480px,calc(100vh - 48px));';
        iframe.style.cssText =
          'display:block;width:100%;height:100%;border:0;border-radius:16px;background:Canvas;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 24px 64px -16px rgba(20,12,36,.45);color-scheme:light dark;';
      },
    });
    panel.mount();
    localize();
    position();
    panel.iframe.focus();
  });
  close.addEventListener('click', () => {
    dismissed = player;
    dismissedSource = playerSource;
    closePanel();
    ui.remove();
  });
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closePanel();
      button.focus();
    }
  };
  const message = (event: MessageEvent) => {
    if (
      panel &&
      event.source === panel.iframe.contentWindow &&
      event.data === 'RAYBURST_MEDIA_CLOSE'
    ) {
      closePanel();
      button.focus();
    }
  };
  ctx.addEventListener(window, 'scroll', schedule, { capture: true, passive: true });
  ctx.addEventListener(window, 'resize', schedule, { passive: true });
  ctx.addEventListener(document, 'fullscreenchange', schedule);
  ctx.addEventListener(document, 'keydown', keydown);
  ctx.addEventListener(window, 'message', message);
  const stop = () => {
    stopped = true;
    revision++;
    cancelAnimationFrame(scheduled);
    resize.disconnect();
    intersection.disconnect();
    closePanel();
    ui.remove();
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    document.removeEventListener('fullscreenchange', schedule);
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('message', message);
  };
  ctx.onInvalidated(stop);
  return { show, stop, localize };
}
