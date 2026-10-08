// Contrats à moyen terme : un but, une échéance, une récompense. Toujours 3 en cours.
import { isActive } from './network';
import { clamp, district, isAttackable, log, news, owned, pick, randInt } from './state';
import type { GameState, Objective } from './types';

const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

type Make = (s: GameState) => Omit<Objective, 'id' | 'deadline' | 'createdWeek'> & { weeks: number } | null;

const TEMPLATES: Record<string, Make> = {
  prendre: (s) => {
    const t = s.districts.filter((d) => isAttackable(s, d) && !s.rivals.find((r) => r.id === d.owner)?.alliance);
    if (!t.length) return null;
    const d = pick(t);
    return { kind: 'prendre', title: `Prendre ${d.name}`, target: d.id, base: 0, goal: 1, weeks: randInt(8, 12),
      reward: { dirty: 2500, respect: 5 }, giver: 'Un vieux contact de ton oncle' };
  },
  caisses: (s) => {
    const goal = 60 + owned(s).length * 20;
    return { kind: 'caisses', title: `Écouler ${goal} caisses d'alcool`, base: s.stats.cratesSold, goal, weeks: 6,
      reward: { clean: 1500 }, giver: 'Le syndicat des distillateurs' };
  },
  respect: (s) => {
    const goal = Math.min(150, s.respect + 15);
    return { kind: 'respect', title: `Atteindre ${goal} de respect`, base: 0, goal, weeks: 10,
      reward: { favors: 2 }, giver: 'Les anciens de Little Sicily' };
  },
  calme: () => ({ kind: 'calme', title: 'Garder la heat sous 30 pendant 4 semaines', base: 0, goal: 4, weeks: 8,
    reward: { clean: 1200 }, giver: 'Le conseiller Doyle' }),
  coups: (s) => ({ kind: 'coups', title: 'Réussir 3 coups', base: s.stats.jobsDone, goal: 3, weeks: 8,
    reward: { dirty: 3000 }, giver: 'Un receleur du port' }),
  veteran: (s) => {
    if (s.members.some((m) => !m.isDon && (m.level ?? 0) >= 4)) return null;
    return { kind: 'veteran', title: 'Former un homme jusqu’au niveau 4', base: 0, goal: 4, weeks: 14,
      reward: { dirty: 2000, respect: 3 }, giver: 'Salvatore « le Vieux »' };
  },
  presse: (s) => (isActive(s, 'reporter') ? null : { kind: 'presse', title: 'Mettre un journaliste dans ta poche', base: 0, goal: 1, weeks: 8,
    reward: { clean: 800, respect: 2 }, giver: 'Ton avocat' }),
  mariage: (s) => (s.spouse || !s.members.some((m) => m.isDon) ? null : { kind: 'mariage', title: 'Marier le Don', base: 0, goal: 1, weeks: 20,
    reward: { respect: 6, clean: 1500 }, giver: 'La mère du Don' }),
  dossier: (s) => ((s.dossier ?? 0) < 35 ? null : { kind: 'dossier', title: 'Faire redescendre le dossier fédéral sous 20', base: 0, goal: 20, weeks: 10,
    reward: { respect: 4, favors: 1 }, giver: 'L’avocat de la famille' }),
};

/** Avancement d'un contrat, de 0 à goal */
export function progress(s: GameState, o: Objective): number {
  switch (o.kind) {
    case 'prendre': return o.target && district(s, o.target).owner === 'player' ? 1 : 0;
    case 'caisses': return Math.min(o.goal, s.stats.cratesSold - o.base);
    case 'respect': return Math.min(o.goal, s.respect);
    case 'calme': return o.streak ?? 0;
    case 'coups': return Math.min(o.goal, s.stats.jobsDone - o.base);
    case 'veteran': return Math.min(o.goal, Math.max(0, ...s.members.filter((m) => !m.isDon).map((m) => m.level ?? 0)));
    case 'presse': return isActive(s, 'reporter') ? 1 : 0;
    case 'mariage': return s.spouse ? 1 : 0;
    case 'dossier': return (s.dossier ?? 0) < o.goal ? o.goal : 0;
  }
  return 0;
}

export function rewardText(o: Objective) {
  const r = o.reward;
  return [r.dirty && `${fmt(r.dirty)} sales`, r.clean && `${fmt(r.clean)} propres`, r.respect && `+${r.respect} respect`, r.favors && `+${r.favors} faveur${r.favors > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
}

function fill(s: GameState) {
  s.objectives ??= [];
  const used = new Set(s.objectives.map((o) => o.kind));
  const pool = Object.keys(TEMPLATES).filter((k) => !used.has(k)).sort(() => Math.random() - 0.5);
  for (const k of pool) {
    if (s.objectives.length >= 3) break;
    const made = TEMPLATES[k](s);
    if (!made) continue;
    const { weeks, ...rest } = made;
    s.objectives.push({ ...rest, id: s.nextId++, deadline: s.week + weeks, createdWeek: s.week });
  }
}

export function objectivesTick(s: GameState) {
  s.objectives ??= [];
  for (const o of [...s.objectives]) {
    if (o.kind === 'calme') o.streak = s.heat < 30 ? (o.streak ?? 0) + 1 : 0;
    if (progress(s, o) >= o.goal) {
      const r = o.reward;
      if (r.dirty) s.dirty += r.dirty;
      if (r.clean) s.clean += r.clean;
      if (r.respect) s.respect = clamp(s.respect + r.respect, 0, 150);
      if (r.favors) s.favors += r.favors;
      s.stats.contracts = (s.stats.contracts ?? 0) + 1;
      log(s, 'good', `Contrat rempli : ${o.title}. ${o.giver} tient parole : ${rewardText(o)}.`);
      s.objectives = s.objectives.filter((x) => x.id !== o.id);
    } else if (s.week >= o.deadline) {
      log(s, 'neutral', `Contrat expiré : ${o.title}.`);
      s.objectives = s.objectives.filter((x) => x.id !== o.id);
    }
  }
  fill(s);
  if (s.objectives.length && s.week === 2) news(s, 1, 'Des affaires à saisir', 'Dans les arrière-salles, on parle de contrats pour qui saura les remplir.');
}

export { fill as fillObjectives };
