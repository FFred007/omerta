// La famille du Don : rencontres, mariage, grossesse, enfants, héritier, succession.
import { startVote } from './circle';
import { DON_START_AGE, YEAR_WEEKS, ageOf, donHasTalent, donOf } from './don';
import { activeMembers, chance, clamp, log, news, nextId, pick, randInt, rival } from './state';
import type { TraitId } from './traits';
import type { Child, Courtship, GameState, Member, PendingEvent } from './types';
import { finalize } from './score';

type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export const ADULT_AGE = 16;
export const DATE_COST = 300;
export const GIFT_COST = 900;
export const WEDDING_COST = 2000;
export const EVENING_COST = 200;

// ---------- Origines et traits de l'épouse ----------
export type SpouseOrigin = 'rivale' | 'chanteuse' | 'banquier' | 'commercante';
export type SpouseTraitId = 'affaires' | 'diplomate' | 'pieuse' | 'feu' | 'fortune' | 'quartier';

export const ORIGINS: Record<SpouseOrigin, { label: (s: GameState, rivalId?: string) => string; childTrait: TraitId }> = {
  rivale: { label: (s, id) => `fille de ${rival(s, id ?? '')?.boss ?? 'un Don rival'}`, childTrait: 'brute' },
  chanteuse: { label: () => 'chanteuse du club de Southside', childTrait: 'beauparleur' },
  banquier: { label: () => 'héritière d’un banquier du Loop', childTrait: 'comptable' },
  commercante: { label: () => 'fille d’un commerçant de Little Sicily', childTrait: 'fidele' },
};

export const SPOUSE_TRAITS: Record<SpouseTraitId, { name: string; desc: string }> = {
  affaires: { name: 'Femme d’affaires', desc: '+10 % de capacité de blanchiment' },
  diplomate: { name: 'Diplomate', desc: '+5 de relation à chaque dîner d’affaires' },
  pieuse: { name: 'Pieuse', desc: '−1 heat par semaine : le curé parle bien de vous' },
  feu: { name: 'Tempérament de feu', desc: 'Son affection monte et descend 50 % plus vite' },
  fortune: { name: 'Fortunée', desc: '+300 $ propres par semaine (rente familiale)' },
  quartier: { name: 'Fille du quartier', desc: '+1 satisfaction par semaine pour tous tes commerçants' },
};

const ORIGIN_TRAIT: Record<SpouseOrigin, SpouseTraitId> = { rivale: 'diplomate', chanteuse: 'feu', banquier: 'fortune', commercante: 'quartier' };
const FEMALE_NAMES = ['Rosa', 'Lucia', 'Elena', 'Maria', 'Carmela', 'Giulia', 'Teresa', 'Vera', 'Clara', 'Nora', 'Ada', 'Irene', 'Bianca', 'Livia', 'Agnes', 'Helena'];
const MALE_NAMES = ['Michele', 'Sonny', 'Paolo', 'Antonio', 'Luca', 'Enzo', 'Vito', 'Dario', 'Marco', 'Santino', 'Fredo', 'Leo', 'Aldo', 'Tito', 'Nico', 'Bruno'];
const SURNAMES: Record<SpouseOrigin, string[]> = {
  rivale: [],
  chanteuse: ['Delacroix', 'Bellamy', 'Rivers', 'Moreau', 'Valentine'],
  banquier: ['Whitmore', 'Ashford', 'Vanderberg', 'Sterling', 'Crane'],
  commercante: ['Colombo', 'Benedetti', 'Lombardo', 'Rossi', 'Ferraro'],
};

export const spouseHas = (s: GameState, t: SpouseTraitId) => !!s.spouse?.traits.includes(t);

export function makeCandidate(s: GameState, origin: SpouseOrigin, rivalId?: string): Courtship {
  const first = pick(FEMALE_NAMES);
  const last = origin === 'rivale' ? rival(s, rivalId ?? '')?.surname ?? 'Castellano' : pick(SURNAMES[origin]);
  const traits: SpouseTraitId[] = [ORIGIN_TRAIT[origin]];
  if (chance(0.55)) {
    const extra = (Object.keys(SPOUSE_TRAITS) as SpouseTraitId[]).filter((x) => !traits.includes(x));
    traits.push(pick(extra));
  }
  return {
    name: `${first} ${last}`, origin, rivalId, traits, progress: origin === 'rivale' ? 60 : 0,
    seed: randInt(1, 1e9), birthWeek: s.week - randInt(22, 30) * YEAR_WEEKS,
  };
}

// ---------- La cour ----------
export function startCourtship(s: GameState, c: Courtship): Result {
  if (s.spouse) return fail('Le Don est déjà marié.');
  s.courtship = c;
  log(s, 'good', `Le Don commence à courtiser ${c.name}.`);
  return ok;
}

export function dateCourtship(s: GameState, kind: 'diner' | 'cadeau'): Result {
  const c = s.courtship;
  const don = donOf(s);
  if (!c || !don) return fail('Personne à courtiser.');
  if (c.lastDate === s.week) return fail('Une seule attention par semaine : ne sois pas trop pressant.');
  const cost = kind === 'diner' ? DATE_COST : GIFT_COST;
  if (s.clean < cost) return fail(`Il faut ${cost} $ propres.`);
  s.clean -= cost;
  c.lastDate = s.week;
  const verbe = don.verbe ?? 5;
  const gain = kind === 'diner' ? 12 + verbe * 2 : 25 + verbe;
  c.progress = clamp(c.progress + gain, 0, 100);
  log(s, 'good', kind === 'diner' ? `Dîner aux chandelles avec ${c.name} (+${gain}).` : `Le Don offre un bijou à ${c.name} (+${gain}).`);
  return ok;
}

export function propose(s: GameState): Result {
  const c = s.courtship;
  if (!c) return fail('Personne à épouser.');
  if (c.progress < 100) return fail('Elle n’est pas encore prête à dire oui.');
  if (s.clean < WEDDING_COST) return fail(`Un mariage digne de ce nom coûte ${WEDDING_COST} $ propres.`);
  s.clean -= WEDDING_COST;
  s.spouse = { name: c.name, origin: c.origin, rivalId: c.rivalId, traits: c.traits, affection: 70, seed: c.seed, birthWeek: c.birthWeek, lastGift: s.week };
  s.courtship = null;
  s.respect = clamp(s.respect + 8, 0, 150);
  activeMembers(s).forEach((m) => (m.loyalty = clamp(m.loyalty + 5, 0, 100)));
  const r = c.rivalId ? rival(s, c.rivalId) : undefined;
  if (r && r.alive) {
    r.alliance = true;
    r.war = false;
    r.relation = Math.max(r.relation, 55);
    log(s, 'good', `Le mariage scelle l'alliance avec ${r.name}.`);
  }
  log(s, 'good', `Le Don épouse ${c.name}. Toute la ville est invitée (+8 respect).`);
  news(s, 5, 'Le mariage de l’année', `${c.name} épouse le Don de la ${s.familyName}. Trois cents invités, et pas un seul policier en uniforme.`);
  return ok;
}

export function abandonCourtship(s: GameState): Result {
  if (!s.courtship) return fail('Personne à oublier.');
  const r = s.courtship.rivalId ? rival(s, s.courtship.rivalId) : undefined;
  if (r) r.relation = clamp(r.relation - 15, -100, 100);
  log(s, 'neutral', `Le Don renonce à ${s.courtship.name}.${r ? ` ${r.boss} prend l'affront très mal.` : ''}`);
  s.courtship = null;
  return ok;
}

// ---------- L'épouse ----------
function affection(s: GameState, delta: number) {
  if (!s.spouse) return;
  const k = spouseHas(s, 'feu') ? 1.5 : 1;
  s.spouse.affection = clamp(Math.round(s.spouse.affection + delta * k), 0, 100);
}

export function spouseAttention(s: GameState, kind: 'soiree' | 'bijou'): Result {
  if (!s.spouse) return fail('Le Don n’est pas marié.');
  if (s.spouse.lastGift === s.week) return fail('Une attention par semaine suffit.');
  const cost = kind === 'soiree' ? EVENING_COST : GIFT_COST;
  if (s.clean < cost) return fail(`Il faut ${cost} $ propres.`);
  s.clean -= cost;
  s.spouse.lastGift = s.week;
  affection(s, kind === 'soiree' ? 8 : 20);
  log(s, 'good', kind === 'soiree' ? `Soirée à l'opéra avec ${s.spouse.name}.` : `Le Don offre un collier de perles à ${s.spouse.name}.`);
  return ok;
}

/** Le Don a attaqué la famille de sa femme */
export function offendInLaws(s: GameState, rivalId: string) {
  if (s.spouse?.rivalId === rivalId) {
    affection(s, -30);
    log(s, 'bad', `${s.spouse.name} apprend que tu as attaqué la famille de son père. Elle ne te parle plus (−30 affection).`);
  }
}

// ---------- Enfants ----------
export const childAge = (s: GameState, c: Child) => ageOf(s, c);
export const childStage = (age: number) => (age < 6 ? 'Enfant' : age < 12 ? 'Écolier' : age < ADULT_AGE ? 'Adolescent' : 'Adulte');

export type EduId = 'rue' | 'cures' | 'suisse' | 'comptable';
export const EDUCATION: Record<EduId, { name: string; desc: string; stat: 'force' | 'discretion' | 'verbe' | 'flair' }> = {
  rue: { name: 'La rue', desc: 'Il apprend à se battre avec les gamins du quartier : Poigne +2', stat: 'force' },
  cures: { name: "L'école des curés", desc: 'Latin, rhétorique et bonnes manières : Verbe +2', stat: 'verbe' },
  suisse: { name: 'Un pensionnat en Suisse', desc: 'Langues, chiffres et relations : Flair +2', stat: 'flair' },
  comptable: { name: 'Apprenti du comptable', desc: 'Il apprend à tenir des comptes que personne ne comprend : Ombre +2', stat: 'discretion' },
};

export function currentHeir(s: GameState): Child | undefined {
  const kids = s.children ?? [];
  return kids.find((c) => c.id === s.heirId) ?? [...kids].sort((a, b) => a.birthWeek - b.birthWeek)[0];
}

export function setHeir(s: GameState, childId: number): Result {
  if (!(s.children ?? []).some((c) => c.id === childId)) return fail('Enfant introuvable.');
  s.heirId = childId;
  const c = s.children!.find((x) => x.id === childId)!;
  log(s, 'neutral', `${c.name} est désigné${c.sex === 'f' ? 'e' : ''} héritier${c.sex === 'f' ? 'ère' : ''} de la famille.`);
  return ok;
}

function birth(s: GameState) {
  const sp = s.spouse!;
  const sex: 'm' | 'f' = chance(0.5) ? 'm' : 'f';
  const names = sex === 'm' ? MALE_NAMES : FEMALE_NAMES;
  const used = new Set((s.children ?? []).map((c) => c.name.split(' ')[0]));
  const pool = names.filter((n) => !used.has(n));
  const first = pick(pool.length ? pool : names);
  const last = s.familyName.replace(/^Famille /, '');
  const c: Child = {
    id: nextId(s), name: `${first} ${last}`, sex, birthWeek: s.week, seed: randInt(1, 1e9), education: [],
    generation: s.generation ?? 1, motherOrigin: sp.origin,
  };
  (s.children ??= []).push(c);
  affection(s, 15);
  s.respect = clamp(s.respect + 3, 0, 150);
  log(s, 'good', `${sp.name} donne naissance à ${sex === 'm' ? 'un fils' : 'une fille'} : ${c.name}.`);
  news(s, 4, `Un héritier pour la ${s.familyName}`, `${sex === 'm' ? 'Un garçon' : 'Une fille'} de 3 kilos. Les commerçants du quartier ont envoyé des fleurs par camions entiers.`);
  if (!s.pendingEvent) {
    const choices = [first, ...pool.filter((n) => n !== first).sort(() => Math.random() - 0.5).slice(0, 2)];
    s.pendingEvent = {
      key: 'naissance',
      title: sex === 'm' ? 'C’est un garçon !' : 'C’est une fille !',
      text: `${sp.name} et l'enfant se portent bien. Toute la famille attend que le Don choisisse le prénom.`,
      data: { child: c.id, n0: choices[0], n1: choices[1] ?? choices[0], n2: choices[2] ?? choices[0] },
      choices: choices.map((n, i) => ({ label: `${n} ${last}`, hint: i === 0 ? 'Le prénom du grand-père' : 'Un prénom de la famille', effect: `fam_name_${i}` })),
    };
  }
}

function educationEvent(s: GameState, c: Child, stage: number): PendingEvent {
  const age = Math.floor(childAge(s, c));
  return {
    key: 'education',
    title: `L'éducation de ${c.name.split(' ')[0]}`,
    text: `${c.name} a ${age} ans. ${stage === 0 ? 'Il est temps de choisir son école.' : 'L’adolescence arrive : que doit-' + (c.sex === 'f' ? 'elle' : 'il') + ' apprendre pour la suite ?'} Ce choix façonnera ${c.sex === 'f' ? 'la future Donna' : 'le futur Don'}.`,
    data: { child: c.id },
    choices: (Object.keys(EDUCATION) as EduId[]).map((e) => ({ label: EDUCATION[e].name, hint: EDUCATION[e].desc, effect: `fam_edu_${e}` })),
  };
}

/** L'enfant entre dans la famille à 16 ans : il devient un homme de la famille, qui gagne de l'expérience */
function comeOfAge(s: GameState, c: Child) {
  const don = donOf(s);
  const edu = (stat: string) => c.education.filter((e) => EDUCATION[e].stat === stat).length * 2;
  const base = (v: number | undefined) => Math.floor((v ?? 5) / 4);
  const m: Member = {
    id: nextId(s), name: c.name, nickname: c.sex === 'f' ? 'la Petite' : 'le Petit', rank: 'soldat',
    force: 3 + edu('force') + base(don?.force), discretion: 3 + edu('discretion') + base(don?.discretion),
    verbe: 3 + edu('verbe') + base(don?.verbe), flair: 3 + edu('flair') + base(don?.flair),
    loyalty: 100, salary: 0, assignment: null, status: 'actif', statusWeeks: 0, weeksServed: 0,
    xp: 0, level: 0, traits: c.motherOrigin ? [ORIGINS[c.motherOrigin].childTrait] : [],
    usage: { force: 0, discretion: 0 }, isChild: true, childId: c.id, sex: c.sex, birthWeek: c.birthWeek, scars: 0, seed: c.seed,
  };
  s.members.push(m);
  c.memberId = m.id;
  log(s, 'good', `${c.name} a ${ADULT_AGE} ans et rejoint les affaires de la famille.`);
  news(s, 3, `${c.name} fait ses débuts`, `On a vu ${c.sex === 'f' ? 'la fille' : 'le fils'} du Don aux côtés des capos. La relève est assurée.`);
}

// ---------- Tour de la famille ----------
export function familyTick(s: GameState) {
  const don = donOf(s);
  s.children ??= [];

  // vieillissement du Don
  if (don) {
    const age = Math.floor(ageOf(s, don));
    const before = Math.floor(ageOf({ ...s, week: s.week - 1 } as GameState, don));
    if (age !== before) {
      if (age >= 55 && age % 5 === 0 && don.force > 3) {
        don.force -= 1;
        log(s, 'neutral', `Le Don fête ses ${age} ans. Ses poings ne sont plus ce qu'ils étaient (−1 Poigne).`);
      } else if (age % 10 === 0) log(s, 'neutral', `Le Don fête ses ${age} ans.`);
      if (age >= 68 && chance((age - 65) * 0.04)) {
        succession(s, don, `est mort de vieillesse à ${age} ans, dans son lit`);
        return;
      }
    }
  }

  // l'épouse
  const sp = s.spouse;
  if (sp) {
    let delta = 0;
    if (s.heat > 60 && !donHasTalent(s, 'p_famille')) delta -= 1;
    if (don && don.status !== 'actif') delta -= 2;
    if (s.week - (sp.lastGift ?? 0) > 4) delta -= 1;
    affection(s, delta);
    if (sp.pregnantWeeks) {
      sp.pregnantWeeks--;
      if (sp.pregnantWeeks <= 0) {
        sp.pregnantWeeks = undefined;
        birth(s);
      }
    } else if (don) {
      const youngest = Math.min(...s.children.filter((c) => c.generation === (s.generation ?? 1)).map((c) => childAge(s, c)), 99);
      const spouseAge = ageOf(s, sp);
      const own = s.children.filter((c) => c.generation === (s.generation ?? 1)).length;
      if (youngest >= 1 && spouseAge < 42 && own < 5 && chance(0.05 + sp.affection / 1000)) {
        sp.pregnantWeeks = 5;
        log(s, 'good', `${sp.name} est enceinte ! L'enfant naîtra dans 5 semaines.`);
        news(s, 3, 'Heureux événement chez le Don', `${sp.name} attendrait un enfant. Les paris sont ouverts : garçon ou fille ?`);
      }
    }
    if (s.spouse && s.spouse.affection <= 5) {
      log(s, 'bad', `${s.spouse.name} a fait ses valises. « Tu n'es jamais là, et quand tu es là, il y a du sang sur ta chemise. »`);
      news(s, 4, 'Le Don abandonné', `${s.spouse.name} aurait quitté le domicile familial. Les enfants restent avec leur père.`);
      s.spouse = null;
    }
  }

  // les enfants grandissent
  for (const c of s.children) {
    const age = childAge(s, c);
    if (!c.memberId && age >= ADULT_AGE) comeOfAge(s, c);
    else if (!s.pendingEvent && !c.memberId) {
      if (age >= 6 && c.education.length === 0) s.pendingEvent = educationEvent(s, c, 0);
      else if (age >= 12 && c.education.length === 1) s.pendingEvent = educationEvent(s, c, 1);
    }
  }

  // régence
  const reg = s.regency;
  if (reg) {
    const heir = s.children.find((c) => c.id === reg.childId);
    if (!heir) { s.regency = null; }
    else if (heir.memberId) {
      const m = s.members.find((x) => x.id === heir.memberId);
      if (m) {
        m.talents = [...new Set([...(m.talents ?? []), ...(heir.inheritTalents ?? [])])];
        const regent = s.members.find((x) => x.id === reg.regentId && x.rank === 'capo');
        if (s.circle) startVote(s, m, 'fin de la régence', regent);
        else crown(s, m, 'fin de la régence');
      }
      s.regency = null;
    } else if (reg.regentId) {
      const regent = s.members.find((x) => x.id === reg.regentId);
      if (!regent) {
        reg.regentId = undefined;
        reg.regentName = s.spouse?.name ?? 'les anciens de la famille';
      } else if (regent.loyalty < 50 && chance(0.05)) {
        finalize(s, 'mort', `${regent.name} « ${regent.nickname} », le régent, a fait disparaître ${heir.name} et pris la tête de la famille.`);
      }
    }
  }
}

// ---------- Succession ----------
/** Le nouveau Don prend la tête de la famille */
export function crown(s: GameState, m: Member, why: string) {
  const prev = (s.dynasty ?? [])[(s.dynasty ?? []).length - 1];
  m.isDon = true;
  m.isChild = false;
  m.rank = 'capo';
  m.loyalty = 100;
  m.salary = 0;
  m.talents = m.talents ?? [];
  m.points = (m.points ?? 0) + (m.level ?? 0) + 1;
  m.nickname = m.sex === 'f' ? 'la Donna' : 'le Jeune Don';
  s.generation = (s.generation ?? 1) + 1;
  s.children = (s.children ?? []).filter((c) => c.memberId !== m.id);
  s.heirId = null;
  log(s, 'good', `${m.name} devient ${m.sex === 'f' ? 'la Donna' : 'le Don'} de la ${s.familyName} (${why}).${prev ? '' : ''}`);
  news(s, 5, `${m.name} prend la tête de la famille`, `Les capos ont baisé la bague du nouveau ${m.sex === 'f' ? 'chef, une femme, du jamais vu à New Corrano' : 'Don'}.`);
}

/** Le Don quitte la scène : mort ou condamné. L'héritier reprend, sinon la partie s'achève. */
export function succession(s: GameState, don: Member, cause: string) {
  (s.dynasty ??= []).push({ name: don.name, nickname: don.nickname, fromWeek: s.dynasty?.length ? s.dynasty[s.dynasty.length - 1].toWeek : 1, toWeek: s.week, cause });
  const inherited = (don.talents ?? []).slice(0, Math.floor((don.talents ?? []).length / 2));
  s.members = s.members.filter((x) => x.id !== don.id);
  s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== don.id)));
  s.jobs.forEach((j) => (j.team = j.team.filter((id) => id !== don.id)));
  log(s, 'bad', `${don.name} « ${don.nickname} » ${cause}.`);
  news(s, 5, `La fin de ${don.name}`, `Le Don de la ${s.familyName} ${cause}. La ville retient son souffle.`);

  const heir = currentHeir(s);
  if (!heir) {
    finalize(s, /condamn/.test(cause) ? 'prison' : 'mort', `${don.name} ${cause}. Sans héritier, la lignée s'éteint et la famille se disperse.`);
    return;
  }
  const heirMember = heir.memberId ? s.members.find((x) => x.id === heir.memberId) : undefined;
  if (heirMember) {
    heirMember.talents = [...new Set([...(heirMember.talents ?? []), ...inherited])];
    if (s.circle) startVote(s, heirMember, 'succession');
    else crown(s, heirMember, 'succession');
  } else {
    const regent = [...s.members].filter((m) => m.rank === 'capo' && !m.isChild).sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || b.loyalty - a.loyalty)[0]
      ?? [...s.members].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
    s.regency = { childId: heir.id, regentId: regent?.id, regentName: regent ? `${regent.name} « ${regent.nickname} »` : 'les anciens de la famille' };
    heir.inheritTalents = inherited;
    log(s, 'neutral', `${heir.name} n'a que ${Math.floor(childAge(s, heir))} ans. ${s.regency.regentName} assure la régence jusqu'à ses ${ADULT_AGE} ans.`);
  }
  // la famille vacille (après le vote du cercle, qui s'est joué sur les loyautés d'avant le deuil)
  s.respect = Math.round(s.respect * 0.85);
  s.members.filter((m) => !m.isChild && !m.isDon).forEach((m) => (m.loyalty = clamp(m.loyalty - 10, 0, 100)));
  s.rivals.forEach((r) => (r.relation = clamp(r.relation - 10, -100, 100)));
  s.spouse = null; // la veuve se retire
  s.courtship = null;
}

export function resolveFamilyEffect(s: GameState, effect: string, ev: PendingEvent): boolean {
  if (effect.startsWith('fam_name_')) {
    const c = s.children?.find((x) => x.id === Number(ev.data?.child));
    const n = String(ev.data?.[`n${effect.slice(-1)}`] ?? '');
    if (c && n) c.name = `${n} ${c.name.split(' ').slice(1).join(' ')}`;
    return true;
  }
  if (effect.startsWith('fam_edu_')) {
    const c = s.children?.find((x) => x.id === Number(ev.data?.child));
    const e = effect.slice(8) as EduId;
    if (c) {
      c.education.push(e);
      log(s, 'neutral', `${c.name.split(' ')[0]} : ${EDUCATION[e].name.toLowerCase()}.`);
    }
    return true;
  }
  return false;
}

export { DON_START_AGE };
