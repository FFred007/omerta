// Simulation headless : un bot simple joue N parties pour vérifier l'équilibrage.
import * as B from '../src/booze';
import * as D from '../src/diplomacy';
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { jobChance, setJobTeam } from '../src/jobs';
import { SPEAKEASY_DEMAND } from '../src/data';
import { activeMembers, attackPower, committedToAttack, defenseOf, isAttackable, membersIn, owned, stockTotal } from '../src/state';
import type { BusinessKind, GameState } from '../src/types';

const ARGS = process.argv.slice(2);
const N = Number(ARGS[0] ?? 300);
const SMART = !ARGS.includes('--dumb'); // --dumb : n'utilise ni coups, ni contrebande, ni diplomatie

function botTurn(s: GameState) {
  // 1. Construire
  for (const d of owned(s)) {
    if (d.slots - d.businesses.length <= 0) continue;
    const fronts = owned(s).reduce((t, x) => t + x.businesses.filter((b) => ['blanchisserie', 'restaurant', 'garage', 'entrepot'].includes(b.kind)).length, 0);
    const speak = owned(s).reduce((t, x) => t + x.businesses.filter((b) => b.kind === 'speakeasy').length, 0);
    const wish: BusinessKind = s.clean >= 2000 && fronts < owned(s).length / 2 ? 'blanchisserie'
      : SMART && speak >= 3 && s.clean >= 1800 && !owned(s).some((x) => x.businesses.some((b) => b.kind === 'entrepot')) ? 'entrepot'
      : s.dirty >= 4000 ? 'tripot' : 'speakeasy';
    E.build(s, d.id, wish);
  }
  // 2. Recruter
  for (const r of [...s.recruits]) if (activeMembers(s).length < owned(s).length * 2 + 2 && s.dirty + s.clean > r.cost + 2000) E.hire(s, r.id);
  // 3. Corruption
  if (s.heat > 45 && !s.judge && s.clean > 3000) E.toggleJudge(s);
  for (const d of owned(s)) if (s.heat > 35 && !d.bribedCop && s.clean > 2000 && d.police >= 2) E.toggleCop(s, d.id);
  // 4. Alcool : remplir la demande de la semaine prochaine, au moins cher
  const speak = owned(s).reduce((t, x) => t + x.businesses.filter((b) => b.kind === 'speakeasy').length, 0);
  const need = 2 * speak * SPEAKEASY_DEMAND - stockTotal(s) - s.shipments.reduce((a, x) => a + x.qty, 0);
  if (need > 0) {
    if (SMART) {
      const g = (['gin', 'biere', 'whisky'] as const).reduce((a, b) => (s.market[a] - (a === 'gin' ? 0.15 : 0) <= s.market[b] - (b === 'gin' ? 0.15 : 0) ? a : b));
      const q = Math.min(need, B.freeRoom(s));
      if (q > 0 && s.dirty + s.clean > B.smuggleCost(s, g, q, 'legere') + 800) B.orderSmuggle(s, g, q, 'legere');
    } else {
      const q = Math.min(need, B.freeRoom(s));
      if (q > 0 && s.dirty + s.clean > B.prices(s, 'biere').wholesaler * q + 800) B.buyWholesaler(s, 'biere', q);
    }
  }
  // 5. Défense : une personne par quartier minimum
  const reserve = () => activeMembers(s).filter((m) => !m.assignment);
  for (const d of owned(s)) if (!membersIn(s, d.id).length && reserve().length) E.assign(s, reserve()[0].id, d.id);
  // 6. Attaque
  const targets = s.districts.filter((d) => isAttackable(s, d)).filter((d) => !(d.owner !== 'neutral' && s.rivals.find((r) => r.id === d.owner)?.alliance)).sort((a, b) => defenseOf(s, a) - defenseOf(s, b));
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
  if (!SMART || ARGS.includes('--nojobs')) return;
  // 7. Un coup avec les hommes de réserve libres
  const free = activeMembers(s).filter((m) => (!m.assignment || membersIn(s, m.assignment).length > 1) && !committedToAttack(s, m.id) && !(m.fatigue ?? 0));
  for (const job of s.jobs) {
    const ids = free.filter((m) => !s.jobs.some((j) => j.team.includes(m.id))).slice(0, Math.max(job.minMen, 2)).map((m) => m.id);
    if (ids.length >= job.minMen && jobChance(s, job, ids) >= 0.75 && job.danger < 0.5) setJobTeam(s, job.id, ids);
  }
  // 8. Diplomatie : calmer le voisin le plus hostile
  const hostile = s.rivals.filter((r) => r.alive && !r.war && r.relation < -20).sort((a, b) => a.relation - b.relation)[0];
  if (hostile && s.clean > 3000) D.sitDown(s, hostile.id);
  for (const r of s.rivals) if (r.war && s.clean > 4000) D.makePeace(s, r.id);
}

function resolveAll(s: GameState) {
  for (let ev = s.pendingEvent; ev; ev = s.pendingEvent) {
    const en = ev.choices.filter((x) => !x.disabled);
    resolveEvent(s, (ARGS.includes('--last') ? en[en.length - 1] : en[0]).effect);
  }
}

const MAX_WEEKS = 150;
const results = { won: 0, lost: 0, ongoing: 0 };
const reasons: Record<string, number> = {};
const weeks: number[] = [];
let warWeeks = 0, allyWeeks = 0, ownedAt30 = 0, heatSum = 0, dirtyAt20 = 0, shortageWeeks = 0, totalWeeks = 0, jobs = 0, crates = 0;

for (let g = 0; g < N; g++) {
  const s = E.startGame();
  while (s.status === 'playing' && s.week <= MAX_WEEKS) {
    if (s.pendingEvent && ARGS.includes('--noevents')) s.pendingEvent = null;
    if (s.pendingEvent) {
      const en = s.pendingEvent.choices.filter((x) => !x.disabled);
      const c = ARGS.includes('--last') ? en[en.length - 1] : en[0];
      resolveEvent(s, c.effect);
      continue;
    }
    botTurn(s);
    E.midweek(s);
    resolveAll(s);
    E.endTurn(s);
    totalWeeks++;
    if (s.lastReport.some((e) => e.text.startsWith('Rupture'))) shortageWeeks++;
    if (s.rivals.some((r) => r.war)) warWeeks++;
    if (s.rivals.some((r) => r.alliance)) allyWeeks++;
    if (s.week === 20) dirtyAt20 += s.dirty + s.clean;
    if (s.week === 30) { ownedAt30 += owned(s).length; heatSum += s.heat; }
  }
  jobs += s.stats.jobsDone;
  crates += s.stats.cratesSold;
  if (s.status === 'playing') results.ongoing++;
  else {
    results[s.status]++;
    reasons[s.endReason.slice(0, 40)] = (reasons[s.endReason.slice(0, 40)] ?? 0) + 1;
    weeks.push(s.week);
  }
}

weeks.sort((a, b) => a - b);
console.log(`Parties : ${N} (${SMART ? 'bot complet' : 'bot naïf'})`, results);
console.log('Fins :', reasons);
console.log('Semaine médiane de fin :', weeks[Math.floor(weeks.length / 2)]);
console.log('Quartiers moyens à S30 :', (ownedAt30 / N).toFixed(2), '· heat moyenne à S30 :', (heatSum / N).toFixed(1), '· trésorerie à S20 :', Math.round(dirtyAt20 / N));
console.log('Semaines en guerre :', ((warWeeks / totalWeeks) * 100).toFixed(0), '% · avec un allié :', ((allyWeeks / totalWeeks) * 100).toFixed(0), '%');
console.log('Semaines en rupture de stock :', ((shortageWeeks / totalWeeks) * 100).toFixed(0), '% · coups réussis/partie :', (jobs / N).toFixed(1), '· caisses vendues/partie :', Math.round(crates / N));
