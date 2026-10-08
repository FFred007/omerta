// L'ascension jouée par un bot : rythme des promotions et devenir Don.
import * as E from '../src/engine';
import * as B from '../src/booze';
import { resolveEvent } from '../src/events';
import { gift, missionChance, missionCrewAllowed, startCareer, successionTally, toggleMission, toggleMissionCrew } from '../src/career';
import { activeMembers, owned } from '../src/state';
import { spendPoint } from '../src/don';

const N = Number(process.argv[2] ?? 200);
const res = { don: 0, lost: 0, dead: 0, stuck: 0 };
const weeksTo: Record<string, number[]> = { soldat: [], capo: [], don: [] };
const ends: Record<string, number> = {};
let lostSuccession = 0;
const donAfter: number[] = [];
const atDon: number[] = [];

for (let g = 0; g < N; g++) {
  const s = startCareer({ first: 'Tony', last: 'Bianchi', origin: ['rues', 'boucher', 'boxeur', 'comptable', 'docker'][g % 5], classic: g % 2 === 0 });
  const seen = new Set<string>();
  while (s.status === 'playing' && s.week < 90 && s.career!.rank !== 'don') {
    for (let k = 0; k < 6 && s.pendingEvent; k++) {
      const en = s.pendingEvent.choices.filter((c) => !c.disabled && c.effect !== 'ca_indic_yes');
      if (s.pendingEvent.key === 'ca_succession' && en[0].effect === 'ca_lose') { lostSuccession++; if (lostSuccession < 4) console.log('perdu S' + s.week, 'argent', s.dirty + s.clean, s.career!.notables.map((n) => `${n.role}:${n.affinity}/${n.rivalPull}${n.favori ? '*' : ''}`).join(' ')); }
      resolveEvent(s, en[0].effect);
    }
    if (s.pendingEvent) s.pendingEvent = null;
    const c = s.career!;
    if (c.rank === 'don') break;
    if (!seen.has(c.rank)) { seen.add(c.rank); if (c.rank !== 'associe') weeksTo[c.rank].push(s.week); }
    for (let k = 0; k < 3; k++) spendPoint(s, k % 2 ? 'discretion' : 'force');
    // missions : les deux meilleures chances
    const ms = [...c.missions].sort((a, b) => missionChance(s, b) - missionChance(s, a)).slice(0, 2);
    for (const m of ms) {
      toggleMission(s, m.id);
      if (missionCrewAllowed(m)) for (const x of activeMembers(s).filter((x) => !x.isDon).slice(0, 2)) toggleMissionCrew(s, m.id, x.id);
    }
    // recrues
    for (const r of [...s.recruits]) if (s.members.length < 5 && s.dirty + s.clean > r.cost + 1500) E.hire(s, r.id);
    // capo : un speakeasy, de l'alcool, des hommes postés
    if (c.rank === 'capo') {
      for (const d of owned(s)) {
        if (d.businesses.length < d.slots && s.dirty > 2500) E.build(s, d.id, 'speakeasy');
        for (const m of activeMembers(s)) if (!m.assignment) E.assign(s, m.id, d.id);
      }
      const need = 40 - (s.stock.biere + s.stock.gin + s.stock.whisky);
      if (need > 0 && s.dirty > 1500) B.buyWholesaler(s, 'gin', Math.min(need, B.freeRoom(s)));
    }
    // politique : un cadeau au votant le plus indécis
    if (c.rank !== 'associe' && s.dirty + s.clean > 1500) {
      const t = successionTally(s);
      const target = t.voters.filter((n) => n.affinity <= (n.rivalPull ?? 25)).sort((a, b) => (b.affinity - (b.rivalPull ?? 25)) - (a.affinity - (a.rivalPull ?? 25)))[0];
      if (target) gift(s, target.id);
    }
    E.midweek(s);
    const pe = s.pendingEvent as import("../src/types").PendingEvent | null;
    if (pe) { const en = pe.choices.filter((c) => !c.disabled && c.effect !== "ca_indic_yes"); resolveEvent(s, en[0].effect); }
    E.endTurn(s);
  }
  const c = s.career!;
  if (c.rank === 'don') {
    res.don++; weeksTo.don.push(s.week); atDon.push(owned(s).length);
    // la suite : le jeu complet doit tourner
    for (let k = 0; k < 15 && s.status === 'playing'; k++) {
      for (let j = 0; j < 6 && s.pendingEvent; j++) resolveEvent(s, s.pendingEvent.choices.filter((x) => !x.disabled)[0].effect);
      s.pendingEvent = null;
      E.endTurn(s);
    }
    donAfter.push(owned(s).length);
  }
  else if (s.status !== 'playing') { res.dead++; ends[s.endReason.slice(0, 45)] = (ends[s.endReason.slice(0, 45)] ?? 0) + 1; }
  else { res.stuck++; if (res.stuck < 4) console.log('bloqué', c.rank, 'santé', c.donHealth, 'semaine', s.week, 'confiance', c.trust, 'missions', c.missionsDone, 'perdu', c.lost); }
}
const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : '—'; };
console.log(`Parties : ${N}`, res, `· successions perdues : ${lostSuccession}`);
console.log(`Semaine médiane : homme d'honneur ${med(weeksTo.soldat)} (${weeksTo.soldat.length}) · capo ${med(weeksTo.capo)} (${weeksTo.capo.length}) · Don ${med(weeksTo.don)} (${weeksTo.don.length})`);
console.log('Fins :', ends);
console.log('Quartiers 15 semaines après être devenu Don (médiane) :', med(donAfter));
console.log('Quartiers en devenant Don (médiane) :', med(atDon));
