import { checkEnd } from './engine';
import { declareWar, playerForce } from './diplomacy';
import { donOf } from './don';
import { ORIGINS, SPOUSE_TRAITS, makeCandidate, resolveFamilyEffect, startCourtship, type SpouseOrigin } from './family';
import { resolveTrialEffect } from './dossier';
import { resolvePressureEffect } from './pressure';
import { resolveBondEffect } from './bonds';
import { hunter, hunterProgress, resolveHunterEffect } from './hunters';
import { resolveCareerEffect } from './career';
import { activeMembers, chance, clamp, district, log, neighbors, news, nextId, owned, pick, rival, stockTotal, storageCap } from './state';
import type { GameState, PendingEvent, Shop } from './types';

/** Un commerçant au hasard dans un quartier du joueur */
function anyShop(s: GameState): { d: string; shop: Shop } | null {
  const pool = owned(s).flatMap((d) => d.shops.map((shop) => ({ d: d.id, shop })));
  return pool.length ? pick(pool) : null;
}
function shopOf(s: GameState, ev: PendingEvent) {
  const d = district(s, String(ev.data?.district));
  return { d, shop: d.shops.find((x) => x.id === Number(ev.data?.shop)) };
}

type EventDef = {
  key: string;
  weight: number;
  when: (s: GameState) => boolean;
  build: (s: GameState) => PendingEvent;
};

const EVENTS: EventDef[] = [
  {
    key: 'journaliste', weight: 3, when: () => true,
    build: (s) => ({
      key: 'journaliste',
      title: `${hunter(s, 'journaliste').name} pose des questions`,
      text: `${hunter(s, 'journaliste').name} (${hunter(s, 'journaliste').title}) interroge tes commerçants sur les « affaires » de la ${s.familyName}. Son article sort lundi.`,
      choices: [
        { label: 'Acheter son silence', hint: '-500 propre, -5 heat', effect: 'j_pay', disabled: s.clean < 500 },
        { label: "L'intimider", hint: '+3 respect, +6 heat', effect: 'j_scare' },
        { label: 'Laisser publier', hint: '+10 heat', effect: 'j_ignore' },
      ],
    }),
  },
  {
    key: 'cargaison', weight: 3, when: (s) => s.week > 2 && storageCap(s) - stockTotal(s) >= 30,
    build: (s) => ({
      key: 'cargaison',
      title: 'Whisky canadien',
      text: "Un contrebandier propose 30 caisses de pur malt, livrées cette nuit par le lac. Payable d'avance, sans garantie.",
      choices: [
        { label: 'Acheter la cargaison', hint: '-1 200 sale · 75 % : +30 caisses de whisky', effect: 'c_buy', disabled: s.dirty < 1200 },
        { label: 'Laisser passer', hint: 'Rien ne se passe', effect: 'none' },
      ],
    }),
  },
  {
    key: 'mariage', weight: 2, when: () => true,
    build: () => ({
      key: 'mariage',
      title: 'Un mariage à Little Sicily',
      text: "Le boulanger Colombo marie sa fille. Tout le quartier regarde ce que le Don va offrir.",
      choices: [
        { label: 'Une enveloppe généreuse', hint: '-600 propre, +6 respect', effect: 'm_gift', disabled: false },
        { label: 'Des fleurs', hint: '+1 respect', effect: 'm_flowers' },
      ],
    }),
  },
  {
    key: 'treve', weight: 2,
    when: (s) => s.rivals.some((r) => r.alive && !r.alliance && r.truceWeeks === 0 && touchesPlayer(s, r.id)),
    build: (s) => {
      const r = pick(s.rivals.filter((x) => x.alive && !x.alliance && x.truceWeeks === 0 && touchesPlayer(s, x.id)));
      return {
        key: 'treve',
        title: 'Une offre de paix',
        text: `${r.boss} t'envoie un émissaire : six semaines de trêve, personne ne touche aux quartiers de l'autre.`,
        data: { rival: r.id },
        choices: [
          { label: 'Accepter la trêve', hint: '6 sem. sans attaque dans les deux sens', effect: 't_accept' },
          { label: "Renvoyer l'émissaire", hint: '+3 respect, rival plus agressif', effect: 't_refuse' },
        ],
      };
    },
  },
  {
    key: 'indic', weight: 2, when: (s) => activeMembers(s).filter((m) => !m.isDon && !m.isChild).length >= 3 && s.heat > 30,
    build: (s) => {
      const m = [...activeMembers(s)].filter((x) => !x.isDon && !x.isChild).sort((a, b) => a.loyalty - b.loyalty)[0];
      return {
        key: 'indic',
        title: 'Un rat dans la maison',
        text: `Ton contact au commissariat est formel : quelqu'un parle. Les soupçons se portent sur ${m.name} « ${m.nickname} » (loyauté ${m.loyalty}).`,
        data: { member: m.id },
        choices: [
          { label: 'Le faire disparaître', hint: '+4 respect, +6 heat, les autres filent droit', effect: 'i_kill' },
          { label: 'Lui parler, prime à la clé', hint: '-500 sale, +25 loyauté', effect: 'i_bonus', disabled: s.dirty < 500 },
          { label: 'Ignorer la rumeur', hint: '+15 heat', effect: 'i_ignore' },
        ],
      };
    },
  },
  {
    key: 'elections', weight: 1, when: (s) => s.week >= 8,
    build: (s) => ({
      key: 'elections',
      title: 'Élections municipales',
      text: "Le candidat McCready promet une police « plus compréhensive ». Sa campagne manque de fonds.",
      choices: [
        { label: 'Financer sa campagne', hint: '-2 500 propre, -20 heat, +3 respect', effect: 'e_fund', disabled: s.clean < 2500 },
        { label: 'Rester en dehors', hint: 'Rien ne se passe', effect: 'none' },
      ],
    }),
  },
  {
    key: 'fete', weight: 2, when: () => true,
    build: (s) => ({
      key: 'fete',
      title: 'La fête de San Gennaro',
      text: 'La procession passe devant ton club. Les hommes attendent que la famille régale.',
      choices: [
        { label: 'Payer la fête', hint: '-400 sale, +6 loyauté pour tous, +2 respect', effect: 'f_pay', disabled: s.dirty < 400 },
        { label: 'Pas cette année', hint: '-3 loyauté pour tous', effect: 'f_skip' },
      ],
    }),
  },
  {
    key: 'descente', weight: 3, when: (s) => s.heat >= 50,
    build: () => ({
      key: 'descente',
      title: 'Un tuyau du commissariat',
      text: 'Une grande opération des Prohis est prévue cette semaine. Tu peux tout fermer et faire le mort.',
      choices: [
        { label: 'Faire profil bas', hint: 'Pas de revenu illégal ce tour, -6 heat, descentes ×0,3', effect: 'd_low' },
        { label: 'Continuer les affaires', hint: '+5 heat', effect: 'd_continue' },
      ],
    }),
  },
  {
    key: 'tueur', weight: 1, when: (s) => s.week > 4,
    build: (s) => ({
      key: 'tueur',
      title: 'Un professionnel de Chicago',
      text: "Un tueur réputé, « l'Horloger », cherche une nouvelle famille. Il coûte cher mais ne rate jamais.",
      choices: [
        { label: "L'engager", hint: '-1 500 sale · Force 9, salaire 420', effect: 'k_hire', disabled: s.dirty < 1500 },
        { label: 'Décliner', hint: 'Rien ne se passe', effect: 'none' },
      ],
    }),
  },
  {
    key: 'notable', weight: 1, when: (s) => s.respect >= 20,
    build: () => ({
      key: 'notable',
      title: 'Un associé respectable',
      text: "Un banquier propose d'investir dans tes « commerces » en échange de discrétion sur ses dettes de jeu.",
      choices: [
        { label: 'Accepter son argent', hint: '+2 000 propre, +5 heat', effect: 'n_accept' },
        { label: 'Refuser poliment', hint: '+2 respect', effect: 'n_refuse' },
      ],
    }),
  },
  // ---------- Commerçants ----------
  {
    key: 'vitrine', weight: 4, when: (s) => !!anyShop(s) && s.rivals.some((r) => r.alive),
    build: (s) => {
      const { d, shop } = anyShop(s)!;
      const r = pick(s.rivals.filter((x) => x.alive));
      return {
        key: 'vitrine',
        title: `${shop.owner} demande justice`,
        text: `Le ${shop.trade} de ${district(s, d).name} : « Des voyous de ${r.name} ont cassé ma vitrine et frappé mon commis. Je paie pour être protégé, Don. »`,
        data: { district: d, shop: shop.id, rival: r.id },
        choices: [
          { label: 'Envoyer tes hommes', hint: '+3 respect, +20 satisfaction, +1 faveur, relation avec le rival −8', effect: 'v_help' },
          { label: 'Lui dire de patienter', hint: '−15 satisfaction', effect: 'v_ignore' },
        ],
      };
    },
  },
  {
    key: 'pret', weight: 3, when: (s) => !!anyShop(s),
    build: (s) => {
      const { d, shop } = anyShop(s)!;
      return {
        key: 'pret',
        title: 'Un prêt entre amis',
        text: `${shop.owner}, ${shop.trade} à ${district(s, d).name}, a besoin de 800 $ pour sauver sa boutique. Les banques ne prêtent pas aux gens comme lui.`,
        data: { district: d, shop: shop.id },
        choices: [
          { label: 'Prêter 800 $', hint: '−800 sale · rembourse 1 100 $ propres dans 5 sem. · +1 faveur', effect: 'p_lend', disabled: s.dirty < 800 },
          { label: 'Refuser', hint: '−8 satisfaction', effect: 'p_refuse' },
        ],
      };
    },
  },
  {
    key: 'fils', weight: 3, when: (s) => !!anyShop(s),
    build: (s) => {
      const { d, shop } = anyShop(s)!;
      return {
        key: 'fils',
        title: 'Le fils du ' + shop.trade,
        text: `Le fils de ${shop.owner} a été arrêté pour une bagarre à ${district(s, d).name}. Le commissaire attend une « caution » officieuse.`,
        data: { district: d, shop: shop.id },
        choices: [
          { label: 'Payer le commissaire', hint: '−600 propre, +25 satisfaction, +1 faveur', effect: 'f_bail', disabled: s.clean < 600 },
          { label: 'Ce ne sont pas tes affaires', hint: '−10 satisfaction', effect: 'f_no' },
        ],
      };
    },
  },
  {
    key: 'impaye', weight: 3, when: (s) => owned(s).some((d) => d.tariff === 'eleve' || d.shops.some((x) => x.satisfaction < 45)),
    build: (s) => {
      const pool = owned(s).flatMap((d) => d.shops.map((shop) => ({ d: d.id, shop }))).sort((a, b) => a.shop.satisfaction - b.shop.satisfaction);
      const { d, shop } = pool[0];
      return {
        key: 'impaye',
        title: 'Il ne peut plus payer',
        text: `${shop.owner}, ${shop.trade} à ${district(s, d).name}, n'a pas de quoi régler la protection cette semaine. Tout le quartier regarde comment tu réagis.`,
        data: { district: d, shop: shop.id },
        choices: [
          { label: 'Passer l’éponge', hint: '−400 sale, +25 satisfaction, +1 faveur', effect: 'i_forgive', disabled: s.dirty < 400 },
          { label: 'Faire un exemple', hint: '+3 respect, +3 heat, tout le quartier −20 satisfaction', effect: 'i_example' },
        ],
      };
    },
  },
  {
    key: 'garagiste', weight: 2, when: (s) => !!anyShop(s) && s.safeRouteWeeks === 0,
    build: (s) => {
      const { d, shop } = anyShop(s)!;
      return {
        key: 'garagiste',
        title: 'Une route discrète',
        text: `${shop.owner} connaît un chemin de terre qui évite les barrages fédéraux. Il te le montre contre un petit service.`,
        data: { district: d, shop: shop.id },
        choices: [
          { label: 'Accepter (−300 sale)', hint: 'Risque des livraisons ×0,5 pendant 6 semaines, +10 satisfaction', effect: 'g_yes', disabled: s.dirty < 300 },
          { label: 'Décliner', hint: 'Rien ne se passe', effect: 'none' },
        ],
      };
    },
  },
  // ---------- Famille du Don ----------
  {
    key: 'rencontre', weight: 3,
    when: (s) => s.week >= 3 && !s.spouse && !s.courtship && !!donOf(s),
    build: (s) => {
      const origin = pick<SpouseOrigin>(['chanteuse', 'banquier', 'commercante']);
      const c = makeCandidate(s, origin);
      s.pendingCandidate = c;
      const scene: Record<string, string> = {
        chanteuse: `Au club de Southside, la chanteuse ne quitte pas le Don des yeux pendant tout son tour de chant.`,
        banquier: `Au gala de l'hôpital, l'héritière d'un banquier du Loop demande au Don de l'accompagner sur la piste.`,
        commercante: `La fille du marchand de journaux de Little Sicily apporte elle-même le Herald au Don chaque matin.`,
      };
      return {
        key: 'rencontre',
        title: `Une rencontre : ${c.name}`,
        text: `${scene[origin]} ${c.name}, ${ORIGINS[origin].label(s)}. ${c.traits.map((t) => SPOUSE_TRAITS[t].name).join(', ')}.`,
        choices: [
          { label: 'La courtiser', hint: 'Dîners et cadeaux dans l’onglet Le Don, puis demande en mariage', effect: 'fam_court' },
          { label: 'Pas maintenant', hint: 'Les affaires d’abord', effect: 'fam_skip' },
        ],
      };
    },
  },
  {
    key: 'promise', weight: 2,
    when: (s) => !s.spouse && !s.courtship && !!donOf(s) && s.rivals.some((r) => r.alive && !r.war && (r.alliance || r.relation >= 15)),
    build: (s) => {
      const r = pick(s.rivals.filter((x) => x.alive && !x.war && (x.alliance || x.relation >= 15)));
      const c = makeCandidate(s, 'rivale', r.id);
      s.pendingCandidate = c;
      return {
        key: 'promise',
        title: `${r.boss} propose sa fille`,
        text: `« Nos familles ont tout à gagner à n'en faire qu'une. » ${r.boss} propose la main de ${c.name}. Un mariage scellerait une alliance solide. ${c.traits.map((t) => SPOUSE_TRAITS[t].name).join(', ')}.`,
        data: { rival: r.id },
        choices: [
          { label: 'Accepter les fiançailles', hint: 'La cour commence à 60 sur 100 ; le mariage scellera l’alliance', effect: 'fam_court' },
          { label: 'Décliner poliment', hint: 'Relation −5', effect: 'fam_decline' },
        ],
      };
    },
  },
  {
    key: 'menace', weight: 2,
    when: (s) => !!s.spouse && s.rivals.some((r) => r.alive && r.relation <= -40),
    build: (s) => {
      const r = pick(s.rivals.filter((x) => x.alive && x.relation <= -40));
      return {
        key: 'menace',
        title: 'Une voiture devant chez toi',
        text: `Depuis trois jours, une Packard noire stationne devant la maison du Don. ${s.spouse!.name} a reconnu un homme de ${r.name}.`,
        data: { rival: r.id },
        choices: [
          { label: 'Doubler la garde', hint: '−600 propre · ta femme se sent protégée (+5 affection)', effect: 'fam_guard', disabled: s.clean < 600 },
          { label: 'Faire comme si de rien n’était', hint: 'Une chance sur deux qu’ils passent à l’acte', effect: 'fam_ignore' },
        ],
      };
    },
  },
  // ---------- Diplomatie ----------
  {
    key: 'ultimatum', weight: 3,
    when: (s) => s.week >= 6 && s.rivals.some((r) => r.alive && !r.war && !r.alliance && r.relation <= -30 && r.strength > playerForce(s) * 0.7),
    build: (s) => {
      const r = pick(s.rivals.filter((x) => x.alive && !x.war && !x.alliance && x.relation <= -30 && x.strength > playerForce(s) * 0.7));
      const amount = 1500;
      return {
        key: 'ultimatum',
        title: `L'ultimatum de ${r.boss}`,
        text: `Un messager dépose une boîte devant ta porte : un poisson mort, et un mot. « ${amount} $ avant dimanche, ou c'est la guerre. » — ${r.boss}`,
        data: { rival: r.id, amount },
        choices: [
          { label: `Payer ${amount} $`, hint: 'Relation +25, −3 respect', effect: 'u_pay', disabled: s.dirty < amount },
          { label: 'Négocier la moitié', hint: s.respect >= 30 ? '−750 sale, relation +8' : '30 respect requis', effect: 'u_half', disabled: s.respect < 30 || s.dirty < 750 },
          { label: 'Renvoyer le poisson', hint: 'Guerre ouverte, +4 respect', effect: 'u_war' },
        ],
      };
    },
  },
  {
    key: 'alliance', weight: 2,
    when: (s) => s.rivals.some((r) => r.alive && !r.alliance && !r.war && r.relation >= 30),
    build: (s) => {
      const r = pick(s.rivals.filter((x) => x.alive && !x.alliance && !x.war && x.relation >= 30));
      return {
        key: 'alliance',
        title: `${r.boss} tend la main`,
        text: `« Nous avons les mêmes ennemis, toi et moi. » ${r.boss} propose une alliance : vous ne vous attaquez plus et chacun garde son territoire.`,
        data: { rival: r.id },
        choices: [
          { label: "Sceller l'alliance", hint: 'Plus aucune attaque entre vous', effect: 'a_yes' },
          { label: 'Décliner poliment', hint: 'Relation −5', effect: 'a_no' },
        ],
      };
    },
  },
];

function touchesPlayer(s: GameState, rivalId: string) {
  return owned(s, rivalId as never).some((d) => neighbors(s, d).some((n) => n.owner === 'player'));
}

export function rollEvent(s: GameState): PendingEvent | null {
  const pool = EVENTS.filter((e) => e.when(s) && e.key !== s.lastEventKey);
  if (!pool.length) return null;
  const total = pool.reduce((t, e) => t + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) { s.lastEventKey = e.key; return e.build(s); }
  }
  return pool[0].build(s);
}

export function resolveEvent(s: GameState, effect: string) {
  const ev = s.pendingEvent;
  if (!ev) return;
  const heat = (n: number) => (s.heat = clamp(s.heat + n, 0, 100));
  const respect = (n: number) => (s.respect = clamp(s.respect + n, 0, 150));
  const allLoyalty = (n: number) => activeMembers(s).forEach((m) => (m.loyalty = clamp(m.loyalty + n, 0, 100)));

  if (resolveTrialEffect(s, effect) || resolvePressureEffect(s, effect, ev) || resolveFamilyEffect(s, effect, ev) || resolveBondEffect(s, effect, ev) || resolveHunterEffect(s, effect, ev) || resolveCareerEffect(s, effect, ev)) {
    s.pendingEvent = null;
    checkEnd(s);
    return;
  }
  switch (effect) {
    case 'fam_court': if (s.pendingCandidate) startCourtship(s, s.pendingCandidate); s.pendingCandidate = null; break;
    case 'fam_skip': s.pendingCandidate = null; break;
    case 'fam_decline': { s.pendingCandidate = null; const r = rival(s, String(ev.data?.rival)); if (r) r.relation = clamp(r.relation - 5, -100, 100); break; }
    case 'fam_guard': s.clean -= 600; if (s.spouse) s.spouse.affection = clamp(s.spouse.affection + 5, 0, 100); log(s, 'good', 'Deux hommes armés montent la garde devant la maison du Don.'); break;
    case 'fam_ignore':
      if (chance(0.5) && s.spouse) {
        const ransom = Math.min(s.dirty, 2000);
        s.dirty -= ransom;
        s.spouse.affection = clamp(s.spouse.affection - 25, 0, 100);
        log(s, 'bad', `${s.spouse.name} a été enlevée. Le Don paie ${ransom} $ de rançon pour la récupérer (−25 affection).`);
        news(s, 5, 'Enlèvement en plein jour', `La femme d'un homme d'affaires de Little Sicily enlevée devant chez elle, puis relâchée contre rançon.`);
      } else log(s, 'neutral', 'La Packard noire a disparu. Fausse alerte… pour cette fois.');
      break;
    case 'j_pay': s.clean -= 500; heat(-5); hunterProgress(s, 'journaliste', -10); log(s, 'neutral', `${hunter(s, 'journaliste').name} a trouvé d'autres sujets (−5 heat, −10 enquête).`); break;
    case 'j_scare': respect(3); heat(6); hunterProgress(s, 'journaliste', 10); log(s, 'neutral', `${hunter(s, 'journaliste').name} a compris le message, mais n'oublie pas (+6 heat, +10 enquête).`); break;
    case 'j_ignore': heat(10); hunterProgress(s, 'journaliste', 10); log(s, 'police', "L'article fait la une. Le préfet est furieux (+10 heat, +10 enquête)."); break;
    case 'c_buy':
      s.dirty -= 1200;
      if (chance(0.75)) {
        const q = Math.min(30, Math.max(0, storageCap(s) - stockTotal(s)));
        s.stock.whisky += q;
        log(s, 'money', `La cargaison est arrivée : ${q} caisses de whisky à l'entrepôt.`);
      } else { heat(8); log(s, 'police', 'Les garde-côtes ont intercepté le bateau. Argent perdu (+8 heat).'); }
      break;
    case 'v_help': {
      const { shop } = shopOf(s, ev);
      const r = rival(s, String(ev.data?.rival));
      respect(3); s.favors++;
      if (shop) shop.satisfaction = clamp(shop.satisfaction + 20, 0, 100);
      if (r) r.relation = clamp(r.relation - 8, -100, 100);
      log(s, 'good', `Tes hommes ont rendu visite aux voyous. ${shop?.owner ?? 'Le commerçant'} te doit une faveur.`);
      break;
    }
    case 'v_ignore': { const { shop } = shopOf(s, ev); if (shop) shop.satisfaction = clamp(shop.satisfaction - 15, 0, 100); break; }
    case 'p_lend': {
      const { shop } = shopOf(s, ev);
      s.dirty -= 800; s.favors++;
      s.loans.push({ due: s.week + 5, amount: 1100, shop: shop?.owner ?? 'Un commerçant' });
      if (shop) shop.satisfaction = clamp(shop.satisfaction + 10, 0, 100);
      log(s, 'neutral', `Tu prêtes 800 $ à ${shop?.owner}. Remboursement prévu en semaine ${s.week + 5}.`);
      break;
    }
    case 'p_refuse': { const { shop } = shopOf(s, ev); if (shop) shop.satisfaction = clamp(shop.satisfaction - 8, 0, 100); break; }
    case 'f_bail': {
      const { shop } = shopOf(s, ev);
      s.clean -= 600; s.favors++;
      if (shop) shop.satisfaction = clamp(shop.satisfaction + 25, 0, 100);
      log(s, 'good', `Le fils de ${shop?.owner} est libéré. Son père n'oubliera pas.`);
      break;
    }
    case 'f_no': { const { shop } = shopOf(s, ev); if (shop) shop.satisfaction = clamp(shop.satisfaction - 10, 0, 100); break; }
    case 'i_forgive': {
      const { shop } = shopOf(s, ev);
      s.dirty -= 400; s.favors++;
      if (shop) shop.satisfaction = clamp(shop.satisfaction + 25, 0, 100);
      log(s, 'neutral', `Tu passes l'éponge pour ${shop?.owner}. Le quartier en parle.`);
      break;
    }
    case 'i_example': {
      const { d } = shopOf(s, ev);
      respect(3); heat(3);
      d.shops.forEach((x) => (x.satisfaction = clamp(x.satisfaction - 20, 0, 100)));
      log(s, 'bad', `La boutique est saccagée devant tout ${d.name}. Plus personne n'osera être en retard.`);
      break;
    }
    case 'g_yes': {
      const { shop } = shopOf(s, ev);
      s.dirty -= 300; s.safeRouteWeeks = 6;
      if (shop) shop.satisfaction = clamp(shop.satisfaction + 10, 0, 100);
      log(s, 'good', 'Tes camions empruntent désormais la route du garagiste (6 semaines).');
      break;
    }
    case 'u_pay': {
      const r = rival(s, String(ev.data?.rival));
      s.dirty -= Number(ev.data?.amount); respect(-3);
      if (r) { r.relation = clamp(r.relation + 25, -100, 100); r.money += Number(ev.data?.amount); }
      log(s, 'neutral', `Tu paies ${r?.boss}. La paix a un prix.`);
      break;
    }
    case 'u_half': {
      const r = rival(s, String(ev.data?.rival));
      s.dirty -= 750;
      if (r) { r.relation = clamp(r.relation + 8, -100, 100); r.money += 750; }
      log(s, 'neutral', `${r?.boss} accepte la moitié, du bout des lèvres.`);
      break;
    }
    case 'u_war': declareWar(s, String(ev.data?.rival)); break;
    case 'a_yes': {
      const r = rival(s, String(ev.data?.rival));
      if (r) {
        r.alliance = true;
        r.relation = Math.max(r.relation, 45);
        log(s, 'good', `Alliance scellée avec ${r.name}.`);
        news(s, 4, 'Pacte entre deux familles', `${r.boss} s'allie à la ${s.familyName}. Les autres familles s'inquiètent.`);
      }
      break;
    }
    case 'a_no': { const r = rival(s, String(ev.data?.rival)); if (r) r.relation = clamp(r.relation - 5, -100, 100); break; }
    case 'm_gift':
      if (s.clean >= 600) { s.clean -= 600; respect(6); log(s, 'good', 'Tout Little Sicily parle de ta générosité.'); }
      else { respect(1); log(s, 'neutral', "Faute de liquide propre, tu t'es contenté de fleurs."); }
      break;
    case 'm_flowers': respect(1); break;
    case 't_accept': {
      const r = rival(s, String(ev.data?.rival));
      if (r) { r.truceWeeks = 6; log(s, 'neutral', `Trêve de 6 semaines avec ${r.name}.`); }
      break;
    }
    case 't_refuse': {
      const r = rival(s, String(ev.data?.rival));
      respect(3);
      if (r) { r.aggression = Math.min(0.9, r.aggression + 0.1); log(s, 'neutral', `Tu renvoies l'émissaire de ${r.name}. Ils ne l'oublieront pas.`); }
      break;
    }
    case 'i_kill': {
      const m = s.members.find((x) => x.id === Number(ev.data?.member));
      if (m) {
        s.members = s.members.filter((x) => x.id !== m.id);
        s.orders.forEach((o) => (o.memberIds = o.memberIds.filter((id) => id !== m.id)));
        respect(4); heat(6); allLoyalty(5);
        log(s, 'bad', `On ne reverra plus ${m.nickname}. Les autres ont compris.`);
      }
      break;
    }
    case 'i_bonus': {
      const m = s.members.find((x) => x.id === Number(ev.data?.member));
      s.dirty -= 500;
      if (m) { m.loyalty = clamp(m.loyalty + 25, 0, 100); log(s, 'neutral', `${m.nickname} jure fidélité, les yeux humides.`); }
      break;
    }
    case 'i_ignore': heat(15); log(s, 'police', 'Le rat continue de parler (+15 heat).'); break;
    case 'e_fund': s.clean -= 2500; heat(-20); respect(3); log(s, 'good', 'McCready est élu. La police lève le pied.'); break;
    case 'f_pay': s.dirty -= 400; allLoyalty(6); respect(2); log(s, 'good', 'Une fête mémorable. Tes hommes chantent ton nom.'); break;
    case 'f_skip': allLoyalty(-3); break;
    case 'd_low': s.lowProfile = true; log(s, 'neutral', 'Tu fais fermer tes établissements pour la semaine.'); break;
    case 'd_continue': heat(5); break;
    case 'k_hire':
      s.dirty -= 1500;
      s.members.push({
        id: nextId(s), name: 'Ettore Valli', nickname: "l'Horloger", rank: 'soldat', force: 9, discretion: 6,
        loyalty: 50, salary: 420, assignment: null, status: 'actif', statusWeeks: 0, weeksServed: 0,
      });
      log(s, 'good', "L'Horloger rejoint la famille.");
      break;
    case 'n_accept': s.clean += 2000; heat(5); log(s, 'money', 'Le banquier investit 2 000 $ propres.'); break;
    case 'n_refuse': respect(2); break;
  }
  s.pendingEvent = null;
  checkEnd(s);
}
