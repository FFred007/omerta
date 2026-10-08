// Plusieurs villes : le Don est dans une seule à la fois, des capos gouverneurs tiennent les autres.
import { CITIES, HOME_CITY, TIERS, cityDef, tierOf } from './data';
import { donOf } from './don';
import { clamp, log, news, payAny } from './state';
import type { District, GameState, Member, RivalFamily } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const TRAVEL_COST = 150; // billet de train et planque, par homme
/** sans le Don ni gouverneur, les hommes se servent dans la caisse */
export const UNGOVERNED_MULT = 0.7;

export const cityOf = (d: District) => d.city ?? HOME_CITY;
export const memberCity = (m: Member) => m.city ?? HOME_CITY;
export const rivalCity = (r: RivalFamily) => r.city ?? HOME_CITY;
export const cityName = (id: string | undefined) => cityDef(id).name;

/** Ville où se trouve le Don (ou le régent) */
export function donCity(s: GameState) {
  const don = donOf(s);
  if (don) return memberCity(don);
  const regent = s.regency?.regentId ? s.members.find((m) => m.id === s.regency!.regentId) : undefined;
  return regent ? memberCity(regent) : HOME_CITY;
}

export const cityDistricts = (s: GameState, city: string) => s.districts.filter((d) => cityOf(d) === city);
export const ownedIn = (s: GameState, city: string) => s.districts.filter((d) => d.owner === 'player' && cityOf(d) === city);
export const rivalsIn = (s: GameState, city: string) => s.rivals.filter((r) => rivalCity(r) === city);
export const membersInCity = (s: GameState, city: string) => s.members.filter((m) => memberCity(m) === city);

export function cityState(s: GameState, id: string) {
  s.cities ??= {};
  return (s.cities[id] ??= { open: id === HOME_CITY, governorId: null });
}

/** Villes où la famille est implantée */
export const isOpen = (s: GameState, id: string) => id === HOME_CITY || !!s.cities?.[id]?.open || ownedIn(s, id).length > 0;
export const openCities = (s: GameState) => CITIES.filter((c) => isOpen(s, c.id));
export const citiesAllowed = (s: GameState) => TIERS[tierOf(s.respect)].cities;
/** Palier minimum pour ouvrir une ville de plus */
export function nextCityTier(s: GameState) {
  const n = openCities(s).length;
  return TIERS.find((t) => t.cities > n);
}

export function governor(s: GameState, city: string): Member | undefined {
  const id = s.cities?.[city]?.governorId;
  if (!id) return undefined;
  const m = s.members.find((x) => x.id === id);
  return m && memberCity(m) === city ? m : undefined;
}

/** Qui tient la ville : le Don sur place, un gouverneur, ou personne */
export function holder(s: GameState, city: string): 'don' | 'gouverneur' | null {
  if (donOf(s) && donCity(s) === city) return 'don';
  const g = governor(s, city);
  if (g && g.status === 'actif') return 'gouverneur';
  if (!donOf(s) && donCity(s) === city) return 'don'; // le régent tient la maison
  return null;
}

/** Multiplicateur de revenus d'une ville (utilisé par projection) */
export function cityMult(s: GameState, city: string) {
  return holder(s, city) ? 1 : UNGOVERNED_MULT;
}

export function canGovern(m: Member) {
  return !m.isDon && m.status === 'actif' && (m.rank === 'capo' || (m.isChild && (m.level ?? 0) >= 2));
}

export function setGovernor(s: GameState, city: string, memberId: number | null): Result {
  if (!isOpen(s, city)) return fail('Tu n’es pas implanté dans cette ville.');
  if (memberId === null) {
    cityState(s, city).governorId = null;
    return ok;
  }
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return fail('Introuvable.');
  if (!canGovern(m)) return fail('Seul un capo (ou un enfant du Don aguerri) peut gouverner une ville.');
  if (memberCity(m) !== city) return fail(`${m.nickname} n’est pas à ${cityName(city)}. Envoie-le d’abord là-bas.`);
  for (const c of Object.values(s.cities ?? {})) if (c.governorId === m.id) c.governorId = null;
  cityState(s, city).governorId = m.id;
  m.loyalty = clamp(m.loyalty + 5, 0, 100);
  log(s, 'good', `${m.name} « ${m.nickname} » gouverne désormais ${cityName(city)} au nom de la famille.`);
  return ok;
}

/** Retire un homme des assauts et des coups (avant un voyage) */
function release(s: GameState, m: Member) {
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== m.id)));
  s.orders = s.orders.filter((o) => o.memberIds.length);
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => id !== m.id)));
}

export function travel(s: GameState, memberId: number, city: string): Result {
  const m = s.members.find((x) => x.id === memberId);
  if (!m) return fail('Introuvable.');
  if (memberCity(m) === city) return fail(`${m.nickname} est déjà à ${cityName(city)}.`);
  if (!isOpen(s, city)) return fail(`La famille n’a encore aucun pied à ${cityName(city)}.`);
  if (m.status === 'prison') return fail('On ne voyage pas depuis une cellule.');
  if (!payAny(s, TRAVEL_COST)) return fail(`Le voyage coûte ${fmt(TRAVEL_COST)}.`);
  const from = memberCity(m);
  release(s, m);
  for (const [id, c] of Object.entries(s.cities ?? {})) if (c.governorId === m.id && id !== city) c.governorId = null;
  m.city = city;
  m.assignment = null;
  m.fatigue = Math.max(m.fatigue ?? 0, 1);
  if (m.isDon) {
    log(s, 'neutral', `Le Don quitte ${cityName(from)} pour ${cityName(city)}.${holder(s, from) ? '' : ` Personne ne tient ${cityName(from)} : les revenus y fondront de 30 %.`}`);
  } else {
    log(s, 'neutral', `${m.nickname} prend le train pour ${cityName(city)}.`);
  }
  return ok;
}

/** Prendre pied dans une nouvelle ville : on débarque à la gare avec une équipe menée par un capo */
export function openCity(s: GameState, city: string, memberIds: number[]): Result {
  const def = cityDef(city);
  if (isOpen(s, city)) return fail('Tu es déjà implanté ici.');
  if (openCities(s).length >= citiesAllowed(s)) {
    const t = nextCityTier(s);
    return fail(t ? `Il faut être ${t.name} (${t.min} de respect) pour t’implanter dans une ville de plus.` : 'Impossible.');
  }
  const gate = s.districts.find((d) => d.id === def.gate);
  if (!gate || gate.owner !== 'neutral') return fail('La gare est déjà tenue par quelqu’un. Impossible d’y débarquer.');
  const team = s.members.filter((m) => memberIds.includes(m.id) && m.status === 'actif');
  if (!team.some((m) => m.isDon || canGovern(m))) return fail('Il faut un capo (futur gouverneur) ou le Don à la tête de l’équipe.');
  const cost = def.openCost + team.length * TRAVEL_COST;
  if (!payAny(s, cost)) return fail(`Il faut ${fmt(cost)} pour acheter la gare et installer tes hommes.`);
  gate.owner = 'player';
  gate.garrison = 0;
  gate.unrest = 2;
  gate.bribedCop = false;
  const st = cityState(s, city);
  st.open = true;
  st.openedWeek = s.week;
  for (const m of team) {
    release(s, m);
    for (const c of Object.values(s.cities ?? {})) if (c.governorId === m.id) c.governorId = null;
    m.city = city;
    m.assignment = gate.id;
    m.fatigue = Math.max(m.fatigue ?? 0, 1);
  }
  const gov = team.find((m) => canGovern(m));
  if (gov) st.governorId = gov.id;
  log(s, 'good', `La ${s.familyName} prend pied à ${def.name} : ${gate.name} est à toi${gov ? `, ${gov.nickname} gouverne` : ''}.`);
  news(s, 5, `Une famille de New Corrano débarque à ${def.name}`, `${team.length} hommes descendus du train de nuit ont acheté ${gate.name}. Les familles locales sont sur les dents.`);
  for (const r of rivalsIn(s, city).filter((x) => x.alive)) r.relation = clamp(r.relation - 10, -100, 100);
  return ok;
}

export function openCost(s: GameState, city: string, n: number) {
  return cityDef(city).openCost + n * TRAVEL_COST;
}

/** Bonus des villes tenues */
export const holdsPort = (s: GameState) => ownedIn(s, 'halloran').length > 0;
export const capitalFriends = (s: GameState) => ownedIn(s, 'washburn').length;
