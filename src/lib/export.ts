/**
 * Export data as CSV file and trigger download
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  filename: string
) {
  if (data.length === 0) return;

  // Build CSV header
  const header = columns.map(c => `"${c.label}"`).join(',');

  // Build CSV rows
  const rows = data.map(row =>
    columns.map(col => {
      const val = row[col.key];
      if (val === null || val === undefined) return '""';
      if (typeof val === 'number') return val.toString();
      // Escape quotes in strings
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');

  // Add BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
