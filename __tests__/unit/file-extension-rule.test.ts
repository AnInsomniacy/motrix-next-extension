import { describe, expect, it } from 'vitest';
import {
  normalizeFileExtension,
  normalizeFileExtensionList,
  resolveFileExtension,
} from '@/lib/file-extensions';

describe('file extension rule helpers', () => {
  it('normalizes extensions from comma and whitespace separated input', () => {
    expect(normalizeFileExtensionList(['.JPG, png txt', 'tar.gz', 'jpg'])).toEqual([
      'jpg',
      'png',
      'txt',
      'tar.gz',
    ]);
  });

  it('rejects invalid extension tokens', () => {
    expect(normalizeFileExtension('bad value')).toBeNull();
    expect(normalizeFileExtension('../jpg')).toBeNull();
    expect(normalizeFileExtension('.')).toBeNull();
  });

  it('resolves the first usable extension from filename candidates', () => {
    expect(resolveFileExtension(['download', 'archive.tar.gz'])).toBe('tar.gz');
  });
});
