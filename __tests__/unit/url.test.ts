import { describe, expect, it } from 'vitest';
import { extractFilenameFromUrl, parseContentDispositionHeader } from '@/lib/download/url';

function dispositionUrl(value: string, key = 'response-content-disposition'): string {
  return `https://cdn.example.com/hash?${key}=${encodeURIComponent(value)}`;
}

describe('extractFilenameFromUrl', () => {
  it('extracts and decodes usable path filenames', () => {
    const cases: Array<readonly [string, string]> = [
      ['https://cdn.example.com/a/app-v2.0.zip?token=secret', 'app-v2.0.zip'],
      ['https://example.com/files/%E6%96%87%E4%BB%B6.zip', '文件.zip'],
      ['https://example.com/a/b/release-notes.pdf', 'release-notes.pdf'],
    ];
    for (const [url, expected] of cases) expect(extractFilenameFromUrl(url)).toBe(expected);
  });

  it('rejects paths that do not identify downloadable files', () => {
    for (const url of [
      'https://example.com/download',
      'https://example.com/',
      'magnet:?xt=urn:btih:abc',
      'not-a-url',
      '',
    ]) {
      expect(extractFilenameFromUrl(url)).toBeNull();
    }
  });

  it('supports cloud Content-Disposition encodings and precedence', () => {
    const cases: Array<readonly [string, string]> = [
      [dispositionUrl('attachment; filename="test.zip"'), 'test.zip'],
      [dispositionUrl("attachment; filename*=UTF-8''%E6%97%A0%E5%B8%B8.xmgic"), '无常.xmgic'],
      [
        dispositionUrl('attachment; filename="=?UTF-8?B?0JjRgtC+0LPQuF8yMDI2LmRvY3g=?="'),
        'Итоги_2026.docx',
      ],
      [dispositionUrl('attachment; filename="=?UTF-8?Q?=E6=8A=A5=E5=91=8A.pdf?="'), '报告.pdf'],
      [
        dispositionUrl(
          'attachment; filename="fallback.txt"; filename*=UTF-8\'\'%E4%B8%AD%E6%96%87.txt',
        ),
        '中文.txt',
      ],
      [dispositionUrl('attachment; filename="alt.zip"', 'content-disposition'), 'alt.zip'],
    ];
    for (const [url, expected] of cases) expect(extractFilenameFromUrl(url)).toBe(expected);
  });

  it('prefers valid response metadata and falls back from malformed metadata', () => {
    expect(
      extractFilenameFromUrl(
        `https://cdn.example.com/path.zip?response-content-disposition=${encodeURIComponent(
          'attachment; filename="override.zip"',
        )}`,
      ),
    ).toBe('override.zip');
    expect(
      extractFilenameFromUrl(
        'https://cdn.example.com/good.zip?response-content-disposition=garbage',
      ),
    ).toBe('good.zip');
  });
});

describe('parseContentDispositionHeader', () => {
  it('decodes valid UTF-8 bytes in a legacy quoted filename', () => {
    const header = 'attachment; filename="IMG_3701.MOV ã\u0081®ã\u0082³ã\u0083\u0094ã\u0083¼"';

    expect(parseContentDispositionHeader(header)?.filename).toBe('IMG_3701.MOV のコピー');
  });

  it('preserves normal ASCII legacy filenames', () => {
    expect(parseContentDispositionHeader('attachment; filename="video.mp4"')?.filename).toBe(
      'video.mp4',
    );
  });

  it('preserves invalid UTF-8 legacy bytes unchanged', () => {
    expect(parseContentDispositionHeader('attachment; filename="caf\u00e9.mp4"')?.filename).toBe(
      'café.mp4',
    );
  });

  it('keeps filename* precedence over legacy filename=', () => {
    const header =
      'attachment; filename="fallback ã\u0081®.txt"; filename*=UTF-8\'\'%E3%81%AE%E3%82%B3%E3%83%94%E3%83%BC.txt';

    expect(parseContentDispositionHeader(header)?.filename).toBe('のコピー.txt');
  });
});
