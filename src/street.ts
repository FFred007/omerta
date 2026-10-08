// Vie de la rue : petites nouvelles cosmétiques qui font vivre la ville entre deux résolutions.
// Rien ici ne modifie l'état du jeu.
import { GOODS } from './data';
import { owned, pick } from './state';
import type { GameState } from './types';

type Line = (s: GameState) => string | null;

const anyDistrict = (s: GameState) => pick(s.districts);
const myDistrict = (s: GameState) => (owned(s).length ? pick(owned(s)) : null);
const anyRival = (s: GameState) => {
  const r = s.rivals.filter((x) => x.alive);
  return r.length ? pick(r) : null;
};

const LINES: Line[] = [
  (s) => { const d = myDistrict(s); const sh = d && pick(d.shops); return sh ? `${d!.name} : ${sh.owner}, le ${sh.trade}, salue tes hommes d'un signe de tête.` : null; },
  (s) => { const d = myDistrict(s); return d ? `${d.name} : un orchestre de jazz joue jusqu'à 3 heures dans ton speakeasy.` : null; },
  (s) => { const r = anyRival(s); return r ? `On a vu des hommes de ${r.name} recruter sur les quais.` : null; },
  (s) => { const r = anyRival(s); return r ? `${r.boss} dîne au Grand Hôtel avec un juge. Personne ne les a vus.` : null; },
  (s) => { const d = anyDistrict(s); return `${d.name} : une voiture de patrouille ralentit devant chaque bar.`; },
  (s) => { const d = anyDistrict(s); return `${d.name} : un banquier perd sa montre en or au poker.`; },
  (s) => { const g = pick(['biere', 'gin', 'whisky'] as const); return `Les buveurs réclament du ${GOODS[g].plural}. Le prix ${s.market[g] > 1.1 ? 'grimpe encore' : s.market[g] < 0.9 ? 'reste au plus bas' : 'tient bon'}.`; },
  (s) => { const d = myDistrict(s); return d && d.shops.some((x) => x.satisfaction < 35) ? `${d.name} : des commerçants murmurent contre le prix de ta protection.` : null; },
  (s) => (s.heat > 60 ? 'Des agents fédéraux en civil photographient les entrées de tes clubs.' : null),
  (s) => (s.heat < 25 ? 'Le commissariat est calme. Les flics jouent aux cartes.' : null),
  () => 'Le tramway de nuit déraille près de la gare. Trois caisses de gin tombent du dernier wagon.',
  () => 'Une chanteuse de Southside fait salle comble. Les tables se réservent en billets de 10.',
  () => 'La ligue de tempérance défile devant l’hôtel de ville, pancartes au vent.',
  () => 'Un boxeur de Southside s’entraîne au sous-sol de l’église polonaise.',
  () => 'Brouillard sur le lac. Les contrebandiers en profitent.',
  (s) => { const sp = s.shipments.length; return sp ? `Tes chauffeurs vérifient les camions : ${sp} livraison${sp > 1 ? 's' : ''} prévue${sp > 1 ? 's' : ''} cette nuit.` : null; },
  (s) => { const j = s.jobs.find((x) => x.team.length >= x.minMen); return j ? `Tes hommes repèrent les lieux pour « ${j.title} ».` : null; },
];

export function streetLine(s: GameState): string {
  for (let i = 0; i < 6; i++) {
    const line = pick(LINES)(s);
    if (line) return line;
  }
  return 'La ville dort, à moitié.';
}
