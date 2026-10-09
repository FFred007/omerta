// Le cercle du Don : consigliere, anciens et capos. Ils conseillent, gardent rancune, et votent pour l'héritier.
import { FIRST_NAMES, LAST_NAMES } from './data';
import { childAge, crown, currentHeir } from './family';
import { finalize } from './score';
import { donOf } from './don';
import { chance, clamp, log, news, pick, randInt, winChance } from './state';
import type { Child, GameState, Member, Notable, PendingEvent } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

const NOTABLE_NICKS = ['le Sage', 'la Fouine', 'Doigts d’Or', 'le Taureau', 'l’Évêque', 'Bouche Cousue', 'le Dentiste', 'Belles Manières', 'le Gros', 'la Belette', 'Quatre-Saisons', 'le Pharmacien'];
export function makeNotable(role: Notable['role'], id: string, age: number, used: Set<string>, affinity: number): Notable {
  let name = '';
  const lasts = new Set([...used].map((n) => n.split(' ').slice(1).join(' ')));
  for (let i = 0; i < 40 && (!name || used.has(name) || lasts.has(name.split(' ').slice(1).join(' '))); i++) name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  used.add(name);
  const nick = pick(NOTABLE_NICKS.filter((n) => !used.has(n))) ?? 'le Vieux';
  used.add(nick);
  return { id, role, name, nickname: nick, seed: randInt(1, 1e9), age, affinity, rivalPull: randInt(5, 25) };
}

export const GIFT_COST = 800;
export const PRESENT_COST = 1500;
export const PRESENT_GAIN = 8;
export const FAVOR_MAX = 40;
const CAPO_PULL = 25;
const GRUDGE_PULL = 20;

export const circle = (s: GameState) => s.circle ?? [];
export const consigliere = (s: GameState) => circle(s).find((n) => n.role === 'consigliere');
export const notableAge = (s: GameState, n: Notable) => n.age + Math.floor((s.week - 1) / 6);
/** Un consigliere qui t'aime te prévient des complots */
export const loyalAdvisor = (s: GameState) => (consigliere(s)?.affinity ?? 0) >= 40;

function usedNames(s: GameState) {
  return new Set([...s.members.map((m) => m.name), ...circle(s).map((n) => n.name), ...circle(s).map((n) => n.nickname)]);
}

/** Partie rapide : le Don a déjà son consigliere et ses anciens */
export function initCircle(s: GameState) {
  if (s.circle) return;
  const used = usedNames(s);
  s.circle = [
    { ...makeNotable('consigliere', 'consigliere', 61, used, 45), name: 'Tommaso Ferri', nickname: 'l’Avvocato', seed: 7741 },
    makeNotable('ancien', 'ancien1', 68, used, randInt(20, 40)),
    makeNotable('ancien', 'ancien2', 72, used, randInt(15, 35)),
  ];
  s.heirFavor ??= 0;
}

// ---------- Actions ----------
export function giftBlocker(s: GameState, lastGift?: number) {
  if (lastGift !== undefined && s.week - lastGift < 2) return 'Un cadeau toutes les deux semaines, pas plus.';
  if (s.dirty + s.clean < GIFT_COST) return `Il faut ${fmt(GIFT_COST)}.`;
  return null;
}
function pay(s: GameState, cost: number) {
  const d = Math.min(s.dirty, cost);
  s.dirty -= d;
  s.clean -= cost - d;
}
const giftGain = (s: GameState) => 10 + Math.max(0, (donOf(s)?.verbe ?? 5) - 5) * 2;

export function giftNotable(s: GameState, id: string): Result {
  const n = circle(s).find((x) => x.id === id);
  if (!n) return fail('Introuvable.');
  const why = giftBlocker(s, n.lastGift);
  if (why) return fail(why);
  pay(s, GIFT_COST);
  n.lastGift = s.week;
  const g = giftGain(s);
  n.affinity = clamp(n.affinity + g, -100, 100);
  if (n.grudge && n.affinity >= 50) { n.grudge = false; log(s, 'good', `${n.name} « ${n.nickname} » enterre sa rancune.`); }
  log(s, 'neutral', `Le Don offre un cadeau à ${n.name} (+${g} d’affinité).`);
  return ok;
}
export function giftCapo(s: GameState, memberId: number): Result {
  const m = s.members.find((x) => x.id === memberId && x.rank === 'capo' && !x.isDon && !x.isChild);
  if (!m) return fail('Introuvable.');
  const why = giftBlocker(s, m.lastGift);
  if (why) return fail(why);
  pay(s, GIFT_COST);
  m.lastGift = s.week;
  const g = giftGain(s);
  m.loyalty = clamp(m.loyalty + g, 0, 100);
  if (m.grudge && m.loyalty >= 60) { m.grudge = false; log(s, 'good', `${m.nickname} enterre sa rancune.`); }
  log(s, 'neutral', `Le Don offre un cadeau à ${m.nickname} (loyauté +${g}).`);
  return ok;
}

export const heirMember = (s: GameState, h?: Child) => (h?.memberId ? s.members.find((m) => m.id === h.memberId) : undefined);

export function presentBlocker(s: GameState) {
  const h = currentHeir(s);
  if (!donOf(s)) return 'Il faut un Don pour présenter son héritier.';
  if (!h) return 'Il n’y a pas d’héritier à présenter.';
  if (!heirMember(s, h) && childAge(s, h) < 12) return 'L’héritier est trop jeune : à partir de 12 ans.';
  if (s.lastPresent !== undefined && s.week - s.lastPresent < 4) return `Une présentation toutes les quatre semaines (encore ${4 - (s.week - s.lastPresent)}).`;
  if ((s.heirFavor ?? 0) >= FAVOR_MAX) return 'Le cercle connaît déjà bien l’héritier.';
  if (s.dirty + s.clean < PRESENT_COST) return `Il faut ${fmt(PRESENT_COST)}.`;
  return null;
}
/** Un dîner avec le cercle : l'héritier se fait connaître */
export function presentHeir(s: GameState): Result {
  const why = presentBlocker(s);
  if (why) return fail(why);
  pay(s, PRESENT_COST);
  s.lastPresent = s.week;
  s.heirFavor = Math.min(FAVOR_MAX, (s.heirFavor ?? 0) + PRESENT_GAIN);
  const h = currentHeir(s)!;
  log(s, 'good', `Le Don présente ${h.name} au cercle, au dessert. Les anciens hochent la tête (+${PRESENT_GAIN} pour l’héritier).`);
  return ok;
}

// ---------- Le vote ----------
export type Voter = { id: string; name: string; kind: 'notable' | 'capo'; forHeir: number; pull: number; yes: boolean; grudge: boolean; member?: Member; notable?: Notable };

function pretenderScore(m: Member) { return (m.level ?? 0) * 2 + (m.grudge ? 10 : 0) + (100 - m.loyalty) / 10; }
/** Le capo qui disputerait la place à l'héritier */
export function pretender(s: GameState, exclude?: number): Member | undefined {
  const hm = heirMember(s, currentHeir(s));
  return s.members
    .filter((m) => m.rank === 'capo' && !m.isDon && !m.isChild && m.id !== hm?.id && m.id !== exclude && m.status !== 'prison')
    .sort((a, b) => pretenderScore(b) - pretenderScore(a))[0];
}

export function heirBonus(s: GameState, h?: Child) {
  if (!h) return 0;
  const m = heirMember(s, h);
  return (s.heirFavor ?? 0) + (m ? (m.level ?? 0) * 3 : 0) + h.education.length * 3;
}

/** Si le Don tombait aujourd'hui : chaque voix, et qui l'emporterait */
export function heirTally(s: GameState, rival?: Member) {
  const h = currentHeir(s);
  const pre = rival ?? pretender(s);
  const bonus = heirBonus(s, h);
  const voters: Voter[] = [];
  for (const n of circle(s)) {
    const forHeir = Math.round(n.affinity / 2 + bonus);
    const pull = (n.rivalPull ?? 20) + (n.grudge ? GRUDGE_PULL : 0);
    voters.push({ id: n.id, name: `${n.name} « ${n.nickname} »`, kind: 'notable', forHeir, pull, yes: forHeir > pull, grudge: !!n.grudge, notable: n });
  }
  const hm = heirMember(s, h);
  for (const m of s.members.filter((x) => x.rank === 'capo' && !x.isDon && !x.isChild && x.id !== pre?.id && x.id !== hm?.id)) {
    const forHeir = Math.round(m.loyalty / 2 + bonus);
    const pull = CAPO_PULL + (m.grudge ? GRUDGE_PULL : 0);
    voters.push({ id: String(m.id), name: `${m.name} « ${m.nickname} »`, kind: 'capo', forHeir, pull, yes: forHeir > pull, grudge: !!m.grudge, member: m });
  }
  const yes = voters.filter((v) => v.yes).length;
  const needed = Math.floor(voters.length / 2) + 1;
  return { heir: h, pretender: pre, voters, yes, needed, wins: !pre || yes >= needed };
}

/** Prendre le trône par la force : l'héritier et ses fidèles contre le prétendant et les siens */
export function forceChance(s: GameState, t: ReturnType<typeof heirTally>) {
  const hm = heirMember(s, t.heir);
  // la garde du Don se bat pour l'héritier à pleine force, les autres soldats à 30 % ; les capos et anciens votent avec leurs hommes
  const mine = (hm?.force ?? 4) + t.voters.filter((v) => v.yes && v.member).reduce((a, v) => a + v.member!.force, 0)
    + s.members.filter((m) => m.rank !== 'capo' && !m.isChild && !m.isDon && m.status === 'actif').reduce((a, m) => a + m.force * (m.crew === 'garde' ? 1 : 0.3), 0);
  const theirs = (t.pretender?.force ?? 5) + 3 + t.voters.filter((v) => !v.yes && v.member).reduce((a, v) => a + v.member!.force * 0.5, 0) + t.voters.filter((v) => !v.yes && v.notable).length;
  return winChance(mine, theirs);
}

/** Appelé quand l'héritier adulte doit prendre la place : le cercle vote */
export function startVote(s: GameState, heir: Member, why: string, rival?: Member) {
  const t = heirTally(s, rival);
  if (!t.pretender) { crown(s, heir, why); return; }
  const p = forceChance(s, t);
  s.pendingEvent = {
    key: 'ci_vote', title: `Le cercle choisit le prochain Don`,
    text: `Dans l'arrière-salle, le consigliere, les anciens et les capos votent : ${heir.name} ou ${t.pretender.name} « ${t.pretender.nickname} ». ${t.yes} voix sur ${t.voters.length} pour ${heir.name} (il en faut ${t.needed}).${t.wins ? ' La majorité est acquise.' : ' La majorité lui échappe.'}`,
    data: { heir: heir.id, pretender: t.pretender.id, why, p, no: t.voters.filter((v) => !v.yes).map((v) => v.id).join(',') },
    choices: t.wins
      ? [{ label: `${heir.name} est élu${heir.sex === 'f' ? 'e' : ''}`, hint: `${t.pretender.nickname} s’incline${t.voters.some((v) => !v.yes) ? ' ; ceux qui ont voté contre garderont rancune' : ''}`, effect: 'ci_win' }]
      : [
        { label: 'Prendre le trône par la force', hint: `${Math.round(p * 100)} % : ${t.pretender.nickname} et ses partisans abattus · sinon ${heir.name} est tué${heir.sex === 'f' ? 'e' : ''} et la lignée s'éteint`, effect: 'ci_force' },
        { label: 'S’incliner', hint: `${t.pretender.nickname} prend la famille : la lignée s’achève (score ×0,5)`, effect: 'ci_yield' },
      ],
  };
}

/** Ceux qui ont voté contre l'héritier, figés au moment du vote */
function against(s: GameState, ev: PendingEvent) {
  const ids = new Set(String(ev.data?.no ?? '').split(',').filter(Boolean));
  return { members: s.members.filter((m) => ids.has(String(m.id))), notables: circle(s).filter((n) => ids.has(n.id)) };
}
function markGrudges(s: GameState, ev: PendingEvent) {
  const a = against(s, ev);
  for (const m of a.members) { m.grudge = true; m.loyalty = clamp(m.loyalty - 10, 0, 100); }
  for (const n of a.notables) { n.grudge = true; n.affinity = clamp(n.affinity - 10, -100, 100); }
}

export function resolveCircleEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('ci_')) return false;
  const heir = s.members.find((m) => m.id === Number(ev.data?.heir));
  const pre = s.members.find((m) => m.id === Number(ev.data?.pretender));
  const why = String(ev.data?.why ?? 'succession');
  if (!heir) return true;
  switch (effect) {
    case 'ci_win':
      markGrudges(s, ev);
      if (pre) { pre.grudge = true; pre.loyalty = clamp(pre.loyalty - 15, 0, 100); }
      crown(s, heir, why);
      log(s, 'neutral', `${pre?.nickname ?? 'Le prétendant'} a baisé la bague. Il n’oubliera pas.`);
      break;
    case 'ci_force':
      if (chance(Number(ev.data?.p ?? 0))) {
        const a = against(s, ev);
        const losers = [pre, ...a.members].filter(Boolean) as Member[];
        const ids = new Set(losers.map((m) => m.id));
        s.members = s.members.filter((m) => !ids.has(m.id));
        s.circle = circle(s).filter((n) => !a.notables.includes(n));
        s.respect = clamp(s.respect - 5, 0, 150);
        s.heat = clamp(s.heat + 12, 0, 100);
        crown(s, heir, 'prise de pouvoir');
        log(s, 'bad', `Une nuit de couteaux : ${losers.map((m) => m.nickname).join(', ')} ne verront pas le jour se lever. ${heir.name} règne sur une famille saignée (+12 heat, −5 respect).`);
        news(s, 6, 'Nuit sanglante chez les ' + s.familyName.replace(/^Famille /, ''), 'Plusieurs lieutenants de la famille retrouvés morts au petit matin. La guerre de succession est terminée.');
        if (!consigliere(s)) s.circle = [...circle(s), makeNotable('consigliere', 'consigliere', 55, usedNames(s), 20)];
      } else {
        finalize(s, 'mort', `${heir.name} a voulu prendre le trône par la force. ${pre?.name ?? 'Le prétendant'} l'attendait : la lignée s'éteint, la famille change de maître.`);
      }
      break;
    case 'ci_yield':
      finalize(s, 'mort', `Le cercle a choisi ${pre?.name ?? 'un autre'} « ${pre?.nickname ?? ''} ». ${heir.name} s'incline : la lignée s'achève.`);
      break;
  }
  return true;
}

// ---------- La vie du cercle ----------
export function circleTick(s: GameState) {
  if (!s.circle || !donOf(s)) return;
  // la rancune ronge, sauf si le consigliere arrondit les angles
  for (const m of s.members.filter((x) => x.grudge && x.rank === 'capo' && !x.isDon)) {
    if (!loyalAdvisor(s) && chance(0.5)) m.loyalty = clamp(m.loyalty - 1, 0, 100);
  }
  // les anciens et le consigliere vieillissent
  for (const n of [...s.circle]) {
    const age = notableAge(s, n);
    if (age >= 74 && chance((age - 72) * 0.006)) {
      s.circle = s.circle.filter((x) => x !== n);
      log(s, 'neutral', `${n.name} « ${n.nickname} », ${n.role === 'consigliere' ? 'le consigliere' : 'un ancien de la famille'}, s’est éteint à ${age} ans.`);
      news(s, 2, `Obsèques de ${n.name}`, `Toute la ${s.familyName} suivait le cercueil.`);
      const fresh = makeNotable(n.role, n.role === 'consigliere' ? 'consigliere' : `ancien${s.week}`, n.role === 'consigliere' ? 56 : 64, usedNames(s), randInt(10, 30));
      s.circle.push(fresh);
      log(s, 'neutral', `${fresh.name} « ${fresh.nickname} » prend sa place${n.role === 'consigliere' ? ' de consigliere' : ' parmi les anciens'}.`);
    }
  }
  // un ancien rancunier peut retourner un capo
  const sour = s.circle.filter((n) => n.grudge && n.affinity < 0);
  if (sour.length && chance(0.04)) {
    const capos = s.members.filter((m) => m.rank === 'capo' && !m.isDon && !m.isChild && !m.grudge);
    const m = capos[randInt(0, capos.length - 1)];
    if (m) {
      m.loyalty = clamp(m.loyalty - 12, 0, 100);
      log(s, 'bad', loyalAdvisor(s) ? `Ton consigliere t’avertit : ${sour[0].name} « ${sour[0].nickname} » monte ${m.nickname} contre toi (−12 loyauté).` : `${m.nickname} te regarde autrement depuis quelques jours (−12 loyauté).`);
    }
  }
}
