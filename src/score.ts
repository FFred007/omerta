// La fin choisie : prendre sa retraite ou se ranger, et le score final de la partie.
import { CITIES, tierOf } from './data';
import { ownedIn } from './cities';
import { donOf } from './don';
import { childAge, ADULT_AGE } from './family';
import { log, owned } from './state';
import type { Ending, EndingKind, GameState } from './types';

type Result = { ok: true } | { ok: false; error: string };
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const BEST_KEY = 'omerta-best';
export const RETIRE_MIN_WEEK = 12;
export const LEGIT = { tier: 4, clean: 30000, dossier: 30, heat: 30 };

export const ENDINGS: Record<EndingKind, { title: string; mult: number }> = {
  retraite: { title: 'La retraite du Don', mult: 1 },
  legitimite: { title: 'La légitimité', mult: 1.5 },
  mort: { title: 'Fin de la lignée', mult: 0.5 },
  prison: { title: 'Derrière les barreaux', mult: 0.5 },
  ruine: { title: 'Fin de la famille', mult: 0.25 },
};

export const SCORE_RANKS: [number, string][] = [
  [0, 'Petite frappe'], [1500, 'Caïd de quartier'], [3500, 'Boss respecté'], [6000, 'Parrain'], [9500, 'Capo dei Capi'], [14000, 'Légende de la Prohibition'],
];
export const scoreRank = (n: number) => [...SCORE_RANKS].reverse().find(([min]) => n >= min)![1];

/** Détail du score de l'empire à cet instant */
export function scoreLines(s: GameState) {
  const lines: { label: string; value: number }[] = [];
  const add = (label: string, value: number) => { if (value) lines.push({ label, value: Math.round(value) }); };
  add(`Fortune : ${fmt(s.dirty)} sale, ${fmt(s.clean)} propre`, s.dirty / 100 + s.clean / 70);
  add(`${owned(s).length} quartiers tenus`, owned(s).length * 60);
  const cities = CITIES.filter((c) => ownedIn(s, c.id).length).length;
  add(`${cities} ville${cities > 1 ? 's' : ''} où la famille est implantée`, cities * 200);
  const biz = owned(s).reduce((t, d) => t + d.businesses.length, 0);
  add(`${biz} établissements`, biz * 20);
  add(`Respect ${Math.round(s.respect)}`, s.respect * 6);
  if (s.commission?.seat) add('Siège à la Commission des Dons', 250);
  if (s.commission?.chair) add('Capo dei Capi', 500);
  const men = s.members.filter((m) => !m.isDon && !m.isChild);
  add(`${men.length} hommes, niveaux cumulés ${men.reduce((t, m) => t + (m.level ?? 0), 0)}`, men.length * 10 + men.reduce((t, m) => t + (m.level ?? 0), 0) * 5);
  if (s.spouse) add('Une épouse à ses côtés', 100);
  const kids = s.children ?? [];
  add(`${kids.length} enfant${kids.length > 1 ? 's' : ''}`, kids.length * 60);
  const heir = kids.find((c) => c.id === s.heirId) ?? kids[0];
  if (heir && childAge(s, heir) >= ADULT_AGE) add('Un héritier en âge de reprendre', 200);
  add(`Génération ${s.generation ?? 1}`, ((s.generation ?? 1) - 1) * 150);
  add(`Dossier fédéral ${Math.round(s.dossier ?? 0)}`, -(s.dossier ?? 0) * 4);
  add(`Heat ${s.heat}`, -s.heat * 2);
  return lines;
}

export const scoreBase = (s: GameState) => Math.max(0, scoreLines(s).reduce((t, l) => t + l.value, 0));

export function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* stockage indisponible */
  }
}

/** Clôt la partie et calcule le score */
export function finalize(s: GameState, kind: EndingKind, reason: string) {
  if (s.status !== 'playing') return;
  const lines = scoreLines(s);
  const base = Math.max(0, lines.reduce((t, l) => t + l.value, 0));
  const mult = ENDINGS[kind].mult;
  const score = Math.round(base * mult);
  const best = readBest();
  const ending: Ending = { kind, title: ENDINGS[kind].title, lines, base, mult, score, rank: scoreRank(score), best };
  if (score > best) writeBest(score);
  s.ending = ending;
  s.status = kind === 'retraite' || kind === 'legitimite' ? 'won' : 'lost';
  s.endReason = reason;
  log(s, s.status === 'won' ? 'good' : 'bad', reason);
}

export function retireBlocker(s: GameState): string | null {
  if (s.status !== 'playing') return 'La partie est finie.';
  if (!donOf(s)) return 'Pendant la régence, personne ne peut prendre sa retraite.';
  if (s.trial) return 'On ne prend pas sa retraite en plein procès.';
  if (s.week < RETIRE_MIN_WEEK) return `Il faut au moins ${RETIRE_MIN_WEEK} semaines à la tête de la famille.`;
  return null;
}

export function legitBlockers(s: GameState): string[] {
  const out: string[] = [];
  const r = retireBlocker(s);
  if (r) out.push(r);
  if (tierOf(s.respect) < LEGIT.tier) out.push('être Parrain (100 de respect)');
  if (!s.commission?.seat) out.push('siéger à la Commission');
  if (s.clean < LEGIT.clean) out.push(`${fmt(LEGIT.clean)} propres (${fmt(s.clean)})`);
  if ((s.dossier ?? 0) > LEGIT.dossier) out.push(`dossier fédéral ≤ ${LEGIT.dossier} (${Math.round(s.dossier ?? 0)})`);
  if (s.heat > LEGIT.heat) out.push(`heat ≤ ${LEGIT.heat} (${s.heat})`);
  return out;
}

export function retire(s: GameState): Result {
  const why = retireBlocker(s);
  if (why) return { ok: false, error: why };
  const don = donOf(s)!;
  finalize(s, 'retraite', `${don.name} prend sa retraite dans une villa au bord du lac. La ${s.familyName} se souviendra de lui.`);
  return { ok: true };
}

export function goLegit(s: GameState): Result {
  const why = legitBlockers(s);
  if (why.length) return { ok: false, error: `Pour te ranger, il faut encore : ${why.join(', ')}.` };
  const don = donOf(s)!;
  finalize(s, 'legitimite', `${don.name} revend les tripots, garde les hôtels et entre au conseil d'administration de la Corrano Savings Bank. La ${s.familyName} est devenue respectable.`);
  return { ok: true };
}
