// Diplomatie avec les autres Dons + une du Corrano Herald
import { activeMembers, clamp, log, news, pick, rival } from './state';
import { donHas, familyHas, has } from './traits';
import type { GameState, RivalFamily } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export const SIT_DOWN_COST = 500;
export const TRIBUTE_PAY = 1000;
export const PEACE_COST = 1500;
export const ALLIANCE_MIN = 40;

export function playerForce(s: GameState) {
  return activeMembers(s).reduce((t, m) => t + m.force + (m.rank === 'capo' ? 2 : 0) + (has(m, 'tireur') ? 3 : 0), 0);
}

export function relationLabel(r: RivalFamily) {
  if (r.war) return 'En guerre';
  if (r.alliance) return 'Alliés';
  if (r.relation >= 40) return 'Amicaux';
  if (r.relation >= 10) return 'Cordiaux';
  if (r.relation > -20) return 'Méfiants';
  if (r.relation > -50) return 'Hostiles';
  return 'Ennemis jurés';
}

function get(s: GameState, id: string) {
  const r = rival(s, id);
  if (!r || !r.alive) return null;
  return r;
}

export function sitDown(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r) return fail('Cette famille a disparu.');
  if (r.war) return fail('On ne parle pas avec une famille en guerre. Négocie la paix.');
  if (r.talkCooldown > 0) return fail(`${r.boss} ne te recevra pas avant ${r.talkCooldown} semaine(s).`);
  if (s.clean < SIT_DOWN_COST) return fail(`Un dîner chez Benedetti coûte ${SIT_DOWN_COST} $ propres.`);
  s.clean -= SIT_DOWN_COST;
  const gain = 12 + Math.round(s.respect / 10) + (familyHas(s, 'negociateur') ? 6 : 0) + (donHas(r, 'diplomate') ? 5 : 0);
  r.relation = clamp(r.relation + gain, -100, 100);
  r.talkCooldown = 3;
  log(s, 'neutral', `Dîner avec ${r.boss}. On parle affaires, famille et respect (+${gain} relation).`);
  return ok;
}

export function payTribute(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r) return fail('Cette famille a disparu.');
  if (s.dirty < TRIBUTE_PAY) return fail(`Il faut ${TRIBUTE_PAY} $ sales.`);
  s.dirty -= TRIBUTE_PAY;
  r.money += TRIBUTE_PAY;
  r.relation = clamp(r.relation + 22, -100, 100);
  s.respect = clamp(s.respect - 2, 0, 150);
  log(s, 'neutral', `Tu verses ${TRIBUTE_PAY} $ à ${r.name}. Ils apprécient, la rue un peu moins (−2 respect).`);
  return ok;
}

export function demandTribute(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r) return fail('Cette famille a disparu.');
  if (r.talkCooldown > 0) return fail(`${r.boss} ne te recevra pas avant ${r.talkCooldown} semaine(s).`);
  r.talkCooldown = 3;
  if (playerForce(s) > r.strength * 1.15) {
    const amount = Math.round(Math.min(Math.max(600, r.money * 0.4), 2500));
    r.money = Math.max(0, r.money - amount);
    s.dirty += amount;
    r.relation = clamp(r.relation - 20, -100, 100);
    s.respect = clamp(s.respect + 4, 0, 150);
    log(s, 'good', `${r.boss} baisse les yeux et paie ${amount} $ de tribut (+4 respect).`);
    news(s, 3, `${r.name} plie le genou`, `Selon nos sources, ${r.boss} verse désormais une « contribution » à une famille rivale.`);
  } else {
    r.relation = clamp(r.relation - 12, -100, 100);
    s.respect = clamp(s.respect - 3, 0, 150);
    log(s, 'bad', `${r.boss} éclate de rire. « Reviens quand tu auras des hommes. » (−3 respect)`);
  }
  return ok;
}

export function proposeAlliance(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r) return fail('Cette famille a disparu.');
  if (r.alliance) return fail('Vous êtes déjà alliés.');
  if (r.relation < ALLIANCE_MIN) return fail(`Il faut une relation d'au moins ${ALLIANCE_MIN} (actuellement ${Math.round(r.relation)}).`);
  r.alliance = true;
  r.war = false;
  log(s, 'good', `Alliance scellée avec ${r.name}. Vos hommes ne se battront plus entre eux.`);
  news(s, 4, 'Pacte entre deux familles', `${r.boss} et le ${s.familyName.replace('Famille ', 'clan ')} se partagent la ville. Les autres familles s'inquiètent.`);
  return ok;
}

export function breakAlliance(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r || !r.alliance) return fail('Pas d’alliance à rompre.');
  r.alliance = false;
  r.relation = clamp(r.relation - 40, -100, 100);
  s.respect = clamp(s.respect - 3, 0, 150);
  log(s, 'bad', `Tu romps l'alliance avec ${r.name}. Ta parole vaut un peu moins (−3 respect).`);
  return ok;
}

export function declareWar(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r) return fail('Cette famille a disparu.');
  if (r.war) return fail('Vous êtes déjà en guerre.');
  if (r.alliance) breakAlliance(s, id);
  r.war = true;
  r.truceWeeks = 0;
  r.relation = Math.min(r.relation, -70);
  s.respect = clamp(s.respect + 4, 0, 150);
  log(s, 'bad', `Guerre ouverte avec ${r.name} ! Leurs attaques vont redoubler (+4 respect).`);
  news(s, 5, 'La guerre des gangs est déclarée', `${r.name} et la ${s.familyName} vont s'entretuer. La préfecture promet des renforts.`);
  return ok;
}

export function makePeace(s: GameState, id: string): Result {
  const r = get(s, id);
  if (!r || !r.war) return fail('Vous n’êtes pas en guerre.');
  if (s.clean < PEACE_COST) return fail(`Il faut ${PEACE_COST} $ propres pour les « réparations ».`);
  s.clean -= PEACE_COST;
  r.war = false;
  r.relation = -30;
  r.truceWeeks = 4;
  log(s, 'neutral', `Paix signée avec ${r.name} : 4 semaines de trêve.`);
  news(s, 3, 'Fin de la guerre des gangs ?', `${r.boss} aurait accepté des « réparations ». Les fleuristes du quartier perdent un gros client.`);
  return ok;
}

export function relationsTick(s: GameState) {
  for (const r of s.rivals) {
    if (!r.alive) continue;
    if (r.talkCooldown > 0) r.talkCooldown--;
    if (r.war) r.relation = Math.min(r.relation, -60);
    else if (r.relation > 0) r.relation -= 1;
    else if (r.relation < 0) r.relation += 1;
    if (r.alliance && r.relation < 15) {
      r.alliance = false;
      log(s, 'bad', `${r.name} rompt l'alliance : la confiance n'est plus là.`);
    }
  }
}

// ---------- Corrano Herald ----------
const FILLERS: [string, string][] = [
  ['Le maire promet une ville « sèche et propre »', 'Discours enflammé devant la ligue de tempérance. Le champagne coulait au banquet qui a suivi.'],
  ['Les Corrano Kings battent Detroit', 'Victoire 4 à 2 au stade municipal. 22 000 spectateurs, dont beaucoup visiblement éméchés.'],
  ['Le jazz fait scandale à Southside', 'Les ligues de vertu dénoncent « une musique de perdition ». Les clubs affichent complet.'],
  ['Brouillard épais sur le lac', 'Trois jours sans visibilité. Les garde-côtes restent à quai, les contrebandiers non.'],
  ["L'acier de Corrano au plus haut", 'Les aciéries embauchent. Les ouvriers ont soif, et pas de limonade.'],
  ['Un agent fédéral muté à Omaha', 'Il avait refusé une enveloppe de trop, disent les mauvaises langues.'],
];

export function publishHerald(s: GameState) {
  const best = [...s.news].sort((a, b) => b.prio - a.prio)[0];
  const [title, sub] = best ? [best.title, best.sub] : pick(FILLERS);
  s.headlines.unshift({ week: s.week, title, sub });
  if (s.headlines.length > 30) s.headlines.length = 30;
  s.news = [];
}
