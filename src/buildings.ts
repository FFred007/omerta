// Bâtiments : effets détaillés (niveaux, villes, spéciaux), améliorations et emplacements en plus.
import { BUSINESSES, DISTILLERY_GIN, SLOT_COST, SLOT_MAX, SPEAKEASY_DEMAND, UPGRADES } from './data';
import { cityOf } from './cities';
import type { Business, BusinessKind, District, GameState } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const MIRAGE_TRIPOT = 1.5;
export const lvl = (b: Business) => b.level ?? 1;

/** La famille possède au moins un bâtiment de ce type (dans une ville donnée si précisée) */
export function owns(s: GameState, kind: BusinessKind, city?: string) {
  return s.districts.some((d) => d.owner === 'player' && (!city || cityOf(d) === city) && d.businesses.some((b) => b.kind === kind));
}
export const countOwned = (s: GameState, kind: BusinessKind) =>
  s.districts.filter((d) => d.owner === 'player').reduce((t, d) => t + d.businesses.filter((b) => b.kind === kind).length, 0);

const capoIn = (s: GameState, d: District) => s.members.some((m) => m.status === 'actif' && m.assignment === d.id && m.rank === 'capo');
const satisfactionOf = (d: District) => (d.shops.length ? Math.round(d.shops.reduce((t, x) => t + x.satisfaction, 0) / d.shops.length) : 50);

/** Revenu fixe d'un bâtiment (sale si illégal, propre si légal), avant bonus de quartier */
export function bizIncome(s: GameState, d: District, b: Business): number {
  const def = BUSINESSES[b.kind];
  const up = lvl(b) >= 2;
  switch (b.kind) {
    case 'speakeasy': return up ? 300 : def.income;
    case 'tripot': return def.income * (cityOf(d) === 'mirage' ? MIRAGE_TRIPOT : 1) * (up && capoIn(s, d) ? 1.6 : 1);
    case 'paris': return up ? 700 : def.income;
    case 'restaurant': return up ? 500 : def.income;
    case 'hotel': return up ? 1100 : def.income;
    case 'casino': return up ? 4000 : def.income;
    case 'usurier': return def.income + satisfactionOf(d) * 8;
    default: return def.income;
  }
}
export function bizLaunder(b: Business) {
  const def = BUSINESSES[b.kind];
  if (lvl(b) < 2) return def.launder;
  return b.kind === 'blanchisserie' ? 1600 : b.kind === 'restaurant' ? 700 : b.kind === 'hotel' ? 700 : def.launder;
}
export function bizHeat(b: Business) {
  const def = BUSINESSES[b.kind];
  return def.heat + (lvl(b) >= 2 && (b.kind === 'speakeasy' || b.kind === 'casino') ? 1 : 0);
}
export const bizStorage = (b: Business) => BUSINESSES[b.kind].storage ?? 0;
export const speakDemand = (b: Business) => (lvl(b) >= 2 ? 30 : SPEAKEASY_DEMAND);
export const retailMult = (b: Business) => (b.kind === 'speakeasy' && lvl(b) >= 2 ? 1.15 : 1);
export const ginOf = (d: District, b: Business) => (lvl(b) >= 2 ? 45 : DISTILLERY_GIN) * (d.id === 'docks' ? 2 : 1);
export const bizName = (b: Business) => (lvl(b) >= 2 ? UPGRADES[b.kind]?.name ?? BUSINESSES[b.kind].name : BUSINESSES[b.kind].name);

/** Respect par semaine : hôtels, restaurants (+1 de plus s'ils sont gastronomiques) */
export function respectFromBuildings(s: GameState) {
  let n = 0;
  for (const d of s.districts) if (d.owner === 'player') for (const b of d.businesses) {
    if (b.kind === 'restaurant') n += lvl(b) >= 2 ? 2 : 1;
    if (b.kind === 'hotel') n += 1;
  }
  return n;
}

export function buildBlocker(s: GameState, d: District, kind: BusinessKind): string | null {
  const def = BUSINESSES[kind];
  if (d.owner !== 'player') return "Ce quartier n'est pas à toi.";
  if (def.city && cityOf(d) !== def.city) return `Uniquement dans ${def.city === 'halloran' ? 'Port Halloran' : def.city === 'mirage' ? 'Mirage Springs' : 'Washburn'}.`;
  if (def.minRespect && s.respect < def.minRespect) return `Il faut ${def.minRespect} de respect.`;
  if (def.city && countOwned(s, kind) >= 1) return `Un seul ${def.name.toLowerCase()} par famille.`;
  if (d.businesses.length >= d.slots) return 'Plus de place dans ce quartier.';
  if ((def.currency === 'dirty' ? s.dirty : s.clean) < def.cost) return `Pas assez d'argent ${def.currency === 'dirty' ? 'sale' : 'propre'}.`;
  return null;
}

export function upgrade(s: GameState, d: District, businessId: number): Result {
  const b = d.businesses.find((x) => x.id === businessId);
  if (!b || d.owner !== 'player') return fail('Impossible.');
  const up = UPGRADES[b.kind];
  if (!up) return fail('Ce bâtiment ne s’améliore pas.');
  if (lvl(b) >= 2) return fail('Déjà amélioré.');
  if ((up.currency === 'dirty' ? s.dirty : s.clean) < up.cost) return fail(`Il faut ${fmt(up.cost)} ${up.currency === 'dirty' ? 'sales' : 'propres'}.`);
  if (up.currency === 'dirty') s.dirty -= up.cost; else s.clean -= up.cost;
  b.level = 2;
  return ok;
}

export const slotCost = (d: District) => SLOT_COST[d.slots] ?? Infinity;
export function buySlot(s: GameState, d: District): Result {
  if (d.owner !== 'player') return fail("Ce quartier n'est pas à toi.");
  if (d.slots >= SLOT_MAX) return fail(`Maximum : ${SLOT_MAX} emplacements par quartier.`);
  const cost = slotCost(d);
  if (s.clean < cost) return fail(`Il faut ${fmt(cost)} propres (permis et enveloppes à la mairie).`);
  s.clean -= cost;
  d.slots += 1;
  return ok;
}

/** Valeur de revente : 40 % du bâtiment et de son amélioration */
export function resale(b: Business) {
  const def = BUSINESSES[b.kind];
  return Math.round(def.cost * 0.4 + (lvl(b) >= 2 ? (UPGRADES[b.kind]?.cost ?? 0) * 0.4 : 0));
}
