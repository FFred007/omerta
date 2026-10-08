export type FamilyId = 'player' | 'castellano' | 'kilbride' | 'wolska';
export type Owner = FamilyId | 'neutral';

export type BusinessKind =
  | 'speakeasy'
  | 'tripot'
  | 'distillerie'
  | 'paris'
  | 'blanchisserie'
  | 'restaurant'
  | 'garage';

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
  pendingEvent: PendingEvent | null;
  log: LogEntry[];
  lastReport: LogEntry[];
  nextId: number;
  status: 'playing' | 'won' | 'lost';
  endReason: string;
  stats: { battlesWon: number; battlesLost: number; laundered: number; raids: number };
}
