import {
  BASE_STORAGE, BUSINESSES, DISTRICT_SEEDS, FIRST_NAMES, GOOD_ORDER, GOODS, LAST_NAMES, NICKNAMES,
  RIVAL_SEEDS, SHOP_NAMES, SHOP_TRADES, TARIFFS, TRIPOT_WHISKY,
} from './data';
import { politicsHeat, senatorRetainer } from './endgame';
import type { District, GameState, Good, Member, Owner, Recruit, LogTone, Shop } from './types';
import { TRAITS, donHas, donStartTraits, familyCount, familyHas, gainXp, has, rankTitle, rollRecruitTraits } from './traits';
import type { JobStat } from './types';
import { DON_MORALE, donHasTalent, donXpForNext, flairBonus, makeDon } from './don';
import { spouseHas } from './family';
import { networkHeat, networkRetainers } from './network';
import { cityMult, cityOf } from './cities';
import { initCommission } from './commission';
import { teamBondBonus } from './bonds';
import { generateMap } from './mapgen';
import { bizHeat, bizIncome, bizLaunder, bizStorage, ginOf, owns, retailMult, speakDemand } from './buildings';

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
  const names = new Set(s.members.map((m) => m.name).concat(s.recruits.map((r) => r.name)));
  let name = '';
  for (let i = 0; i < 30 && (!name || names.has(name)); i++) name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  return {
    name,
    nickname: free.length ? pick(free) : pick(NICKNAMES),
  };
}

export function makeRecruit(s: GameState): Recruit {
  // parfois un ancien de Chicago ou de Detroit, déjà aguerri
  const level = Math.random() < 0.15 ? randInt(1, 3) : 0;
  const force = Math.min(12, randInt(2, 8) + Math.ceil(level / 2) + (owns(s, 'boxe') ? 1 : 0));
  const discretion = Math.min(12, randInt(2, 8) + Math.floor(level / 2));
  const quality = force + discretion;
  const traits = rollRecruitTraits();
  const good = traits.filter((x) => TRAITS[x].good).length;
  const bad = traits.length - good;
  return {
    id: nextId(s),
    ...randomIdentity(s),
    force,
    discretion,
    loyalty: randInt(40, 70),
    salary: 120 + quality * 18 + level * 25 + randInt(0, 40),
    cost: Math.max(200, 300 + quality * 50 + good * 180 - bad * 120 + level * 150),
    traits,
    level,
  };
}

export function makeShop(s: GameState, used: Set<string>): Shop {
  let owner = '';
  for (let i = 0; i < 20 && (!owner || used.has(owner)); i++) owner = `${pick(FIRST_NAMES)} ${pick(SHOP_NAMES)}`;
  used.add(owner);
  return { id: nextId(s), owner, trade: pick(SHOP_TRADES), satisfaction: randInt(45, 65) };
}

export function makeMember(s: GameState, partial: Partial<Member>): Member {
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
    xp: 0,
    level: 0,
    traits: [],
    ...partial,
  };
}

export function newGame(familyName = 'Famille Moretti', classic = false): GameState {
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
    rivals: RIVAL_SEEDS.map((r) => ({ ...r, traits: [...(r.traits ?? donStartTraits(r.id))], wins: 0, lossesToPlayer: 0 })),
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
  s.districts = seedDistricts(s, classic ? DISTRICT_SEEDS : generateMap());
  s.generatedMap = !classic;
  s.cities = { corrano: { open: true, governorId: null } };
  s.commission = initCommission(s);
  s.members.push(
    makeMember(s, { name: 'Salvatore Greco', nickname: 'le Vieux', rank: 'capo', force: 6, discretion: 7, loyalty: 80, salary: 450, assignment: 'sicily', level: 4, traits: ['fidele', 'negociateur'] }),
    makeMember(s, { force: 6, discretion: 4, loyalty: 70, salary: 230, assignment: 'sicily', level: 1, traits: ['brute'] }),
    makeMember(s, { force: 5, discretion: 5, loyalty: 60, salary: 220, traits: [] }),
    makeMember(s, { force: 4, discretion: 6, loyalty: 65, salary: 210, traits: ['chauffeur'] }),
  );
  s.members.unshift(makeDon(nextId(s), randInt(1, 1e9)));
  s.children = [];
  s.generation = 1;
  s.recruits = [makeRecruit(s), makeRecruit(s), makeRecruit(s), makeRecruit(s)];
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
    if (s.version !== SAVE_VERSION) return null;
    migrate(s);
    return s;
  } catch {
    return null;
  }
}

function seedDistricts(s: GameState, seeds: typeof DISTRICT_SEEDS): District[] {
  const used = new Set(s.districts.flatMap((d) => d.shops.map((x) => x.owner)));
  return seeds.map((d) => ({
    ...d,
    bribedCop: false,
    tariff: 'normal' as const,
    shops: [makeShop(s, used), makeShop(s, used)],
    businesses: d.businesses.map((kind) => ({ id: nextId(s), kind })),
  }));
}

/** Anciennes sauvegardes : on ajoute le Don, la famille, les villes et la Commission sans casser la partie */
export function migrate(s: GameState) {
  // une ville entièrement absente (sauvegarde ancienne) reçoit sa carte classique
  const missing = DISTRICT_SEEDS.filter((d) => !s.districts.some((x) => (x.city ?? 'corrano') === (d.city ?? 'corrano')));
  if (missing.length) s.districts.push(...seedDistricts(s, missing));
  for (const r of RIVAL_SEEDS) {
    if (!s.rivals.some((x) => x.id === r.id)) s.rivals.push({ ...r, traits: [...(r.traits ?? donStartTraits(r.id))], wins: 0, lossesToPlayer: 0 });
    const cur = s.rivals.find((x) => x.id === r.id)!;
    cur.city ??= r.city;
    cur.surname ??= r.surname;
  }
  s.cities ??= { corrano: { open: true, governorId: null } };
  s.commission ??= initCommission(s);
  // l'ancien mode « ascension » n'existe plus : une partie en cours devient une partie de Don
  if (s.career) {
    const c = s.career;
    if (c.rank !== 'don') {
      s.districts.filter((d) => d.owner === c.employer).forEach((d) => { d.owner = 'player'; d.unrest = 0; });
      const emp = s.rivals.find((r) => r.id === c.employer);
      if (emp) { emp.alive = false; emp.employer = false; }
      const don = s.members.find((m) => m.isDon);
      const last = don?.name.split(' ').slice(1).join(' ');
      if (last) s.familyName = `Famille ${last}`;
      s.orders = [];
    }
    delete s.career;
  }
  s.children ??= [];
  s.generation ??= 1;
  if (s.status === 'playing' && !s.members.some((m) => m.isDon) && !s.regency) {
    s.members.unshift(makeDon(nextId(s), randInt(1, 1e9)));
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

/** Expérience + annonce des montées de niveau dans le journal */
export function award(s: GameState, m: Member, amount: number, stat: JobStat) {
  m.lastOp = s.week;
  if (m.isDon) {
    m.xp = (m.xp ?? 0) + amount * 2;
    m.level ??= 0;
    while (m.xp >= donXpForNext(m.level)) {
      m.xp -= donXpForNext(m.level);
      m.level += 1;
      m.points = (m.points ?? 0) + 1;
      log(s, 'good', `Le Don passe niveau ${m.level} : 1 point à placer (onglet Le Don).`);
    }
    return;
  }
  if (m.isChild && donHasTalent(s, 'p_famille')) amount = Math.ceil(amount * 1.5);
  for (const up of gainXp(m, amount, stat)) {
    const t = up.trait ? `, nouveau trait « ${TRAITS[up.trait].name} »` : '';
    log(s, 'good', `${m.nickname} passe niveau ${m.level} (${rankTitle(m)}) : +1 ${up.stat === 'force' ? 'force' : 'discrétion'}${t}.`);
  }
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
  const city = cityOf(d);
  return s.districts.filter((o) => cityOf(o) === city && Math.abs(o.row - d.row) + Math.abs(o.col - d.col) === 1);
}

export function isAttackable(s: GameState, d: District): boolean {
  return d.owner !== 'player' && neighbors(s, d).some((n) => n.owner === 'player');
}

export const activeMembers = (s: GameState) => s.members.filter((m) => m.status === 'actif');

export function membersIn(s: GameState, districtId: string) {
  return s.members.filter((m) => m.status === 'actif' && m.assignment === districtId);
}

export function committedToAttack(s: GameState, memberId: number) {
  return s.orders.some((o) => o.memberIds.includes(memberId)) || s.jobs.some((j) => j.team.includes(memberId)) || onHeist(s, memberId);
}
/** engagé sur le grand coup en cours (repérages, préparation ou jour J) */
export const onHeist = (s: GameState, memberId: number) => !!s.heist && s.heist.stage > 0 && s.heist.team.includes(memberId);
export const onJob = (s: GameState, memberId: number) => s.jobs.find((j) => j.team.includes(memberId));
export const onAttack = (s: GameState, memberId: number) => s.orders.find((o) => o.memberIds.includes(memberId));

/** Défense d'un quartier (pour le joueur : hommes postés, hors ceux engagés en attaque) */
export function defenseOf(s: GameState, d: District): number {
  const garageBonus = d.businesses.filter((b) => b.kind === 'garage').length * 5 + d.businesses.filter((b) => b.kind === 'armurerie').length * 4;
  if (d.owner === 'player') {
    const men = membersIn(s, d.id).filter((m) => !committedToAttack(s, m.id));
    return 4 + (d.id === 'sicily' ? 6 : 0) + garageBonus + men.reduce((t, m) => t + m.force + (m.rank === 'capo' ? 2 : 0) + (has(m, 'roc') ? 3 : 0), 0);
  }
  if (d.owner === 'neutral') return d.garrison + garageBonus;
  const r = rival(s, d.owner)!;
  const count = Math.max(1, owned(s, d.owner).length);
  const donBonus = (donHas(r, 'prudent') ? 3 : 0) + (donHas(r, 'aguerri') ? 3 : 0);
  return Math.round(4 + r.strength / Math.sqrt(count)) + garageBonus + donBonus;
}

export function attackPower(s: GameState, memberIds: number[]): number {
  const men = s.members.filter((m) => memberIds.includes(m.id));
  const armed = (m: Member) => (m.assignment && s.districts.find((d) => d.id === m.assignment)?.businesses.some((b) => b.kind === 'armurerie') ? 1 : 0);
  const base = men.reduce((t, m) => t + m.force + (m.rank === 'capo' ? 2 : 0) + (has(m, 'tireur') ? 3 : 0) + (has(m, 'tetebrulee') ? 3 : 0) - (has(m, 'trouillard') ? 2 : 0) + armed(m), 0);
  return Math.max(0, Math.round(base + donPresence(s, men) + s.respect / 20 + teamBondBonus(s, memberIds)));
}

/** Le patron est là : ses hommes se battent mieux. Main de fer : sa Poigne compte double. */
export function donPresence(s: GameState, men: Member[]) {
  const don = men.find((m) => m.isDon);
  if (!don) return 0;
  const morale = (men.length - 1) * (donHasTalent(s, 'b_reputation') ? DON_MORALE + 1 : DON_MORALE);
  return morale + (donHasTalent(s, 'b_maindefer') ? don.force : 0);
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
  return BASE_STORAGE + owned(s).reduce((t, d) => t + d.businesses.reduce((u, b) => u + bizStorage(b), 0), 0);
}
export const stockTotal = (s: GameState) => GOOD_ORDER.reduce((t, g) => t + s.stock[g], 0);
export const pendingCrates = (s: GameState) => s.shipments.reduce((t, x) => t + x.qty, 0);

/** Prix d'une recrue, remise du recruteur comprise */
export const recruitCost = (s: GameState, r: Recruit) => Math.round(r.cost * (familyHas(s, 'recruteur') ? 0.8 : 1));

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
      for (const b of d.businesses) if (b.kind === 'distillerie') produced += ginOf(d, b);
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
        const demand = b.kind === 'speakeasy' ? speakDemand(b) : TRIPOT_WHISKY;
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
          o.revenue += Math.round(q * retailPrice(d, g) * retailMult(b));
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
  const flair = flairBonus(s);
  for (const d of owned(s)) {
    const mult = capoBonus(s, d) * ((d.unrest ?? 0) > 0 ? 0.5 : 1) * cityMult(s, cityOf(d));
    const r = s.lowProfile ? 0 : racketOf(d);
    let f = 0;
    for (const b of d.businesses) {
      const def = BUSINESSES[b.kind];
      if (def.illegal) {
        if (!s.lowProfile) f += bizIncome(s, d, b);
        heatGain += s.lowProfile ? 0 : bizHeat(b) * (d.bribedCop ? 0.5 : 1);
      } else {
        cleanIn += bizIncome(s, d, b);
        launderCap += bizLaunder(b);
        heatGain += bizHeat(b);
      }
    }
    const sales = plan.outlets.filter((o) => o.districtId === d.id).reduce((t, o) => t + o.revenue, 0);
    racket += Math.round(r * mult);
    fixed += Math.round(f * mult);
    booze += Math.round(sales * mult * (1 + flair));
  }
  dirtyIn = racket + fixed + booze;
  if (s.councilman) launderCap = Math.round(launderCap * 1.25);
  launderCap = Math.round(launderCap * (1 + 0.1 * familyCount(s, 'comptable') + (spouseHas(s, 'affaires') ? 0.1 : 0)));
  heatGain += familyCount(s, 'bavard') - (spouseHas(s, 'pieuse') ? 1 : 0) + networkHeat(s) + politicsHeat(s);
  if (spouseHas(s, 'fortune')) cleanIn += 300;
  const salaries = activeMembers(s).reduce((t, m) => t + m.salary, 0) + s.members.filter((m) => m.status !== 'actif').reduce((t, m) => t + Math.round(m.salary / 2), 0);
  const bribes =
    owned(s).filter((d) => d.bribedCop).length * 300 + (s.judge ? 800 : 0) + (s.councilman ? 1200 : 0) + networkRetainers(s) + senatorRetainer(s);
  return { dirtyIn, racket, fixed, booze, cleanIn, launderCap, heatGain: Math.round(heatGain), salaries, bribes, plan };
}
