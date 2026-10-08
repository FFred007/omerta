// Le dossier fédéral et le procès du Don.
import { DON_SEEN_HEAT, donHasTalent, donOf } from './don';
import { succession } from './family';
import { isActive, networkDossier } from './network';
import { clamp, log, news, owned } from './state';
import type { GameState, PendingEvent } from './types';

export const DOSSIER_SEEN = 4; // le Don vu sur une opération
export const DOSSIER_ARREST = 2; // un homme arrêté peut parler
export const DOSSIER_RAT = 10; // un traître passé à la police
export { DON_SEEN_HEAT };

export function addDossier(s: GameState, n: number, label: string) {
  if (!n) return;
  s.dossier = clamp((s.dossier ?? 0) + n, 0, 100);
  (s.dossierWeek ??= []).push({ label, value: n });
}

/** Évolution hebdomadaire certaine (hors événements de la semaine) */
export function dossierForecast(s: GameState) {
  const lines: { label: string; value: number }[] = [];
  if (s.heat >= 90) lines.push({ label: 'Heat extrême : ta ligne est sur écoute', value: 10 });
  else if (s.heat >= 75) lines.push({ label: 'Heat très haute : les fédéraux s’intéressent à toi', value: 5 });
  else if (s.heat >= 55) lines.push({ label: 'Heat haute : on parle de toi à Washington', value: 2 });
  else if (s.heat >= 40) lines.push({ label: 'Heat soutenue : un agent ouvre une chemise à ton nom', value: 1 });
  else if (s.heat < 20) lines.push({ label: 'Heat basse : le dossier prend la poussière', value: -1 });
  const size = Math.floor(owned(s).length / 3);
  if (size) lines.push({ label: `Ton empire attire l'attention (${owned(s).length} quartiers)`, value: size });
  const net = networkDossier(s);
  if (net) lines.push({ label: 'Ton réseau dans la justice', value: net });
  return lines;
}

export function dossierTick(s: GameState) {
  for (const l of dossierForecast(s)) addDossier(s, l.value, l.label);
  if ((s.dossier ?? 0) >= 100 && !s.trial && s.status === 'playing' && donOf(s)) {
    if (isActive(s, 'agent') && !s.agentWarned) {
      s.agentWarned = true;
      s.dossier = 85;
      log(s, 'police', 'L’agent Kessler te prévient : une inculpation était prête. Il a « perdu » la convocation (dossier ramené à 85).');
      return;
    }
    s.trial = { stage: 0, score: 0 };
    log(s, 'police', 'Le grand jury fédéral inculpe le Don. Le procès commence.');
    news(s, 5, 'Le Don devant la justice fédérale', `Le chef de la ${s.familyName} est inculpé de fraude fiscale, contrebande et corruption.`);
  }
}

// ---------- Le procès ----------
export const TRIAL_JURY_COST = 1500;
export const TRIAL_WITNESS_COST = 2000;
export const TRIAL_LAWYER_COST = 2500;

/** Meilleur homme pour faire taire un témoin, et ses chances */
function witnessOdds(s: GameState) {
  const best = s.members.filter((m) => m.status === 'actif' && !m.isDon).sort((a, b) => b.discretion - a.discretion)[0];
  const p = best ? clamp((best.discretion - 4) / 8, 0.1, 0.9) : 0;
  return { best, p };
}

export function acquittalChance(s: GameState) {
  const t = s.trial;
  const ombre = donOf(s)?.discretion ?? 5;
  return clamp(0.05 + (t?.score ?? 0) / 100 + (s.judge ? 0.15 : 0) + (isActive(s, 'procureur') ? 0.25 : 0) + (ombre - 5) * 0.02, 0.05, 0.95);
}

export function trialEvent(s: GameState): PendingEvent {
  const t = s.trial!;
  const pct = (p: number) => `${Math.round(p * 100)} %`;
  if (t.stage === 0) {
    return {
      key: 'proces', title: 'Le procès · le jury',
      text: 'Douze citoyens de New Corrano vont décider du sort du Don. Leurs noms sont censés rester secrets. Ils ne le sont pas.',
      choices: [
        { label: 'Acheter trois jurés', hint: `−${TRIAL_JURY_COST} propre · +20 points de défense`, effect: 'tr_jury_buy', disabled: s.clean < TRIAL_JURY_COST },
        { label: 'Les faire suivre jusque chez eux', hint: '+15 points · +8 heat', effect: 'tr_jury_scare' },
        { label: 'Faire confiance à la justice', hint: 'Aucun point', effect: 'tr_none' },
      ],
    };
  }
  if (t.stage === 1) {
    const w = witnessOdds(s);
    return {
      key: 'proces', title: 'Le procès · le témoin',
      text: 'Le procureur a un témoin : un ancien chauffeur de la famille, sous protection fédérale dans un hôtel du Loop.',
      choices: [
        { label: w.best ? `Envoyer ${w.best.nickname} le faire taire` : 'Le faire taire', hint: w.best ? `${pct(w.p)} de réussite · +30 points, sinon −10 et +8 au dossier` : 'Personne de disponible', effect: 'tr_wit_silence', disabled: !w.best },
        { label: 'Lui payer un aller simple pour Buenos Aires', hint: `−${TRIAL_WITNESS_COST} propre · +20 points`, effect: 'tr_wit_pay', disabled: s.clean < TRIAL_WITNESS_COST },
        { label: 'Laisser parler', hint: 'Aucun point', effect: 'tr_none' },
      ],
    };
  }
  if (t.stage === 2) {
    const fam = donHasTalent(s, 'r_avocat');
    return {
      key: 'proces', title: 'Le procès · la défense',
      text: 'Il reste la plaidoirie. Un bon avocat peut transformer un dossier accablant en « doute raisonnable ».',
      choices: [
        { label: 'Maître Goldberg, de Chicago', hint: `−${TRIAL_LAWYER_COST} propre · +15 points`, effect: 'tr_law_star', disabled: s.clean < TRIAL_LAWYER_COST },
        ...(fam ? [{ label: "L'avocat de la famille", hint: 'Talent du Renard · +25 points, gratuit', effect: 'tr_law_family' }] : []),
        { label: 'Un avocat commis d’office', hint: 'Aucun point', effect: 'tr_none' },
      ],
    };
  }
  const p = acquittalChance(s);
  return {
    key: 'proces', title: 'Le verdict',
    text: `Les jurés reviennent après six heures de délibération. Points de défense : ${t.score}${s.judge ? ', le juge Halloran préside' : ''}${isActive(s, 'procureur') ? ', le procureur adjoint a « oublié » des pièces' : ''}. Chances d'acquittement : ${pct(p)}.`,
    choices: [{ label: 'Écouter le verdict', hint: `${pct(p)} d'acquittement · sinon 20 ans de prison${s.children?.length ? ' et l’héritier reprend' : ' et fin de la lignée'}`, effect: 'tr_verdict' }],
  };
}

export function resolveTrialEffect(s: GameState, effect: string): boolean {
  const t = s.trial;
  if (!t || !effect.startsWith('tr_')) return false;
  switch (effect) {
    case 'tr_jury_buy': s.clean -= TRIAL_JURY_COST; t.score += 20; log(s, 'neutral', 'Trois jurés ont soudain les moyens de rembourser leur hypothèque.'); break;
    case 'tr_jury_scare': t.score += 15; s.heat = clamp(s.heat + 8, 0, 100); log(s, 'neutral', 'Des jurés ont remarqué une voiture noire devant chez eux.'); break;
    case 'tr_wit_silence': {
      const w = witnessOdds(s);
      if (w.best && Math.random() < w.p) { t.score += 30; log(s, 'good', `${w.best.nickname} a fait le nécessaire. Le témoin ne viendra pas.`); }
      else { t.score -= 10; addDossier(s, 8, 'Tentative de subornation de témoin'); log(s, 'bad', 'Le témoin s’en est sorti, et il en parle au juge (−10 points, +8 dossier).'); }
      break;
    }
    case 'tr_wit_pay': s.clean -= TRIAL_WITNESS_COST; t.score += 20; log(s, 'neutral', 'Le témoin a pris le bateau pour l’Argentine.'); break;
    case 'tr_law_star': s.clean -= TRIAL_LAWYER_COST; t.score += 15; log(s, 'neutral', 'Maître Goldberg arrive de Chicago avec trois valises de jurisprudence.'); break;
    case 'tr_law_family': t.score += 25; log(s, 'neutral', 'L’avocat de la famille connaît chaque faille du dossier.'); break;
    case 'tr_none': break;
    case 'tr_verdict': {
      const p = acquittalChance(s);
      s.trial = null;
      s.agentWarned = false;
      if (Math.random() < p) {
        s.dossier = 40;
        s.respect = clamp(s.respect + 8, 0, 150);
        log(s, 'good', `Acquitté ! Le Don sort libre du tribunal (${Math.round(p * 100)} % de chances).`);
        news(s, 5, 'Le Don acquitté', 'Les jurés n’ont pas été convaincus. Sur les marches du tribunal, le Don salue la foule.');
      } else {
        s.dossier = 50;
        const don = donOf(s);
        log(s, 'bad', `Coupable (${Math.round(p * 100)} % de chances d'acquittement).`);
        if (don) succession(s, don, 'a été condamné à 20 ans de prison fédérale');
      }
      return true;
    }
  }
  t.stage += 1;
  return true;
}
