// Composer une équipe en un clic : les hommes libres les plus utiles, le spécialiste s'il y en a un,
// les frères d'armes plutôt que les rivaux, et on s'arrête quand la chance est bonne.
import { heistSkill, strikeChance } from './heist';
import { jobChance, teamSkill } from './jobs';
import { memberCity, cityOf } from './cities';
import { activeMembers, attackPower, defenseOf, district, onHeist, winChance } from './state';
import { has } from './traits';
import type { GameState, Job, Member } from './types';

export const TARGET = 0.85;

/** Hommes engagés ailleurs cette semaine (autre coup, assaut, grand coup) */
function busy(s: GameState, except?: { job?: number; district?: string }) {
  const ids = new Set<number>();
  s.jobs.forEach((j) => { if (j.id !== except?.job) j.team.forEach((id) => ids.add(id)); });
  s.orders.forEach((o) => { if (o.districtId !== except?.district) o.memberIds.forEach((id) => ids.add(id)); });
  return ids;
}

/**
 * Glouton : on part de `seed`, on ajoute l'homme qui fait le plus monter `score` jusqu'à `min`,
 * puis on continue tant que la chance reste sous la cible et qu'un homme de plus l'améliore.
 */
function greedy(pool: Member[], seed: number[], min: number, max: number, score: (ids: number[]) => number, odds: (ids: number[]) => number, target = TARGET) {
  const team = [...seed];
  const left = pool.filter((m) => !team.includes(m.id));
  while (team.length < max && left.length) {
    if (team.length >= min && odds(team) >= target) break;
    let best = -1;
    let bestVal = -Infinity;
    left.forEach((m, i) => {
      const v = team.length < min ? score([...team, m.id]) : odds([...team, m.id]);
      if (v > bestVal) { bestVal = v; best = i; }
    });
    if (best < 0) break;
    if (team.length >= min && bestVal <= odds(team) + 0.005) break; // plus personne n'aide
    team.push(left[best].id);
    left.splice(best, 1);
  }
  return team;
}

/** Les hommes libres en premier ; ceux déjà pris ailleurs seulement s'il en manque */
function pools(s: GameState, ok: (m: Member) => boolean, except?: { job?: number; district?: string }) {
  const taken = busy(s, except);
  const all = activeMembers(s).filter((m) => !m.isDon && !(m.fatigue ?? 0) && !onHeist(s, m.id) && ok(m));
  return { free: all.filter((m) => !taken.has(m.id)), all };
}

export function bestJobTeam(s: GameState, job: Job): number[] {
  const city = job.city ?? 'corrano';
  const { free, all } = pools(s, (m) => memberCity(m) === city, { job: job.id });
  const max = job.minMen + 3;
  const run = (pool: Member[]) => {
    const spec = job.specialist ? pool.filter((m) => has(m, job.specialist!)).sort((a, b) => teamSkill(s, job, [b.id]) - teamSkill(s, job, [a.id]))[0] : undefined;
    return greedy(pool, spec ? [spec.id] : [], job.minMen, max, (ids) => teamSkill(s, job, ids), (ids) => jobChance(s, job, ids));
  };
  const a = run(free);
  if (a.length >= job.minMen && jobChance(s, job, a) >= TARGET) return a;
  const b = run(all);
  return jobChance(s, job, b) > jobChance(s, job, a) ? b : a;
}

export function bestAttackTeam(s: GameState, districtId: string): number[] {
  const d = district(s, districtId);
  const def = defenseOf(s, d);
  const { free, all } = pools(s, (m) => memberCity(m) === cityOf(d), { district: districtId });
  const odds = (ids: number[]) => winChance(attackPower(s, ids), def);
  // la réserve d'abord : dégarnir un quartier n'est pas gratuit
  const reserve = free.filter((m) => !m.assignment);
  const a = greedy(reserve, [], 1, reserve.length, (ids) => attackPower(s, ids), odds, 0.8);
  if (a.length && odds(a) >= 0.8) return a;
  const b = greedy(free, a, 1, free.length, (ids) => attackPower(s, ids), odds, 0.8);
  if (b.length && odds(b) >= 0.8) return b;
  const c = greedy(all, b, 1, all.length, (ids) => attackPower(s, ids), odds, 0.8);
  return odds(c) > odds(b) ? c : b;
}

/** « Envoyer l'équipe de X » sur un coup : la meilleure combinaison parmi son équipe et lui */
export function crewJobTeam(s: GameState, job: Job, capoId: number | 'garde'): number[] {
  const city = job.city ?? 'corrano';
  const pool = activeMembers(s).filter((m) => !m.isDon && !(m.fatigue ?? 0) && !onHeist(s, m.id) && memberCity(m) === city && (m.crew === capoId || m.id === capoId));
  const spec = job.specialist ? pool.filter((m) => has(m, job.specialist!))[0] : undefined;
  return greedy(pool, spec ? [spec.id] : [], job.minMen, pool.length, (ids) => teamSkill(s, job, ids), (ids) => jobChance(s, job, ids));
}
/** « Envoyer l'équipe de X » à l'assaut : toute l'équipe disponible, lui en tête */
export function crewAttackTeam(s: GameState, districtId: string, capoId: number | 'garde'): number[] {
  const d = district(s, districtId);
  return activeMembers(s).filter((m) => !m.isDon && !(m.fatigue ?? 0) && !onHeist(s, m.id) && memberCity(m) === cityOf(d) && (m.crew === capoId || m.id === capoId)).map((m) => m.id);
}

export function bestHeistTeam(s: GameState): number[] {
  const h = s.heist;
  if (!h) return [];
  const { free } = pools(s, (m) => memberCity(m) === h.city);
  const with_ = (ids: number[]) => ({ ...h, team: ids });
  return greedy(free, [], h.minMen, h.minMen + 3, (ids) => heistSkill(s, with_(ids)), (ids) => strikeChance(s, with_(ids)), 0.8);
}
