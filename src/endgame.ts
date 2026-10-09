// Fin de partie : les menaces d'une famille qui a grandi (expéditions, révoltes, brigade fédérale)
// et ce qu'on peut acheter avec tout cet argent (le maire, un sénateur, la charité).
import { cityOf, donCity } from './cities';
import { addDossier } from './dossier';
import { casualties } from './engine';
import { contactState, isActive } from './network';
import { tierOf } from './data';
import { award, chance, clamp, defenseOf, district, log, membersIn, news, owned, pick, rival, satisfaction, winChance } from './state';
import type { District, GameState, PendingEvent } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

const active = (s: GameState) => s.status === 'playing';

// =====================================================================
// Les expéditions : une famille d'une autre ville débarque à la gare
// =====================================================================
export const EXPEDITION_WARNING = 2;
export const expeditionOpen = (s: GameState) => owned(s).length >= 3 && (owned(s).length >= 7 || tierOf(s.respect) >= 2);

export function expeditionHold(s: GameState) {
  const e = s.expedition;
  if (!e) return 0;
  return winChance(defenseOf(s, district(s, e.target)), e.force);
}
export const payoffCost = (s: GameState) => (s.expedition ? 2000 + s.expedition.force * 150 : 0);

function planExpedition(s: GameState) {
  const mine = owned(s).filter((d) => d.id !== 'sicily'); // le berceau de la famille n'est pas une cible d'expédition
  if (!mine.length) return;
  const home = donCity(s);
  const inCity = mine.filter((d) => cityOf(d) === home);
  const pool = inCity.length ? inCity : mine;
  const city = cityOf(pool[0]);
  const r = s.rivals.filter((x) => x.alive && !x.alliance && x.aggression > 0.1 && (x.city ?? 'corrano') !== city).sort((a, b) => b.strength - a.strength)[0];
  if (!r) return;
  const target = pool.find((d) => d.gate) ?? [...pool].sort((a, b) => b.racket - a.racket)[0];
  const force = Math.round(r.strength * 0.6 + s.week / 8 + mine.length / 2);
  s.expedition = { rivalId: r.id, target: target.id, force, arrive: s.week + EXPEDITION_WARNING };
  log(s, 'bad', `${r.name} prépare une expédition : ses hommes débarqueront à ${target.name} dans ${EXPEDITION_WARNING} semaines (force ${force}).`);
  news(s, 4, `${r.name} lorgne sur ${target.name}`, `On a vu des hommes de ${r.boss} réserver des billets de train pour New Corrano.`);
}

export function payOffExpedition(s: GameState): Result {
  const e = s.expedition;
  if (!e) return fail('Personne ne vient.');
  const cost = payoffCost(s);
  if (s.dirty < cost) return fail(`Il faut ${fmt(cost)} sales.`);
  s.dirty -= cost;
  s.respect = clamp(s.respect - 3, 0, 150);
  const r = rival(s, e.rivalId);
  s.expedition = null;
  s.expeditionCd = s.week + 10;
  log(s, 'neutral', `${r?.name ?? 'Ils'} acceptent ${fmt(cost)} pour rester chez eux. La rue trouve que tu as payé (−3 respect).`);
  return ok;
}

function resolveExpedition(s: GameState) {
  const e = s.expedition!;
  const r = rival(s, e.rivalId);
  const d = district(s, e.target);
  s.expedition = null;
  s.expeditionCd = s.week + 10;
  if (!r?.alive || !d || d.owner !== 'player') return;
  const defenders = membersIn(s, d.id);
  const p = winChance(defenseOf(s, d), e.force);
  if (chance(p)) {
    s.respect = clamp(s.respect + 6, 0, 150);
    r.strength = Math.max(3, r.strength - 3);
    s.stats.battlesWon++;
    log(s, 'good', `Les hommes de ${r.name} descendent du train à ${d.name} : tes hommes les attendaient. Ils repartent par le suivant (+6 respect).`);
    news(s, 5, `${r.name} repoussée à ${d.name}`, `La ${s.familyName} a défendu son territoire face aux étrangers.`);
    casualties(s, defenders, 0.15, 0.04, r.id);
    defenders.filter((m) => s.members.includes(m)).forEach((m) => award(s, m, 3, 'force'));
  } else {
    d.owner = r.id;
    d.bribedCop = false;
    s.respect = clamp(s.respect - 6, 0, 150);
    s.stats.battlesLost++;
    log(s, 'bad', `L'expédition de ${r.name} s'empare de ${d.name} (−6 respect).`);
    news(s, 5, `${d.name} tombe aux mains de ${r.name}`, `Venus d'une autre ville, les hommes de ${r.boss} ont pris pied à New Corrano.`);
    casualties(s, defenders, 0.45, 0.15, r.id);
    defenders.forEach((m) => (m.assignment = null));
  }
}

// =====================================================================
// Les révoltes de commerçants
// =====================================================================
export const REVOLT_AT = 3;
export const CALM_COST = 1500;

function revoltEvent(s: GameState, d: District): PendingEvent {
  return {
    key: 'eg_revolt', title: `Les commerçants de ${d.name} se soulèvent`,
    text: `Trois semaines qu'ils paient sans rien dire. Ce matin, les rideaux sont baissés, et le boucher a jeté ton collecteur dans la rue. Ils ne paieront plus.`,
    data: { district: d.id },
    choices: [
      { label: 'Les apaiser', hint: `${fmt(CALM_COST)} · satisfaction +25`, effect: 'eg_calm', disabled: s.dirty + s.clean < CALM_COST },
      { label: 'Écraser la révolte', hint: '+6 heat · revenus ÷2 pendant 3 semaines · la peur fait remonter la satisfaction de 10', effect: 'eg_crush' },
      { label: 'Laisser faire', hint: 'Le quartier devient indépendant', effect: 'eg_let' },
    ],
  };
}

function revoltTick(s: GameState) {
  for (const d of owned(s)) {
    d.grievance = satisfaction(d) < 25 && d.shops.length ? (d.grievance ?? 0) + 1 : 0;
  }
  if (s.pendingEvent) return;
  const hot = owned(s).filter((d) => (d.grievance ?? 0) >= REVOLT_AT && d.id !== 'sicily');
  if (hot.length && chance(0.5)) s.pendingEvent = revoltEvent(s, pick(hot));
}

// =====================================================================
// La brigade fédérale spéciale
// =====================================================================
export const BRIGADE_WEEKS = 10;
export const BRIGADE_DOSSIER = 2;
export const BRIGADE_RAIDS = 1.6;
export const brigadeLeader = 'agent Nathan Dutton';
export const brigadeActive = (s: GameState) => (s.brigade?.weeks ?? 0) > 0;

function brigadeTick(s: GameState) {
  if (brigadeActive(s)) {
    s.brigade!.weeks -= 1;
    if (!s.brigade!.weeks) {
      s.brigade = null;
      s.brigadeCd = s.week + 12;
      log(s, 'good', `La brigade spéciale de l’${brigadeLeader} est rappelée à Washburn.`);
    }
    return;
  }
  if (s.senator || (s.brigadeCd ?? 0) > s.week) return;
  const big = owned(s).length >= 8 || tierOf(s.respect) >= 3;
  if (big && (s.dossier ?? 0) >= 45 && chance(0.08)) {
    s.brigade = { weeks: BRIGADE_WEEKS };
    log(s, 'police', `Washburn envoie une brigade spéciale : l’${brigadeLeader} et douze agents qu’on ne peut pas acheter. ${BRIGADE_WEEKS} semaines de descentes (+${BRIGADE_DOSSIER} dossier par semaine).`);
    news(s, 6, 'Les Incorruptibles de Dutton à New Corrano', `« Pas un dollar ne passera dans nos poches », jure l’agent fédéral, qui vise la ${s.familyName}.`);
  }
}

// =====================================================================
// Les élections municipales
// =====================================================================
export const ELECTION_EVERY = 16;
export const FUND_STEP = 2000;
export const FUND_MAX = 20000;
export const MAYOR_FRIEND = 'Thornton';
export const MAYOR_REFORM = 'Harriet Cole';

export function election(s: GameState) {
  return (s.election ??= { next: ELECTION_EVERY, funds: 0, mayor: null });
}
export function electionChance(s: GameState) {
  const e = election(s);
  return clamp(0.35 + e.funds / 25000 + (isActive(s, 'maire') ? 0.1 : 0) + (s.senator ? 0.15 : 0) - Math.max(0, s.heat - 40) / 200, 0.05, 0.95);
}
export function fundCampaign(s: GameState): Result {
  if (!active(s)) return fail('Il faut être Don.');
  const e = election(s);
  if (e.funds >= FUND_MAX) return fail(`La campagne ne peut pas absorber plus de ${fmt(FUND_MAX)}.`);
  if (s.clean < FUND_STEP) return fail(`Il faut ${fmt(FUND_STEP)} propres.`);
  s.clean -= FUND_STEP;
  e.funds += FUND_STEP;
  return ok;
}
function electionTick(s: GameState) {
  const e = election(s);
  if (s.week < e.next) return;
  const p = electionChance(s);
  e.mayor = chance(p) ? 'ami' : 'reformateur';
  e.funds = 0;
  e.next = s.week + ELECTION_EVERY;
  if (e.mayor === 'ami') {
    log(s, 'good', `Élections municipales : ${MAYOR_FRIEND} est réélu. Il sait ce qu’il te doit (descentes −15 %, −1 heat par semaine).`);
    news(s, 5, `${MAYOR_FRIEND} réélu`, 'Une campagne généreusement financée, des affiches à chaque coin de rue.');
  } else {
    log(s, 'bad', `Élections municipales : ${MAYOR_REFORM}, la réformatrice, l’emporte. Descentes +25 %, +1 heat par semaine jusqu’aux prochaines.`);
    news(s, 5, `${MAYOR_REFORM} élue maire`, '« Je nettoierai cette ville », promet la nouvelle maire.');
    if (isActive(s, 'maire')) { contactState(s, 'maire').active = false; log(s, 'bad', `Le maire ${MAYOR_FRIEND} quitte l’hôtel de ville : ta mensualité s’arrête.`); }
  }
}

// =====================================================================
// Un sénateur
// =====================================================================
export const SENATOR_COST = 25000;
export const SENATOR_RETAINER = 1500;
export const SENATOR_DOSSIER = -2;
export const SENATOR_SCANDAL = 0.01;
export function senatorBlocker(s: GameState) {
  if (!active(s)) return 'Il faut être Don.';
  if (s.senator) return 'Le sénateur Whitcombe est déjà à toi.';
  if (tierOf(s.respect) < 3) return 'Il faut être une Grande famille (60 de respect).';
  if (s.clean < SENATOR_COST) return `Il faut ${fmt(SENATOR_COST)} propres.`;
  return null;
}
export function buySenator(s: GameState): Result {
  const why = senatorBlocker(s);
  if (why) return fail(why);
  s.clean -= SENATOR_COST;
  s.senator = { since: s.week };
  log(s, 'good', `Le sénateur Whitcombe dîne à ta table. Le dossier fédéral s’enlise (${SENATOR_DOSSIER} par semaine), et Washburn ne t’enverra plus de brigade.`);
  if (brigadeActive(s)) { s.brigade = null; s.brigadeCd = s.week + 12; log(s, 'good', `Un coup de téléphone du sénateur : la brigade de l’${brigadeLeader} est rappelée.`); }
  return ok;
}
export function dropSenator(s: GameState, why: string) {
  if (!s.senator) return;
  s.senator = null;
  log(s, 'bad', why);
}
function senatorTick(s: GameState) {
  if (!s.senator) return;
  if (chance(SENATOR_SCANDAL)) {
    s.senator = null;
    addDossier(s, 12, 'Scandale du sénateur Whitcombe');
    s.heat = clamp(s.heat + 10, 0, 100);
    log(s, 'bad', 'Scandale : un journaliste de Washburn publie les dîners du sénateur Whitcombe avec toi. Il démissionne (+12 dossier, +10 heat).');
    news(s, 6, 'Le sénateur et le gangster', 'Whitcombe démissionne après la publication de photos compromettantes.');
  }
}

// =====================================================================
// Les galas de charité
// =====================================================================
export const GALA_COOLDOWN = 6;
export const galaCost = (s: GameState) => 5000 * ((s.gala?.count ?? 0) + 1);
export function galaBlocker(s: GameState) {
  if (!active(s)) return 'Il faut être Don.';
  const g = s.gala;
  if (g?.last !== undefined && s.week - g.last < GALA_COOLDOWN) return `Un gala toutes les ${GALA_COOLDOWN} semaines (encore ${GALA_COOLDOWN - (s.week - g.last)}).`;
  if (s.clean < galaCost(s)) return `Il faut ${fmt(galaCost(s))} propres.`;
  return null;
}
export function holdGala(s: GameState): Result {
  const why = galaBlocker(s);
  if (why) return fail(why);
  const cost = galaCost(s);
  s.clean -= cost;
  s.gala = { count: (s.gala?.count ?? 0) + 1, last: s.week };
  s.respect = clamp(s.respect + 5, 0, 150);
  s.heat = clamp(s.heat - 8, 0, 100);
  addDossier(s, -3, 'Gala de charité');
  log(s, 'good', `Gala de charité au Grand Hôtel (${fmt(cost)}) : le maire, l’évêque et la presse lèvent leur verre au généreux donateur (+5 respect, −8 heat, −3 dossier).`);
  news(s, 4, 'Un gala pour l’hôpital Saint-Janvier', `La ${s.familyName} finance une aile neuve. On applaudit, on oublie le reste.`);
  return ok;
}

// =====================================================================
// Effets sur les prévisions (heat, dossier, descentes)
// =====================================================================
export function politicsHeatLines(s: GameState) {
  const m = s.election?.mayor;
  if (!active(s) || !m) return [];
  return [m === 'ami' ? { label: `Le maire ${MAYOR_FRIEND} te doit son élection`, value: -1 } : { label: `La maire réformatrice ${MAYOR_REFORM}`, value: 1 }];
}
export const politicsHeat = (s: GameState) => politicsHeatLines(s).reduce((a, l) => a + l.value, 0);
export function politicsDossierLines(s: GameState) {
  if (!active(s)) return [];
  const out: { label: string; value: number }[] = [];
  if (brigadeActive(s)) out.push({ label: `Brigade spéciale de l’${brigadeLeader}`, value: BRIGADE_DOSSIER });
  if (s.senator) out.push({ label: 'Le sénateur Whitcombe freine Washburn', value: SENATOR_DOSSIER });
  return out;
}
/** Multiplicateur des descentes ; sous la brigade, les flics payés ne protègent plus qu'à moitié */
export function politicsRaids(s: GameState) {
  if (!active(s)) return 1;
  const m = s.election?.mayor;
  return (m === 'ami' ? 0.85 : m === 'reformateur' ? 1.25 : 1) * (brigadeActive(s) ? BRIGADE_RAIDS : 1);
}
export const senatorRetainer = (s: GameState) => (s.senator && active(s) ? SENATOR_RETAINER : 0);

// =====================================================================
export function endgameTick(s: GameState) {
  if (!active(s)) return;
  electionTick(s);
  brigadeTick(s);
  senatorTick(s);
  if (s.expedition && s.week >= s.expedition.arrive) resolveExpedition(s);
  else if (!s.expedition && s.week >= 20 && expeditionOpen(s) && (s.expeditionCd ?? 0) <= s.week && chance(0.05 + Math.max(0, owned(s).length - 7) * 0.01)) planExpedition(s);
  revoltTick(s);
}

export function resolveEndgameEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('eg_')) return false;
  const d = s.districts.find((x) => x.id === ev.data?.district);
  if (!d) return true;
  d.grievance = 0;
  switch (effect) {
    case 'eg_calm': {
      const c = Math.min(s.dirty, CALM_COST);
      s.dirty -= c;
      s.clean -= CALM_COST - c;
      d.shops.forEach((x) => (x.satisfaction = clamp(x.satisfaction + 25, 0, 100)));
      log(s, 'neutral', `Tu reçois les commerçants de ${d.name}, un par un. Ils rouvrent (satisfaction +25).`);
      break;
    }
    case 'eg_crush':
      s.heat = clamp(s.heat + 6, 0, 100);
      d.unrest = 3;
      d.shops.forEach((x) => (x.satisfaction = clamp(x.satisfaction + 10, 0, 100)));
      log(s, 'bad', `Une vitrine brisée, un boucher à l’hôpital : ${d.name} rouvre, la peur au ventre (+6 heat, revenus ÷2 pendant 3 semaines).`);
      break;
    case 'eg_let':
      d.owner = 'neutral';
      d.garrison = 6;
      d.bribedCop = false;
      s.members.filter((m) => m.assignment === d.id).forEach((m) => (m.assignment = null));
      s.respect = clamp(s.respect - 4, 0, 150);
      log(s, 'bad', `${d.name} ne t’appartient plus : les commerçants ont engagé leurs propres gros bras (−4 respect).`);
      break;
  }
  return true;
}
