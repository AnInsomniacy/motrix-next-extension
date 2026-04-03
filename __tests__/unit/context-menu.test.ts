import { describe, it, expect } from 'vitest';
import { ContextMenuService } from '@/lib/services/context-menu';

describe('ContextMenuService', () => {
  describe('buildMenuItems', () => {
    it('returns the standard menu item definition', () => {
      const items = ContextMenuService.buildMenuItems();

      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe('download-with-motrix-next');
      expect(items[0]?.title).toBeDefined();
      expect(items[0]?.contexts).toContain('link');
      expect(items[0]?.contexts).toContain('image');
      expect(items[0]?.contexts).toContain('audio');
      expect(items[0]?.contexts).toContain('video');
    });
  });

  describe('extractUrl', () => {
    it('extracts linkUrl from context menu info', () => {
      const url = ContextMenuService.extractUrl({
        linkUrl: 'https://example.com/file.zip',
        srcUrl: undefined,
        pageUrl: 'https://example.com',
      });
      expect(url).toBe('https://example.com/file.zip');
    });

    it('falls back to srcUrl when linkUrl is absent', () => {
      const url = ContextMenuService.extractUrl({
        linkUrl: undefined,
        srcUrl: 'https://example.com/image.jpg',
        pageUrl: 'https://example.com',
      });
      expect(url).toBe('https://example.com/image.jpg');
    });

    it('returns null when no URL is available', () => {
      const url = ContextMenuService.extractUrl({
        linkUrl: undefined,
        srcUrl: undefined,
        pageUrl: 'https://example.com',
      });
      expect(url).toBeNull();
    });
  });
});
