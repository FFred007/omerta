import { BUSINESSES, COUNCIL_BRIBE, DIRTY_STASH_LIMIT, JUDGE_BRIBE, PROMOTE_COST } from './data';
import { rollEvent } from './events';
import { marketTick, resolveShipments } from './booze';
import { publishHerald, relationsTick } from './diplomacy';
import { generateJobs, resolveJobs } from './jobs';
import { onConquest, raidMood, shopsTick } from './shops';
import {
  activeMembers, attackPower, chance, roll, winChance, clamp, committedToAttack, defenseOf, district, isAttackable, log,
  award, fx, makeRecruit, membersIn, recruitCost, neighbors, newGame, news, nextId, owned, pick, projection, rand, randInt, rival, satisfaction,
} from './state';
import { GOOD_ORDER, GOODS } from './data';
import { donHas, familyCount, has } from './traits';
import { DON_SEEN_HEAT, donHasTalent, launderFee } from './don';
import { familyTick, offendInLaws, spouseHas, succession } from './family';
import { donJobHeat, jobFailHeat } from './jobs';
import { activeContacts, contactState, networkRaids, networkTick } from './network';
import { DOSSIER_ARREST, DOSSIER_RAT, DOSSIER_SEEN, addDossier, dossierTick, trialEvent } from './dossier';
import { inCoalition, pressureTick } from './pressure';
import { fillObjectives, objectivesTick } from './objectives';
import type { BusinessKind, District, GameState, LogEntry, Member, RivalFamily } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export const JUDGE_MIN_RESPECT = 15;
export const RIVAL_STRENGTH_COST = 850;
export const COUNCIL_MIN_RESPECT = 35;
export const HEAT_DECAY = 4;
export const RECRUITS_PER_WEEK = 4;

// =====================================================================
// Actions du joueur
// =====================================================================

export function build(s: GameState, districtId: string, kind: BusinessKind): ActionResult {
  const d = district(s, districtId);
  const def = BUSINESSES[kind];
  if (d.owner !== 'player') return fail("Ce quartier n'est pas à toi.");
  if (d.businesses.length >= d.slots) return fail('Plus de place dans ce quartier.');
  if (def.currency === 'dirty' && s.dirty < def.cost) return fail("Pas assez d'argent sale.");
  if (def.currency === 'clean' && s.clean < def.cost) return fail("Pas assez d'argent propre.");
  if (def.currency === 'dirty') s.dirty -= def.cost;
  else s.clean -= def.cost;
  d.businesses.push({ id: nextId(s), kind });
  log(s, 'money', `${def.name} ouvert(e) à ${d.name}.`);
  return ok;
}

export function sellBusiness(s: GameState, districtId: string, businessId: number): ActionResult {
  const d = district(s, districtId);
  const b = d.businesses.find((x) => x.id === businessId);
  if (!b || d.owner !== 'player') return fail('Impossible.');
  const def = BUSINESSES[b.kind];
  const refund = Math.round(def.cost * 0.4);
  if (def.currency === 'dirty') s.dirty += refund;
  else s.clean += refund;
  d.businesses = d.businesses.filter((x) => x.id !== businessId);
  log(s, 'money', `${def.name} de ${d.name} revendu(e) pour ${fmt(refund)}.`);
  return ok;
}

export function toggleCop(s: GameState, districtId: string): ActionResult {
  const d = district(s, districtId);
  if (d.owner !== 'player') return fail("Ce quartier n'est pas à toi.");
  d.bribedCop = !d.bribedCop;
  return ok;
}

export function toggleJudge(s: GameState): ActionResult {
  if (!s.judge && s.respect < JUDGE_MIN_RESPECT) return fail(`Il faut ${JUDGE_MIN_RESPECT} de respect pour approcher un juge.`);
  s.judge = !s.judge;
  return ok;
}

export function toggleCouncil(s: GameState): ActionResult {
  if (!s.councilman && s.respect < COUNCIL_MIN_RESPECT) return fail(`Il faut ${COUNCIL_MIN_RESPECT} de respect pour qu'un élu te reçoive.`);
  s.councilman = !s.councilman;
  return ok;
}

export function hire(s: GameState, recruitId: number): ActionResult {
  const r = s.recruits.find((x) => x.id === recruitId);
  if (!r) return fail('Recrue introuvable.');
  const cost = recruitCost(s, r);
  if (s.dirty + s.clean < cost) return fail("Pas assez d'argent.");
  const fromDirty = Math.min(s.dirty, cost);
  s.dirty -= fromDirty;
  s.clean -= cost - fromDirty;
  s.recruits = s.recruits.filter((x) => x.id !== recruitId);
  s.members.push({
    id: r.id, name: r.name, nickname: r.nickname, rank: 'soldat', force: r.force, discretion: r.discretion,
    loyalty: r.loyalty, salary: r.salary, assignment: null, status: 'actif', statusWeeks: 0, weeksServed: 0,
    xp: 0, level: r.level ?? 0, traits: [...(r.traits ?? [])], usage: { force: 0, discretion: 0 },
  });
  log(s, 'good', `${r.name} « ${r.nickname} » a prêté serment.`);
  return ok;
}

export function fire(s: GameState, memberId: number): ActionResult {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return fail('Introuvable.');
  if (m.isDon || m.isChild) return fail('On ne renvoie pas la famille.');
  s.members = s.members.filter((x) => x.id !== memberId);
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== memberId)));
  s.orders = s.orders.filter((o) => o.memberIds.length);
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => id !== memberId)));
  if (m.loyalty < 50) {
    s.heat = clamp(s.heat + 6, 0, 100);
    log(s, 'police', `${m.nickname} est parti fâché. Il parle un peu trop dans les bars (+6 heat).`);
  } else {
    log(s, 'neutral', `${m.nickname} quitte la famille en bons termes.`);
  }
  return ok;
}

export function assign(s: GameState, memberId: number, districtId: string | null): ActionResult {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return fail('Introuvable.');
  if (districtId && district(s, districtId).owner !== 'player') return fail("Tu ne peux poster tes hommes que chez toi.");
  m.assignment = districtId;
  return ok;
}

export function promote(s: GameState, memberId: number): ActionResult {
  const m = s.members.find((x) => x.id === memberId);
  if (!m || m.rank === 'capo') return fail('Impossible.');
  if (m.loyalty < 60) return fail('Loyauté insuffisante (60 minimum).');
  if (m.force + m.discretion < 12 && (m.level ?? 0) < 3) return fail('Pas assez solide : force + discrétion ≥ 12, ou niveau 3 (Homme de confiance).');
  if (s.dirty < PROMOTE_COST) return fail("Pas assez d'argent sale.");
  s.dirty -= PROMOTE_COST;
  m.rank = 'capo';
  m.salary = Math.round(m.salary * 1.8);
  m.loyalty = clamp(m.loyalty + 15, 0, 100);
  log(s, 'good', `${m.name} « ${m.nickname} » est fait capo.`);
  return ok;
}

export function payBonus(s: GameState, memberId: number): ActionResult {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return fail('Introuvable.');
  if (s.dirty < 300) return fail("Pas assez d'argent sale.");
  s.dirty -= 300;
  m.loyalty = clamp(m.loyalty + 12, 0, 100);
  return ok;
}

export function orderAttack(s: GameState, districtId: string, memberIds: number[]): ActionResult {
  const d = district(s, districtId);
  if (!isAttackable(s, d)) return fail("Ce quartier n'est pas à ta portée.");
  if (!memberIds.length) return fail('Choisis au moins un homme.');
  if (s.members.some((m) => memberIds.includes(m.id) && (m.fatigue ?? 0) > 0)) return fail('Certains hommes récupèrent encore du dernier assaut.');
  const r = d.owner !== 'neutral' ? rival(s, d.owner) : undefined;
  if (r && r.truceWeeks > 0) return fail(`Tu as une trêve avec ${r.name} (${r.truceWeeks} sem.).`);
  if (r && r.alliance) return fail(`Tu es allié avec ${r.name}. Romps l'alliance d'abord (onglet Rivaux).`);
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => !memberIds.includes(id))));
  s.orders = s.orders.filter((o) => o.districtId !== districtId);
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => !memberIds.includes(id))));
  s.orders = s.orders.filter((o) => o.memberIds.length);
  s.orders.push({ districtId, memberIds });
  return ok;
}

export function cancelAttack(s: GameState, districtId: string): ActionResult {
  s.orders = s.orders.filter((o) => o.districtId !== districtId);
  return ok;
}

export function setLaunderRate(s: GameState, rate: number): ActionResult {
  s.launderRate = rate;
  return ok;
}

export function toggleLowProfile(s: GameState): ActionResult {
  s.lowProfile = !s.lowProfile;
  return ok;
}

/** Milieu de semaine : une chance qu'un événement vienne demander une décision */
export function midweek(s: GameState) {
  if (s.status !== 'playing' || s.pendingEvent) return;
  if (chance(0.4)) s.pendingEvent = rollEvent(s);
}

export interface HeatLine { label: string; value: number; sure: boolean }

/**
 * Détail de la heat de la semaine.
 * Les lignes « sûres » reproduisent exactement le calcul de economy() ; les autres sont des risques possibles.
 */
export function heatForecast(s: GameState) {
  const lines: HeatLine[] = [];
  let raw = 0;
  for (const d of owned(s)) {
    let illegal = 0;
    let legal = 0;
    for (const b of d.businesses) {
      const def = BUSINESSES[b.kind];
      if (def.illegal) illegal += s.lowProfile ? 0 : def.heat * (d.bribedCop ? 0.5 : 1);
      else legal += def.heat;
    }
    if (illegal) lines.push({ label: `Commerces illégaux · ${d.name}${d.bribedCop ? ' (sergent payé, ÷2)' : ''}`, value: illegal, sure: true });
    if (legal) lines.push({ label: `Façades légales · ${d.name}`, value: legal, sure: true });
    raw += illegal + legal;
  }
  // projection() arrondit la somme : on reporte l'écart d'arrondi sur la dernière ligne pour que le total soit exact
  const rounded = Math.round(raw);
  if (lines.length && rounded !== raw) lines[lines.length - 1].value += rounded - raw;
  if (spouseHas(s, 'pieuse')) lines.push({ label: 'Ta femme, pieuse, rassure le curé', value: -1, sure: true });
  for (const c of activeContacts(s)) if (c.heat) lines.push({ label: `${c.name} (${c.role})`, value: c.heat, sure: true });
  const chatter = familyCount(s, 'bavard');
  if (chatter) lines.push({ label: `Bavard${chatter > 1 ? 's' : ''} dans la famille`, value: chatter, sure: true });
  lines.push({ label: 'Retombée naturelle', value: -HEAT_DECAY, sure: true });
  const after = s.dirty + settle(s).dirtyNet;
  if (after > DIRTY_STASH_LIMIT) lines.push({ label: `Liquide sale planqué au-delà de ${fmt(DIRTY_STASH_LIMIT)}`, value: Math.ceil((after - DIRTY_STASH_LIMIT) / 5000), sure: true });
  if (s.councilman) lines.push({ label: 'Le conseiller Doyle calme la presse', value: -3, sure: true });
  if (s.lowProfile) lines.push({ label: 'Profil bas', value: -6, sure: true });
  const sure = lines.reduce((a, l) => a + l.value, 0);

  for (const o of s.orders) {
    const d = district(s, o.districtId);
    const hot = s.members.filter((m) => o.memberIds.includes(m.id) && has(m, 'tetebrulee')).length * 2;
    const seen = s.members.some((m) => m.isDon && o.memberIds.includes(m.id)) && !donHasTalent(s, 'r_invisible') ? DON_SEEN_HEAT : 0;
    lines.push({ label: `Assaut sur ${d.name}${hot ? ' (têtes brûlées)' : ''}${seen ? ' (le Don est vu)' : ''}`, value: 5 + d.police * 2 + hot + seen, sure: false });
  }
  for (const j of s.jobs.filter((x) => x.team.length >= x.minMen)) {
    const win = j.reward.heat ?? 0;
    const seen = donJobHeat(s, j.team);
    const fh = jobFailHeat(s, j);
    lines.push({ label: `Coup « ${j.title} » : ${win ? `${win > 0 ? '+' : ''}${win} si réussi, ` : ''}+${fh} si raté${seen ? `, +${seen} car le Don est vu` : ''}`, value: Math.max(win, fh) + seen, sure: false });
  }
  if (s.shipments.length) lines.push({ label: `Livraison interceptée par les Prohis (${s.shipments.length} camion${s.shipments.length > 1 ? 's' : ''})`, value: 4, sure: false });
  return { lines, sure: Math.round(sure * 10) / 10 };
}

export function startGame(familyName?: string) {
  const s = newGame(familyName);
  generateJobs(s);
  fillObjectives(s);
  return s;
}

// =====================================================================
// Fin de semaine
// =====================================================================

export function endTurn(s: GameState): LogEntry[] {
  if (s.status !== 'playing' || s.pendingEvent) return [];
  const week = s.week;
  const heatStart = s.heat;
  const dossierStart = s.dossier ?? 0;
  s.dossierWeek = [];
  // ce qui est connu d'avance : commerces, retombée, assauts ordonnés
  const known = heatForecast(s).lines.filter((l) => l.sure || l.label.startsWith('Assaut'));
  // les assauts sans homme valide n'auront pas lieu
  const firing = new Set(s.orders.filter((o) => s.members.some((m) => o.memberIds.includes(m.id) && m.status === 'actif')).map((o) => `Assaut sur ${district(s, o.districtId).name}`));
  const knownLines = known.filter((l) => l.sure || [...firing].some((f) => l.label.startsWith(f)));
  const raidedDistricts = new Set<string>();
  s.fx = [];
  s.day = 0;

  const conquered = new Set<string>();
  resolvePlayerAttacks(s, conquered);
  resolveJobs(s);
  economy(s);
  resolveShipments(s);
  resolveRaids(s, raidedDistricts);
  marketTick(s);
  rivalsTurn(s, conquered);
  relationsTick(s);
  shopsTick(s);
  crewTurn(s, raidedDistricts);
  familyTick(s);
  networkTick(s);
  dossierTick(s);
  heatWarnings(s);
  pressureTick(s);
  objectivesTick(s);
  checkEnd(s);
  publishHerald(s);
  const explained = knownLines.reduce((a, l) => a + l.value, 0);
  const rest = Math.round((s.heat - heatStart - explained) * 10) / 10;
  const lines = knownLines.map((l) => ({ label: l.label, value: l.value }));
  if (rest) lines.push({ label: 'Coups, livraisons, descentes et événements (détail ci-dessous)', value: rest });
  s.lastHeat = { from: heatStart, to: s.heat, lines };
  s.lastDossier = { from: dossierStart, to: s.dossier ?? 0, lines: s.dossierWeek ?? [] };

  s.lastReport = s.log.filter((e) => e.week === week).reverse();
  s.orders = [];
  s.lowProfile = false;
  s.week += 1;
  generateJobs(s);

  // nouvelles recrues chaque semaine
  s.recruits = [];
  for (let i = 0; i < RECRUITS_PER_WEEK; i++) s.recruits.push(makeRecruit(s));

  if (s.status === 'playing' && s.trial && !s.pendingEvent) s.pendingEvent = trialEvent(s);
  if (s.status === 'playing' && !s.pendingEvent && chance(0.35)) s.pendingEvent = rollEvent(s);
  return s.lastReport;
}

// ---------- Combats du joueur ----------
function resolvePlayerAttacks(s: GameState, conquered: Set<string>) {
  for (const order of s.orders) {
    const d = district(s, order.districtId);
    if (d.owner === 'player') continue;
    const men = s.members.filter((m) => order.memberIds.includes(m.id) && m.status === 'actif');
    if (!men.length) continue;
    const powerBase = attackPower(s, men.map((m) => m.id));
    const defBase = defenseOf(s, d);
    const power = powerBase * roll();
    const def = defBase * roll();
    const odds = Math.round(winChance(powerBase, defBase) * 100);
    const dice = `(${odds} % de chances · puissance ${powerBase} → ${power.toFixed(1)} contre défense ${defBase} → ${def.toFixed(1)})`;
    const ratio = clamp(defBase / Math.max(1, powerBase), 0.2, 2);
    const prevOwner = d.owner;
    const r = prevOwner !== 'neutral' ? rival(s, prevOwner) : undefined;
    const target = r ? `${d.name} (${r.name})` : d.name;
    const donThere = men.some((m) => m.isDon);
    const seen = donThere && !donHasTalent(s, 'r_invisible') ? DON_SEEN_HEAT : 0;
    s.heat = clamp(s.heat + 5 + d.police * 2 + men.filter((m) => has(m, 'tetebrulee')).length * 2 + seen, 0, 100);
    if (r) offendInLaws(s, r.id);
    if (seen) addDossier(s, DOSSIER_SEEN, `Le Don vu à l'assaut sur ${d.name}`);
    men.forEach((m) => (m.fatigue = 2));
    fx(s, 'battle', d.id);

    if (power > def) {
      s.stats.battlesWon++;
      d.owner = 'player';
      d.bribedCop = false;
      d.garrison = 0;
      d.unrest = 3;
      if (r) {
        r.strength = Math.max(3, r.strength - Math.ceil(defBase * 0.35));
        r.relation = clamp(r.relation - 30 * (donHas(r, 'rancunier') ? 1.5 : 1), -100, 100);
        r.lossesToPlayer = (r.lossesToPlayer ?? 0) + 1;
        if (r.lossesToPlayer >= 2 && !donHas(r, 'revanchard')) {
          (r.traits ??= []).push('revanchard');
          log(s, 'bad', `${r.boss} devient Revanchard : il te visera en priorité.`);
        }
      }
      s.respect = clamp(s.respect + (r ? (r.war ? 7 : 5) : 3) + (donThere ? 2 : 0), 0, 150);
      if (donThere) news(s, 5, `Le Don en personne à ${d.name}`, `Témoins formels : le chef de la ${s.familyName} menait lui-même ses hommes, un pistolet à la main.`);
      onConquest(s, d.id);
      news(s, r ? 5 : 4, `${d.name} change de mains`, r
        ? `Nuit de fusillades : les hommes de ${r.boss} chassés par la ${s.familyName}.`
        : `Les petites frappes de ${d.name} se rangent derrière la ${s.familyName}.`);
      // les hommes de réserve tiennent le nouveau quartier, les autres rentrent à leur poste
      const holders = men.filter((m) => !m.assignment);
      men.forEach((m) => (m.loyalty = clamp(m.loyalty + 4, 0, 100)));
      holders.forEach((m) => (m.assignment = d.id));
      conquered.add(d.id);
      fx(s, 'capture', d.id);
      log(s, 'good', `Victoire ! Tes hommes prennent ${target} ${dice}.${holders.length ? '' : " Personne n'y est resté en garde."}`);
      casualties(s, men, 0.2 * ratio, 0.06 * ratio);
      men.filter((m) => s.members.includes(m)).forEach((m) => award(s, m, 4, 'force'));
    } else {
      s.stats.battlesLost++;
      s.respect = clamp(s.respect - 3, 0, 150);
      if (r) {
        r.strength = Math.max(3, r.strength - 1);
        r.relation = clamp(r.relation - 15 * (donHas(r, 'rancunier') ? 1.5 : 1), -100, 100);
      }
      else d.garrison += 1;
      log(s, 'bad', `L'assaut sur ${target} tourne mal ${dice}. Tes hommes se replient.`);
      casualties(s, men, 0.35 * ratio, 0.12 * ratio);
      men.filter((m) => s.members.includes(m)).forEach((m) => award(s, m, 2, 'force'));
    }
  }
}

function casualties(s: GameState, men: Member[], pInjured: number, pKilled: number) {
  for (const m of men) {
    if (!s.members.includes(m)) continue;
    // ses hommes protègent le Don : il risque moins que les autres
    const kill = m.isDon ? pKilled * 0.6 * (donHasTalent(s, 'b_increvable') ? 0.5 : 1) : pKilled;
    if (chance(kill)) {
      killMember(s, m);
    } else if (chance(pInjured)) {
      m.status = 'blessé';
      m.statusWeeks = randInt(2, 3);
      if (m.isDon) {
        m.scars = (m.scars ?? 0) + 1;
        if (donHasTalent(s, 'b_increvable')) m.statusWeeks = 1;
        log(s, 'bad', `Le Don est blessé (${m.statusWeeks} sem.). Une cicatrice de plus.`);
      } else log(s, 'bad', `${m.nickname} est blessé (${m.statusWeeks} sem.).`);
    }
  }
}

/** Mort d'un membre : le Don déclenche la succession, un enfant brise le cœur de sa mère */
export function killMember(s: GameState, m: Member, how = 'est tombé sous les balles') {
  if (m.isDon) {
    succession(s, m, `${how}`);
    return;
  }
  s.members = s.members.filter((x) => x.id !== m.id);
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== m.id)));
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => id !== m.id)));
  activeMembers(s).forEach((o) => (o.loyalty = clamp(o.loyalty - 2, 0, 100)));
  if (m.isChild) {
    s.children = (s.children ?? []).filter((c) => c.memberId !== m.id);
    if (s.heirId && !s.children.some((c) => c.id === s.heirId)) s.heirId = null;
    if (s.spouse) s.spouse.affection = clamp(s.spouse.affection - 40, 0, 100);
    log(s, 'bad', `${m.name}, l'enfant du Don, est tombé. La famille ne s'en remettra jamais.`);
    news(s, 5, 'Deuil chez le Don', `${m.name} a été tué. On murmure que la vengeance sera terrible.`);
  } else log(s, 'bad', `${m.name} « ${m.nickname} » est tombé. La famille porte le deuil.`);
}

// ---------- Économie ----------
export interface Settlement {
  dirtyIn: number;
  cleanIn: number;
  salaries: number;
  salDirty: number;
  salClean: number;
  unpaid: number;
  launderTaken: number; // argent sale envoyé au blanchiment
  launderGiven: number; // argent propre récupéré
  launderCap: number;
  bribes: number;
  bribesOk: boolean;
  dirtyNet: number;
  cleanNet: number;
}

/**
 * Calcule les flux de la semaine sans rien modifier.
 * Ordre : revenus → salaires (sale d'abord, puis propre) → blanchiment du sale restant → enveloppes (propre).
 * Utilisé à la fois par le moteur et par le tableau des prévisions, pour qu'ils ne divergent jamais.
 */
export function settle(s: GameState): Settlement {
  const p = projection(s);
  let dirty = s.dirty + p.dirtyIn;
  let clean = s.clean + p.cleanIn;

  let due = p.salaries;
  const salDirty = Math.min(dirty, due);
  dirty -= salDirty;
  due -= salDirty;
  const salClean = Math.min(clean, due);
  clean -= salClean;
  due -= salClean;

  const cap = Math.round(p.launderCap * (s.launderRate ?? 1));
  const launderTaken = Math.min(dirty, cap);
  const launderGiven = Math.round(launderTaken * (1 - launderFee(s)));
  dirty -= launderTaken;
  clean += launderGiven;

  const bribesOk = clean >= p.bribes;
  if (bribesOk) clean -= p.bribes;

  return {
    dirtyIn: p.dirtyIn, cleanIn: p.cleanIn, salaries: p.salaries, salDirty, salClean, unpaid: due,
    launderTaken, launderGiven, launderCap: cap, bribes: p.bribes, bribesOk,
    dirtyNet: dirty - s.dirty, cleanNet: clean - s.clean,
  };
}

function economy(s: GameState) {
  const p = projection(s);
  const f = settle(s);
  s.dirty += f.dirtyNet;
  s.clean += f.cleanNet;
  s.stats.laundered += f.launderGiven;
  s.stock = { ...p.plan.stockAfter };
  const crates = GOOD_ORDER.reduce((a, g) => a + p.plan.sold[g], 0);
  s.stats.cratesSold += crates;
  if (p.plan.produced) log(s, 'money', `Tes distilleries produisent ${p.plan.produced} caisses de gin.`);
  if (p.racket) log(s, 'money', `La protection rapporte ${fmt(p.racket)} d'argent sale.`);
  if (crates) {
    const detail = GOOD_ORDER.filter((g) => p.plan.sold[g]).map((g) => `${p.plan.sold[g]} ${GOODS[g].plural}`).join(', ');
    log(s, 'money', `Tes établissements écoulent ${crates} caisses (${detail}) : +${fmt(p.booze)}.`);
  }
  new Set(p.plan.outlets.filter((o) => o.revenue > 0).map((o) => o.districtId)).forEach((id) => fx(s, 'sale', id));
  if (p.plan.shortage) log(s, 'bad', `Rupture de stock : ${p.plan.shortage} caisses manquaient dans tes speakeasies. Des clients sont partis chez la concurrence.`);
  if (s.lowProfile) log(s, 'neutral', 'Profil bas : tous les commerces illégaux sont restés fermés.');
  if (f.launderTaken > 0) log(s, 'money', `${fmt(f.launderTaken)} d'argent sale blanchis via tes façades (+${fmt(f.launderGiven)} propre).`);

  if (f.unpaid > 0) {
    activeMembers(s).forEach((m) => (m.loyalty = clamp(m.loyalty - 15, 0, 100)));
    log(s, 'bad', `Impossible de payer tous tes hommes (il manque ${fmt(f.unpaid)}). La grogne monte.`);
  } else {
    activeMembers(s).forEach((m) => (m.loyalty = clamp(m.loyalty + 1, 0, 100)));
  }

  if (f.bribes > 0 && !f.bribesOk) {
    owned(s).forEach((d) => (d.bribedCop = false));
    s.judge = false;
    s.councilman = false;
    for (const c of activeContacts(s)) contactState(s, c.id).active = false;
    s.heat = clamp(s.heat + 8, 0, 100);
    log(s, 'police', "Pas assez d'argent propre pour les enveloppes : flics, juge et élus te lâchent (+8 heat).");
  }

  // heat
  let heat = p.heatGain - HEAT_DECAY;
  if (s.dirty > DIRTY_STASH_LIMIT) {
    const extra = Math.ceil((s.dirty - DIRTY_STASH_LIMIT) / 5000);
    heat += extra;
    log(s, 'police', `Trop de liquide sale planqué : les fédéraux flairent quelque chose (+${extra} heat).`);
  }
  if (s.councilman) heat -= 3;
  if (s.lowProfile) heat -= 6;
  s.heat = clamp(s.heat + heat, 0, 100);

  // respect
  const respectGain = Math.floor(owned(s).length / 3) +
    owned(s).reduce((t, d) => t + d.businesses.filter((b) => b.kind === 'restaurant').length, 0);
  s.respect = clamp(s.respect + respectGain + (donHasTalent(s, 'p_respect') ? 1 : 0), 0, 150);
}

// ---------- Descentes de police ----------
function resolveRaids(s: GameState, raided: Set<string>) {
  for (const d of owned(s)) {
    const illegal = d.businesses.filter((b) => BUSINESSES[b.kind].illegal);
    if (!illegal.length) continue;
    let p = Math.pow(s.heat / 100, 1.6) * 0.18 * d.police * raidMood(satisfaction(d)) * (donHasTalent(s, 'r_ombre') ? 0.8 : 1) * networkRaids(s);
    if (d.bribedCop) p *= 0.3;
    if (s.lowProfile) p *= 0.3;
    if (!chance(p)) continue;


    raided.add(d.id);
    s.stats.raids++;
    fx(s, 'raid', d.id);
    const b = pick(illegal);
    d.businesses = d.businesses.filter((x) => x.id !== b.id);
    const seized = Math.min(s.dirty, 400 * d.police);
    s.dirty -= seized;
    let crates = 0;
    for (const g of GOOD_ORDER) {
      const q = Math.floor(s.stock[g] * 0.15);
      s.stock[g] -= q;
      crates += q;
    }
    s.heat = clamp(s.heat - 8, 0, 100);
    log(s, 'police', `Descente à ${d.name} ! ${BUSINESSES[b.kind].name} fermé(e), ${fmt(seized)} et ${crates} caisses saisis.`);
    news(s, 4, `Descente des Prohis à ${d.name}`, `Un ${BUSINESSES[b.kind].name.toLowerCase()} fermé, l'alcool versé dans le caniveau sous les huées.`);
    for (const m of membersIn(s, d.id)) {
      if (has(m, 'fantome')) continue;
      if (chance((11 - m.discretion) * 0.05)) {
        m.status = 'prison';
        m.statusWeeks = randInt(3, 6);
        if (s.judge) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
        if (donHasTalent(s, 'r_avocat')) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
        log(s, 'police', `${m.nickname} est arrêté (${m.statusWeeks} sem. de prison${s.judge ? ', le juge a arrangé la peine' : ''}).`);
        addDossier(s, DOSSIER_ARREST, `${m.nickname} arrêté : il pourrait parler`);
      }
    }
  }
}

// ---------- IA des familles rivales ----------
/** `conquered` : quartiers pris par le joueur cette nuit, intouchables jusqu'au tour suivant */
function rivalsTurn(s: GameState, conquered: Set<string>) {
  for (const r of s.rivals) {
    if (!r.alive) continue;
    const mine = owned(s, r.id);
    if (!mine.length) {
      r.alive = false;
      s.respect = clamp(s.respect + 6, 0, 150);
      log(s, 'good', `${r.name} n'a plus aucun territoire. ${r.boss} a fui la ville.`);
      news(s, 5, `${r.boss} quitte New Corrano`, `Aperçu à la gare avec trois valises. La ${r.name} n'existe plus.`);
      continue;
    }
    // revenus et recrutement
    r.money += mine.reduce((t, d) => t + d.racket * 0.7 + d.businesses.length * 300, 0) * (donHas(r, 'riche') ? 1.25 : 1);
    const cap = 10 + mine.length * 12;
    for (let i = 0; i < 2 && r.money >= RIVAL_STRENGTH_COST && r.strength < cap; i++) {
      r.money -= RIVAL_STRENGTH_COST;
      r.strength += 1;
    }
    if (r.truceWeeks > 0) r.truceWeeks--;

    // attaque : la relation avec le joueur décide s'il est une cible
    const aggression = r.aggression * 0.6 * (r.war ? 1.6 : 1) * (donHas(r, 'sanguinaire') ? 1.3 : 1) * (donHasTalent(s, 'b_terreur') ? 0.75 : 1) * (inCoalition(s) && !r.alliance ? 1.6 : 1);
    if (s.week < 5 || !chance(aggression)) continue;
    const spareFriend = !r.war && r.relation > 30 && chance(0.8);
    const targets = uniqueDistricts(mine.flatMap((d) => neighbors(s, d))).filter((d) => {
      if (d.owner === r.id || conquered.has(d.id)) return false;
      if (d.owner === 'player') return !r.alliance && r.truceWeeks === 0 && !spareFriend;
      return true;
    });
    if (!targets.length) continue;
    const hunt = r.war || donHas(r, 'revanchard') || (inCoalition(s) && !r.alliance);
    const score = (d: District) => defenseOf(s, d) - d.racket / 400 - (hunt && d.owner === 'player' ? 8 : 0);
    targets.sort((a, b) => score(a) - score(b));
    const target = chance(0.7) ? targets[0] : pick(targets);
    rivalAttack(s, r, target);
  }
}

function donWin(s: GameState, r: RivalFamily) {
  r.wins = (r.wins ?? 0) + 1;
  if (r.wins >= 3 && !donHas(r, 'aguerri')) {
    (r.traits ??= []).push('aguerri');
    log(s, 'neutral', `${r.boss} devient Aguerri après trois victoires : ses quartiers sont mieux défendus.`);
  }
}

function uniqueDistricts(list: District[]) {
  return [...new Map(list.map((d) => [d.id, d])).values()];
}

function rivalAttack(s: GameState, r: RivalFamily, d: District) {
  const power = r.strength * 0.5 * (0.7 + rand() * 0.6) * (donHas(r, 'aguerri') ? 1.1 : 1);
  const def = defenseOf(s, d) * (0.8 + rand() * 0.4);
  const defenders = d.owner === 'player' ? membersIn(s, d.id).filter((m) => !committedToAttack(s, m.id)) : [];
  fx(s, 'battle', d.id);

  if (d.owner === 'player') {
    if (power > def) {
      d.owner = r.id;
      d.bribedCop = false;
      s.respect = clamp(s.respect - 6, 0, 150);
      s.stats.battlesLost++;
      log(s, 'bad', `${r.name} attaque et s'empare de ${d.name} !`);
      donWin(s, r);
      fx(s, 'lost', d.id);
      news(s, 5, `${d.name} tombe aux mains de ${r.name}`, `Les hommes de ${r.boss} ont surpris la garde de la ${s.familyName}.`);
      casualties(s, defenders, 0.45, 0.15);
      defenders.forEach((m) => (m.assignment = null));
      defenders.filter((m) => s.members.includes(m)).forEach((m) => award(s, m, 1, 'force'));
    } else {
      r.strength = Math.max(3, r.strength - 2);
      s.respect = clamp(s.respect + 3, 0, 150);
      s.stats.battlesWon++;
      defenders.forEach((m) => (m.loyalty = clamp(m.loyalty + 3, 0, 100)));
      log(s, 'good', `${r.name} attaque ${d.name}, mais tes hommes repoussent l'assaut.`);
      casualties(s, defenders, 0.15, 0.04);
      defenders.filter((m) => s.members.includes(m)).forEach((m) => award(s, m, 3, 'force'));
    }
    return;
  }

  if (power > def) {
    const prev = d.owner;
    d.owner = r.id;
    d.garrison = 0;
    donWin(s, r);
    if (prev !== 'neutral') {
      const loser = rival(s, prev)!;
      loser.strength = Math.max(3, loser.strength - 3);
      log(s, 'neutral', `Guerre des gangs : ${r.name} prend ${d.name} à ${loser.name}.`);
      news(s, 3, `Guerre des gangs à ${d.name}`, `${r.name} chasse ${loser.name} du quartier. Bilan : quatre morts et un tramway criblé de balles.`);
    } else {
      log(s, 'neutral', `${r.name} s'installe à ${d.name}.`);
    }
  } else {
    r.strength = Math.max(3, r.strength - 1);
  }
}

// ---------- Hommes : loyauté, trahisons, convalescence ----------
function crewTurn(s: GameState, raided: Set<string>) {
  for (const d of s.districts) if ((d.unrest ?? 0) > 0) d.unrest!--;
  // les indépendants s'organisent avec le temps
  if (s.week % 6 === 0) s.districts.filter((d) => d.owner === 'neutral').forEach((d) => (d.garrison += 1));
  const medic = familyCount(s, 'infirmier') > 0;
  for (const m of [...s.members]) {
    if ((m.fatigue ?? 0) > 0) m.fatigue!--;
    if (m.status !== 'actif') {
      m.statusWeeks -= m.status === 'blessé' && medic ? 2 : 1;
      if (m.statusWeeks <= 0) {
        m.status = 'actif';
        log(s, 'neutral', `${m.nickname} est de retour.`);
      }
      continue;
    }
    m.weeksServed++;
    if (m.isDon || m.isChild) { m.loyalty = 100; continue; }
    let delta = donHasTalent(s, 'p_parole') ? 1 : 0;
    if (s.respect >= 50) delta += 1;
    if (m.rank === 'soldat' && m.assignment && membersIn(s, m.assignment).some((o) => o.rank === 'capo')) delta += 1;
    if (m.assignment && raided.has(m.assignment)) delta -= 5;
    if (s.heat > 70) delta -= 2;
    if (has(m, 'cupide')) delta -= 1;
    m.loyalty = clamp(m.loyalty + delta, has(m, 'fidele') ? 50 : 0, 100);

    if (m.loyalty < 25 && !has(m, 'fidele') && chance(0.3)) betray(s, m);
  }
}

function betray(s: GameState, m: Member) {
  s.members = s.members.filter((x) => x.id !== m.id);
  const living = s.rivals.filter((r) => r.alive);
  if (living.length && chance(0.5)) {
    const r = pick(living);
    r.strength += Math.ceil(m.force / 2);
    s.heat = clamp(s.heat + 5, 0, 100);
    log(s, 'bad', `Trahison ! ${m.name} « ${m.nickname} » est passé chez ${r.name}.`);
  } else {
    s.heat = clamp(s.heat + 18, 0, 100);
    log(s, 'police', `Trahison ! ${m.name} « ${m.nickname} » s'est mis à table avec la police (+18 heat).`);
    addDossier(s, DOSSIER_RAT, `${m.nickname} témoigne contre la famille`);
    news(s, 4, 'Un repenti parle au procureur', `${m.name}, dit « ${m.nickname} », livrerait les secrets de la ${s.familyName}.`);
  }
}

// ---------- Arrestation du Don ----------
/** La heat ne mène plus directement à l'arrestation : elle nourrit le dossier fédéral, qui mène au procès */
function heatWarnings(s: GameState) {
  const d = s.dossier ?? 0;
  if (d >= 80 && !s.trial) log(s, 'police', `Le dossier fédéral est à ${d}/100 : une inculpation se prépare.`);
  else if (s.heat >= 75) log(s, 'police', 'La heat est au plus haut : chaque semaine nourrit le dossier fédéral.');
}

// ---------- Fin de partie ----------
export function checkEnd(s: GameState) {
  if (s.status !== 'playing') return;
  const n = owned(s).length;
  if (n === 0) {
    s.status = 'lost';
    s.endReason = 'Ta famille a été rayée de la carte. Plus un seul quartier ne te paie.';
  } else if (activeMembers(s).length === 0 && s.members.length === 0 && s.dirty + s.clean < 300) {
    s.status = 'lost';
    s.endReason = "Plus d'hommes, plus d'argent. Tu finis tes jours à servir des cafés à Little Sicily.";
  } else if (n === s.districts.length) {
    s.status = 'won';
    s.endReason = 'Toute la ville de New Corrano te paie tribut. Tu es le Capo dei Capi.';
  } else if (n >= 8 && s.respect >= 120) {
    s.status = 'won';
    s.endReason = 'Les familles survivantes viennent baiser ta bague. Tu es le Capo dei Capi.';
  }
  if (s.status !== 'playing') log(s, s.status === 'won' ? 'good' : 'bad', s.endReason);
}

export function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('fr-FR')}`;
}

export { COUNCIL_BRIBE, JUDGE_BRIBE };
