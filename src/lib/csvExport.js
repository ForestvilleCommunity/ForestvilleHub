export function downloadCSV(rows, filename = 'export.csv') {
  if (!rows || rows.length === 0) { alert('No data to export.'); return; }
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Neutralize formula injection: Excel/Sheets treat a leading =+-@ as the
    // start of a live formula, which can exfiltrate data or run commands
    // when a member/team export is opened by an admin. A leading tab keeps
    // the value visually identical but stops it being parsed as a formula.
    if (/^[=+\-@]/.test(s)) s = '\t' + s;
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}