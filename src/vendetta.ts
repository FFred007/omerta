// Vendettas : quand un homme tombe sous les balles d'une famille, le tueur a un nom. La famille attend la vengeance.
import { cityName, rivalCity } from './cities';
import { clamp, log, news, nextId, pick, randInt, rival } from './state';
import type { GameState, Job, Member, Vendetta } from './types';

export const VENDETTA_WEEKS = 10;
const FIRST = ['Lucky', 'Nino', 'Bugsy', 'Tony', 'Jimmy', 'Sal', 'Frankie', 'Mickey', 'Joe', 'Benny', 'Dutch', 'Rico', 'Paddy', 'Stan', 'Chuck'];
const NICK = ['le Chirurgien', 'la Faux', 'Mains de Velours', 'le Silencieux', 'Calibre 38', 'le Fossoyeur', 'Œil de Serpent', 'le Violoniste', 'la Hache', 'Gueule d’Ange', 'le Corbeau', 'Trois Balles'];

export const activeVendettas = (s: GameState) => s.vendettas ?? [];

/** Un homme est tombé : le tueur est identifié */
export function onKilled(s: GameState, victim: Member, rivalId: string, avengers: number[]) {
  const r = rival(s, rivalId);
  if (!r || !r.alive) return;
  const list = (s.vendettas ??= []);
  let v = list.find((x) => x.rivalId === rivalId);
  const family = victim.isDon || victim.isChild;
  const heirs = family ? s.members.filter((m) => m.isDon || m.isChild).map((m) => m.id) : [];
  if (v) {
    v.victims.push(victim.name);
    v.force = Math.min(16, v.force + 1);
    v.deadline = s.week + VENDETTA_WEEKS;
    v.avengers = [...new Set([...v.avengers, ...avengers, ...heirs])];
    log(s, 'bad', `Encore lui : ${v.killer} « ${v.nickname} » a abattu ${victim.name}. La liste s'allonge.`);
    return;
  }
  const used = new Set(list.map((x) => x.nickname));
  v = {
    id: nextId(s),
    killer: `${pick(FIRST)} ${r.surname ?? 'Castellano'}`,
    nickname: pick(NICK.filter((n) => !used.has(n))) ?? 'le Tueur',
    rivalId,
    city: rivalCity(r),
    force: randInt(7, 11),
    victims: [victim.name],
    avengers: [...new Set([...avengers, ...heirs])],
    week: s.week,
    deadline: s.week + VENDETTA_WEEKS,
    seed: randInt(1, 1e9),
  };
  list.push(v);
  log(s, 'bad', `On connaît le nom du tueur de ${victim.name} : ${v.killer} « ${v.nickname} », de ${r.name}. Vendetta : ${VENDETTA_WEEKS} semaines pour le venger.`);
  news(s, 4, `${victim.name} abattu`, `La rue murmure un nom : « ${v.nickname} ». La famille de la victime aurait juré vengeance.`);
}

/** Le coup de vengeance, proposé chaque semaine dans la ville du tueur */
export function vendettaJob(s: GameState, v: Vendetta): Job {
  const r = rival(s, v.rivalId);
  return {
    id: nextId(s), key: 'vendetta', vendettaId: v.id, city: v.city, team: [],
    title: `Vendetta : abattre « ${v.nickname} »`,
    text: `${v.killer} boit son café tous les matins chez le même barbier de ${cityName(v.city)}. Il a tué ${v.victims.join(', ')}. ${v.avengers.length ? 'Ses frères d’armes veulent en être.' : ''}`,
    stat: 'force', difficulty: Math.round(v.force * 1.2 + 2 + (r ? r.strength / 10 : 0)), minMen: 2,
    reward: { respect: 6, rivalHit: 2, heat: 6 }, failHeat: 6, danger: 0.5,
    rivalId: v.rivalId, relationHit: 15,
  };
}

/** Bonus des vengeurs : un frère d'armes de la victime se bat comme deux */
export function avengerBonus(s: GameState, job: Job, ids: number[]) {
  if (!job.vendettaId) return 0;
  const v = activeVendettas(s).find((x) => x.id === job.vendettaId);
  return v ? ids.filter((id) => v.avengers.includes(id)).length * 2 : 0;
}

export function avenge(s: GameState, vendettaId: number) {
  const v = activeVendettas(s).find((x) => x.id === vendettaId);
  if (!v) return;
  s.vendettas = activeVendettas(s).filter((x) => x.id !== vendettaId);
  for (const m of s.members) m.loyalty = clamp(m.loyalty + (v.avengers.includes(m.id) ? 15 : 3), 0, 100);
  const r = rival(s, v.rivalId);
  if (r) r.relation = clamp(r.relation - 10, -100, 100);
  log(s, 'good', `${v.killer} « ${v.nickname} » ne tuera plus personne. ${v.victims.join(', ')} ${v.victims.length > 1 ? 'sont vengés' : 'est vengé'}. Toute la famille relève la tête.`);
  news(s, 5, `« ${v.nickname} » retrouvé mort`, `Le tueur de ${r?.name ?? 'la pègre'} gisait dans un fauteuil de barbier. Personne n’a rien vu.`);
}

/** Échéances : un tueur impuni humilie la famille */
export function vendettasTick(s: GameState) {
  for (const v of [...activeVendettas(s)]) {
    const r = rival(s, v.rivalId);
    if (!r || !r.alive) {
      s.vendettas = activeVendettas(s).filter((x) => x.id !== v.id);
      log(s, 'neutral', `${v.killer} « ${v.nickname} » a quitté le pays avec ce qui restait de sa famille. La vendetta s'éteint.`);
      continue;
    }
    if (s.week < v.deadline) continue;
    s.vendettas = activeVendettas(s).filter((x) => x.id !== v.id);
    s.respect = clamp(s.respect - 4, 0, 150);
    const gone: Member[] = [];
    for (const id of v.avengers) {
      const m = s.members.find((x) => x.id === id);
      if (!m || m.isDon || m.isChild) continue;
      m.loyalty = clamp(m.loyalty - 15, 0, 100);
      if (Math.random() < 0.3) gone.push(m);
    }
    for (const m of gone) {
      s.members = s.members.filter((x) => x.id !== m.id);
      s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== m.id)));
      s.jobs.forEach((j) => (j.team = j.team.filter((id) => id !== m.id)));
    }
    log(s, 'bad', `« ${v.nickname} » court toujours. La rue dit que le Don a peur (−4 respect)${gone.length ? ` ; ${gone.map((m) => m.nickname).join(', ')} quitte${gone.length > 1 ? 'nt' : ''} la famille pour se venger seul${gone.length > 1 ? 's' : ''}` : ''}.`);
  }
}
