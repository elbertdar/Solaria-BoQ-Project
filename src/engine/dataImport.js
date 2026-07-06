// engine/dataImport.js — CSV import for the four core entities.
//
// One column spec per entity drives everything: the requirements shown to the user, the
// CSV template, header matching, and validation. Headers match case-insensitively and in
// any order; columns the user omits fall back to defaults (or stay blank) so an import can
// always "go ahead" with just the required columns present.
//
// applyImport() is PURE: given a db it returns { db: nextDb, result }. The modal calls it
// against the live db for a preview; the store re-runs it inside setDb to commit. Foreign
// keys are resolved by name and lightweight ones (material types, mandors, project types,
// and — for BoQ — unknown materials) are created on the fly. A row that fails validation is
// skipped and creates nothing.

import { nowISO, isoDate } from './format.js';
import { resolveMaterial } from './match.js';

export const IMPORT_SPECS = {
  materials: {
    label: 'Materials',
    collection: 'materials',
    columns: [
      { header: 'Canonical name', required: true, hint: 'The one true name for this material', example: 'Gypsum' },
      { header: 'Default unit', required: true, hint: 'lembar, m2, sak…', example: 'lembar' },
      { header: 'Type', hint: 'Material type — created if it doesn’t exist', example: 'Drywall & Partition' },
      { header: 'Est. unit cost', kind: 'number', hint: 'IDR, digits only', example: '65000' },
      { header: 'Lead time', kind: 'number', hint: 'Days to deliver after ordering', example: '7' },
      { header: 'Aliases', kind: 'list', hint: 'Other names, separated by ;', example: 'Gipsum; Papan Gypsum' },
    ],
  },
  suppliers: {
    label: 'Suppliers',
    collection: 'suppliers',
    columns: [
      { header: 'Supplier', required: true, hint: 'Company / vendor name', example: 'PT Sumber Bangunan Jaya' },
      { header: 'Material types', kind: 'list', hint: 'Separated by ; — created if new', example: 'Drywall & Partition; Structure' },
      { header: 'Location', example: 'Jakarta Utara' },
      { header: 'Phone', example: '021-4567890' },
      { header: 'Email', example: 'sales@example.co.id' },
      { header: 'Address', example: 'Jl. Yos Sudarso 12' },
    ],
  },
  projects: {
    label: 'Projects',
    collection: 'projects',
    columns: [
      { header: 'Name', required: true, example: 'Solaria — Mall Taman Anggrek' },
      { header: 'Start date', required: true, kind: 'date', hint: 'YYYY-MM-DD — the schedule counts days from it', example: '2026-06-01' },
      { header: 'Code', example: 'SOL-TA-26' },
      { header: 'Client', hint: 'Defaults to Solaria F&B', example: 'Solaria F&B' },
      { header: 'Location', example: 'Jakarta Barat' },
      { header: 'Type', hint: 'Project type — created if new', example: 'New store' },
    ],
  },
  boq: {
    label: 'BoQ line items',
    collection: 'boqItems',
    columns: [
      { header: 'Project', hint: 'Name or code — defaults to the current project', example: 'SOL-TA-26' },
      { header: 'Material', required: true, hint: 'Matched by name/alias — created if new', example: 'Gypsum' },
      { header: 'Quantity', kind: 'number', hint: 'Required unless an Allowance is given', example: '180' },
      { header: 'Unit', hint: 'Defaults to the material’s unit', example: 'lembar' },
      { header: 'Description', example: 'Partisi area dining' },
      { header: 'Mandor', hint: 'Created if new', example: 'Pak Budi' },
      { header: 'Expected unit cost', kind: 'number', hint: 'IDR — defaults to the material’s est. cost', example: '65000' },
      { header: 'Needed day offset', kind: 'number', hint: 'Days after project start the material is needed', example: '41' },
      { header: 'Lead time', kind: 'number', hint: 'Override the material’s lead time for this line', example: '7' },
      { header: 'Allowance', kind: 'number', hint: 'Lump-sum budget instead of a quantity', example: '' },
    ],
  },
};

// ---- cell coercion ----
const toNumber = (s) => {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const n = Number(t.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN; // NaN signals "given but unparseable"
};
const toList = (s) => String(s ?? '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
const toDate = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Number.isNaN(new Date(t + 'T00:00:00').getTime()) ? NaN : t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return NaN;
  return isoDate(d);
};

let _seq = 0;
const fallbackUid = (p) => `${p}-imp${(_seq++).toString(36)}`;

// Build a case-insensitive lookup from the parsed headers, then a getter by spec header.
function cellReader(parsedHeaders) {
  const map = new Map(parsedHeaders.map((h) => [h.trim().toLowerCase(), h]));
  return (rowObj, header) => {
    const key = map.get(header.toLowerCase());
    return key == null ? '' : String(rowObj[key] ?? '').trim();
  };
}

// Resolve-or-create helpers over working collections (mutated in place). Each tracks the
// names it newly creates so the preview can warn "will create N …".
function makeEnsure(list, { uid, prefix, match, make, created }) {
  return (name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    const hit = list.find((x) => match(x).toLowerCase() === n.toLowerCase());
    if (hit) return hit.id;
    const rec = make(uid(prefix), n);
    list.push(rec);
    created.push(n);
    return rec.id;
  };
}

export function applyImport(db, entity, parsed, context = {}, uid = fallbackUid) {
  const spec = IMPORT_SPECS[entity];
  if (!spec) throw new Error(`Unknown import entity: ${entity}`);
  const cell = cellReader(parsed.headers || []);
  const present = new Set((parsed.headers || []).map((h) => h.trim().toLowerCase()));
  const missingRequired = spec.columns.filter((c) => c.required && !present.has(c.header.toLowerCase())).map((c) => c.header);
  const specHeaders = new Set(spec.columns.map((c) => c.header.toLowerCase()));
  const unknownHeaders = (parsed.headers || []).filter((h) => h.trim() && !specHeaders.has(h.trim().toLowerCase()));

  // Working copies of every collection the import may touch.
  const materials = [...(db.materials || [])];
  const materialTypes = [...(db.materialTypes || [])];
  const mandors = [...(db.mandors || [])];
  const projectTypes = [...(db.projectTypes || [])];
  const projects = [...(db.projects || [])];
  const phases = [...(db.phases || [])];
  const suppliers = [...(db.suppliers || [])];
  const boqItems = [...(db.boqItems || [])];

  const created = { materialTypes: [], mandors: [], projectTypes: [], materials: [] };
  const ensureType = makeEnsure(materialTypes, { uid, prefix: 'mt', match: (x) => x.name, created: created.materialTypes,
    make: (id, name) => ({ id, name, description: '' }) });
  const ensureMandor = makeEnsure(mandors, { uid, prefix: 'm', match: (x) => x.name, created: created.mandors,
    make: (id, name) => ({ id, name }) });
  const ensureProjectType = makeEnsure(projectTypes, { uid, prefix: 'pt', match: (x) => x.name, created: created.projectTypes,
    make: (id, name) => ({ id, name }) });

  const firstPhaseOf = (projectId) => {
    const phs = phases.filter((p) => p.projectId === projectId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (phs[0]) return phs[0].id;
    const id = uid('ph');
    phases.push({ id, projectId, name: 'Phase 1', order: 0, boqStatus: 'draft', createdAt: nowISO() });
    return id;
  };
  const ensureMaterial = (name, unit) => {
    const hit = resolveMaterial(materials, name);
    if (hit) return hit;
    const rec = { id: uid('mat'), canonicalName: String(name).trim(), aliases: [], defaultUnit: unit || '', materialTypeId: null, leadTimeDays: null, estUnitCost: null };
    materials.push(rec);
    created.materials.push(rec.canonicalName);
    return rec;
  };

  const rows = [];
  (parsed.rows || []).forEach((r, i) => {
    const n = i + 1;
    const issues = [];
    const fail = (msg) => issues.push(msg);

    if (entity === 'materials') {
      const name = cell(r, 'Canonical name');
      const unit = cell(r, 'Default unit');
      if (!name) fail('Canonical name is required');
      if (!unit) fail('Default unit is required');
      const cost = toNumber(cell(r, 'Est. unit cost'));
      const lead = toNumber(cell(r, 'Lead time'));
      if (Number.isNaN(cost)) fail('Est. unit cost is not a number');
      if (Number.isNaN(lead)) fail('Lead time is not a number');
      if (name && materials.some((m) => m.canonicalName.toLowerCase() === name.toLowerCase())) fail(`“${name}” already exists`);
      if (issues.length) { rows.push({ n, status: 'skip', issues, label: name || '(blank)' }); return; }
      materials.push({
        id: uid('mat'), canonicalName: name, aliases: toList(cell(r, 'Aliases')), defaultUnit: unit,
        materialTypeId: cell(r, 'Type') ? ensureType(cell(r, 'Type')) : null,
        estUnitCost: cost, leadTimeDays: lead,
      });
      rows.push({ n, status: 'ready', label: name });

    } else if (entity === 'suppliers') {
      const name = cell(r, 'Supplier');
      if (!name) fail('Supplier name is required');
      if (issues.length) { rows.push({ n, status: 'skip', issues, label: '(blank)' }); return; }
      suppliers.push({
        id: uid('s'), name, location: cell(r, 'Location'),
        materialTypeIds: toList(cell(r, 'Material types')).map((t) => ensureType(t)).filter(Boolean),
        contact: { phone: cell(r, 'Phone'), email: cell(r, 'Email'), address: cell(r, 'Address') },
      });
      rows.push({ n, status: 'ready', label: name });

    } else if (entity === 'projects') {
      const name = cell(r, 'Name');
      const startRaw = cell(r, 'Start date');
      const start = toDate(startRaw);
      if (!name) fail('Name is required');
      if (!startRaw) fail('Start date is required');
      else if (Number.isNaN(start)) fail(`Start date “${startRaw}” isn’t a valid date (use YYYY-MM-DD)`);
      if (issues.length) { rows.push({ n, status: 'skip', issues, label: name || '(blank)' }); return; }
      const id = uid('p');
      projects.push({
        id, name, code: cell(r, 'Code'), client: cell(r, 'Client') || 'Solaria F&B',
        location: cell(r, 'Location'), startDate: start, boqStatus: 'draft',
        projectTypeId: cell(r, 'Type') ? ensureProjectType(cell(r, 'Type')) : null,
      });
      phases.push({ id: uid('ph'), projectId: id, name: 'Phase 1', order: 0, boqStatus: 'draft', createdAt: nowISO() });
      rows.push({ n, status: 'ready', label: name });

    } else if (entity === 'boq') {
      const projRef = cell(r, 'Project');
      const proj = projRef
        ? (projects.find((p) => (p.code || '').toLowerCase() === projRef.toLowerCase())
          || projects.find((p) => p.name.toLowerCase() === projRef.toLowerCase()))
        : projects.find((p) => p.id === context.currentProjectId);
      const matName = cell(r, 'Material');
      const qty = toNumber(cell(r, 'Quantity'));
      const allowance = toNumber(cell(r, 'Allowance'));
      const cost = toNumber(cell(r, 'Expected unit cost'));
      const needed = toNumber(cell(r, 'Needed day offset'));
      const lead = toNumber(cell(r, 'Lead time'));
      const isAllowance = allowance != null && !Number.isNaN(allowance) && allowance > 0 && (qty == null);

      if (!proj) fail(projRef ? `Unknown project “${projRef}”` : 'No project — open a project first or add a Project column');
      if (!matName) fail('Material is required');
      if (!isAllowance && (qty == null)) fail('Quantity is required (or give an Allowance)');
      [['Quantity', qty], ['Allowance', allowance], ['Expected unit cost', cost], ['Needed day offset', needed], ['Lead time', lead]]
        .forEach(([lbl, v]) => { if (Number.isNaN(v)) fail(`${lbl} is not a number`); });
      if (issues.length) { rows.push({ n, status: 'skip', issues, label: matName || '(blank)' }); return; }

      const mat = ensureMaterial(matName, cell(r, 'Unit'));
      boqItems.push({
        id: uid('b'), projectId: proj.id, phaseId: firstPhaseOf(proj.id),
        materialId: mat.id, description: cell(r, 'Description') || '',
        mandorId: cell(r, 'Mandor') ? ensureMandor(cell(r, 'Mandor')) : null,
        budgetBasis: isAllowance ? 'allowance' : 'quantity',
        quantity: qty == null ? 0 : qty, unit: cell(r, 'Unit') || mat.defaultUnit || '',
        expectedUnitCost: cost == null ? (mat.estUnitCost || 0) : cost,
        allowanceAmount: allowance == null || Number.isNaN(allowance) ? 0 : allowance,
        neededDayOffset: needed == null ? null : needed,
        leadTimeDays: lead == null ? null : lead,
        audit: [{ at: nowISO(), change: 'imported' }],
      });
      rows.push({ n, status: 'ready', label: `${matName}${proj ? ` · ${proj.code || proj.name}` : ''}` });
    }
  });

  const ready = rows.filter((x) => x.status === 'ready').length;
  const result = {
    entity, columns: spec.columns, label: spec.label,
    headers: parsed.headers || [], missingRequired, unknownHeaders,
    rows, total: rows.length, ready, skipped: rows.length - ready,
    created,
  };
  const nextDb = { ...db, materials, materialTypes, mandors, projectTypes, projects, phases, suppliers, boqItems };
  return { db: nextDb, result };
}

// CSV template (header row + one example row) for the "Download template" button.
export function importTemplate(entity) {
  const spec = IMPORT_SPECS[entity];
  const esc = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const headers = spec.columns.map((c) => c.header);
  const example = spec.columns.map((c) => c.example ?? '');
  return [headers.map(esc).join(','), example.map(esc).join(',')].join('\r\n');
}

// Export columns whose headers exactly mirror the import spec, with foreign keys resolved back
// to the names the importer expects — so an exported CSV round-trips straight back through import.
export function exportColumns(db, entity) {
  const n = (v) => (v == null || v === '' ? '' : String(v));
  const typeName = (id) => db.materialTypes.find((t) => t.id === id)?.name || '';
  const projTypeName = (id) => (db.projectTypes || []).find((t) => t.id === id)?.name || '';
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || '';
  const matName = (id) => db.materials.find((m) => m.id === id)?.canonicalName || '';
  const projRef = (id) => { const p = db.projects.find((x) => x.id === id); return p ? (p.code || p.name) : ''; };
  const COLS = {
    materials: [
      { header: 'Canonical name', value: (m) => m.canonicalName },
      { header: 'Default unit', value: (m) => m.defaultUnit },
      { header: 'Type', value: (m) => typeName(m.materialTypeId) },
      { header: 'Est. unit cost', value: (m) => n(m.estUnitCost) },
      { header: 'Lead time', value: (m) => n(m.leadTimeDays) },
      { header: 'Aliases', value: (m) => (m.aliases || []).join('; ') },
    ],
    suppliers: [
      { header: 'Supplier', value: (s) => s.name },
      { header: 'Material types', value: (s) => (s.materialTypeIds || []).map(typeName).filter(Boolean).join('; ') },
      { header: 'Location', value: (s) => s.location },
      { header: 'Phone', value: (s) => s.contact?.phone },
      { header: 'Email', value: (s) => s.contact?.email },
      { header: 'Address', value: (s) => s.contact?.address },
    ],
    projects: [
      { header: 'Name', value: (p) => p.name },
      { header: 'Start date', value: (p) => p.startDate || '' },
      { header: 'Code', value: (p) => p.code },
      { header: 'Client', value: (p) => p.client },
      { header: 'Location', value: (p) => p.location },
      { header: 'Type', value: (p) => projTypeName(p.projectTypeId) },
    ],
    boq: [
      { header: 'Project', value: (b) => projRef(b.projectId) },
      { header: 'Material', value: (b) => matName(b.materialId) },
      { header: 'Quantity', value: (b) => n(b.quantity) },
      { header: 'Unit', value: (b) => b.unit },
      { header: 'Description', value: (b) => b.description },
      { header: 'Mandor', value: (b) => mandorName(b.mandorId) },
      { header: 'Expected unit cost', value: (b) => n(b.expectedUnitCost) },
      { header: 'Needed day offset', value: (b) => n(b.neededDayOffset) },
      { header: 'Lead time', value: (b) => n(b.leadTimeDays) },
      { header: 'Allowance', value: (b) => n(b.allowanceAmount) },
    ],
  };
  return COLS[entity] || [];
}
