export type FamilyId = 'player' | 'castellano' | 'kilbride' | 'wolska';
export type Owner = FamilyId | 'neutral';

import type { DonTraitId, TraitId } from './traits';

export type BusinessKind =
  | 'speakeasy'
  | 'tripot'
  | 'distillerie'
  | 'paris'
  | 'blanchisserie'
  | 'restaurant'
  | 'garage'
  | 'entrepot';

export interface BusinessDef {
  kind: BusinessKind;
  name: string;
  illegal: boolean;
  cost: number;
  /** 'dirty' = payé en argent sale, 'clean' = payé en argent propre */
  currency: 'dirty' | 'clean';
  income: number; // argent sale par semaine (illégal) ou propre (légal)
  launder: number; // capacité de blanchiment / semaine
  heat: number; // heat ajoutée chaque semaine
  desc: string;
  storage?: number; // capacité de stockage d'alcool ajoutée
}

export interface Business {
  id: number;
  kind: BusinessKind;
}

export interface District {
  id: string;
  name: string;
  row: number;
  col: number;
  owner: Owner;
  racket: number; // revenu de protection / semaine
  police: 1 | 2 | 3;
  slots: number;
  businesses: Business[];
  /** garnison des quartiers neutres */
  garrison: number;
  bribedCop: boolean;
  /** semaines de pacification après une conquête */
  unrest?: number;
  flavor: string;
  shops: Shop[];
  tariff: Tariff;
  /** richesse de la clientèle : multiplie le prix de vente au verre */
  wealth: number;
}

export type Tariff = 'bas' | 'normal' | 'eleve';

export interface Shop {
  id: number;
  owner: string; // « Giuseppe Colombo »
  trade: string; // « boulanger »
  satisfaction: number; // 0..100
}

// ---------- Alcool ----------
export type Good = 'biere' | 'gin' | 'whisky';

export interface Shipment {
  id: number;
  good: Good;
  qty: number;
  escort: Escort;
  paid: number;
}
export type Escort = 'aucune' | 'legere' | 'forte';

// ---------- Coups ----------
export type JobStat = 'force' | 'discretion';
export interface JobReward {
  dirty?: number;
  clean?: number;
  crates?: { good: Good; qty: number };
  respect?: number;
  heat?: number; // variation de heat en cas de succès (négatif = baisse)
  rivalHit?: number; // force retirée au rival ciblé
  burnBusiness?: boolean; // détruit un établissement du rival
}
export interface Job {
  id: number;
  key: string;
  title: string;
  text: string;
  stat: JobStat;
  difficulty: number;
  minMen: number;
  reward: JobReward;
  failHeat: number;
  danger: number; // 0..1 : gravité des conséquences en cas d'échec
  rivalId?: string;
  relationHit?: number;
  team: number[];
}

export interface Loan {
  due: number; // semaine de remboursement
  amount: number;
  shop: string;
}

export interface Headline {
  week: number;
  title: string;
  sub: string;
}

export type Rank = 'soldat' | 'capo';
export type MemberStatus = 'actif' | 'blessé' | 'prison';

export interface Member {
  id: number;
  name: string;
  nickname: string;
  rank: Rank;
  force: number;
  discretion: number;
  loyalty: number;
  salary: number;
  assignment: string | null; // id de quartier ou null = réserve
  status: MemberStatus;
  statusWeeks: number;
  weeksServed: number;
  /** semaines de repos après un assaut */
  fatigue?: number;
  xp?: number;
  level?: number;
  traits?: TraitId[];
  /** expérience accumulée par type d'action, décide de la stat qui progresse */
  usage?: { force: number; discretion: number };
}

export interface Recruit {
  id: number;
  name: string;
  nickname: string;
  force: number;
  discretion: number;
  loyalty: number;
  salary: number;
  cost: number;
  traits?: TraitId[];
  level?: number;
}

export interface RivalFamily {
  id: Exclude<FamilyId, 'player'>;
  name: string;
  boss: string;
  color: string;
  strength: number;
  money: number;
  aggression: number; // 0..1
  truceWeeks: number;
  alive: boolean;
  relation: number; // -100..100 envers le joueur
  alliance: boolean;
  war: boolean;
  talkCooldown: number;
  traits?: DonTraitId[];
  wins?: number;
  lossesToPlayer?: number;
}

export interface AttackOrder {
  districtId: string;
  memberIds: number[];
}

export interface EventChoice {
  label: string;
  hint: string;
  effect: string; // clé d'effet résolue dans events.ts
  disabled?: boolean;
}

export interface PendingEvent {
  key: string;
  title: string;
  text: string;
  choices: EventChoice[];
  data?: Record<string, string | number>;
}

export type LogTone = 'good' | 'bad' | 'neutral' | 'money' | 'police';
export interface LogEntry {
  week: number;
  tone: LogTone;
  text: string;
}

export interface GameState {
  version: number;
  familyName: string;
  week: number;
  dirty: number;
  clean: number;
  respect: number;
  heat: number;
  districts: District[];
  members: Member[];
  recruits: Recruit[];
  rivals: RivalFamily[];
  orders: AttackOrder[];
  judge: boolean;
  councilman: boolean;
  lowProfile: boolean; // profil bas cette semaine
  /** part de la capacité de blanchiment utilisée : 1 = max, 0.5 = moitié, 0 = rien */
  launderRate?: number;
  stock: Record<Good, number>;
  market: Record<Good, number>; // multiplicateur de prix du marché (0,55..1,9)
  marketTrend: Record<Good, number>;
  shipments: Shipment[];
  jobs: Job[];
  favors: number;
  loans: Loan[];
  safeRouteWeeks: number;
  headlines: Headline[];
  news: { prio: number; title: string; sub: string }[];
  lastEventKey?: string;
  /** jour de la semaine en cours (0 = lundi … 6 = dimanche) */
  day?: number;
  speed?: number;
  lastHeat?: { from: number; to: number; lines?: { label: string; value: number }[] };
  /** effets visuels produits par la dernière résolution */
  fx?: FxEvent[];
  pendingEvent: PendingEvent | null;
  log: LogEntry[];
  lastReport: LogEntry[];
  nextId: number;
  status: 'playing' | 'won' | 'lost';
  endReason: string;
  stats: { battlesWon: number; battlesLost: number; laundered: number; raids: number; jobsDone: number; cratesSold: number };
}

export type FxKind = 'battle' | 'capture' | 'lost' | 'raid' | 'ship' | 'intercept' | 'job' | 'jobfail' | 'sale';
export interface FxEvent { kind: FxKind; d?: string }
