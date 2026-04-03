import { describe, it, expect } from 'vitest';
import { buildProtocolUrl, ProtocolAction } from '@/modules/protocol/launcher';

describe('buildProtocolUrl', () => {
  it('builds a bare launch URL with no action', () => {
    const url = buildProtocolUrl();
    expect(url).toBe('motrixnext://');
  });

  it('builds a new-task URL with encoded download URL', () => {
    const url = buildProtocolUrl(ProtocolAction.NewTask, {
      url: 'https://example.com/file with spaces.zip',
    });
    expect(url).toBe('motrixnext://new?url=https%3A%2F%2Fexample.com%2Ffile%20with%20spaces.zip');
  });

  it('builds a new-task URL with referer', () => {
    const url = buildProtocolUrl(ProtocolAction.NewTask, {
      url: 'https://example.com/file.zip',
      ref: 'https://example.com/page',
    });
    expect(url).toContain('url=https%3A%2F%2Fexample.com%2Ffile.zip');
    expect(url).toContain('ref=https%3A%2F%2Fexample.com%2Fpage');
  });

  it('builds a tasks URL', () => {
    const url = buildProtocolUrl(ProtocolAction.Tasks);
    expect(url).toBe('motrixnext://tasks');
  });

  it('handles special characters in URL parameters', () => {
    const url = buildProtocolUrl(ProtocolAction.NewTask, {
      url: 'https://example.com/file?name=foo&bar=baz',
    });
    expect(url).toContain('url=https%3A%2F%2Fexample.com%2Ffile%3Fname%3Dfoo%26bar%3Dbaz');
  });

  it('omits empty optional parameters', () => {
    const url = buildProtocolUrl(ProtocolAction.NewTask, {
      url: 'https://example.com/file.zip',
      ref: '',
    });
    expect(url).not.toContain('ref=');
  });
});
