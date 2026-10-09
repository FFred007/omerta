// Le commandement d'un capo : un bonus pour toute son équipe, selon son trait.
import { has } from './traits';
import type { District, GameState, Member } from './types';

export type CommandKind = 'force' | 'commerce' | 'comptes' | 'ombre' | 'fidelite';
export const COMMANDS: Record<CommandKind, { name: string; desc: string }> = {
  force: { name: 'Meneur d’hommes', desc: '+1 de force pour chacun de ses hommes (assauts, défense, coups de force)' },
  commerce: { name: 'Ami des commerçants', desc: '+1 de satisfaction par semaine pour les commerçants de ses quartiers' },
  comptes: { name: 'Bon gestionnaire', desc: '+10 % de revenus dans ses quartiers' },
  ombre: { name: 'Prudent', desc: 'ses hommes risquent deux fois moins la prison (descentes et coups)' },
  fidelite: { name: 'Homme d’honneur', desc: 'la loyauté de ses hommes ne descend jamais sous 40' },
};

/** Le bonus d'un capo vient de son trait le plus marquant */
export function commandOf(capo: Member): CommandKind | null {
  if (['tireur', 'brute', 'tetebrulee', 'roc'].some((t) => has(capo, t as never))) return 'force';
  if (has(capo, 'negociateur') || has(capo, 'beauparleur')) return 'commerce';
  if (has(capo, 'comptable')) return 'comptes';
  if (has(capo, 'fantome') || has(capo, 'sangfroid')) return 'ombre';
  if (has(capo, 'fidele')) return 'fidelite';
  return null;
}

/** Le capo de cet homme, s'il est là pour commander */
export function leaderOf(s: GameState, m: Member): Member | undefined {
  if (typeof m.crew !== 'number') return undefined;
  const c = s.members.find((x) => x.id === m.crew);
  return c && c.status === 'actif' ? c : undefined;
}
const leaderHas = (s: GameState, m: Member, k: CommandKind) => {
  const c = leaderOf(s, m);
  return !!c && commandOf(c) === k;
};
/** +1 de force sous un meneur d'hommes */
export const commandForce = (s: GameState, m: Member) => (leaderHas(s, m, 'force') ? 1 : 0);
/** risque de prison ÷2 sous un capo prudent */
export const commandJail = (s: GameState, m: Member) => (leaderHas(s, m, 'ombre') ? 0.5 : 1);
/** plancher de loyauté sous un homme d'honneur */
export const commandFloor = (s: GameState, m: Member) => (leaderHas(s, m, 'fidelite') ? 40 : 0);

/** Le capo responsable d'un quartier, s'il est là */
export function districtCapo(s: GameState, d: District): Member | undefined {
  if (d.capo === undefined) return undefined;
  const c = s.members.find((x) => x.id === d.capo && x.rank === 'capo');
  return c && c.status === 'actif' ? c : undefined;
}
export const districtCommand = (s: GameState, d: District) => {
  const c = districtCapo(s, d);
  return c ? commandOf(c) : null;
};
