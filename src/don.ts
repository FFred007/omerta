// Le Don : un membre spécial de la famille (force = Poigne, discrétion = Ombre, + Verbe et Flair).
// Il gagne des points à placer lui-même : stats ou talents des trois branches.
import type { GameState, Member } from './types';

export const YEAR_WEEKS = 6; // 1 an de vie = 6 semaines de jeu
export const DON_START_AGE = 34;
export const DON_MORALE = 2; // bonus par homme quand le Don est à leurs côtés
export const DON_SEEN_HEAT = 5; // heat quand le Don est vu sur une opération
export const STAT_CAP = 14;

export type Branch = 'boucher' | 'renard' | 'parrain';
export type TalentId =
  | 'b_reputation' | 'b_silence' | 'b_terreur' | 'b_maindefer' | 'b_increvable'
  | 'r_invisible' | 'r_comptes' | 'r_avocat' | 'r_ombre' | 'r_insaisissable'
  | 'p_respect' | 'p_parole' | 'p_commercants' | 'p_table' | 'p_famille';

export interface TalentDef { id: TalentId; branch: Branch; tier: number; name: string; desc: string }

export const BRANCHES: Record<Branch, { name: string; desc: string }> = {
  boucher: { name: 'Le Boucher', desc: 'Le terrain, la peur, la violence' },
  renard: { name: 'Le Renard', desc: 'L’ombre, la police, la justice, les comptes' },
  parrain: { name: 'Le Parrain', desc: 'Le respect, la loyauté, les alliances' },
};

export const TALENTS: TalentDef[] = [
  { id: 'b_reputation', branch: 'boucher', tier: 1, name: 'Réputation', desc: 'Ses hommes gagnent +3 au lieu de +2 quand il mène l’assaut' },
  { id: 'b_silence', branch: 'boucher', tier: 2, name: 'Personne ne parle', desc: 'Heat des coups de force ratés ÷2' },
  { id: 'b_terreur', branch: 'boucher', tier: 3, name: 'Terreur', desc: 'Les rivaux t’attaquent 25 % moins souvent' },
  { id: 'b_maindefer', branch: 'boucher', tier: 4, name: 'Main de fer', desc: 'Sa Poigne compte double en assaut' },
  { id: 'b_increvable', branch: 'boucher', tier: 5, name: 'Increvable', desc: 'Risque de mort au combat ÷2, blessures plus courtes' },
  { id: 'r_invisible', branch: 'renard', tier: 1, name: 'Pas vu, pas pris', desc: 'Plus de heat quand il participe à une opération' },
  { id: 'r_comptes', branch: 'renard', tier: 2, name: 'Comptabilité créative', desc: 'Commission de blanchiment 8 % au lieu de 15 %' },
  { id: 'r_avocat', branch: 'renard', tier: 3, name: 'Avocat de la famille', desc: 'Peines de prison de tes hommes ÷2' },
  { id: 'r_ombre', branch: 'renard', tier: 4, name: 'Homme de l’ombre', desc: 'Descentes de police −20 %' },
  { id: 'r_insaisissable', branch: 'renard', tier: 5, name: 'Insaisissable', desc: 'Risque d’inculpation fédérale ÷2' },
  { id: 'p_respect', branch: 'parrain', tier: 1, name: 'Respect', desc: '+1 respect par semaine' },
  { id: 'p_parole', branch: 'parrain', tier: 2, name: 'La parole du Don', desc: '+1 loyauté par semaine pour tous tes hommes' },
  { id: 'p_commercants', branch: 'parrain', tier: 3, name: 'Ami des commerçants', desc: '+1 satisfaction par semaine dans tous tes quartiers' },
  { id: 'p_table', branch: 'parrain', tier: 4, name: 'Table ouverte', desc: 'Dîners d’affaires gratuits et +5 de relation' },
  { id: 'p_famille', branch: 'parrain', tier: 5, name: 'La famille avant tout', desc: 'Ta femme ne t’en veut plus de la heat ; tes enfants apprennent 50 % plus vite' },
];
export const talent = (id: TalentId) => TALENTS.find((t) => t.id === id)!;

export const donOf = (s: GameState) => s.members.find((m) => m.isDon);
export const donHasTalent = (s: GameState, t: TalentId) => !!donOf(s)?.talents?.includes(t);
export const ageOf = (s: GameState, m: { birthWeek?: number }) => (s.week - (m.birthWeek ?? s.week)) / YEAR_WEEKS;

export function canLearn(m: Member, t: TalentDef) {
  if (m.talents?.includes(t.id)) return false;
  if (t.tier === 1) return true;
  return TALENTS.some((x) => x.branch === t.branch && x.tier === t.tier - 1 && m.talents?.includes(x.id));
}

export function donXpForNext(level: number) {
  return 5 + level * 4;
}

export function makeDon(id: number, seed: number): Member {
  return {
    id,
    name: 'Vittorio Moretti',
    nickname: 'le Neveu',
    rank: 'capo',
    force: 6,
    discretion: 6,
    verbe: 6,
    flair: 5,
    loyalty: 100,
    salary: 0,
    assignment: 'sicily',
    status: 'actif',
    statusWeeks: 0,
    weeksServed: 0,
    xp: 0,
    level: 0,
    points: 1,
    talents: [],
    traits: [],
    isDon: true,
    sex: 'm',
    birthWeek: 1 - DON_START_AGE * YEAR_WEEKS,
    scars: 0,
    seed,
  };
}

export const launderFee = (s: GameState) => (donHasTalent(s, 'r_comptes') ? 0.08 : 0.15);
/** Bonus de ventes au comptoir grâce au Flair du Don (au-dessus de 5) */
export const flairBonus = (s: GameState) => {
  const d = donOf(s);
  return d && d.status === 'actif' ? Math.max(0, (d.flair ?? 5) - 5) * 0.03 : 0;
};

// ---------- Actions du joueur ----------
type Result = { ok: true } | { ok: false; error: string };
export type DonStat = 'force' | 'discretion' | 'verbe' | 'flair';
export const DON_STATS: Record<DonStat, { name: string; desc: string }> = {
  force: { name: 'Poigne', desc: 'Combat et intimidation : compte dans les assauts et les coups de force' },
  discretion: { name: 'Ombre', desc: 'Discrétion : compte dans les coups de discrétion, évite les arrestations' },
  verbe: { name: 'Verbe', desc: 'Diplomatie et séduction : dîners d’affaires et cour plus efficaces' },
  flair: { name: 'Flair', desc: 'Business : +3 % de ventes au comptoir par point au-dessus de 5' },
};

export function spendPoint(s: GameState, stat: DonStat): Result {
  const d = donOf(s);
  if (!d) return { ok: false, error: 'Pas de Don en ce moment.' };
  if (!d.points) return { ok: false, error: 'Aucun point à placer : gagne de l’expérience sur le terrain.' };
  const cur = (d[stat] ?? 5) as number;
  if (cur >= STAT_CAP) return { ok: false, error: `Maximum atteint (${STAT_CAP}).` };
  d[stat] = cur + 1;
  d.points -= 1;
  return { ok: true };
}

export function learnTalent(s: GameState, id: TalentId): Result {
  const d = donOf(s);
  if (!d) return { ok: false, error: 'Pas de Don en ce moment.' };
  const t = talent(id);
  if (!d.points) return { ok: false, error: 'Aucun point à placer.' };
  if (!canLearn(d, t)) return { ok: false, error: 'Apprends d’abord le talent précédent de cette branche.' };
  (d.talents ??= []).push(id);
  d.points -= 1;
  return { ok: true };
}
