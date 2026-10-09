// Équipes des capos : répartition équilibrée, quartiers, poste automatique, bonus, cascade, trahison, garde.
import * as E from '../src/engine';
import * as CR from '../src/crews';
import * as CMD from '../src/command';
import { addBond } from '../src/bonds';
import { resolveEvent } from '../src/events';
import { guardHolds, resolvePressureEffect } from '../src/pressure';
import { activeMembers, defenseOf, makeMember, makeRecruit, owned, projection } from '../src/state';
import { donOf } from '../src/don';
import type { GameState } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`); if (!ok) fails++; };
const add = (s: GameState, n: number, extra: Record<string, unknown> = {}) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const { id: _i, cost: _c, ...r } = makeRecruit(s) as never as Record<string, never>; void _i; void _c;
    const m = makeMember(s, { ...(r as object), assignment: null, ...extra });
    s.members.push(m); out.push(m);
  }
  return out;
};
/** Une grande famille : 6 quartiers, 3 capos, une vingtaine d'hommes */
function big() {
  const s = E.startGame(undefined, true);
  s.districts.filter((d) => (d.city ?? 'corrano') === 'corrano').slice(0, 6).forEach((d) => (d.owner = 'player'));
  add(s, 2, { rank: 'capo', level: 4, loyalty: 80 });
  add(s, 18);
  s.crewsInit = false;
  CR.initCrews(s);
  return s;
}

// 1. répartition : tailles respectées, garde au plus 4, équipes équilibrées
{
  let maxGap = 0, ok = true;
  for (let g = 0; g < 100; g++) {
    const s = big();
    const garde = CR.crewOf(s, 'garde').length;
    if (garde > CR.GARDE_MAX || garde < 1) ok = false;
    const sums = CR.capos(s).map((c) => { const crew = CR.crewOf(s, c.id); if (crew.length > CR.crewCap(c)) ok = false; return crew.reduce((t, m) => t + m.force + m.discretion + (m.level ?? 0), 0); });
    maxGap = Math.max(maxGap, (Math.max(...sums) - Math.min(...sums)) / (Math.max(...sums) || 1));
  }
  check(ok, 'tailles d’équipe respectées (garde ≤ 4, capo ≤ 3 + niveau/2)');
  check(maxGap < 0.35, `équipes équilibrées : écart max ${(maxGap * 100).toFixed(0)} % entre la plus forte et la plus faible`);
}

// 2. les rivaux ne servent pas ensemble, les frères restent ensemble
{
  let sep = 0, tog = 0, n = 0;
  for (let g = 0; g < 100; g++) {
    const s = big();
    const sol = CR.soldiers(s);
    addBond(s, sol[0].id, sol[1].id, 'rivaux');
    addBond(s, sol[2].id, sol[3].id, 'freres');
    CR.autoCrews(s);
    n++;
    if (sol[0].crew !== sol[1].crew || sol[0].crew === undefined) sep++;
    if (sol[2].crew === sol[3].crew) tog++;
  }
  check(sep === n, `rivaux séparés : ${sep}/${n}`);
  check(tog > n * 0.6, `frères d'armes ensemble : ${tog}/${n}`);
}

// 3. quartiers et poste automatique : chaque quartier de capo est gardé, la garde est avec le Don
{
  const s = big();
  const withCapo = owned(s).filter((d) => d.capo !== undefined);
  check(withCapo.length === owned(s).length, `tous les quartiers ont un capo (${withCapo.length}/${owned(s).length})`);
  const empty = owned(s).filter((d) => !activeMembers(s).some((m) => m.assignment === d.id));
  check(empty.length === 0, `aucun quartier vide après le poste automatique (${empty.map((d) => d.name).join(', ') || 'aucun'})`);
  const don = donOf(s)!;
  check(CR.crewOf(s, 'garde').every((m) => m.assignment === don.assignment), 'la garde est postée avec le Don');
  // poste fixé : le capo n'y touche plus
  const m = CR.crewOf(s, CR.capos(s)[0].id)[0];
  const other = owned(s).find((d) => d.id !== m.assignment)!;
  E.assign(s, m.id, other.id); m.pinned = true;
  E.endTurn(s); s.pendingEvent = null;
  check(m.assignment === other.id || m.status !== 'actif', 'un poste fixé à la main reste en place');
}

// 4. bonus de commandement
{
  const s = big();
  const c = CR.capos(s)[0];
  const man = CR.crewOf(s, c.id)[0];
  c.traits = [];
  const d = owned(s).find((x) => x.id === man.assignment)!;
  const before = defenseOf(s, d);
  c.traits = ['brute'];
  check(CMD.commandForce(s, man) === 1 && defenseOf(s, d) > before, `meneur d'hommes : défense ${before} → ${defenseOf(s, d)}`);
  c.traits = ['comptable'];
  const zone = CR.capoDistricts(s, c.id);
  c.traits = [];
  const r0 = projection(s).dirtyIn;
  c.traits = ['comptable'];
  check(!zone.length || projection(s).dirtyIn > r0, `bon gestionnaire : revenus ${r0} → ${projection(s).dirtyIn}`);
}

// 5. loyauté en cascade, et le traître part avec ses hommes peu loyaux
{
  const s = big();
  const c = CR.capos(s)[0];
  const crew = CR.crewOf(s, c.id);
  c.loyalty = 90; crew[0].loyalty = 40;
  CR.cascadeTick(s);
  check(crew[0].loyalty === 41, 'les hommes se rapprochent de la loyauté de leur capo');
  crew.forEach((m, i) => (m.loyalty = i % 2 ? 30 : 80));
  const shaky = crew.filter((m) => m.loyalty < 50 && !(m.traits ?? []).includes('fidele')).length;
  const before = s.members.length;
  CR.capoLeaves(s, c);
  s.members = s.members.filter((m) => m.id !== c.id);
  check(s.members.length === before - shaky - 1, `le capo part avec ${shaky} homme(s) peu loyaux`);
  check(crew.filter((m) => s.members.includes(m)).every((m) => m.crew === undefined), 'les autres se retrouvent sans équipe');
}

// 6. la garde et le coup d'État : chance affichée = chance réelle
{
  let held = 0, shown = 0, n = 0;
  for (let i = 0; i < 1500; i++) {
    const s = big();
    const c = CR.capos(s)[i % 2];
    c.loyalty = 30; c.level = 4;
    const p = guardHolds(s, c);
    const don = donOf(s)!;
    // on force la tentative
    const orig = Math.random;
    let first = true;
    Math.random = () => { if (first) { first = false; return 0; } return orig(); };
    resolvePressureEffect(s, 'pr_amb_ignore', { key: 'ambition', title: '', text: '', choices: [], data: { member: c.id } });
    Math.random = orig;
    shown += p; n++;
    if (s.members.includes(don) && don.status === 'actif') held++;
  }
  check(Math.abs(held / n - shown / n) < 0.04, `la garde repousse le traître : affiché ${(shown / n * 100).toFixed(1)} %, réel ${(held / n * 100).toFixed(1)} %`);
}

// 7. une recrue rejoint une équipe ; un nouveau capo prend les sans-équipe
{
  const s = big();
  s.dirty = 50000;
  const r = s.recruits[0];
  E.hire(s, r.id);
  const m = s.members.find((x) => x.id === r.id)!;
  check(m.crew !== undefined || CR.capos(s).every((c) => CR.crewOf(s, c.id).length >= CR.crewCap(c)), `la recrue rejoint ${CR.crewName(s, m.crew)}`);
  // partie complète : rien ne casse
  const t = big();
  for (let w = 0; w < 30 && t.status === 'playing'; w++) {
    for (let k = 0; k < 6 && t.pendingEvent; k++) resolveEvent(t, t.pendingEvent.choices.filter((x) => !x.disabled)[0].effect);
    t.pendingEvent = null;
    E.endTurn(t);
  }
  const orphans = t.members.filter((x) => typeof x.crew === 'number' && !t.members.some((c) => c.id === x.crew));
  check(orphans.length === 0, `30 semaines : aucun homme rattaché à un capo disparu (${t.status})`);
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
