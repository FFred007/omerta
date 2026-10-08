// Vérifie que le tableau des prévisions = ce que le moteur applique (tours sans assaut ni descente).
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { newGame } from '../src/state';
let checked = 0, bad = 0;
for (let g = 0; g < 300; g++) {
  const s = newGame();
  s.launderRate = [1, 0.5, 0][g % 3];
  E.build(s, 'sicily', 'tripot');
  while (s.status === 'playing' && s.week < 40) {
    if (s.pendingEvent) { resolveEvent(s, s.pendingEvent.choices.find((c) => !c.disabled)!.effect); continue; }
    if (s.clean > 2500 && s.districts[5].businesses.length < 3) E.build(s, 'sicily', 'blanchisserie');
    const f = E.settle(s);
    const d0 = s.dirty, c0 = s.clean, r0 = s.stats.raids;
    E.endTurn(s);
    if (s.stats.raids !== r0 || s.status !== 'playing') continue;
    checked++;
    if (s.dirty - d0 !== f.dirtyNet || s.clean - c0 !== f.cleanNet) { bad++; if (bad < 4) console.log('écart', s.week, s.dirty - d0, f.dirtyNet, s.clean - c0, f.cleanNet); }
  }
}
console.log(`tours vérifiés : ${checked}, écarts : ${bad}`);
