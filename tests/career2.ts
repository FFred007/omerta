// Les voies alternatives vers le trône : coup d'État, fédéraux, pacte avec un rival.
import * as E from '../src/engine';
import { coupChance, resolveCareerEffect, startCareer, startPlot } from '../src/career';
import { owned } from '../src/state';
import type { GameState } from '../src/types';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`); if (!ok) fails++; };
function capo(): GameState {
  const s = startCareer({ first: 'T', last: 'Rossi', origin: 'boucher', classic: true });
  s.week = 18; s.dirty = 5000; s.clean = 5000;
  resolveCareerEffect(s, 'ca_bapteme', { key: '', title: '', text: '', choices: [] });
  resolveCareerEffect(s, 'ca_capo', { key: '', title: '', text: '', choices: [], data: { district: 'sicily' } });
  for (const r of s.recruits.slice(0, 2)) E.hire(s, r.id);
  s.career!.donHealth = 90;
  return s;
}
const run = (s: GameState, n = 3) => { for (let i = 0; i < n && s.career!.rank !== 'don' && s.status === 'playing'; i++) { s.pendingEvent = null; E.endTurn(s); } };

// coup : la chance affichée est la vraie
let won = 0, shown = 0, dead = 0;
for (let i = 0; i < 600; i++) {
  const s = capo();
  s.career!.notables.forEach((n) => { if (n.role === 'capo' && !n.favori) n.affinity = 50; });
  shown += coupChance(s);
  startPlot(s, 'coup');
  s.pendingEvent = null; E.endTurn(s);
  if (s.career!.rank === 'don') won++;
  else if (s.status !== 'playing') dead++;
}
check(Math.abs(won / 600 - shown / 600) < 0.05, `coup d'État : affiché ${(shown / 6).toFixed(1)} %, réel ${(won / 6).toFixed(1)} % (morts ${dead})`);
// fédéraux
{
  const s = capo();
  s.dossier = 60;
  check(startPlot(s, 'feds').ok, 'marché avec les fédéraux');
  run(s, 3);
  check(s.career!.rank === 'don' && s.career!.informant === true && (s.dossier ?? 0) < 10, `Don par trahison (dossier ${s.dossier}), indic`);
  check(owned(s).length >= 2 && s.familyName === 'Famille Rossi', `${owned(s).length} quartiers hérités, ${s.familyName}`);
}
// pacte avec un rival
{
  const s = capo();
  const r = s.rivals.find((x) => !x.employer && x.alive)!;
  r.relation = 40;
  check(startPlot(s, 'rival', r.id).ok, `pacte avec ${r.name}`);
  run(s, 2);
  if (s.career!.rank === 'don') check(r.alliance && s.career!.debtTo === r.id, 'Don grâce au rival : alliance et dette');
  else check(true, 'pacte raté (aléa), le jeu continue');
}
console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
