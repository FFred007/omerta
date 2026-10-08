// L'ascension : associé → homme d'honneur → capo → Don. Missions, confiance, politique de la famille, succession.
import { FIRST_NAMES, LAST_NAMES } from './data';
import { YEAR_WEEKS } from './don';
import { generateJobs } from './jobs';
import { initCommission } from './commission';
import { fillObjectives } from './objectives';
import {
  activeMembers, award, chance, clamp, district, log, makeMember, makeRecruit, news, newGame, nextId, owned, pick, randInt, roll, winChance,
} from './state';
import { has, type TraitId } from './traits';
import { cityOf } from './cities';
import { killMember } from './engine';
import { circleFromCareer } from './circle';
import type { Career, CareerRank, GameState, Member, Mission, MissionStat, Notable, PendingEvent } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const EMPLOYER_ID = 'famiglia';
export const EMPLOYER_NAME = 'Famille Moretti';
export const MAX_MISSIONS = 2;
export const CREW_MAX: Record<CareerRank, number> = { associe: 0, soldat: 2, capo: 10, don: 99 };

export const RANK_LABEL: Record<CareerRank, string> = { associe: 'Associé', soldat: 'Homme d’honneur', capo: 'Capo', don: 'Don' };
export const STAT_LABEL: Record<MissionStat, string> = { force: 'Poigne', discretion: 'Ombre', verbe: 'Verbe', flair: 'Flair' };

/** Conditions de promotion */
export const PROMOTION: Partial<Record<CareerRank, { trust: number; missions: number; week: number; next: CareerRank }>> = {
  associe: { trust: 60, missions: 7, week: 6, next: 'soldat' },
  soldat: { trust: 65, missions: 7, week: 13, next: 'capo' },
};

// ---------- Origines ----------
export interface OriginDef { id: string; name: string; nickname: string; desc: string; stats: { force: number; discretion: number; verbe: number; flair: number }; trait: TraitId; money: number }
export const ORIGINS: OriginDef[] = [
  { id: 'rues', name: 'Gamin des rues', nickname: 'le Gamin', desc: 'Tu as grandi entre les poubelles et les toits. Personne ne te voit passer.', stats: { force: 5, discretion: 8, verbe: 5, flair: 4 }, trait: 'fantome', money: 150 },
  { id: 'boucher', name: 'Fils de boucher', nickname: 'le Boucher', desc: 'Des épaules de bœuf et des mains qui n’ont peur de rien. La boutique de ton père paie la protection depuis toujours.', stats: { force: 8, discretion: 4, verbe: 5, flair: 5 }, trait: 'brute', money: 300 },
  { id: 'boxeur', name: 'Ex-boxeur', nickname: 'Gueule d’acier', desc: 'Trente combats, deux nez cassés, un combat truqué de trop. Les flics te connaissent.', stats: { force: 9, discretion: 4, verbe: 4, flair: 4 }, trait: 'roc', money: 200 },
  { id: 'comptable', name: 'Petit comptable', nickname: 'le Comptable', desc: 'Lunettes rondes et tête à chiffres. Tu sais où va l’argent, et comment le faire disparaître.', stats: { force: 4, discretion: 5, verbe: 6, flair: 8 }, trait: 'comptable', money: 400 },
  { id: 'docker', name: 'Fils de docker', nickname: 'le Docker', desc: 'Tu connais chaque quai, chaque grue et chaque contremaître du port. Et tu conduis comme un dieu.', stats: { force: 6, discretion: 5, verbe: 6, flair: 4 }, trait: 'chauffeur', money: 250 },
];
export const originDef = (id: string) => ORIGINS.find((o) => o.id === id) ?? ORIGINS[0];

export const career = (s: GameState) => s.career;
export const inCareer = (s: GameState) => !!s.career && s.career.rank !== 'don';
export const careerRank = (s: GameState): CareerRank => s.career?.rank ?? 'don';
export const rankAtLeast = (s: GameState, r: CareerRank) => {
  const order: CareerRank[] = ['associe', 'soldat', 'capo', 'don'];
  return order.indexOf(careerRank(s)) >= order.indexOf(r);
};
export const player = (s: GameState) => s.members.find((m) => m.isDon);
export const notable = (s: GameState, id: string) => s.career?.notables.find((n) => n.id === id);
export const theDon = (s: GameState) => s.career?.notables.find((n) => n.role === 'don');
export const favori = (s: GameState) => s.career?.notables.find((n) => n.favori);

// ---------- Création ----------
const NOTABLE_NICKS = ['le Sage', 'la Fouine', 'Doigts d’Or', 'le Taureau', 'l’Évêque', 'Bouche Cousue', 'le Dentiste', 'Belles Manières', 'le Gros', 'la Belette', 'Quatre-Saisons', 'le Pharmacien'];
export function makeNotable(role: Notable['role'], id: string, age: number, used: Set<string>, affinity: number): Notable {
  let name = '';
  const lasts = new Set([...used].map((n) => n.split(' ').slice(1).join(' ')));
  for (let i = 0; i < 40 && (!name || used.has(name) || lasts.has(name.split(' ').slice(1).join(' '))); i++) name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  used.add(name);
  const nick = pick(NOTABLE_NICKS.filter((n) => !used.has(n)));
  used.add(nick);
  return { id, role, name, nickname: nick, seed: randInt(1, 1e9), age, affinity, rivalPull: randInt(5, 25) };
}

export interface CareerOptions { first: string; last: string; origin: string; classic?: boolean }

export function startCareer(o: CareerOptions): GameState {
  const s = newGame(EMPLOYER_NAME, !!o.classic);
  const od = originDef(o.origin);
  // la famille Moretti : une famille de New Corrano qui emploie le joueur
  s.rivals.unshift({
    id: EMPLOYER_ID, name: EMPLOYER_NAME, boss: 'Don Calogero Moretti', color: '#a88a3c', strength: 18, money: 5000, aggression: 0.3,
    truceWeeks: 0, alive: true, relation: 100, alliance: true, war: false, talkCooldown: 0, city: 'corrano', surname: 'Moretti',
    traits: ['prudent'], wins: 0, lossesToPlayer: 0, employer: true,
  });
  const home = district(s, 'sicily');
  home.owner = EMPLOYER_ID;
  const second = s.districts.find((d) => cityOf(d) === 'corrano' && !d.gate && d.id !== home.id && Math.abs(d.row - home.row) + Math.abs(d.col - home.col) === 1 && d.owner !== 'neutral')
    ?? s.districts.find((d) => cityOf(d) === 'corrano' && d.id !== home.id && Math.abs(d.row - home.row) + Math.abs(d.col - home.col) === 1);
  if (second) { second.owner = EMPLOYER_ID; second.garrison = 0; if (!second.businesses.length) second.businesses.push({ id: nextId(s), kind: 'paris' }); }
  // le joueur, seul
  s.members = [];
  const p: Member = makeMember(s, {
    name: `${o.first} ${o.last}`.trim(), nickname: od.nickname, rank: 'soldat',
    force: od.stats.force, discretion: od.stats.discretion, loyalty: 100, salary: 0, assignment: null,
    traits: [od.trait],
  });
  Object.assign(p, { isDon: true, verbe: od.stats.verbe, flair: od.stats.flair, talents: [], points: 0, sex: 'm', birthWeek: 1 - 22 * YEAR_WEEKS, scars: od.id === 'boxeur' ? 1 : 0, seed: randInt(1, 1e9) });
  s.members.push(p);
  s.recruits = [];
  s.dirty = od.money;
  s.clean = 100;
  s.respect = 0;
  s.heat = 5;
  s.stock = { biere: 0, gin: 0, whisky: 0 };
  s.log = [];
  const used = new Set<string>();
  const notables: Notable[] = [
    { ...makeNotable('don', 'don', 66, used, 10), name: 'Calogero Moretti', nickname: 'Don Calò' },
    makeNotable('consigliere', 'consigliere', 58, used, 0),
    { ...makeNotable('capo', 'mentor', 45, used, 25), nickname: 'le Parrain de quartier' },
    { ...makeNotable('capo', 'capo2', 41, used, -5), favori: true },
    makeNotable('capo', 'capo3', 38, used, 0),
    makeNotable('ancien', 'ancien1', 71, used, 5),
    makeNotable('ancien', 'ancien2', 69, used, 0),
  ];
  const c: Career = {
    rank: 'associe', origin: od.id, employer: EMPLOYER_ID, trust: 25, missionsDone: 0, missionsTotal: 0, rankWeek: 1,
    missions: [], kickup: 0.3, notables, donHealth: 80, history: [],
  };
  s.career = c;
  s.commission = initCommission(s);
  s.objectives = [];
  log(s, 'neutral', `${p.name} « ${p.nickname} » se présente chez ${mentorName(s)}, capo de la ${EMPLOYER_NAME}. Il faudra faire ses preuves.`);
  generateJobs(s);
  generateMissions(s);
  return s;
}

const mentorName = (s: GameState) => { const m = notable(s, 'mentor'); return m ? `${m.name} « ${m.nickname} »` : 'ton capo'; };
const giverFor = (s: GameState) => {
  const r = careerRank(s);
  if (r === 'associe') return notable(s, 'mentor')?.name ?? 'Ton capo';
  if (r === 'soldat') return pick([notable(s, 'mentor')?.name ?? 'Ton capo', notable(s, 'consigliere')?.name ?? 'Le consigliere']);
  return theDon(s)?.name ? `Don ${theDon(s)!.name.split(' ')[0]}` : 'Le Don';
};

// ---------- Missions ----------
type MT = { key: string; tier: number; stat: MissionStat; diff: number; dirty: [number, number]; trust: number; respect?: number; failTrust: number; failHeat: number; danger: number; title: string; text: string; crew?: boolean };
const MISSIONS: MT[] = [
  { key: 'dette', tier: 0, stat: 'force', diff: 6, dirty: [200, 350], trust: 8, failTrust: 3, failHeat: 2, danger: 0.25, title: 'Récupérer une dette', text: 'Un cordonnier doit 600 $ à la famille depuis trois semaines. Fais-lui comprendre que c’est la dernière.' },
  { key: 'livraison', tier: 0, stat: 'discretion', diff: 6, dirty: [180, 300], trust: 7, failTrust: 3, failHeat: 3, danger: 0.3, title: 'Livrer une cargaison', text: 'Dix caisses de gin à déposer derrière l’église polonaise, avant l’aube, sans croiser de patrouille.' },
  { key: 'message', tier: 0, stat: 'verbe', diff: 6, dirty: [100, 200], trust: 9, failTrust: 3, failHeat: 0, danger: 0.1, title: 'Porter un message', text: 'Le Don veut faire savoir quelque chose à une famille voisine. Les mots exacts comptent.' },
  { key: 'commercant', tier: 0, stat: 'verbe', diff: 7, dirty: [200, 300], trust: 8, failTrust: 3, failHeat: 1, danger: 0.1, title: 'Convaincre un commerçant', text: 'Le nouveau fleuriste refuse de payer la protection. Explique-lui, poliment, les risques d’incendie.' },
  { key: 'guet', tier: 0, stat: 'discretion', diff: 5, dirty: [120, 220], trust: 6, failTrust: 3, failHeat: 2, danger: 0.2, title: 'Faire le guet', text: 'Pendant qu’on vide une cave, tu surveilles la rue. Un sifflement si un uniforme approche.' },
  { key: 'paris', tier: 0, stat: 'flair', diff: 6, dirty: [220, 360], trust: 7, failTrust: 3, failHeat: 0, danger: 0, title: 'Tenir les comptes des paris', text: 'Le bookmaker du quartier s’est fait la malle. Quelqu’un doit tenir les cotes ce week-end.' },
  { key: 'camion', tier: 0, stat: 'force', diff: 8, dirty: [350, 550], trust: 9, failTrust: 3, failHeat: 4, danger: 0.4, title: 'Détourner un camion', text: 'Un camion de bière d’une famille rivale passe par la route du lac jeudi. Le chauffeur n’est pas armé.', crew: true },
  { key: 'protection', tier: 1, stat: 'force', diff: 8, dirty: [500, 800], trust: 9, failTrust: 4, failHeat: 4, danger: 0.4, title: 'Protéger une réunion', text: 'Le Don reçoit un émissaire au restaurant. Toi et tes hommes à la porte, l’œil ouvert.', crew: true },
  { key: 'juge', tier: 1, stat: 'verbe', diff: 7, dirty: [400, 600], trust: 9, failTrust: 4, failHeat: 3, danger: 0.15, title: 'Remettre une enveloppe à un juge', text: 'Un juge doit relâcher le neveu du consigliere. Il faut le convaincre sans l’effrayer.' },
  { key: 'entrepot', tier: 1, stat: 'discretion', diff: 9, dirty: [700, 1100], trust: 9, failTrust: 4, failHeat: 5, danger: 0.45, title: 'Cambrioler un entrepôt', text: 'Un entrepôt de la douane regorge de whisky saisi. La relève de la garde a lieu à 3 heures.', crew: true },
  { key: 'comptes', tier: 1, stat: 'flair', diff: 8, dirty: [600, 900], trust: 9, failTrust: 4, failHeat: 1, danger: 0.05, title: 'Faire parler les livres de comptes', text: 'Les comptes du tripot ne tombent pas juste. Le Don veut savoir qui se sert, et combien.' },
  { key: 'traitre', tier: 1, stat: 'discretion', diff: 9, dirty: [500, 800], trust: 10, failTrust: 4, failHeat: 3, danger: 0.35, title: 'Retrouver un traître', text: 'Quelqu’un parle aux fédéraux. Suis les hommes du mentor, discrètement, et trouve le bavard.', crew: true },
  { key: 'independant', tier: 1, stat: 'force', diff: 10, dirty: [800, 1200], trust: 10, respect: 2, failTrust: 4, failHeat: 6, danger: 0.5, title: 'Mettre au pas un indépendant', text: 'Un petit caïd de Southside ouvre des tripots sans payer la famille. Il faut un exemple.', crew: true },
  { key: 'negociation', tier: 2, stat: 'verbe', diff: 11, dirty: [1000, 1500], trust: 10, respect: 3, failTrust: 5, failHeat: 2, danger: 0.15, title: 'Négocier avec une famille rivale', text: 'Le Don t’envoie à la table d’un rival pour partager une route de contrebande. Ne reviens pas les mains vides.' },
  { key: 'chargement', tier: 2, stat: 'flair', diff: 10, dirty: [1200, 1800], trust: 9, failTrust: 5, failHeat: 3, danger: 0.1, title: 'Superviser un chargement', text: 'Trois cents caisses canadiennes à répartir entre les bars de la famille. Une erreur, et quelqu’un se sert.' },
  { key: 'exemple', tier: 2, stat: 'force', diff: 12, dirty: [1000, 1600], trust: 10, respect: 3, failTrust: 5, failHeat: 7, danger: 0.5, title: 'Faire un exemple', text: 'Un capo d’une autre famille a giflé un commerçant de chez nous. Le Don veut que toute la ville l’apprenne.', crew: true },
  { key: 'fuite', tier: 2, stat: 'discretion', diff: 11, dirty: [900, 1400], trust: 10, failTrust: 5, failHeat: 4, danger: 0.35, title: 'Trouver la fuite', text: 'Les Prohis savaient pour la dernière livraison. Quelqu’un, très haut, a parlé.', crew: true },
];

const tierOf = (s: GameState) => ({ associe: 0, soldat: 1, capo: 2, don: 2 } as const)[careerRank(s)];

export function generateMissions(s: GameState) {
  const c = s.career;
  if (!c || c.rank === 'don') return;
  const tier = tierOf(s);
  const pool = MISSIONS.filter((m) => m.tier === tier || (m.tier === tier - 1 && Math.random() < 0.3));
  const n = c.rank === 'capo' ? 2 : 3;
  const picks: MT[] = [];
  while (picks.length < n && picks.length < pool.length) {
    const t = pick(pool);
    if (!picks.includes(t)) picks.push(t);
  }
  const scale = 1 + Math.min(0.15, (s.week - c.rankWeek) * 0.01);
  const rivals = s.rivals.filter((r) => r.alive && !r.employer && (r.city ?? 'corrano') === 'corrano');
  c.missions = picks.map((t) => ({
    id: nextId(s), key: t.key, title: t.title, text: t.text, giver: giverFor(s), stat: t.stat,
    difficulty: Math.round(t.diff * scale), reward: { dirty: Math.round(randInt(t.dirty[0], t.dirty[1]) / 10) * 10, trust: t.trust, respect: t.respect },
    failTrust: t.failTrust, failHeat: t.failHeat, danger: t.danger, accepted: false, crew: [], skim: false,
    rivalId: t.key === 'camion' || t.key === 'message' || t.key === 'negociation' ? pick(rivals)?.id : undefined,
  }));
}

export const missionCrewAllowed = (m: Mission) => m.stat === 'force' || m.stat === 'discretion';
const statOf = (m: Member, st: MissionStat) => (st === 'force' ? m.force : st === 'discretion' ? m.discretion : st === 'verbe' ? (m.verbe ?? 5) : (m.flair ?? 5));
function traitBonus(m: Member, st: MissionStat) {
  if (st === 'force') return has(m, 'brute') ? 2 : 0;
  if (st === 'discretion') return (has(m, 'sangfroid') ? 2 : 0) + (has(m, 'fantome') ? 1 : 0) - (has(m, 'ivrogne') ? 2 : 0);
  if (st === 'verbe') return (has(m, 'negociateur') ? 2 : 0) + (has(m, 'beauparleur') ? 1 : 0);
  return has(m, 'comptable') ? 2 : 0;
}
/** Compétence pour une mission : le joueur, plus la moitié de la stat de ses hommes (force et discrétion) */
export function missionSkill(s: GameState, ms: Mission, crew = ms.crew) {
  const p = player(s);
  if (!p) return 0;
  let k = statOf(p, ms.stat) + traitBonus(p, ms.stat);
  if (missionCrewAllowed(ms)) for (const id of crew) {
    const m = s.members.find((x) => x.id === id && x.status === 'actif');
    if (m) k += Math.round(statOf(m, ms.stat) / 2);
  }
  return k;
}
export const missionChance = (s: GameState, ms: Mission) => winChance(missionSkill(s, ms), ms.difficulty);
/** Risque d'être découvert si on se sert dans la caisse */
export const skimRisk = (s: GameState) => clamp(0.45 - ((player(s)?.discretion ?? 5) - 5) * 0.05, 0.05, 0.8);
export const SKIM_BONUS = 0.6;

export function toggleMission(s: GameState, id: number): Result {
  const c = s.career;
  const m = c?.missions.find((x) => x.id === id);
  if (!c || !m) return fail('Mission introuvable.');
  const p = player(s);
  if (!p || p.status !== 'actif') return fail('Tu n’es pas en état.');
  if (!m.accepted && c.missions.filter((x) => x.accepted).length >= MAX_MISSIONS) return fail(`Tu ne peux mener que ${MAX_MISSIONS} missions par semaine.`);
  m.accepted = !m.accepted;
  if (!m.accepted) { m.crew = []; m.skim = false; }
  return ok;
}
export function toggleMissionCrew(s: GameState, id: number, memberId: number): Result {
  const m = s.career?.missions.find((x) => x.id === id);
  if (!m) return fail('Mission introuvable.');
  if (!missionCrewAllowed(m)) return fail('Cette mission se fait seul.');
  if (!m.accepted) return fail('Accepte d’abord la mission.');
  const busy = s.career!.missions.some((x) => x.id !== id && x.crew.includes(memberId));
  if (busy) return fail('Cet homme est déjà sur une autre mission.');
  m.crew = m.crew.includes(memberId) ? m.crew.filter((x) => x !== memberId) : [...m.crew, memberId];
  return ok;
}
export function toggleSkim(s: GameState, id: number): Result {
  const m = s.career?.missions.find((x) => x.id === id);
  if (!m || !m.accepted) return fail('Accepte d’abord la mission.');
  m.skim = !m.skim;
  return ok;
}
export function setKickup(s: GameState, rate: number): Result {
  if (!s.career) return fail('Impossible.');
  s.career.kickup = rate;
  return ok;
}

function addTrust(s: GameState, n: number) {
  if (!s.career) return;
  s.career.trust = clamp(s.career.trust + n, 0, 100);
}
const hist = (s: GameState, text: string) => s.career?.history.unshift({ week: s.week, text });

function resolveMissions(s: GameState) {
  const c = s.career!;
  const p = player(s);
  for (const m of c.missions) {
    if (!m.accepted) {
      if (p && p.status === 'actif') addTrust(s, -1);
      continue;
    }
    if (!p || p.status !== 'actif') continue;
    const skill = missionSkill(s, m);
    const odds = Math.round(winChance(skill, m.difficulty) * 100);
    const a = skill * roll();
    const b = m.difficulty * roll();
    const crew = s.members.filter((x) => m.crew.includes(x.id) && x.status === 'actif');
    if (a > b) {
      c.missionsDone++;
      c.missionsTotal++;
      let gain = m.reward.dirty;
      let skimmed = false;
      if (m.skim) {
        if (chance(skimRisk(s))) {
          gain = 0;
          addTrust(s, -20);
          notable(s, 'mentor')!.affinity = clamp(notable(s, 'mentor')!.affinity - 15, -100, 100);
          log(s, 'bad', `« ${m.title} » réussie, mais ${mentorName(s)} a vu que tu te servais : il garde tout et la confiance du Don s’effondre (−20).`);
          continue;
        }
        gain = Math.round(gain * (1 + SKIM_BONUS));
        skimmed = true;
      }
      s.dirty += gain;
      addTrust(s, m.reward.trust);
      const mentor = notable(s, 'mentor');
      if (mentor) mentor.affinity = clamp(mentor.affinity + 2, -100, 100);
      if (m.reward.respect) s.respect = clamp(s.respect + m.reward.respect, 0, 150);
      award(s, p, m.difficulty >= 12 ? 4 : 3, m.stat === 'discretion' ? 'discretion' : 'force');
      crew.forEach((x) => award(s, x, 2, m.stat === 'discretion' ? 'discretion' : 'force'));
      const r = m.rivalId ? s.rivals.find((x) => x.id === m.rivalId) : undefined;
      if (r && m.key === 'camion') r.relation = clamp(r.relation - 8, -100, 100);
      if (r && (m.key === 'message' || m.key === 'negociation')) r.relation = clamp(r.relation + 6, -100, 100);
      log(s, 'good', `Mission réussie : ${m.title} (${odds} %). +${fmt(gain)}${skimmed ? ' dont ta part cachée' : ''}, confiance +${m.reward.trust}.`);
    } else {
      addTrust(s, -m.failTrust);
      s.heat = clamp(s.heat + m.failHeat, 0, 100);
      award(s, p, 1, m.stat === 'discretion' ? 'discretion' : 'force');
      log(s, 'bad', `Mission ratée : ${m.title} (${odds} %). Confiance −${m.failTrust}${m.failHeat ? `, +${m.failHeat} heat` : ''}.`);
      for (const x of [p, ...crew]) {
        if (Math.random() > m.danger) continue;
        if (m.stat === 'force' && chance(0.6)) { x.status = 'blessé'; x.statusWeeks = randInt(1, 3); log(s, 'bad', `${x.isDon ? 'Tu es blessé' : `${x.nickname} est blessé`} (${x.statusWeeks} sem.).`); }
        else if (chance(0.5)) { x.status = 'prison'; x.statusWeeks = randInt(1, 3); if (s.judge) x.statusWeeks = Math.ceil(x.statusWeeks / 2); log(s, 'police', `${x.isDon ? 'Tu passes' : `${x.nickname} passe`} ${x.statusWeeks} semaine${x.statusWeeks > 1 ? 's' : ''} au poste.`); }
      }
    }
  }
  c.missions = [];
}

// ---------- La semaine ----------
export function careerTick(s: GameState) {
  const c = s.career;
  if (!c || c.rank === 'don') return;
  resolveMissions(s);
  resolvePlot(s);
  if (s.career!.rank === 'don' || s.status !== 'playing') return;
  // le capo verse son tribut : la confiance suit
  if (c.rank === 'capo' && owned(s).length) addTrust(s, c.kickup >= 0.4 ? 2 : c.kickup >= 0.3 ? 1 : -2);
  if (c.rank === 'capo' && !owned(s).length) {
    c.rank = 'soldat';
    c.rankWeek = s.week;
    addTrust(s, -20);
    log(s, 'bad', 'Tu as perdu ton quartier. Le Don te retire tes galons de capo.');
  }
  // le Don vieillit ; il s'accroche tant que le joueur n'est pas capo
  if (s.week >= 8) {
    c.donHealth = clamp(c.donHealth - randInt(2, 6), c.rank === 'capo' && s.week - c.rankWeek >= 4 ? 0 : 15, 100);
    if (c.donHealth <= 30 && !c.dying) {
      c.dying = true;
      log(s, 'bad', `Le Don ${theDon(s)?.name} est au plus mal. Dans la famille, on commence à compter les voix.`);
      news(s, 3, 'Le patriarche de Little Sicily à l’hôpital', 'Les médecins restent prudents. Les fleuristes, eux, commandent déjà.');
    }
  }
  // gendre du Don : toute la famille t'ouvre ses portes
  if (s.spouse?.rivalId === EMPLOYER_ID && !c.history.some((h) => h.text === 'gendre')) {
    c.history.unshift({ week: s.week, text: 'gendre' });
    addTrust(s, 15);
    c.notables.forEach((n) => { if (!n.favori) n.affinity = clamp(n.affinity + 15, -100, 100); });
    log(s, 'good', 'Tu as épousé la fille du Don : confiance +15, et toute la famille te regarde autrement (+15 d’affinité).');
  }
  if (s.pendingEvent || s.status !== 'playing') return;
  informantCheck(s);
  if (s.pendingEvent) return;
  if (c.donHealth <= 0) { s.pendingEvent = successionEvent(s); return; }
  // promotions
  const pr = PROMOTION[c.rank];
  if (pr && c.trust >= pr.trust && c.missionsDone >= pr.missions && s.week >= pr.week) {
    s.pendingEvent = c.rank === 'associe' ? baptismEvent(s) : capoEvent(s);
    return;
  }
  // dilemmes et politique
  if (chance(0.18)) {
    const e = careerEvent(s);
    if (e) s.pendingEvent = e;
  }
}

// ---------- Les événements ----------
function baptismEvent(s: GameState): PendingEvent {
  return {
    key: 'ca_bapteme', title: 'Le baptême',
    text: `Une cave sous le restaurant. Une bougie, un couteau, une image de saint qui brûle dans tes mains. ${theDon(s)?.name} te regarde : « Tu entres vivant, tu ne sortiras que mort. » Tu deviens un homme d'honneur de la ${EMPLOYER_NAME}.`,
    choices: [{ label: 'Prêter serment', hint: 'Homme d’honneur : tu peux recruter 2 hommes, missions plus grosses, +5 respect', effect: 'ca_bapteme' }],
  };
}
function capoEvent(s: GameState): PendingEvent {
  const home = s.districts.find((d) => d.owner === EMPLOYER_ID && d.id === 'sicily') ?? s.districts.find((d) => d.owner === EMPLOYER_ID);
  return {
    key: 'ca_capo', title: 'Le Don te confie un quartier',
    text: `${theDon(s)?.name} pose sa main sur ton épaule. « ${home?.name ?? 'Ce quartier'} est à toi. Tu le tiens, tu le fais prospérer, et tu me verses ma part chaque semaine. » Tu deviens capo.`,
    data: { district: home?.id ?? '' },
    choices: [{ label: 'Baiser la bague', hint: `Capo : ${home?.name ?? 'un quartier'}, son commerce, ton équipe ; tribut au Don chaque semaine`, effect: 'ca_capo' }],
  };
}

function careerEvent(s: GameState): PendingEvent | null {
  const c = s.career!;
  const p = player(s);
  if (!p) return null;
  const pool: (() => PendingEvent | null)[] = [
    () => ({
      key: 'ca_ami', title: 'Un ami d’enfance',
      text: `${mentorName(s)} t'ordonne de « corriger » Nino, ton ami d'enfance, qui a manqué de respect à la famille. Nino t'attend au bar, sans se douter de rien.`,
      choices: [
        { label: 'Obéir', hint: 'Confiance +8, tu perds un ami (et un peu de toi)', effect: 'ca_ami_obey' },
        { label: 'Le prévenir de fuir', hint: 'Confiance −6 si le capo l’apprend (40 %), +1 faveur', effect: 'ca_ami_warn' },
        { label: 'Refuser en face', hint: 'Confiance −10, +3 respect dans la rue', effect: 'ca_ami_refuse' },
      ],
    }),
    () => (s.heat >= 15 || (s.dossier ?? 0) >= 15 ? {
      key: 'ca_indic', title: 'Un flic te propose un marché',
      text: 'Un inspecteur t’arrête en sortant du tripot. « Tu me donnes des noms, ton dossier disparaît. Personne n’en saura rien. »',
      choices: [
        { label: 'Accepter, donner des noms', hint: 'Dossier −20, heat −10 · 3 % par semaine d’être démasqué pendant 25 semaines', effect: 'ca_indic_yes' },
        { label: 'Refuser', hint: 'Rien', effect: 'none' },
        { label: 'Le dénoncer au capo', hint: 'Confiance +6, +2 heat', effect: 'ca_indic_report' },
      ],
    } : null),
    () => ({
      key: 'ca_veuve', title: 'La veuve du tailleur',
      text: 'La veuve du tailleur ne peut plus payer la protection. Elle te supplie, ses enfants accrochés à sa jupe.',
      choices: [
        { label: 'Payer à sa place', hint: '−200 sale, +4 respect, +1 faveur', effect: 'ca_veuve_pay', disabled: s.dirty < 200 },
        { label: 'Exiger l’argent', hint: '+200 sale, confiance +2, −2 respect', effect: 'ca_veuve_take' },
      ],
    }),
    () => {
      const enemy = c.notables.filter((n) => n.role === 'capo' && n.affinity < 0)[0];
      if (!enemy || c.rank === 'associe') return null;
      return {
        key: 'ca_piege', title: `${enemy.name} te tend un piège`,
        text: `On murmure que ${enemy.name} « ${enemy.nickname} » raconte au Don que tu te sers dans la caisse. C'est faux, mais il est convaincant.`,
        data: { n: enemy.id },
        choices: [
          { label: 'Te justifier devant le Don', hint: `Verbe : ${Math.round(clamp(0.3 + ((p.verbe ?? 5) - 5) * 0.08, 0.1, 0.9) * 100)} % · sinon confiance −12`, effect: 'ca_piege_talk' },
          { label: 'Acheter son silence', hint: '−1 000 sale · son affinité +15', effect: 'ca_piege_pay', disabled: s.dirty < 1000 },
          { label: 'Laisser dire', hint: 'Confiance −8', effect: 'ca_piege_ignore' },
        ],
      };
    },
    () => (c.rank !== 'associe' ? {
      key: 'ca_service', title: 'Un service pour le consigliere',
      text: `${notable(s, 'consigliere')?.name}, le consigliere, a besoin qu'on récupère discrètement des lettres compromettantes chez sa maîtresse.`,
      choices: [
        { label: 'Rendre le service', hint: `Ombre : ${Math.round(clamp(0.35 + (p.discretion - 5) * 0.07, 0.1, 0.9) * 100)} % · consigliere +20, sinon −10 et +4 heat`, effect: 'ca_service' },
        { label: 'Décliner poliment', hint: 'Consigliere −5', effect: 'ca_service_no' },
      ],
    } : null),
  ];
  const opts = pool.map((f) => f()).filter((x): x is PendingEvent => !!x);
  return opts.length ? pick(opts) : null;
}

/** Démasqué en indic ? */
function informantCheck(s: GameState) {
  const since = s.career?.history.find((h) => h.text === 'indic');
  if (!s.career || !since || s.week - since.week > 25) return;
  if (chance(0.03)) {
    const p = player(s);
    if (!p) return;
    log(s, 'bad', 'La famille a découvert que tu parlais aux flics.');
    p.status = 'actif';
    s.pendingEvent = {
      key: 'ca_balance', title: 'Démasqué',
      text: 'Deux hommes du Don t’attendent dans ta cuisine. Ils savent pour l’inspecteur.',
      choices: [
        { label: 'Tenter de t’enfuir', hint: `Ombre : ${Math.round(clamp(0.2 + (p.discretion - 5) * 0.06, 0.05, 0.8) * 100)} % de survivre (confiance à 0) · sinon la mort`, effect: 'ca_balance_run' },
      ],
    };
  }
}

/** Les voix pour la succession : chaque votant compare son affinité pour toi et pour le favori */
export function successionTally(s: GameState) {
  const c = s.career!;
  const voters = c.notables.filter((n) => n.role !== 'don' && !n.favori);
  const fav = favori(s);
  const mine = voters.filter((n) => n.affinity > (n.rivalPull ?? 25));
  return { voters, mine, fav, needed: Math.floor(voters.length / 2) + 1 };
}

function successionEvent(s: GameState): PendingEvent {
  const t = successionTally(s);
  const win = s.career!.rank === 'capo' && (!t.fav || t.mine.length >= t.needed);
  return {
    key: 'ca_succession', title: `La mort de ${theDon(s)?.name}`,
    text: t.fav
      ? `Le Don s'est éteint dans son lit, entouré des siens. Dans l'arrière-salle du restaurant, les capos et les anciens votent. Toi ou ${t.fav.name} « ${t.fav.nickname} » : ${t.mine.length} voix pour toi sur ${t.voters.length} (il en faut ${t.needed}).`
      : 'Le Don s’est éteint. Plus personne dans la famille n’ose te disputer la place.',
    choices: [win
      ? { label: 'Prendre la tête de la famille', hint: 'Tu deviens le Don : la carte, la Commission, les villes…', effect: 'ca_win' }
      : { label: 'Baiser la bague du nouveau Don', hint: `${t.fav?.name} prend la place. Tu restes capo… pour l’instant.`, effect: 'ca_lose' }],
  };
}

// ---------- Relations ----------
export const giftCost = (s: GameState) => ({ associe: 200, soldat: 400, capo: 800, don: 800 } as const)[careerRank(s)];
export function gift(s: GameState, id: string): Result {
  const n = notable(s, id);
  if (!n || !s.career) return fail('Introuvable.');
  if (n.lastGift !== undefined && s.week - n.lastGift < 2) return fail('Un cadeau toutes les deux semaines, pas plus : il trouverait ça louche.');
  const cost = giftCost(s);
  if (s.dirty + s.clean < cost) return fail(`Il faut ${fmt(cost)}.`);
  const d = Math.min(s.dirty, cost);
  s.dirty -= d;
  s.clean -= cost - d;
  n.lastGift = s.week;
  const gain = 10 + Math.max(0, (player(s)?.verbe ?? 5) - 5) * 2;
  n.affinity = clamp(n.affinity + gain, -100, 100);
  if (n.role === 'don') addTrust(s, 3);
  log(s, 'neutral', `Tu offres un cadeau à ${n.name} (+${gain} d’affinité).`);
  return ok;
}

// ---------- Effets ----------
export function resolveCareerEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('ca_')) return false;
  const c = s.career;
  const p = player(s);
  if (!c || !p) return true;
  const n = ev.data?.n ? notable(s, String(ev.data.n)) : undefined;
  switch (effect) {
    case 'ca_bapteme':
      c.rank = 'soldat'; c.rankWeek = s.week; c.trust = 35; c.missionsDone = 0;
      s.respect = clamp(s.respect + 5, 0, 150);
      for (let i = 0; i < 4; i++) s.recruits.push(makeRecruit(s));
      hist(s, 'Baptisé homme d’honneur');
      generateMissions(s);
      log(s, 'good', `Tu es un homme d'honneur de la ${EMPLOYER_NAME}. Tu peux recruter jusqu'à ${CREW_MAX.soldat} hommes (onglet Équipe).`);
      news(s, 2, 'Une messe très privée à Little Sicily', 'Les voisins ont vu des hommes en costume sortir du restaurant à 4 heures du matin.');
      break;
    case 'ca_capo': {
      const d = s.districts.find((x) => x.id === String(ev.data?.district));
      if (d) {
        d.owner = 'player';
        d.unrest = 0;
        for (const m of s.members) if (!m.assignment) m.assignment = d.id;
      }
      c.rank = 'capo'; c.rankWeek = s.week; c.trust = 45; c.missionsDone = 0;
      c.notables.forEach((x) => { if (!x.favori && x.role !== 'don') x.affinity = clamp(x.affinity + 5, -100, 100); });
      s.respect = clamp(s.respect + 8, 0, 150);
      hist(s, `Fait capo de ${d?.name ?? 'son quartier'}`);
      generateMissions(s);
      log(s, 'good', `Tu es capo : ${d?.name} est à toi. Construis, protège, et verse ta part au Don (onglet Quartier).`);
      news(s, 3, `${p.name}, nouveau capo de la ${EMPLOYER_NAME}`, 'Le jeune homme aurait gravi les échelons en un temps record.');
      break;
    }
    case 'ca_ami_obey': addTrust(s, 8); notable(s, 'mentor')!.affinity += 5; log(s, 'neutral', 'Nino ne te parlera plus jamais. Le capo, lui, t’offre un verre.'); break;
    case 'ca_ami_warn': s.favors += 1; if (chance(0.4)) { addTrust(s, -6); log(s, 'bad', 'Le capo a compris que Nino avait été prévenu. Il te regarde autrement (−6).'); } else log(s, 'neutral', 'Nino a pris le train pour Chicago. Il te doit la vie.'); break;
    case 'ca_ami_refuse': addTrust(s, -10); s.respect = clamp(s.respect + 3, 0, 150); log(s, 'neutral', 'Tu refuses. La rue t’admire, le capo beaucoup moins.'); break;
    case 'ca_indic_yes': s.dossier = clamp((s.dossier ?? 0) - 20, 0, 100); s.heat = clamp(s.heat - 10, 0, 100); c.history.unshift({ week: s.week, text: 'indic' }); log(s, 'police', 'Tu donnes deux noms. L’inspecteur range son carnet en souriant (dossier −20, heat −10).'); break;
    case 'ca_indic_report': addTrust(s, 6); s.heat = clamp(s.heat + 2, 0, 100); log(s, 'good', 'Le capo apprécie ta loyauté. L’inspecteur, lui, va être muté.'); break;
    case 'ca_veuve_pay': s.dirty -= 200; s.respect = clamp(s.respect + 4, 0, 150); s.favors += 1; log(s, 'good', 'La veuve te bénit. Le quartier saura que tu as du cœur.'); break;
    case 'ca_veuve_take': s.dirty += 200; addTrust(s, 2); s.respect = clamp(s.respect - 2, 0, 150); log(s, 'neutral', 'Tu prends l’argent. Le capo hoche la tête.'); break;
    case 'ca_piege_talk':
      if (chance(clamp(0.3 + ((p.verbe ?? 5) - 5) * 0.08, 0.1, 0.9))) { if (n) n.affinity -= 5; addTrust(s, 3); log(s, 'good', 'Le Don te croit. C’est ton accusateur qui perd la face.'); }
      else { addTrust(s, -12); log(s, 'bad', 'Le Don n’a pas l’air convaincu (−12).'); }
      break;
    case 'ca_piege_pay': s.dirty -= 1000; if (n) n.affinity = clamp(n.affinity + 15, -100, 100); log(s, 'neutral', `${n?.name} change soudain de version.`); break;
    case 'ca_piege_ignore': addTrust(s, -8); break;
    case 'ca_service': {
      const cons = notable(s, 'consigliere')!;
      if (chance(clamp(0.35 + (p.discretion - 5) * 0.07, 0.1, 0.9))) { cons.affinity = clamp(cons.affinity + 20, -100, 100); log(s, 'good', 'Les lettres ont brûlé dans la cheminée du consigliere. Il ne l’oubliera pas (+20).'); }
      else { cons.affinity = clamp(cons.affinity - 10, -100, 100); s.heat = clamp(s.heat + 4, 0, 100); log(s, 'bad', 'La maîtresse a crié au voleur. Le consigliere est furieux (−10).'); }
      break;
    }
    case 'ca_service_no': notable(s, 'consigliere')!.affinity -= 5; break;
    case 'ca_balance_run':
      if (chance(clamp(0.2 + (p.discretion - 5) * 0.06, 0.05, 0.8))) {
        c.trust = 0;
        c.history = c.history.filter((h) => h.text !== 'indic');
        p.status = 'blessé'; p.statusWeeks = 3; p.scars = (p.scars ?? 0) + 1;
        log(s, 'bad', 'Tu sautes par la fenêtre avec une balle dans l’épaule. Tu vis, mais le Don ne te fera plus jamais confiance.');
      } else {
        s.pendingEvent = null;
        killMember(s, p, 'a été abattu par sa propre famille pour avoir parlé aux flics');
      }
      break;
    case 'ca_win': becomeDon(s, 'succession'); break;
    case 'ca_rat_hush':
      s.dirty -= 5000;
      if (chance(clamp(0.35 + ((p.verbe ?? 5) - 5) * 0.07, 0.1, 0.9))) { log(s, 'neutral', 'Le capo trop curieux a été muté… au fond du lac. La rumeur meurt avec lui.'); break; }
    // fallthrough
    case 'ca_rat_out':
      c.informant = false;
      s.members.filter((m) => !m.isDon && !m.isChild).forEach((m) => (m.loyalty = clamp(m.loyalty - 25, 0, 100)));
      s.rivals.filter((r) => r.alive).forEach((r) => (r.relation = clamp(r.relation - 30, -100, 100)));
      s.coalitionWeeks = 8;
      s.respect = clamp(s.respect - 15, 0, 150);
      log(s, 'bad', 'Tout le monde sait que tu as livré l’ancien Don aux fédéraux. Tes hommes doutent, et toutes les familles se liguent contre toi.');
      news(s, 6, 'Le Don balance', 'Selon nos sources, le chef de la famille de Little Sicily aurait été un informateur fédéral.');
      break;
    case 'ca_lose': {
      const fav = favori(s);
      if (!fav) { becomeDon(s, 'succession'); break; }
      c.lost = fav.name;
      const don = theDon(s)!;
      Object.assign(don, { name: fav.name, nickname: fav.nickname, seed: fav.seed, age: fav.age, affinity: fav.affinity });
      fav.favori = false;
      c.notables = c.notables.filter((x) => x.id !== fav.id);
      // un autre capo devient le favori de la prochaine succession
      const next = c.notables.find((x) => x.role === 'capo' && x.id !== 'mentor');
      if (next) next.favori = true;
      c.donHealth = 70;
      c.dying = false;
      c.trust = clamp(Math.round(fav.affinity / 2) + 30, 10, 60);
      log(s, 'bad', `${fav.name} devient le Don de la ${EMPLOYER_NAME}. Tu restes capo, et tu sais qu'il ne t'aime pas.`);
      news(s, 4, 'Un nouveau parrain à Little Sicily', `${fav.name} succède à Calogero Moretti.`);
      break;
    }
  }
  return true;
}


// ---------- Prendre le pouvoir autrement : coup d'État et trahisons ----------
export const PLOT_WEEKS = { coup: 1, feds: 2, rival: 1 } as const;
/** Conjurés : les capos et le consigliere qui te suivraient (affinité ≥ 40) */
export const conspirators = (s: GameState) => (s.career?.notables ?? []).filter((n) => (n.role === 'capo' || n.role === 'consigliere') && !n.favori && n.affinity >= 40);
const loyalists = (s: GameState) => (s.career?.notables ?? []).filter((n) => n.role === 'capo' && n.affinity < 40);
export function coupPower(s: GameState) {
  const p = player(s);
  const crew = activeMembers(s).filter((m) => !m.isDon);
  return (p?.force ?? 5) + Math.round(crew.reduce((t, m) => t + m.force, 0) / 2) + conspirators(s).length * 5;
}
export const coupDefense = (s: GameState) => 14 + loyalists(s).length * 4 + (favori(s) ? 4 : 0);
export const coupChance = (s: GameState) => winChance(coupPower(s), coupDefense(s));
export function rivalPactChance(s: GameState, rid: string) {
  const r = s.rivals.find((x) => x.id === rid);
  if (!r) return 0;
  return winChance(Math.round(r.strength) + Math.round(coupPower(s) / 2), coupDefense(s) + 2);
}
export const pactCandidates = (s: GameState) => s.rivals.filter((r) => r.alive && !r.employer && (r.city ?? 'corrano') === 'corrano' && r.relation >= 20);
export const FEDS_RISK = 0.015; // par semaine, une fois Don : la famille découvre que tu as parlé

export function plotBlocker(s: GameState): string | null {
  const c = s.career;
  if (!c || c.rank !== 'capo') return 'Seul un capo peut viser le trône.';
  if (c.plot) return 'Un complot est déjà en cours.';
  if (player(s)?.status !== 'actif') return 'Tu n’es pas en état.';
  return null;
}
export function startPlot(s: GameState, kind: 'coup' | 'feds' | 'rival', rival?: string): Result {
  const why = plotBlocker(s);
  if (why) return fail(why);
  const c = s.career!;
  if (kind === 'rival') {
    const r = pactCandidates(s).find((x) => x.id === rival);
    if (!r) return fail('Il faut une famille de New Corrano qui t’apprécie (relation ≥ 20).');
  }
  if (kind === 'coup' && activeMembers(s).filter((m) => !m.isDon).length < 2) return fail('Il te faut au moins 2 hommes à toi pour frapper.');
  c.plot = { kind, week: s.week + PLOT_WEEKS[kind] - 1, rival };
  const label = kind === 'coup' ? 'Le coup d’État aura lieu dimanche soir.' : kind === 'feds' ? 'L’agent fédéral te donne rendez-vous. Le grand jury frappera dans deux semaines.' : `${s.rivals.find((x) => x.id === rival)?.boss} accepte. Ses tueurs frapperont dimanche soir.`;
  log(s, 'neutral', label);
  return ok;
}
export function cancelPlot(s: GameState): Result {
  if (!s.career?.plot) return fail('Aucun complot.');
  if (s.career.plot.kind === 'feds') return fail('On ne revient pas en arrière avec les fédéraux.');
  s.career.plot = null;
  log(s, 'neutral', 'Tu renonces. Pour cette fois.');
  return ok;
}

function plotFails(s: GameState, what: string) {
  const c = s.career!;
  const p = player(s)!;
  c.plot = null;
  if (chance(0.55)) {
    killMember(s, p, `a été exécuté pour avoir comploté contre le Don (${what})`);
    return;
  }
  p.status = 'blessé'; p.statusWeeks = 4; p.scars = (p.scars ?? 0) + 1;
  c.trust = 0;
  c.rank = 'soldat';
  c.rankWeek = s.week;
  for (const d of s.districts.filter((x) => x.owner === 'player')) d.owner = c.employer;
  s.respect = clamp(s.respect - 15, 0, 150);
  log(s, 'bad', `Le complot a échoué (${what}). Tu t'en sors avec une balle dans le ventre ; le Don te reprend ton quartier et tes galons.`);
  news(s, 4, 'Fusillade chez les Moretti', 'Une tentative de putsch aurait échoué dans la nuit. Le patriarche est indemne.');
}

function resolvePlot(s: GameState) {
  const c = s.career!;
  const pl = c.plot;
  if (!pl || s.week < pl.week) return;
  const p = player(s);
  if (!p) return;
  if (pl.kind === 'coup') {
    if (Math.random() < coupChance(s)) {
      c.plot = null;
      log(s, 'good', `Dimanche soir, le restaurant ferme ses portes plus tôt. ${theDon(s)?.name} ne s'est pas relevé de table.`);
      news(s, 6, 'Le patriarche de Little Sicily abattu', 'Le Don a été tué pendant le dîner. Ses capos auraient déjà choisi son successeur.');
      becomeDon(s, 'coup');
      const fav = favori(s);
      if (fav) log(s, 'bad', `${fav.name} « ${fav.nickname} » a fui avec ses fidèles. Il ne te pardonnera pas.`);
    } else plotFails(s, 'coup d’État');
  } else if (pl.kind === 'feds') {
    c.plot = null;
    c.informant = true;
    s.dossier = 0;
    log(s, 'police', `Le grand jury fédéral inculpe ${theDon(s)?.name} et ${favori(s)?.name ?? 'son bras droit'}. Ton dossier a disparu, mais tu appartiens désormais aux fédéraux.`);
    news(s, 6, 'Coup de filet fédéral chez les Moretti', 'Le Don et son principal capo sont sous les verrous. Les enquêteurs disposeraient « d’une source très proche ».');
    becomeDon(s, 'trahison');
  } else {
    const r = s.rivals.find((x) => x.id === pl.rival);
    if (r && Math.random() < rivalPactChance(s, r.id)) {
      c.plot = null;
      c.debtTo = r.id;
      log(s, 'good', `Les tueurs de ${r.name} ont fait le travail. Tu leur dois un quartier, et beaucoup plus.`);
      news(s, 6, 'Le Don Moretti abattu par une famille rivale', `${r.boss} serait derrière l'attentat. Curieusement, la relève était déjà prête.`);
      becomeDon(s, 'trahison');
    } else {
      if (r) r.relation = clamp(r.relation - 30, -100, 100);
      plotFails(s, `alliance avec ${r?.name ?? 'un rival'}`);
    }
  }
}

/** Une fois Don : l'indic risque d'être démasqué */
export function informantTick(s: GameState) {
  const c = s.career;
  if (!c || c.rank !== 'don' || !c.informant || s.pendingEvent || s.status !== 'playing') return;
  if (!chance(FEDS_RISK)) return;
  const p = player(s);
  s.pendingEvent = {
    key: 'ca_rat_don', title: 'La rumeur',
    text: 'Un de tes capos a trouvé ton nom dans un rapport fédéral. Toute la famille murmure : le Don serait une balance.',
    choices: [
      { label: 'Faire taire la rumeur', hint: `−5 000 sale · Verbe ${Math.round(clamp(0.35 + ((p?.verbe ?? 5) - 5) * 0.07, 0.1, 0.9) * 100)} % · sinon tout éclate`, effect: 'ca_rat_hush', disabled: s.dirty < 5000 },
      { label: 'Assumer et frapper le premier', hint: 'Loyauté −25 pour tous, −30 de relation avec toutes les familles, la Commission te met au ban', effect: 'ca_rat_out' },
    ],
  };
}

// ---------- Devenir Don ----------
export function becomeDon(s: GameState, path: 'succession' | 'coup' | 'trahison') {
  const c = s.career!;
  const p = player(s)!;
  const emp = s.rivals.find((r) => r.id === c.employer);
  const surname = p.name.split(' ').slice(1).join(' ') || p.name;
  const oldName = s.familyName;
  // le territoire et les hommes de la famille passent au joueur
  const inherited = s.districts.filter((d) => d.owner === c.employer);
  inherited.forEach((d) => { d.owner = 'player'; d.unrest = 0; });
  const men = clamp(Math.round((emp?.strength ?? 12) / 3), 3, 8);
  const all = owned(s);
  for (let i = 0; i < men; i++) {
    const r = makeRecruit(s);
    s.members.push(makeMember(s, {
      name: r.name, nickname: r.nickname, force: r.force, discretion: r.discretion, loyalty: path === 'succession' ? 65 : 45,
      salary: r.salary, assignment: all[i % all.length]?.id ?? null, traits: r.traits, level: r.level ?? 0,
    }));
  }
  // les capos restent : ceux qui t'ont soutenu sont fidèles, les autres gardent rancune.
  // Après une succession, le favori battu reste aussi, et ronge son frein.
  for (const n of c.notables.filter((x) => x.role === 'capo' && x.id !== 'mentor' && (!x.favori || path === 'succession'))) {
    const forMe = !n.favori && n.affinity > (n.rivalPull ?? 25);
    if (path !== 'succession' && n.affinity < -20) continue; // ils ne te pardonnent pas le sang du Don
    s.members.push(makeMember(s, {
      name: n.name, nickname: n.nickname, rank: 'capo', force: randInt(6, 8), discretion: randInt(5, 7),
      loyalty: n.favori ? 25 : forMe ? clamp(50 + Math.round(n.affinity / 2), 45, 90) : clamp(30 + Math.round(n.affinity / 4), 20, 40),
      salary: 450, assignment: all[randInt(0, all.length - 1)]?.id ?? null, level: n.favori ? 4 : 3, traits: forMe ? ['fidele'] : [], seed: n.seed,
      grudge: !forMe,
    }));
  }
  circleFromCareer(s, path);
  if (emp) { emp.alive = false; emp.employer = false; }
  // la dette envers une famille rivale : un quartier hérité lui revient
  if (path === 'trahison' && c.debtTo) {
    const ally = s.rivals.find((r) => r.id === c.debtTo && r.alive);
    const owed = inherited.find((d) => d.id !== 'sicily');
    if (ally && owed) { owed.owner = ally.id; s.members.filter((m) => m.assignment === owed.id).forEach((m) => (m.assignment = null)); }
    if (ally) { ally.alliance = true; ally.relation = Math.max(ally.relation, 60); ally.truceWeeks = 8; }
  }
  s.familyName = `Famille ${surname}`;
  s.log.forEach((e) => (e.text = e.text.split(oldName).join(s.familyName)));
  c.rank = 'don';
  c.path = path;
  c.plot = null;
  c.rankWeek = s.week;
  p.rank = 'capo';
  p.points = (p.points ?? 0) + 1;
  s.respect = clamp(s.respect + 15, 0, 150);
  s.commission = initCommission(s);
  s.commission.seat = true;
  s.commission.next = s.week + 4;
  s.recruits = [makeRecruit(s), makeRecruit(s), makeRecruit(s), makeRecruit(s)];
  fillObjectives(s);
  hist(s, `Devenu Don (${path})`);
  log(s, 'good', `Tu es le Don. La ${oldName} devient la ${s.familyName} : ${inherited.length + 1} quartiers, ${activeMembers(s).length} hommes, et le siège de la famille à la Commission.`);
  news(s, 6, `${p.name}, nouveau Don de Little Sicily`, `Parti de rien il y a ${s.week} semaines, le jeune homme règne désormais sur la ${s.familyName}.`);
}

