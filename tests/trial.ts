// Procès : inculpation à 100, 3 étapes + verdict, acquittement calibré, condamnation → succession.
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { acquittalChance } from '../src/dossier';
import * as N from '../src/network';
import { donOf } from '../src/don';
const assert = (c: unknown, m: string) => { console.log(c ? 'ok :' : 'ÉCHEC :', m); if (!c) process.exitCode = 1; };

const s = E.startGame();
(s as any).pendingEvent = null; s.rivals.forEach((r) => (r.aggression = 0));
s.dossier = 99; s.heat = 95; s.clean = 20000;
E.endTurn(s);
const pe = s.pendingEvent as { key: string; title: string } | null;
assert(!!s.trial && pe?.key === 'proces', `inculpation à ${s.dossier} : procès ouvert (${pe?.title})`);
const picks = ['tr_jury_buy', 'tr_wit_pay', 'tr_law_star'];
for (let i = 0; i < 3; i++) { resolveEvent(s, picks[i]); s.heat = 0; E.endTurn(s); }
assert((s.pendingEvent as { title: string } | null)?.title === 'Le verdict', `verdict après 3 étapes, défense ${s.trial?.score} points`);
const p = acquittalChance(s);
let acq = 0; const n = 4000;
for (let i = 0; i < n; i++) {
  const c = structuredClone(s);
  resolveEvent(c, 'tr_verdict');
  if (donOf(c)?.name === donOf(s)?.name && c.status === 'playing') acq++;
}
assert(Math.abs(acq / n - p) < 0.03, `acquittement affiché ${Math.round(p * 100)} %, réel ${(acq / n * 100).toFixed(1)} %`);

// l'agent fédéral repousse la première inculpation
const a = E.startGame();
(a as any).pendingEvent = null; a.respect = 90; a.clean = 50000;
N.contactState(a, 'greffier').active = true;
assert(N.hire(a, 'agent').ok, 'agent Kessler recruté (introduit par le greffier)');
a.dossier = 100; a.heat = 30;
E.endTurn(a);
assert(!a.trial && (a.dossier ?? 0) < 100, `inculpation repoussée par l'agent (dossier ${a.dossier})`);

// prévisions du réseau : mensualités comptées
const b = E.startGame();
(b as any).pendingEvent = null; b.respect = 30; b.clean = 20000;
N.hire(b, 'reporter'); N.hire(b, 'cure');
const f = E.settle(b);
assert(f.bribes === N.priceOf(b, 'reporter') + N.priceOf(b, 'cure'), `mensualités dans les prévisions : ${f.bribes} $`);
