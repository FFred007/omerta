// Le réseau vivant : approches (chance affichée = réelle), remplaçants, double jeu caché, prévisions exactes.
import * as E from '../src/engine';
import * as NET from '../src/network';
import { resolveEvent } from '../src/events';
import { dossierForecast } from '../src/dossier';
import { projection } from '../src/state';
import type { GameState } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`); if (!ok) fails++; };
const fresh = () => { const s = E.startGame(undefined, true); s.respect = 80; s.clean = 100000; s.favors = 10; s.judge = true; s.pendingEvent = null; return s; };

// 1. approches : chance affichée = chance réelle, pour chaque tempérament
for (const temper of ['venal', 'prudent', 'ambitieux', 'integre'] as NET.Temper[]) {
  for (const how of ['enveloppe', 'chantage'] as NET.Approach[]) {
    let ok = 0, n = 0, shown = 0;
    for (let i = 0; i < 1500; i++) {
      const s = fresh();
      NET.newHolder(s, 'greffier', { temper });
      shown += NET.approachChance(s, 'greffier', how); n++;
      NET.approach(s, 'greffier', how);
      if (NET.isPaid(s, 'greffier')) ok++;
    }
    check(Math.abs(ok / n - shown / n) < 0.035, `${temper} · ${how} : affiché ${(shown / n * 100).toFixed(0)} %, réel ${(ok / n * 100).toFixed(0)} %`);
  }
}
{
  const s = fresh();
  NET.approach(s, 'capitaine', 'enveloppe');
  NET.contactState(s, 'capitaine').active = true;
  check(!!NET.intermediary(s, 'commissaire'), `intermédiaire pour le commissaire : ${NET.intermediary(s, 'commissaire')}`);
  check(NET.approachChance(s, 'commissaire', 'intermediaire') - NET.approachChance(s, 'commissaire', 'enveloppe') > 0.2, 'l’intermédiaire ajoute 25 %');
}

// 2. poste vacant, puis un remplaçant
{
  const s = fresh();
  const st = NET.contactState(s, 'greffier');
  st.active = true;
  st.vacantUntil = s.week + 2; st.person = undefined; st.active = false; st.known = true;
  check(!!NET.blocker(s, NET.contactDef('greffier')), 'poste vacant : on ne peut approcher personne');
  for (let k = 0; k < 4; k++) { s.pendingEvent = null; E.endTurn(s); }
  check(!!NET.contactState(s, 'greffier').person && NET.contactState(s, 'greffier').vacantUntil === undefined, `remplaçant : ${NET.holderName(s, 'greffier')} (${NET.contactState(s, 'greffier').person?.temper})`);
}

// 3. double jeu : l'effet s'arrête, la prévision du joueur ne le montre pas, le moteur reste exact
{
  const s = fresh();
  NET.contactState(s, 'greffier').active = true;
  const before = dossierForecast(s).reduce((t, l) => t + l.value, 0);
  NET.contactState(s, 'greffier').turned = { rivalId: s.rivals[0].id, since: s.week - 1 };
  const real = dossierForecast(s).reduce((t, l) => t + l.value, 0);
  const believed = dossierForecast(s, true).reduce((t, l) => t + l.value, 0);
  check(real === before + 1 && believed === before, `greffier traître : réel ${real}, ce que le joueur croit ${believed}`);
  check(projection(s).bribes > 0, 'on continue de le payer');
  // il finit par se trahir
  let found = 0, weeks = 0;
  for (let g = 0; g < 200; g++) {
    const t = fresh();
    t.rivals[0].relation = -80;
    NET.contactState(t, 'greffier').active = true;
    NET.contactState(t, 'greffier').turned = { rivalId: t.rivals[0].id, since: t.week - 1 };
    for (let k = 0; k < 15; k++) {
      t.pendingEvent = null;
      NET.networkTick(t);
      if ((t.pendingEvent as { key: string } | null)?.key === 'net_turned') { found++; weeks += k + 1; resolveEvent(t, 'nt_fire'); break; }
    }
  }
  check(found > 190, `découvert dans les 15 semaines : ${found}/200 (en moyenne ${(weeks / found).toFixed(1)} sem.)`);
}

// 4. une partie complète ne casse rien
{
  let ok = true;
  for (let g = 0; g < 30; g++) {
    const s: GameState = fresh();
    for (const id of ['reporter', 'greffier', 'capitaine', 'cure'] as NET.ContactId[]) NET.approach(s, id, 'enveloppe');
    for (let w = 0; w < 60 && s.status === 'playing'; w++) {
      for (let k = 0; k < 6 && s.pendingEvent; k++) resolveEvent(s, s.pendingEvent.choices.filter((x) => !x.disabled)[0].effect);
      s.pendingEvent = null;
      E.endTurn(s);
    }
    for (const c of NET.CONTACTS) { const st = NET.contactState(s, c.id); if (st.active && !st.person) ok = false; }
  }
  check(ok, '60 semaines : aucun contact payé sans titulaire');
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
