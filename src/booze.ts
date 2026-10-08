// Contrebande d'alcool : achats, livraisons, revente, marché
import { ESCORTS, GOOD_ORDER, GOODS, PRICE_RESALE, PRICE_SMUGGLE, PRICE_WHOLESALER } from './data';
import { chance, clamp, fx, log, news, nextId, payAny, pendingCrates, pick, rand, stockTotal, storageCap } from './state';
import type { Escort, GameState, Good } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export function prices(s: GameState, g: Good) {
  const m = s.market[g];
  const base = GOODS[g].base;
  return {
    smuggle: Math.round(base * PRICE_SMUGGLE * m),
    wholesaler: Math.round(base * PRICE_WHOLESALER * m),
    resale: Math.round(base * PRICE_RESALE * m),
  };
}

export const freeRoom = (s: GameState) => storageCap(s) - stockTotal(s) - pendingCrates(s);

/** Risque d'interception d'une livraison de contrebande */
export function shipmentRisk(s: GameState, escort: Escort) {
  const base = 0.1 + s.heat / 300;
  return clamp(base * ESCORTS[escort].risk * (s.safeRouteWeeks > 0 ? 0.5 : 1), 0, 0.9);
}

/** Part de la cargaison perdue si elle est interceptée */
export const LOSS_IF_CAUGHT: Record<Escort, number> = { aucune: 1, legere: 0.6, forte: 0.35 };

export function smuggleCost(s: GameState, g: Good, qty: number, escort: Escort) {
  return prices(s, g).smuggle * qty + ESCORTS[escort].cost;
}

export function orderSmuggle(s: GameState, g: Good, qty: number, escort: Escort): Result {
  if (qty <= 0) return fail('Choisis une quantité.');
  if (qty > freeRoom(s)) return fail(`Pas assez de place : ${Math.max(0, freeRoom(s))} caisses libres (livraisons comprises).`);
  const cost = smuggleCost(s, g, qty, escort);
  if (!payAny(s, cost)) return fail(`Il faut ${fmt(cost)} (sale d'abord, puis propre).`);
  s.shipments.push({ id: nextId(s), good: g, qty, escort, paid: cost });
  log(s, 'money', `Commande de ${qty} caisses de ${GOODS[g].plural} par le lac (${fmt(cost)}). Livraison cette nuit.`);
  return ok;
}

export function cancelShipment(s: GameState, id: number): Result {
  const sh = s.shipments.find((x) => x.id === id);
  if (!sh) return fail('Commande introuvable.');
  s.dirty += sh.paid;
  s.shipments = s.shipments.filter((x) => x.id !== id);
  return ok;
}

export function buyWholesaler(s: GameState, g: Good, qty: number): Result {
  if (qty <= 0) return fail('Choisis une quantité.');
  if (qty > freeRoom(s)) return fail(`Pas assez de place : ${Math.max(0, freeRoom(s))} caisses libres.`);
  const cost = prices(s, g).wholesaler * qty;
  if (!payAny(s, cost)) return fail(`Il faut ${fmt(cost)} (sale d'abord, puis propre).`);
  s.stock[g] += qty;
  log(s, 'money', `${qty} caisses de ${GOODS[g].plural} achetées au grossiste (${fmt(cost)}).`);
  return ok;
}

export function sellResale(s: GameState, g: Good, qty: number): Result {
  qty = Math.min(qty, s.stock[g]);
  if (qty <= 0) return fail('Rien à vendre.');
  const gain = prices(s, g).resale * qty;
  s.stock[g] -= qty;
  s.dirty += gain;
  s.stats.cratesSold += qty;
  log(s, 'money', `${qty} caisses de ${GOODS[g].plural} revendues en gros (+${fmt(gain)}).`);
  return ok;
}

/** Arrivée des livraisons de la nuit */
export function resolveShipments(s: GameState) {
  const cap = storageCap(s);
  for (const sh of s.shipments) {
    const name = GOODS[sh.good].plural;
    let qty = sh.qty;
    if (chance(shipmentRisk(s, sh.escort))) {
      fx(s, 'intercept');
      const lost = Math.ceil(qty * LOSS_IF_CAUGHT[sh.escort]);
      qty -= lost;
      const living = s.rivals.filter((r) => r.alive && !r.alliance);
      if (living.length && chance(0.45)) {
        const r = pick(living);
        r.money += lost * GOODS[sh.good].base * 0.5;
        r.relation = clamp(r.relation - 5, -100, 100);
        log(s, 'bad', `${r.name} a tendu une embuscade à ton camion de ${name} : ${lost} caisses volées.`);
        news(s, 3, `Fusillade sur la route du lac`, `Un camion de ${name} détourné en pleine nuit. On murmure le nom de ${r.name}.`);
      } else {
        s.heat = clamp(s.heat + 4, 0, 100);
        log(s, 'police', `Les Prohis ont intercepté ton camion de ${name} : ${lost} caisses saisies (+4 heat).`);
        news(s, 3, `Saisie record des agents fédéraux`, `${lost} caisses de ${name} détruites à la hache devant les photographes.`);
      }
      if (sh.escort !== 'aucune' && qty > 0) log(s, 'neutral', `Ton escorte a sauvé ${qty} caisses.`);
    }
    if (qty > 0) {
      const room = Math.max(0, cap - stockTotal(s));
      const stored = Math.min(qty, room);
      fx(s, 'ship');
      s.stock[sh.good] += stored;
      log(s, 'money', `${stored} caisses de ${name} livrées à l'entrepôt.${stored < qty ? ` ${qty - stored} perdues faute de place.` : ''}`);
    }
  }
  s.shipments = [];
}

const SHOCKS: { good: Good; mult: number; title: string; sub: string }[] = [
  { good: 'whisky', mult: 1.45, title: 'Pénurie de whisky à Chicago', sub: 'Les gangs de Chicago paient des fortunes pour le canadien. Les prix flambent.' },
  { good: 'whisky', mult: 0.65, title: 'Arrivage massif de whisky canadien', sub: 'Des goélettes par dizaines sur le lac. Le whisky ne vaut plus rien cette semaine.' },
  { good: 'gin', mult: 1.4, title: 'Intoxications au gin frelaté', sub: 'Trois morts à Southside. Le gin « propre » s’arrache à prix d’or.' },
  { good: 'gin', mult: 0.7, title: 'Les baignoires tournent à plein', sub: 'Le gin de baignoire inonde la ville, les prix s’effondrent.' },
  { good: 'biere', mult: 1.5, title: 'Canicule sur New Corrano', sub: 'Trente-huit degrés à l’ombre. Tout le monde veut de la bière fraîche.' },
  { good: 'biere', mult: 0.7, title: 'Brasserie clandestine découverte à Milwaukee', sub: 'Des tonneaux bradés circulent partout.' },
];

/** Marché : marche aléatoire avec retour vers 1 et chocs occasionnels */
export function marketTick(s: GameState) {
  for (const g of GOOD_ORDER) {
    const m = s.market[g];
    s.marketTrend[g] = clamp(s.marketTrend[g] * 0.6 + (1 - m) * 0.15 + (rand() - 0.5) * 0.12, -0.25, 0.25);
    s.market[g] = clamp(m * (1 + s.marketTrend[g]), 0.55, 1.9);
  }
  if (chance(0.22)) {
    const sh = pick(SHOCKS);
    s.market[sh.good] = clamp(s.market[sh.good] * sh.mult, 0.55, 1.9);
    s.marketTrend[sh.good] = 0;
    log(s, 'money', `Marché : ${sh.title.toLowerCase()}.`);
    news(s, 3, sh.title, sh.sub);
  }
  if (s.safeRouteWeeks > 0) s.safeRouteWeeks--;
}
