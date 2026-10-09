// Commerçants : tarif de protection, satisfaction, prêts et faveurs
import { districtCommand } from './command';
import { TARIFFS } from './data';
import { chance, clamp, district, log, membersIn, news, owned, randInt, satisfaction } from './state';
import { has } from './traits';
import { donHasTalent } from './don';
import { spouseHas } from './family';
import { isActive } from './network';
import type { GameState, Tariff } from './types';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const fmt = (n: number) => `$${Math.round(n).toLocaleString('fr-FR')}`;

export const ALIBI_HEAT = 12;

export function setTariff(s: GameState, districtId: string, tariff: Tariff): Result {
  const d = district(s, districtId);
  if (d.owner !== 'player') return fail("Ce quartier n'est pas à toi.");
  d.tariff = tariff;
  return ok;
}

/** Multiplicateur de risque de descente selon l'humeur des commerçants */
export function raidMood(sat: number) {
  if (sat < 30) return 1.4;
  if (sat >= 70) return 0.6;
  return 1;
}

export function moodLabel(sat: number) {
  if (sat < 30) return 'Furieux';
  if (sat < 45) return 'Mécontents';
  if (sat < 70) return 'Résignés';
  return 'Fidèles';
}

export function shopsTick(s: GameState) {
  let loyalDistrict = false;
  for (const d of owned(s)) {
    for (const shop of d.shops) {
      let delta = TARIFFS[d.tariff].drift + randInt(-1, 1);
      if (s.respect >= 60) delta += 1;
      if ((d.unrest ?? 0) > 0) delta -= 1;
      if (s.heat > 70) delta -= 1;
      if (membersIn(s, d.id).some((m) => has(m, 'beauparleur'))) delta += 2;
      if (districtCommand(s, d) === 'commerce') delta += 1;
      if (donHasTalent(s, 'p_commercants')) delta += 1;
      if (spouseHas(s, 'quartier')) delta += 1;
      if (isActive(s, 'cure')) delta += 1;
      delta += d.businesses.filter((b) => b.kind === 'jazz').length * 2 - d.businesses.filter((b) => b.kind === 'usurier').length * 2;
      shop.satisfaction = clamp(shop.satisfaction + delta, 0, 100);
    }
    const sat = satisfaction(d);
    if (sat >= 75) loyalDistrict = true;
    if (sat < 25 && chance(0.25)) {
      const shop = d.shops.reduce((a, b) => (a.satisfaction < b.satisfaction ? a : b));
      s.heat = clamp(s.heat + 7, 0, 100);
      shop.satisfaction = clamp(shop.satisfaction + 10, 0, 100);
      log(s, 'police', `${shop.owner}, ${shop.trade} à ${d.name}, est allé se plaindre au commissariat (+7 heat).`);
      news(s, 3, `Un commerçant de ${d.name} brise l'omertà`, `${shop.owner} dénonce le racket « insupportable » qui étrangle le quartier.`);
    }
  }
  if (loyalDistrict) s.respect = clamp(s.respect + 1, 0, 150);

  // prêts remboursés
  const due = s.loans.filter((l) => l.due <= s.week);
  for (const l of due) {
    s.clean += l.amount;
    log(s, 'money', `${l.shop} rembourse son prêt avec les intérêts (+${fmt(l.amount)} propre).`);
  }
  s.loans = s.loans.filter((l) => l.due > s.week);
}

/** Les commerçants d'un quartier fraîchement conquis se méfient */
export function onConquest(s: GameState, districtId: string) {
  const d = district(s, districtId);
  d.tariff = 'normal';
  d.shops.forEach((x) => (x.satisfaction = Math.min(x.satisfaction, 40)));
}

// ---------- Faveurs ----------
export function favorFreePrisoner(s: GameState, memberId: number): Result {
  const m = s.members.find((x) => x.id === memberId);
  if (!m || m.status !== 'prison') return fail("Cet homme n'est pas en prison.");
  if (s.favors < 1) return fail('Aucune faveur à réclamer.');
  s.favors--;
  m.status = 'actif';
  m.statusWeeks = 0;
  m.loyalty = clamp(m.loyalty + 10, 0, 100);
  log(s, 'good', `Un commerçant témoigne en faveur de ${m.nickname}. Il est libéré.`);
  return ok;
}

export function favorAlibi(s: GameState): Result {
  if (s.favors < 1) return fail('Aucune faveur à réclamer.');
  s.favors--;
  s.heat = clamp(s.heat - ALIBI_HEAT, 0, 100);
  log(s, 'good', `Tes amis commerçants te fournissent un alibi en béton (−${ALIBI_HEAT} heat).`);
  return ok;
}
