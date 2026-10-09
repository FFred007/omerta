// Spécialistes et meilleure équipe : bonus appliqués, équipes valides et meilleures que le hasard.
import * as E from '../src/engine';
import * as TM from '../src/teams';
import { SPECIALIST_BONUS, donStatBonus, jobChance, specialistBonus, teamSkill } from '../src/jobs';
import { generateJobs } from '../src/jobs';
import { activeMembers, attackPower, defenseOf, district, isAttackable, makeMember, makeRecruit, winChance } from '../src/state';
import type { GameState } from '../src/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok' : 'ÉCHEC'} : ${msg}`); if (!ok) fails++; };
const crew = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) { const { id: _i, cost: _c, ...r } = makeRecruit(s) as never as Record<string, never>; void _i; void _c; s.members.push(makeMember(s, { ...(r as object), assignment: null })); }
};

// 1. tous les coups ont un spécialiste
{
  const keys = new Set<string>();
  for (let i = 0; i < 300; i++) { const s = E.startGame(undefined, true); s.week = 10; s.heat = 30; s.stock = { biere: 0, gin: 0, whisky: 0 }; generateJobs(s); s.jobs.forEach((j) => { keys.add(j.key); if (!j.specialist && !j.vendettaId) check(false, `pas de spécialiste pour ${j.key}`); }); }
  check(keys.size >= 15, `coups différents tirés : ${keys.size} (${[...keys].join(', ')})`);
}

// 2. le spécialiste et le Don
{
  const s = E.startGame(undefined, true);
  s.week = 10;
  generateJobs(s);
  const j = s.jobs.find((x) => x.specialist)!;
  const m = activeMembers(s).find((x) => !x.isDon)!;
  m.traits = [];
  const before = teamSkill(s, j, [m.id]);
  m.traits = [j.specialist!];
  check(specialistBonus(s, j, [m.id]) === SPECIALIST_BONUS && teamSkill(s, j, [m.id]) - before >= SPECIALIST_BONUS, `spécialiste ${j.specialist} : +${SPECIALIST_BONUS}`);
  const don = s.members.find((x) => x.isDon)!;
  j.donStat = 'verbe'; don.verbe = 9;
  check(donStatBonus(s, j, [don.id]) === 4 && donStatBonus(s, j, [m.id]) === 0, 'le Don apporte la moitié de son Verbe, seulement s’il vient');
}

// 3. la meilleure équipe : valide, et au moins aussi bonne que des équipes tirées au hasard
{
  let better = 0, total = 0, valid = 0;
  for (let g = 0; g < 150; g++) {
    const s = E.startGame(undefined, true);
    s.week = 12;
    crew(s, 12);
    generateJobs(s);
    for (const j of s.jobs) {
      const team = TM.bestJobTeam(s, j);
      total++;
      const ok = team.length >= j.minMen && team.every((id) => { const m = s.members.find((x) => x.id === id)!; return m.status === 'actif' && !m.isDon && (m.city ?? 'corrano') === (j.city ?? 'corrano'); });
      if (ok) valid++;
      const pool = activeMembers(s).filter((m) => !m.isDon).map((m) => m.id);
      let beat = true;
      for (let k = 0; k < 20; k++) {
        const rnd = [...pool].sort(() => Math.random() - 0.5).slice(0, team.length);
        if (jobChance(s, j, rnd) > jobChance(s, j, team) + 1e-9) beat = false;
      }
      if (beat) better++;
    }
  }
  check(valid === total, `équipes valides : ${valid}/${total}`);
  check(better / total > 0.95, `meilleure que le hasard à taille égale : ${better}/${total}`);
}

// 4. l'assaut : la réserve d'abord
{
  const s = E.startGame(undefined, true);
  crew(s, 8);
  const d = s.districts.find((x) => isAttackable(s, x))!;
  const team = TM.bestAttackTeam(s, d.id);
  const p = winChance(attackPower(s, team), defenseOf(s, district(s, d.id)));
  const guards = team.filter((id) => s.members.find((m) => m.id === id)!.assignment).length;
  check(team.length > 0 && (p >= 0.8 || guards > 0 || team.length === activeMembers(s).filter((m) => !m.isDon && !m.assignment).length), `assaut sur ${d.name} : ${team.length} hommes, ${Math.round(p * 100)} %, ${guards} garde(s) dégarnie(s)`);
  check(!team.some((id) => s.members.find((m) => m.id === id)!.isDon), 'le Don ne part pas tout seul');
}

console.log(fails ? `${fails} échec(s)` : 'tout est bon');
if (fails) process.exit(1);
