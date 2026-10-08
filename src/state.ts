import { BUSINESSES, DISTRICT_SEEDS, FIRST_NAMES, LAST_NAMES, NICKNAMES, RIVAL_SEEDS } from './data';
import type { District, GameState, Member, Owner, Recruit, LogTone } from './types';

export const SAVE_KEY = 'omerta-save-v1';
export const SAVE_VERSION = 1;

// ---------- RNG ----------
export const rand = () => Math.random();
export const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number) => Math.random() < p;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ---------- Création ----------
export function nextId(s: GameState): number {
  return s.nextId++;
}

function randomIdentity(s: GameState) {
  const used = new Set(s.members.map((m) => m.nickname).concat(s.recruits.map((r) => r.nickname)));
  const free = NICKNAMES.filter((n) => !used.has(n));
  return {
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    nickname: free.length ? pick(free) : pick(NICKNAMES),
  };
}

export function makeRecruit(s: GameState): Recruit {
  const force = randInt(2, 8);
  const discretion = randInt(2, 8);
  const quality = force + discretion;
  return {
    id: nextId(s),
    ...randomIdentity(s),
    force,
    discretion,
    loyalty: randInt(40, 70),
    salary: 120 + quality * 18 + randInt(0, 40),
    cost: 300 + quality * 50,
  };
}

function makeMember(s: GameState, partial: Partial<Member>): Member {
  return {
    id: nextId(s),
    ...randomIdentity(s),
    rank: 'soldat',
    force: 5,
    discretion: 5,
    loyalty: 65,
    salary: 220,
    assignment: null,
    status: 'actif',
    statusWeeks: 0,
    weeksServed: 0,
    ...partial,
  };
}

export function newGame(familyName = 'Famille Moretti'): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    familyName,
    week: 1,
    dirty: 2500,
    clean: 2000,
    respect: 10,
    heat: 10,
    districts: [],
    members: [],
    recruits: [],
    rivals: RIVAL_SEEDS.map((r) => ({ ...r })),
    orders: [],
    judge: false,
    councilman: false,
    lowProfile: false,
    pendingEvent: null,
    log: [],
    lastReport: [],
    nextId: 1,
    status: 'playing',
    endReason: '',
    stats: { battlesWon: 0, battlesLost: 0, laundered: 0, raids: 0 },
  };
  s.districts = DISTRICT_SEEDS.map((d) => ({
    ...d,
    bribedCop: false,
    businesses: d.businesses.map((kind) => ({ id: nextId(s), kind })),
  }));
  s.members.push(
    makeMember(s, { name: 'Salvatore Greco', nickname: 'le Vieux', rank: 'capo', force: 6, discretion: 7, loyalty: 80, salary: 450, assignment: 'sicily' }),
    makeMember(s, { force: 6, discretion: 4, loyalty: 70, salary: 230, assignment: 'sicily' }),
    makeMember(s, { force: 5, discretion: 5, loyalty: 60, salary: 220 }),
    makeMember(s, { force: 4, discretion: 6, loyalty: 65, salary: 210 }),
  );
  s.recruits = [makeRecruit(s), makeRecruit(s), makeRecruit(s)];
  log(s, 'neutral', `${familyName} : ton oncle est tombé pour fraude fiscale. Little Sicily est à toi. Fais-en un empire.`);
  return s;
}

// ---------- Sauvegarde ----------
export function save(s: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : on joue sans sauvegarde */
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* rien */
  }
}

// ---------- Helpers ----------
export function log(s: GameState, tone: LogTone, text: string) {
  s.log.unshift({ week: s.week, tone, text });
  if (s.log.length > 200) s.log.length = 200;
}

export const district = (s: GameState, id: string) => s.districts.find((d) => d.id === id)!;
export const owned = (s: GameState, owner: Owner = 'player') => s.districts.filter((d) => d.owner === owner);
export const rival = (s: GameState, id: string) => s.rivals.find((r) => r.id === id);

export function neighbors(s: GameState, d: District): District[] {
  return s.districts.filter((o) => Math.abs(o.row - d.row) + Math.abs(o.col - d.col) === 1);
}

export function isAttackable(s: GameState, d: District): boolean {
  return d.owner !== 'player' && neighbors(s, d).some((n) => n.owner === 'player');
}

export const activeMembers = (s: GameState) => s.members.filter((m) => m.status === 'actif');

export function membersIn(s: GameState, districtId: string) {
  return s.members.filter((m) => m.status === 'actif' && m.assignment === districtId);
}

export function committedToAttack(s: GameState, memberId: number) {
  return s.orders.some((o) => o.memberIds.includes(memberId));
}

/** Défense d'un quartier (pour le joueur : hommes postés, hors ceux engagés en attaque) */
export function defenseOf(s: GameState, d: District): number {
  const garageBonus = d.businesses.filter((b) => b.kind === 'garage').length * 5;
  if (d.owner === 'player') {
    const men = membersIn(s, d.id).filter((m) => !committedToAttack(s, m.id));
    return 4 + (d.id === 'sicily' ? 6 : 0) + garageBonus + men.reduce((t, m) => t + m.force + (m.rank === 'capo' ? 2 : 0), 0);
  }
  if (d.owner === 'neutral') return d.garrison + garageBonus;
  const r = rival(s, d.owner)!;
  const count = Math.max(1, owned(s, d.owner).length);
  return Math.round(4 + r.strength / Math.sqrt(count)) + garageBonus;
}

export function attackPower(s: GameState, memberIds: number[]): number {
  const men = s.members.filter((m) => memberIds.includes(m.id));
  const base = men.reduce((t, m) => t + m.force + (m.rank === 'capo' ? 2 : 0), 0);
  return Math.round(base + s.respect / 20);
}

/** Aléa des combats : chaque camp tire un multiplicateur uniforme dans [0,75 ; 1,25] */
export const ROLL_MIN = 0.75;
export const ROLL_SPAN = 0.5;
export const roll = () => ROLL_MIN + Math.random() * ROLL_SPAN;

/** Probabilité exacte que power × U > def × V (U, V uniformes et indépendants) */
export function winChance(power: number, def: number): number {
  if (power <= 0) return 0;
  if (def <= 0) return 1;
  const k = power / def;
  const steps = 2000;
  let acc = 0;
  for (let i = 0; i < steps; i++) {
    const u = ROLL_MIN + ((i + 0.5) / steps) * ROLL_SPAN;
    acc += clamp((k * u - ROLL_MIN) / ROLL_SPAN, 0, 1);
  }
  return acc / steps;
}

export function hasDistillery(s: GameState) {
  return owned(s).some((d) => d.businesses.some((b) => b.kind === 'distillerie'));
}

export function businessIncome(s: GameState, d: District, kind: string): number {
  const def = BUSINESSES[kind as keyof typeof BUSINESSES];
  let inc = def.income;
  if (kind === 'speakeasy' && hasDistillery(s)) inc *= 1.4;
  if (kind === 'distillerie' && d.id === 'docks') inc *= 2;
  return Math.round(inc);
}

export function capoBonus(s: GameState, d: District) {
  return membersIn(s, d.id).some((m) => m.rank === 'capo') ? 1.2 : 1;
}

/** Projection de la semaine (utilisée par l'UI et par le moteur) */
export function projection(s: GameState) {
  let dirtyIn = 0;
  let cleanIn = 0;
  let launderCap = 0;
  let heatGain = 0;
  for (const d of owned(s)) {
    const mult = capoBonus(s, d) * ((d.unrest ?? 0) > 0 ? 0.5 : 1);
    let districtDirty = s.lowProfile ? 0 : d.racket;
    for (const b of d.businesses) {
      const def = BUSINESSES[b.kind];
      if (def.illegal) {
        if (!s.lowProfile) districtDirty += businessIncome(s, d, b.kind);
        heatGain += s.lowProfile ? 0 : def.heat * (d.bribedCop ? 0.5 : 1);
      } else {
        cleanIn += def.income;
        launderCap += def.launder;
        heatGain += def.heat;
      }
    }
    dirtyIn += Math.round(districtDirty * mult);
  }
  if (s.councilman) launderCap = Math.round(launderCap * 1.25);
  const salaries = activeMembers(s).reduce((t, m) => t + m.salary, 0) + s.members.filter((m) => m.status !== 'actif').reduce((t, m) => t + Math.round(m.salary / 2), 0);
  const bribes =
    owned(s).filter((d) => d.bribedCop).length * 300 + (s.judge ? 800 : 0) + (s.councilman ? 1200 : 0);
  return { dirtyIn, cleanIn, launderCap, heatGain: Math.round(heatGain), salaries, bribes };
}
