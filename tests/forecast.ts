// Vérifie que le tableau des prévisions = ce que le moteur applique (tours sans assaut, sans coup, sans descente).
import * as B from '../src/booze';
import * as E from '../src/engine';
import { resolveEvent } from '../src/events';
import { salesPlan } from '../src/state';
let checked = 0, bad = 0;
for (let g = 0; g < 300; g++) {
  const s = E.startGame();
  s.launderRate = [1, 0.5, 0][g % 3];
  E.build(s, 'sicily', 'tripot');
  while (s.status === 'playing' && s.week < 40) {
    if (s.pendingEvent) { resolveEvent(s, s.pendingEvent.choices.find((c) => !c.disabled)!.effect); continue; }
    if (s.clean > 2500 && s.districts[5].businesses.length < 3) E.build(s, 'sicily', 'blanchisserie');
    if (s.dirty > 1500) B.orderSmuggle(s, 'gin', Math.min(30, B.freeRoom(s)), 'legere');
    const f = E.settle(s);
    const plan = salesPlan(s);
    const d0 = s.dirty, c0 = s.clean, r0 = s.stats.raids;
    const incoming = s.shipments.reduce((a, x) => a + x.qty, 0);
    E.endTurn(s);
    if (s.stats.raids !== r0 || s.status !== 'playing' || s.lastReport.some((e) => /rembourse|Contrat rempli|Écarter|Égarer/.test(e.text))) continue;
    checked++;
    const stockOk = s.stock.whisky === plan.stockAfter.whisky && s.stock.biere === plan.stockAfter.biere && s.stock.gin <= plan.stockAfter.gin + incoming;
    if (s.dirty - d0 !== f.dirtyNet || s.clean - c0 !== f.cleanNet || !stockOk) { bad++; if (bad < 4) console.log('écart', s.week, s.dirty - d0, f.dirtyNet, s.clean - c0, f.cleanNet, JSON.stringify(s.stock), JSON.stringify(plan.stockAfter)); }
  }
}
console.log(`tours vérifiés : ${checked}, écarts : ${bad}`);
