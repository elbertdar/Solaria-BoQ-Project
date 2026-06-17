import { toCsv, downloadCsv, csvFilename } from '../engine/csv.js';

// Drop-in "Export CSV" button. Exports exactly the `rows` it's handed (i.e. the page's
// current filtered view) using the supplied column spec. Shows the row count and disables
// itself when there's nothing to export.
export default function ExportButton({ table, rows, columns, label = 'Export CSV' }) {
  const n = rows?.length || 0;
  const onClick = () => { if (n) downloadCsv(csvFilename(table), toCsv(rows, columns)); };
  return (
    <button className="btn ghost" onClick={onClick} disabled={!n}
      title={n ? `Export ${n} row${n === 1 ? '' : 's'} to CSV` : 'Nothing to export'}>
      ⬇ {label}{n ? ` (${n})` : ''}
    </button>
  );
}
