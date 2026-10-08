// Les grands coups : trois semaines (repérages, préparation, jour J), une équipe bloquée, un butin qui change une partie.
import { cityName, donCity, memberCity, ownedIn } from './cities';
import { DOSSIER_ARREST, addDossier } from './dossier';
import { GOODS } from './data';
import { teamSkill } from './jobs';
import { shareOp } from './bonds';
import { has } from './traits';
import {
  activeMembers, award, chance, clamp, fx, log, news, onHeist, payAny, randInt, rival, roll, stockTotal, storageCap, winChance,
} from './state';
import type { GameState, Heist, Job, JobStat } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const OFFER_WEEKS = 3;
export const COOLDOWN_AFTER = 8;
export const LEAK_PER_WEEK = 5;

type Template = Omit<Heist, 'stage' | 'team' | 'prep' | 'leak' | 'gear' | 'spent' | 'expires' | 'log'>;
const TEMPLATES: Template[] = [
  { key: 'fourgon', city: 'corrano', stat: 'force', difficulty: 30, minMen: 3, title: 'Le fourgon de la Federal Reserve',
    text: 'Chaque premier lundi, un fourgon blindé transporte la paie des aciéries entre la gare et la banque fédérale. Quatre gardes, deux mitraillettes.',
    reward: { dirty: 22000, respect: 6 } },
  { key: 'bijoux', city: 'corrano', stat: 'discretion', difficulty: 28, minMen: 2, title: 'Les diamants de la vente Vanderberg',
    text: 'La veuve Vanderberg met ses bijoux aux enchères. Ils dorment trois nuits dans le coffre de l’hôtel Majestic.',
    reward: { dirty: 18000, respect: 4 } },
  { key: 'cargo', city: 'halloran', stat: 'force', difficulty: 28, minMen: 3, title: 'Le Queen Maud et son whisky écossais',
    text: 'Un cargo écossais mouille au large de Port Halloran avec 80 caisses de pur malt. L’équipage est armé, les garde-côtes aussi.',
    reward: { dirty: 9000, crates: { good: 'whisky', qty: 80 }, respect: 4 } },
  { key: 'casino', city: 'mirage', stat: 'discretion', difficulty: 34, minMen: 3, title: 'Le coffre du casino Lazzaro',
    text: 'La recette du week-end de l’Oasis Club repose dans un coffre Mosler au sous-sol. Les Lazzaro ne pardonneront jamais.',
    reward: { dirty: 30000, respect: 6 }, rivalId: 'lazzaro' },
  { key: 'tresor', city: 'washburn', stat: 'discretion', difficulty: 38, minMen: 3, title: 'Les obligations du Trésor',
    text: 'Un coursier du Trésor transporte des obligations au porteur entre Union Station et le Capitole. Personne ne les a jamais comptées deux fois.',
    reward: { clean: 18000, dirty: 15000, respect: 8 } },
];

export const GEAR: Record<string, { name: string; desc: string; cost: number; currency: 'dirty' | 'clean'; prep?: number; leak?: number }> = {
  plans: { name: 'Plans des lieux', desc: '+3 de préparation', cost: 1500, currency: 'dirty', prep: 3 },
  specialiste: { name: 'Un spécialiste', desc: 'perceur de coffres ou chauffeur : +5 de préparation', cost: 3000, currency: 'dirty', prep: 5 },
  papiers: { name: 'Faux papiers et planque', desc: '−15 de risque de fuite', cost: 1200, currency: 'dirty', leak: -15 },
  flic: { name: 'Un flic de garde payé', desc: '−20 de risque de fuite, +1 de préparation', cost: 2000, currency: 'clean', leak: -20, prep: 1 },
};

const asJob = (h: Heist, stat: JobStat = h.stat) => ({ stat, team: h.team } as unknown as Job);
export const heistSkill = (s: GameState, h: Heist, stat: JobStat = h.stat) => (h.team.length ? teamSkill(s, asJob(h, stat), h.team) : 0);
export const reconDifficulty = (h: Heist) => Math.round(h.difficulty * 0.55);
export const reconChance = (s: GameState, h: Heist) => winChance(heistSkill(s, h, 'discretion'), reconDifficulty(h));
/** Chance exacte du jour J : la police n'attend pas, puis l'équipe l'emporte */
export const strikeChance = (s: GameState, h: Heist) => (h.team.length < h.minMen ? 0 : (1 - h.leak / 100) * winChance(heistSkill(s, h) + h.prep, h.difficulty));

export function offerHeist(s: GameState, key?: string) {
  const city = ownedIn(s, donCity(s)).length ? donCity(s) : 'corrano';
  const pool = TEMPLATES.filter((t) => (key ? t.key === key : t.city === city) && (!t.rivalId || rival(s, t.rivalId)?.alive));
  const t = pool[Math.floor(Math.random() * pool.length)];
  if (!t) return;
  const scale = 1 + Math.min(0.6, s.week * 0.006);
  s.heist = { ...t, reward: { ...t.reward }, difficulty: Math.round(t.difficulty * scale), stage: 0, team: [], prep: 0, leak: 10, gear: [], spent: 0, expires: s.week + OFFER_WEEKS, log: [] };
  log(s, 'neutral', `Un grand coup se présente à ${cityName(t.city)} : ${t.title}. Trois semaines de travail, un butin énorme (onglet Coups).`);
}

export function toggleHeistMember(s: GameState, id: number): Result {
  const h = s.heist;
  if (!h) return fail('Aucun grand coup en vue.');
  if (h.stage > 0) return fail('L’équipe est déjà partie : on ne change pas de chevaux en route.');
  const m = s.members.find((x) => x.id === id);
  if (!m || m.status !== 'actif') return fail('Cet homme n’est pas disponible.');
  if (memberCity(m) !== h.city) return fail(`${m.nickname} est à ${cityName(memberCity(m))} : le coup se monte à ${cityName(h.city)}.`);
  h.team = h.team.includes(id) ? h.team.filter((x) => x !== id) : [...h.team, id];
  return ok;
}

export function launchHeist(s: GameState): Result {
  const h = s.heist;
  if (!h || h.stage !== 0) return fail('Rien à lancer.');
  const men = s.members.filter((m) => h.team.includes(m.id) && m.status === 'actif' && memberCity(m) === h.city);
  if (men.length < h.minMen) return fail(`Il faut au moins ${h.minMen} hommes à ${cityName(h.city)}.`);
  if (men.some((m) => (m.fatigue ?? 0) > 0)) return fail('Certains hommes récupèrent encore.');
  h.team = men.map((m) => m.id);
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => !h.team.includes(id))));
  s.orders = s.orders.filter((o) => o.memberIds.length);
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => !h.team.includes(id))));
  h.stage = 1;
  h.leak = clamp(h.leak + men.filter((m) => has(m, 'bavard')).length * 10, 0, 90);
  log(s, 'neutral', `${h.title} : l’équipe commence les repérages (${men.map((m) => m.nickname).join(', ')}). Ces hommes ne gardent plus leurs quartiers pendant trois semaines.`);
  return ok;
}

export function buyGear(s: GameState, key: string): Result {
  const h = s.heist;
  const g = GEAR[key];
  if (!h || !g) return fail('Impossible.');
  if (h.stage < 1 || h.stage > 2) return fail('La préparation se fait pendant les repérages et la semaine suivante.');
  if (h.gear.includes(key)) return fail('Déjà acheté.');
  if (g.currency === 'clean') { if (s.clean < g.cost) return fail(`Il faut ${fmt(g.cost)} propres.`); s.clean -= g.cost; }
  else if (!payAny(s, g.cost)) return fail(`Il faut ${fmt(g.cost)}.`);
  h.gear.push(key);
  h.spent += g.cost;
  h.prep += g.prep ?? 0;
  h.leak = clamp(h.leak + (g.leak ?? 0), 0, 90);
  return ok;
}

export function abortHeist(s: GameState): Result {
  const h = s.heist;
  if (!h) return fail('Rien à annuler.');
  log(s, 'neutral', `${h.title} : le coup est annulé${h.spent ? ` (${fmt(h.spent)} de préparation perdus)` : ''}.`);
  s.heist = null;
  s.heistCooldown = h.stage > 0 ? COOLDOWN_AFTER : 2;
  return ok;
}

export function heistTick(s: GameState) {
  if ((s.heistCooldown ?? 0) > 0) s.heistCooldown!--;
  const h = s.heist;
  if (!h) {
    if (s.week >= 6 && !(s.heistCooldown ?? 0) && chance(0.2)) offerHeist(s);
    return;
  }
  // l'équipe perd ses morts et ses prisonniers
  h.team = h.team.filter((id) => s.members.some((m) => m.id === id && m.status === 'actif'));
  if (h.stage === 0) {
    if (s.week >= h.expires) { log(s, 'neutral', `${h.title} : l’occasion est passée.`); s.heist = null; s.heistCooldown = 4; }
    return;
  }
  if (h.team.length < h.minMen) {
    log(s, 'bad', `${h.title} : l’équipe est décimée, le coup tombe à l’eau${h.spent ? ` (${fmt(h.spent)} perdus)` : ''}.`);
    s.heist = null;
    s.heistCooldown = COOLDOWN_AFTER;
    return;
  }
  const men = s.members.filter((m) => h.team.includes(m.id));
  if (h.stage === 1) {
    const ok_ = heistSkill(s, h, 'discretion') * roll() > reconDifficulty(h) * roll();
    if (ok_) { h.prep += 4; h.log.push('Repérages réussis : +4 de préparation'); log(s, 'good', `${h.title} : repérages réussis, l’équipe connaît chaque porte (+4 préparation).`); }
    else { h.prep += 1; h.leak = clamp(h.leak + 15, 0, 90); h.log.push('Repérages bâclés : +15 de risque de fuite'); log(s, 'bad', `${h.title} : un gardien a remarqué l’équipe pendant les repérages (+15 risque de fuite).`); }
    men.forEach((m) => award(s, m, 1, 'discretion'));
    h.leak = clamp(h.leak + LEAK_PER_WEEK, 0, 90);
    h.stage = 2;
    return;
  }
  if (h.stage === 2) {
    h.leak = clamp(h.leak + LEAK_PER_WEEK, 0, 90);
    h.log.push('Préparation terminée');
    log(s, 'neutral', `${h.title} : tout est prêt. Le jour J, c’est dimanche prochain (${Math.round(strikeChance(s, h) * 100)} % de réussite).`);
    h.stage = 3;
    return;
  }
  // jour J
  s.heist = null;
  s.heistCooldown = COOLDOWN_AFTER;
  if (chance(h.leak / 100)) {
    for (const m of men) {
      if (m.isDon || !chance(0.5)) continue;
      m.status = 'prison';
      m.statusWeeks = randInt(4, 8);
      if (s.judge) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
      addDossier(s, DOSSIER_ARREST, `${m.nickname} pris sur « ${h.title} »`);
    }
    s.heat = clamp(s.heat + 12, 0, 100);
    addDossier(s, 6, `Grand coup éventé : ${h.title}`);
    fx(s, 'jobfail');
    log(s, 'police', `${h.title} : la police attendait l’équipe. C’était un piège (+12 heat).`);
    news(s, 5, 'Les malfrats tombent dans un piège', `Renseignée par un indicateur, la police cueille une équipe de la ${s.familyName} en pleine action.`);
    return;
  }
  const skill = heistSkill(s, h) + h.prep;
  const a = skill * roll();
  const b = h.difficulty * roll();
  const dice = `(équipe ${skill} → ${a.toFixed(1)} contre ${h.difficulty} → ${b.toFixed(1)})`;
  shareOp(s, h.team);
  if (a > b) {
    const w = h.reward;
    const gains: string[] = [];
    if (w.dirty) { s.dirty += w.dirty; gains.push(`+${fmt(w.dirty)} sale`); }
    if (w.clean) { s.clean += w.clean; gains.push(`+${fmt(w.clean)} propre`); }
    if (w.crates) { const q = Math.min(w.crates.qty, Math.max(0, storageCap(s) - stockTotal(s))); s.stock[w.crates.good] += q; gains.push(`+${q} caisses de ${GOODS[w.crates.good].plural}`); }
    if (w.respect) { s.respect = clamp(s.respect + w.respect, 0, 150); gains.push(`+${w.respect} respect`); }
    s.heat = clamp(s.heat + 10, 0, 100);
    addDossier(s, 5, `Grand coup : ${h.title}`);
    const r = h.rivalId ? rival(s, h.rivalId) : undefined;
    if (r) r.relation = clamp(r.relation - 30, -100, 100);
    men.forEach((m) => { award(s, m, 6, h.stat); m.loyalty = clamp(m.loyalty + 8, 0, 100); });
    s.stats.jobsDone++;
    fx(s, 'job');
    log(s, 'good', `Grand coup réussi : ${h.title} ${dice}. ${gains.join(', ')}, +10 heat.`);
    news(s, 6, `Le casse du siècle ?`, `${h.title} : la police n’a aucune piste. Le butin dépasserait tout ce qu’on a vu en ville.`);
  } else {
    s.heat = clamp(s.heat + 10, 0, 100);
    for (const m of men) if (chance(0.4)) { m.status = 'blessé'; m.statusWeeks = randInt(2, 4); }
    men.forEach((m) => award(s, m, 2, h.stat));
    fx(s, 'jobfail');
    log(s, 'bad', `Grand coup raté : ${h.title} ${dice}. L’équipe s’enfuit les mains vides (+10 heat).`);
    news(s, 4, 'Fusillade et fuite éperdue', `${h.title} : les malfaiteurs ont dû renoncer. Deux passants blessés.`);
  }
}

export const heistAvailable = (s: GameState) => activeMembers(s).filter((m) => s.heist && memberCity(m) === s.heist.city && !onHeist(s, m.id));
