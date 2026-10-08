// Simulation headless : un bot simple joue N parties pour vérifier l'équilibrage.
import * as B from '../src/booze';
import * as D from '../src/diplomacy';
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { jobChance, setJobTeam } from '../src/jobs';
import { SPEAKEASY_DEMAND } from '../src/data';
import { activeMembers, attackPower, committedToAttack, defenseOf, isAttackable, membersIn, owned, stockTotal } from '../src/state';
import type { BusinessKind, GameState } from '../src/types';
import { CITIES } from '../src/data';
import { citiesAllowed, cityOf, isOpen, memberCity, openCities, openCost, ownedIn, travel, openCity } from '../src/cities';
import { buyVote, commission, playerInterest, stance, voteCost } from '../src/commission';
import { goLegit, legitBlockers, retire, retireBlocker } from '../src/score';

const ARGS = process.argv.slice(2);
const N = Number(ARGS[0] ?? 300);
const SMART = !ARGS.includes('--dumb'); // --dumb : n'utilise ni coups, ni contrebande, ni diplomatie
const MULTI = !ARGS.includes('--onecity'); // --onecity : reste à New Corrano
const COMM = !ARGS.includes('--nocomm'); // --nocomm : n'achète aucune voix à la Commission
const RETIRE_AT = Number(ARGS.find((a) => a.startsWith('--retire='))?.slice(9) ?? 120);
let cityOpens = 0;

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
  const reserve = (city: string) => activeMembers(s).filter((m) => !m.assignment && memberCity(m) === city);
  for (const d of owned(s)) if (!membersIn(s, d.id).length && reserve(cityOf(d)).length) E.assign(s, reserve(cityOf(d))[0].id, d.id);
  // 5b. Expansion : une nouvelle ville quand le palier le permet
  if (MULTI && openCities(s).length < citiesAllowed(s)) {
    const c = CITIES.find((x) => !isOpen(s, x.id) && s.districts.find((d) => d.id === x.gate)?.owner === 'neutral');
    const capo = activeMembers(s).find((m) => m.rank === 'capo' && !m.isDon && !m.isChild && !(m.fatigue ?? 0));
    const extra = activeMembers(s).filter((m) => !m.isDon && m.rank !== 'capo' && !m.assignment && memberCity(m) === 'corrano').slice(0, 2);
    if (c && capo && s.dirty + s.clean > openCost(s, c.id, 3) + 4000) { openCity(s, c.id, [capo.id, ...extra.map((m) => m.id)]); cityOpens++; }
  }
  // 5c. Renforts vers les autres villes
  if (MULTI) for (const c of openCities(s).filter((x) => x.id !== 'corrano')) {
    const here = activeMembers(s).filter((m) => memberCity(m) === c.id).length;
    const spare = activeMembers(s).filter((m) => !m.isDon && !m.isChild && memberCity(m) === 'corrano' && (!m.assignment || membersIn(s, m.assignment).length > 1));
    if (here < ownedIn(s, c.id).length * 2 + 1 && spare.length > 1 && s.dirty + s.clean > 1500) travel(s, spare[spare.length - 1].id, c.id);
  }
  // 6. Attaque : une par ville
  for (const city of openCities(s).map((c) => c.id)) {
  const targets = s.districts.filter((d) => cityOf(d) === city && isAttackable(s, d)).filter((d) => !(d.owner !== 'neutral' && s.rivals.find((r) => r.id === d.owner)?.alliance)).sort((a, b) => defenseOf(s, a) - defenseOf(s, b));
  if (targets.length) {
    const t = targets[0];
    const pool = activeMembers(s).filter((m) => !m.isDon && memberCity(m) === city).filter((m) => !(m.fatigue ?? 0)).filter((m) => !committedToAttack(s, m.id)).filter((m) => !m.assignment || membersIn(s, m.assignment).length > 1).sort((a, b) => b.force - a.force);
    const chosen: number[] = [];
    for (const m of pool) {
      chosen.push(m.id);
      if (attackPower(s, chosen) > defenseOf(s, t) * 1.35) break;
    }
    if (attackPower(s, chosen) > defenseOf(s, t) * 1.25) E.orderAttack(s, t.id, chosen);
  }
  }
  // 6b. Commission : acheter les voix qui manquent sur les motions qui comptent
  const c = commission(s);
  if (COMM && c.motion && ['admission', 'ban_player', 'presidence'].includes(c.motion.kind) && s.week >= c.next - 1) {
    const want = playerInterest(s, c.motion);
    for (const r of s.rivals.filter((x) => x.alive && !x.war && !c.bought[x.id] && stance(s, x) !== want)) {
      if (s.dirty > voteCost(r) + 3000) buyVote(s, r.id, want);
    }
  }
  if (!SMART || ARGS.includes('--nojobs')) return;
  // 7. Un coup avec les hommes de réserve libres
  const free = activeMembers(s).filter((m) => !m.isDon).filter((m) => (!m.assignment || membersIn(s, m.assignment).length > 1) && !committedToAttack(s, m.id) && !(m.fatigue ?? 0));
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

const MAX_WEEKS = 200;
const scores: Record<string, number[]> = {};
let seats = 0, chairs = 0, cities = 0;
const motions: Record<string, number> = {};
const results = { won: 0, lost: 0, ongoing: 0 };
const reasons: Record<string, number> = {};
const weeks: number[] = [];
let dos20 = 0, own20 = 0, resp20 = 0, coal = 0, trials = 0, lvl = 0, nm = 0, maxLvl = 0, trs = 0, warWeeks = 0, allyWeeks = 0, ownedAt30 = 0, heatSum = 0, dirtyAt20 = 0, shortageWeeks = 0, totalWeeks = 0, jobs = 0, crates = 0;

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
    if (!legitBlockers(s).length) { goLegit(s); break; }
    if (s.week >= RETIRE_AT && !retireBlocker(s)) { retire(s); break; }
    botTurn(s);
    E.midweek(s);
    resolveAll(s);
    E.endTurn(s);
    totalWeeks++;
    if (s.lastReport.some((e) => e.text.startsWith('Rupture'))) shortageWeeks++;
    if (s.rivals.some((r) => r.war)) warWeeks++;
    if (s.rivals.some((r) => r.alliance)) allyWeeks++;
    if (s.week === 20) { dirtyAt20 += s.dirty + s.clean; dos20 += s.dossier ?? 0; own20 += owned(s).length; resp20 += s.respect; }
    if (s.coalitionWeeks === 8) coal++;
    if (s.trial && s.trial.stage === 0) trials++;
    if (s.week === 30) { ownedAt30 += owned(s).length; heatSum += s.heat; }
  }
  jobs += s.stats.jobsDone;
  for (const m of s.members) { lvl += m.level ?? 0; nm++; maxLvl = Math.max(maxLvl, m.level ?? 0); trs += (m.traits ?? []).length; }
  crates += s.stats.cratesSold;
  if (s.ending) (scores[s.ending.kind] ??= []).push(s.ending.score);
  if (s.commission?.seat) seats++;
  for (const h of s.commission?.history ?? []) { const k = h.title.split(' ').slice(0, 3).join(' ') + (h.passed ? ' ✓' : ' ✗'); motions[k] = (motions[k] ?? 0) + 1; }
  if (s.commission?.chair) chairs++;
  cities += openCities(s).length;
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
console.log('Fin de partie : niveau moyen', (lvl / nm).toFixed(1), '· niveau max', maxLvl, '· traits moyens/homme', (trs / nm).toFixed(1));
console.log('S20 : dossier', (dos20 / N).toFixed(0), '· quartiers', (own20 / N).toFixed(1), '· respect', (resp20 / N).toFixed(0), '· coalitions/partie', (coal / N).toFixed(2), '· procès/partie', (trials / N).toFixed(2));
const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
console.log('Scores :', Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, `${v.length} parties, moyenne ${mean(v)}, max ${Math.max(...v)}`])));
console.log('Villes ouvertes/partie', (cities / N).toFixed(2), '· ouvertures', cityOpens, '· siège', ((seats / N) * 100).toFixed(0), '% · présidence', ((chairs / N) * 100).toFixed(0), '%');
console.log('Motions :', motions);
