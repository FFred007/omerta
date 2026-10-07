import { fmt, checkEnd } from './engine';
import { activeMembers, chance, clamp, log, neighbors, nextId, owned, pick, rival } from './state';
import type { GameState, PendingEvent } from './types';

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
      title: 'Un journaliste fouineur',
      text: "Un reporter du Corrano Herald pose des questions sur les « affaires » de la " + s.familyName + ". Son article sort lundi.",
      choices: [
        { label: 'Acheter son silence', hint: '-500 propre, -5 heat', effect: 'j_pay', disabled: s.clean < 500 },
        { label: "L'intimider", hint: '+3 respect, +6 heat', effect: 'j_scare' },
        { label: 'Laisser publier', hint: '+10 heat', effect: 'j_ignore' },
      ],
    }),
  },
  {
    key: 'cargaison', weight: 3, when: (s) => s.week > 2,
    build: (s) => ({
      key: 'cargaison',
      title: 'Whisky canadien',
      text: "Un contrebandier propose un chargement de whisky pur malt, livré cette nuit par le lac. Payable d'avance.",
      choices: [
        { label: 'Acheter la cargaison', hint: '-2 000 sale · 70 % : +4 500 sale', effect: 'c_buy', disabled: s.dirty < 2000 },
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
    when: (s) => s.rivals.some((r) => r.alive && r.truceWeeks === 0 && touchesPlayer(s, r.id)),
    build: (s) => {
      const r = pick(s.rivals.filter((x) => x.alive && x.truceWeeks === 0 && touchesPlayer(s, x.id)));
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
    key: 'indic', weight: 2, when: (s) => activeMembers(s).length >= 3 && s.heat > 30,
    build: (s) => {
      const m = [...activeMembers(s)].sort((a, b) => a.loyalty - b.loyalty)[0];
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
];

function touchesPlayer(s: GameState, rivalId: string) {
  return owned(s, rivalId as never).some((d) => neighbors(s, d).some((n) => n.owner === 'player'));
}

export function rollEvent(s: GameState): PendingEvent | null {
  const pool = EVENTS.filter((e) => e.when(s));
  if (!pool.length) return null;
  const total = pool.reduce((t, e) => t + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) return e.build(s);
  }
  return pool[0].build(s);
}

export function resolveEvent(s: GameState, effect: string) {
  const ev = s.pendingEvent;
  if (!ev) return;
  const heat = (n: number) => (s.heat = clamp(s.heat + n, 0, 100));
  const respect = (n: number) => (s.respect = clamp(s.respect + n, 0, 150));
  const allLoyalty = (n: number) => activeMembers(s).forEach((m) => (m.loyalty = clamp(m.loyalty + n, 0, 100)));

  switch (effect) {
    case 'j_pay': s.clean -= 500; heat(-5); log(s, 'neutral', "Le journaliste a trouvé d'autres sujets."); break;
    case 'j_scare': respect(3); heat(6); log(s, 'neutral', 'Le journaliste a compris le message.'); break;
    case 'j_ignore': heat(10); log(s, 'police', "L'article fait la une. Le préfet est furieux (+10 heat)."); break;
    case 'c_buy':
      s.dirty -= 2000;
      if (chance(0.7)) { s.dirty += 4500; log(s, 'money', `La cargaison est arrivée. Écoulée pour ${fmt(4500)}.`); }
      else { heat(8); log(s, 'police', 'Les garde-côtes ont intercepté le bateau. Argent perdu (+8 heat).'); }
      break;
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
