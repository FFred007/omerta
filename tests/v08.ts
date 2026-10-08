// Vendettas, liens, personnages récurrents, grands coups : vérifications ciblées.
import * as E from '../src/engine';
import { bondOf, shareOp, teamBondBonus, FRERES_AT } from '../src/bonds';
import { activeVendettas, avenge, avengerBonus, vendettasTick } from '../src/vendetta';
import { generateJobs, jobChance } from '../src/jobs';
import { act, hunter, huntersTick } from '../src/hunters';
import { buyGear, heistTick, launchHeist, offerHeist, strikeChance, toggleHeistMember } from '../src/heist';
import { attackPower } from '../src/state';
import type { GameState } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`); if (!ok) fails++; };
const soldiers = (s: GameState) => s.members.filter((m) => !m.isDon && !m.isChild);

// 1. frères d'armes
{
  const s = E.startGame(undefined, true);
  const [a, b] = soldiers(s);
  const before = attackPower(s, [a.id, b.id]);
  for (let i = 0; i < FRERES_AT; i++) shareOp(s, [a.id, b.id]);
  check(bondOf(s, a.id, b.id)?.kind === 'freres', `frères d'armes après ${FRERES_AT} opérations`);
  check(attackPower(s, [a.id, b.id]) === before + 1 && teamBondBonus(s, [a.id, b.id]) === 1, 'bonus +1 en équipe');
  // 2. un frère tombe sous les balles d'une famille : vendetta
  E.killMember(s, b, undefined, 'castellano');
  const v = activeVendettas(s)[0];
  check(!!v && v.avengers.includes(a.id) && v.rivalId === 'castellano', `vendetta ouverte contre ${v?.killer} « ${v?.nickname} », ${a.nickname} parmi les vengeurs`);
  check(!bondOf(s, a.id, b.id), 'le lien disparaît avec le mort');
  generateJobs(s);
  const job = s.jobs.find((j) => j.vendettaId === v.id)!;
  check(!!job && job.city === 'corrano', 'coup de vengeance proposé');
  const other = soldiers(s).find((m) => m.id !== a.id)!;
  check(avengerBonus(s, job, [a.id, other.id]) === 2, `le vengeur pèse plus (${Math.round(jobChance(s, job, [a.id, other.id]) * 100)} % de chances)`);
  const loy = a.loyalty;
  avenge(s, v.id);
  check(!activeVendettas(s).length && a.loyalty === Math.min(100, loy + 15), 'vengeance : vendetta close, +15 loyauté au frère');
  // échéance
  const c = soldiers(s)[0];
  E.killMember(s, c, undefined, 'wolska');
  const r0 = s.respect;
  s.week = activeVendettas(s)[0].deadline;
  vendettasTick(s);
  check(!activeVendettas(s).length && s.respect === Math.max(0, r0 - 4), 'tueur impuni : −4 respect');
}

// 3. la journaliste frappe à 100
{
  const s = E.startGame(undefined, true);
  const h = hunter(s, 'journaliste');
  h.progress = 99.5;
  s.heat = 50;
  const d0 = s.dossier ?? 0;
  huntersTick(s);
  check(h.strikes === 1 && (s.dossier ?? 0) >= d0 + 8 && h.progress === 25, `article publié par ${h.name}, dossier ${d0} → ${s.dossier}`);
  // l'inspecteur tué est remplacé, plus intègre
  const i = hunter(s, 'inspecteur');
  const integ = i.integrity;
  act(s, 'inspecteur', 'kill');
  for (let k = 0; k < 8; k++) huntersTick(s);
  check(i.generation === 2 && i.integrity > integ && i.mood === 'enquete', `remplaçant : ${i.name} (intégrité ${i.integrity})`);
}

// 4. grand coup : la chance affichée est la vraie
{
  let wins = 0, shown = 0;
  const N = 1500;
  for (let k = 0; k < N; k++) {
    const s = E.startGame(undefined, true);
    s.dirty = 50000; s.clean = 20000; s.week = 10;
    offerHeist(s, 'bijoux');
    const h = s.heist!;
    soldiers(s).slice(0, 3).forEach((m) => toggleHeistMember(s, m.id));
    if (!launchHeist(s).ok) continue;
    heistTick(s); // repérages
    buyGear(s, 'plans');
    buyGear(s, 'papiers');
    heistTick(s); // préparation
    shown += strikeChance(s, h);
    const d0 = s.dirty;
    heistTick(s); // jour J
    if (s.dirty > d0) wins++;
  }
  check(Math.abs(wins / N - shown / N) < 0.04, `grand coup : affiché ${(shown / N * 100).toFixed(1)} %, réel ${(wins / N * 100).toFixed(1)} %`);
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
