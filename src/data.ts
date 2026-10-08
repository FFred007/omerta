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

/** Paliers de puissance : le respect ouvre des villes, la Commission, la légitimité */
export interface Tier { min: number; name: string; cities: number; perk: string }
export const TIERS: Tier[] = [
  { min: 0, name: 'Petite bande', cities: 1, perk: 'Une seule ville' },
  { min: 15, name: 'Famille de quartier', cities: 1, perk: 'Le juge accepte de te recevoir' },
  { min: 35, name: 'Famille établie', cities: 2, perk: 'Une deuxième ville · le conseiller municipal te reçoit' },
  { min: 60, name: 'Grande famille', cities: 3, perk: 'Candidature à la Commission des Dons · une troisième ville' },
  { min: 100, name: 'Parrain', cities: 4, perk: 'Présidence de la Commission · toutes les villes · la légitimité' },
];
export const RANKS: [number, string][] = TIERS.map((t) => [t.min, t.name]);
export function tierOf(respect: number) {
  let i = 0;
  TIERS.forEach((t, k) => { if (respect >= t.min) i = k; });
  return i;
}
export function rankOf(respect: number) {
  return TIERS[tierOf(respect)].name;
}

export const LAUNDER_FEE = 0.15;
export const COP_BRIBE = 300; // propre / semaine
export const JUDGE_BRIBE = 800;
export const COUNCIL_BRIBE = 1200;
export const PROMOTE_COST = 1000;
export const DIRTY_STASH_LIMIT = 10000;

export type DistrictSeed = Omit<District, 'businesses' | 'bribedCop' | 'shops' | 'tariff'> & { businesses: BusinessKind[] };

// ---------- Villes ----------
export interface CityDef {
  id: string;
  name: string;
  kind: string; // « la ville du jeu »
  desc: string;
  perk: string;
  cols: number;
  openCost: number;
  gate?: string; // quartier d'arrivée
}
export const HOME_CITY = 'corrano';
export const CITIES: CityDef[] = [
  { id: 'corrano', name: 'New Corrano', kind: 'la ville natale', cols: 3, openCost: 0,
    desc: 'Aciéries, lac et speakeasies. Là où tout a commencé.', perk: 'Little Sicily : +6 de défense' },
  { id: 'halloran', name: 'Port Halloran', kind: 'le port', cols: 3, openCost: 6000, gate: 'h_phare',
    desc: 'Le rhum des Caraïbes et le whisky d’Écosse débarquent ici, sous la brume.', perk: 'Contrebande −15 % et livraisons moins risquées tant que tu y tiens un quartier' },
  { id: 'mirage', name: 'Mirage Springs', kind: 'la ville du jeu', cols: 3, openCost: 8000, gate: 'm_gare',
    desc: 'Une oasis de néons dans le désert. Le jeu y est presque légal.', perk: 'Tripots : revenus ×1,5 dans cette ville' },
  { id: 'washburn', name: 'Washburn', kind: 'la capitale', cols: 2, openCost: 10000, gate: 'w_gare',
    desc: 'Sénateurs, lobbyistes et agents fédéraux. Ici, on achète des lois.', perk: 'Chaque quartier tenu : dossier fédéral −1 par semaine' },
];
export const cityDef = (id: string | undefined) => CITIES.find((c) => c.id === (id ?? HOME_CITY)) ?? CITIES[0];


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
  // ----- Port Halloran (3 × 2) -----
  { id: 'h_quais', city: 'halloran', wealth: 0.95, name: 'Les Quais', row: 0, col: 0, owner: 'benedetto', racket: 800, police: 2, slots: 3, garrison: 0, businesses: ['speakeasy', 'entrepot'],
    flavor: 'Les cargos de La Havane déchargent la nuit. Les Benedetto comptent chaque caisse.' },
  { id: 'h_conserveries', city: 'halloran', wealth: 0.8, name: 'Les Conserveries', row: 0, col: 1, owner: 'benedetto', racket: 550, police: 1, slots: 3, garrison: 0, businesses: ['distillerie'],
    flavor: 'Odeur de sardine et d’alcool de contrebande. Les ouvrières ne posent pas de questions.' },
  { id: 'h_phare', city: 'halloran', gate: true, wealth: 0.9, name: 'Le Phare', row: 0, col: 2, owner: 'neutral', racket: 500, police: 1, slots: 3, garrison: 9, businesses: [],
    flavor: 'Un vieux gardien, une crique discrète : la porte d’entrée idéale pour une famille étrangère.' },
  { id: 'h_marche', city: 'halloran', wealth: 1.0, name: 'Le Marché aux poissons', row: 1, col: 0, owner: 'neutral', racket: 600, police: 2, slots: 3, garrison: 12, businesses: [],
    flavor: 'Les mareyeurs ont leur propre milice. Pour l’instant.' },
  { id: 'h_colline', city: 'halloran', wealth: 1.3, name: 'La Colline', row: 1, col: 1, owner: 'vasquez', racket: 850, police: 2, slots: 3, garrison: 0, businesses: ['tripot'],
    flavor: 'Les villas des armateurs. Les Vasquez y vendent le rhum le plus cher de la côte.' },
  { id: 'h_chantiers', city: 'halloran', wealth: 0.85, name: 'Les Chantiers navals', row: 1, col: 2, owner: 'vasquez', racket: 500, police: 1, slots: 3, garrison: 0, businesses: ['paris'],
    flavor: 'Des coques à moitié finies et des paris sur tout ce qui bouge.' },
  // ----- Mirage Springs (3 × 2) -----
  { id: 'm_strip', city: 'mirage', wealth: 1.5, name: 'Le Strip', row: 0, col: 0, owner: 'lazzaro', racket: 1100, police: 2, slots: 4, garrison: 0, businesses: ['tripot', 'restaurant'],
    flavor: 'Néons, roulettes et stars de cinéma. Les Lazzaro règnent sur le tapis vert.' },
  { id: 'm_oasis', city: 'mirage', wealth: 1.3, name: 'Oasis Club', row: 0, col: 1, owner: 'lazzaro', racket: 800, police: 1, slots: 3, garrison: 0, businesses: ['tripot'],
    flavor: 'Une piscine, un orchestre, et des tables où l’on perd sa fortune en souriant.' },
  { id: 'm_gare', city: 'mirage', gate: true, wealth: 1.0, name: 'Gare du Désert', row: 0, col: 2, owner: 'neutral', racket: 450, police: 1, slots: 3, garrison: 8, businesses: [],
    flavor: 'Le train de nuit dépose chaque soir des joueurs pleins d’espoir. Personne n’y tient encore la rue.' },
  { id: 'm_ranch', city: 'mirage', wealth: 0.9, name: 'Le Ranch', row: 1, col: 0, owner: 'neutral', racket: 400, police: 1, slots: 3, garrison: 11, businesses: [],
    flavor: 'Rodéos, combats de chiens et un shérif qui regarde ailleurs.' },
  { id: 'm_vieille', city: 'mirage', wealth: 1.0, name: 'La Vieille Ville', row: 1, col: 1, owner: 'sandoval', racket: 600, police: 1, slots: 3, garrison: 0, businesses: ['speakeasy'],
    flavor: 'Saloons poussiéreux et mezcal de contrebande. Le fief des Sandoval.' },
  { id: 'm_mines', city: 'mirage', wealth: 0.8, name: 'Les Mines d’argent', row: 1, col: 2, owner: 'sandoval', racket: 450, police: 1, slots: 3, garrison: 0, businesses: ['distillerie'],
    flavor: 'Les mineurs boivent dur. Les Sandoval leur vendent leur propre paie.' },
  // ----- Washburn (2 × 2) -----
  { id: 'w_gare', city: 'washburn', gate: true, wealth: 1.1, name: 'Union Station', row: 0, col: 0, owner: 'neutral', racket: 600, police: 2, slots: 3, garrison: 10, businesses: [],
    flavor: 'Lobbyistes, valises et enveloppes. Tout ce qui compte passe par ici.' },
  { id: 'w_capitole', city: 'washburn', wealth: 1.4, name: 'Le Capitole', row: 0, col: 1, owner: 'whitmore', racket: 1200, police: 3, slots: 3, garrison: 0, businesses: ['restaurant'],
    flavor: 'Les sénateurs boivent sec dans les clubs privés du Cercle Whitmore.' },
  { id: 'w_navy', city: 'washburn', wealth: 0.9, name: 'Navy Yard', row: 1, col: 0, owner: 'neutral', racket: 550, police: 2, slots: 3, garrison: 14, businesses: [],
    flavor: 'Marins en permission et contrats d’armement. Les dockers ont leur syndicat.' },
  { id: 'w_ambassades', city: 'washburn', wealth: 1.35, name: 'Les Ambassades', row: 1, col: 1, owner: 'whitmore', racket: 900, police: 2, slots: 3, garrison: 0, businesses: ['speakeasy'],
    flavor: 'Immunité diplomatique et valises scellées : le champagne français y coule à flots.' },
];

/** Quartiers supplémentaires : la carte générée en pioche une partie à chaque nouvelle partie */
export const EXTRA_SEEDS: DistrictSeed[] = [
  { id: 'chinatown', wealth: 0.95, name: 'Le Quartier chinois', row: 0, col: 0, owner: 'neutral', racket: 550, police: 1, slots: 3, garrison: 11, businesses: ['paris'],
    flavor: 'Fumeries, lanternes et tripots cachés derrière les blanchisseries. Les tongs paient qui les protège.' },
  { id: 'cathedrale', wealth: 1.15, name: 'Saint-Janvier', row: 0, col: 0, owner: 'neutral', racket: 650, police: 2, slots: 2, garrison: 12, businesses: ['restaurant'],
    flavor: 'La cathédrale, les processions, et les meilleures pâtisseries de la ville. Le curé sait tout.' },
  { id: 'acieries', wealth: 0.8, name: 'Les Aciéries', row: 0, col: 0, owner: 'neutral', racket: 500, police: 1, slots: 3, garrison: 10, businesses: ['speakeasy'],
    flavor: 'Hauts fourneaux et ouvriers assoiffés. La paie tombe le vendredi, les bars se remplissent le soir même.' },
  { id: 'h_douane', city: 'halloran', wealth: 1.05, name: 'La Douane', row: 0, col: 0, owner: 'neutral', racket: 650, police: 2, slots: 3, garrison: 12, businesses: ['entrepot'],
    flavor: 'Les douaniers sont mal payés. Les registres sont tenus au crayon.' },
  { id: 'h_criques', city: 'halloran', wealth: 0.85, name: 'Les Criques', row: 0, col: 0, owner: 'neutral', racket: 400, police: 1, slots: 3, garrison: 8, businesses: ['distillerie'],
    flavor: 'Des canots sans feux, des pêcheurs qui ne pêchent jamais rien.' },
  { id: 'm_motels', city: 'mirage', wealth: 0.95, name: 'Les Motels', row: 0, col: 0, owner: 'neutral', racket: 450, police: 1, slots: 3, garrison: 9, businesses: ['speakeasy'],
    flavor: 'Néons roses et chambres à l’heure. On y paie en jetons de casino.' },
  { id: 'm_barrage', city: 'mirage', wealth: 0.85, name: 'Le Barrage', row: 0, col: 0, owner: 'neutral', racket: 500, police: 1, slots: 3, garrison: 10, businesses: ['paris'],
    flavor: 'Cinq mille ouvriers coulent du béton dans le désert. Ils parient leur paie sur tout.' },
  { id: 'w_vieux', city: 'washburn', wealth: 1.0, name: 'Le Vieux Quartier', row: 0, col: 0, owner: 'neutral', racket: 550, police: 1, slots: 3, garrison: 10, businesses: ['speakeasy'],
    flavor: 'Pavés, tavernes et maisons de briques. Les sénateurs y viennent incognito.' },
  { id: 'w_universite', city: 'washburn', wealth: 1.2, name: 'L’Université', row: 0, col: 0, owner: 'neutral', racket: 600, police: 2, slots: 3, garrison: 11, businesses: [],
    flavor: 'Fils de bonne famille et clubs étudiants. Ils boivent comme des marins et paient comme des princes.' },
];

export const RIVAL_SEEDS: RivalFamily[] = [
  { id: 'castellano', name: 'Famille Castellano', boss: 'Don Aurelio Castellano', color: '#b33a3a',
    strength: 20, money: 6000, aggression: 0.35, truceWeeks: 0, alive: true, relation: -5, alliance: false, war: false, talkCooldown: 0, city: 'corrano', surname: 'Castellano' },
  { id: 'kilbride', name: 'Irlandais de Kilbride', boss: 'Seamus « le Rouquin » Kilbride', color: '#3f8f5a',
    strength: 13, money: 3000, aggression: 0.55, truceWeeks: 0, alive: true, relation: -25, alliance: false, war: false, talkCooldown: 0, city: 'corrano', surname: 'Kilbride' },
  { id: 'wolska', name: 'Clan Wolska', boss: 'Tadeusz Wolski', color: '#4a6fb3',
    strength: 15, money: 3500, aggression: 0.4, truceWeeks: 0, alive: true, relation: 5, alliance: false, war: false, talkCooldown: 0, city: 'corrano', surname: 'Wolska' },
  // Port Halloran
  { id: 'benedetto', name: 'Famille Benedetto', boss: 'Don Carmelo Benedetto', color: '#a8673a',
    strength: 17, money: 4500, aggression: 0.4, truceWeeks: 0, alive: true, relation: 0, alliance: false, war: false, talkCooldown: 0, city: 'halloran', surname: 'Benedetto', traits: ['riche'] },
  { id: 'vasquez', name: 'Frères Vasquez', boss: 'Ramón Vasquez', color: '#8a4f9e',
    strength: 13, money: 2500, aggression: 0.5, truceWeeks: 0, alive: true, relation: -5, alliance: false, war: false, talkCooldown: 0, city: 'halloran', surname: 'Vasquez', traits: ['sanguinaire'] },
  // Mirage Springs
  { id: 'lazzaro', name: 'Famille Lazzaro', boss: 'Don Enrico « le Croupier » Lazzaro', color: '#c08a2e',
    strength: 18, money: 7000, aggression: 0.35, truceWeeks: 0, alive: true, relation: 5, alliance: false, war: false, talkCooldown: 0, city: 'mirage', surname: 'Lazzaro', traits: ['riche', 'diplomate'] },
  { id: 'sandoval', name: 'Clan Sandoval', boss: 'Jack Sandoval', color: '#7a8a3a',
    strength: 14, money: 2500, aggression: 0.5, truceWeeks: 0, alive: true, relation: -10, alliance: false, war: false, talkCooldown: 0, city: 'mirage', surname: 'Sandoval', traits: ['rancunier'] },
  // Washburn
  { id: 'whitmore', name: 'Le Cercle Whitmore', boss: 'Sénateur Ambrose Whitmore', color: '#5f7f96',
    strength: 16, money: 9000, aggression: 0.25, truceWeeks: 0, alive: true, relation: 0, alliance: false, war: false, talkCooldown: 0, city: 'washburn', surname: 'Whitmore', traits: ['prudent', 'diplomate'] },
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
