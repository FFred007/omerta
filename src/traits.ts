// Traits, expérience et niveaux des hommes ; traits des Dons rivaux.
import type { GameState, JobStat, Member, RivalFamily } from './types';

export type TraitId =
  | 'tireur' | 'roc' | 'fantome' | 'negociateur' | 'comptable' | 'chauffeur' | 'recruteur'
  | 'fidele' | 'sangfroid' | 'brute' | 'beauparleur' | 'infirmier' | 'tetebrulee'
  | 'cupide' | 'bavard' | 'ivrogne' | 'trouillard';

export interface TraitDef {
  id: TraitId;
  name: string;
  desc: string;
  good: boolean;
  /** quelle activité le fait apparaître à la montée de niveau */
  affinity: JobStat | 'any';
}

export const TRAITS: Record<TraitId, TraitDef> = {
  tireur: { id: 'tireur', name: "Tireur d'élite", desc: '+3 de puissance en assaut', good: true, affinity: 'force' },
  roc: { id: 'roc', name: 'Gueule cassée', desc: '+3 de défense dans le quartier où il est posté', good: true, affinity: 'force' },
  brute: { id: 'brute', name: 'Brute', desc: '+2 sur les coups de force', good: true, affinity: 'force' },
  tetebrulee: { id: 'tetebrulee', name: 'Tête brûlée', desc: '+3 en assaut, mais +2 heat à chaque assaut', good: true, affinity: 'force' },
  fantome: { id: 'fantome', name: 'Fantôme', desc: 'Jamais arrêté lors d’une descente, risque de prison ÷2 sur les coups', good: true, affinity: 'discretion' },
  sangfroid: { id: 'sangfroid', name: 'Sang-froid', desc: '+2 sur les coups de discrétion', good: true, affinity: 'discretion' },
  chauffeur: { id: 'chauffeur', name: 'Chauffeur', desc: 'Risque d’interception des livraisons ×0,7', good: true, affinity: 'discretion' },
  comptable: { id: 'comptable', name: 'Comptable', desc: '+10 % de capacité de blanchiment', good: true, affinity: 'discretion' },
  negociateur: { id: 'negociateur', name: 'Négociateur', desc: '+6 de relation à chaque dîner d’affaires', good: true, affinity: 'any' },
  recruteur: { id: 'recruteur', name: 'Recruteur', desc: 'Recrues 20 % moins chères', good: true, affinity: 'any' },
  fidele: { id: 'fidele', name: 'Fidèle', desc: 'Sa loyauté ne descend jamais sous 50 : il ne trahira pas', good: true, affinity: 'any' },
  beauparleur: { id: 'beauparleur', name: 'Beau parleur', desc: '+2 de satisfaction par semaine pour les commerçants de son quartier', good: true, affinity: 'any' },
  infirmier: { id: 'infirmier', name: 'Ancien infirmier', desc: 'Les blessés de la famille guérissent deux fois plus vite', good: true, affinity: 'any' },
  cupide: { id: 'cupide', name: 'Cupide', desc: '−1 de loyauté par semaine', good: false, affinity: 'any' },
  bavard: { id: 'bavard', name: 'Bavard', desc: '+1 heat par semaine : il parle trop dans les bars', good: false, affinity: 'any' },
  ivrogne: { id: 'ivrogne', name: 'Ivrogne', desc: '−2 sur les coups de discrétion', good: false, affinity: 'any' },
  trouillard: { id: 'trouillard', name: 'Trouillard', desc: '−2 de puissance en assaut', good: false, affinity: 'any' },
};
export const GOOD_TRAITS = (Object.values(TRAITS) as TraitDef[]).filter((t) => t.good).map((t) => t.id);
export const BAD_TRAITS = (Object.values(TRAITS) as TraitDef[]).filter((t) => !t.good).map((t) => t.id);
export const MAX_TRAITS = 3;

export const has = (m: Member, t: TraitId) => (m.traits ?? []).includes(t);
/** au moins un homme actif de la famille possède ce trait */
export const familyHas = (s: GameState, t: TraitId) => s.members.some((m) => m.status === 'actif' && has(m, t));
export const familyCount = (s: GameState, t: TraitId) => s.members.filter((m) => m.status === 'actif' && has(m, t)).length;

// ---------- Expérience ----------
export const RANKS = ['Recrue', 'Soldat', 'Soldat', 'Homme de confiance', 'Homme de confiance', 'Vétéran'];
export const MAX_LEVEL = 8;
export const xpForNext = (level: number) => 4 + level * 3;
export function rankTitle(m: Member) {
  if (m.rank === 'capo') return 'Capo';
  return RANKS[Math.min(m.level ?? 0, RANKS.length - 1)];
}

export interface LevelUp { member: Member; stat: JobStat; trait?: TraitId }

/**
 * Donne de l'expérience. À chaque niveau, +1 dans la stat la plus utilisée ;
 * aux niveaux pairs, un nouveau trait lié à ce que l'homme a vraiment fait.
 */
export function gainXp(m: Member, amount: number, stat: JobStat): LevelUp[] {
  m.xp = (m.xp ?? 0) + amount;
  m.level ??= 0;
  m.usage ??= { force: 0, discretion: 0 };
  m.usage[stat] += amount;
  const ups: LevelUp[] = [];
  while (m.level < MAX_LEVEL && m.xp >= xpForNext(m.level)) {
    m.xp -= xpForNext(m.level);
    m.level += 1;
    const main: JobStat = m.usage.force >= m.usage.discretion ? 'force' : 'discretion';
    if (main === 'force') m.force = Math.min(12, m.force + 1);
    else m.discretion = Math.min(12, m.discretion + 1);
    const up: LevelUp = { member: m, stat: main };
    if (m.level % 2 === 0 && (m.traits ?? []).length < MAX_TRAITS) {
      const pool = GOOD_TRAITS.filter((t) => !has(m, t) && (TRAITS[t].affinity === main || TRAITS[t].affinity === 'any'));
      if (pool.length) {
        // les traits liés à l'activité principale sortent deux fois plus souvent
        const weighted = pool.flatMap((t) => (TRAITS[t].affinity === main ? [t, t] : [t]));
        const t = weighted[Math.floor(Math.random() * weighted.length)];
        (m.traits ??= []).push(t);
        up.trait = t;
      }
    }
    ups.push(up);
  }
  return ups;
}

/** Tire les traits d'une recrue : souvent un, parfois deux, parfois un défaut */
export function rollRecruitTraits(): TraitId[] {
  const out: TraitId[] = [];
  const r = Math.random();
  const nGood = r < 0.25 ? 0 : r < 0.8 ? 1 : 2;
  const pool = [...GOOD_TRAITS];
  for (let i = 0; i < nGood; i++) out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  if (Math.random() < 0.3) out.push(BAD_TRAITS[Math.floor(Math.random() * BAD_TRAITS.length)]);
  return out;
}

// ---------- Dons rivaux ----------
export type DonTraitId = 'sanguinaire' | 'prudent' | 'riche' | 'rancunier' | 'aguerri' | 'revanchard' | 'diplomate';
export const DON_TRAITS: Record<DonTraitId, { name: string; desc: string }> = {
  sanguinaire: { name: 'Sanguinaire', desc: 'Attaque plus souvent' },
  prudent: { name: 'Prudent', desc: '+3 de défense dans ses quartiers' },
  riche: { name: 'Fortuné', desc: 'Recrute plus vite (+25 % de revenus)' },
  rancunier: { name: 'Rancunier', desc: 'Les offenses lui coûtent 50 % de relation en plus' },
  diplomate: { name: 'Diplomate', desc: 'Les dîners d’affaires rapportent +5 de relation' },
  aguerri: { name: 'Aguerri', desc: 'Gagné après 3 victoires : +3 de défense, +10 % de puissance en attaque' },
  revanchard: { name: 'Revanchard', desc: 'Gagné après 2 quartiers perdus contre toi : te vise en priorité' },
};
export const donHas = (r: RivalFamily, t: DonTraitId) => (r.traits ?? []).includes(t);

export function donStartTraits(id: string): DonTraitId[] {
  if (id === 'castellano') return ['prudent', 'riche'];
  if (id === 'kilbride') return ['sanguinaire'];
  return ['diplomate', 'rancunier'];
}
