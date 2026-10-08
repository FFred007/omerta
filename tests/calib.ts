// Calibration : % affiché avant l'assaut vs taux de victoire réel, sur des parties simulées.
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { winChance as shown, activeMembers, attackPower, defenseOf, district, isAttackable, membersIn, newGame, owned } from '../src/state';
import type { GameState } from '../src/types';

const bins: Record<string, { n: number; won: number; multi: number; multiWon: number }> = {};
for (let g = 0; g < 1500; g++) {
  const s: GameState = newGame();
  while (s.status === 'playing' && s.week < 60) {
    if (s.pendingEvent) { resolveEvent(s, s.pendingEvent.choices.find((c) => !c.disabled)!.effect); continue; }
    for (const r of [...s.recruits]) if (activeMembers(s).length < owned(s).length * 2 + 3 && s.dirty + s.clean > r.cost + 1500) E.hire(s, r.id);
    const reserve = () => activeMembers(s).filter((m) => !m.assignment);
    for (const d of owned(s)) if (!membersIn(s, d.id).length && reserve().length) E.assign(s, reserve()[0].id, d.id);
    // jusqu'à 2 assauts par tour, comme un joueur
    const targets = s.districts.filter((d) => isAttackable(s, d)).sort(() => Math.random() - 0.5).slice(0, 2);
    let pool = activeMembers(s).filter((m) => !(m.fatigue ?? 0)).sort(() => Math.random() - 0.5);
    for (const t of targets) {
      const k = Math.ceil(pool.length / targets.length);
      const ids = pool.slice(0, k).map((m) => m.id);
      pool = pool.slice(k);
      if (ids.length) E.orderAttack(s, t.id, ids);
    }
    const preds = s.orders.map((o) => ({ id: o.districtId, p: shown(attackPower(s, o.memberIds), defenseOf(s, district(s, o.districtId))) }));
    const multi = preds.length > 1;
    E.endTurn(s);
    for (const x of preds) {
      const key = (Math.floor(x.p * 10) / 10).toFixed(1);
      const b = (bins[key] ??= { n: 0, won: 0, multi: 0, multiWon: 0 });
      const won = district(s, x.id).owner === 'player' ? 1 : 0;
      b.n++; b.won += won;
      if (multi) { b.multi++; b.multiWon += won; }
    }
  }
}
console.log('affiché   n      réel   (si 2 assauts le même tour)');
for (const k of Object.keys(bins).sort()) {
  const b = bins[k];
  console.log(`${k}-${(+k + 0.1).toFixed(1)}  ${String(b.n).padStart(6)}  ${(b.won / b.n * 100).toFixed(1).padStart(5)} %   ${b.multi ? (b.multiWon / b.multi * 100).toFixed(1) + ' % sur ' + b.multi : '-'}`);
}
