// Le réseau d'influence : des gens, pas des boutons. Presse, police, justice, politique, communauté, fédéraux.
import { donHasTalent, donOf } from './don';
import { FIRST_NAMES, LAST_NAMES } from './data';
import { loyalAdvisor } from './circle';
import { chance, clamp, log, news, owned, pick, randInt } from './state';
import type { GameState, PendingEvent } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export type Milieu = 'presse' | 'police' | 'justice' | 'politique' | 'communaute' | 'federaux';
export const MILIEUX: Record<Milieu, string> = {
  presse: 'La presse', police: 'La police', justice: 'La justice', politique: 'La politique', communaute: 'La communauté', federaux: 'Les fédéraux',
};

export type ContactId = 'reporter' | 'redac' | 'capitaine' | 'commissaire' | 'greffier' | 'procureur' | 'maire' | 'cure' | 'orphelinat' | 'agent';

export interface ActionDef { label: string; cost: number; cooldown: number; desc: string }
export interface ContactDef {
  id: ContactId;
  milieu: Milieu;
  name: string;
  role: string;
  respect: number; // respect requis
  needs?: ContactId | 'judge' | 'councilman'; // il faut être introduit par…
  retainer: number; // $ propres / semaine (0 = pas de mensualité)
  passive: string; // effet tant qu'il est payé
  heat?: number; // heat par semaine (négatif) tant qu'il est payé
  dossier?: number; // dossier fédéral par semaine (négatif)
  raids?: number; // multiplicateur des descentes
  action?: ActionDef; // action ponctuelle
  exposure: number; // risque de scandale (relatif)
}

export const CONTACTS: ContactDef[] = [
  { id: 'reporter', milieu: 'presse', name: 'Eddie Malone', role: 'reporter au Corrano Herald', respect: 8, retainer: 150,
    passive: '−1 heat par semaine : ses articles parlent d’autre chose', heat: -1, exposure: 1,
    action: { label: 'Étouffer une affaire', cost: 600, cooldown: 2, desc: '−8 heat tout de suite' } },
  { id: 'redac', milieu: 'presse', name: 'Walter Grimes', role: 'rédacteur en chef du Herald', respect: 35, needs: 'reporter', retainer: 500,
    passive: '−2 heat par semaine : le Herald ne parle plus de toi', heat: -2, exposure: 1,
    action: { label: 'Une contre un rival', cost: 1200, cooldown: 4, desc: 'La police tombe sur la famille la plus hostile : −3 force pour elle' } },
  { id: 'capitaine', milieu: 'police', name: "Capitaine Frank O'Rourke", role: 'commissariat central', respect: 20, retainer: 600,
    passive: 'Descentes −30 % dans tous tes quartiers', raids: 0.7, exposure: 1.2,
    action: { label: 'Faire relâcher un homme', cost: 700, cooldown: 3, desc: 'Ton homme en prison depuis le plus longtemps sort sans charges' } },
  { id: 'commissaire', milieu: 'police', name: 'Commissaire Delaney', role: 'chef de la police municipale', respect: 45, needs: 'capitaine', retainer: 1200,
    passive: 'Descentes −50 % et −2 heat par semaine', raids: 0.5, heat: -2, exposure: 1.4 },
  { id: 'greffier', milieu: 'justice', name: 'Arthur Pell', role: 'greffier du tribunal fédéral', respect: 15, retainer: 200,
    passive: '−1 au dossier fédéral par semaine : des pièces s’égarent', dossier: -1, exposure: 1,
    action: { label: 'Égarer un dossier', cost: 900, cooldown: 3, desc: '−10 au dossier fédéral' } },
  { id: 'procureur', milieu: 'justice', name: 'Procureur adjoint Vance', role: 'parquet fédéral', respect: 40, needs: 'judge', retainer: 1000,
    passive: '−3 au dossier fédéral par semaine, et +25 % de chances d’acquittement au procès', dossier: -3, exposure: 1.6 },
  { id: 'maire', milieu: 'politique', name: 'Maire Thornton', role: 'hôtel de ville', respect: 60, needs: 'councilman', retainer: 2000,
    passive: '−3 heat par semaine et descentes −20 %', heat: -3, raids: 0.8, exposure: 1.3 },
  { id: 'cure', milieu: 'communaute', name: 'Père Anselmo', role: 'curé de Saint-Janvier', respect: 5, retainer: 100,
    passive: '+1 satisfaction par semaine pour tous tes commerçants', exposure: 0.4,
    action: { label: 'Alibi du curé', cost: 400, cooldown: 3, desc: '−6 heat : « il était à la messe »' } },
  { id: 'orphelinat', milieu: 'communaute', name: 'Orphelinat Sainte-Rita', role: 'œuvre de charité', respect: 0, retainer: 0,
    passive: 'Aucune mensualité : tu donnes quand tu veux', exposure: 0,
    action: { label: 'Faire un don', cost: 1000, cooldown: 4, desc: '−5 heat, +3 respect, −2 au dossier fédéral' } },
  { id: 'agent', milieu: 'federaux', name: 'Agent spécial Kessler', role: 'Bureau fédéral de la Prohibition', respect: 70, needs: 'greffier', retainer: 2500,
    passive: '−5 au dossier fédéral par semaine, et il te prévient : la première inculpation est repoussée', dossier: -5, exposure: 2 },
];
export const contactDef = (id: ContactId) => CONTACTS.find((c) => c.id === id)!;

// ---------- Les personnes derrière les postes ----------
export type Temper = 'venal' | 'prudent' | 'ambitieux' | 'integre';
export const TEMPERS: Record<Temper, { name: string; desc: string; base: number }> = {
  venal: { name: 'Vénal', desc: 'facile à acheter, mais de plus en plus gourmand', base: 0.85 },
  prudent: { name: 'Prudent', desc: 'dur à convaincre, mais deux fois moins exposé aux scandales', base: 0.55 },
  ambitieux: { name: 'Ambitieux', desc: 'se vend au plus offrant : deux fois plus de risque de double jeu', base: 0.45 },
  integre: { name: 'Intègre', desc: 'presque impossible à acheter ; s’il refuse, il peut te dénoncer', base: 0.15 },
};
export interface Person { name: string; temper: Temper; seed: number; since: number; coerced?: boolean }
/** Tempérament des premiers titulaires */
const FIRST_TEMPER: Record<ContactId, Temper> = {
  reporter: 'venal', redac: 'prudent', capitaine: 'venal', commissaire: 'ambitieux', greffier: 'venal',
  procureur: 'prudent', maire: 'venal', cure: 'prudent', orphelinat: 'prudent', agent: 'ambitieux',
};
/** Titre porté devant le nom des remplaçants */
const TITLE: Partial<Record<ContactId, string>> = {
  capitaine: 'Capitaine', commissaire: 'Commissaire', procureur: 'Procureur adjoint', maire: 'Maire', cure: 'Père', agent: 'Agent spécial',
};

export interface ContactState {
  active: boolean; // payé
  price: number;
  lastUse?: number;
  burned?: boolean; // ancien format : grillé pour toujours
  known?: boolean;
  person?: Person;
  vacantUntil?: number; // poste vide jusqu'à cette semaine
  refusedUntil?: number; // a refusé : on ne peut pas le revoir avant
  turned?: { rivalId: string; since: number }; // double jeu, en secret
  generation?: number;
}

export function contactState(s: GameState, id: ContactId): ContactState {
  s.contacts ??= {};
  const st = (s.contacts[id] ??= { active: false, price: contactDef(id).retainer });
  // ancien format : un contact grillé laisse un poste vide, repris bientôt
  if (st.burned) { st.burned = false; st.active = false; st.person = undefined; st.vacantUntil ??= s.week; }
  if (!st.person && st.vacantUntil === undefined) st.person = { name: contactDef(id).name, temper: FIRST_TEMPER[id], seed: id.length * 7919, since: 0 };
  return st;
}
/** Payé et fidèle : ses effets s'appliquent */
export const isActive = (s: GameState, id: ContactId) => !!s.contacts?.[id]?.active && !s.contacts?.[id]?.turned;
/** Payé (qu'il joue double jeu ou non) : c'est ce que le joueur croit */
export const isPaid = (s: GameState, id: ContactId) => !!s.contacts?.[id]?.active;
export const activeContacts = (s: GameState) => CONTACTS.filter((c) => isActive(s, c.id));
export const paidContacts = (s: GameState) => CONTACTS.filter((c) => isPaid(s, c.id));
export const holderName = (s: GameState, id: ContactId) => contactState(s, id).person?.name ?? contactDef(id).name;

function introduced(s: GameState, c: ContactDef) {
  if (!c.needs) return true;
  if (c.needs === 'judge') return s.judge;
  if (c.needs === 'councilman') return s.councilman;
  return isActive(s, c.needs);
}

/** Pourquoi on ne peut pas (encore) recruter ce contact */
export function blocker(s: GameState, c: ContactDef): string | null {
  const st = contactState(s, c.id);
  if (st.vacantUntil !== undefined) return `Poste vacant : un remplaçant arrive dans ${Math.max(1, st.vacantUntil - s.week)} sem.`;
  if (st.refusedUntil !== undefined && st.refusedUntil > s.week) return `Il a refusé : pas avant ${st.refusedUntil - s.week} sem.`;
  if (s.respect < c.respect) return `Il faut ${c.respect} de respect`;
  if (!introduced(s, c)) {
    const by = c.needs === 'judge' ? 'le juge Halloran' : c.needs === 'councilman' ? 'le conseiller Doyle' : contactDef(c.needs as ContactId).name;
    return `Il faut être introduit par ${by}`;
  }
  return null;
}

/** Prix réel (le Verbe du Don fait baisser les tarifs) */
export function priceOf(s: GameState, id: ContactId) {
  const verbe = donOf(s)?.verbe ?? 5;
  const k = 1 - Math.max(0, verbe - 5) * 0.03;
  return Math.round(contactState(s, id).price * k);
}

// ---------- Approcher un titulaire ----------
export type Approach = 'enveloppe' | 'intermediaire' | 'chantage';
export const APPROACHES: Record<Approach, { name: string; desc: string }> = {
  enveloppe: { name: 'L’enveloppe', desc: 'une semaine de mensualité d’avance' },
  intermediaire: { name: 'Par un intermédiaire', desc: 'un de tes contacts fait les présentations : deux semaines d’avance, +25 %' },
  chantage: { name: 'Le chantage', desc: '2 faveurs, +35 % ; mais un homme contraint trahit plus volontiers' },
};
/** Un de tes contacts fidèles peut faire les présentations (même milieu, ou celui qui l'introduit) */
export function intermediary(s: GameState, id: ContactId): string | null {
  const c = contactDef(id);
  if (c.needs === 'judge' && s.judge) return 'le juge Halloran';
  if (c.needs === 'councilman' && s.councilman) return 'le conseiller Doyle';
  const by = activeContacts(s).find((x) => x.id !== id && (x.milieu === c.milieu || x.id === c.needs));
  return by ? holderName(s, by.id) : null;
}
export function approachChance(s: GameState, id: ContactId, how: Approach) {
  const p = contactState(s, id).person;
  if (!p) return 0;
  const verbe = donOf(s)?.verbe ?? 5;
  return clamp(TEMPERS[p.temper].base + (verbe - 5) * 0.03 + (how === 'intermediaire' ? 0.25 : how === 'chantage' ? 0.35 : 0), 0.05, 0.95);
}
export const approachCost = (s: GameState, id: ContactId, how: Approach) => (how === 'chantage' ? 0 : priceOf(s, id) * (how === 'intermediaire' ? 2 : 1));
export function approachBlocker(s: GameState, id: ContactId, how: Approach): string | null {
  const c = contactDef(id);
  const st = contactState(s, id);
  if (c.retainer === 0) return 'Pas de mensualité : utilise son action.';
  if (st.active) return 'Il travaille déjà pour toi.';
  const b = blocker(s, c);
  if (b) return b;
  if (how === 'intermediaire' && !intermediary(s, id)) return 'Aucun de tes contacts ne le connaît.';
  if (how === 'chantage' && s.favors < 2) return 'Il faut 2 faveurs.';
  if (s.clean < approachCost(s, id, how)) return `Il faut ${fmt(approachCost(s, id, how))} propres.`;
  return null;
}
export function approach(s: GameState, id: ContactId, how: Approach): Result {
  const why = approachBlocker(s, id, how);
  if (why) return fail(why);
  const c = contactDef(id);
  const st = contactState(s, id);
  const p = st.person!;
  const odds = approachChance(s, id, how);
  s.clean -= approachCost(s, id, how);
  if (how === 'chantage') s.favors -= 2;
  if (chance(odds)) {
    st.active = true;
    st.known = true;
    st.turned = undefined;
    p.coerced = how === 'chantage';
    log(s, 'good', `${p.name}, ${c.role}, émarge désormais chez toi (${fmt(priceOf(s, id))} propres par semaine)${how === 'chantage' ? ' : il n’a pas eu le choix' : ''}.`);
    return ok;
  }
  st.refusedUntil = s.week + 4;
  if (p.temper === 'integre' && chance(0.5)) {
    s.dossier = clamp((s.dossier ?? 0) + 5, 0, 100);
    log(s, 'police', `${p.name} refuse, et signale la tentative au parquet fédéral (+5 dossier).`);
  } else log(s, 'bad', `${p.name} refuse ${how === 'chantage' ? 'de céder au chantage' : 'l’enveloppe'}. Pas avant quatre semaines (${Math.round(odds * 100)} % de chances).`);
  return ok;
}
/** Compatibilité (bots, anciens tests) : l'enveloppe */
export const hire = (s: GameState, id: ContactId) => approach(s, id, 'enveloppe');

export function dismiss(s: GameState, id: ContactId): Result {
  const st = contactState(s, id);
  if (!st.active) return fail('Il ne travaille pas pour toi.');
  st.active = false;
  st.turned = undefined;
  log(s, 'neutral', `Tu cesses de payer ${holderName(s, id)}.`);
  return ok;
}

export function canUse(s: GameState, id: ContactId) {
  const c = contactDef(id);
  const st = contactState(s, id);
  if (!c.action) return 'Pas d’action';
  if (c.retainer > 0 && !st.active) return 'Il doit d’abord être à ta solde';
  if (st.turned) return 'Il promet, mais rien ne bouge…';
  if (c.retainer === 0 && blocker(s, c)) return blocker(s, c);
  if (st.lastUse !== undefined && s.week - st.lastUse < c.action.cooldown) return `Disponible dans ${c.action.cooldown - (s.week - st.lastUse)} sem.`;
  if (s.clean < c.action.cost) return `Il faut ${fmt(c.action.cost)} propres`;
  return null;
}

export function useAction(s: GameState, id: ContactId): Result {
  const why = canUse(s, id);
  if (why) return fail(why);
  const c = contactDef(id);
  const st = contactState(s, id);
  s.clean -= c.action!.cost;
  st.lastUse = s.week;
  switch (id) {
    case 'reporter':
      s.heat = clamp(s.heat - 8, 0, 100);
      log(s, 'good', `${holderName(s, id)} fait disparaître l'article de la une (−8 heat).`);
      break;
    case 'redac': {
      const r = [...s.rivals].filter((x) => x.alive).sort((a, b) => a.relation - b.relation)[0];
      if (r) {
        r.strength = Math.max(3, r.strength - 3);
        log(s, 'good', `Le Herald titre sur les crimes de ${r.name}. La police leur tombe dessus (−3 force).`);
        news(s, 4, `Les crimes de ${r.name} en pleine lumière`, `Enquête exclusive : la police promet une réponse « exemplaire ».`);
      }
      break;
    }
    case 'capitaine': {
      const m = [...s.members].filter((x) => x.status === 'prison').sort((a, b) => b.statusWeeks - a.statusWeeks)[0];
      if (m) {
        m.status = 'actif';
        m.statusWeeks = 0;
        log(s, 'good', `${m.nickname} sort du commissariat sans charges. ${holderName(s, id)} a égaré le procès-verbal.`);
      } else {
        s.clean += c.action!.cost;
        st.lastUse = undefined;
        return fail('Aucun de tes hommes n’est en prison.');
      }
      break;
    }
    case 'greffier':
      s.dossier = clamp((s.dossier ?? 0) - 10, 0, 100);
      log(s, 'good', 'Un carton entier de pièces à conviction s’est perdu entre deux étages (−10 dossier).');
      break;
    case 'cure':
      s.heat = clamp(s.heat - 6, 0, 100);
      log(s, 'good', `${holderName(s, id)} jure devant Dieu que le Don était à la messe (−6 heat).`);
      break;
    case 'orphelinat':
      s.heat = clamp(s.heat - 5, 0, 100);
      s.respect = clamp(s.respect + 3, 0, 150);
      s.dossier = clamp((s.dossier ?? 0) - 2, 0, 100);
      log(s, 'good', 'Le Don offre 1 000 $ à l’orphelinat Sainte-Rita. Photo dans le journal (−5 heat, +3 respect).');
      news(s, 2, 'Un bienfaiteur pour Sainte-Rita', 'Un homme d’affaires de Little Sicily offre un nouveau dortoir aux orphelins.');
      break;
  }
  return ok;
}

// ---------- Effets passifs (lus par la projection et le moteur) ----------
export const networkRetainers = (s: GameState) => paidContacts(s).reduce((t, c) => t + priceOf(s, c.id), 0);
/** `believed` : ce que le joueur croit (un contact qui joue double jeu compte encore) */
export const networkHeat = (s: GameState, believed = false) => (believed ? paidContacts(s) : activeContacts(s)).reduce((t, c) => t + (c.heat ?? 0), 0);
export const networkDossier = (s: GameState, believed = false) => (believed ? paidContacts(s) : activeContacts(s)).reduce((t, c) => t + (c.dossier ?? 0), 0);
export const networkRaids = (s: GameState) => activeContacts(s).reduce((t, c) => t * (c.raids ?? 1), 1);

// ---------- La vie du réseau ----------
function vacate(s: GameState, id: ContactId, weeks = randInt(2, 4)) {
  const st = contactState(s, id);
  st.active = false;
  st.turned = undefined;
  st.person = undefined;
  st.refusedUntil = undefined;
  st.vacantUntil = s.week + weeks;
}
const TEMPER_ODDS: [Temper, number][] = [['venal', 35], ['prudent', 30], ['ambitieux', 20], ['integre', 15]];
const PRICE_K: Record<Temper, number> = { venal: 1, prudent: 1.1, ambitieux: 1.15, integre: 1.3 };
/** Un nouveau titulaire prend le poste */
export function newHolder(s: GameState, id: ContactId, person?: Partial<Person>) {
  const st = contactState(s, id);
  const c = contactDef(id);
  let roll = Math.random() * 100;
  const temper = person?.temper ?? TEMPER_ODDS.find(([, w]) => (roll -= w) <= 0)![0];
  const name = person?.name ?? `${TITLE[id] ? TITLE[id] + ' ' : ''}${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  st.generation = (st.generation ?? 0) + 1;
  st.person = { name, temper, seed: randInt(1, 1e9), since: s.week };
  st.price = Math.round(c.retainer * PRICE_K[temper] * (1 + 0.1 * st.generation));
  st.vacantUntil = undefined;
  st.refusedUntil = undefined;
  st.active = false;
  st.turned = undefined;
  return st.person;
}

/** Chaque semaine : gourmandise, scandales, assassinats, mutations, double jeu, remplaçants */
export function networkTick(s: GameState) {
  for (const c of CONTACTS) {
    if (c.retainer === 0) continue;
    const st = contactState(s, c.id);
    // un remplaçant arrive
    if (st.vacantUntil !== undefined) {
      if (s.week >= st.vacantUntil) {
        const p = newHolder(s, c.id);
        if (st.known) log(s, 'neutral', `${c.role} : ${p.name} prend le poste (${TEMPERS[p.temper].name.toLowerCase()}). À approcher dans l’onglet Réseau.`);
      }
      continue;
    }
    if (!st.active) continue;
    const p = st.person!;
    if (p.temper === 'venal' && chance(0.06)) {
      st.price = Math.round(st.price * 1.2);
      log(s, 'money', `${p.name} devient gourmand : il demande désormais ${fmt(priceOf(s, c.id))} par semaine.`);
    }
    const scandal = 0.006 * c.exposure * (1 + s.heat / 50) * (donHasTalent(s, 'r_ombre') ? 0.6 : 1) * (p.temper === 'prudent' ? 0.5 : p.temper === 'integre' ? 1.5 : 1);
    if (chance(scandal)) {
      s.heat = clamp(s.heat + 12, 0, 100);
      s.dossier = clamp((s.dossier ?? 0) + 6, 0, 100);
      log(s, 'police', `Scandale : ${p.name} est démasqué et quitte son poste (+12 heat, +6 dossier). Quelqu’un d’autre le remplacera.`);
      news(s, 5, `${p.name} dans la tourmente`, `${c.role} : des enveloppes et un nom qui revient sans cesse, celui d’une famille de Little Sicily.`);
      vacate(s, c.id);
      continue;
    }
    const war = s.rivals.filter((r) => r.alive && r.war);
    if (war.length && chance(0.008 * c.exposure)) {
      const r = pick(war);
      s.heat = clamp(s.heat + 3, 0, 100);
      log(s, 'bad', `${p.name} a été abattu devant chez lui. Les hommes de ${r.name} t’envoient un message.`);
      news(s, 5, `${p.name} assassiné`, `${c.role} retrouvé mort au petit matin. La guerre des gangs franchit une ligne.`);
      vacate(s, c.id);
      continue;
    }
    if (chance(0.005)) {
      log(s, 'neutral', `${p.name} est muté loin de New Corrano. Le poste attend son remplaçant.`);
      vacate(s, c.id);
      continue;
    }
    // double jeu : un rival qui te déteste le rachète, en secret
    const enemy = s.rivals.filter((r) => r.alive && r.relation <= -40);
    if (!st.turned && enemy.length && chance(0.012 * (p.temper === 'ambitieux' ? 2 : 1) * (p.coerced ? 3 : 1))) {
      st.turned = { rivalId: pick(enemy).id, since: s.week };
      continue;
    }
    // il finit par se trahir
    if (st.turned && st.turned.since < s.week && !s.pendingEvent && chance(loyalAdvisor(s) ? 0.4 : 0.2)) s.pendingEvent = turnedEvent(s, c.id);
  }
  if (owned(s).length === 0) s.contacts = {};
}

/** Pour les tests et l'interface : un contact joue-t-il double jeu ? */
export const isTurned = (s: GameState, id: ContactId) => !!s.contacts?.[id]?.turned;

function turnedEvent(s: GameState, id: ContactId): PendingEvent {
  const st = contactState(s, id);
  const p = st.person!;
  const r = s.rivals.find((x) => x.id === st.turned?.rivalId);
  const weeks = s.week - (st.turned?.since ?? s.week);
  const back = 3 * priceOf(s, id);
  return {
    key: 'net_turned', title: `${p.name} joue double jeu`,
    text: `${loyalAdvisor(s) ? 'Ton consigliere a fait suivre' : 'On a vu'} ${p.name} dîner avec ${r?.name ?? 'une famille rivale'}. Depuis ${weeks} semaine${weeks > 1 ? 's' : ''}, il prend ton argent et ne fait plus rien pour toi.`,
    data: { contact: id },
    choices: [
      { label: 'Le renvoyer', hint: 'Tu cesses de payer ; il ne voudra plus te voir avant six semaines', effect: 'nt_fire' },
      { label: 'Le faire disparaître', hint: '+8 heat · 30 % de scandale (+6 dossier) · le poste se libère', effect: 'nt_kill' },
      { label: 'Doubler sa mise', hint: `${fmt(back)} propres · 60 % qu’il redevienne fidèle (mensualité +50 %), sinon il garde l’argent et part`, effect: 'nt_back', disabled: s.clean < back },
    ],
  };
}

export function resolveNetworkEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('nt_')) return false;
  const id = String(ev.data?.contact) as ContactId;
  const st = contactState(s, id);
  const name = holderName(s, id);
  switch (effect) {
    case 'nt_fire':
      st.active = false; st.turned = undefined; st.refusedUntil = s.week + 6;
      log(s, 'neutral', `${name} ne touchera plus un dollar de la famille.`);
      break;
    case 'nt_kill':
      s.heat = clamp(s.heat + 8, 0, 100);
      if (chance(0.3)) { s.dossier = clamp((s.dossier ?? 0) + 6, 0, 100); log(s, 'police', `On a retrouvé ${name} dans le lac, et les fédéraux font le lien (+8 heat, +6 dossier).`); }
      else log(s, 'bad', `${name} a disparu. Personne ne pose de questions (+8 heat).`);
      vacate(s, id, randInt(3, 5));
      break;
    case 'nt_back': {
      const cost = 3 * priceOf(s, id);
      s.clean -= cost;
      if (chance(0.6)) { st.turned = undefined; st.price = Math.round(st.price * 1.5); log(s, 'good', `${name} jure qu’on ne l’y reprendra plus. Il coûte plus cher, mais il est de nouveau à toi.`); }
      else { st.active = false; st.turned = undefined; st.refusedUntil = s.week + 6; log(s, 'bad', `${name} empoche ${fmt(cost)} et disparaît de la circulation.`); }
      break;
    }
  }
  return true;
}
