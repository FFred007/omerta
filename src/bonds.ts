// Liens entre les hommes : frères d'armes forgés au feu, rivalités nées d'une promotion ou d'une bagarre.
import { chance, clamp, log, pick } from './state';
import type { Bond, BondKind, GameState, Member, PendingEvent } from './types';

export const FRERES_AT = 3; // opérations partagées pour devenir frères d'armes
export const FRERES_BONUS = 1; // par paire de frères dans une même équipe (max 3)
export const RIVAUX_MALUS = 2; // par paire de rivaux dans une même équipe

export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const bondOf = (s: GameState, a: number, b: number) => (s.bonds ?? []).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
export const bondsOf = (s: GameState, id: number) => (s.bonds ?? []).filter((x) => x.a === id || x.b === id);
export const other = (b: Bond, id: number) => (b.a === id ? b.b : b.a);
export const brothersOf = (s: GameState, id: number) => bondsOf(s, id).filter((b) => b.kind === 'freres').map((b) => other(b, id));

function pairs(ids: number[]) {
  const out: [number, number][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
}

/** Bonus (ou malus) des liens dans une équipe */
export function teamBondBonus(s: GameState, ids: number[]) {
  let fr = 0;
  let ri = 0;
  for (const [a, b] of pairs(ids)) {
    const bd = bondOf(s, a, b);
    if (bd?.kind === 'freres') fr++;
    else if (bd?.kind === 'rivaux') ri++;
  }
  return Math.min(3, fr) * FRERES_BONUS - ri * RIVAUX_MALUS;
}

export function addBond(s: GameState, a: number, b: number, kind: BondKind) {
  if (a === b) return;
  const cur = bondOf(s, a, b);
  if (cur) { cur.kind = kind; cur.since = s.week; return; }
  (s.bonds ??= []).push({ a, b, kind, since: s.week });
}

export function removeBond(s: GameState, a: number, b: number) {
  s.bonds = (s.bonds ?? []).filter((x) => !((x.a === a && x.b === b) || (x.a === b && x.b === a)));
}

/** Après une opération commune (assaut ou coup), les survivants se rapprochent */
export function shareOp(s: GameState, ids: number[]) {
  const alive = ids.filter((id) => s.members.some((m) => m.id === id));
  for (const [a, b] of pairs(alive)) {
    if (bondOf(s, a, b)) continue;
    const k = pairKey(a, b);
    s.bondPts ??= {};
    s.bondPts[k] = (s.bondPts[k] ?? 0) + 1;
    if (s.bondPts[k] >= FRERES_AT) {
      delete s.bondPts[k];
      addBond(s, a, b, 'freres');
      const ma = s.members.find((m) => m.id === a)!;
      const mb = s.members.find((m) => m.id === b)!;
      ma.loyalty = clamp(ma.loyalty + 3, 0, 100);
      mb.loyalty = clamp(mb.loyalty + 3, 0, 100);
      log(s, 'good', `${ma.nickname} et ${mb.nickname} sont devenus frères d'armes : ensemble, ils se battent mieux.`);
    }
  }
}

/** Une promotion fait des jaloux */
export function onPromote(s: GameState, m: Member) {
  const jealous = s.members.filter((x) => x.id !== m.id && !x.isDon && !x.isChild && x.rank === 'soldat' && (x.level ?? 0) >= (m.level ?? 0) && x.loyalty < 75 && !bondOf(s, x.id, m.id));
  if (!jealous.length || !chance(0.45)) return;
  const x = pick(jealous);
  addBond(s, x.id, m.id, 'rivaux');
  log(s, 'bad', `${x.nickname} ne digère pas la promotion de ${m.nickname} : les deux hommes sont désormais rivaux.`);
}

/** À la mort d'un homme : ses frères d'armes le pleurent (et attendent la vengeance) */
export function onDeath(s: GameState, m: Member): number[] {
  const brothers = brothersOf(s, m.id);
  for (const id of brothers) {
    const b = s.members.find((x) => x.id === id);
    if (b) b.loyalty = clamp(b.loyalty - 5, 0, 100);
  }
  s.bonds = (s.bonds ?? []).filter((x) => x.a !== m.id && x.b !== m.id);
  if (s.bondPts) for (const k of Object.keys(s.bondPts)) if (k.split('-').map(Number).includes(m.id)) delete s.bondPts[k];
  return brothers;
}

/** Chaque semaine : les rivaux se minent ; parfois une bagarre éclate */
export function bondsTick(s: GameState) {
  const live = new Set(s.members.map((m) => m.id));
  s.bonds = (s.bonds ?? []).filter((b) => live.has(b.a) && live.has(b.b));
  const rivals = s.bonds.filter((b) => b.kind === 'rivaux');
  for (const b of rivals) {
    const ma = s.members.find((m) => m.id === b.a)!;
    const mb = s.members.find((m) => m.id === b.b)!;
    if (ma.assignment && ma.assignment === mb.assignment) {
      ma.loyalty = clamp(ma.loyalty - 1, 0, 100);
      mb.loyalty = clamp(mb.loyalty - 1, 0, 100);
    }
  }
  // une bagarre entre deux têtes brûlées peut créer une rivalité
  if (!s.pendingEvent && s.status === 'playing' && s.members.length >= 4 && chance(0.04)) {
    const pool = s.members.filter((m) => !m.isDon && !m.isChild && m.status === 'actif');
    const a = pick(pool);
    const b = pick(pool.filter((x) => x.id !== a.id && bondOf(s, a.id, x.id)?.kind !== 'freres'));
    if (a && b) s.pendingEvent = brawlEvent(s, a, b);
  }
}

function brawlEvent(s: GameState, a: Member, b: Member): PendingEvent {
  const rivals = bondOf(s, a.id, b.id)?.kind === 'rivaux';
  return {
    key: 'bagarre', title: 'Bagarre au comptoir',
    text: `${a.name} « ${a.nickname} » et ${b.name} « ${b.nickname} » en sont venus aux poings au speakeasy${rivals ? ', encore une fois' : ''}. Toute la famille attend de voir à qui le Don donne raison.`,
    data: { a: a.id, b: b.id },
    choices: [
      { label: `Donner raison à ${a.nickname}`, hint: `${a.nickname} +6 loyauté, ${b.nickname} −10 · ils deviennent rivaux`, effect: 'bd_a' },
      { label: `Donner raison à ${b.nickname}`, hint: `${b.nickname} +6 loyauté, ${a.nickname} −10 · ils deviennent rivaux`, effect: 'bd_b' },
      { label: 'Les réconcilier autour d’une table', hint: `−400 sale · 60 % qu’ils oublient${rivals ? ' leur rivalité' : ''}`, effect: 'bd_peace', disabled: s.dirty < 400 },
    ],
  };
}

export function resolveBondEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('bd_')) return false;
  const a = s.members.find((m) => m.id === Number(ev.data?.a));
  const b = s.members.find((m) => m.id === Number(ev.data?.b));
  if (!a || !b) return true;
  if (effect === 'bd_a' || effect === 'bd_b') {
    const [win, lose] = effect === 'bd_a' ? [a, b] : [b, a];
    win.loyalty = clamp(win.loyalty + 6, 0, 100);
    lose.loyalty = clamp(lose.loyalty - 10, 0, 100);
    addBond(s, a.id, b.id, 'rivaux');
    log(s, 'neutral', `Le Don donne raison à ${win.nickname}. ${lose.nickname} ne l'oubliera pas.`);
  } else {
    s.dirty -= 400;
    if (chance(0.6)) {
      removeBond(s, a.id, b.id);
      log(s, 'good', `${a.nickname} et ${b.nickname} trinquent ensemble. L'affaire est close.`);
    } else {
      addBond(s, a.id, b.id, 'rivaux');
      log(s, 'bad', `Le dîner tourne court : ${a.nickname} et ${b.nickname} restent rivaux.`);
    }
  }
  return true;
}
