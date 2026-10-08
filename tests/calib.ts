// Calibration : % affiché vs taux réel, pour les assauts et pour les coups.
import * as E from '../src/engine';
import { jobChance, setJobTeam } from '../src/jobs';
import { activeMembers, attackPower, defenseOf, district, isAttackable, owned, winChance } from '../src/state';
const bins: Record<string, { n: number; won: number }> = {};
const add = (kind: string, p: number, won: boolean) => {
  const k = `${kind} ${(Math.min(0.9, Math.floor(p * 5) / 5)).toFixed(1)}`;
  const b = (bins[k] ??= { n: 0, won: 0 });
  b.n++; if (won) b.won++;
};
for (let g = 0; g < 1500; g++) {
  const s = E.startGame();
  while (s.status === 'playing' && s.week < 40) {
    s.pendingEvent = null;
    let pool = activeMembers(s).filter((m) => !(m.fatigue ?? 0)).sort(() => Math.random() - 0.5);
    const preds: { kind: string; id: string | number; p: number }[] = [];
    const t = s.districts.filter((d) => isAttackable(s, d) && !s.rivals.find((r) => r.id === d.owner)?.alliance)[0];
    if (t && pool.length > 2) {
      const ids = pool.splice(0, 2).map((m) => m.id);
      if (E.orderAttack(s, t.id, ids).ok) preds.push({ kind: 'assaut', id: t.id, p: winChance(attackPower(s, ids), defenseOf(s, t)) });
    }
    for (const j of s.jobs) {
      const ids = pool.splice(0, j.minMen).map((m) => m.id);
      if (ids.length < j.minMen) break;
      setJobTeam(s, j.id, ids);
      preds.push({ kind: 'coup', id: j.title, p: jobChance(s, j) });
    }
    E.endTurn(s);
    for (const x of preds) {
      if (x.kind === 'assaut') add('assaut', x.p, district(s, String(x.id)).owner === 'player');
      else add('coup', x.p, s.lastReport.some((e) => e.text.startsWith(`Coup réussi : ${x.id}`)));
    }
    if (!owned(s).length) break;
  }
}
for (const k of Object.keys(bins).sort()) console.log(k.padEnd(12), String(bins[k].n).padStart(6), `${((bins[k].won / bins[k].n) * 100).toFixed(1)} %`);
