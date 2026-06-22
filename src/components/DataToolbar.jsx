import { useStore } from '../store/StoreContext.jsx';
import { exportColumns } from '../engine/dataImport.js';
import ExportButton from './ExportButton.jsx';
import ImportButton from './ImportButton.jsx';

// Paired CSV Export + Import for one entity (materials | suppliers | projects | boq). Export
// columns mirror the import spec, so what you export re-imports cleanly. `rows` is the data to
// export; `context` is passed to the importer (e.g. { currentProjectId } for BoQ).
export default function DataToolbar({ entity, rows, context }) {
  const { db } = useStore();
  return (
    <>
      <ExportButton table={entity} rows={rows} columns={exportColumns(db, entity)} />
      <ImportButton entity={entity} context={context} />
    </>
  );
}
