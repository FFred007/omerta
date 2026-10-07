// Simulation headless : un bot simple joue N parties pour vérifier l'équilibrage.
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { activeMembers, attackPower, defenseOf, isAttackable, membersIn, newGame, owned } from '../src/state';
import type { BusinessKind, GameState } from '../src/types';

function botTurn(s: GameState) {
  // 1. Construire
  for (const d of owned(s)) {
    const free = d.slots - d.businesses.length;
    if (free <= 0) continue;
    const fronts = owned(s).reduce((t, x) => t + x.businesses.filter((b) => ['blanchisserie', 'restaurant', 'garage'].includes(b.kind)).length, 0);
    const wish: BusinessKind = s.clean >= 2000 && fronts < owned(s).length / 2 ? 'blanchisserie' : s.dirty >= 4000 ? 'tripot' : 'speakeasy';
    E.build(s, d.id, wish);
  }
  // 2. Recruter
  const mine = owned(s).length;
  for (const r of [...s.recruits]) if (activeMembers(s).length < mine * 2 + 2 && s.dirty + s.clean > r.cost + 2000) E.hire(s, r.id);
  // 3. Corruption
  if (s.heat > 45 && !s.judge && s.clean > 3000) E.toggleJudge(s);
  for (const d of owned(s)) if (s.heat > 35 && !d.bribedCop && s.clean > 2000 && d.police >= 2) E.toggleCop(s, d.id);
  // 4. Défense : une personne par quartier minimum
  const reserve = () => activeMembers(s).filter((m) => !m.assignment);
  for (const d of owned(s)) if (!membersIn(s, d.id).length && reserve().length) E.assign(s, reserve()[0].id, d.id);
  // 5. Attaque
  const targets = s.districts.filter((d) => isAttackable(s, d)).sort((a, b) => defenseOf(s, a) - defenseOf(s, b));
  if (targets.length) {
    const t = targets[0];
    const pool = activeMembers(s).filter((m) => !(m.fatigue ?? 0)).filter((m) => !m.assignment || membersIn(s, m.assignment).length > 1).sort((a, b) => b.force - a.force);
    const chosen: number[] = [];
    for (const m of pool) {
      chosen.push(m.id);
      if (attackPower(s, chosen) > defenseOf(s, t) * 1.35) break;
    }
    if (attackPower(s, chosen) > defenseOf(s, t) * 1.25) E.orderAttack(s, t.id, chosen);
  }
}

const N = Number(process.argv[2] ?? 300);
const MAX_WEEKS = 150;
const results = { won: 0, lost: 0, ongoing: 0 };
const reasons: Record<string, number> = {};
const weeks: number[] = [];
let ownedAt30 = 0;
let heatSum = 0;

for (let g = 0; g < N; g++) {
  const s = newGame();
  while (s.status === 'playing' && s.week <= MAX_WEEKS) {
    if (s.pendingEvent) {
      const c = s.pendingEvent.choices.find((x) => !x.disabled)!;
      resolveEvent(s, c.effect);
      continue;
    }
    botTurn(s);
    E.endTurn(s);
    if (s.week === 30) { ownedAt30 += owned(s).length; heatSum += s.heat; }
  }
  if (s.status === 'playing') results.ongoing++;
  else {
    results[s.status]++;
    reasons[s.endReason.slice(0, 40)] = (reasons[s.endReason.slice(0, 40)] ?? 0) + 1;
    weeks.push(s.week);
  }
}

weeks.sort((a, b) => a - b);
console.log(`Parties : ${N}`, results);
console.log('Fins :', reasons);
console.log('Semaine médiane de fin :', weeks[Math.floor(weeks.length / 2)]);
console.log('Quartiers moyens à S30 :', (ownedAt30 / N).toFixed(2), '· heat moyenne à S30 :', (heatSum / N).toFixed(1));
