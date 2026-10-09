// Le cercle du Don : vote de l'héritier, rancunes, et le cercle hérité de l'ascension.
import * as E from '../src/engine';
import * as CI from '../src/circle';
import * as F from '../src/family';
import { resolveEvent } from '../src/events';
import { donOf } from '../src/don';
import { makeMember } from '../src/state';
import type { GameState, Member } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`);
  if (!ok) fails++;
};

/** Une partie rapide avec un héritier adulte dans les affaires */
function withHeir(): { s: GameState; heir: Member } {
  const s = E.startGame(undefined, true);
  const id = s.nextId++;
  s.children = [{ id, name: 'Vito', sex: 'm', birthWeek: s.week - 6 * 17, seed: 42, education: ['ecole', 'rue'] as never, generation: 1 }];
  const heir = makeMember(s, { name: 'Vito', nickname: 'le Petit', isChild: true, childId: id, loyalty: 100, salary: 0, level: 2, sex: 'm' });
  s.members.push(heir);
  s.children[0].memberId = heir.id;
  s.heirId = id;
  return { s, heir };
}

// 1. partie rapide : un cercle dès le départ
{
  const s = E.startGame(undefined, true);
  check(!!CI.consigliere(s) && CI.circle(s).length === 3, `cercle initial : ${CI.circle(s).map((n) => n.role).join(', ')}`);
  check(!CI.heirTally(s).heir, 'pas d’héritier au départ');
}

// 2. la prévision du vote = le vote réel ; victoire, puis rancunes
{
  let exact = 0, total = 0;
  for (let g = 0; g < 200; g++) {
    const { s, heir } = withHeir();
    s.members.filter((m) => m.rank === 'capo' && !m.isDon).forEach((m, i) => { m.loyalty = 20 + ((g * 7 + i * 13) % 70); if (i === 0) m.level = 4; });
    s.heirFavor = (g * 3) % 30;
    const f = CI.heirTally(s);
    const don = donOf(s)!;
    s.pendingEvent = null;
    F.succession(s, don, 'est tombé sous les balles');
    total++;
    if (!f.pretender) { if (donOf(s)?.id === heir.id) exact++; continue; }
    const ev = s.pendingEvent as import('../src/types').PendingEvent | null;
    const winEv = ev?.key === 'ci_vote' && ev.choices[0].effect === 'ci_win';
    if (ev?.key === 'ci_vote' && winEv === f.wins && ev.text.includes(`${f.yes} voix sur ${f.voters.length}`)) exact++;
  }
  check(exact === total, `vote prévu = vote réel : ${exact}/${total}`);
}
{
  const { s, heir } = withHeir();
  const capos = s.members.filter((m) => m.rank === 'capo' && !m.isDon && !m.isChild);
  capos.forEach((m) => (m.loyalty = 90));
  s.circle!.forEach((n) => (n.affinity = 80));
  const extra = makeMember(s, { name: 'Sal Basso', nickname: 'le Gros', rank: 'capo', loyalty: 20, level: 5 });
  s.members.push(extra);
  const t = CI.heirTally(s);
  check(t.pretender?.id === extra.id && t.wins, `prétendant ${t.pretender?.nickname}, l'héritier gagne ${t.yes}/${t.voters.length}`);
  s.pendingEvent = null;
  F.succession(s, donOf(s)!, 'est mort');
  check((s.pendingEvent as import('../src/types').PendingEvent | null)?.key === 'ci_vote', 'le vote est une décision');
  resolveEvent(s, 'ci_win');
  check(donOf(s)?.id === heir.id && !s.pendingEvent, 'Vito est Don');
  check(!!s.members.find((m) => m.id === extra.id)?.grudge, 'le prétendant garde rancune');
}

// 3. défaite : s'incliner met fin à la lignée ; la force peut sauver le trône
{
  const lose = () => {
    const { s, heir } = withHeir();
    s.members.filter((m) => m.rank === 'capo' && !m.isDon && !m.isChild).forEach((m) => { m.loyalty = 10; m.grudge = true; });
    s.circle!.forEach((n) => (n.affinity = -40));
    s.pendingEvent = null;
    F.succession(s, donOf(s)!, 'est mort');
    return { s, heir };
  };
  const a = lose();
  check((a.s.pendingEvent as import('../src/types').PendingEvent | null)?.choices.some((c) => c.effect === 'ci_yield') ?? false, 'vote perdu : choix de s’incliner ou de forcer');
  resolveEvent(a.s, 'ci_yield');
  check(a.s.status === 'lost' || a.s.status === 'won', `s’incliner : fin de partie (${a.s.ending?.kind})`);
  let ok = 0, n = 0, shown = 0;
  for (let i = 0; i < 400; i++) {
    const b = lose();
    const p = Number(b.s.pendingEvent?.data?.p);
    shown += p; n++;
    resolveEvent(b.s, 'ci_force');
    if (donOf(b.s)?.id === b.heir.id) ok++;
  }
  check(Math.abs(ok / n - shown / n) < 0.06, `prise par la force : affiché ${(shown / n * 100).toFixed(1)} %, réel ${(ok / n * 100).toFixed(1)} %`);
  const c = lose();
  const before = c.s.members.filter((m) => m.rank === 'capo' && !m.isChild).length;
  const orig = Math.random; Math.random = () => 0; resolveEvent(c.s, 'ci_force'); Math.random = orig;
  check(donOf(c.s)?.id === c.heir.id && c.s.members.filter((m) => m.rank === 'capo' && !m.isChild && !m.isDon).length < before && !!CI.consigliere(c.s), 'force réussie : les opposants disparaissent, un nouveau consigliere');
}

// 4. présenter l'héritier
{
  const { s } = withHeir();
  s.dirty = 10000;
  const b0 = CI.heirBonus(s, F.currentHeir(s));
  check(CI.presentHeir(s).ok && CI.heirBonus(s, F.currentHeir(s)) === b0 + CI.PRESENT_GAIN, `présentation : +${CI.PRESENT_GAIN}`);
  check(!CI.presentHeir(s).ok, 'une présentation toutes les 4 semaines');
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
