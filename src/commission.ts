// La Commission des Dons : toutes les familles du pays se réunissent toutes les 4 semaines et votent une motion.
// Les voix s'achètent, se promettent par pacte… et se trahissent.
import { tierOf } from './data';
import { cityName, rivalCity } from './cities';
import { COALITION_AT, COALITION_WEEKS, inCoalition } from './pressure';
import { chance, clamp, log, news, owned } from './state';
import { donHas } from './traits';
import type { Commission, GameState, Motion, MotionKind, RivalFamily, Vote } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const MEETING_EVERY = 4;
export const FIRST_MEETING = 8;
export const SEAT_TIER = 3; // Grande famille
export const CHAIR_TIER = 4; // Parrain
export const PACT_WEEKS = 6;
export const PACT_MIN_RELATION = 10;
export const TREVE_WEEKS = 4;
export const PORT_WEEKS = 6;
export const BAN_WEEKS = 8;
export const DIME_PER_DISTRICT = 300;

export const living = (s: GameState) => s.rivals.filter((r) => r.alive);
const avgStrength = (s: GameState) => {
  const l = living(s);
  return l.length ? l.reduce((t, r) => t + r.strength, 0) / l.length : 10;
};

export function initCommission(s: GameState): Commission {
  const c: Commission = {
    seat: false, chair: false, next: FIRST_MEETING, motion: null, bought: {}, pacts: [], vote: null,
    truceWeeks: 0, portWeeks: 0, history: [],
  };
  c.motion = drawMotion(s, c);
  return c;
}

export const commission = (s: GameState) => (s.commission ??= initCommission(s));

// ---------- Motions ----------
function makeMotion(s: GameState, kind: MotionKind, target?: string): Motion {
  const fam = s.familyName;
  const t = target ? s.rivals.find((r) => r.id === target) : undefined;
  switch (kind) {
    case 'admission': return { kind, title: `Admettre la ${fam} à la Commission`, desc: 'Un siège à la table : ta voix comptera dans tous les votes suivants. +5 respect.' };
    case 'presidence': return { kind, title: `Élire le Don de la ${fam} Capo dei Capi`, desc: 'La présidence : tu choisis les motions, ta voix tranche les égalités, et tu peux lever la dîme. +8 respect.' };
    case 'ban_player': return { kind, title: `Mettre la ${fam} au ban`, desc: `Si elle passe, toutes les familles se coalisent contre toi pendant ${COALITION_WEEKS} semaines : elles attaquent 60 % plus souvent et te visent en priorité.` };
    case 'ban_rival': return { kind, target, title: `Mettre ${t?.name ?? 'une famille'} au ban`, desc: `${t?.name ?? 'Elle'} perd 15 % de sa force, et pendant ${BAN_WEEKS} semaines les familles de ${cityName(t?.city)} la chassent en priorité.` };
    case 'treve': return { kind, title: 'Trêve générale', desc: `${TREVE_WEEKS} semaines sans assaut entre familles, dans toutes les villes. La famille qui la viole perd la face devant toute la Commission.` };
    case 'quais': return { kind, title: 'Ouvrir les quais de Port Halloran à tous', desc: `Pendant ${PORT_WEEKS} semaines, la contrebande coûte 20 % de moins à tout le monde. Les familles du port votent contre.` };
    case 'dime': return { kind, title: 'Lever la dîme de la Commission', desc: `Chaque famille verse ${fmt(DIME_PER_DISTRICT)} par quartier tenu au Capo dei Capi. Elles n’aiment pas ça (relation −6).` };
  }
}

export function motionValid(s: GameState, m: Motion, c = commission(s)): boolean {
  const tier = tierOf(s.respect);
  switch (m.kind) {
    case 'admission': return !c.seat && tier >= SEAT_TIER;
    case 'presidence': return c.seat && !c.chair && tier >= CHAIR_TIER;
    case 'ban_player': return owned(s).length >= COALITION_AT && !inCoalition(s);
    case 'ban_rival': return !!s.rivals.find((r) => r.id === m.target && r.alive) && living(s).length >= 3;
    case 'dime': return c.chair;
    default: return true;
  }
}

/** Motions que le Capo dei Capi peut inscrire à l'ordre du jour */
export function proposable(s: GameState): Motion[] {
  const c = commission(s);
  const list: Motion[] = [makeMotion(s, 'treve'), makeMotion(s, 'quais'), makeMotion(s, 'dime')];
  for (const r of living(s)) list.push(makeMotion(s, 'ban_rival', r.id));
  return list.filter((m) => motionValid(s, m, c));
}

function drawMotion(s: GameState, c: Commission): Motion {
  const strongest = [...living(s)].sort((a, b) => b.strength - a.strength)[0];
  const pool: [Motion, number][] = [
    [makeMotion(s, 'admission'), 6],
    [makeMotion(s, 'presidence'), 6],
    [makeMotion(s, 'ban_player'), 5],
    [makeMotion(s, 'treve'), 2],
    [makeMotion(s, 'quais'), 1.5],
  ];
  if (strongest) pool.push([makeMotion(s, 'ban_rival', strongest.id), 2]);
  const ok_ = pool.filter(([m]) => motionValid(s, m, c));
  const total = ok_.reduce((t, [, w]) => t + w, 0);
  let x = Math.random() * total;
  for (const [m, w] of ok_) if ((x -= w) <= 0) return m;
  return makeMotion(s, 'treve');
}

/** Ce que le joueur a intérêt à voter */
export function playerInterest(s: GameState, m: Motion): Vote {
  if (m.kind === 'ban_player') return 'contre';
  if (m.kind === 'ban_rival') return s.rivals.find((r) => r.id === m.target)?.alliance ? 'contre' : 'pour';
  if (m.kind === 'treve') return inCoalition(s) ? 'pour' : 'contre';
  return 'pour';
}

// ---------- Votes des Dons ----------
/** Penchant d'un Don pour la motion (positif = pour) */
export function lean(s: GameState, r: RivalFamily, m: Motion): number {
  const rel = r.relation;
  const ally = r.alliance ? 1 : 0;
  const war = r.war ? 1 : 0;
  const avg = avgStrength(s);
  switch (m.kind) {
    case 'admission': return 0.8 * rel + 10 + ally * 40 - war * 80 + (donHas(r, 'diplomate') ? 10 : 0);
    case 'presidence': return 0.7 * rel - 15 + (s.respect - 100) / 2 + ally * 40 - war * 80;
    case 'ban_player': return -0.8 * rel + (owned(s).length - 4) * 6 - ally * 70 + war * 40 + (donHas(r, 'revanchard') ? 20 : 0) + (commission(s).breach ? 30 : 0);
    case 'ban_rival': {
      if (r.id === m.target) return -100;
      const t = s.rivals.find((x) => x.id === m.target);
      return t ? (t.strength - avg) * 2 - 5 + (donHas(r, 'sanguinaire') ? 10 : 0) + (rivalCity(t) === rivalCity(r) ? 10 : 0) : 0;
    }
    case 'treve': return (avg - r.strength) * 2 + war * 25 - (donHas(r, 'sanguinaire') ? 25 : 0) - (inCoalition(s) ? 20 : 0) + 0.2 * rel;
    case 'quais': return rivalCity(r) === 'halloran' ? -70 : 12 + 0.3 * rel - (donHas(r, 'riche') ? 15 : 0);
    case 'dime': return -30 + 0.5 * rel + (s.respect - 100) / 2 - (donHas(r, 'riche') ? 10 : 0);
  }
}

export type Stance = 'pour' | 'contre' | 'indécis';
export function stance(s: GameState, r: RivalFamily): Stance {
  const m = commission(s).motion;
  if (!m) return 'indécis';
  const l = lean(s, r, m);
  return l >= 15 ? 'pour' : l <= -15 ? 'contre' : 'indécis';
}
/** Probabilité qu'un indécis vote pour */
export const undecidedPour = (s: GameState, r: RivalFamily) => clamp(0.5 + lean(s, r, commission(s).motion!) / 40, 0.1, 0.9);

/** Chance qu'un Don tienne sa parole */
export function reliability(s: GameState, r: RivalFamily) {
  const c = commission(s);
  let p = c.pacts.includes(r.id) ? 0.95 : 0.85;
  if (donHas(r, 'rancunier')) p -= 0.1;
  if (donHas(r, 'sanguinaire')) p -= 0.05;
  if (r.relation < -30) p -= 0.25;
  if (r.alliance) p += 0.05;
  return clamp(p, 0.3, 0.98);
}

export const voteCost = (r: RivalFamily) => Math.round((600 + r.strength * 60) / 50) * 50;

function guard(s: GameState, rid: string) {
  const c = commission(s);
  const r = s.rivals.find((x) => x.id === rid && x.alive);
  if (!c.motion) return { err: 'Aucune motion à l’ordre du jour.' } as const;
  if (!r) return { err: 'Cette famille a disparu.' } as const;
  if (r.war) return { err: `On ne négocie pas avec une famille en guerre.` } as const;
  if (m_target(c.motion) === r.id) return { err: `${r.boss} ne votera jamais sa propre mise au ban.` } as const;
  if (c.bought[r.id]) return { err: `${r.boss} t’a déjà promis sa voix.` } as const;
  return { c, r } as const;
}
const m_target = (m: Motion) => m.target;

export function buyVote(s: GameState, rid: string, side: Vote): Result {
  const g = guard(s, rid);
  if ('err' in g) return fail(g.err!);
  const { c, r } = g;
  const cost = voteCost(r);
  if (s.dirty < cost) return fail(`Il faut ${fmt(cost)} sales pour acheter la voix de ${r.boss}.`);
  s.dirty -= cost;
  r.money += cost;
  c.bought[r.id] = side;
  log(s, 'money', `${r.boss} empoche ${fmt(cost)} et promet de voter ${side} « ${c.motion!.title} ».`);
  return ok;
}

export function makePact(s: GameState, rid: string, side: Vote): Result {
  const g = guard(s, rid);
  if ('err' in g) return fail(g.err!);
  const { c, r } = g;
  if (r.relation < PACT_MIN_RELATION && !r.alliance) return fail(`Il faut une relation d’au moins ${PACT_MIN_RELATION} pour sceller un pacte avec ${r.boss}.`);
  c.bought[r.id] = side;
  c.pacts.push(r.id);
  r.truceWeeks = Math.max(r.truceWeeks, PACT_WEEKS);
  log(s, 'good', `Pacte avec ${r.boss} : sa voix ${side} la motion contre ${PACT_WEEKS} semaines de paix entre vos familles.`);
  return ok;
}

export function setVote(s: GameState, v: Vote | null): Result {
  const c = commission(s);
  if (!c.seat) return fail('Tu n’as pas encore de siège à la Commission.');
  c.vote = v;
  return ok;
}

export function propose(s: GameState, index: number): Result {
  const c = commission(s);
  if (!c.chair) return fail('Seul le Capo dei Capi fixe l’ordre du jour.');
  const m = proposable(s)[index];
  if (!m) return fail('Motion impossible.');
  if (c.motion?.kind === m.kind && c.motion?.target === m.target) return ok;
  c.motion = m;
  c.bought = {};
  c.pacts = [];
  c.vote = playerInterest(s, m);
  log(s, 'neutral', `Le Capo dei Capi inscrit à l’ordre du jour : « ${m.title} ».`);
  return ok;
}

/** Décompte prévisible : voix sûres pour/contre, et indécis */
export function tallyForecast(s: GameState) {
  const c = commission(s);
  let pour = 0, contre = 0, undecided = 0;
  for (const r of living(s)) {
    const promised = c.bought[r.id];
    const st = promised ?? stance(s, r);
    if (st === 'pour') pour++;
    else if (st === 'contre') contre++;
    else undecided++;
  }
  if (c.seat && c.vote === 'pour') pour++;
  if (c.seat && c.vote === 'contre') contre++;
  return { pour, contre, undecided };
}

// ---------- La réunion ----------
export function commissionTick(s: GameState) {
  const c = commission(s);
  if (c.truceWeeks > 0) c.truceWeeks--;
  if (c.portWeeks > 0) c.portWeeks--;
  for (const r of s.rivals) if ((r.bannedWeeks ?? 0) > 0) r.bannedWeeks!--;
  if (s.week < c.next) return;
  meeting(s, c);
  c.next = s.week + MEETING_EVERY;
  c.bought = {};
  c.pacts = [];
  c.motion = drawMotion(s, c);
  c.vote = c.seat ? playerInterest(s, c.motion) : null;
}

function meeting(s: GameState, c: Commission) {
  const m = c.motion;
  if (!m || !motionValid(s, m, c)) {
    if (m) log(s, 'neutral', `Commission : la motion « ${m.title} » est retirée de l’ordre du jour.`);
    return;
  }
  let pour = 0, contre = 0;
  const betrayed: string[] = [];
  for (const r of living(s)) {
    let v: Vote;
    const promised = c.bought[r.id];
    if (promised) {
      if (chance(reliability(s, r))) v = promised;
      else {
        v = promised === 'pour' ? 'contre' : 'pour';
        betrayed.push(r.boss);
        r.relation = clamp(r.relation - 10, -100, 100);
      }
    } else {
      const st = stance(s, r);
      v = st === 'indécis' ? (chance(undecidedPour(s, r)) ? 'pour' : 'contre') : st;
    }
    if (v === 'pour') pour++; else contre++;
  }
  if (c.seat && c.vote) c.vote === 'pour' ? pour++ : contre++;
  const passed = pour > contre || (pour === contre && c.chair && c.vote === 'pour');
  c.history.unshift({ week: s.week, title: m.title, passed, pour, contre, betrayed: betrayed.length ? betrayed : undefined });
  if (c.history.length > 12) c.history.length = 12;
  if (betrayed.length) log(s, 'bad', `Trahison à la Commission : ${betrayed.join(', ')} n’${betrayed.length > 1 ? 'ont' : 'a'} pas tenu parole.`);
  log(s, passed ? 'good' : 'neutral', `Commission des Dons : « ${m.title} » ${passed ? 'adoptée' : 'rejetée'} (${pour} pour, ${contre} contre).`);
  if (c.seat) s.respect = clamp(s.respect + 1, 0, 150);
  if (passed) applyMotion(s, c, m);
  else if (m.kind === 'ban_player') news(s, 4, 'La Commission épargne la famille montante', `Par ${contre} voix contre ${pour}, les Dons refusent de s’unir contre la ${s.familyName}.`);
  c.breach = false;
}

function applyMotion(s: GameState, c: Commission, m: Motion) {
  switch (m.kind) {
    case 'admission':
      c.seat = true;
      s.respect = clamp(s.respect + 5, 0, 150);
      news(s, 5, 'Un nouveau siège à la Commission', `La ${s.familyName} siège désormais parmi les grandes familles du pays.`);
      break;
    case 'presidence':
      c.chair = true;
      s.respect = clamp(s.respect + 8, 0, 150);
      news(s, 5, 'Un nouveau Capo dei Capi', `Les Dons ont baisé la bague du chef de la ${s.familyName}. Il fixe désormais les règles.`);
      break;
    case 'ban_player':
      s.coalitionWeeks = COALITION_WEEKS;
      living(s).filter((r) => !r.alliance).forEach((r) => (r.relation = clamp(r.relation - 10, -100, 100)));
      log(s, 'bad', `Tu es mis au ban : pendant ${COALITION_WEEKS} semaines, toutes les familles te visent.`);
      news(s, 5, 'La Commission se ligue contre une famille', `Les Dons auraient conclu un pacte : arrêter l’ascension de la ${s.familyName}.`);
      break;
    case 'ban_rival': {
      const t = s.rivals.find((r) => r.id === m.target);
      if (!t) break;
      t.bannedWeeks = BAN_WEEKS;
      t.strength = Math.max(3, Math.round(t.strength * 0.85));
      t.truceWeeks = 0;
      news(s, 4, `${t.name} mise au ban`, `${t.boss} n’a plus d’amis. Ses voisins de ${cityName(t.city)} affûtent leurs couteaux.`);
      break;
    }
    case 'treve':
      c.truceWeeks = TREVE_WEEKS;
      news(s, 3, 'La paix des familles', `Pendant ${TREVE_WEEKS} semaines, plus une balle ne doit être tirée. Les croque-morts s’inquiètent.`);
      break;
    case 'quais':
      c.portWeeks = PORT_WEEKS;
      news(s, 3, 'Port Halloran ouvert à tous', 'Les familles du port ont été mises en minorité. Le rhum coule à flots.');
      break;
    case 'dime': {
      let total = 0;
      for (const r of living(s)) {
        const n = s.districts.filter((d) => d.owner === r.id).length;
        const due = Math.min(r.money, n * DIME_PER_DISTRICT);
        r.money -= due;
        total += due;
        r.relation = clamp(r.relation - 6, -100, 100);
      }
      s.dirty += total;
      log(s, 'money', `La dîme de la Commission rapporte ${fmt(total)} au Capo dei Capi.`);
      break;
    }
  }
}

/** Le joueur attaque pendant une trêve de la Commission : il perd la face */
export function breachTruce(s: GameState) {
  const c = commission(s);
  if (c.truceWeeks <= 0 || c.breach) return;
  c.breach = true;
  s.respect = clamp(s.respect - 5, 0, 150);
  living(s).forEach((r) => (r.relation = clamp(r.relation - 15, -100, 100)));
  log(s, 'bad', 'Tu as violé la trêve de la Commission : −5 respect, toutes les familles −15 de relation.');
  news(s, 4, 'La trêve est rompue', `La ${s.familyName} a tiré la première. Les Dons s’en souviendront à la prochaine réunion.`);
}

export const truceActive = (s: GameState) => (s.commission?.truceWeeks ?? 0) > 0;
