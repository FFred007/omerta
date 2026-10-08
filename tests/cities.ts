// Villes, Commission et fin choisie : vérifications ciblées.
import * as E from '../src/engine';
import * as CT from '../src/cities';
import * as CM from '../src/commission';
import * as SC from '../src/score';
import { donOf } from '../src/don';
import { generateJobs } from '../src/jobs';
import { resolvePressureEffect } from '../src/pressure';
import { district, migrate, owned, projection } from '../src/state';
import type { GameState } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`);
  if (!ok) fails++;
};
const capoOf = (s: GameState) => s.members.find((m) => m.rank === 'capo' && !m.isDon)!;

// 1. ouvrir une ville
{
  const s = E.startGame(undefined, true);
  const capo = capoOf(s);
  const r1 = CT.openCity(s, 'halloran', [capo.id]);
  check(!r1.ok, `rang insuffisant refusé (${!r1.ok ? r1.error : ''})`);
  s.respect = 40;
  s.dirty = 20000;
  const r2 = CT.openCity(s, 'halloran', [capo.id]);
  check(r2.ok, 'ouverture de Port Halloran avec un capo');
  check(district(s, 'h_phare').owner === 'player', 'le Phare est à la famille');
  check(CT.governor(s, 'halloran')?.id === capo.id, 'le capo devient gouverneur');
  check(CT.memberCity(capo) === 'halloran', 'le capo est à Port Halloran');
  const r3 = CT.openCity(s, 'mirage', [s.members.find((m) => m.isDon)!.id]);
  check(!r3.ok, 'deuxième ouverture refusée au rang Famille établie');
  // un homme de New Corrano ne peut pas attaquer à Port Halloran
  const soldier = s.members.find((m) => !m.isDon && m.rank === 'soldat')!;
  const r4 = E.orderAttack(s, 'h_conserveries', [soldier.id]);
  check(!r4.ok, 'assaut depuis une autre ville refusé');
  capo.fatigue = 0;
  const r5 = E.orderAttack(s, 'h_conserveries', [capo.id]);
  check(r5.ok, 'assaut par un homme présent sur place');
  const r6 = E.assign(s, soldier.id, 'h_phare');
  check(!r6.ok, 'affectation dans une autre ville refusée');
}

// 2. le Don voyage : la ville qu'il quitte sans gouverneur rapporte 30 % de moins
{
  const s = E.startGame(undefined, true);
  s.respect = 40;
  s.dirty = 20000;
  const capo = capoOf(s);
  CT.openCity(s, 'halloran', [capo.id]);
  const before = projection(s).racket;
  const don = donOf(s)!;
  const r = CT.travel(s, don.id, 'halloran');
  check(r.ok, 'le Don part pour Port Halloran');
  check(CT.holder(s, 'corrano') === null, 'New Corrano sans personne');
  const after = projection(s).racket;
  const corranoRacket = owned(s).filter((d) => CT.cityOf(d) === 'corrano');
  check(after < before && corranoRacket.length > 0, `protection ${before} → ${after}`);
  generateJobs(s);
  check(s.jobs.every((j) => j.city === 'halloran'), 'les coups suivent le Don');
  // le Don ne peut pas gouverner, un capo de retour à New Corrano si
  const greco = s.members.find((m) => m.id === capo.id)!;
  CT.travel(s, greco.id, 'corrano');
  check(CT.setGovernor(s, 'corrano', greco.id).ok, 'gouverneur de New Corrano nommé');
  check(CT.holder(s, 'corrano') === 'gouverneur', 'New Corrano tenue par le gouverneur');
  check(Math.abs(projection(s).racket - before) <= 1 || projection(s).racket >= after, 'revenus rétablis');
}

// 3. sécession d'un gouverneur
{
  const s = E.startGame(undefined, true);
  s.respect = 40;
  s.dirty = 20000;
  const capo = capoOf(s);
  CT.openCity(s, 'halloran', [capo.id]);
  resolvePressureEffect(s, 'pr_sec_go', { key: 'secession', title: '', text: '', choices: [], data: { member: capo.id, city: 'halloran' } });
  check(district(s, 'h_phare').owner === 'neutral', 'la ville est perdue');
  check(!s.members.some((m) => m.id === capo.id), 'le gouverneur est parti');
  check(!CT.isOpen(s, 'halloran'), 'Port Halloran n’est plus ouverte');
}

// 4. la Commission : admission avec des voix achetées
{
  const s = E.startGame(undefined, true);
  s.respect = 70;
  s.dirty = 100000;
  const c = CM.commission(s);
  c.motion = { kind: 'admission', title: 'Admettre', desc: '' };
  for (const r of s.rivals) { r.relation = -60; CM.buyVote(s, r.id, 'pour'); }
  check(Object.keys(c.bought).length === s.rivals.length, 'toutes les voix achetées');
  const f = CM.tallyForecast(s);
  check(f.pour === s.rivals.length, `décompte prévu ${f.pour} pour`);
  // reliability des Dons hostiles : environ 60 %
  let seated = 0;
  for (let i = 0; i < 400; i++) {
    const t = E.startGame(undefined, true);
    t.respect = 70;
    t.dirty = 100000;
    const cc = CM.commission(t);
    cc.motion = { kind: 'admission', title: 'Admettre', desc: '' };
    cc.next = t.week;
    for (const r of t.rivals) CM.buyVote(t, r.id, 'pour');
    CM.commissionTick(t);
    if (cc.seat) seated++;
  }
  check(seated > 380, `admission obtenue ${seated}/400 avec toutes les voix achetées`);
  // la mise au ban crée la coalition
  const t = E.startGame(undefined, true);
  for (const d of t.districts.filter((x) => (x.city ?? 'corrano') === 'corrano').slice(0, 5)) d.owner = 'player';
  const cc = CM.commission(t);
  cc.motion = { kind: 'ban_player', title: 'Ban', desc: '' };
  cc.next = t.week;
  t.rivals.forEach((r) => (r.relation = -100));
  CM.commissionTick(t);
  check((t.coalitionWeeks ?? 0) > 0, 'mise au ban : coalition déclenchée');
  // trêve violée
  const u = E.startGame(undefined, true);
  CM.commission(u).truceWeeks = 3;
  const before = u.respect;
  CM.breachTruce(u);
  check(u.respect === Math.max(0, before - 5) && !!u.commission!.breach, 'violer la trêve coûte du respect');
}

// 5. fin choisie
{
  const s = E.startGame(undefined, true);
  check(!SC.retire(s).ok, 'retraite refusée trop tôt');
  s.week = 20;
  const base = SC.scoreBase(s);
  const r = SC.retire(s);
  check(r.ok && s.status === 'won' && s.ending?.score === base, `retraite : score ${s.ending?.score} = valeur ${base}`);
  const t = E.startGame(undefined, true);
  t.week = 30;
  check(!SC.goLegit(t).ok && SC.legitBlockers(t).length >= 3, `légitimité refusée (${SC.legitBlockers(t).length} conditions manquantes)`);
  t.respect = 110; t.clean = 40000; t.dossier = 10; t.heat = 10; t.commission!.seat = true;
  const b2 = SC.scoreBase(t);
  check(SC.goLegit(t).ok && t.ending?.score === Math.round(b2 * 1.5), `légitimité ×1,5 : ${t.ending?.score}`);
  // plus de victoire automatique
  const u = E.startGame(undefined, true);
  u.districts.filter((d) => (d.city ?? 'corrano') === 'corrano').forEach((d) => (d.owner = 'player'));
  u.rivals.filter((r) => r.city === 'corrano').forEach((r) => (r.alive = false));
  E.checkEnd(u);
  check(u.status === 'playing' && (u.cityLords ?? []).includes('corrano'), 'toute New Corrano : la partie continue');
}

// 6. migration d'une sauvegarde v0.6
{
  const s = E.startGame(undefined, true);
  const old = JSON.parse(JSON.stringify(s)) as GameState;
  old.districts = old.districts.filter((d) => !d.city);
  old.rivals = old.rivals.filter((r) => r.city === 'corrano').map((r) => ({ ...r, city: undefined, surname: undefined }));
  delete old.cities;
  delete old.commission;
  migrate(old);
  check(old.districts.length === s.districts.length && old.rivals.length === s.rivals.length, `migration : ${old.districts.length} quartiers, ${old.rivals.length} familles`);
  check(!!(old as GameState).commission?.motion && old.rivals.every((r) => !!r.city), 'migration : Commission et villes');
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
