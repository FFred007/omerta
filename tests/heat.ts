// Vérifie que le détail de heat « sûr » = variation réelle (semaines sans assaut, coup, livraison ni événement de heat).
import * as E from '../src/engine';
import { owned } from '../src/state';
let checked = 0, bad = 0;
for (let g = 0; g < 400; g++) {
  const s = E.startGame();
  E.build(s, 'sicily', 'tripot');
  while (s.status === 'playing' && s.week < 40) {
    s.pendingEvent = null;
    if (g % 2 && owned(s)[0] && !owned(s)[0].bribedCop && s.clean > 1500) E.toggleCop(s, owned(s)[0].id);
    if (s.week % 5 === 0) s.lowProfile = true;
    const f = E.heatForecast(s);
    const h0 = s.heat;
    E.endTurn(s);
    const noisy = s.lastReport.some((e) => /heat|Descente|Trahison|commissariat/.test(e.text));
    const raw = h0 + f.sure;
    if (noisy || s.status !== 'playing' || raw < 0 || raw > 100) continue;
    checked++;
    if (s.heat !== Math.round(raw)) { bad++; if (bad < 4) console.log('écart', s.week, h0, f.sure, s.heat); }
  }
}
console.log(`semaines vérifiées : ${checked}, écarts : ${bad}`);
