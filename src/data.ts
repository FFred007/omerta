import type { BusinessDef, BusinessKind, District, RivalFamily } from './types';

export const START_YEAR = 1925;

export const BUSINESSES: Record<BusinessKind, BusinessDef> = {
  speakeasy: {
    kind: 'speakeasy', name: 'Speakeasy', illegal: true, cost: 1500, currency: 'dirty',
    income: 550, launder: 0, heat: 2,
    desc: "Bar clandestin. Rapporte bien, encore plus avec une distillerie dans la famille.",
  },
  tripot: {
    kind: 'tripot', name: 'Tripot', illegal: true, cost: 2500, currency: 'dirty',
    income: 850, launder: 0, heat: 3,
    desc: 'Salle de jeu clandestine. Gros revenus, attire la police.',
  },
  distillerie: {
    kind: 'distillerie', name: 'Distillerie', illegal: true, cost: 3000, currency: 'dirty',
    income: 350, launder: 0, heat: 3,
    desc: '+40 % de revenus pour tous tes speakeasies. Double rendement aux Docks.',
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
};

export const LAUNDER_FEE = 0.15;
export const COP_BRIBE = 300; // propre / semaine
export const JUDGE_BRIBE = 800;
export const COUNCIL_BRIBE = 1200;
export const PROMOTE_COST = 1000;
export const DIRTY_STASH_LIMIT = 10000;

type DistrictSeed = Omit<District, 'businesses' | 'bribedCop'> & { businesses: BusinessKind[] };

export const DISTRICT_SEEDS: DistrictSeed[] = [
  { id: 'lac', name: 'Bord du Lac', row: 0, col: 0, owner: 'castellano', racket: 900, police: 2, slots: 3, garrison: 0, businesses: ['tripot'],
    flavor: 'Villas, yachts et dames en fourrure. Les Castellano y reçoivent les notables.' },
  { id: 'loop', name: 'Le Loop', row: 0, col: 1, owner: 'castellano', racket: 1000, police: 3, slots: 4, garrison: 0, businesses: ['speakeasy', 'restaurant'],
    flavor: "Le cœur financier. Banques, théâtres, et un flic à chaque coin de rue." },
  { id: 'gare', name: 'Gare Union', row: 0, col: 2, owner: 'neutral', racket: 650, police: 2, slots: 3, garrison: 13, businesses: [],
    flavor: 'Trains de nuit, voyageurs pressés, marchandises qui ne figurent sur aucun registre.' },
  { id: 'polonais', name: 'Quartier Polonais', row: 1, col: 0, owner: 'wolska', racket: 500, police: 1, slots: 3, garrison: 0, businesses: ['distillerie'],
    flavor: 'Églises en brique et caves pleines de vodka. Le clan Wolska veille.' },
  { id: 'hdv', name: 'Hôtel de Ville', row: 1, col: 1, owner: 'neutral', racket: 750, police: 3, slots: 2, garrison: 17, businesses: [],
    flavor: "Le siège du pouvoir. Qui tient ce quartier tient les élus." },
  { id: 'sicily', name: 'Little Sicily', row: 1, col: 2, owner: 'player', racket: 600, police: 1, slots: 3, garrison: 0, businesses: ['speakeasy'],
    flavor: "Chez toi. Les vieux t'appellent encore « le neveu »." },
  { id: 'abattoirs', name: 'Les Abattoirs', row: 2, col: 0, owner: 'wolska', racket: 400, police: 1, slots: 3, garrison: 0, businesses: ['paris'],
    flavor: "L'odeur du sang et de l'argent facile. Personne ne pose de questions ici." },
  { id: 'southside', name: 'Southside', row: 2, col: 1, owner: 'neutral', racket: 450, police: 1, slots: 3, garrison: 10, businesses: [],
    flavor: "Clubs de jazz et petites frappes indépendantes. Mûr pour être organisé." },
  { id: 'docks', name: 'Les Docks', row: 2, col: 2, owner: 'kilbride', racket: 700, police: 2, slots: 3, garrison: 0, businesses: ['speakeasy'],
    flavor: "Le whisky canadien arrive par ici. Les Irlandais de Kilbride tiennent les quais." },
];

export const RIVAL_SEEDS: RivalFamily[] = [
  { id: 'castellano', name: 'Famille Castellano', boss: 'Don Aurelio Castellano', color: '#b33a3a',
    strength: 20, money: 6000, aggression: 0.35, truceWeeks: 0, alive: true },
  { id: 'kilbride', name: 'Irlandais de Kilbride', boss: 'Seamus « le Rouquin » Kilbride', color: '#3f8f5a',
    strength: 13, money: 3000, aggression: 0.55, truceWeeks: 0, alive: true },
  { id: 'wolska', name: 'Clan Wolska', boss: 'Tadeusz Wolski', color: '#4a6fb3',
    strength: 15, money: 3500, aggression: 0.4, truceWeeks: 0, alive: true },
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

export function weekLabel(week: number): string {
  const totalDays = (week - 1) * 7;
  const year = START_YEAR + Math.floor(totalDays / 364);
  const dayOfYear = totalDays % 364;
  const month = Math.min(11, Math.floor(dayOfYear / 30.34));
  const day = Math.floor(dayOfYear - month * 30.34) + 1;
  return `${day} ${MONTHS[month]} ${year}`;
}
