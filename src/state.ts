import {
  BASE_STORAGE, BUSINESSES, DISTILLERY_GIN, DISTRICT_SEEDS, FIRST_NAMES, GOOD_ORDER, GOODS, LAST_NAMES, NICKNAMES,
  RIVAL_SEEDS, SHOP_NAMES, SHOP_TRADES, SPEAKEASY_DEMAND, TARIFFS, TRIPOT_WHISKY,
} from './data';
import type { District, GameState, Good, Member, Owner, Recruit, LogTone, Shop } from './types';

export const SAVE_KEY = 'omerta-save-v2';
export const SAVE_VERSION = 2;

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

export function makeShop(s: GameState, used: Set<string>): Shop {
  let owner = '';
  for (let i = 0; i < 20 && (!owner || used.has(owner)); i++) owner = `${pick(FIRST_NAMES)} ${pick(SHOP_NAMES)}`;
  used.add(owner);
  return { id: nextId(s), owner, trade: pick(SHOP_TRADES), satisfaction: randInt(45, 65) };
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
    dirty: 3000,
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
    stats: { battlesWon: 0, battlesLost: 0, laundered: 0, raids: 0, jobsDone: 0, cratesSold: 0 },
    stock: { biere: 20, gin: 20, whisky: 5 },
    market: { biere: 1, gin: 1, whisky: 1 },
    marketTrend: { biere: 0, gin: 0, whisky: 0 },
    shipments: [],
    jobs: [],
    favors: 0,
    loans: [],
    safeRouteWeeks: 0,
    headlines: [],
    news: [],
  };
  const usedNames = new Set<string>();
  s.districts = DISTRICT_SEEDS.map((d) => ({
    ...d,
    bribedCop: false,
    tariff: 'normal' as const,
    shops: [],
    businesses: d.businesses.map((kind) => ({ id: nextId(s), kind })),
  }));
  s.districts.forEach((d) => (d.shops = [makeShop(s, usedNames), makeShop(s, usedNames)]));
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
/** Paie en argent sale d'abord, puis en propre. Retourne false si les deux ne suffisent pas. */
export function payAny(s: GameState, amount: number): boolean {
  if (s.dirty + s.clean < amount) return false;
  const d = Math.min(s.dirty, amount);
  s.dirty -= d;
  s.clean -= amount - d;
  return true;
}

export function fx(s: GameState, kind: import('./types').FxKind, d?: string) {
  (s.fx ??= []).push({ kind, d });
}

export function news(s: GameState, prio: number, title: string, sub = '') {
  s.news.push({ prio, title, sub });
}

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
  return s.orders.some((o) => o.memberIds.includes(memberId)) || s.jobs.some((j) => j.team.includes(memberId));
}
export const onJob = (s: GameState, memberId: number) => s.jobs.find((j) => j.team.includes(memberId));
export const onAttack = (s: GameState, memberId: number) => s.orders.find((o) => o.memberIds.includes(memberId));

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

export function storageCap(s: GameState) {
  return BASE_STORAGE + owned(s).reduce((t, d) => t + d.businesses.reduce((u, b) => u + (BUSINESSES[b.kind].storage ?? 0), 0), 0);
}
export const stockTotal = (s: GameState) => GOOD_ORDER.reduce((t, g) => t + s.stock[g], 0);
export const pendingCrates = (s: GameState) => s.shipments.reduce((t, x) => t + x.qty, 0);

export function capoBonus(s: GameState, d: District) {
  return membersIn(s, d.id).some((m) => m.rank === 'capo') ? 1.2 : 1;
}

export function satisfaction(d: District) {
  return d.shops.length ? Math.round(d.shops.reduce((t, x) => t + x.satisfaction, 0) / d.shops.length) : 50;
}

/** Revenu de protection d'un quartier : tarif × humeur des commerçants */
export function racketOf(d: District) {
  const sat = satisfaction(d);
  const mood = sat < 30 ? 0.6 : 1;
  return Math.round(d.racket * TARIFFS[d.tariff].mult * mood);
}

export const retailPrice = (d: District, g: Good) => Math.round(GOODS[g].retail * d.wealth);

export interface OutletSale { districtId: string; kind: 'speakeasy' | 'tripot'; sold: Partial<Record<Good, number>>; revenue: number; demand: number }
export interface SalesPlan {
  produced: number; // gin des distilleries (après plafond de stockage)
  sold: Record<Good, number>;
  revenue: number; // avant bonus capo / pacification
  outlets: OutletSale[];
  shortage: number; // caisses demandées mais introuvables
  stockAfter: Record<Good, number>;
}

/** Production et ventes d'alcool de la semaine, déterministes (utilisées par les prévisions et le moteur) */
export function salesPlan(s: GameState): SalesPlan {
  const stock = { ...s.stock };
  let produced = 0;
  if (!s.lowProfile) {
    for (const d of owned(s)) {
      for (const b of d.businesses) if (b.kind === 'distillerie') produced += DISTILLERY_GIN * (d.id === 'docks' ? 2 : 1);
    }
  }
  const room = Math.max(0, storageCap(s) - GOOD_ORDER.reduce((t, g) => t + stock[g], 0));
  produced = Math.min(produced, room);
  stock.gin += produced;

  const sold: Record<Good, number> = { biere: 0, gin: 0, whisky: 0 };
  const outlets: OutletSale[] = [];
  let revenue = 0;
  let shortage = 0;
  if (!s.lowProfile) {
    for (const d of owned(s)) {
      for (const b of d.businesses) {
        if (b.kind !== 'speakeasy' && b.kind !== 'tripot') continue;
        const demand = b.kind === 'speakeasy' ? SPEAKEASY_DEMAND : TRIPOT_WHISKY;
        const goods: Good[] = b.kind === 'speakeasy' ? GOOD_ORDER : ['whisky'];
        const o: OutletSale = { districtId: d.id, kind: b.kind, sold: {}, revenue: 0, demand };
        let left = demand;
        for (const g of goods) {
          const q = Math.min(left, stock[g]);
          if (!q) continue;
          stock[g] -= q;
          sold[g] += q;
          left -= q;
          o.sold[g] = q;
          o.revenue += q * retailPrice(d, g);
        }
        if (b.kind === 'speakeasy') shortage += left;
        revenue += o.revenue;
        outlets.push(o);
      }
    }
  }
  return { produced, sold, revenue, outlets, shortage, stockAfter: stock };
}

/** Projection de la semaine (utilisée par l'UI et par le moteur) */
export function projection(s: GameState) {
  let dirtyIn = 0;
  let cleanIn = 0;
  let launderCap = 0;
  let heatGain = 0;
  let racket = 0;
  let fixed = 0;
  let booze = 0;
  const plan = salesPlan(s);
  for (const d of owned(s)) {
    const mult = capoBonus(s, d) * ((d.unrest ?? 0) > 0 ? 0.5 : 1);
    const r = s.lowProfile ? 0 : racketOf(d);
    let f = 0;
    for (const b of d.businesses) {
      const def = BUSINESSES[b.kind];
      if (def.illegal) {
        if (!s.lowProfile) f += def.income;
        heatGain += s.lowProfile ? 0 : def.heat * (d.bribedCop ? 0.5 : 1);
      } else {
        cleanIn += def.income;
        launderCap += def.launder;
        heatGain += def.heat;
      }
    }
    const sales = plan.outlets.filter((o) => o.districtId === d.id).reduce((t, o) => t + o.revenue, 0);
    racket += Math.round(r * mult);
    fixed += Math.round(f * mult);
    booze += Math.round(sales * mult);
  }
  dirtyIn = racket + fixed + booze;
  if (s.councilman) launderCap = Math.round(launderCap * 1.25);
  const salaries = activeMembers(s).reduce((t, m) => t + m.salary, 0) + s.members.filter((m) => m.status !== 'actif').reduce((t, m) => t + Math.round(m.salary / 2), 0);
  const bribes =
    owned(s).filter((d) => d.bribedCop).length * 300 + (s.judge ? 800 : 0) + (s.councilman ? 1200 : 0);
  return { dirtyIn, racket, fixed, booze, cleanIn, launderCap, heatGain: Math.round(heatGain), salaries, bribes, plan };
}
