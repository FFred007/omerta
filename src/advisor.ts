// Le consigliere : chaque lundi, les trois choses qui pressent le plus, et le bilan de la semaine passée.
import * as CA from './career';
import * as CT from './cities';
import * as HU from './hunters';
import { acquittalChance, dossierForecast } from './dossier';
import { settle } from './engine';
import { inCoalition } from './pressure';
import { activeMembers, district, salesPlan } from './state';
import { activeVendettas } from './vendetta';
import { donOf } from './don';
import type { GameState, Snapshot } from './types';

export type AdviceTone = 'danger' | 'warn' | 'info';
export interface Advice { tone: AdviceTone; text: string; tab: string; link: string; prio: number }

const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Qui conseille : le mentor au début de la carrière, le consigliere ensuite */
export function advisor(s: GameState): { name: string; title: string; seed: number; age: number } {
  const c = s.career;
  if (c) {
    const who = c.rank === 'associe' || c.rank === 'soldat' ? CA.notable(s, 'mentor') : CA.notable(s, 'consigliere');
    if (who) return { name: `${who.name} « ${who.nickname} »`, title: who.id === 'mentor' ? 'ton capo' : 'le consigliere', seed: who.seed, age: who.age + Math.floor((s.week - 1) / 6) };
  }
  return { name: 'Tommaso Ferri « l’Avvocato »', title: 'le consigliere', seed: 7741, age: 61 };
}

/** Onglets que le joueur voit à son rang */
function visible(s: GameState, tab: string) {
  if (!CA.inCareer(s)) return tab !== 'missions' && tab !== 'relations';
  const r = CA.careerRank(s);
  if (tab === 'villes' || tab === 'commission') return false;
  if (tab === 'famille') return r !== 'associe';
  if (tab === 'business' || tab === 'rivaux') return r === 'capo';
  return true;
}

export function advice(s: GameState): Advice[] {
  const out: Advice[] = [];
  const add = (prio: number, tone: AdviceTone, text: string, tab: string, link: string) => { if (visible(s, tab)) out.push({ prio, tone, text, tab, link }); };
  const career = CA.inCareer(s);
  const c = s.career;

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
  if (f.unpaid > 0) add(95, 'danger', `Il manquera ${fmt(f.unpaid)} pour les salaires dimanche. Des hommes qui ne sont pas payés finissent par parler.`, 'famille', career ? 'L’équipe' : 'La famille');
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
    if (left <= 3) add(66, 'warn', `${v.killer} « ${v.nickname} » court toujours. ${left > 0 ? `Encore ${left} semaine${left > 1 ? 's' : ''}` : 'Plus le temps'} avant que tes hommes ne te pardonnent pas.`, 'coups', career ? 'Les combines' : 'Les coups');
  }
  const war = s.rivals.filter((r) => r.alive && r.war);
  if (war.length && !inCoalition(s)) add(48, 'warn', `Guerre ouverte avec ${war.map((r) => r.name).join(', ')}.`, 'rivaux', 'Les rivaux');
  const cm = s.commission;
  if (!career && cm?.motion && cm.next - s.week <= 1) {
    const ban = cm.motion.kind === 'ban_player';
    add(ban ? 90 : 42, ban ? 'danger' : 'info', `${ban ? 'La Commission vote ta mise au ban' : `La Commission vote « ${cm.motion.title} »`} ${cm.next === s.week ? 'dimanche' : 'la semaine prochaine'}. Achète des voix avant.`, 'commission', 'La Commission');
  }
  if (!career) for (const city of CT.openCities(s)) {
    if (!CT.holder(s, city.id)) add(74, 'warn', `Personne ne tient ${city.name} : ses revenus baissent de 30 %. Nomme un gouverneur.`, 'villes', 'Les villes');
  }

  // les hommes
  const shaky = activeMembers(s).filter((m) => !m.isDon && m.loyalty < 30);
  if (shaky.length) add(60, 'warn', `${shaky.length === 1 ? `${shaky[0].name} « ${shaky[0].nickname} » n'est plus sûr` : `${shaky.length} hommes ne sont plus sûrs`} (loyauté sous 30). Augmente-les ou écarte-les.`, 'famille', career ? 'L’équipe' : 'La famille');
  const don = donOf(s);
  if (don?.points) add(28, 'info', `${career ? 'Tu as' : 'Le Don a'} ${don.points} point${don.points > 1 ? 's' : ''} à dépenser.`, 'don', career ? 'Toi' : 'Le Don');
  if (s.spouse && s.spouse.affection < 30) add(34, 'info', `${s.spouse.name} se sent délaissée (affection ${s.spouse.affection}).`, 'don', career ? 'Toi' : 'Le Don');
  if (s.heist && s.heist.stage === 0) add(24, 'info', `Un grand coup se présente : « ${s.heist.title} ».`, 'coups', 'Les coups');

  // la carrière
  if (c && career) {
    if (c.dying) {
      const t = CA.successionTally(s);
      add(98, t.fav && t.mine.length < t.needed ? 'danger' : 'warn', `Le Don se meurt. ${t.fav ? `Au vote, tu as ${t.mine.length} voix sur ${t.voters.length} (il en faut ${t.needed}) contre ${t.fav.name}.` : 'Personne ne te dispute la place.'}`, 'relations', 'Les relations');
    }
    if (c.plot) add(90, 'warn', `Ton complot se joue dans la nuit de dimanche${c.plot.week > s.week ? ` de la semaine ${c.plot.week}` : ''}. Il est encore temps de renoncer.`, 'relations', 'Les relations');
    const open = c.missions.filter((m) => !m.accepted);
    const taken = c.missions.filter((m) => m.accepted).length;
    const best = open.map((m) => ({ m, p: CA.missionChance(s, m) })).sort((a, b) => b.p - a.p)[0];
    if (best && taken < CA.MAX_MISSIONS && best.p >= 0.6) add(46, 'info', `« ${best.m.title} » : ${pct(best.p)} de réussite. Le Don attend qu'on se rende utile.`, 'missions', 'Les missions');
    const promo = CA.PROMOTION[c.rank];
    if (promo) {
      const miss = [
        c.trust < promo.trust ? `${promo.trust - c.trust} de confiance` : '',
        c.missionsDone < promo.missions ? `${promo.missions - c.missionsDone} mission${promo.missions - c.missionsDone > 1 ? 's' : ''}` : '',
        s.week < promo.week ? `${promo.week - s.week} semaine${promo.week - s.week > 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      add(20, 'info', miss.length ? `Pour devenir ${CA.RANK_LABEL[promo.next].toLowerCase()} : encore ${miss.join(', ')}.` : `Tu as tout pour monter en grade : la cérémonie viendra.`, 'missions', 'Les missions');
    }
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
    ...(b.trust !== undefined && a.trust !== undefined ? [{ label: 'Confiance du Don', value: d('trust'), good: 'up' as const }] : []),
  ];
  const name = (id: string) => district(s, id)?.name ?? id;
  return { week: b.week, deltas, gained: (s.lastWeek?.gained ?? []).map(name), lost: (s.lastWeek?.lost ?? []).map(name) };
}
