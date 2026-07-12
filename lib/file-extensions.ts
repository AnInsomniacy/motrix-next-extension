export function normalizeFileExtension(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/^\.+/, '');
  if (!normalized) return null;
  if (!/^[a-z0-9]+(?:\.[a-z0-9]+)*$/.test(normalized)) return null;
  return normalized;
}

export function normalizeFileExtensionList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    for (const token of value.split(/[,\s]+/)) {
      const extension = normalizeFileExtension(token);
      if (!extension || seen.has(extension)) continue;
      seen.add(extension);
      normalized.push(extension);
    }
  }

  return normalized;
}

export function resolveFileExtension(
  filenames: readonly (string | null | undefined)[],
): string | null {
  for (const filename of filenames) {
    if (!filename) continue;

    const basename = filename
      .trim()
      .replace(/^.*[/\\]/, '')
      .toLowerCase();
    if (!basename || basename === 'download') continue;

    const dot = basename.indexOf('.');
    if (dot <= 0 || dot === basename.length - 1) continue;

    return basename.slice(dot + 1);
  }

  return null;
}

export function matchesFileExtension(extension: string, configured: string): boolean {
  return extension === configured || extension.endsWith(`.${configured}`);
}
