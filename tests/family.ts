// Cycle de vie de la famille : rencontre → mariage → naissance → éducation → 16 ans → succession / régence / fin de lignée.
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import * as F from '../src/family';
import { donOf, ageOf } from '../src/don';
import type { GameState } from '../src/types';

function run(s: GameState, weeks: number) {
  for (let i = 0; i < weeks && s.status === 'playing'; i++) {
    for (let ev = s.pendingEvent; ev; ev = s.pendingEvent) resolveEvent(s, ev.choices.find((c) => !c.disabled)!.effect);
    s.heat = 0; s.clean += 3000; s.dirty += 2000; // on neutralise l'économie : on teste la famille
    E.endTurn(s);
  }
  for (let ev = s.pendingEvent; ev; ev = s.pendingEvent) resolveEvent(s, ev.choices.find((c) => !c.disabled)!.effect);
}
const assert = (c: unknown, msg: string) => { if (!c) { console.log('ÉCHEC :', msg); process.exitCode = 1; } else console.log('ok :', msg); };

// 1. mariage et enfants
const s = E.startGame();
s.pendingEvent = null;
s.rivals.forEach((x) => (x.aggression = 0));
F.startCourtship(s, F.makeCandidate(s, 'banquier'));
for (let i = 0; i < 6; i++) { s.clean += 1000; F.dateCourtship(s, i % 2 ? 'cadeau' : 'diner'); s.week++; }
s.clean += 3000;
assert(s.courtship!.progress >= 100, `cour à ${s.courtship!.progress}/100 après 6 rendez-vous`);
assert(F.propose(s).ok && !!s.spouse, 'mariage célébré');
let weeks = 0;
while (!(s.children ?? []).length && weeks < 120) { s.spouse!.affection = 90; run(s, 1); weeks++; }
assert((s.children ?? []).length > 0, `premier enfant né après ${weeks} semaines`);
const kid = s.children![0];
run(s, 40);
assert(kid.education.length >= 1, `éducation choisie (${kid.education.join(', ')}) à ${Math.floor(F.childAge(s, kid))} ans`);
run(s, 70);
console.log('   statut :', s.status, s.endReason);
assert(!!kid.memberId && s.members.some((m) => m.id === kid.memberId), `entre dans la famille à ${Math.floor(F.childAge(s, kid))} ans`);
if (!donOf(s)) console.log('   dynastie :', JSON.stringify(s.dynasty), 'régence', JSON.stringify(s.regency));
const don = donOf(s)!;
don.talents = ['b_reputation', 'b_silence', 'p_respect', 'p_parole'];
E.killMember(s, don);
const nd = donOf(s);
assert(nd && nd.id === kid.memberId, `succession : ${nd?.name} devient le Don`);
assert(nd!.talents!.length >= 2, `talents hérités : ${nd!.talents!.join(', ')}`);
assert(s.status === 'playing', 'la partie continue');

// 2. régence
const r = E.startGame();
r.pendingEvent = null;
r.rivals.forEach((x) => (x.aggression = 0));
r.spouse = { ...F.makeCandidate(r, 'commercante'), affection: 80 } as any;
r.children = [{ id: 9999, name: 'Leo Moretti', sex: 'm', birthWeek: r.week - 30, seed: 1, education: [], generation: 1 }];
E.killMember(r, donOf(r)!);
assert(!!r.regency && !donOf(r), `régence ouverte (régent : ${r.regency?.regentName})`);
const regent = r.members.find((m) => m.id === r.regency?.regentId);
if (regent) regent.loyalty = 100;
run(r, 80);
assert(!!donOf(r) && donOf(r)!.childId === 9999, `fin de régence : ${donOf(r)?.name} prend la tête à ${Math.floor(ageOf(r, donOf(r)!))} ans`);

// 3. fin de lignée
const z = E.startGame();
z.pendingEvent = null;
E.killMember(z, donOf(z)!);
assert(z.status === 'lost', `sans héritier : ${z.endReason}`);
