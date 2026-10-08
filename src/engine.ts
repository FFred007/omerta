import { BUSINESSES, COUNCIL_BRIBE, DIRTY_STASH_LIMIT, JUDGE_BRIBE, LAUNDER_FEE, PROMOTE_COST } from './data';
import { rollEvent } from './events';
import {
  activeMembers, attackPower, chance, roll, winChance, clamp, committedToAttack, defenseOf, district, isAttackable, log,
  makeRecruit, membersIn, neighbors, nextId, owned, pick, projection, rand, randInt, rival,
} from './state';
import type { BusinessKind, District, GameState, LogEntry, Member, RivalFamily } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export const JUDGE_MIN_RESPECT = 15;
export const RIVAL_STRENGTH_COST = 900;
export const COUNCIL_MIN_RESPECT = 35;

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
  if (s.dirty + s.clean < r.cost) return fail("Pas assez d'argent.");
  const fromDirty = Math.min(s.dirty, r.cost);
  s.dirty -= fromDirty;
  s.clean -= r.cost - fromDirty;
  s.recruits = s.recruits.filter((x) => x.id !== recruitId);
  s.members.push({
    id: r.id, name: r.name, nickname: r.nickname, rank: 'soldat', force: r.force, discretion: r.discretion,
    loyalty: r.loyalty, salary: r.salary, assignment: null, status: 'actif', statusWeeks: 0, weeksServed: 0,
  });
  log(s, 'good', `${r.name} « ${r.nickname} » a prêté serment.`);
  return ok;
}

export function fire(s: GameState, memberId: number): ActionResult {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return fail('Introuvable.');
  s.members = s.members.filter((x) => x.id !== memberId);
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== memberId)));
  s.orders = s.orders.filter((o) => o.memberIds.length);
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
  if (m.force + m.discretion < 12) return fail('Pas assez solide (force + discrétion ≥ 12).');
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

// =====================================================================
// Fin de semaine
// =====================================================================

export function endTurn(s: GameState): LogEntry[] {
  if (s.status !== 'playing' || s.pendingEvent) return [];
  const week = s.week;
  const raidedDistricts = new Set<string>();

  const conquered = new Set<string>();
  resolvePlayerAttacks(s, conquered);
  economy(s);
  resolveRaids(s, raidedDistricts);
  rivalsTurn(s, conquered);
  crewTurn(s, raidedDistricts);
  donArrestCheck(s);
  checkEnd(s);

  s.lastReport = s.log.filter((e) => e.week === week).reverse();
  s.orders = [];
  s.lowProfile = false;
  s.week += 1;

  // renouvellement des recrues
  if (s.recruits.length >= 3) s.recruits.splice(randInt(0, s.recruits.length - 1), 1);
  while (s.recruits.length < 3) s.recruits.push(makeRecruit(s));

  if (s.status === 'playing' && chance(0.45)) s.pendingEvent = rollEvent(s);
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
    s.heat = clamp(s.heat + 5 + d.police * 2, 0, 100);
    men.forEach((m) => (m.fatigue = 2));

    if (power > def) {
      s.stats.battlesWon++;
      d.owner = 'player';
      d.bribedCop = false;
      d.garrison = 0;
      d.unrest = 3;
      if (r) r.strength = Math.max(3, r.strength - Math.ceil(defBase * 0.35));
      s.respect = clamp(s.respect + (r ? 5 : 3), 0, 150);
      // les hommes de réserve tiennent le nouveau quartier, les autres rentrent à leur poste
      const holders = men.filter((m) => !m.assignment);
      men.forEach((m) => (m.loyalty = clamp(m.loyalty + 4, 0, 100)));
      holders.forEach((m) => (m.assignment = d.id));
      conquered.add(d.id);
      log(s, 'good', `Victoire ! Tes hommes prennent ${target} ${dice}.${holders.length ? '' : " Personne n'y est resté en garde."}`);
      casualties(s, men, 0.2 * ratio, 0.06 * ratio);
    } else {
      s.stats.battlesLost++;
      s.respect = clamp(s.respect - 3, 0, 150);
      if (r) r.strength = Math.max(3, r.strength - 1);
      else d.garrison += 1;
      log(s, 'bad', `L'assaut sur ${target} tourne mal ${dice}. Tes hommes se replient.`);
      casualties(s, men, 0.35 * ratio, 0.12 * ratio);
    }
  }
}

function casualties(s: GameState, men: Member[], pInjured: number, pKilled: number) {
  for (const m of men) {
    if (chance(pKilled)) {
      s.members = s.members.filter((x) => x.id !== m.id);
      activeMembers(s).forEach((o) => (o.loyalty = clamp(o.loyalty - 2, 0, 100)));
      log(s, 'bad', `${m.name} « ${m.nickname} » est tombé. La famille porte le deuil.`);
    } else if (chance(pInjured)) {
      m.status = 'blessé';
      m.statusWeeks = randInt(2, 3);
      log(s, 'bad', `${m.nickname} est blessé (${m.statusWeeks} sem.).`);
    }
  }
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
  const launderGiven = Math.round(launderTaken * (1 - LAUNDER_FEE));
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
  if (f.dirtyIn) log(s, 'money', `Les rackets rapportent ${fmt(f.dirtyIn)} d'argent sale.`);
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
    s.heat = clamp(s.heat + 8, 0, 100);
    log(s, 'police', "Pas assez d'argent propre pour les enveloppes : flics, juge et élus te lâchent (+8 heat).");
  }

  // heat
  let heat = p.heatGain - 3;
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
  s.respect = clamp(s.respect + respectGain, 0, 150);
}

// ---------- Descentes de police ----------
function resolveRaids(s: GameState, raided: Set<string>) {
  for (const d of owned(s)) {
    const illegal = d.businesses.filter((b) => BUSINESSES[b.kind].illegal);
    if (!illegal.length) continue;
    let p = Math.pow(s.heat / 100, 1.6) * 0.18 * d.police;
    if (d.bribedCop) p *= 0.3;
    if (s.lowProfile) p *= 0.3;
    if (!chance(p)) continue;

    raided.add(d.id);
    s.stats.raids++;
    const b = pick(illegal);
    d.businesses = d.businesses.filter((x) => x.id !== b.id);
    const seized = Math.min(s.dirty, 400 * d.police);
    s.dirty -= seized;
    s.heat = clamp(s.heat - 8, 0, 100);
    log(s, 'police', `Descente à ${d.name} ! ${BUSINESSES[b.kind].name} fermé(e), ${fmt(seized)} saisis.`);
    for (const m of membersIn(s, d.id)) {
      if (chance((11 - m.discretion) * 0.05)) {
        m.status = 'prison';
        m.statusWeeks = randInt(3, 6);
        if (s.judge) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
        log(s, 'police', `${m.nickname} est arrêté (${m.statusWeeks} sem. de prison${s.judge ? ', le juge a arrangé la peine' : ''}).`);
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
      continue;
    }
    // revenus et recrutement
    r.money += mine.reduce((t, d) => t + d.racket * 0.7 + d.businesses.length * 300, 0);
    const cap = 10 + mine.length * 10;
    for (let i = 0; i < 2 && r.money >= RIVAL_STRENGTH_COST && r.strength < cap; i++) {
      r.money -= RIVAL_STRENGTH_COST;
      r.strength += 1;
    }
    if (r.truceWeeks > 0) r.truceWeeks--;

    // attaque
    if (s.week < 5 || !chance(r.aggression * 0.6)) continue;
    const targets = uniqueDistricts(mine.flatMap((d) => neighbors(s, d))).filter(
      (d) => d.owner !== r.id && !conquered.has(d.id) && !(d.owner === 'player' && r.truceWeeks > 0),
    );
    if (!targets.length) continue;
    targets.sort((a, b) => defenseOf(s, a) - defenseOf(s, b) + (b.racket - a.racket) / 400);
    const target = chance(0.7) ? targets[0] : pick(targets);
    rivalAttack(s, r, target);
  }
}

function uniqueDistricts(list: District[]) {
  return [...new Map(list.map((d) => [d.id, d])).values()];
}

function rivalAttack(s: GameState, r: RivalFamily, d: District) {
  const power = r.strength * 0.5 * (0.7 + rand() * 0.6);
  const def = defenseOf(s, d) * (0.8 + rand() * 0.4);
  const defenders = d.owner === 'player' ? membersIn(s, d.id).filter((m) => !committedToAttack(s, m.id)) : [];

  if (d.owner === 'player') {
    if (power > def) {
      d.owner = r.id;
      d.bribedCop = false;
      s.respect = clamp(s.respect - 6, 0, 150);
      s.stats.battlesLost++;
      log(s, 'bad', `${r.name} attaque et s'empare de ${d.name} !`);
      casualties(s, defenders, 0.45, 0.15);
      defenders.forEach((m) => (m.assignment = null));
    } else {
      r.strength = Math.max(3, r.strength - 2);
      s.respect = clamp(s.respect + 3, 0, 150);
      s.stats.battlesWon++;
      defenders.forEach((m) => (m.loyalty = clamp(m.loyalty + 3, 0, 100)));
      log(s, 'good', `${r.name} attaque ${d.name}, mais tes hommes repoussent l'assaut.`);
      casualties(s, defenders, 0.15, 0.04);
    }
    return;
  }

  if (power > def) {
    const prev = d.owner;
    d.owner = r.id;
    d.garrison = 0;
    if (prev !== 'neutral') {
      const loser = rival(s, prev)!;
      loser.strength = Math.max(3, loser.strength - 3);
      log(s, 'neutral', `Guerre des gangs : ${r.name} prend ${d.name} à ${loser.name}.`);
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
  for (const m of [...s.members]) {
    if ((m.fatigue ?? 0) > 0) m.fatigue!--;
    if (m.status !== 'actif') {
      m.statusWeeks--;
      if (m.statusWeeks <= 0) {
        m.status = 'actif';
        log(s, 'neutral', `${m.nickname} est de retour.`);
      }
      continue;
    }
    m.weeksServed++;
    let delta = 0;
    if (s.respect >= 50) delta += 1;
    if (m.rank === 'soldat' && m.assignment && membersIn(s, m.assignment).some((o) => o.rank === 'capo')) delta += 1;
    if (m.assignment && raided.has(m.assignment)) delta -= 5;
    if (s.heat > 70) delta -= 2;
    m.loyalty = clamp(m.loyalty + delta, 0, 100);

    if (m.loyalty < 25 && chance(0.3)) betray(s, m);
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
  }
}

// ---------- Arrestation du Don ----------
function donArrestCheck(s: GameState) {
  if (s.heat >= 70 && s.heat < 85) log(s, 'police', 'Le procureur prépare un dossier contre toi. Fais baisser la pression.');
  if (s.heat < 85) return;
  if (!chance((s.heat - 80) / 50)) {
    log(s, 'police', 'Les fédéraux rôdent autour de ta maison. Une inculpation est imminente.');
    return;
  }
  if (s.judge) {
    s.heat = clamp(s.heat - 30, 0, 100);
    s.clean = Math.max(0, s.clean - 2000);
    log(s, 'police', "Tu es inculpé… mais ton juge fait annuler la procédure pour vice de forme (-2 000 propre, -30 heat).");
  } else {
    s.status = 'lost';
    s.endReason = "Les fédéraux t'ont arrêté. Sans juge dans ta poche, tu prends 20 ans à Leavenworth.";
    log(s, 'bad', s.endReason);
  }
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
  } else if (n >= 7 && s.respect >= 100) {
    s.status = 'won';
    s.endReason = 'Les familles survivantes viennent baiser ta bague. Tu es le Capo dei Capi.';
  }
  if (s.status !== 'playing') log(s, s.status === 'won' ? 'good' : 'bad', s.endReason);
}

export function fmt(n: number) {
  return `$${Math.round(n).toLocaleString('fr-FR')}`;
}

export { COUNCIL_BRIBE, JUDGE_BRIBE };
