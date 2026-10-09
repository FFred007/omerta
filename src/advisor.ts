// Le consigliere : chaque lundi, les trois choses qui pressent le plus, et le bilan de la semaine passée.
import * as CT from './cities';
import * as CI from './circle';
import * as EG from './endgame';
import { childAge } from './family';
import { ageOf } from './don';
import * as HU from './hunters';
import { acquittalChance, dossierForecast } from './dossier';
import { IDLE_WEEKS, settle } from './engine';
import { inCoalition } from './pressure';
import { activeMembers, district, owned, salesPlan } from './state';
import { activeVendettas } from './vendetta';
import { donOf } from './don';
import type { GameState, Snapshot } from './types';

export type AdviceTone = 'danger' | 'warn' | 'info';
export interface Advice { tone: AdviceTone; text: string; tab: string; link: string; prio: number; select?: string; famFilter?: string }

const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Le consigliere du cercle */
export function advisor(s: GameState): { name: string; title: string; seed: number; age: number } {
  const cons = CI.consigliere(s);
  if (cons) return { name: `${cons.name} « ${cons.nickname} »`, title: 'le consigliere', seed: cons.seed, age: CI.notableAge(s, cons) };
  return { name: 'Tommaso Ferri « l’Avvocato »', title: 'le consigliere', seed: 7741, age: 61 };
}

/** L'onglet du Cercle n'existe qu'avec un cercle */
const visible = (s: GameState, tab: string) => tab !== 'relations' || !!s.circle;

export function advice(s: GameState): Advice[] {
  const out: Advice[] = [];
  const add = (prio: number, tone: AdviceTone, text: string, tab: string, link: string) => { if (visible(s, tab)) out.push({ prio, tone, text, tab, link }); };

  // la justice
  if (s.trial) add(100, 'danger', `Le procès fédéral est ouvert : ${pct(acquittalChance(s))} d'acquittement aujourd'hui. Juges, témoins, avocats : c'est maintenant qu'on paie.`, 'corruption', 'Le réseau');
  const dos = s.dossier ?? 0;
  const dosTrend = dossierForecast(s).reduce((t, l) => t + l.value, 0);
  if (!s.trial && dos >= 70) add(92, 'danger', `Le dossier fédéral est à ${Math.round(dos)}/100. À 100, le Don est inculpé.${dosTrend > 0 ? ` Il gagne ${dosTrend} par semaine.` : ''}`, 'corruption', 'Le réseau');
  else if (!s.trial && dos >= 35 && dosTrend > 0) add(58, 'warn', `Le dossier grossit de ${dosTrend} par semaine (${Math.round(dos)}/100). Fais baisser la heat ou paie un juge avant que ça s'emballe.`, 'corruption', 'Le réseau');
  if (s.heat >= 70) add(86, 'danger', `Heat à ${s.heat} : les descentes vont tomber et le dossier fédéral s'ouvre en grand. Fais profil bas, paie les flics.`, 'corruption', 'Le réseau');
  else if (s.heat >= 45) add(54, 'warn', `Heat à ${s.heat}. Encore un peu et les fédéraux s'en mêlent.`, 'corruption', 'Le réseau');

  // l'argent
  const f = settle(s);
  if (f.unpaid > 0) add(95, 'danger', `Il manquera ${fmt(f.unpaid)} pour les salaires dimanche. Des hommes qui ne sont pas payés finissent par parler.`, 'famille', 'La famille');
  if (!f.bribesOk) add(80, 'danger', `Pas assez d'argent propre pour les enveloppes (${fmt(f.bribes)}) : ton réseau ne sera pas payé.`, 'corruption', 'Le réseau');
  const plan = salesPlan(s);
  if (plan.shortage) add(70, 'warn', `Rupture d'alcool : il manquera ${plan.shortage} caisses dans tes speakeasies. Autant d'argent qui reste sur le comptoir.`, 'business', 'L’alcool');

  // les ennemis
  if (inCoalition(s)) add(88, 'danger', `Les familles sont coalisées contre toi encore ${s.coalitionWeeks} semaine${(s.coalitionWeeks ?? 0) > 1 ? 's' : ''}. Renforce tes quartiers, n'attaque pas.`, 'rivaux', 'Les rivaux');
  for (const h of HU.hunters(s)) {
    if (h.mood === 'enquete' && h.progress >= 70) add(84, 'danger', `${h.name} (${h.title}) en est à ${Math.round(h.progress)}/100 sur toi. À 100, il ou elle frappe.`, 'corruption', 'Le réseau');
  }
  for (const v of activeVendettas(s)) {
    const left = v.deadline - s.week;
    if (left <= 3) add(66, 'warn', `${v.killer} « ${v.nickname} » court toujours. ${left > 0 ? `Encore ${left} semaine${left > 1 ? 's' : ''}` : 'Plus le temps'} avant que tes hommes ne te pardonnent pas.`, 'coups', 'Les coups');
  }
  const war = s.rivals.filter((r) => r.alive && r.war);
  if (war.length && !inCoalition(s)) add(48, 'warn', `Guerre ouverte avec ${war.map((r) => r.name).join(', ')}.`, 'rivaux', 'Les rivaux');
  const cm = s.commission;
  if (cm?.motion && cm.next - s.week <= 1) {
    const ban = cm.motion.kind === 'ban_player';
    add(ban ? 90 : 42, ban ? 'danger' : 'info', `${ban ? 'La Commission vote ta mise au ban' : `La Commission vote « ${cm.motion.title} »`} ${cm.next === s.week ? 'dimanche' : 'la semaine prochaine'}. Achète des voix avant.`, 'commission', 'La Commission');
  }
  for (const city of CT.openCities(s)) {
    if (!CT.holder(s, city.id)) add(74, 'warn', `Personne ne tient ${city.name} : ses revenus baissent de 30 %. Nomme un gouverneur.`, 'villes', 'Les villes');
  }

  // les menaces de fin de partie
  {
    if (s.expedition) {
      const hold = EG.expeditionHold(s);
      const r = s.rivals.find((x) => x.id === s.expedition!.rivalId);
      add(hold < 0.6 ? 89 : 52, hold < 0.6 ? 'danger' : 'warn', `${r?.name ?? 'Une famille'} débarque à ${district(s, s.expedition.target)?.name} ${s.expedition.arrive <= s.week ? 'dimanche soir' : `dans ${s.expedition.arrive - s.week + 1} semaines`} : tu tiens à ${pct(hold)}. Poste des hommes, ou paie-les.`, 'rivaux', 'Les rivaux');
    }
    if (EG.brigadeActive(s) && !s.senator) add(68, 'warn', `La brigade de l’${EG.brigadeLeader} est là encore ${s.brigade!.weeks} semaines. Fais profil bas${EG.senatorBlocker(s) ? '' : ', ou achète le sénateur pour la faire rappeler'}.`, 'corruption', 'Le réseau');
    const el = EG.election(s);
    if (el.next - s.week <= 1) add(44, 'info', `Élections municipales ${el.next === s.week ? 'dimanche' : 'la semaine prochaine'} : ${EG.MAYOR_FRIEND} a ${pct(EG.electionChance(s))} de chances. Un chèque de campagne aiderait.`, 'corruption', 'Le réseau');
    const sore = owned(s).filter((d) => (d.grievance ?? 0) >= EG.REVOLT_AT - 1);
    if (sore.length) { add(63, 'warn', `Les commerçants de ${sore[0].name} sont à bout depuis ${sore[0].grievance} semaines. Une de plus et ils se soulèvent : baisse le tarif.`, 'quartier', sore[0].name); out[out.length - 1].select = sore[0].id; }
  }

  // les hommes
  const shaky = activeMembers(s).filter((m) => !m.isDon && m.loyalty < 30 && !(m.grudge && CI.loyalAdvisor(s)));
  if (shaky.length) add(60, 'warn', `${shaky.length === 1 ? `${shaky[0].name} « ${shaky[0].nickname} » n'est plus sûr` : `${shaky.length} hommes ne sont plus sûrs`} (loyauté sous 30). Augmente-les ou écarte-les.`, 'famille', 'La famille');
  const idle = s.members.filter((m) => (m.idle ?? 0) >= IDLE_WEEKS);
  if (idle.length >= 2) { add(38, 'info', `${idle.length} hommes s'ennuient en réserve depuis un mois. Poste-les dans un quartier ou envoie-les sur un coup, ils sont payés pour ça.`, 'famille', 'Les inactifs'); out[out.length - 1].famFilter = 'inactifs'; }
  const don = donOf(s);
  if (don?.points) add(28, 'info', `Le Don a ${don.points} point${don.points > 1 ? 's' : ''} à dépenser.`, 'don', 'Le Don');
  if (s.spouse && s.spouse.affection < 30) add(34, 'info', `${s.spouse.name} se sent délaissée (affection ${s.spouse.affection}).`, 'don', 'Le Don');
  if (s.heist && s.heist.stage === 0) add(24, 'info', `Un grand coup se présente : « ${s.heist.title} ».`, 'coups', 'Les coups');

  // le cercle et l'héritier
  if (s.circle && don) {
    const t = CI.heirTally(s);
    const age = Math.floor(ageOf(s, don));
    const risky = age >= 58 || don.status !== 'actif' || !!s.trial || (s.dossier ?? 0) >= 70;
    if (!t.heir && (age >= 50 || risky)) add(risky ? 62 : 30, risky ? 'warn' : 'info', `Pas d'héritier : si le Don tombe, la famille se disperse. ${s.spouse ? 'Il est temps d’agrandir la famille.' : 'Il est temps de se marier.'}`, 'don', 'Le Don');
    else if (t.heir && !t.wins && t.pretender) add(risky ? 78 : 36, risky ? 'danger' : 'info', `Si le Don tombait aujourd'hui, ${t.pretender.name} « ${t.pretender.nickname} » l'emporterait sur ${t.heir.name} (${t.yes} voix sur ${t.voters.length}, il en faut ${t.needed}). Présente l'héritier au cercle.`, 'relations', 'Le cercle');
    const sore = s.members.filter((m) => m.grudge && m.rank === 'capo' && !m.isDon && m.loyalty < 40);
    if (sore.length && CI.loyalAdvisor(s)) add(64, 'warn', `${sore[0].name} « ${sore[0].nickname} » n'a pas digéré le dernier vote (loyauté ${sore[0].loyalty}). Un cadeau, ou qu'il disparaisse.`, 'relations', 'Le cercle');
    if (t.heir && !CI.heirMember(s, t.heir) && childAge(s, t.heir) >= 12 && !CI.presentBlocker(s) && (s.heirFavor ?? 0) < 16) add(26, 'info', `${t.heir.name} a l'âge d'être présenté${t.heir.sex === 'f' ? 'e' : ''} aux anciens.`, 'relations', 'Le cercle');
  }

  out.sort((a, b) => b.prio - a.prio);
  return out.slice(0, 3);
}

// ---------- Bilan de la semaine ----------
export interface Delta { label: string; value: number; money?: boolean; good: 'up' | 'down' }
export function weekDeltas(s: GameState): { week: number; deltas: Delta[]; gained: string[]; lost: string[] } | null {
  const h = s.history ?? [];
  if (h.length < 2) return null;
  const a = h[h.length - 2];
  const b = h[h.length - 1];
  const d = (k: keyof Snapshot) => ((b[k] ?? 0) as number) - ((a[k] ?? 0) as number);
  const deltas: Delta[] = [
    { label: 'Sale', value: d('dirty'), money: true, good: 'up' },
    { label: 'Propre', value: d('clean'), money: true, good: 'up' },
    { label: 'Respect', value: d('respect'), good: 'up' },
    { label: 'Heat', value: d('heat'), good: 'down' },
    { label: 'Dossier', value: d('dossier'), good: 'down' },
  ];
  const name = (id: string) => district(s, id)?.name ?? id;
  return { week: b.week, deltas, gained: (s.lastWeek?.gained ?? []).map(name), lost: (s.lastWeek?.lost ?? []).map(name) };
}
