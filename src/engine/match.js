// engine/match.js — fuzzy matching for the material catalogue (Feature 5.1, BR-1).
// "Nama barang harus sama!" — when someone types a material name, we surface
// existing canonical names / aliases before letting them create a new entry.
// Dependency-free Dice coefficient on character bigrams.

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s) {
  const n = normalize(s).replace(/ /g, '');
  const set = new Map();
  for (let i = 0; i < n.length - 1; i++) {
    const g = n.slice(i, i + 2);
    set.set(g, (set.get(g) || 0) + 1);
  }
  return set;
}

// 0..1 similarity.
export function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // substring boost: "gypsum aplus" contains "gypsum"
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, sizeA = 0, sizeB = 0;
  A.forEach((c) => { sizeA += c; });
  B.forEach((c) => { sizeB += c; });
  A.forEach((c, g) => { if (B.has(g)) inter += Math.min(c, B.get(g)); });
  if (sizeA + sizeB === 0) return 0;
  return (2 * inter) / (sizeA + sizeB);
}

// Returns [{ material, matchedOn, score }] sorted desc, score >= threshold.
export function suggestMaterials(materials, typed, limit = 5, threshold = 0.34) {
  const q = (typed || '').trim();
  if (q.length < 2) return [];
  const scored = materials.map((m) => {
    const candidates = [m.canonicalName, ...(m.aliases || [])];
    let best = 0, matchedOn = m.canonicalName;
    for (const c of candidates) {
      const s = similarity(q, c);
      if (s > best) { best = s; matchedOn = c; }
    }
    return { material: m, matchedOn, score: best };
  });
  return scored
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Exact-ish resolution used at write time (BR-1): does this string already
// resolve to a known material? Returns the material or null.
export function resolveMaterial(materials, typed) {
  const q = normalize(typed);
  if (!q) return null;
  return materials.find((m) =>
    normalize(m.canonicalName) === q ||
    (m.aliases || []).some((a) => normalize(a) === q)
  ) || null;
}
