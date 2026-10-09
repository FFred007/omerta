// Les onglets s'ouvrent au fil de la partie : on découvre un système au moment où il devient utile.
import { tierOf } from './data';
import { openCities } from './cities';
import { activeContacts } from './network';
import { ageOf, donOf } from './don';
import type { GameState } from './types';

export type Gated = 'rivaux' | 'corruption' | 'villes' | 'commission' | 'relations';
export const GATED: Gated[] = ['rivaux', 'corruption', 'villes', 'commission', 'relations'];

/** Ce que le consigliere dit le lundi où l'onglet s'ouvre */
export const UNLOCK_TEXT: Record<Gated, { name: string; text: string }> = {
  rivaux: { name: 'Rivaux', text: 'Les autres familles savent qui tu es. Dîners, tributs, alliances ou guerre : c’est dans l’onglet Rivaux.' },
  corruption: { name: 'Réseau', text: 'On commence à parler de toi au commissariat. Un flic payé, un greffier, un journaliste : ton réseau fait baisser la heat et le dossier fédéral.' },
  villes: { name: 'Villes', text: 'Ta famille compte : une deuxième ville est à ta portée. Un capo peut aller s’y implanter et la gouverner.' },
  commission: { name: 'Commission', text: 'Les Dons du pays parlent de toi. Toutes les quatre semaines, la Commission vote : achète des voix avant, ou subis.' },
  relations: { name: 'Cercle', text: 'La question de la succession se pose. Les anciens et les capos voteront pour l’héritier : soigne-les dès maintenant.' },
};

export function unlockDue(s: GameState, t: Gated): boolean {
  const tier = tierOf(s.respect);
  switch (t) {
    case 'rivaux': return s.week >= 3 || s.stats.battlesWon + s.stats.battlesLost > 0 || s.rivals.some((r) => r.war);
    case 'corruption': return s.heat >= 30 || (s.dossier ?? 0) >= 5 || tier >= 1 || s.judge || s.councilman || !!s.trial || activeContacts(s).length > 0;
    case 'villes': return tier >= 2 || openCities(s).length > 1;
    case 'commission': {
      const c = s.commission;
      return tier >= 3 || !!c?.seat || (!!c?.motion && c.motion.kind === 'ban_player' && c.next - s.week <= 3);
    }
    case 'relations': {
      const don = donOf(s);
      return !!s.circle && ((s.children ?? []).length > 0 || !!s.regency || (!!don && ageOf(s, don) >= 55));
    }
  }
}

export const isUnlocked = (s: GameState, t: string) => !GATED.includes(t as Gated) || (s.unlocked ?? {})[t] !== undefined;

/** Ouvre les onglets dont le moment est venu ; `quiet` n'annonce rien (anciennes sauvegardes) */
export function unlockTick(s: GameState, quiet = false): Gated[] {
  s.unlocked ??= {};
  const fresh: Gated[] = [];
  for (const t of GATED) {
    if (s.unlocked[t] !== undefined || !unlockDue(s, t)) continue;
    s.unlocked[t] = quiet ? -1 : s.week;
    if (!quiet) fresh.push(t);
  }
  return fresh;
}

/** Le joueur ouvre un onglet par un lien (la heat, le dossier…) : il est débloqué tout de suite */
export function unlockNow(s: GameState, t: string) {
  if (!GATED.includes(t as Gated)) return;
  s.unlocked ??= {};
  s.unlocked[t] ??= s.week;
}
export const isNew = (s: GameState, t: string) => isUnlocked(s, t) && GATED.includes(t as Gated) && (s.unlocked ?? {})[t]! >= 0 && !(s.seenTabs ?? []).includes(t);
export function markSeen(s: GameState, t: string) {
  if (!GATED.includes(t as Gated)) return;
  s.seenTabs ??= [];
  if (!s.seenTabs.includes(t)) s.seenTabs.push(t);
}
