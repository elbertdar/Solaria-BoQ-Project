// CSV export utilities.
// - RFC-4180 quoting (commas, quotes, newlines).
// - Formula-injection guard: a cell starting with = + - @ tab or CR is prefixed with an
//   apostrophe so spreadsheets don't execute it.
// - Output written with a UTF-8 BOM so Excel reads accents / Rupiah correctly.
// Columns are declared per table as { header, value: (row) => any }, keeping the export
// in lockstep with what each page already shows (resolved names, not raw ids).

function cell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;            // injection guard
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(',')).join('\r\n');
  return head + (body ? '\r\n' + body : '');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// yyyy-mm-dd (sortable in spreadsheets); passes through unknown strings unchanged.
export function csvDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function csvFilename(table) {
  return `solaria-${table}-${csvDate(new Date())}.csv`;
}
