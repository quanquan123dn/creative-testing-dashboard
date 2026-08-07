export function extractCreativeCode(name: string): string {
  if (!name) return '';
  // Matches typical creative codes like VE0094, PA0128, CC0003, BN0052, etc.
  const match = name.match(/(?:VE|PA|ST|VD|PL|PI|PE|CV|CH|CC|BN|GP)[_-]?\d+/i);
  if (match) {
    return match[0].replace(/[-_]/g, '').toUpperCase();
  }
  return '';
}
