export function extractCreativeCode(name: string): string {
  if (!name) return '';
  // Matches typical creative codes like VE0094, PA0128, VE_0094, etc.
  const match = name.match(/(?:VE|PA|ST|VD|PL|PI|PE|CV|CH)[_-]?\d+/i);
  if (match) {
    return match[0].replace(/[-_]/g, '').toUpperCase();
  }
  return name.toUpperCase();
}
