// Ceux qui te traquent : une journaliste et un inspecteur, avec un nom, une mémoire, et des remplaçants plus coriaces.
import { donOf } from './don';
import { DOSSIER_ARREST, addDossier } from './dossier';
import { BUSINESSES } from './data';
import { isActive } from './network';
import { chance, clamp, fx, log, membersIn, news, owned, randInt } from './state';
import type { GameState, Hunter, HunterId, PendingEvent } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

const ROSTER: Record<HunterId, { name: string; title: string; integrity: number }[]> = {
  journaliste: [
    { name: 'Clara Whitfield', title: 'journaliste d’investigation au Corrano Herald', integrity: 65 },
    { name: 'Ruth Kaminski', title: 'grand reporter au Corrano Herald', integrity: 80 },
    { name: 'Victor Lang', title: 'éditorialiste du Washburn Post', integrity: 92 },
  ],
  inspecteur: [
    { name: 'Inspecteur Hollis Garrity', title: 'Bureau de la Prohibition', integrity: 70 },
    { name: 'Inspecteur Martin Brandt', title: 'Bureau de la Prohibition, brigade spéciale', integrity: 85 },
    { name: 'Agent fédéral Leon Price', title: 'Trésor fédéral, division des fraudes', integrity: 96 },
  ],
};

export const COOLDOWN = 3;
export const WARN_AT = 60;

function make(id: HunterId, generation: number, progress = 0): Hunter {
  const r = ROSTER[id][Math.min(generation, ROSTER[id].length) - 1];
  return {
    id, name: r.name, title: r.title, seed: randInt(1, 1e9), progress, integrity: r.integrity + Math.max(0, generation - ROSTER[id].length) * 3,
    mood: 'enquete', moodWeeks: 0, cooldown: 0, strikes: 0, memory: [], generation,
  };
}

export function hunters(s: GameState): Hunter[] {
  return (s.hunters ??= [make('journaliste', 1), make('inspecteur', 1)]);
}
export const hunter = (s: GameState, id: HunterId) => hunters(s).find((h) => h.id === id)!;
export function hunterProgress(s: GameState, id: HunterId, n: number) {
  const h = hunter(s, id);
  if (h.mood === 'enquete') h.progress = clamp(h.progress + n, 0, 99);
}
const remember = (s: GameState, h: Hunter, text: string) => { h.memory.unshift({ week: s.week, text }); if (h.memory.length > 8) h.memory.length = 8; };

/** Ce qui fait avancer l'enquête cette semaine */
export function huntGain(s: GameState, h: Hunter) {
  const lines: { label: string; value: number }[] = [];
  if (h.mood !== 'enquete') return lines;
  if (h.id === 'journaliste') {
    lines.push(s.heat >= 20 ? { label: `Heat ${s.heat} : on parle de toi`, value: Math.round((s.heat / 25) * 10) / 10 } : { label: 'Heat basse : l’enquête piétine', value: -1 });
    const wars = s.rivals.filter((r) => r.war).length;
    if (wars) lines.push({ label: 'Guerre des gangs à la une', value: wars });
    if (s.trial) lines.push({ label: 'Procès du Don', value: 2 });
    if (isActive(s, 'reporter')) lines.push({ label: 'Eddie Malone l’oriente sur de fausses pistes', value: -1 });
    if (isActive(s, 'redac')) lines.push({ label: 'Le rédacteur en chef coupe ses papiers', value: -2 });
  } else {
    lines.push(s.heat >= 20 ? { label: `Heat ${s.heat} : il a des indics`, value: Math.round((s.heat / 20) * 10) / 10 } : { label: 'Heat basse : pas de piste', value: -1 });
    const illegal = owned(s).reduce((t, d) => t + d.businesses.filter((b) => BUSINESSES[b.kind].illegal).length, 0);
    if (illegal >= 4) lines.push({ label: `${illegal} commerces illégaux à surveiller`, value: Math.floor(illegal / 4) });
    if (isActive(s, 'capitaine')) lines.push({ label: 'Le capitaine O’Rourke lui met des bâtons dans les roues', value: -1 });
    if (isActive(s, 'commissaire')) lines.push({ label: 'Le commissaire lui refuse des hommes', value: -2 });
    if (isActive(s, 'maire')) lines.push({ label: 'Le maire freine ses mandats', value: -1 });
  }
  return lines;
}
export const huntNet = (s: GameState, h: Hunter) => Math.round(huntGain(s, h).reduce((t, l) => t + l.value, 0) * 10) / 10;

/** L'inspecteur acheté ferme les yeux sur une partie des descentes */
export const hunterRaidMult = (s: GameState) => (s.hunters?.find((h) => h.id === 'inspecteur')?.mood === 'achete' ? 0.75 : 1);

export function huntersTick(s: GameState) {
  for (const h of hunters(s)) {
    if (h.cooldown > 0) h.cooldown--;
    if (h.mood !== 'enquete') {
      h.moodWeeks--;
      if (h.moodWeeks > 0) continue;
      if (h.mood === 'achete') {
        h.mood = 'enquete';
        h.integrity = clamp(h.integrity + 10, 0, 100);
        remember(s, h, 'A rendu l’argent et repris son enquête');
        log(s, 'police', `${h.name} ne veut plus de ton argent : l’enquête reprend.`);
      } else if (h.mood === 'discredite') {
        h.mood = 'enquete';
        h.integrity = clamp(h.integrity + 15, 0, 100);
        remember(s, h, 'Revenu(e), plus déterminé(e) que jamais');
        log(s, 'police', `${h.name} a lavé son honneur. Il ou elle reprend l’enquête, plus déterminé(e).`);
      } else {
        const next = make(h.id, h.generation + 1, h.mood === 'mort' ? 40 : 20);
        Object.assign(h, next);
        log(s, 'police', `${h.name} (${h.title}) reprend le dossier de la ${s.familyName}.`);
        news(s, 4, `${h.name} reprend l’enquête`, `${h.id === 'journaliste' ? 'Le journal' : 'Washington'} envoie un nouveau limier. On le dit incorruptible.`);
      }
      continue;
    }
    const before = h.progress;
    h.progress = clamp(h.progress + huntNet(s, h), 0, 100);
    if (h.progress >= 100) strike(s, h);
    else if (before < WARN_AT && h.progress >= WARN_AT && !s.pendingEvent && s.status === 'playing' && donOf(s)) s.pendingEvent = warnEvent(s, h);
  }
}

function strike(s: GameState, h: Hunter) {
  h.strikes++;
  h.progress = h.id === 'journaliste' ? 25 : 20;
  h.integrity = clamp(h.integrity + 5, 0, 100);
  if (h.id === 'journaliste') {
    s.heat = clamp(s.heat + 10, 0, 100);
    s.respect = clamp(s.respect - 3, 0, 150);
    addDossier(s, 8, `Les révélations de ${h.name}`);
    remember(s, h, 'A publié une enquête en une');
    log(s, 'police', `${h.name} publie son enquête sur la ${s.familyName} : +10 heat, +8 au dossier fédéral, −3 respect.`);
    news(s, 6, `Enquête : l’empire secret de la ${s.familyName}`, `Par ${h.name}. Bars clandestins, flics achetés, comptes en Suisse : notre journaliste a tout reconstitué.`);
    return;
  }
  // l'inspecteur : opération coup de poing sur les quartiers les plus chargés
  const targets = owned(s).filter((d) => d.businesses.some((b) => BUSINESSES[b.kind].illegal))
    .sort((a, b) => b.businesses.filter((x) => BUSINESSES[x.kind].illegal).length - a.businesses.filter((x) => BUSINESSES[x.kind].illegal).length).slice(0, 2);
  const seized = Math.round(s.dirty * 0.15);
  s.dirty -= seized;
  s.stats.raids++; // compte comme une descente
  const names: string[] = [];
  for (const d of targets) {
    const b = d.businesses.find((x) => BUSINESSES[x.kind].illegal)!;
    d.businesses = d.businesses.filter((x) => x.id !== b.id);
    fx(s, 'raid', d.id);
    names.push(`${BUSINESSES[b.kind].name.toLowerCase()} de ${d.name}`);
    for (const m of membersIn(s, d.id)) {
      if (m.isDon || !chance(0.4)) continue;
      m.status = 'prison';
      m.statusWeeks = randInt(3, 6);
      if (s.judge) m.statusWeeks = Math.ceil(m.statusWeeks / 2);
      addDossier(s, DOSSIER_ARREST, `${m.nickname} arrêté par ${h.name}`);
    }
  }
  addDossier(s, 6, `L’opération de ${h.name}`);
  s.heat = clamp(s.heat - 5, 0, 100);
  remember(s, h, `A mené une opération coup de poing (${names.length} établissements)`);
  log(s, 'police', `Descente : ${h.name} mène une opération coup de poing${names.length ? ` (${names.join(', ')} fermés)` : ''}, ${fmt(seized)} saisis, +6 au dossier fédéral.`);
  news(s, 6, `Coup de filet de ${h.name}`, `Les agents de la Prohibition ont frappé en pleine nuit. « Ce n’est qu’un début », promet l’inspecteur.`);
}

// ---------- Actions du joueur ----------
const verbe = (s: GameState) => donOf(s)?.verbe ?? 5;
export const bribeCost = (h: Hunter) => Math.round((1500 + h.integrity * 40) / 100) * 100;
export const bribeChance = (s: GameState, h: Hunter) => clamp(((100 - h.integrity) / 100) * (1 + (verbe(s) - 5) * 0.06), 0.03, 0.9);
export const talkChance = (s: GameState, h: Hunter) => clamp(0.2 + (verbe(s) - 5) * 0.08 + (100 - h.integrity) / 200, 0.05, 0.9);
export const threatChance = (h: Hunter) => clamp(0.55 - h.integrity / 250, 0.1, 0.8);
const bestShadow = (s: GameState) => s.members.filter((m) => m.status === 'actif' && !m.isDon).sort((a, b) => b.discretion - a.discretion)[0];
export const discreditChance = (s: GameState) => { const m = bestShadow(s); return m ? clamp((m.discretion - 3) / 10, 0.1, 0.85) : 0; };
export const DISCREDIT_COST = 2000;
export const TRANSFER_COST = 4000;
export const LUNCH_COST = 300;

export type HunterAction = 'lunch' | 'bribe' | 'threat' | 'discredit' | 'transfer' | 'kill';

export function actionBlocker(s: GameState, h: Hunter, a: HunterAction): string | null {
  if (h.mood !== 'enquete') return 'Il ou elle n’enquête plus pour l’instant.';
  if (h.cooldown > 0) return `Attends encore ${h.cooldown} semaine${h.cooldown > 1 ? 's' : ''}.`;
  if (!donOf(s)) return 'Pas de Don pour décider.';
  switch (a) {
    case 'lunch': return h.id !== 'journaliste' ? 'Réservé à la journaliste.' : s.clean < LUNCH_COST ? `Il faut ${fmt(LUNCH_COST)} propres.` : null;
    case 'bribe': return s.dirty < bribeCost(h) ? `Il faut ${fmt(bribeCost(h))} sales.` : null;
    case 'discredit': return s.dirty < DISCREDIT_COST ? `Il faut ${fmt(DISCREDIT_COST)} sales.` : !bestShadow(s) ? 'Personne pour monter le coup.' : null;
    case 'transfer': return h.id !== 'inspecteur' ? 'Réservé à l’inspecteur.' : !(s.councilman || isActive(s, 'maire')) ? 'Il faut le conseiller Doyle ou le maire dans ta poche.' : s.clean < TRANSFER_COST ? `Il faut ${fmt(TRANSFER_COST)} propres.` : null;
    default: return null;
  }
}

export function act(s: GameState, id: HunterId, a: HunterAction): Result {
  const h = hunter(s, id);
  const why = actionBlocker(s, h, a);
  if (why) return fail(why);
  h.cooldown = COOLDOWN;
  switch (a) {
    case 'lunch':
      s.clean -= LUNCH_COST;
      if (chance(talkChance(s, h))) { h.progress = clamp(h.progress - 20, 0, 100); remember(s, h, 'A déjeuné avec le Don et douté de ses sources'); log(s, 'good', `Déjeuner avec ${h.name} : le Don a du charme, elle doute de ses sources (−20 enquête).`); }
      else { h.progress = clamp(h.progress + 5, 0, 100); remember(s, h, 'A déjeuné avec le Don sans se laisser charmer'); log(s, 'bad', `${h.name} prend des notes pendant tout le déjeuner (+5 enquête).`); }
      break;
    case 'bribe': {
      const cost = bribeCost(h);
      s.dirty -= cost;
      if (chance(bribeChance(s, h))) {
        h.mood = 'achete'; h.moodWeeks = 8;
        remember(s, h, `A accepté ${fmt(cost)}`);
        log(s, 'good', `${h.name} empoche ${fmt(cost)}. Pendant 8 semaines, l’enquête dort${h.id === 'inspecteur' ? ' et les descentes se font rares' : ''}.`);
      } else {
        h.progress = clamp(h.progress + 15, 0, 100);
        h.integrity = clamp(h.integrity + 5, 0, 100);
        addDossier(s, 3, `${h.name} signale une tentative de corruption`);
        remember(s, h, 'A refusé une enveloppe et l’a signalé');
        log(s, 'police', `${h.name} refuse l’enveloppe et la verse au dossier : ${fmt(cost)} perdus, +15 enquête, +3 au dossier fédéral.`);
      }
      break;
    }
    case 'threat':
      if (chance(threatChance(h))) { h.progress = clamp(h.progress - 30, 0, 100); remember(s, h, 'A reçu une couronne mortuaire à son nom'); log(s, 'neutral', `${h.name} a reçu une couronne mortuaire à son nom. L’enquête ralentit (−30).`); }
      else { h.progress = clamp(h.progress + 20, 0, 100); h.integrity = clamp(h.integrity + 10, 0, 100); s.heat = clamp(s.heat + 5, 0, 100); remember(s, h, 'Menacé(e), il ou elle a porté plainte'); log(s, 'police', `${h.name} ne cède pas aux menaces et le fait savoir : +20 enquête, +5 heat.`); }
      break;
    case 'discredit': {
      s.dirty -= DISCREDIT_COST;
      const m = bestShadow(s)!;
      if (chance(discreditChance(s))) { h.mood = 'discredite'; h.moodWeeks = 6; h.progress = 0; remember(s, h, 'Discrédité(e) par un scandale monté de toutes pièces'); log(s, 'good', `${m.nickname} a monté un joli scandale : ${h.name} est suspendu(e) 6 semaines, son enquête repart de zéro.`); news(s, 4, `${h.name} dans la tourmente`, 'Des photos compromettantes circulent dans les rédactions. Suspension immédiate.'); }
      else { h.progress = clamp(h.progress + 10, 0, 100); s.heat = clamp(s.heat + 8, 0, 100); remember(s, h, 'A déjoué une tentative de le ou la discréditer'); log(s, 'police', `Le coup monté contre ${h.name} est éventé : +8 heat, +10 enquête.`); }
      break;
    }
    case 'transfer':
      s.clean -= TRANSFER_COST;
      h.mood = 'mute'; h.moodWeeks = 6;
      remember(s, h, 'Muté à Omaha sur ordre de la mairie');
      log(s, 'good', `Quelques coups de fil de la mairie : ${h.name} est muté à Omaha. Son remplaçant arrivera dans 6 semaines.`);
      break;
    case 'kill':
      h.mood = 'mort'; h.moodWeeks = 8;
      s.heat = clamp(s.heat + (h.id === 'journaliste' ? 25 : 30), 0, 100);
      addDossier(s, h.id === 'journaliste' ? 15 : 20, `Assassinat de ${h.name}`);
      s.respect = clamp(s.respect + 2, 0, 150);
      log(s, 'police', `${h.name} a été retrouvé(e) dans le lac. Toute la ville sait qui a donné l’ordre : +${h.id === 'journaliste' ? 25 : 30} heat.`);
      news(s, 6, `${h.name} assassiné(e)`, 'Le pays tout entier s’indigne. Washington promet de ne pas laisser ce crime impuni.');
      break;
  }
  return ok;
}

// ---------- Rencontres ----------
function warnEvent(s: GameState, h: Hunter): PendingEvent {
  if (h.id === 'journaliste') {
    return {
      key: 'h_warn_j', title: `${h.name} demande une interview`,
      text: `${h.name}, ${h.title}, attend dans le hall du restaurant. Son enquête avance (${Math.round(h.progress)}/100) ; elle veut « la version du Don » avant de publier.`,
      data: { hunter: h.id },
      choices: [
        { label: 'Accorder l’interview', hint: `${Math.round(talkChance(s, h) * 100)} % de la faire douter (−30) · sinon +10`, effect: 'hu_talk' },
        { label: 'Lui fermer la porte au nez', hint: '+5 enquête', effect: 'hu_snub' },
        { label: 'La faire raccompagner « fermement »', hint: `${Math.round(threatChance(h) * 100)} % : −30 · sinon +20 et +5 heat`, effect: 'hu_threat' },
      ],
    };
  }
  return {
    key: 'h_warn_i', title: `${h.name} s’invite à ta table`,
    text: `${h.name} (${h.title}) s’assoit en face du Don, commande un café et pose son insigne sur la nappe. « Je vous aurai. » Son enquête : ${Math.round(h.progress)}/100.`,
    data: { hunter: h.id },
    choices: [
      { label: 'Glisser une enveloppe sous la soucoupe', hint: `${fmt(bribeCost(h))} sale · ${Math.round(bribeChance(s, h) * 100)} % qu’il l’accepte (8 sem. de calme)`, effect: 'hu_bribe', disabled: s.dirty < bribeCost(h) },
      { label: 'Lui rire au nez', hint: '+3 respect, +10 enquête', effect: 'hu_laugh' },
      { label: 'Rester courtois', hint: 'Rien ne change', effect: 'none' },
    ],
  };
}

export function resolveHunterEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (!effect.startsWith('hu_')) return false;
  const h = hunter(s, String(ev.data?.hunter) as HunterId);
  switch (effect) {
    case 'hu_talk':
      if (chance(talkChance(s, h))) { h.progress = clamp(h.progress - 30, 0, 100); remember(s, h, 'A interviewé le Don et douté de ses sources'); log(s, 'good', `L’interview tourne à l’avantage du Don : ${h.name} doute (−30 enquête).`); }
      else { h.progress = clamp(h.progress + 10, 0, 100); remember(s, h, 'A interviewé le Don et noté ses contradictions'); log(s, 'bad', `${h.name} relève chaque contradiction du Don (+10 enquête).`); }
      break;
    case 'hu_snub': h.progress = clamp(h.progress + 5, 0, 100); remember(s, h, 'S’est vu refuser une interview'); break;
    case 'hu_threat': h.cooldown = 0; act(s, h.id, 'threat'); break;
    case 'hu_bribe': h.cooldown = 0; act(s, h.id, 'bribe'); break;
    case 'hu_laugh': s.respect = clamp(s.respect + 3, 0, 150); h.progress = clamp(h.progress + 10, 0, 100); remember(s, h, 'Le Don lui a ri au nez'); log(s, 'neutral', `Le Don rit au nez de ${h.name}. La salle aussi (+3 respect, +10 enquête).`); break;
  }
  return true;
}
