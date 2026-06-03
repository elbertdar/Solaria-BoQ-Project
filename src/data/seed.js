// data/seed.js — initial dataset. Loaded once into localStorage on first run.
// Realistic Indonesian construction-procurement context. One active project.
// Deliberately includes one over-budget material (Triplek) to exercise warnings,
// and dates spread around early June 2026 so the Schedule tab populates on day one.

export const seed = {
  meta: { version: 2 },

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
    { id: 'mt-drywall', name: 'Drywall & Partition' },
    { id: 'mt-timber', name: 'Timber & Board' },
    { id: 'mt-electrical', name: 'Electrical' },
    { id: 'mt-finishes', name: 'Finishes' },
    { id: 'mt-structure', name: 'Structure' },
    { id: 'mt-plumbing', name: 'Plumbing' },
  ],

  // Canonical catalogue (Feature 5.1). aliases resolve to the canonical name.
  materials: [
    { id: 'mat-gypsum', canonicalName: 'Gypsum', aliases: ['Gypsum Aplus', 'Gipsum', 'Papan Gypsum 9mm'], defaultUnit: 'lembar', materialTypeId: 'mt-drywall' },
    { id: 'mat-hollow', canonicalName: 'Hollow Galvanis', aliases: ['Besi Hollow', 'Rangka Hollow 4x4'], defaultUnit: 'batang', materialTypeId: 'mt-drywall' },
    { id: 'mat-triplek', canonicalName: 'Triplek', aliases: ['Triplek 9mm', 'Plywood', 'Multiplek 9mm'], defaultUnit: 'lembar', materialTypeId: 'mt-timber' },
    { id: 'mat-keramik', canonicalName: 'Keramik', aliases: ['Keramik 60x60', 'Granit Tile', 'Ubin Keramik'], defaultUnit: 'm2', materialTypeId: 'mt-finishes' },
    { id: 'mat-cat', canonicalName: 'Cat Tembok', aliases: ['Cat Dulux', 'Cat Interior', 'Paint'], defaultUnit: 'pail', materialTypeId: 'mt-finishes' },
    { id: 'mat-kabel', canonicalName: 'Kabel NYM', aliases: ['Kabel NYM 3x2.5', 'Kabel Listrik'], defaultUnit: 'roll', materialTypeId: 'mt-electrical' },
    { id: 'mat-saklar', canonicalName: 'Saklar & Stop Kontak', aliases: ['Saklar', 'Stop Kontak', 'Switch Socket'], defaultUnit: 'set', materialTypeId: 'mt-electrical' },
    { id: 'mat-besi', canonicalName: 'Besi Beton', aliases: ['Besi Beton D10', 'Rebar', 'Besi Ulir'], defaultUnit: 'batang', materialTypeId: 'mt-structure' },
    { id: 'mat-semen', canonicalName: 'Semen', aliases: ['Semen Tiga Roda', 'Portland Cement', 'Semen 50kg'], defaultUnit: 'sak', materialTypeId: 'mt-structure' },
    { id: 'mat-pipa', canonicalName: 'Pipa PVC', aliases: ['Pipa PVC 3 inch', 'Pipa Wavin'], defaultUnit: 'batang', materialTypeId: 'mt-plumbing' },
  ],

  projects: [
    { id: 'p-1', name: 'Solaria — Mall Kelapa Gading', code: 'SOL-KG-26', client: 'Solaria F&B', location: 'Jakarta Utara' },
    { id: 'p-2', name: 'Solaria — Tunjungan Plaza', code: 'SOL-TP-26', client: 'Solaria F&B', location: 'Surabaya' },
  ],

  suppliers: [
    { id: 's-1', name: 'PT Sumber Bangunan Jaya', materialTypeIds: ['mt-drywall', 'mt-timber', 'mt-structure'], location: 'Jakarta Utara', contact: { phone: '021-4567890', email: 'sales@sbj.co.id', address: 'Jl. Yos Sudarso 12, Jakarta' } },
    { id: 's-2', name: 'Toko Material Gading', materialTypeIds: ['mt-drywall', 'mt-finishes'], location: 'Jakarta Utara', contact: { phone: '021-4512345', email: 'order@materialgading.id', address: 'Jl. Boulevard Raya 88, Jakarta' } },
    { id: 's-3', name: 'CV Elektrindo Sentosa', materialTypeIds: ['mt-electrical'], location: 'Jakarta Pusat', contact: { phone: '021-3398765', email: 'cs@elektrindo.co.id', address: 'Jl. Cikini Raya 5, Jakarta' } },
    { id: 's-4', name: 'PT Beton Perkasa', materialTypeIds: ['mt-structure', 'mt-plumbing'], location: 'Bekasi', contact: { phone: '021-8891234', email: 'sales@betonperkasa.id', address: 'Kawasan Industri MM2100, Bekasi' } },
    { id: 's-5', name: 'Surya Keramik & Finishing', materialTypeIds: ['mt-finishes'], location: 'Tangerang', contact: { phone: '021-5567788', email: 'info@suryakeramik.id', address: 'Jl. Gatot Subroto 21, Tangerang' } },
  ],

  // BoQ items (Feature 5.2). expectedUnitCost lives here (Q-7 default).
  // Dates chosen so that, around 2 Jun 2026, every schedule bucket is populated:
  //  overdue-to-order (Hollow, Keramik), late delivery (Kabel), order-this-week
  //  (Gypsum, Saklar), needed-this-week (Keramik, Triplek), next week (Pipa),
  //  later (Cat), done (Besi, Semen).
  boqItems: [
    { id: 'b-1', projectId: 'p-1', materialId: 'mat-gypsum', description: 'Partisi area dining, ketebalan 9mm', quantity: 180, unit: 'lembar', expectedUnitCost: 65000, schedulePurchaseDate: '2026-06-03', scheduleDeliveryDate: '2026-06-15', mandorId: 'm-1', audit: [] },
    { id: 'b-2', projectId: 'p-1', materialId: 'mat-hollow', description: 'Rangka plafon & partisi 4x4', quantity: 220, unit: 'batang', expectedUnitCost: 78000, schedulePurchaseDate: '2026-05-28', scheduleDeliveryDate: '2026-06-09', mandorId: 'm-1', audit: [] },
    { id: 'b-3', projectId: 'p-1', materialId: 'mat-triplek', description: 'Backing kitchen & bar counter', quantity: 100, unit: 'lembar', expectedUnitCost: 120000, schedulePurchaseDate: '2026-05-20', scheduleDeliveryDate: '2026-06-05', mandorId: 'm-2', audit: [] },
    { id: 'b-4', projectId: 'p-1', materialId: 'mat-keramik', description: 'Lantai dining & kasir, 60x60 unpolished', quantity: 340, unit: 'm2', expectedUnitCost: 95000, schedulePurchaseDate: '2026-05-26', scheduleDeliveryDate: '2026-06-06', mandorId: 'm-2', audit: [] },
    { id: 'b-5', projectId: 'p-1', materialId: 'mat-cat', description: 'Cat dinding interior, putih + aksen', quantity: 24, unit: 'pail', expectedUnitCost: 850000, schedulePurchaseDate: '2026-06-20', scheduleDeliveryDate: '2026-06-28', mandorId: 'm-2', audit: [] },
    { id: 'b-6', projectId: 'p-1', materialId: 'mat-kabel', description: 'Instalasi titik lampu & power', quantity: 18, unit: 'roll', expectedUnitCost: 1450000, schedulePurchaseDate: '2026-05-25', scheduleDeliveryDate: '2026-05-29', mandorId: 'm-3', audit: [] },
    { id: 'b-7', projectId: 'p-1', materialId: 'mat-saklar', description: 'Saklar & stop kontak area servis', quantity: 60, unit: 'set', expectedUnitCost: 85000, schedulePurchaseDate: '2026-06-05', scheduleDeliveryDate: '2026-06-12', mandorId: 'm-3', audit: [] },
    { id: 'b-8', projectId: 'p-1', materialId: 'mat-besi', description: 'Penguatan meja beton & ramp, D10', quantity: 120, unit: 'batang', expectedUnitCost: 95000, schedulePurchaseDate: '2026-05-12', scheduleDeliveryDate: '2026-05-22', mandorId: 'm-1', audit: [] },
    { id: 'b-9', projectId: 'p-1', materialId: 'mat-semen', description: 'Adukan & screeding lantai', quantity: 150, unit: 'sak', expectedUnitCost: 62000, schedulePurchaseDate: '2026-05-13', scheduleDeliveryDate: '2026-05-21', mandorId: 'm-1', audit: [] },
    { id: 'b-10', projectId: 'p-1', materialId: 'mat-pipa', description: 'Saluran air bersih & kotor pantry', quantity: 45, unit: 'batang', expectedUnitCost: 130000, schedulePurchaseDate: '2026-06-09', scheduleDeliveryDate: '2026-06-18', mandorId: 'm-3', audit: [] },
  ],

  // Purchase Requests (Feature 5.4). Material inherited from BoQ item (BR-1).
  // Triplek is deliberately over budget (committed 120 vs budget 100) → warning.
  prs: [
    { id: 'pr-1', boqItemId: 'b-3', materialId: 'mat-triplek', quantity: 70, unit: 'lembar', supplierPrimaryId: 's-1', supplierSecondaryId: 's-2', picId: 'u-pic-1', unitCost: 122000, status: 'received', orderDate: '2026-05-20', receiptDate: '2026-05-28', createdAt: '2026-05-19T03:00:00.000Z' },
    { id: 'pr-2', boqItemId: 'b-3', materialId: 'mat-triplek', quantity: 50, unit: 'lembar', supplierPrimaryId: 's-1', supplierSecondaryId: null, picId: 'u-pic-1', unitCost: 125000, status: 'ordered', orderDate: '2026-05-30', receiptDate: null, createdAt: '2026-05-29T04:00:00.000Z' },
    { id: 'pr-3', boqItemId: 'b-8', materialId: 'mat-besi', quantity: 120, unit: 'batang', supplierPrimaryId: 's-4', supplierSecondaryId: null, picId: 'u-pic-2', unitCost: 93000, status: 'received', orderDate: '2026-05-12', receiptDate: '2026-05-22', createdAt: '2026-05-11T02:00:00.000Z' },
    { id: 'pr-4', boqItemId: 'b-9', materialId: 'mat-semen', quantity: 150, unit: 'sak', supplierPrimaryId: 's-4', supplierSecondaryId: 's-1', picId: 'u-pic-2', unitCost: 61500, status: 'received', orderDate: '2026-05-13', receiptDate: '2026-05-21', createdAt: '2026-05-12T02:10:00.000Z' },
    { id: 'pr-5', boqItemId: 'b-6', materialId: 'mat-kabel', quantity: 18, unit: 'roll', supplierPrimaryId: 's-3', supplierSecondaryId: null, picId: 'u-pic-1', unitCost: 1480000, status: 'ordered', orderDate: '2026-05-22', receiptDate: null, createdAt: '2026-05-21T06:00:00.000Z' },
    { id: 'pr-6', boqItemId: 'b-1', materialId: 'mat-gypsum', quantity: 100, unit: 'lembar', supplierPrimaryId: 's-2', supplierSecondaryId: 's-1', picId: 'u-pic-1', unitCost: 64000, status: 'quoted', orderDate: null, receiptDate: null, createdAt: '2026-05-28T08:00:00.000Z' },
  ],
};
