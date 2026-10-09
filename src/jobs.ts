// Coups et missions : 3 à 4 opportunités par semaine, une équipe, une chance de réussite exacte
import { commandForce, commandJail } from './command';
import { BUSINESSES, GOODS } from './data';
import {
  activeMembers, award, chance, clamp, fx, log, news, nextId, onHeist, owned, pick, randInt, roll, storageCap, stockTotal, winChance,
} from './state';
import type { GameState, Job, JobStat, Member, RivalFamily } from './types';
import { donHas, has } from './traits';
import { DON_SEEN_HEAT, donHasTalent } from './don';
import { DOSSIER_ARREST, DOSSIER_SEEN, addDossier } from './dossier';
import { cityName, donCity, memberCity, ownedIn, rivalCity } from './cities';
import { shareOp, teamBondBonus } from './bonds';
import { activeVendettas, avenge, avengerBonus, vendettaJob } from './vendetta';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

/** Compétence de l'équipe pour un coup : somme de la stat, +2 par capo */
export function teamSkill(s: GameState, job: Job, ids = job.team) {
  return s.members
    .filter((m) => ids.includes(m.id))
    .reduce((t, m) => t + (job.stat === 'force' ? m.force + commandForce(s, m) : m.discretion) + (m.rank === 'capo' ? 2 : 0) + traitBonus(m, job.stat), 0)
    + donMorale(s, ids) + teamBondBonus(s, ids) + avengerBonus(s, job, ids) + specialistBonus(s, job, ids) + donStatBonus(s, job, ids);
}

export const SPECIALIST_BONUS = 3;
/** Le bon profil sur le coup : +3 si au moins un homme a le trait recherché */
export function specialistBonus(s: GameState, job: Job, ids = job.team) {
  return job.specialist && s.members.some((m) => ids.includes(m.id) && has(m, job.specialist!)) ? SPECIALIST_BONUS : 0;
}
/** Le Don sur un coup qui demande du Verbe ou du Flair : la moitié de sa stat */
export function donStatBonus(s: GameState, job: Job, ids = job.team) {
  if (!job.donStat) return 0;
  const don = s.members.find((m) => m.isDon && ids.includes(m.id));
  return don ? Math.floor((don[job.donStat] ?? 5) / 2) : 0;
}
export const DON_STAT_LABEL = { verbe: 'Verbe', flair: 'Flair' } as const;

/** Spécialiste recherché et stat du Don pour chaque coup */
const SPECIALTY: Record<string, Pick<Job, 'specialist' | 'donStat'>> = {
  dette: { specialist: 'roc', donStat: 'verbe' },
  boxe: { specialist: 'beauparleur', donStat: 'flair' },
  assurance: { specialist: 'comptable', donStat: 'flair' },
  banque: { specialist: 'tireur' },
  temoin: { specialist: 'fantome' },
  convoi: { specialist: 'chauffeur' },
  syndicat: { specialist: 'negociateur', donStat: 'verbe' },
  camion: { specialist: 'chauffeur' },
  cave: { specialist: 'fantome' },
  incendie: { specialist: 'tetebrulee' },
  comptable: { specialist: 'comptable', donStat: 'flair' },
  morphine: { specialist: 'infirmier' },
  debauche: { specialist: 'recruteur', donStat: 'verbe' },
  greve: { specialist: 'brute' },
  poker: { specialist: 'sangfroid', donStat: 'flair' },
  vendetta: { specialist: 'tireur' },
};
export const specialtyOf = (key: string) => SPECIALTY[key] ?? {};

/** Le Don sur le coup : +1 par homme à ses côtés */
export function donMorale(s: GameState, ids: number[]) {
  return s.members.some((m) => m.isDon && ids.includes(m.id)) ? ids.length - 1 : 0;
}

/** Heat si le coup rate (Personne ne parle : ÷2 sur les coups de force) */
export const jobFailHeat = (s: GameState, j: Job) => (j.stat === 'force' && donHasTalent(s, 'b_silence') ? Math.ceil(j.failHeat / 2) : j.failHeat);
/** Heat si le Don est vu sur le coup */
export const donJobHeat = (s: GameState, ids: number[]) => (s.members.some((m) => m.isDon && ids.includes(m.id)) && !donHasTalent(s, 'r_invisible') ? DON_SEEN_HEAT : 0);

/** Bonus de traits sur un coup */
export function traitBonus(m: Member, stat: JobStat) {
  if (stat === 'force') return has(m, 'brute') ? 2 : 0;
  return (has(m, 'sangfroid') ? 2 : 0) - (has(m, 'ivrogne') ? 2 : 0);
}

export const jobChance = (s: GameState, job: Job, ids = job.team) =>
  ids.length < job.minMen ? 0 : winChance(teamSkill(s, job, ids), job.difficulty);

type Template = {
  key: string;
  weight: number;
  when?: (s: GameState) => boolean;
  needsRival?: boolean;
  make: (s: GameState, scale: number, r?: RivalFamily) => Omit<Job, 'id' | 'team' | 'key'>;
};

const TEMPLATES: Template[] = [
  {
    key: 'dette', weight: 3,
    make: (_s, k) => ({
      title: 'Recouvrer une dette de jeu',
      text: "Un armateur doit 2 000 $ au tripot depuis un mois. Il est temps d'aller lui rendre visite.",
      stat: 'force', difficulty: Math.round(7 * k), minMen: 1,
      reward: { dirty: randInt(9, 14) * 100 }, failHeat: 3, danger: 0.2,
    }),
  },
  {
    key: 'boxe', weight: 3,
    make: (_s, k) => ({
      title: 'Truquer le combat de Kid Malone',
      text: "Le favori doit se coucher au 4e round. Il faut convaincre son entraîneur, discrètement, et parier au bon guichet.",
      stat: 'discretion', difficulty: Math.round(11 * k), minMen: 1,
      reward: { dirty: randInt(20, 30) * 100 }, failHeat: 6, danger: 0.3,
    }),
  },
  {
    key: 'assurance', weight: 2,
    make: (_s, k) => ({
      title: "Escroquerie à l'assurance",
      text: "Un entrepôt de fourrures assuré trois fois sa valeur. Un incendie « accidentel », et l'expert est déjà payé.",
      stat: 'discretion', difficulty: Math.round(12 * k), minMen: 2,
      reward: { clean: randInt(15, 22) * 100 }, failHeat: 8, danger: 0.4,
    }),
  },
  {
    key: 'banque', weight: 1, when: (s) => s.week >= 4,
    make: (_s, k) => ({
      title: 'Braquage de la Corrano Savings Bank',
      text: "Le fourgon de paie des aciéries passe par la banque le vendredi. Trois minutes, pas une de plus.",
      stat: 'force', difficulty: Math.round(22 * k), minMen: 3,
      reward: { dirty: randInt(45, 65) * 100, heat: 14, respect: 4 }, failHeat: 14, danger: 0.7,
    }),
  },
  {
    key: 'temoin', weight: 3, when: (s) => s.heat >= 25,
    make: (s, k) => ({
      title: 'Faire taire un témoin',
      text: `Un serveur a vu des choses qu'il n'aurait pas dû voir. Le procureur compte sur lui. Heat actuelle : ${s.heat}.`,
      stat: 'discretion', difficulty: Math.round(10 * k), minMen: 1,
      reward: { heat: -15 }, failHeat: 8, danger: 0.35,
    }),
  },
  {
    key: 'convoi', weight: 2,
    when: (s) => storageCap(s) - stockTotal(s) >= 30,
    make: (_s, k) => ({
      title: 'Escorter un convoi canadien',
      text: "Un contrebandier de Windsor cherche des gros bras pour traverser le lac. Il paie en caisses.",
      stat: 'force', difficulty: Math.round(13 * k), minMen: 2,
      reward: { crates: { good: 'whisky', qty: randInt(25, 35) }, heat: 3 }, failHeat: 5, danger: 0.4,
    }),
  },
  {
    key: 'syndicat', weight: 1, when: (s) => s.week >= 6,
    make: (_s, k) => ({
      title: 'Le syndicat des dockers',
      text: "L'élection du délégué a lieu jeudi. Avec le bon candidat, le port travaillera pour toi.",
      stat: 'discretion', difficulty: Math.round(18 * k), minMen: 2,
      reward: { clean: 1000, respect: 7 }, failHeat: 6, danger: 0.3,
    }),
  },
  {
    key: 'camion', weight: 3, needsRival: true,
    when: (s) => storageCap(s) - stockTotal(s) >= 20,
    make: (_s, k, r) => ({
      title: `Détourner un camion de ${r!.name}`,
      text: `Un camion de bière de ${r!.boss} passe par la route des Abattoirs. Le chauffeur n'est pas armé.`,
      stat: 'force', difficulty: Math.round(11 * k), minMen: 2,
      reward: { crates: { good: 'biere', qty: randInt(30, 45) }, rivalHit: 1 }, failHeat: 4, danger: 0.4,
      rivalId: r!.id, relationHit: 12,
    }),
  },
  {
    key: 'cave', weight: 2, needsRival: true,
    when: (s) => storageCap(s) - stockTotal(s) >= 20,
    make: (_s, k, r) => ({
      title: `Vider la cave de ${r!.name}`,
      text: `${r!.boss} entrepose son gin sous une église. Le sacristain dort profondément après la messe de minuit.`,
      stat: 'discretion', difficulty: Math.round(13 * k), minMen: 1,
      reward: { crates: { good: 'gin', qty: randInt(25, 40) }, dirty: 400 }, failHeat: 5, danger: 0.35,
      rivalId: r!.id, relationHit: 10,
    }),
  },
  {
    key: 'incendie', weight: 2, needsRival: true, when: (s) => s.week >= 3,
    make: (_s, k, r) => ({
      title: `Incendier un club de ${r!.name}`,
      text: `Le club préféré de ${r!.boss}. Un bidon d'essence, une allumette, et le message sera compris.`,
      stat: 'force', difficulty: Math.round(14 * k), minMen: 2,
      reward: { burnBusiness: true, rivalHit: 2, heat: 10, respect: 3 }, failHeat: 10, danger: 0.55,
      rivalId: r!.id, relationHit: 25,
    }),
  },
  {
    key: 'comptable', weight: 1, needsRival: true, when: (s) => s.week >= 5,
    make: (_s, k, r) => ({
      title: `Voler les livres de comptes de ${r!.name}`,
      text: `Le comptable de ${r!.boss} garde tout dans un coffre au Loop. Avec ces carnets, on peut faire chanter la famille.`,
      stat: 'discretion', difficulty: Math.round(16 * k), minMen: 1,
      reward: { dirty: randInt(15, 25) * 100, rivalHit: 3 }, failHeat: 6, danger: 0.4,
      rivalId: r!.id, relationHit: 15,
    }),
  },
  {
    key: 'morphine', weight: 2, when: (s) => s.week >= 3,
    make: (_s, k) => ({
      title: 'La morphine de Saint-Janvier',
      text: "La pharmacie de l'hôpital reçoit sa livraison le mardi. Une blouse blanche, un chariot, et personne ne pose de questions.",
      stat: 'discretion', difficulty: Math.round(12 * k), minMen: 1,
      reward: { dirty: randInt(14, 20) * 100 }, failHeat: 7, danger: 0.35,
    }),
  },
  {
    key: 'debauche', weight: 2, needsRival: true, when: (s) => s.week >= 4,
    make: (_s, k, r) => ({
      title: `Débaucher les hommes de ${r!.name}`,
      text: `Trois soldats de ${r!.boss} ne sont plus payés depuis un mois. Un verre, une enveloppe, une promesse.`,
      stat: 'discretion', difficulty: Math.round(13 * k), minMen: 1,
      reward: { rivalHit: 3, respect: 2 }, failHeat: 4, danger: 0.3,
      rivalId: r!.id, relationHit: 14,
    }),
  },
  {
    key: 'greve', weight: 2, when: (s) => s.week >= 3,
    make: (_s, k) => ({
      title: 'Briser la grève des abattoirs',
      text: "Les patrons des abattoirs paient bien, et en argent propre, pour que les piquets de grève se dispersent avant lundi.",
      stat: 'force', difficulty: Math.round(12 * k), minMen: 2,
      reward: { clean: randInt(12, 18) * 100, heat: 4 }, failHeat: 6, danger: 0.35,
    }),
  },
  {
    key: 'poker', weight: 2,
    make: (_s, k) => ({
      title: 'Une partie de poker au Grand Hôtel',
      text: "Un héritier de Chicago joue gros tous les jeudis. Un croupier à nous, un jeu marqué, et du sang-froid.",
      stat: 'discretion', difficulty: Math.round(11 * k), minMen: 1,
      reward: { dirty: randInt(12, 22) * 100 }, failHeat: 4, danger: 0.2,
    }),
  },
];

/** Tire 3 ou 4 coups pour la semaine */
export function generateJobs(s: GameState) {
  const scale = 1 + Math.min(1.2, (s.week - 1) * 0.025) + owned(s).length * 0.03;
  // les opportunités viennent au Don, là où il se trouve
  const city = ownedIn(s, donCity(s)).length ? donCity(s) : 'corrano';
  const rivals = s.rivals.filter((r) => r.alive && rivalCity(r) === city);
  const pool = TEMPLATES.filter((t) => (!t.when || t.when(s)) && (!t.needsRival || rivals.length));
  const n = s.week < 3 ? 3 : randInt(3, 4);
  const jobs: Job[] = [];
  const used = new Set<string>();
  while (jobs.length < n && used.size < pool.length) {
    const total = pool.filter((t) => !used.has(t.key)).reduce((a, t) => a + t.weight, 0);
    let roll_ = Math.random() * total;
    const t = pool.filter((x) => !used.has(x.key)).find((x) => (roll_ -= x.weight) <= 0)!;
    used.add(t.key);
    const r = t.needsRival ? pick(rivals) : undefined;
    const made = t.make(s, scale, r);
    jobs.push({ id: nextId(s), key: t.key, team: [], city, ...made, ...specialtyOf(t.key) });
  }
  // les vendettas en cours : un coup de vengeance par tueur, dans sa ville
  for (const v of activeVendettas(s).slice(0, 2)) jobs.push(vendettaJob(s, v));
  s.jobs = jobs;
}

/** Assigne une équipe (éventuellement incomplète) ; retire ces hommes des assauts et des autres coups */
export function setJobTeam(s: GameState, jobId: number, ids: number[]): Result {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) return fail('Ce coup n’est plus disponible.');
  const team = activeMembers(s).filter((m) => ids.includes(m.id) && !(m.fatigue ?? 0) && memberCity(m) === (job.city ?? 'corrano') && !onHeist(s, m.id)).map((m) => m.id);
  s.jobs.forEach((j) => { if (j.id !== jobId) j.team = j.team.filter((id) => !team.includes(id)); });
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => !team.includes(id))));
  s.orders = s.orders.filter((o) => o.memberIds.length);
  job.team = team;
  return ok;
}

export function toggleJobMember(s: GameState, jobId: number, memberId: number): Result {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) return fail('Ce coup n’est plus disponible.');
  const m = s.members.find((x) => x.id === memberId);
  if (!m || m.status !== 'actif') return fail("Cet homme n'est pas disponible.");
  if ((m.fatigue ?? 0) > 0) return fail(`${m.nickname} récupère du dernier assaut ou du voyage.`);
  if (onHeist(s, m.id)) return fail(`${m.nickname} est sur le grand coup.`);
  if (memberCity(m) !== (job.city ?? 'corrano')) return fail(`${m.nickname} est à ${cityName(memberCity(m))} : ce coup se joue à ${cityName(job.city)}.`);
  const team = job.team.includes(memberId) ? job.team.filter((x) => x !== memberId) : [...job.team, memberId];
  return setJobTeam(s, jobId, team);
}

export function resolveJobs(s: GameState) {
  for (const job of s.jobs) {
    const men = s.members.filter((m) => job.team.includes(m.id) && m.status === 'actif');
    if (men.length < job.minMen) continue;
    const skill = teamSkill(s, job, men.map((m) => m.id));
    const odds = Math.round(winChance(skill, job.difficulty) * 100);
    const a = skill * roll();
    const b = job.difficulty * roll();
    const dice = `(${odds} % · ${job.stat} ${skill} → ${a.toFixed(1)} contre ${job.difficulty} → ${b.toFixed(1)})`;
    const r = job.rivalId ? s.rivals.find((x) => x.id === job.rivalId) : undefined;
    const donThere = men.some((m) => m.isDon);
    s.heat = clamp(s.heat + donJobHeat(s, men.map((m) => m.id)), 0, 100);
    if (donJobHeat(s, men.map((m) => m.id))) addDossier(s, DOSSIER_SEEN, `Le Don vu sur « ${job.title} »`);
    if (r && job.relationHit) r.relation = clamp(r.relation - job.relationHit * (a > b ? 1 : 0.5) * (donHas(r, 'rancunier') ? 1.5 : 1), -100, 100);

    if (a > b) {
      s.stats.jobsDone++;
      if (donThere) s.respect = clamp(s.respect + 1, 0, 150);
      fx(s, 'job');
      const w = job.reward;
      const gains: string[] = [];
      if (w.dirty) { s.dirty += w.dirty; gains.push(`+${fmt(w.dirty)} sale`); }
      if (w.clean) { s.clean += w.clean; gains.push(`+${fmt(w.clean)} propre`); }
      if (w.crates) {
        const room = Math.max(0, storageCap(s) - stockTotal(s));
        const q = Math.min(room, w.crates.qty);
        s.stock[w.crates.good] += q;
        gains.push(`+${q} caisses de ${GOODS[w.crates.good].plural}`);
      }
      if (w.respect) { s.respect = clamp(s.respect + w.respect, 0, 150); gains.push(`+${w.respect} respect`); }
      if (w.heat) { s.heat = clamp(s.heat + w.heat, 0, 100); gains.push(`${w.heat > 0 ? '+' : ''}${w.heat} heat`); }
      if (r && w.rivalHit) { r.strength = Math.max(3, r.strength - w.rivalHit); gains.push(`${r.name} affaiblie`); }
      if (r && w.burnBusiness) {
        const target = s.districts.filter((d) => d.owner === r.id && d.businesses.length);
        if (target.length) {
          const d = pick(target);
          const bz = pick(d.businesses);
          d.businesses = d.businesses.filter((x) => x.id !== bz.id);
          gains.push(`${BUSINESSES[bz.kind].name} de ${d.name} en cendres`);
          news(s, 4, `Incendie criminel à ${d.name}`, `Le ${BUSINESSES[bz.kind].name.toLowerCase()} de ${r.boss} part en fumée. La police parle d'un « court-circuit ».`);
        }
      }
      men.forEach((m) => (m.loyalty = clamp(m.loyalty + 3, 0, 100)));
      men.forEach((m) => award(s, m, 3 + (job.difficulty >= 15 ? 1 : 0), job.stat));
      log(s, 'good', `Coup réussi : ${job.title} ${dice}. ${gains.join(', ')}.`);
      if (job.vendettaId) avenge(s, job.vendettaId);
      if (job.key === 'banque') {
        news(s, 5, 'Braquage spectaculaire en plein jour', 'La Corrano Savings Bank délestée de sa paie. Aucun suspect, aucun témoin.');
        addDossier(s, 5, 'Braquage d’une banque : crime fédéral');
      }
      if (job.key === 'boxe') news(s, 2, 'Kid Malone au tapis au 4e round', 'Stupeur au Coliseum. Les parieurs crient au scandale.');
    } else {
      s.heat = clamp(s.heat + jobFailHeat(s, job), 0, 100);
      fx(s, 'jobfail');
      log(s, 'bad', `Coup raté : ${job.title} ${dice}. +${jobFailHeat(s, job)} heat.`);
      consequences(s, men, job.danger, job.stat);
      men.filter((m) => s.members.includes(m)).forEach((m) => award(s, m, 1, job.stat));
      if (job.vendettaId) log(s, 'bad', 'Le tueur s’en est sorti. Il sera plus méfiant la prochaine fois.');
      if (job.key === 'banque') news(s, 4, 'Braquage manqué à la Savings Bank', 'Échange de coups de feu devant la banque. Les malfrats s’enfuient les mains vides.');
    }
  }
  for (const job of s.jobs) if (job.team.length >= job.minMen) shareOp(s, job.team);
  s.jobs = [];
}

function consequences(s: GameState, men: Member[], danger: number, stat: JobStat) {
  for (const m of men) {
    const x = Math.random();
    const jail = (stat === 'discretion' ? danger * 0.5 : danger * 0.25) * (has(m, 'fantome') ? 0.5 : 1) * commandJail(s, m);
    if (x < jail) {
      m.status = 'prison';
      m.statusWeeks = randInt(2, 5);
      if (s.judge) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
      if (donHasTalent(s, 'r_avocat')) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
      log(s, 'police', `${m.nickname} se fait pincer (${m.statusWeeks} sem. de prison).`);
      addDossier(s, DOSSIER_ARREST, `${m.nickname} arrêté : il pourrait parler`);
    } else if (chance(stat === 'force' ? danger * 0.6 : danger * 0.3)) {
      m.status = 'blessé';
      m.statusWeeks = randInt(1, 3);
      log(s, 'bad', `${m.nickname} est blessé pendant le coup (${m.statusWeeks} sem.).`);
    }
  }
}
