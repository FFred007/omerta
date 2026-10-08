// Fin de partie : expéditions, révoltes, brigade, élections, sénateur, galas.
import * as E from '../src/engine';
import * as EG from '../src/endgame';
import { resolveEvent } from '../src/events';
import { dossierForecast } from '../src/dossier';
import { district, owned, projection } from '../src/state';
import type { GameState, PendingEvent } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`);
  if (!ok) fails++;
};
const big = () => {
  const s = E.startGame(undefined, true);
  s.districts.filter((d) => (d.city ?? 'corrano') === 'corrano').slice(0, 7).forEach((d) => { if (d.owner !== 'player') d.owner = 'player'; });
  s.week = 30;
  s.respect = 70;
  s.pendingEvent = null;
  return s;
};
const pe = (s: GameState) => s.pendingEvent as PendingEvent | null;

// 1. l'expédition : annoncée, chance affichée = chance réelle
{
  let held = 0, shown = 0, n = 0, planned = 0;
  for (let i = 0; i < 400; i++) {
    const s = big();
    s.expeditionCd = 0;
    for (let k = 0; k < 60 && !s.expedition; k++) { E.endTurn(s); s.pendingEvent = null; if (s.status !== 'playing') break; }
    if (!s.expedition) continue;
    planned++;
    while (s.status === 'playing' && s.expedition && s.week < s.expedition.arrive) { E.endTurn(s); s.pendingEvent = null; }
    if (!s.expedition || s.status !== 'playing' || district(s, s.expedition.target).owner !== 'player') continue;
    // juste avant la résolution, on fige l'état : plus d'assauts rivaux pour ne pas fausser la défense
    s.rivals.forEach((r) => (r.aggression = 0));
    const target = s.expedition.target;
    s.members.filter((m) => !m.isDon && m.status === 'actif').slice(0, 1 + (i % 4)).forEach((m) => (m.assignment = target));
    const p = EG.expeditionHold(s);
    const rid = s.expedition.rivalId;
    // on joue seulement la résolution de l'expédition
    const t = structuredClone(s);
    t.week = s.expedition.arrive;
    EG.endgameTick(t);
    n++; shown += p;
    if (district(t, target).owner === 'player') held++;
    void rid;
  }
  check(planned > 200, `expéditions déclenchées : ${planned}/400`);
  check(n > 200 && Math.abs(held / n - shown / n) < 0.08, `tenir face à l'expédition : affiché ${(shown / n * 100).toFixed(1)} %, réel ${(held / n * 100).toFixed(1)} % (${n} parties)`);
  const s = big();
  s.expedition = { rivalId: s.rivals.find((r) => r.city !== 'corrano')!.id, target: owned(s)[0].id, force: 20, arrive: s.week + 2 };
  s.dirty = 100000;
  const cost = EG.payoffCost(s);
  check(EG.payOffExpedition(s).ok && !s.expedition && s.dirty === 100000 - cost, `les payer : ${cost} $`);
}

// 2. la révolte
{
  const s = big();
  const d = owned(s).find((x) => x.id !== 'sicily' && x.shops.length)!;
  d.shops.forEach((x) => (x.satisfaction = 5));
  for (let k = 0; k < 25 && pe(s)?.key !== 'eg_revolt'; k++) { s.pendingEvent = null; d.shops.forEach((x) => (x.satisfaction = 5)); E.endTurn(s); }
  check(pe(s)?.key === 'eg_revolt', 'trois semaines à bout : révolte');
  if (pe(s)?.key === 'eg_revolt') {
    const id = String(pe(s)!.data?.district);
    resolveEvent(s, 'eg_let');
    check(district(s, id).owner === 'neutral', 'laisser faire : le quartier est perdu');
  }
}

// 3. la brigade et le sénateur
{
  const s = big();
  s.dossier = 60;
  s.brigade = { weeks: 3 };
  const lines = dossierForecast(s).map((l) => l.label).join(' | ');
  check(lines.includes('Brigade'), 'brigade dans les prévisions du dossier');
  check(EG.politicsRaids(s) === EG.BRIGADE_RAIDS, 'descentes ×1,6');
  s.clean = 30000;
  const before = projection(s).bribes;
  check(EG.buySenator(s).ok && !EG.brigadeActive(s), 'le sénateur fait rappeler la brigade');
  check(projection(s).bribes === before + EG.SENATOR_RETAINER, 'mensualité du sénateur dans les enveloppes');
  check(dossierForecast(s).some((l) => l.value === EG.SENATOR_DOSSIER), 'sénateur : −2 dossier par semaine');
  // enveloppes impayées : il part
  s.clean = 0; s.dirty = 0;
  E.endTurn(s);
  check(!s.senator, 'sans enveloppe, le sénateur te lâche');
}

// 4. les élections : chance affichée = chance réelle
{
  let win = 0, shown = 0;
  for (let i = 0; i < 2000; i++) {
    const s = big();
    s.clean = 20000;
    for (let k = 0; k < i % 6; k++) EG.fundCampaign(s);
    EG.election(s).next = s.week;
    shown += EG.electionChance(s);
    const t = structuredClone(s);
    EG.endgameTick(t);
    if (t.election!.mayor === 'ami') win++;
  }
  check(Math.abs(win / 2000 - shown / 2000) < 0.03, `élection : affiché ${(shown / 20).toFixed(1)} %, réel ${(win / 20).toFixed(1)} %`);
}

// 5. le gala
{
  const s = big();
  s.clean = 20000;
  const r = s.respect;
  check(EG.holdGala(s).ok && s.respect === r + 5 && s.clean === 15000, 'gala : 5 000 $, +5 respect');
  check(!EG.holdGala(s).ok && EG.galaCost(s) === 10000, 'cooldown, et le suivant coûte 10 000 $');
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
