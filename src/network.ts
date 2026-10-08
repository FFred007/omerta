// Le réseau d'influence : des gens, pas des boutons. Presse, police, justice, politique, communauté, fédéraux.
import { donHasTalent, donOf } from './don';
import { chance, clamp, log, news, owned, pick } from './state';
import type { GameState } from './types';

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

export interface ContactState { active: boolean; price: number; lastUse?: number; burned?: boolean; known?: boolean }

export function contactState(s: GameState, id: ContactId): ContactState {
  s.contacts ??= {};
  return (s.contacts[id] ??= { active: false, price: contactDef(id).retainer });
}
export const isActive = (s: GameState, id: ContactId) => !!s.contacts?.[id]?.active;
export const activeContacts = (s: GameState) => CONTACTS.filter((c) => isActive(s, c.id));

function introduced(s: GameState, c: ContactDef) {
  if (!c.needs) return true;
  if (c.needs === 'judge') return s.judge;
  if (c.needs === 'councilman') return s.councilman;
  return isActive(s, c.needs);
}

/** Pourquoi on ne peut pas (encore) recruter ce contact */
export function blocker(s: GameState, c: ContactDef): string | null {
  const st = contactState(s, c.id);
  if (st.burned) return 'Grillé : il ne veut plus entendre parler de toi';
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

export function hire(s: GameState, id: ContactId): Result {
  const c = contactDef(id);
  const b = blocker(s, c);
  if (b) return fail(b);
  const st = contactState(s, id);
  if (c.retainer === 0) return fail('Pas de mensualité : utilise son action.');
  st.active = true;
  st.known = true;
  log(s, 'good', `${c.name}, ${c.role}, émarge désormais chez toi (${fmt(priceOf(s, id))} propres par semaine).`);
  return ok;
}

export function dismiss(s: GameState, id: ContactId): Result {
  const st = contactState(s, id);
  if (!st.active) return fail('Il ne travaille pas pour toi.');
  st.active = false;
  log(s, 'neutral', `Tu cesses de payer ${contactDef(id).name}.`);
  return ok;
}

export function canUse(s: GameState, id: ContactId) {
  const c = contactDef(id);
  const st = contactState(s, id);
  if (!c.action) return 'Pas d’action';
  if (c.retainer > 0 && !st.active) return 'Il doit d’abord être à ta solde';
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
      log(s, 'good', `Eddie Malone fait disparaître l'article de la une (−8 heat).`);
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
        log(s, 'good', `${m.nickname} sort du commissariat sans charges. O'Rourke a égaré le procès-verbal.`);
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
      log(s, 'good', 'Le père Anselmo jure devant Dieu que le Don était à la messe (−6 heat).');
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
export const networkRetainers = (s: GameState) => activeContacts(s).reduce((t, c) => t + priceOf(s, c.id), 0);
export const networkHeat = (s: GameState) => activeContacts(s).reduce((t, c) => t + (c.heat ?? 0), 0);
export const networkDossier = (s: GameState) => activeContacts(s).reduce((t, c) => t + (c.dossier ?? 0), 0);
export const networkRaids = (s: GameState) => activeContacts(s).reduce((t, c) => t * (c.raids ?? 1), 1);

/** Les contacts ont leurs défauts : avidité, scandales, rachat par un rival */
export function networkTick(s: GameState) {
  for (const c of activeContacts(s)) {
    const st = contactState(s, c.id);
    if (chance(0.03)) {
      st.price = Math.round(st.price * 1.2);
      log(s, 'money', `${c.name} devient gourmand : il demande désormais ${fmt(priceOf(s, c.id))} par semaine.`);
    }
    const scandal = 0.006 * c.exposure * (1 + s.heat / 50) * (donHasTalent(s, 'r_ombre') ? 0.6 : 1);
    if (chance(scandal)) {
      st.active = false;
      st.burned = true;
      s.heat = clamp(s.heat + 12, 0, 100);
      s.dossier = clamp((s.dossier ?? 0) + 6, 0, 100);
      log(s, 'police', `Scandale : ${c.name} est démasqué. Il ne peut plus rien pour toi (+12 heat, +6 dossier).`);
      news(s, 5, `${c.name} dans la tourmente`, `${c.role} : des enveloppes et un nom qui revient sans cesse, celui d’une famille de Little Sicily.`);
      continue;
    }
    const enemy = s.rivals.filter((r) => r.alive && r.relation <= -40);
    if (enemy.length && chance(0.012)) {
      const r = pick(enemy);
      st.active = false;
      log(s, 'bad', `${c.name} a été racheté par ${r.name}. Il ne répond plus à tes appels.`);
    }
  }
  // un contact qu'on ne paie plus redevient disponible plus tard, sauf s'il est grillé
  if (owned(s).length === 0) s.contacts = {};
}
