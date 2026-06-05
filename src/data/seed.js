// data/seed.js — initial dataset. Loaded once into localStorage on first run.
//
// Day-offset planning model:
//   - each project has a startDate (the anchor for "days after start")
//   - each material has leadTimeDays (his delivery-time database)
//   - each BoQ line has neededDayOffset (the primary input); order day is derived
//
// p-1 startDate is set dynamically to 32 days before "today" so the demo shows the
// same live spread (4 to order / 2 needed / 1 arriving this week) whenever it's opened.

const daysAgoISO = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const seed = {
  meta: { version: 5 },

  currentUser: { id: 'u-pic-1', name: 'Rina Hapsari', role: 'Purchasing PIC' },

  mandors: [
    { id: 'm-1', name: 'Pak Budi' },
    { id: 'm-2', name: 'Pak Santoso' },
    { id: 'm-3', name: 'Pak Joko' },
  ],

  users: [
    { id: 'u-est-1', name: 'Andi Pratama', role: 'Estimator' },
    { id: 'u-pm-1', name: 'Dewi Lestari', role: 'Project Manager' },
    { id: 'u-pic-1', name: 'Rina Hapsari', role: 'Purchasing PIC' },
    { id: 'u-pic-2', name: 'Fajar Nugroho', role: 'Purchasing PIC' },
  ],

  materialTypes: [
    { id: 'mt-drywall', name: 'Drywall & Partition', description: 'Gypsum board, hollow metal framing, and partition systems.' },
    { id: 'mt-timber', name: 'Timber & Board', description: 'Plywood, multiplek, and other board and timber materials.' },
    { id: 'mt-electrical', name: 'Electrical', description: 'Cabling, switches, sockets, and electrical fittings.' },
    { id: 'mt-finishes', name: 'Finishes', description: 'Tiles, paint, and surface finishing materials.' },
    { id: 'mt-structure', name: 'Structure', description: 'Reinforcing bar, cement, and structural materials.' },
    { id: 'mt-plumbing', name: 'Plumbing', description: 'Pipes, fittings, and water and sanitary materials.' },
  ],

  // Canonical catalogue (Feature 5.1). leadTimeDays = estimated delivery time.
  materials: [
    { id: 'mat-gypsum', canonicalName: 'Gypsum', aliases: ['Gypsum Aplus', 'Gipsum', 'Papan Gypsum 9mm'], defaultUnit: 'lembar', materialTypeId: 'mt-drywall', leadTimeDays: 7, estUnitCost: 65000 },
    { id: 'mat-hollow', canonicalName: 'Hollow Galvanis', aliases: ['Besi Hollow', 'Rangka Hollow 4x4'], defaultUnit: 'batang', materialTypeId: 'mt-drywall', leadTimeDays: 7, estUnitCost: 78000 },
    { id: 'mat-triplek', canonicalName: 'Triplek', aliases: ['Triplek 9mm', 'Plywood', 'Multiplek 9mm'], defaultUnit: 'lembar', materialTypeId: 'mt-timber', leadTimeDays: 10, estUnitCost: 122000 },
    { id: 'mat-keramik', canonicalName: 'Keramik', aliases: ['Keramik 60x60', 'Granit Tile', 'Ubin Keramik'], defaultUnit: 'm2', materialTypeId: 'mt-finishes', leadTimeDays: 21, estUnitCost: 148000 },
    { id: 'mat-cat', canonicalName: 'Cat Tembok', aliases: ['Cat Dulux', 'Cat Interior', 'Paint'], defaultUnit: 'pail', materialTypeId: 'mt-finishes', leadTimeDays: 5, estUnitCost: 850000 },
    { id: 'mat-kabel', canonicalName: 'Kabel NYM', aliases: ['Kabel NYM 3x2.5', 'Kabel Listrik'], defaultUnit: 'roll', materialTypeId: 'mt-electrical', leadTimeDays: 14, estUnitCost: 1480000 },
    { id: 'mat-saklar', canonicalName: 'Saklar & Stop Kontak', aliases: ['Saklar', 'Stop Kontak', 'Switch Socket'], defaultUnit: 'set', materialTypeId: 'mt-electrical', leadTimeDays: 10, estUnitCost: 95000 },
    { id: 'mat-besi', canonicalName: 'Besi Beton', aliases: ['Besi Beton D10', 'Rebar', 'Besi Ulir'], defaultUnit: 'batang', materialTypeId: 'mt-structure', leadTimeDays: 5, estUnitCost: 95000 },
    { id: 'mat-semen', canonicalName: 'Semen', aliases: ['Semen Tiga Roda', 'Portland Cement', 'Semen 50kg'], defaultUnit: 'sak', materialTypeId: 'mt-structure', leadTimeDays: 3, estUnitCost: 62000 },
    { id: 'mat-pipa', canonicalName: 'Pipa PVC', aliases: ['Pipa PVC 3 inch', 'Pipa Wavin'], defaultUnit: 'batang', materialTypeId: 'mt-plumbing', leadTimeDays: 7, estUnitCost: 130000 },
  ],

  projects: [
    { id: 'p-1', name: 'Solaria — Mall Kelapa Gading', code: 'SOL-KG-26', client: 'Solaria F&B', location: 'Jakarta Utara', startDate: daysAgoISO(32) },
    { id: 'p-2', name: 'Solaria — Tunjungan Plaza', code: 'SOL-TP-26', client: 'Solaria F&B', location: 'Surabaya', startDate: daysAgoISO(10) },
    { id: 'p-3', name: 'Solaria — Pondok Indah Mall', code: 'SOL-PIM-26', client: 'Solaria F&B', location: 'Jakarta Selatan', startDate: daysAgoISO(52) },
    { id: 'p-4', name: 'Solaria — Grand Indonesia', code: 'SOL-GI-26', client: 'Solaria F&B', location: 'Jakarta Pusat', startDate: daysAgoISO(48) },
    { id: 'p-5', name: 'Solaria — Paris Van Java', code: 'SOL-PVJ-26', client: 'Solaria F&B', location: 'Bandung', startDate: daysAgoISO(7) },
    { id: 'p-6', name: 'Solaria — Tunjungan Plaza 6', code: 'SOL-TP6-26', client: 'Solaria F&B', location: 'Surabaya', startDate: daysAgoISO(5) },
    { id: 'p-7', name: 'Solaria — Summarecon Bekasi', code: 'SOL-SMB-26', client: 'Solaria F&B', location: 'Bekasi', startDate: daysAgoISO(44) },
    { id: 'p-8', name: 'Solaria — Mall Panakkukang', code: 'SOL-MP-26', client: 'Solaria F&B', location: 'Makassar', startDate: daysAgoISO(60) },
    { id: 'p-9', name: 'Solaria — Sun Plaza', code: 'SOL-SP-26', client: 'Solaria F&B', location: 'Medan', startDate: daysAgoISO(50) },
    { id: 'p-10', name: 'Solaria — Beachwalk', code: 'SOL-BW-26', client: 'Solaria F&B', location: 'Bali', startDate: daysAgoISO(12) },
    { id: 'p-11', name: 'Solaria — Pakuwon Mall', code: 'SOL-PWM-26', client: 'Solaria F&B', location: 'Surabaya', startDate: daysAgoISO(46) },
    { id: 'p-12', name: 'Solaria — Living World', code: 'SOL-LW-26', client: 'Solaria F&B', location: 'Tangerang', startDate: daysAgoISO(9) },
  ],

  suppliers: [
    { id: 's-1', name: 'PT Sumber Bangunan Jaya', materialTypeIds: ['mt-drywall', 'mt-timber', 'mt-structure'], location: 'Jakarta Utara', contact: { phone: '021-4567890', email: 'sales@sbj.co.id', address: 'Jl. Yos Sudarso 12, Jakarta' } },
    { id: 's-2', name: 'Toko Material Gading', materialTypeIds: ['mt-drywall', 'mt-finishes'], location: 'Jakarta Utara', contact: { phone: '021-4512345', email: 'order@materialgading.id', address: 'Jl. Boulevard Raya 88, Jakarta' } },
    { id: 's-3', name: 'CV Elektrindo Sentosa', materialTypeIds: ['mt-electrical'], location: 'Jakarta Pusat', contact: { phone: '021-3398765', email: 'cs@elektrindo.co.id', address: 'Jl. Cikini Raya 5, Jakarta' } },
    { id: 's-4', name: 'PT Beton Perkasa', materialTypeIds: ['mt-structure', 'mt-plumbing'], location: 'Bekasi', contact: { phone: '021-8891234', email: 'sales@betonperkasa.id', address: 'Kawasan Industri MM2100, Bekasi' } },
    { id: 's-5', name: 'Surya Keramik & Finishing', materialTypeIds: ['mt-finishes'], location: 'Tangerang', contact: { phone: '021-5567788', email: 'info@suryakeramik.id', address: 'Jl. Gatot Subroto 21, Tangerang' } },
  ],

  // BoQ items (Feature 5.2). neededDayOffset = days after project start the material
  // is needed (the primary input). Order day is derived = needed − material lead time.
  // Offsets chosen so that, with today ≈ day 32, every schedule bucket is populated.
  boqItems: [
    { id: 'b-1', projectId: 'p-1', materialId: 'mat-gypsum', description: 'Partisi area dining, ketebalan 9mm', quantity: 180, unit: 'lembar', expectedUnitCost: 65000, neededDayOffset: 41, mandorId: 'm-1', audit: [] },
    { id: 'b-2', projectId: 'p-1', materialId: 'mat-hollow', description: 'Rangka plafon & partisi 4x4', quantity: 220, unit: 'batang', expectedUnitCost: 78000, neededDayOffset: 38, mandorId: 'm-1', audit: [] },
    { id: 'b-3', projectId: 'p-1', materialId: 'mat-triplek', description: 'Backing kitchen & bar counter', quantity: 100, unit: 'lembar', expectedUnitCost: 120000, neededDayOffset: 33, mandorId: 'm-2', audit: [] },
    { id: 'b-4', projectId: 'p-1', materialId: 'mat-keramik', description: 'Lantai dining & kasir, 60x60 unpolished', quantity: 340, unit: 'm2', expectedUnitCost: 95000, neededDayOffset: 34, mandorId: 'm-2', audit: [] },
    { id: 'b-5', projectId: 'p-1', materialId: 'mat-cat', description: 'Cat dinding interior, putih + aksen', quantity: 24, unit: 'pail', expectedUnitCost: 850000, neededDayOffset: 46, mandorId: 'm-2', audit: [] },
    { id: 'b-6', projectId: 'p-1', materialId: 'mat-kabel', description: 'Instalasi titik lampu & power', quantity: 18, unit: 'roll', expectedUnitCost: 1450000, neededDayOffset: 26, mandorId: 'm-3', audit: [] },
    { id: 'b-7', projectId: 'p-1', materialId: 'mat-saklar', description: 'Saklar & stop kontak area servis', quantity: 60, unit: 'set', expectedUnitCost: 85000, neededDayOffset: 44, mandorId: 'm-3', audit: [] },
    { id: 'b-8', projectId: 'p-1', materialId: 'mat-besi', description: 'Penguatan meja beton & ramp, D10', quantity: 120, unit: 'batang', expectedUnitCost: 95000, neededDayOffset: 21, mandorId: 'm-1', audit: [] },
    { id: 'b-9', projectId: 'p-1', materialId: 'mat-semen', description: 'Adukan & screeding lantai', quantity: 150, unit: 'sak', expectedUnitCost: 62000, neededDayOffset: 20, mandorId: 'm-1', audit: [] },
    { id: 'b-10', projectId: 'p-1', materialId: 'mat-pipa', description: 'Saluran air bersih & kotor pantry', quantity: 45, unit: 'batang', expectedUnitCost: 130000, neededDayOffset: 45, mandorId: 'm-3', audit: [] },
    { id: 'b-11', projectId: 'p-3', materialId: 'mat-keramik', description: 'Lantai area makan utama', quantity: 220, unit: 'm2', expectedUnitCost: 145000, neededDayOffset: 40, mandorId: 'm-1', audit: [] },
    { id: 'b-12', projectId: 'p-3', materialId: 'mat-cat', description: 'Finishing dinding & plafon', quantity: 22, unit: 'pail', expectedUnitCost: 850000, neededDayOffset: 58, mandorId: 'm-2', audit: [] },
    { id: 'b-13', projectId: 'p-4', materialId: 'mat-gypsum', description: 'Partisi & bulkhead', quantity: 160, unit: 'lembar', expectedUnitCost: 65000, neededDayOffset: 35, mandorId: 'm-1', audit: [] },
    { id: 'b-14', projectId: 'p-4', materialId: 'mat-semen', description: 'Screeding lantai dapur', quantity: 80, unit: 'sak', expectedUnitCost: 62000, neededDayOffset: 44, mandorId: 'm-2', audit: [] },
    { id: 'b-15', projectId: 'p-5', materialId: 'mat-gypsum', description: 'Partisi area dining', quantity: 140, unit: 'lembar', expectedUnitCost: 64000, neededDayOffset: 45, mandorId: 'm-1', audit: [] },
    { id: 'b-16', projectId: 'p-5', materialId: 'mat-pipa', description: 'Instalasi pipa pantry', quantity: 30, unit: 'batang', expectedUnitCost: 128000, neededDayOffset: 50, mandorId: 'm-3', audit: [] },
    { id: 'b-17', projectId: 'p-6', materialId: 'mat-hollow', description: 'Rangka plafon', quantity: 90, unit: 'batang', expectedUnitCost: 78000, neededDayOffset: 42, mandorId: 'm-1', audit: [] },
    { id: 'b-18', projectId: 'p-6', materialId: 'mat-besi', description: 'Penguatan struktur ramp', quantity: 50, unit: 'batang', expectedUnitCost: 95000, neededDayOffset: 48, mandorId: 'm-2', audit: [] },
    { id: 'b-19', projectId: 'p-7', materialId: 'mat-semen', description: 'Adukan & screeding', quantity: 60, unit: 'sak', expectedUnitCost: 62000, neededDayOffset: 20, mandorId: 'm-1', audit: [] },
    { id: 'b-20', projectId: 'p-7', materialId: 'mat-besi', description: 'Besi tulangan meja beton', quantity: 40, unit: 'batang', expectedUnitCost: 95000, neededDayOffset: 25, mandorId: 'm-2', audit: [] },
    { id: 'b-21', projectId: 'p-8', materialId: 'mat-gypsum', description: 'Partisi & plafon', quantity: 90, unit: 'lembar', expectedUnitCost: 65000, neededDayOffset: 30, mandorId: 'm-1', audit: [] },
    { id: 'b-22', projectId: 'p-8', materialId: 'mat-keramik', description: 'Lantai dining & toilet', quantity: 55, unit: 'm2', expectedUnitCost: 150000, neededDayOffset: 35, mandorId: 'm-3', audit: [] },
    { id: 'b-23', projectId: 'p-9', materialId: 'mat-saklar', description: 'Titik saklar & stop kontak', quantity: 35, unit: 'set', expectedUnitCost: 95000, neededDayOffset: 40, mandorId: 'm-2', audit: [] },
    { id: 'b-24', projectId: 'p-9', materialId: 'mat-kabel', description: 'Instalasi listrik area dapur', quantity: 20, unit: 'roll', expectedUnitCost: 1480000, neededDayOffset: 46, mandorId: 'm-1', audit: [] },
    { id: 'b-25', projectId: 'p-10', materialId: 'mat-triplek', description: 'Backing panel & built-in', quantity: 70, unit: 'lembar', expectedUnitCost: 122000, neededDayOffset: 50, mandorId: 'm-1', audit: [] },
    { id: 'b-26', projectId: 'p-10', materialId: 'mat-cat', description: 'Cat dinding interior', quantity: 18, unit: 'pail', expectedUnitCost: 850000, neededDayOffset: 55, mandorId: 'm-2', audit: [] },
    { id: 'b-27', projectId: 'p-11', materialId: 'mat-pipa', description: 'Plumbing pantry & toilet', quantity: 35, unit: 'batang', expectedUnitCost: 130000, neededDayOffset: 38, mandorId: 'm-3', audit: [] },
    { id: 'b-28', projectId: 'p-11', materialId: 'mat-semen', description: 'Screeding & acian', quantity: 95, unit: 'sak', expectedUnitCost: 62000, neededDayOffset: 50, mandorId: 'm-1', audit: [] },
    { id: 'b-29', projectId: 'p-12', materialId: 'mat-gypsum', description: 'Partisi area dining & kasir', quantity: 130, unit: 'lembar', expectedUnitCost: 64000, neededDayOffset: 46, mandorId: 'm-1', audit: [] },
    { id: 'b-30', projectId: 'p-12', materialId: 'mat-hollow', description: 'Rangka plafon & drop ceiling', quantity: 75, unit: 'batang', expectedUnitCost: 78000, neededDayOffset: 52, mandorId: 'm-2', audit: [] },
  ],

  // Purchase Requests (Feature 5.4). Material inherited from BoQ item (BR-1).
  // Triplek is deliberately over budget (committed 120 vs budget 100) → warning.
  prs: [],
};

// Phase 1 posture: the BoQ is filled in but starts as a DRAFT on every project, and there
// are no purchase requests yet — the user finalizes a BoQ and raises PRs from there.
for (const p of seed.projects) p.boqStatus = 'draft';
seed.boqStaged = []; // Phase 2: uncommitted working-phase row changes
seed.boqEdits = [];  // Phase 2: committed edit history (append-only)
seed.brands = [      // per-material brand variants (one row each); brand is chosen at PR time
  { id: 'br-gyp-jaya', materialId: 'mat-gypsum', name: 'Jayaboard' },
  { id: 'br-gyp-knauf', materialId: 'mat-gypsum', name: 'Knauf' },
  { id: 'br-gyp-aplus', materialId: 'mat-gypsum', name: 'Aplus' },
  { id: 'br-cat-dulux', materialId: 'mat-cat', name: 'Dulux' },
  { id: 'br-cat-jotun', materialId: 'mat-cat', name: 'Jotun' },
  { id: 'br-semen-tigaroda', materialId: 'mat-semen', name: 'Tiga Roda' },
  { id: 'br-semen-gresik', materialId: 'mat-semen', name: 'Gresik' },
];
