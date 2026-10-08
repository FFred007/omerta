import type { BusinessDef, BusinessKind, District, Good, RivalFamily, Tariff } from './types';

export const START_YEAR = 1925;

export const BUSINESSES: Record<BusinessKind, BusinessDef> = {
  speakeasy: {
    kind: 'speakeasy', name: 'Speakeasy', illegal: true, cost: 1500, currency: 'dirty',
    income: 180, launder: 0, heat: 2,
    desc: "Bar clandestin. Vend jusqu'à 18 caisses de ton stock par semaine, plus cher dans les beaux quartiers.",
  },
  tripot: {
    kind: 'tripot', name: 'Tripot', illegal: true, cost: 2500, currency: 'dirty',
    income: 820, launder: 0, heat: 3,
    desc: 'Salle de jeu clandestine. Gros revenus fixes, sert aussi 5 caisses de whisky par semaine.',
  },
  distillerie: {
    kind: 'distillerie', name: 'Distillerie', illegal: true, cost: 3000, currency: 'dirty',
    income: 0, launder: 0, heat: 3,
    desc: 'Produit 25 caisses de gin par semaine (50 aux Docks, grâce à l\'eau du port).',
  },
  paris: {
    kind: 'paris', name: 'Paris clandestins', illegal: true, cost: 1200, currency: 'dirty',
    income: 400, launder: 0, heat: 1,
    desc: 'Loterie des numéros. Discret, revenus modestes.',
  },
  blanchisserie: {
    kind: 'blanchisserie', name: 'Blanchisserie', illegal: false, cost: 2000, currency: 'clean',
    income: 0, launder: 900, heat: -1,
    desc: "Façade parfaite. Blanchit beaucoup d'argent sale chaque semaine.",
  },
  restaurant: {
    kind: 'restaurant', name: 'Restaurant', illegal: false, cost: 3000, currency: 'clean',
    income: 250, launder: 500, heat: -1,
    desc: 'Blanchit, rapporte un peu de propre et +1 respect / semaine.',
  },
  garage: {
    kind: 'garage', name: 'Garage', illegal: false, cost: 2500, currency: 'clean',
    income: 100, launder: 600, heat: 0,
    desc: 'Blanchit et sert de planque : +5 défense dans le quartier.',
  },
  entrepot: {
    kind: 'entrepot', name: 'Entrepôt', illegal: false, cost: 1800, currency: 'clean',
    income: 0, launder: 200, heat: 0, storage: 80,
    desc: '+80 caisses de stockage. Officiellement, des pièces détachées.',
  },
};

// ---------- Alcool ----------
export interface GoodDef { id: Good; name: string; plural: string; base: number; retail: number }
export const GOODS: Record<Good, GoodDef> = {
  biere: { id: 'biere', name: 'Bière', plural: 'bière', base: 20, retail: 36 },
  gin: { id: 'gin', name: 'Gin', plural: 'gin', base: 40, retail: 72 },
  whisky: { id: 'whisky', name: 'Whisky', plural: 'whisky', base: 80, retail: 135 },
};
export const GOOD_ORDER: Good[] = ['whisky', 'gin', 'biere']; // ordre de vente au comptoir
export const BASE_STORAGE = 60;
export const SPEAKEASY_DEMAND = 18;
export const TRIPOT_WHISKY = 5;
export const DISTILLERY_GIN = 25;
/** contrebande (livrée en fin de semaine, risquée) vs grossiste (immédiat, sûr) vs revente en gros */
export const PRICE_SMUGGLE = 0.6;
export const PRICE_WHOLESALER = 0.9;
export const PRICE_RESALE = 0.8;
export const ESCORTS = {
  aucune: { name: 'Sans escorte', cost: 0, risk: 1 },
  legere: { name: 'Escorte légère', cost: 150, risk: 0.5 },
  forte: { name: 'Escorte armée', cost: 450, risk: 0.2 },
} as const;

// ---------- Commerçants ----------
export const TARIFFS: Record<Tariff, { name: string; mult: number; drift: number }> = {
  bas: { name: 'Bas', mult: 0.7, drift: 5 },
  normal: { name: 'Normal', mult: 1, drift: 1 },
  eleve: { name: 'Élevé', mult: 1.35, drift: -5 },
};
export const SHOP_TRADES = [
  'boulanger', 'tailleur', 'barbier', 'épicier', 'bijoutier', 'cordonnier', 'boucher', 'fleuriste',
  'prêteur sur gages', 'garagiste', 'pharmacien', 'marchand de journaux', 'cafetier', 'fourreur',
];
export const SHOP_NAMES = [
  'Colombo', 'Abramowitz', "O'Hara", 'Kowalski', 'Benedetti', 'Schultz', 'Moreau', 'Papadakis',
  'Lindqvist', 'Novak', 'Delgado', 'Fitzgerald', 'Rossi', 'Weinberg', 'Kaminski', 'Lombardo', 'Brennan', 'Hartmann',
];

export const RANKS: [number, string][] = [
  [0, 'Petite bande'], [15, 'Famille de quartier'], [35, 'Famille établie'], [60, 'Grande famille'], [100, 'Capo dei Capi'],
];
export function rankOf(respect: number) {
  return [...RANKS].reverse().find(([min]) => respect >= min)![1];
}

export const LAUNDER_FEE = 0.15;
export const COP_BRIBE = 300; // propre / semaine
export const JUDGE_BRIBE = 800;
export const COUNCIL_BRIBE = 1200;
export const PROMOTE_COST = 1000;
export const DIRTY_STASH_LIMIT = 10000;

type DistrictSeed = Omit<District, 'businesses' | 'bribedCop' | 'shops' | 'tariff'> & { businesses: BusinessKind[] };

export const DISTRICT_SEEDS: DistrictSeed[] = [
  { id: 'lac', wealth: 1.35, name: 'Bord du Lac', row: 0, col: 0, owner: 'castellano', racket: 900, police: 2, slots: 3, garrison: 0, businesses: ['tripot'],
    flavor: 'Villas, yachts et dames en fourrure. Les Castellano y reçoivent les notables.' },
  { id: 'loop', wealth: 1.3, name: 'Le Loop', row: 0, col: 1, owner: 'castellano', racket: 1000, police: 3, slots: 4, garrison: 0, businesses: ['speakeasy', 'restaurant'],
    flavor: "Le cœur financier. Banques, théâtres, et un flic à chaque coin de rue." },
  { id: 'gare', wealth: 1.1, name: 'Gare Union', row: 0, col: 2, owner: 'neutral', racket: 650, police: 2, slots: 3, garrison: 13, businesses: [],
    flavor: 'Trains de nuit, voyageurs pressés, marchandises qui ne figurent sur aucun registre.' },
  { id: 'polonais', wealth: 0.95, name: 'Quartier Polonais', row: 1, col: 0, owner: 'wolska', racket: 500, police: 1, slots: 3, garrison: 0, businesses: ['distillerie'],
    flavor: 'Églises en brique et caves pleines de vodka. Le clan Wolska veille.' },
  { id: 'hdv', wealth: 1.2, name: 'Hôtel de Ville', row: 1, col: 1, owner: 'neutral', racket: 750, police: 3, slots: 2, garrison: 17, businesses: [],
    flavor: "Le siège du pouvoir. Qui tient ce quartier tient les élus." },
  { id: 'sicily', wealth: 1.0, name: 'Little Sicily', row: 1, col: 2, owner: 'player', racket: 600, police: 1, slots: 3, garrison: 0, businesses: ['speakeasy'],
    flavor: "Chez toi. Les vieux t'appellent encore « le neveu »." },
  { id: 'abattoirs', wealth: 0.85, name: 'Les Abattoirs', row: 2, col: 0, owner: 'wolska', racket: 400, police: 1, slots: 3, garrison: 0, businesses: ['paris'],
    flavor: "L'odeur du sang et de l'argent facile. Personne ne pose de questions ici." },
  { id: 'southside', wealth: 1.0, name: 'Southside', row: 2, col: 1, owner: 'neutral', racket: 450, police: 1, slots: 3, garrison: 10, businesses: [],
    flavor: "Clubs de jazz et petites frappes indépendantes. Mûr pour être organisé." },
  { id: 'docks', wealth: 0.9, name: 'Les Docks', row: 2, col: 2, owner: 'kilbride', racket: 700, police: 2, slots: 3, garrison: 0, businesses: ['speakeasy'],
    flavor: "Le whisky canadien arrive par ici. Les Irlandais de Kilbride tiennent les quais." },
];

export const RIVAL_SEEDS: RivalFamily[] = [
  { id: 'castellano', name: 'Famille Castellano', boss: 'Don Aurelio Castellano', color: '#b33a3a',
    strength: 20, money: 6000, aggression: 0.35, truceWeeks: 0, alive: true, relation: -5, alliance: false, war: false, talkCooldown: 0 },
  { id: 'kilbride', name: 'Irlandais de Kilbride', boss: 'Seamus « le Rouquin » Kilbride', color: '#3f8f5a',
    strength: 13, money: 3000, aggression: 0.55, truceWeeks: 0, alive: true, relation: -25, alliance: false, war: false, talkCooldown: 0 },
  { id: 'wolska', name: 'Clan Wolska', boss: 'Tadeusz Wolski', color: '#4a6fb3',
    strength: 15, money: 3500, aggression: 0.4, truceWeeks: 0, alive: true, relation: 5, alliance: false, war: false, talkCooldown: 0 },
];

export const FIRST_NAMES = [
  'Salvatore', 'Vincenzo', 'Tommaso', 'Carmine', 'Luca', 'Enzo', 'Paolo', 'Franco', 'Giuseppe',
  'Michele', 'Dino', 'Rocco', 'Angelo', 'Nicola', 'Benito', 'Aldo', 'Silvio', 'Gino', 'Mario', 'Pietro',
];
export const LAST_NAMES = [
  'Russo', 'Esposito', 'Greco', 'Lombardi', 'Marino', 'Conti', 'Ricci', 'Bruno', 'De Luca',
  'Rinaldi', 'Ferrara', 'Gallo', 'Mancuso', 'Caruso', 'Fontana', 'Serra', 'Vitale', 'Sorrento',
];
export const NICKNAMES = [
  'le Rasoir', 'Deux-Doigts', 'le Comptable', 'Gros Lou', 'le Muet', 'Belle Gueule', 'la Fouine',
  'le Boucher', 'Petit Jo', 'le Curé', 'Trois-Pièces', "l'Allumette", 'Mains Froides', 'le Docteur',
  'Bas-Résille', 'le Taiseux', 'Trompette', 'Cent Balles', 'le Chapelier', 'Œil-de-Verre',
];

export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function weekLabel(week: number, dayOffset = 0): string {
  const totalDays = (week - 1) * 7 + dayOffset;
  const year = START_YEAR + Math.floor(totalDays / 364);
  const dayOfYear = totalDays % 364;
  const month = Math.min(11, Math.floor(dayOfYear / 30.34));
  const day = Math.floor(dayOfYear - month * 30.34) + 1;
  return `${day} ${MONTHS[month]} ${year}`;
}

export const dayLabel = (week: number, day: number) => `${DAYS[day]} ${weekLabel(week, day)}`;
