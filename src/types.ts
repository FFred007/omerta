/** 'player' ou l'identifiant d'une famille rivale (castellano, kilbride, wolska, benedetto…) */
export type FamilyId = string;
export type Owner = string;

import type { DonTraitId, TraitId } from './traits';
import type { TalentId } from './don';
import type { EduId, SpouseOrigin, SpouseTraitId } from './family';

export type BusinessKind =
  | 'speakeasy'
  | 'tripot'
  | 'distillerie'
  | 'paris'
  | 'blanchisserie'
  | 'restaurant'
  | 'garage'
  | 'entrepot'
  | 'hotel'
  | 'jazz'
  | 'cinema'
  | 'taxis'
  | 'credit'
  | 'imprimerie'
  | 'usurier'
  | 'boxe'
  | 'armurerie'
  | 'planque'
  | 'quai'
  | 'casino'
  | 'lobby';

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
  /** réservé à une ville */
  city?: string;
  /** respect minimum pour construire */
  minRespect?: number;
  /** effet spécial résumé pour l'interface */
  special?: string;
}

export interface Business {
  id: number;
  kind: BusinessKind;
  /** 2 = amélioré */
  level?: number;
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
  /** ville du quartier (absent = New Corrano) */
  city?: string;
  /** gare d'arrivée : réservée au joueur tant que la ville n'est pas ouverte */
  gate?: boolean;
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
  /** ville du coup (absent = New Corrano) */
  city?: string;
  /** coup de vengeance contre un tueur nommé */
  vendettaId?: number;
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
  // ----- le Don et ses enfants (force = Poigne, discrétion = Ombre) -----
  isDon?: boolean;
  isChild?: boolean;
  childId?: number;
  verbe?: number;
  flair?: number;
  talents?: TalentId[];
  points?: number;
  birthWeek?: number;
  sex?: 'm' | 'f';
  scars?: number;
  seed?: number;
  /** ville où se trouve l'homme (absent = New Corrano) */
  city?: string;
}

export interface Spouse {
  name: string;
  origin: SpouseOrigin;
  rivalId?: string;
  traits: SpouseTraitId[];
  affection: number; // 0..100
  seed: number;
  birthWeek: number;
  pregnantWeeks?: number; // semaines avant la naissance
  lastGift?: number; // semaine de la dernière attention
}

export interface Courtship {
  name: string;
  origin: SpouseOrigin;
  rivalId?: string;
  traits: SpouseTraitId[];
  progress: number; // 0..100
  seed: number;
  birthWeek: number;
  lastDate?: number;
}

export interface Child {
  id: number;
  name: string;
  sex: 'm' | 'f';
  birthWeek: number;
  seed: number;
  education: EduId[];
  generation: number;
  memberId?: number; // une fois entré dans la famille (16 ans)
  motherOrigin?: SpouseOrigin;
  /** talents légués par le Don défunt, appliqués à la fin de la régence */
  inheritTalents?: TalentId[];
}

export interface Regency {
  childId: number;
  regentId?: number; // capo régent (sinon la mère)
  regentName: string;
}

export interface PastDon {
  name: string;
  nickname: string;
  fromWeek: number;
  toWeek: number;
  cause: string;
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
  id: string;
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
  city?: string;
  /** nom de famille (pour les mariages) */
  surname?: string;
  /** mise au ban par la Commission : les autres familles la chassent */
  bannedWeeks?: number;
  /** la famille qui emploie le joueur pendant l'ascension */
  employer?: boolean;
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
  spouse?: Spouse | null;
  courtship?: Courtship | null;
  pendingCandidate?: Courtship | null;
  children?: Child[];
  heirId?: number | null;
  regency?: Regency | null;
  generation?: number;
  dynasty?: PastDon[];
  contacts?: Record<string, { active: boolean; price: number; lastUse?: number; burned?: boolean; known?: boolean }>;
  dossier?: number;
  dossierWeek?: { label: string; value: number }[];
  lastDossier?: { from: number; to: number; lines: { label: string; value: number }[] };
  trial?: { stage: number; score: number } | null;
  agentWarned?: boolean;
  coalitionWeeks?: number;
  objectives?: Objective[];
  /** villes ouvertes et leurs gouverneurs */
  cities?: Record<string, CityState>;
  commission?: Commission;
  /** fin de partie : score détaillé */
  ending?: Ending | null;
  /** villes entièrement tenues (annoncées une fois) */
  cityLords?: string[];
  vendettas?: Vendetta[];
  bonds?: Bond[];
  /** opérations partagées par paire d'hommes (« 3-17 » → 2) */
  bondPts?: Record<string, number>;
  hunters?: Hunter[];
  heist?: Heist | null;
  heistCooldown?: number;
  /** carte tirée au hasard (nouvelles parties depuis la v0.8) */
  generatedMap?: boolean;
  /** l'ascension : de simple associé à Don (absent = partie commencée en tant que Don) */
  career?: Career;
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
  stats: { battlesWon: number; battlesLost: number; laundered: number; raids: number; jobsDone: number; cratesSold: number; contracts?: number };
}

export type FxKind = 'battle' | 'capture' | 'lost' | 'raid' | 'ship' | 'intercept' | 'job' | 'jobfail' | 'sale';
export interface FxEvent { kind: FxKind; d?: string }

export interface Objective {
  id: number;
  kind: string;
  title: string;
  giver: string;
  target?: string;
  base: number;
  goal: number;
  streak?: number;
  deadline: number;
  createdWeek: number;
  reward: { dirty?: number; clean?: number; respect?: number; favors?: number };
}

export interface CityState {
  open: boolean;
  governorId?: number | null;
  openedWeek?: number;
}

export type MotionKind = 'admission' | 'presidence' | 'ban_player' | 'ban_rival' | 'treve' | 'quais' | 'dime';
export type Vote = 'pour' | 'contre';
export interface Motion {
  kind: MotionKind;
  target?: string; // famille visée
  title: string;
  desc: string;
}
export interface Commission {
  seat: boolean;
  chair: boolean;
  next: number; // semaine de la prochaine réunion
  motion: Motion | null;
  /** voix achetées ou promises par pacte : rivalId → vote promis */
  bought: Record<string, Vote>;
  pacts: string[]; // familles liées par un pacte pour ce vote
  vote: Vote | null; // vote du joueur
  truceWeeks: number; // trêve générale
  portWeeks: number; // quais ouverts
  breach?: boolean; // le joueur a bafoué une trêve de la Commission
  history: { week: number; title: string; passed: boolean; pour: number; contre: number; betrayed?: string[] }[];
}

export type EndingKind = 'retraite' | 'legitimite' | 'mort' | 'prison' | 'ruine';
export interface Ending {
  kind: EndingKind;
  title: string;
  lines: { label: string; value: number }[];
  base: number;
  mult: number;
  score: number;
  rank: string;
  best?: number;
}

export interface Vendetta {
  id: number;
  killer: string;
  nickname: string;
  rivalId: string;
  city: string;
  force: number;
  victims: string[];
  /** hommes liés aux victimes, qui attendent la vengeance */
  avengers: number[];
  week: number;
  deadline: number;
  seed: number;
}

export type BondKind = 'freres' | 'rivaux';
export interface Bond { a: number; b: number; kind: BondKind; since: number }

export type HunterId = 'journaliste' | 'inspecteur';
export type HunterMood = 'enquete' | 'achete' | 'mute' | 'discredite' | 'mort';
export interface Hunter {
  id: HunterId;
  name: string;
  title: string;
  seed: number;
  progress: number; // 0..100 : à 100, il frappe
  integrity: number; // 0..100 : résistance à l'argent et aux menaces
  mood: HunterMood;
  moodWeeks: number; // durée de l'état (acheté, muté…) ; à 0 il revient ou est remplacé
  cooldown: number; // semaines avant la prochaine action du joueur contre lui
  strikes: number; // nombre de fois où il a frappé
  memory: { week: number; text: string }[];
  generation: number; // 1 = le premier, 2 = son remplaçant…
}

export type HeistStage = 0 | 1 | 2 | 3; // 0 proposé, 1 repérages, 2 préparation, 3 jour J
export interface Heist {
  key: string;
  title: string;
  text: string;
  city: string;
  stat: JobStat;
  difficulty: number;
  minMen: number;
  stage: HeistStage;
  team: number[];
  prep: number; // bonus de préparation ajouté à la compétence de l'équipe
  leak: number; // 0..100 : risque que la police attende l'équipe
  gear: string[]; // options de préparation achetées
  spent: number;
  expires: number; // semaine limite pour lancer le coup
  reward: { dirty?: number; clean?: number; respect?: number; crates?: { good: Good; qty: number } };
  rivalId?: string;
  log: string[];
}

export type CareerRank = 'associe' | 'soldat' | 'capo' | 'don';
export type MissionStat = 'force' | 'discretion' | 'verbe' | 'flair';
export interface Mission {
  id: number;
  key: string;
  title: string;
  text: string;
  giver: string; // qui donne l'ordre
  stat: MissionStat;
  difficulty: number;
  reward: { dirty: number; trust: number; respect?: number };
  failTrust: number;
  failHeat: number;
  danger: number; // 0..1 : blessure ou prison si ça rate
  accepted: boolean;
  crew: number[]; // hommes du joueur qui l'accompagnent (force et discrétion seulement)
  skim: boolean; // se servir dans la caisse
  rivalId?: string;
}
/** Un personnage de la famille : le Don, le consigliere, les capos, les anciens */
export interface Notable {
  id: string;
  role: 'don' | 'consigliere' | 'capo' | 'ancien';
  name: string;
  nickname: string;
  seed: number;
  age: number;
  affinity: number; // -100..100 envers le joueur
  /** pour les votants : affinité qu'il a pour le favori (le joueur doit faire mieux) */
  rivalPull?: number;
  favori?: boolean;
  traits?: string[];
  lastGift?: number;
}
export interface Career {
  rank: CareerRank;
  origin: string;
  employer: string; // id de la famille dans s.rivals
  trust: number; // confiance du Don 0..100
  missionsDone: number;
  missionsTotal: number; // réussies depuis le début
  rankWeek: number;
  missions: Mission[];
  kickup: number; // part reversée au Don par le capo (0,2 · 0,3 · 0,4)
  notables: Notable[];
  donHealth: number;
  dying?: boolean;
  lost?: string; // nom du capo qui a pris la place du Don à la place du joueur
  path?: 'succession' | 'coup' | 'trahison';
  history: { week: number; text: string }[];
}
