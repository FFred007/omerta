// Carte générée : contraintes de jouabilité sur 1 000 tirages.
import { CITIES } from '../src/data';
import { generateMap, TERRITORY } from '../src/mapgen';

let bad = 0;
const layouts = new Set<string>();
for (let i = 0; i < 1000; i++) {
  const ds = generateMap();
  const err: string[] = [];
  if (new Set(ds.map((d) => d.id)).size !== ds.length) err.push('ids en double');
  for (const c of CITIES) {
    const cd = ds.filter((d) => (d.city ?? 'corrano') === c.id);
    const cells = new Set(cd.map((d) => `${d.row},${d.col}`));
    const rows = c.id === 'corrano' ? 3 : 2;
    if (cd.length !== rows * c.cols || cells.size !== cd.length) err.push(`${c.id} : grille incomplète`);
    for (const rid of Object.keys(TERRITORY[c.id])) if (!cd.some((d) => d.owner === rid)) err.push(`${rid} sans territoire`);
    if (c.gate && cd.find((d) => d.id === c.gate)?.owner !== 'neutral') err.push(`${c.id} : gare prise`);
  }
  const home = ds.find((d) => d.id === 'sicily')!;
  const near = ds.filter((d) => !d.city && Math.abs(d.row - home.row) + Math.abs(d.col - home.col) === 1);
  if (home.owner !== 'player' || !near.some((d) => d.owner === 'neutral')) err.push('Little Sicily encerclée');
  layouts.add(ds.filter((d) => !d.city).map((d) => `${d.id}${d.row}${d.col}${d.owner}`).join('|'));
  if (err.length) { bad++; if (bad < 5) console.log(err.join(', ')); }
}
console.log(`cartes vérifiées : 1000, invalides : ${bad}, New Corrano différentes : ${layouts.size}`);
if (bad) process.exit(1);
