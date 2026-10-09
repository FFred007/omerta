// Les équipes des capos : qui travaille avec qui, quels quartiers chaque capo tient, et qui il poste où.
import { bondOf } from './bonds';
import { cityOf, memberCity } from './cities';
import { donOf } from './don';
import { log, neighbors, owned, racketOf, rival } from './state';
import { has } from './traits';
import type { District, GameState, Member } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const BD_RIVAUX = (s: GameState, a: number, b: number) => bondOf(s, a, b)?.kind === 'rivaux';
const BD_FRERES = (s: GameState, a: number, b: number) => bondOf(s, a, b)?.kind === 'freres';
const fail = (error: string): Result => ({ ok: false, error });

export const GARDE_MAX = 4;
export const crewCap = (capo: Member) => 3 + Math.floor((capo.level ?? 0) / 2);
export const capos = (s: GameState) => s.members.filter((m) => m.rank === 'capo' && !m.isDon && !m.isChild);
/** Soldats qu'on peut mettre en équipe (ni le Don, ni ses enfants, ni les capos) */
export const soldiers = (s: GameState) => s.members.filter((m) => !m.isDon && !m.isChild && m.rank !== 'capo');
export const crewOf = (s: GameState, id: number | 'garde') => s.members.filter((m) => m.crew === id && !m.isDon && m.rank !== 'capo');
/** « de » + surnom, avec la contraction : du Vieux, des Frères, de la Fouine, de l'Allumette */
export function deNick(nick: string) {
  if (/^le /i.test(nick)) return `du ${nick.slice(3)}`;
  if (/^les /i.test(nick)) return `des ${nick.slice(4)}`;
  return `de ${nick}`;
}
export const crewName = (s: GameState, id: number | 'garde' | undefined) =>
  id === 'garde' ? 'Garde du Don' : id === undefined ? 'Sans équipe' : `Équipe ${deNick(s.members.find((m) => m.id === id)?.nickname ?? '?')}`;
export const capoDistricts = (s: GameState, capoId: number) => owned(s).filter((d) => d.capo === capoId);
const roomIn = (s: GameState, id: number | 'garde') => (id === 'garde' ? GARDE_MAX : crewCap(s.members.find((m) => m.id === id)!)) - crewOf(s, id).length;

/** Valeur d'un homme pour équilibrer les équipes */
const worth = (m: Member) => m.force + m.discretion + (m.level ?? 0);
/** Valeur d'un garde : il doit savoir se battre, et rester fidèle */
const guardWorth = (m: Member) => m.force + (has(m, 'tireur') ? 3 : 0) + (has(m, 'roc') ? 3 : 0) + m.loyalty / 20;

/** Ce quartier compte-t-il ? (frontière, guerre, expédition annoncée, revenus) */
export function importance(s: GameState, d: District) {
  let n = 1 + racketOf(d) / 400 + d.businesses.length * 0.4;
  for (const o of neighbors(s, d)) {
    if (o.owner === 'player' || o.owner === 'neutral') continue;
    const r = rival(s, o.owner);
    n += r?.war ? 3 : 1.5;
  }
  if (s.expedition?.target === d.id) n += 5;
  if ((d.unrest ?? 0) > 0) n += 1;
  return n;
}

// =====================================================================
// Former les équipes : équilibrées, sans regarder les quartiers
// =====================================================================
export function autoCrews(s: GameState) {
  const bossList = capos(s);
  const men = soldiers(s);
  men.forEach((m) => (m.crew = undefined));
  const don = donOf(s);
  const home = don ? memberCity(don) : 'corrano';
  // la garde du Don : sa part, au plus 4, les meilleurs combattants et les plus fidèles
  const gardeSize = Math.min(GARDE_MAX, Math.max(men.length ? 1 : 0, Math.round(men.length / (bossList.length + 1))));
  const pool = [...men];
  if (don) {
    const guards = pool.filter((m) => memberCity(m) === home).sort((a, b) => guardWorth(b) - guardWorth(a)).slice(0, gardeSize);
    guards.forEach((m) => (m.crew = 'garde'));
    // le frère d'armes d'un garde le rejoint, à la place du garde le moins utile
    for (const g of [...guards]) {
      const bro = pool.find((x) => x.crew === undefined && memberCity(x) === home && BD_FRERES(s, g.id, x.id));
      if (!bro) continue;
      const weakest = crewOf(s, 'garde').filter((x) => x.id !== g.id && !pool.some((y) => y.crew === 'garde' && y !== x && BD_FRERES(s, x.id, y.id))).sort((a, b) => guardWorth(a) - guardWorth(b))[0];
      if (crewOf(s, 'garde').length >= gardeSize && weakest) weakest.crew = undefined;
      if (crewOf(s, 'garde').length < GARDE_MAX) bro.crew = 'garde';
    }
  }
  // les autres, du plus fort au plus faible, vers l'équipe la plus faible qui a de la place
  const rest = pool.filter((m) => m.crew === undefined).sort((a, b) => worth(b) - worth(a));
  const strength = new Map<number, number>(bossList.map((c) => [c.id, 0]));
  const forceSide = new Map<number, number>(bossList.map((c) => [c.id, 0]));
  for (const m of rest) {
    // un frère d'armes déjà placé : on le rejoint s'il y a de la place
    const bro = men.find((x) => x.crew !== undefined && BD_FRERES(s, m.id, x.id));
    if (bro && bro.crew !== undefined && roomIn(s, bro.crew) > 0 && !crewOf(s, bro.crew).some((x) => BD_RIVAUX(s, m.id, x.id))
      && (bro.crew === 'garde' || !BD_RIVAUX(s, m.id, bro.crew))) {
      m.crew = bro.crew;
      if (typeof bro.crew === 'number') {
        strength.set(bro.crew, strength.get(bro.crew)! + worth(m));
        forceSide.set(bro.crew, forceSide.get(bro.crew)! + (m.force - m.discretion));
      }
      continue;
    }
    let best: Member | undefined;
    let bestCost = Infinity;
    for (const c of bossList) {
      if (memberCity(c) !== memberCity(m) || roomIn(s, c.id) <= 0) continue;
      const crew = crewOf(s, c.id);
      let cost = strength.get(c.id)!;
      if (BD_RIVAUX(s, m.id, c.id) || crew.some((x) => BD_RIVAUX(s, m.id, x.id))) cost += 1000;
      if (crew.some((x) => BD_FRERES(s, m.id, x.id))) cost -= 6;
      // un peu de tout dans chaque équipe : force et discrétion, et pas deux fois le même spécialiste
      const lean = m.force >= m.discretion ? forceSide.get(c.id)! : -forceSide.get(c.id)!;
      cost += lean * 0.3;
      if ((m.traits ?? []).some((t) => crew.some((x) => (x.traits ?? []).includes(t)))) cost += 2;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    if (best) {
      m.crew = best.id;
      strength.set(best.id, strength.get(best.id)! + worth(m));
      forceSide.set(best.id, forceSide.get(best.id)! + (m.force - m.discretion));
    } else if (don && memberCity(m) === home && roomIn(s, 'garde') > 0) m.crew = 'garde';
  }
  s.crewsInit = true;
}

/** Une recrue ou un homme sans équipe rejoint l'équipe qui a le plus de place */
export function joinBestCrew(s: GameState, m: Member) {
  if (m.isDon || m.isChild || m.rank === 'capo') return;
  const options = capos(s).filter((c) => memberCity(c) === memberCity(m) && roomIn(s, c.id) > 0 && !BD_RIVAUX(s, m.id, c.id))
    .sort((a, b) => roomIn(s, b.id) - roomIn(s, a.id));
  if (options[0]) m.crew = options[0].id;
  else if (donOf(s) && memberCity(m) === memberCity(donOf(s)!) && roomIn(s, 'garde') > 0) m.crew = 'garde';
  else m.crew = undefined;
}

export function setCrew(s: GameState, memberId: number, crew: number | 'garde' | undefined): Result {
  const m = s.members.find((x) => x.id === memberId);
  if (!m || m.isDon || m.isChild || m.rank === 'capo') return fail('Impossible.');
  if (m.crew === crew) return ok;
  if (crew !== undefined) {
    if (roomIn(s, crew) <= 0) return fail(`${crewName(s, crew)} est au complet${crew === 'garde' ? ` (${GARDE_MAX} hommes)` : ' : un capo commande 3 hommes, +1 tous les 2 niveaux'}.`);
    if (typeof crew === 'number') {
      const c = s.members.find((x) => x.id === crew)!;
      if (BD_RIVAUX(s, m.id, c.id)) return fail(`${m.nickname} et ${c.nickname} sont rivaux : il ne servira pas sous ses ordres.`);
      if (memberCity(c) !== memberCity(m)) return fail(`${c.nickname} est dans une autre ville.`);
    }
  }
  m.crew = crew;
  m.pinned = false;
  autoPost(s);
  return ok;
}

// =====================================================================
// Les quartiers des capos
// =====================================================================
/** Répartit les quartiers de chaque ville entre les capos qui y sont (la garde reste avec le Don, où qu'il soit) */
export function autoDistricts(s: GameState) {
  const byCity = new Map<string, District[]>();
  for (const d of owned(s)) {
    d.capo = undefined;
    const c = cityOf(d);
    byCity.set(c, [...(byCity.get(c) ?? []), d]);
  }
  for (const [city, list] of byCity) {
    const bosses = capos(s).filter((c) => memberCity(c) === city);
    if (!bosses.length) continue;
    const load = new Map<number, number>(bosses.map((c) => [c.id, 0]));
    // les quartiers les plus importants d'abord, au capo le moins chargé (pondéré par la taille de son équipe)
    for (const d of [...list].sort((a, b) => importance(s, b) - importance(s, a))) {
      const c = [...bosses].sort((a, b) => load.get(a.id)! / (crewOf(s, a.id).length + 1) - load.get(b.id)! / (crewOf(s, b.id).length + 1))[0];
      d.capo = c.id;
      load.set(c.id, load.get(c.id)! + importance(s, d));
    }
  }
}

export function setDistrictCapo(s: GameState, districtId: string, capoId: number | undefined): Result {
  const d = owned(s).find((x) => x.id === districtId);
  if (!d) return fail('Ce quartier n’est pas à toi.');
  if (capoId !== undefined) {
    const c = capos(s).find((x) => x.id === capoId);
    if (!c) return fail('Ce capo n’existe plus.');
    if (memberCity(c) !== cityOf(d)) return fail(`${c.nickname} est dans une autre ville.`);
  }
  d.capo = capoId;
  autoPost(s);
  return ok;
}

// =====================================================================
// Le poste automatique : chaque capo place ses hommes, la garde suit le Don
// =====================================================================
export function autoPost(s: GameState) {
  const don = donOf(s);
  // nettoyage : équipes et quartiers orphelins
  const live = new Set(capos(s).map((c) => c.id));
  for (const m of s.members) if (typeof m.crew === 'number' && !live.has(m.crew)) m.crew = undefined;
  for (const d of s.districts) if (d.capo !== undefined && (!live.has(d.capo) || d.owner !== 'player')) d.capo = undefined;
  const free = (m: Member) => m.status === 'actif' && !m.pinned;
  // la garde : avec le Don
  if (don) {
    const home = don.assignment && owned(s).some((d) => d.id === don.assignment) ? don.assignment : owned(s).find((d) => cityOf(d) === memberCity(don))?.id ?? null;
    for (const m of crewOf(s, 'garde')) if (free(m) && memberCity(m) === memberCity(don)) m.assignment = home;
  }
  // chaque capo : ses hommes sur ses quartiers, les plus importants d'abord
  for (const c of capos(s)) {
    const zone = capoDistricts(s, c.id);
    const team = [c, ...crewOf(s, c.id)].filter((m) => free(m));
    if (!zone.length) { team.forEach((m) => { if (m.id !== c.id || !m.assignment || !owned(s).some((d) => d.id === m.assignment)) m.assignment = null; }); continue; }
    const count = new Map<string, number>(zone.map((d) => [d.id, 0]));
    const need = new Map<string, number>(zone.map((d) => [d.id, importance(s, d)]));
    for (const m of team.sort((a, b) => Number(b.id === c.id) - Number(a.id === c.id) || b.force - a.force)) {
      const options = zone.filter((d) => cityOf(d) === memberCity(m));
      if (!options.length) { m.assignment = null; continue; }
      const d = options.sort((a, b) => need.get(b.id)! / (1 + count.get(b.id)!) - need.get(a.id)! / (1 + count.get(a.id)!))[0];
      m.assignment = d.id;
      count.set(d.id, count.get(d.id)! + 1);
    }
  }
}

/** Le Don décide lui-même du poste de cet homme ; le capo n'y touchera plus */
export function pin(s: GameState, memberId: number, on: boolean) {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return;
  m.pinned = on;
  if (!on) autoPost(s);
}

/** Loyauté en cascade : chaque semaine, les hommes se rapprochent de la loyauté de leur capo */
export function cascadeTick(s: GameState) {
  for (const m of s.members) {
    if (typeof m.crew !== 'number' || m.status !== 'actif') continue;
    const c = s.members.find((x) => x.id === m.crew);
    if (!c || c.status !== 'actif') continue;
    if (c.loyalty >= m.loyalty + 5) m.loyalty += 1;
    else if (c.loyalty <= m.loyalty - 5) m.loyalty -= 1;
  }
}

/** Un capo qui part : ses hommes peu loyaux le suivent, les autres se retrouvent sans équipe */
export function capoLeaves(s: GameState, capo: Member, verb = 'le suivent'): Member[] {
  const followers = crewOf(s, capo.id).filter((m) => m.loyalty < 50 && !has(m, 'fidele'));
  if (followers.length) {
    const ids = new Set(followers.map((m) => m.id));
    s.members = s.members.filter((m) => !ids.has(m.id));
    s.jobs.forEach((j) => (j.team = j.team.filter((id) => !ids.has(id))));
    s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => !ids.has(id))));
    log(s, 'bad', `${followers.map((m) => m.nickname).join(', ')} ${followers.length > 1 ? verb : verb.replace(/nt$/, '')} : ${followers.length} homme${followers.length > 1 ? 's' : ''} de moins.`);
  }
  crewOf(s, capo.id).forEach((m) => (m.crew = undefined));
  s.districts.forEach((d) => { if (d.capo === capo.id) d.capo = undefined; });
  return followers;
}

/** Quartiers nouvellement pris : au capo le moins chargé de la ville */
export function assignNewDistricts(s: GameState) {
  for (const d of owned(s)) {
    if (d.capo !== undefined && capos(s).some((c) => c.id === d.capo)) continue;
    const bosses = capos(s).filter((c) => memberCity(c) === cityOf(d));
    if (!bosses.length) { d.capo = undefined; continue; }
    const load = (c: Member) => capoDistricts(s, c.id).reduce((t, x) => t + importance(s, x), 0) / (crewOf(s, c.id).length + 1);
    d.capo = [...bosses].sort((a, b) => load(a) - load(b))[0].id;
  }
}

/** Un nouveau capo prend les hommes sans équipe de sa ville */
export function onNewCapo(s: GameState, capo: Member) {
  capo.crew = undefined;
  for (const m of soldiers(s).filter((x) => x.crew === undefined && memberCity(x) === memberCity(capo))) {
    if (roomIn(s, capo.id) <= 0) break;
    m.crew = capo.id;
  }
  // son ancienne équipe le perd : il ne compte plus parmi les soldats
}

/** Première fois (nouvelle partie ou ancienne sauvegarde) : équipes, quartiers et postes */
export function initCrews(s: GameState) {
  if (s.crewsInit) return;
  autoCrews(s);
  autoDistricts(s);
  autoPost(s);
}

export const unassigned = (s: GameState) => soldiers(s).filter((m) => m.crew === undefined);
