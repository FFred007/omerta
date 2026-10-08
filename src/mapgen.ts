// Carte générée : chaque nouvelle partie tire ses quartiers, leur place et les territoires des familles.
import { CITIES, DISTRICT_SEEDS, EXTRA_SEEDS, type DistrictSeed } from './data';
import type { BusinessKind } from './types';

const ROWS: Record<string, number> = { corrano: 3, halloran: 2, mirage: 2, washburn: 2 };
/** taille de départ des territoires rivaux */
export const TERRITORY: Record<string, Record<string, number>> = {
  corrano: { castellano: 2, wolska: 2, kilbride: 1 },
  halloran: { benedetto: 2, vasquez: 2 },
  mirage: { lazzaro: 2, sandoval: 2 },
  washburn: { whitmore: 2 },
};
const ILLEGAL: BusinessKind[] = ['speakeasy', 'paris', 'tripot', 'distillerie'];

const shuffle = <T>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};
const cityOfSeed = (d: DistrictSeed) => d.city ?? 'corrano';
const dist = (a: DistrictSeed, b: DistrictSeed) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
const round50 = (n: number) => Math.round(n / 50) * 50;

export function generateMap(): DistrictSeed[] {
  const out: DistrictSeed[] = [];
  for (const c of CITIES) {
    const rows = ROWS[c.id] ?? 2;
    const n = rows * c.cols;
    const all = [...DISTRICT_SEEDS, ...EXTRA_SEEDS].filter((d) => cityOfSeed(d) === c.id);
    const anchorId = c.id === 'corrano' ? 'sicily' : c.gate!;
    const anchorSeed = all.find((d) => d.id === anchorId)!;
    const picked = [anchorSeed, ...shuffle(all.filter((d) => d.id !== anchorId)).slice(0, n - 1)];
    const cells = shuffle(Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / c.cols), col: i % c.cols })));
    const ds: DistrictSeed[] = picked.map((d, i) => ({
      ...d, ...cells[i], businesses: [...d.businesses], owner: 'neutral',
      racket: round50(d.racket * (0.9 + Math.random() * 0.2)),
    }));
    const anchor = ds[0];
    const near = (d: DistrictSeed) => ds.filter((o) => dist(o, d) === 1);
    // une porte de sortie : au moins un voisin indépendant pour la famille du joueur
    const reserved = new Set([anchor.id]);
    if (c.id === 'corrano') {
      const exit = shuffle(near(anchor))[0];
      if (exit) reserved.add(exit.id);
    }
    const free = (d: DistrictSeed) => d.owner === 'neutral' && !reserved.has(d.id);
    for (const [rid, size] of Object.entries(TERRITORY[c.id] ?? {}).sort((a, b) => b[1] - a[1])) {
      const candidates = ds.filter(free);
      if (!candidates.length) {
        // personne n'est laissé sans territoire
        const steal = ds.find((d) => d.owner === 'neutral' && d.id !== anchor.id);
        if (steal) steal.owner = rid;
        continue;
      }
      const far = Math.max(...candidates.map((d) => dist(d, anchor)));
      let cur = shuffle(candidates.filter((d) => dist(d, anchor) === far))[0];
      cur.owner = rid;
      for (let k = 1; k < size; k++) {
        const next = shuffle(ds.filter((d) => d.owner === rid).flatMap(near).filter(free))[0];
        if (!next) break;
        next.owner = rid;
        cur = next;
      }
    }
    for (const d of ds) {
      if (d.id === 'sicily') { d.owner = 'player'; d.garrison = 0; d.businesses = ['speakeasy']; continue; }
      if (d.owner === 'neutral') {
        d.businesses = [];
        d.garrison = d.garrison > 0 ? d.garrison + Math.floor(Math.random() * 3) - 1 : 9 + Math.floor(Math.random() * 6);
      } else {
        d.garrison = 0;
        if (!d.businesses.length) d.businesses = [ILLEGAL[Math.floor(Math.random() * ILLEGAL.length)]];
      }
    }
    out.push(...ds);
  }
  return out;
}
