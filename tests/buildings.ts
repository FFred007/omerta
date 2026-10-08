// Bâtiments : nouveaux types, améliorations, emplacements, effets.
import * as E from '../src/engine';
import * as BL from '../src/buildings';
import { district, projection } from '../src/state';
import { launderFee } from '../src/don';
import { settle } from '../src/engine';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`); if (!ok) fails++; };

const s = E.startGame(undefined, true);
s.dirty = 100000; s.clean = 100000;
const d = district(s, 'sicily');
// emplacements
const before = d.slots;
check(BL.buySlot(s, d).ok && d.slots === before + 1, `emplacement acheté (${before} → ${d.slots})`);
while (d.slots < 5) BL.buySlot(s, d);
check(!BL.buySlot(s, d).ok, 'pas plus de 5 emplacements');
// ville réservée et respect
check(!!BL.buildBlocker(s, d, 'casino'), 'casino interdit hors de Mirage Springs');
s.respect = 10;
check(!!BL.buildBlocker(s, d, 'credit'), 'caisse de crédit : 60 respect requis');
// hôtel : revenu propre
const c0 = projection(s).cleanIn;
E.build(s, 'sicily', 'hotel');
check(projection(s).cleanIn - c0 === Math.round(600 * 1), `hôtel : +${projection(s).cleanIn - c0} propre`);
// club chic
const speak = d.businesses.find((b) => b.kind === 'speakeasy')!;
s.stock = { biere: 0, gin: 100, whisky: 0 };
const sold0 = projection(s).plan.sold.gin;
check(BL.upgrade(s, d, speak.id).ok && projection(s).plan.sold.gin === 30 && sold0 === 18, `club chic : ${sold0} → ${projection(s).plan.sold.gin} caisses`);
// usurier : dépend de la satisfaction
E.build(s, 'sicily', 'usurier');
const u = d.businesses.find((b) => b.kind === 'usurier')!;
d.shops.forEach((x) => (x.satisfaction = 50));
check(BL.bizIncome(s, d, u) === 600, `usurier à 50 de satisfaction : ${BL.bizIncome(s, d, u)} $`);
// caisse de crédit : commission
s.respect = 70;
const fee0 = launderFee(s);
E.build(s, 'sicily', 'credit');
check(Math.abs(launderFee(s) - (fee0 - 0.05)) < 1e-9, `commission ${fee0} → ${launderFee(s)}`);
// prévisions = moteur avec ces bâtiments
let bad = 0;
for (let i = 0; i < 10; i++) {
  s.pendingEvent = null;
  const f = settle(s);
  const d0 = s.dirty, k0 = s.clean, r0 = s.stats.raids;
  E.endTurn(s);
  if (s.stats.raids !== r0 || s.lastReport.some((e) => /rembourse|Contrat rempli|Écarter|Égarer|grand coup|Grand coup/.test(e.text))) continue;
  if (s.dirty - d0 !== f.dirtyNet || s.clean - k0 !== f.cleanNet) bad++;
}
check(bad === 0, `prévisions exactes avec les nouveaux bâtiments (écarts : ${bad})`);
console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
