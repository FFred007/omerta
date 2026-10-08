// Plus tu es puissant, plus tu es une cible : coalition des rivaux, capos ambitieux, tentatives d'assassinat.
import { donOf } from './don';
import { killMember } from './engine';
import { chance, clamp, log, news, pick, randInt, rival, winChance } from './state';
import { cityName, cityOf, donCity, governor, memberCity } from './cities';
import type { GameState, Member, PendingEvent } from './types';

export const COALITION_AT = 5; // quartiers à partir desquels les rivaux s'organisent
export const COALITION_WEEKS = 8;

export const inCoalition = (s: GameState) => (s.coalitionWeeks ?? 0) > 0;

/** Défense du Don face à des tueurs : sa Poigne + ses gardes du corps postés avec lui */
function bodyguards(s: GameState) {
  const don = donOf(s);
  if (!don) return 0;
  const guards = s.members.filter((m) => m.status === 'actif' && !m.isDon && m.assignment === don.assignment);
  const safe = s.districts.find((d) => d.id === don.assignment)?.businesses.some((b) => b.kind === 'planque') ? 5 : 0;
  return don.force + guards.reduce((t, m) => t + m.force, 0) / 2 + safe;
}
const killers = (s: GameState, rid: string) => Math.max(6, (rival(s, rid)?.strength ?? 10) * 0.45);

/** Chance que des tueurs fidèles éliminent un gouverneur rebelle */
export function hitChance(s: GameState, m: Member) {
  const loyal = s.members.filter((x) => x.status === 'actif' && !x.isDon && x.id !== m.id && memberCity(x) !== memberCity(m)).sort((a, b) => b.force - a.force).slice(0, 3);
  const guards = s.members.filter((x) => x.status === 'actif' && x.id !== m.id && memberCity(x) === memberCity(m) && !x.isDon && !x.isChild);
  return winChance(loyal.reduce((t, x) => t + x.force, 0) + 2, m.force + 2 + guards.reduce((t, x) => t + x.force, 0) / 3);
}

/** Le gouverneur part avec la ville : quartiers rendus aux indépendants, ses hommes avec lui */
function secede(s: GameState, m: Member, city: string) {
  const men = s.members.filter((x) => memberCity(x) === city && !x.isDon && !x.isChild);
  const force = men.reduce((t, x) => t + x.force, 0);
  const lost = s.districts.filter((d) => d.owner === 'player' && cityOf(d) === city);
  lost.forEach((d) => { d.owner = 'neutral'; d.garrison = Math.max(8, Math.round(force / Math.max(1, lost.length)) + 4); d.bribedCop = false; });
  const ids = new Set(men.map((x) => x.id));
  s.members = s.members.filter((x) => !ids.has(x.id));
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => !ids.has(id))));
  s.orders = s.orders.filter((o) => o.memberIds.length);
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => !ids.has(id))));
  if (s.cities?.[city]) { s.cities[city].governorId = null; s.cities[city].open = false; }
  s.respect = clamp(s.respect - 8, 0, 150);
  log(s, 'bad', `${m.nickname} fait sécession avec ${men.length} homme${men.length > 1 ? 's' : ''} : ${cityName(city)} est perdue (−8 respect).`);
  news(s, 5, `Schisme à ${cityName(city)}`, `${m.name} rompt avec la ${s.familyName} et garde la ville pour lui.`);
}

export function pressureTick(s: GameState) {
  // coalition
  if (inCoalition(s)) {
    s.coalitionWeeks! -= 1;
    if (!s.coalitionWeeks) log(s, 'neutral', 'La coalition des familles se disloque. Chacun retourne à ses affaires.');
  }
  // (la coalition naît désormais d'un vote de la Commission des Dons)
  if (s.pendingEvent || s.status !== 'playing') return;
  const don = donOf(s);

  // un capo ambitieux
  const ambitious = s.members.filter((m) => m.rank === 'capo' && !m.isDon && !m.isChild && (m.level ?? 0) >= 3 && m.loyalty < 45 && m.status === 'actif');
  if (don && ambitious.length && chance(0.06)) {
    const m = pick(ambitious);
    s.pendingEvent = {
      key: 'ambition', title: `${m.nickname} veut ta place`,
      text: `On murmure que ${m.name} « ${m.nickname} », capo de niveau ${m.level}, compte ses alliés parmi tes hommes. Sa loyauté est tombée à ${m.loyalty}.`,
      data: { member: m.id },
      choices: [
        { label: 'Le faire disparaître', hint: '+3 respect, les autres hommes −5 loyauté', effect: 'pr_amb_kill' },
        { label: 'Le couvrir d’or', hint: '−2 500 sale · sa loyauté +35', effect: 'pr_amb_pay', disabled: s.dirty < 2500 },
        { label: 'Faire comme si de rien n’était', hint: 'Il pourrait tenter sa chance', effect: 'pr_amb_ignore' },
      ],
    };
    return;
  }

  // un gouverneur peu loyal fait sécession
  const rebels = Object.entries(s.cities ?? {})
    .map(([city]) => ({ city, g: governor(s, city) }))
    .filter((x) => x.g && x.city !== donCity(s) && x.g.loyalty < 40 && x.g.status === 'actif');
  if (rebels.length && chance(0.06)) {
    const { city, g } = pick(rebels);
    const m = g!;
    s.pendingEvent = {
      key: 'secession', title: `${m.nickname} se proclame Don de ${cityName(city)}`,
      text: `Loin du Don, ${m.name} « ${m.nickname} » (loyauté ${m.loyalty}) a réuni tes hommes de ${cityName(city)} : il garde la caisse et menace de faire sécession.`,
      data: { member: m.id, city },
      choices: [
        { label: 'Le couvrir d’or', hint: '−3 000 sale · loyauté +30', effect: 'pr_sec_pay', disabled: s.dirty < 3000 },
        { label: 'Envoyer des tueurs', hint: `${Math.round(hitChance(s, m) * 100)} % de l’éliminer · sinon il part avec la ville`, effect: 'pr_sec_hit' },
        { label: 'Le laisser partir', hint: `Tu perds tes quartiers de ${cityName(city)} et les hommes qui y sont`, effect: 'pr_sec_go' },
      ],
    };
    return;
  }

  // tentative d'assassinat
  const enemies = s.rivals.filter((r) => r.alive && !r.alliance && (r.war || r.relation <= -60 || (inCoalition(s) && r.relation <= -30)));
  if (don && don.status === 'actif' && enemies.length && chance(0.035)) {
    const r = pick(enemies);
    const p = winChance(bodyguards(s), killers(s, r.id));
    s.pendingEvent = assassinationEvent(s, r.id, p);
  }
}

function assassinationEvent(s: GameState, rid: string, p: number): PendingEvent {
  const r = rival(s, rid)!;
  return {
    key: 'attentat', title: 'Tentative d’assassinat !',
    text: `Une Packard ralentit devant le restaurant où dîne le Don. Les vitres se baissent : les tueurs de ${r.name}.`,
    data: { rival: rid },
    choices: [
      { label: 'Riposter', hint: `${Math.round(p * 100)} % de les repousser (Poigne du Don + ses gardes) · sinon blessé, voire tué`, effect: 'pr_fight' },
      { label: 'Fuir par les cuisines', hint: 'Le Don s’en sort, mais la rue le saura (−4 respect)', effect: 'pr_flee' },
    ],
  };
}

export function resolvePressureEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('pr_')) return false;
  const m = s.members.find((x) => x.id === Number(ev.data?.member));
  const don = donOf(s);
  switch (effect) {
    case 'pr_amb_kill':
      if (m) {
        killMember(s, m, 'a été retrouvé dans le lac');
        s.respect = clamp(s.respect + 3, 0, 150);
        s.members.filter((x) => !x.isDon && !x.isChild).forEach((x) => (x.loyalty = clamp(x.loyalty - 5, 0, 100)));
        log(s, 'bad', `${m.nickname} ne trahira personne. Les autres ont compris le message.`);
      }
      break;
    case 'pr_amb_pay':
      s.dirty -= 2500;
      if (m) { m.loyalty = clamp(m.loyalty + 35, 0, 100); log(s, 'neutral', `${m.nickname} remercie le Don. Pour l'instant.`); }
      break;
    case 'pr_amb_ignore':
      if (m && don && chance(0.5)) {
        if (chance(0.35)) {
          log(s, 'bad', `${m.nickname} a tenté un coup d'État. Le Don est abattu dans sa propre maison.`);
          s.members = s.members.filter((x) => x.id !== m.id);
          killMember(s, don, `a été trahi et abattu par ${m.name}, son propre capo`);
        } else {
          don.status = 'blessé';
          don.statusWeeks = randInt(2, 4);
          don.scars = (don.scars ?? 0) + 1;
          s.members = s.members.filter((x) => x.id !== m.id);
          log(s, 'bad', `${m.nickname} a tenté un coup d'État. Le Don s'en sort blessé ; le traître a fui la ville.`);
          news(s, 5, 'Fusillade chez le Don', 'Règlement de comptes interne dans la famille de Little Sicily. Le Don aurait survécu.');
        }
      }
      break;
    case 'pr_sec_pay':
      s.dirty -= 3000;
      if (m) { m.loyalty = clamp(m.loyalty + 30, 0, 100); log(s, 'neutral', `${m.nickname} rentre dans le rang. Pour l'instant.`); }
      break;
    case 'pr_sec_hit': {
      const city = String(ev.data?.city);
      if (!m) break;
      if (Math.random() < hitChance(s, m)) {
        killMember(s, m, 'a été abattu sur ordre du Don');
        if (s.cities?.[city]) s.cities[city].governorId = null;
        s.respect = clamp(s.respect + 3, 0, 150);
        log(s, 'good', `${m.nickname} ne gouvernera plus rien. ${cityName(city)} reste à la famille, sans gouverneur.`);
      } else secede(s, m, city);
      break;
    }
    case 'pr_sec_go':
      if (m) secede(s, m, String(ev.data?.city));
      break;
    case 'pr_fight': {
      const r = rival(s, String(ev.data?.rival));
      if (!don || !r) break;
      const p = winChance(bodyguards(s), killers(s, r.id));
      if (Math.random() < p) {
        r.strength = Math.max(3, r.strength - 2);
        s.respect = clamp(s.respect + 6, 0, 150);
        log(s, 'good', `Le Don et ses gardes repoussent les tueurs de ${r.name} (+6 respect, ${r.name} −2 force).`);
        news(s, 5, 'Le Don survit à une fusillade', `Les tueurs de ${r.boss} sont repartis les mains vides, et un peu moins nombreux.`);
      } else if (Math.random() < 0.3) {
        killMember(s, don, `a été abattu par les tueurs de ${r.name}`, r.id);
      } else {
        don.status = 'blessé';
        don.statusWeeks = randInt(2, 4);
        don.scars = (don.scars ?? 0) + 1;
        s.respect = clamp(s.respect - 2, 0, 150);
        log(s, 'bad', `Le Don est touché. Il survivra, mais gardera la cicatrice (${don.statusWeeks} sem.).`);
        news(s, 5, 'Le Don blessé par balle', `Les tueurs de ${r.boss} ont frappé. Le Don est hospitalisé sous bonne garde.`);
      }
      break;
    }
    case 'pr_flee':
      s.respect = clamp(s.respect - 4, 0, 150);
      log(s, 'neutral', 'Le Don file par les cuisines. Vivant, mais la rue en parle (−4 respect).');
      break;
  }
  return true;
}
