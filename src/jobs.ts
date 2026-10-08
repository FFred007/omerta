// Coups et missions : 3 à 4 opportunités par semaine, une équipe, une chance de réussite exacte
import { BUSINESSES, GOODS } from './data';
import {
  activeMembers, chance, clamp, fx, log, news, nextId, owned, pick, randInt, roll, storageCap, stockTotal, winChance,
} from './state';
import type { GameState, Job, JobStat, Member, RivalFamily } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

/** Compétence de l'équipe pour un coup : somme de la stat, +2 par capo */
export function teamSkill(s: GameState, job: Job, ids = job.team) {
  return s.members
    .filter((m) => ids.includes(m.id))
    .reduce((t, m) => t + (job.stat === 'force' ? m.force : m.discretion) + (m.rank === 'capo' ? 2 : 0), 0);
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
];

/** Tire 3 ou 4 coups pour la semaine */
export function generateJobs(s: GameState) {
  const scale = 1 + Math.min(1.2, (s.week - 1) * 0.025) + owned(s).length * 0.03;
  const rivals = s.rivals.filter((r) => r.alive);
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
    jobs.push({ id: nextId(s), key: t.key, team: [], ...t.make(s, scale, r) });
  }
  s.jobs = jobs;
}

/** Assigne une équipe (éventuellement incomplète) ; retire ces hommes des assauts et des autres coups */
export function setJobTeam(s: GameState, jobId: number, ids: number[]): Result {
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job) return fail('Ce coup n’est plus disponible.');
  const team = activeMembers(s).filter((m) => ids.includes(m.id) && !(m.fatigue ?? 0)).map((m) => m.id);
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
  if ((m.fatigue ?? 0) > 0) return fail(`${m.nickname} récupère du dernier assaut.`);
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
    if (r && job.relationHit) r.relation = clamp(r.relation - job.relationHit * (a > b ? 1 : 0.5), -100, 100);

    if (a > b) {
      s.stats.jobsDone++;
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
      log(s, 'good', `Coup réussi : ${job.title} ${dice}. ${gains.join(', ')}.`);
      if (job.key === 'banque') news(s, 5, 'Braquage spectaculaire en plein jour', 'La Corrano Savings Bank délestée de sa paie. Aucun suspect, aucun témoin.');
      if (job.key === 'boxe') news(s, 2, 'Kid Malone au tapis au 4e round', 'Stupeur au Coliseum. Les parieurs crient au scandale.');
    } else {
      s.heat = clamp(s.heat + job.failHeat, 0, 100);
      fx(s, 'jobfail');
      log(s, 'bad', `Coup raté : ${job.title} ${dice}. +${job.failHeat} heat.`);
      consequences(s, men, job.danger, job.stat);
      if (job.key === 'banque') news(s, 4, 'Braquage manqué à la Savings Bank', 'Échange de coups de feu devant la banque. Les malfrats s’enfuient les mains vides.');
    }
  }
  s.jobs = [];
}

function consequences(s: GameState, men: Member[], danger: number, stat: JobStat) {
  for (const m of men) {
    const x = Math.random();
    if (stat === 'discretion' ? x < danger * 0.5 : x < danger * 0.25) {
      m.status = 'prison';
      m.statusWeeks = randInt(2, 5);
      if (s.judge) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
      log(s, 'police', `${m.nickname} se fait pincer (${m.statusWeeks} sem. de prison).`);
    } else if (chance(stat === 'force' ? danger * 0.6 : danger * 0.3)) {
      m.status = 'blessé';
      m.statusWeeks = randInt(1, 3);
      log(s, 'bad', `${m.nickname} est blessé pendant le coup (${m.statusWeeks} sem.).`);
    }
  }
}
