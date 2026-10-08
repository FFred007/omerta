import {
  BUSINESSES, COP_BRIBE, COUNCIL_BRIBE, ESCORTS, GOOD_ORDER, GOODS, JUDGE_BRIBE, LAUNDER_FEE, PROMOTE_COST, SPEAKEASY_DEMAND,
  CITIES, TARIFFS, TIERS, cityDef, dayLabel, rankOf, tierOf, weekLabel,
} from './data';
import * as CT from './cities';
import * as CM from './commission';
import * as SC from './score';
import { countUp, dropHerald, playFx, trucks } from './fx';
import { streetLine } from './street';
import * as B from './booze';
import * as D from './diplomacy';
import * as E from './engine';
import { resolveEvent } from './events';
import { DON_TRAITS, TRAITS, rankTitle, xpForNext, type TraitId } from './traits';
import { BRANCHES, DON_STATS, STAT_CAP, TALENTS, ageOf, canLearn, donOf, donXpForNext, learnTalent, spendPoint, type Branch, type DonStat, type TalentId } from './don';
import * as F from './family';
import { portrait, seedOf } from './portraits';
import * as NET from './network';
import { acquittalChance, dossierForecast } from './dossier';
import { COALITION_AT, inCoalition } from './pressure';
import { progress as objProgress, rewardText as objReward } from './objectives';
import { jobChance, teamSkill, toggleJobMember } from './jobs';
import { ALIBI_HEAT, favorAlibi, favorFreePrisoner, moodLabel, setTariff } from './shops';
import {
  activeMembers, attackPower, clamp, clearSave, defenseOf, district, isAttackable, load, membersIn, onAttack, onJob,
  owned, pendingCrates, recruitCost, projection, racketOf, retailPrice, rival, salesPlan, satisfaction, save, stockTotal, storageCap, winChance,
} from './state';
import type { BusinessKind, District, Escort, GameState, Good, Job, Member, Owner, RivalFamily, Tariff } from './types';

type Tab = 'quartier' | 'don' | 'business' | 'coups' | 'famille' | 'villes' | 'commission' | 'corruption' | 'rivaux' | 'journal';

const ui = {
  tab: 'quartier' as Tab,
  selected: 'sicily',
  city: 'corrano', // ville affichée sur la carte
  attackers: new Set<number>(),
  expedition: new Set<number>(), // équipe pour prendre pied dans une ville
  showIntro: false,
  toast: '',
  toastTimer: 0,
  confirm: '', // clé du bouton en attente de confirmation
  confirmTimer: 0,
  qty: { biere: 15, gin: 15, whisky: 10 } as Record<Good, number>,
  escort: 'legere' as Escort,
  // horloge
  playing: false,
  progress: 0, // avancement du jour courant, 0..1
  resolving: false,
  feed: [] as { id: number; text: string; tone: string; week: number; day: number; born: number }[],
  feedId: 0,
  heatOpen: false,
  shown: { dirty: 0, clean: 0, respect: 0 }, // valeurs affichées (pour les compteurs animés)
};
const SPEEDS = [1, 2, 3];
const DAY_MS = 2600; // durée d'un jour à vitesse ×1

let s: GameState = load() ?? E.startGame();
if (s.week === 1 && s.log.length <= 1) ui.showIntro = true;
ui.city = CT.donCity(s);
if (CT.cityOf(district(s, ui.selected)) !== ui.city) ui.selected = CT.ownedIn(s, ui.city)[0]?.id ?? ui.selected;
ui.shown = { dirty: s.dirty, clean: s.clean, respect: s.respect };
const speed = () => s.speed ?? 1;

const app = document.getElementById('app')!;

// =====================================================================
// Helpers d'affichage
// =====================================================================
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = E.fmt;
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const pct = (p: number) => `${Math.round(p * 100)} %`;
const oddsTone = (p: number) => (p >= 0.7 ? 'var(--good)' : p >= 0.4 ? 'var(--brass)' : 'var(--oxblood-bright)');

function ownerColor(o: Owner) {
  if (o === 'player') return 'var(--player)';
  if (o === 'neutral') return 'var(--neutral)';
  return rival(s, o)!.color;
}
function ownerName(o: Owner) {
  if (o === 'player') return s.familyName;
  if (o === 'neutral') return 'Indépendants';
  return rival(s, o)!.name;
}
const SHORT: Record<BusinessKind, string> = {
  speakeasy: 'Bar', tripot: 'Jeu', distillerie: 'Alambic', paris: 'Paris',
  blanchisserie: 'Lavoir', restaurant: 'Resto', garage: 'Garage', entrepot: 'Dépôt',
};
const moodTone = (sat: number) => (sat < 30 ? 'var(--oxblood-bright)' : sat < 45 ? 'var(--brass)' : sat < 70 ? 'var(--ivory-dim)' : 'var(--good)');

function traitChips(ids: TraitId[] | undefined, withDesc = false) {
  if (!ids?.length) return '';
  return `<span class="traits">${ids.map((id) => {
    const t = TRAITS[id];
    return `<span class="trait ${t.good ? '' : 'bad'}" title="${esc(t.desc)}">${esc(t.name)}${withDesc ? `<small>${esc(t.desc)}</small>` : ''}</span>`;
  }).join('')}</span>`;
}

/** Noms courts des traits utiles pour un type d'action */
function traitHint(m: Member, kind: 'assault' | 'force' | 'discretion') {
  const rel: Record<string, TraitId[]> = {
    assault: ['tireur', 'tetebrulee', 'trouillard'],
    force: ['brute'],
    discretion: ['sangfroid', 'ivrogne', 'fantome'],
  };
  const hit = (m.traits ?? []).filter((x) => rel[kind].includes(x));
  return hit.length ? ` · <span class="${hit.some((x) => !TRAITS[x].good) ? 'danger' : 'trait-inline'}">${hit.map((x) => TRAITS[x].name).join(', ')}</span>` : '';
}

function busyLabel(m: Member) {
  if ((m.fatigue ?? 0) > 0) return 'récupère du dernier assaut';
  const j = onJob(s, m.id);
  if (j) return 'sur un coup';
  const o = onAttack(s, m.id);
  if (o) return `assaut sur ${district(s, o.districtId).name}`;
  const city = CT.openCities(s).length > 1 ? ` · ${CT.cityName(CT.memberCity(m))}` : '';
  return (m.assignment ? `garde ${district(s, m.assignment).name}` : 'réserve') + city;
}

// =====================================================================
// Rendu
// =====================================================================
export function render() {
  save(s);
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.act
    ? `[data-act="${active.dataset.act}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ''}${active.dataset.job ? `[data-job="${active.dataset.job}"]` : ''}`
    : null;
  app.innerHTML = `
    ${topbar()}
    <main class="layout">
      <section>
        ${mapView()}
        ${weekCard()}
      </section>
      <section class="panel">
        ${tabs()}
        <div class="panel-body">${panel()}</div>
      </section>
    </main>
    ${modals()}
    ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}
  `;
  if (focusKey) app.querySelector<HTMLElement>(focusKey)?.focus({ preventScroll: true });
  renderFeed();
  updateClock();
  animateCounters();
}

function animateCounters() {
  const pairs: [keyof typeof ui.shown, string, (n: number) => string][] = [
    ['dirty', '.stat-dirty .v', money],
    ['clean', '.stat-clean .v', money],
    ['respect', '.stat-respect .v', (n) => String(Math.round(n))],
  ];
  for (const [k, sel, f] of pairs) {
    const el = app.querySelector<HTMLElement>(sel);
    const to = s[k];
    if (el && ui.shown[k] !== to) countUp(el, ui.shown[k], to, f);
    ui.shown[k] = to;
  }
}

// ---------- Fil de la ville ----------
function pushFeed(text: string, tone: string, week = s.week) {
  ui.feed.unshift({ id: ++ui.feedId, text, tone, week, day: s.day ?? 0, born: Date.now() });
  if (ui.feed.length > 40) ui.feed.length = 40;
}

function renderFeed() {
  const box = app.querySelector<HTMLElement>('#feed');
  if (!box) return;
  const now = Date.now();
  box.innerHTML = ui.feed.length
    ? ui.feed.slice(0, 7).map((f) => `<li class="tone-${f.tone} ${now - f.born < 700 ? 'fresh' : ''}"><span class="w">${f.tone === 'street' ? 'Rue' : `S${f.week}`}</span>${esc(f.text)}</li>`).join('')
    : `<li class="tone-street"><span class="w">Rue</span>La ville attend que tu lances l'horloge.</li>`;
}

// ---------- Horloge ----------
function blocked() {
  return ui.showIntro || !!s.pendingEvent || s.status !== 'playing' || ui.resolving || document.hidden;
}

function updateClock() {
  const day = s.day ?? 0;
  const label = app.querySelector<HTMLElement>('#clock-day');
  if (label) label.textContent = ui.resolving ? `Nuit de dimanche · ${weekLabel(s.week, 6)}` : dayLabel(s.week, day);
  app.querySelectorAll<HTMLElement>('.daybar i').forEach((el, i) => {
    const fill = i < day ? 1 : i === day ? ui.progress : 0;
    el.style.setProperty('--fill', String(ui.resolving ? 1 : fill));
    el.classList.toggle('today', i === day && !ui.resolving);
  });
  const btn = app.querySelector<HTMLElement>('[data-act="play"]');
  if (btn) {
    const waiting = ui.playing && blocked() && !ui.resolving;
    btn.textContent = ui.playing ? (waiting ? 'En attente' : 'Pause') : 'Lecture';
    btn.setAttribute('aria-pressed', String(ui.playing));
    btn.classList.toggle('pulse', !ui.playing && s.status === 'playing');
  }
}

let last = performance.now();
function tick(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  if (ui.playing && !blocked()) {
    ui.progress += (dt * speed()) / DAY_MS;
    if (ui.progress >= 1) {
      ui.progress = 0;
      nextDay();
    }
    updateClock();
  }
  requestAnimationFrame(tick);
}

function nextDay() {
  const day = (s.day ?? 0) + 1;
  if (day >= 7) {
    resolveWeek();
    return;
  }
  s.day = day;
  if (Math.random() < 0.8) pushFeed(streetLine(s), 'street');
  if (day === 3) {
    E.midweek(s);
    if (s.pendingEvent) return render();
  }
  save(s);
  renderFeed();
}

/** Nuit de dimanche : les camions roulent, puis la semaine se résout et ses effets se jouent sur la carte */
function resolveWeek() {
  if (ui.resolving || s.status !== 'playing' || s.pendingEvent) return;
  ui.resolving = true;
  ui.progress = 0;
  document.querySelector('.map')?.classList.add('night');
  updateClock();
  const home = owned(s).find((d) => d.id === 'sicily')?.id ?? owned(s)[0]?.id ?? 'sicily';
  const nightMs = s.shipments.length ? 1500 / speed() : 500 / speed();
  trucks(s.shipments.length, home, nightMs);
  window.setTimeout(() => {
    E.endTurn(s);
    ui.attackers.clear();
    if (district(s, ui.selected).owner !== 'player' && !isAttackable(s, district(s, ui.selected))) ui.selected = CT.ownedIn(s, ui.city)[0]?.id ?? ui.selected;
    ui.resolving = false;
    render();
    const fxEvents = s.fx ?? [];
    const dur = playFx(fxEvents, speed(), home);
    // les nouvelles arrivent une à une dans le fil
    const entries = s.lastReport.filter((e) => !e.text.includes('ton oncle est tombé'));
    entries.forEach((e, i) => window.setTimeout(() => { pushFeed(e.text, e.tone, e.week); renderFeed(); }, (i * 180) / speed()));
    const h = s.headlines[0];
    if (h && h.week === s.week - 1) {
      window.setTimeout(() => dropHerald(herald(h, true), () => { ui.tab = 'journal'; render(); }), Math.min(dur, 1200));
    }
  }, nightMs);
}

function topbar() {
  const heatTone = s.heat >= 70 ? 'danger' : '';
  return `
  <header class="topbar">
    <div class="brand">
      ${donOf(s) ? `<button class="brand-don" data-act="tab" data-id="don" aria-label="Voir le Don">${memberPortrait(donOf(s)!, 40)}</button>` : ''}
      <h1>Omertà</h1>
      <span class="date">${esc(s.familyName)} · ${s.commission?.chair ? 'Capo dei Capi' : rankOf(s.respect)} · semaine ${s.week} · ${donOf(s) ? 'le Don' : 'la famille'} à ${esc(CT.cityName(CT.donCity(s)))}</span>
    </div>
    <div class="ledger-strip">
      <div class="stat stat-dirty"><span class="k">Argent sale</span><span class="v dirty">${money(ui.shown.dirty)}</span></div>
      <div class="stat stat-clean"><span class="k">Argent propre</span><span class="v clean">${money(ui.shown.clean)}</span></div>
      <div class="stat"><span class="k">Caisses</span><span class="v">${stockTotal(s)}<small class="muted">/${storageCap(s)}</small></span></div>
      <div class="stat stat-respect"><span class="k">Respect</span><span class="v">${Math.round(ui.shown.respect)}</span></div>
      <div class="stat"><span class="k">Faveurs</span><span class="v">${s.favors}</span></div>
      <div class="stat heat dossier" data-act="tab" data-id="corruption" role="button" tabindex="0" title="Dossier fédéral : à 100, le Don est inculpé"><span class="k">Dossier <span class="num ${(s.dossier ?? 0) >= 70 ? 'danger' : ''}">${Math.round(s.dossier ?? 0)}/100</span></span>
        <div class="heat-bar fed" role="meter" aria-valuenow="${Math.round(s.dossier ?? 0)}" aria-valuemin="0" aria-valuemax="100" aria-label="Dossier fédéral"><i style="width:${s.dossier ?? 0}%"></i></div>
      </div>
      <div class="stat heat" data-act="tab" data-id="corruption" role="button" tabindex="0" title="Voir le détail de la heat"><span class="k">Heat <span class="num ${heatTone}">${s.heat}/100</span></span>
        <div class="heat-bar" role="meter" aria-valuenow="${s.heat}" aria-valuemin="0" aria-valuemax="100" aria-label="Heat"><i style="width:${s.heat}%"></i></div>
      </div>
    </div>
    <div class="top-actions">
      <button class="btn small" data-act="help">Règles</button>
      <button class="btn small ${ui.confirm === 'restart' ? 'danger' : ''}" data-act="restart">${ui.confirm === 'restart' ? 'Abandonner la partie ?' : 'Nouvelle partie'}</button>
    </div>
  </header>`;
}

function mapView() {
  const tiles = CT.cityDistricts(s, ui.city)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((d) => {
      const mine = d.owner === 'player';
      const target = isAttackable(s, d);
      const order = s.orders.find((o) => o.districtId === d.id);
      const men = mine ? membersIn(s, d.id).length : 0;
      const chips = d.businesses
        .map((b) => `<span class="chip ${BUSINESSES[b.kind].illegal ? 'illegal' : 'legal'}">${SHORT[b.kind]}</span>`)
        .join('');
      const sat = satisfaction(d);
      const extra = [
        mine ? `<span class="chip">${men} homme${men > 1 ? 's' : ''}</span>` : '',
        mine && d.bribedCop ? '<span class="chip legal">Flic payé</span>' : '',
      ].join('');
      return `
      <button class="tile ${mine ? 'mine' : ''} ${target ? 'target' : ''} ${ui.selected === d.id ? 'selected' : ''}"
        style="--owner:${ownerColor(d.owner)}; --owner-text:${ownerColor(d.owner)}"
        data-act="select" data-id="${d.id}" aria-pressed="${ui.selected === d.id}"
        aria-label="${esc(d.name)}, ${esc(ownerName(d.owner))}">
        <span class="tdef" title="Défense">déf ${defenseOf(s, d)}</span>
        <span class="tname">${esc(d.name)}</span>
        <span class="towner">${esc(ownerName(d.owner))}</span>
        ${mine ? `<span class="tmood" style="--mood:${moodTone(sat)}" title="Commerçants : ${moodLabel(sat)}">${moodLabel(sat)}</span>` : ''}
        <span class="tfoot">${chips}${extra}</span>
        ${order ? '<span class="badge-attack">Assaut prévu</span>' : ''}
      </button>`;
    })
    .join('');
  const legend = [
    `<span><i style="background:var(--player)"></i>${esc(s.familyName)}</span>`,
    ...CT.rivalsIn(s, ui.city).filter((r) => r.alive).map((r) => `<span><i style="background:${r.color}"></i>${esc(r.name)}${r.alliance ? ' (allié)' : r.war ? ' (guerre)' : ''}</span>`),
    `<span><i style="background:var(--neutral)"></i>Indépendants</span>`,
  ].join('');
  const busy = [
    s.shipments.length ? `${s.shipments.length} livraison${s.shipments.length > 1 ? 's' : ''} cette nuit` : '',
    s.jobs.filter((j) => j.team.length >= j.minMen).length ? `${s.jobs.filter((j) => j.team.length >= j.minMen).length} coup(s) prévu(s)` : '',
  ].filter(Boolean).join(' · ');
  return `
  <div class="map-wrap">
    ${inCoalition(s) ? `<div class="banner danger-banner">Les familles sont coalisées contre toi encore ${s.coalitionWeeks} semaine${(s.coalitionWeeks ?? 0) > 1 ? 's' : ''} : elles attaquent 60 % plus souvent et te visent en priorité.</div>` : ''}
    ${s.trial ? `<div class="banner danger-banner">Procès fédéral en cours : étape ${Math.min(4, s.trial.stage + 1)} sur 4 · ${Math.round(acquittalChance(s) * 100)} % d'acquittement pour l'instant.</div>` : ''}
    ${CM.truceActive(s) ? `<div class="banner">Trêve générale de la Commission : encore ${s.commission!.truceWeeks} semaine${s.commission!.truceWeeks > 1 ? 's' : ''}. Un assaut te coûterait la face.</div>` : ''}
    ${cityTabs()}
    <div class="map-title"><h2>${esc(cityDef(ui.city).name)}</h2><span class="muted" style="font-size:13px">${busy ? esc(busy) + ' · ' : ''}${cityStatus(ui.city)}</span></div>
    <div class="map" style="--cols:${cityDef(ui.city).cols}">${tiles}</div>
    <div class="legend">${legend}</div>
    ${objectivesBlock()}
    <div class="feed-wrap">
      <h3 class="feed-title">Le fil de la ville</h3>
      <ul id="feed" class="log feed" aria-live="polite"></ul>
    </div>
  </div>`;
}

function cityStatus(id: string) {
  const all = CT.cityDistricts(s, id).length;
  const mine = CT.ownedIn(s, id).length;
  if (!CT.isOpen(s, id)) return 'la famille n’y est pas implantée';
  const h = CT.holder(s, id);
  const gov = CT.governor(s, id);
  return `${mine} / ${all} quartiers · ${h === 'don' ? 'le Don est ici' : h === 'gouverneur' ? `gouverneur : ${esc(gov!.nickname)}` : '<span class="danger">personne ne tient la ville (revenus −30 %)</span>'}`;
}

function cityTabs() {
  return `<div class="city-tabs" role="tablist" aria-label="Villes">${CITIES.map((c) => {
    const open = CT.isOpen(s, c.id);
    const mine = CT.ownedIn(s, c.id).length;
    const don = CT.donCity(s) === c.id;
    const warn = open && !CT.holder(s, c.id);
    return `<button class="city-tab ${ui.city === c.id ? 'active' : ''} ${open ? 'open' : 'closed'}" role="tab" aria-selected="${ui.city === c.id}" data-act="city" data-id="${c.id}">
      <b>${esc(c.name)}</b><small>${don ? '★ ' : ''}${open ? `${mine} quartier${mine > 1 ? 's' : ''}` : esc(c.kind)}${warn ? ' · !' : ''}</small></button>`;
  }).join('')}</div>`;
}

function weekCard() {
  const p = projection(s);
  const f = E.settle(s);
  const blocked = !!s.pendingEvent || s.status !== 'playing';
  const rate = s.launderRate ?? 1;
  const row = (label: string, n: number, cls: string) =>
    n ? `<span>${label}</span><span class="num ${cls}">${sign(n)}</span>` : '';
  const rates: [number, string][] = [[1, 'Max'], [0.5, 'Moitié'], [0, 'Arrêt']];
  const crates = GOOD_ORDER.reduce((t, g) => t + p.plan.sold[g], 0);
  const jobsReady = s.jobs.filter((j) => j.team.length >= j.minMen).length;
  const label = [
    s.orders.length ? `${s.orders.length} assaut${s.orders.length > 1 ? 's' : ''}` : '',
    jobsReady ? `${jobsReady} coup${jobsReady > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  return `
  <div class="week-card">
    <h3>Prévisions de la semaine</h3>
    <div class="ledger-cols">
      <div>
        <h4 class="dirty">Argent sale</h4>
        <div class="ledger-rows">
          ${row('Protection des commerçants', p.racket, 'dirty')}
          ${row(`Ventes d'alcool (${crates} caisses)`, p.booze, 'dirty')}
          ${row('Tripots, paris, entrées des bars', p.fixed, 'dirty')}
          ${row('Salaires', -f.salDirty, 'dirty')}
          ${row('Envoyé au blanchiment', -f.launderTaken, 'dirty')}
          <span class="total">Bilan</span><span class="num total ${f.dirtyNet < 0 ? 'danger' : 'dirty'}">${sign(f.dirtyNet)}</span>
        </div>
      </div>
      <div>
        <h4 class="clean">Argent propre</h4>
        <div class="ledger-rows">
          ${row('Commerces légaux', f.cleanIn, 'clean')}
          ${row(`Blanchiment (−${Math.round(LAUNDER_FEE * 100)} % de commission)`, f.launderGiven, 'clean')}
          ${row('Salaires (faute de sale)', -f.salClean, 'clean')}
          ${row('Enveloppes', -f.bribes, 'clean')}
          <span class="total">Bilan</span><span class="num total ${f.cleanNet < 0 ? 'danger' : 'clean'}">${sign(f.cleanNet)}</span>
        </div>
      </div>
    </div>
    ${p.plan.shortage ? `<p class="note danger">Rupture de stock : il manquera ${p.plan.shortage} caisses dans tes speakeasies. <button class="linkish" data-act="tab" data-id="business">Acheter de l'alcool</button></p>` : ''}
    ${f.unpaid ? `<p class="note danger">Il manquera ${money(f.unpaid)} pour payer tes hommes : leur loyauté va chuter.</p>` : ''}
    ${!f.bribesOk && f.bribes ? `<p class="note danger">Pas assez d'argent propre pour les enveloppes : tes contacts vont te lâcher.</p>` : ''}
    ${p.launderCap ? `<div class="launder" role="group" aria-label="Blanchiment">
      <span>Blanchiment <span class="muted">(capacité ${money(p.launderCap)})</span></span>
      <span class="seg">${rates.map(([r, l]) => `<button class="btn small ${rate === r ? 'on' : ''}" data-act="launder" data-id="${r}" aria-pressed="${rate === r}">${l}</button>`).join('')}</span>
    </div>` : ''}
    ${heatBlock(false)}
    <div class="end-dock">
      <div class="clock" role="group" aria-label="Horloge">
        <div class="clock-top">
          <span id="clock-day" class="clock-day"></span>
          <span class="muted clock-plan">${label ? esc(label) + ' prévus dimanche' : ''}</span>
        </div>
        <div class="daybar" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<i class="${i === 6 ? 'sun' : ''}"></i>`).join('')}</div>
        <div class="clock-ctrl">
          <button class="btn primary play" data-act="play" ${blocked ? 'disabled' : ''}>Lecture</button>
          <span class="seg">${SPEEDS.map((v) => `<button class="btn small ${speed() === v ? 'on' : ''}" data-act="speed" data-id="${v}" aria-pressed="${speed() === v}" aria-label="Vitesse ×${v}">×${v}</button>`).join('')}</span>
          <button class="btn small skip" data-act="end" ${blocked ? 'disabled' : ''}>Aller à dimanche soir</button>
        </div>
      </div>
    </div>
  </div>`;
}

const fmtHeat = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('fr-FR')}`;
};

/** Détail de la heat : ce qui est certain cette semaine, ce qui peut s'ajouter, et ce qui s'est passé la semaine dernière */
function heatBlock(always: boolean) {
  const f = E.heatForecast(s);
  const sure = f.lines.filter((l) => l.sure);
  const risks = f.lines.filter((l) => !l.sure);
  const net = Math.round(f.sure);
  const open = always || ui.heatOpen;
  const row = (l: E.HeatLine) => `<span>${esc(l.label)}</span><span class="num ${l.value > 0 ? 'danger' : 'clean'}">${fmtHeat(l.value)}</span>`;
  const lh = s.lastHeat;
  const lastLines = s.lastReport.filter((e) => /heat|Descente/.test(e.text));
  return `
  <div class="heat-box">
    ${always ? '' : `<button class="heat-line linkrow" data-act="heat-toggle" aria-expanded="${open}">
      <span>Heat cette semaine <span class="muted">· ${s.heat} → ${clamp(s.heat + net, 0, 100)}${risks.length ? ', plus les risques' : ''}</span></span>
      <span><span class="num ${net > 0 ? 'danger' : 'clean'}">${net > 0 ? '+' : ''}${net}</span> <span class="muted chev">${open ? '▴' : '▾'}</span></span>
    </button>`}
    ${open ? `
    <div class="heat-detail">
      <div class="ledger-rows">${sure.map(row).join('')}
        <span class="total">Certain</span><span class="num total ${net > 0 ? 'danger' : 'clean'}">${net > 0 ? '+' : ''}${net}</span>
      </div>
      ${risks.length ? `<h4>Peut s'ajouter dimanche soir</h4><div class="ledger-rows">${risks.map(row).join('')}</div>` : ''}
      <p class="note">Autres sources possibles : descentes (−8 après coup, mais elles ferment un établissement), commerçants furieux qui te dénoncent (+7), traîtres qui parlent (+18), événements. Une heat haute nourrit le dossier fédéral chaque semaine (+1 dès 40, +2 dès 55, +5 dès 75, +10 dès 90).</p>
      ${lh ? `<h4>Semaine dernière : ${lh.from} → ${lh.to} (${lh.to - lh.from >= 0 ? '+' : ''}${lh.to - lh.from})</h4>
        ${lh.lines ? `<div class="ledger-rows">${lh.lines.map((l) => row({ ...l, sure: true })).join('')}</div>` : ''}
        ${lastLines.length ? `<ul class="log">${lastLines.map((e) => `<li class="tone-${e.tone}">${esc(e.text)}</li>`).join('')}</ul>` : ''}
        ${lh.from + (lh.lines ?? []).reduce((a, l) => a + l.value, 0) !== lh.to ? '<p class="note">La heat est bornée entre 0 et 100 : l\'excédent est perdu.</p>' : ''}` : ''}
    </div>` : ''}
  </div>`;
}

function tabs() {
  const injured = s.members.filter((m) => m.status !== 'actif').length;
  const items: [Tab, string, string][] = [
    ['quartier', 'Quartier', ''],
    ['don', s.regency ? 'Régence' : donOf(s)?.sex === 'f' ? 'La Donna' : 'Le Don', donOf(s)?.points ? `+${donOf(s)!.points}` : s.spouse?.pregnantWeeks ? '♥' : ''],
    ['business', 'Alcool', salesPlan(s).shortage ? '!' : ''],
    ['coups', 'Coups', String(s.jobs.length)],
    ['famille', 'Famille', `${activeMembers(s).length}${injured ? `+${injured}` : ''}`],
    ['villes', 'Villes', CT.openCities(s).some((c) => !CT.holder(s, c.id)) ? '!' : String(CT.openCities(s).length)],
    ['commission', 'Commission', s.commission ? `${Math.max(0, s.commission.next - s.week)} sem.` : ''],
    ['corruption', 'Réseau', s.trial ? 'procès' : (s.dossier ?? 0) >= 70 ? '!' : ''],
    ['rivaux', 'Rivaux', s.rivals.some((r) => r.war) ? 'guerre' : ''],
    ['journal', 'Journal', ''],
  ];
  return `<nav class="tabs" role="tablist">${items
    .map(([id, label, count]) => `<button class="tab ${ui.tab === id ? 'active' : ''}" role="tab" aria-selected="${ui.tab === id}" data-act="tab" data-id="${id}">${label}${count ? `<span class="count">${count}</span>` : ''}</button>`)
    .join('')}</nav>`;
}

function panel() {
  switch (ui.tab) {
    case 'quartier': return districtPanel(district(s, ui.selected));
    case 'don': return donPanel();
    case 'business': return businessPanel();
    case 'coups': return jobsPanel();
    case 'famille': return familyPanel();
    case 'villes': return citiesPanel();
    case 'commission': return commissionPanel();
    case 'corruption': return corruptionPanel();
    case 'rivaux': return rivalsPanel();
    case 'journal': return journalPanel();
  }
}

// ---------- Quartier ----------
function districtPanel(d: District) {
  const policeTxt = ['', 'faible', 'moyenne', 'forte'][d.police];
  let html = `
    <h3>${esc(d.name)}</h3>
    <p class="flavor">${esc(d.flavor)}</p>
    <div class="facts">
      <span>Tenu par <b class="owner-name" style="color:${ownerColor(d.owner)}">${esc(ownerName(d.owner))}</b></span>
      <span>Protection <b class="dirty">${money(d.owner === 'player' ? racketOf(d) : d.racket)}</b>/sem.</span>
      <span>Clientèle ×${d.wealth.toLocaleString('fr-FR')}</span>
      <span>Police ${policeTxt}</span>
      <span>Défense <b>${defenseOf(s, d)}</b></span>
      <span>Emplacements <b>${d.businesses.length}/${d.slots}</b></span>
      ${(d.unrest ?? 0) > 0 && d.owner === 'player' ? `<span class="danger">Pacification : revenus ÷2 encore ${d.unrest} sem.</span>` : ''}
    </div>`;

  if (d.owner === 'player') html += ownDistrict(d);
  else if (!CT.isOpen(s, CT.cityOf(d))) html += `<h4>Établissements</h4>${businessList(d, false)}
      <p class="note">La famille n'est pas encore implantée à ${esc(CT.cityName(CT.cityOf(d)))}. ${d.gate ? 'C’est ici que tes hommes peuvent débarquer.' : ''}</p>
      <button class="btn primary" data-act="tab" data-id="villes">Prendre pied à ${esc(CT.cityName(CT.cityOf(d)))}</button>`;
  else if (isAttackable(s, d)) html += attackPanel(d);
  else {
    html += `<h4>Établissements</h4>${businessList(d, false)}
      <p class="note">Hors de portée : prends d'abord un quartier voisin pour pouvoir attaquer.</p>`;
  }
  return html;
}

function businessList(d: District, mine: boolean) {
  if (!d.businesses.length) return `<p class="empty">Aucun établissement.</p>`;
  const plan = mine ? salesPlan(s) : null;
  let speakIdx = 0;
  const outlets = plan ? plan.outlets.filter((o) => o.districtId === d.id) : [];
  let tripIdx = 0;
  return `<div class="rows">${d.businesses
    .map((b) => {
      const def = BUSINESSES[b.kind];
      let inc = '';
      if (b.kind === 'speakeasy' || b.kind === 'tripot') {
        const list = outlets.filter((o) => o.kind === b.kind);
        const o = list[b.kind === 'speakeasy' ? speakIdx++ : tripIdx++];
        const sold = o ? GOOD_ORDER.reduce((t, g) => t + (o.sold[g] ?? 0), 0) : 0;
        inc = `<span class="dirty">${money(def.income)} fixe${mine ? ` + ${sold}/${o?.demand ?? 0} caisses vendues (${money(o?.revenue ?? 0)})` : ''}</span>`;
      } else if (b.kind === 'distillerie') inc = `<span class="dirty">+${b.kind === 'distillerie' && d.id === 'docks' ? 50 : 25} caisses de gin / sem.</span>`;
      else if (def.illegal) inc = `<span class="dirty">+${money(def.income)} sale</span>`;
      else inc = `<span class="clean">blanchit ${money(def.launder)}${def.income ? `, +${money(def.income)} propre` : ''}${def.storage ? `, +${def.storage} caisses de stockage` : ''}</span>`;
      return `<div class="row"><div class="grow">${def.name}<small>${inc}</small></div>
        ${mine ? `<button class="btn small" data-act="sell" data-id="${b.id}">Revendre ${money(def.cost * 0.4)}</button>` : ''}</div>`;
    })
    .join('')}</div>`;
}

function ownDistrict(d: District) {
  const men = membersIn(s, d.id);
  const reserve = activeMembers(s).filter((m) => m.assignment !== d.id && CT.memberCity(m) === CT.cityOf(d));
  const full = d.businesses.length >= d.slots;
  const builds = (Object.keys(BUSINESSES) as BusinessKind[])
    .map((k) => {
      const def = BUSINESSES[k];
      const can = !full && (def.currency === 'dirty' ? s.dirty : s.clean) >= def.cost;
      return `<button class="build" data-act="build" data-id="${k}" ${can ? '' : 'disabled'}>
        <b>${def.name}</b><span>${def.desc}</span>
        <span class="num ${def.currency}">${money(def.cost)} ${def.currency === 'dirty' ? 'sale' : 'propre'}</span></button>`;
    })
    .join('');
  const sat = satisfaction(d);
  const tariffs = (Object.keys(TARIFFS) as Tariff[]).map((k) =>
    `<button class="btn small ${d.tariff === k ? 'on' : ''}" data-act="tariff" data-id="${k}" aria-pressed="${d.tariff === k}">${TARIFFS[k].name} ×${TARIFFS[k].mult.toLocaleString('fr-FR')}</button>`).join('');
  return `
    <h4>Les commerçants · <span style="color:${moodTone(sat)}">${moodLabel(sat)} (${sat}/100)</span></h4>
    <div class="rows">${d.shops.map((x) => `
      <div class="row"><div class="grow">${esc(x.owner)}<small>${esc(x.trade)}</small></div>
        <div class="mood-meter" role="meter" aria-valuenow="${x.satisfaction}" aria-valuemin="0" aria-valuemax="100" aria-label="Satisfaction de ${esc(x.owner)}"><i style="width:${x.satisfaction}%;background:${moodTone(x.satisfaction)}"></i></div></div>`).join('')}
    </div>
    <div class="launder" role="group" aria-label="Tarif de protection">
      <span>Tarif de protection</span><span class="seg">${tariffs}</span>
    </div>
    <p class="note">Bas : +5 satisfaction/sem. · Normal : +1 · Élevé : −5. Sous 30, ils cachent leur argent (protection ×0,6), attirent les descentes et finissent par te dénoncer. À 70 et plus, ils te couvrent face aux Prohis.</p>
    <h4>Établissements</h4>
    ${businessList(d, true)}
    <h4>Ouvrir un établissement ${full ? '<span class="muted">(quartier plein)</span>' : ''}</h4>
    <div class="build-grid">${builds}</div>
    <h4>Hommes postés ici</h4>
    ${men.length ? `<div class="rows">${men.map((m) => `<div class="row"><div class="grow">${esc(m.name)} « ${esc(m.nickname)} »${m.rank === 'capo' ? ' <span class="muted">(capo, +20 % revenus)</span>' : ''}<small>Force ${m.force} · Loyauté ${m.loyalty} · ${busyLabel(m)}</small></div>
      <button class="btn small" data-act="assign" data-id="${m.id}" data-to="">Rappeler</button></div>`).join('')}</div>`
      : `<p class="empty">Personne ne garde ce quartier. Une famille rivale pourrait le prendre facilement.</p>`}
    ${reserve.length ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <select data-act="assign-select" aria-label="Poster un homme">
        <option value="">Poster un homme ici…</option>
        ${reserve.map((m) => `<option value="${m.id}">${esc(m.nickname)} (F${m.force}) — ${m.assignment ? esc(district(s, m.assignment).name) : 'réserve'}</option>`).join('')}
      </select></div>` : ''}
    <h4>Police du quartier</h4>
    <div class="row"><div class="grow">${d.bribedCop ? 'Le sergent du secteur est dans ta poche.' : 'Le sergent du secteur ne te connaît pas encore.'}
      <small>Descentes ×0,3 et heat des commerces illégaux divisée par 2 · ${money(COP_BRIBE)} propre/sem.</small></div>
      <button class="btn small" data-act="cop" data-id="${d.id}">${d.bribedCop ? 'Arrêter de payer' : 'Acheter le sergent'}</button></div>`;
}

function attackPanel(d: District) {
  const order = s.orders.find((o) => o.districtId === d.id);
  const r = d.owner !== 'neutral' ? rival(s, d.owner) : undefined;
  if (r && r.truceWeeks > 0) {
    return `<h4>Établissements</h4>${businessList(d, false)}<p class="note">Trêve en cours avec ${esc(r.name)} : encore ${r.truceWeeks} semaine(s).</p>`;
  }
  if (r && r.alliance) {
    return `<h4>Établissements</h4>${businessList(d, false)}<p class="note">${esc(r.name)} est ton allié. Romps l'alliance dans l'onglet Rivaux pour pouvoir attaquer.</p>`;
  }
  const avail = activeMembers(s).filter((m) => CT.memberCity(m) === CT.cityOf(d));
  if (order && !ui.attackers.size) order.memberIds.forEach((id) => ui.attackers.add(id));
  const ids = [...ui.attackers].filter((id) => avail.some((m) => m.id === id && !((m.fatigue ?? 0) > 0)));
  const power = attackPower(s, ids);
  const def = defenseOf(s, d);
  const p = winChance(power, def);
  const tone = oddsTone(p);
  const verdict = !ids.length ? 'Choisis tes hommes.' : p >= 0.7 ? 'Favorable' : p >= 0.4 ? 'Risqué' : 'Suicidaire';
  return `
    <h4>Établissements à saisir</h4>${businessList(d, false)}
    <h4>Préparer un assaut</h4>
    ${avail.length ? avail.map((m) => {
      const tired = (m.fatigue ?? 0) > 0;
      return `
      <label class="check"><input type="checkbox" data-act="pick" data-id="${m.id}" ${ui.attackers.has(m.id) && !tired ? 'checked' : ''} ${tired ? 'disabled' : ''}>
        <span>${m.isDon ? '<b class="donmark">Le Don</b> ' : ''}${esc(m.nickname)} <span class="muted">· F${m.force}${m.rank === 'capo' ? '+2' : ''}${traitHint(m, 'assault')} · ${busyLabel(m)}</span></span></label>`;
    }).join('')
      : `<p class="empty">Aucun homme disponible à ${esc(CT.cityName(CT.cityOf(d)))}. Envoie des renforts depuis l'onglet Villes.</p>`}
    ${CM.truceActive(s) ? '<p class="note danger">Trêve générale de la Commission en cours : attaquer te coûtera 5 de respect et 15 de relation avec chaque famille.</p>' : ''}
    <div class="odds" style="--odds:${tone}">
      Puissance <b class="num">${power}</b> contre défense <b class="num">${def}</b> ·
      <b style="color:${tone}">${verdict}${ids.length ? ` (${pct(p)})` : ''}</b>
      <div class="note">Chaque camp tire un multiplicateur entre ×0,75 et ×1,25 ; le pourcentage est exact. Un quartier conquis ne peut pas être repris la même nuit. Les hommes engagés ne défendent pas leur quartier cette semaine. Un assaut fait monter la heat de ${5 + d.police * 2}${r ? ` et dégrade ta relation avec ${esc(r.name)}` : ''}.</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn primary" data-act="attack" data-id="${d.id}" ${ids.length ? '' : 'disabled'}>${order ? "Modifier l'assaut" : "Ordonner l'assaut"}</button>
      ${order ? `<button class="btn" data-act="cancel-attack" data-id="${d.id}">Annuler l'assaut</button>` : ''}
    </div>`;
}

// ---------- Alcool ----------
function trendArrow(g: Good) {
  const t = s.marketTrend[g];
  if (t > 0.03) return '<span class="up" title="Les prix montent">▲</span>';
  if (t < -0.03) return '<span class="down" title="Les prix baissent">▼</span>';
  return '<span class="muted" title="Stable">■</span>';
}

function businessPanel() {
  const cap = storageCap(s);
  const total = stockTotal(s);
  const pending = pendingCrates(s);
  const room = B.freeRoom(s);
  const plan = salesPlan(s);
  const speak = owned(s).reduce((t, d) => t + d.businesses.filter((b) => b.kind === 'speakeasy').length, 0);
  const demand = speak * SPEAKEASY_DEMAND + plan.outlets.filter((o) => o.kind === 'tripot').length * 5;
  const bestRetail = (g: Good) => {
    const ds = owned(s).filter((d) => d.businesses.some((b) => b.kind === 'speakeasy'));
    return ds.length ? Math.max(...ds.map((d) => retailPrice(d, g))) : GOODS[g].retail;
  };
  const risk = (e: Escort) => B.shipmentRisk(s, e);
  const rows = GOOD_ORDER.map((g) => {
    const pr = B.prices(s, g);
    const q = ui.qty[g];
    const costS = B.smuggleCost(s, g, q, ui.escort);
    const costW = pr.wholesaler * q;
    return `
    <div class="good">
      <div class="good-head">
        <b>${GOODS[g].name}</b> ${trendArrow(g)}
        <span class="muted">en stock <b class="num">${s.stock[g]}</b></span>
        <span class="muted">au comptoir jusqu'à <b class="num dirty">${money(bestRetail(g))}</b></span>
      </div>
      <div class="good-prices">
        <span>Lac <b class="num">${money(pr.smuggle)}</b></span>
        <span>Grossiste <b class="num">${money(pr.wholesaler)}</b></span>
        <span>Revente en gros <b class="num">${money(pr.resale)}</b></span>
      </div>
      <div class="good-acts">
        <label class="qty"><span class="sr">Quantité de ${GOODS[g].plural}</span>
          <button class="btn small" data-act="qty" data-id="${g}" data-d="-5" aria-label="Moins 5">−</button>
          <input id="qty-${g}" type="number" inputmode="numeric" min="0" step="5" value="${q}" data-act="qty-input" data-id="${g}">
          <button class="btn small" data-act="qty" data-id="${g}" data-d="5" aria-label="Plus 5">+</button>
        </label>
        ${room <= 0
          ? `<button class="btn small" disabled>Entrepôt plein</button>`
          : q > room
          ? `<button class="btn small" data-act="fit" data-id="${g}">Seulement ${room} caisses de place : ajuster</button>`
          : `<button class="btn small" data-act="smuggle" data-id="${g}" ${q > 0 && s.dirty + s.clean >= costS ? '' : 'disabled'}>Commander par le lac · ${money(costS)}</button>
        <button class="btn small" data-act="wholesale" data-id="${g}" ${q > 0 && s.dirty + s.clean >= costW ? '' : 'disabled'}>Acheter au grossiste · ${money(costW)}</button>`}
        <button class="btn small" data-act="resale" data-id="${g}" ${s.stock[g] > 0 ? '' : 'disabled'}>Revendre ${Math.min(q, s.stock[g])} · +${money(pr.resale * Math.min(q, s.stock[g]))}</button>
      </div>
    </div>`;
  }).join('');
  const escorts = (Object.keys(ESCORTS) as Escort[]).map((e) =>
    `<button class="btn small ${ui.escort === e ? 'on' : ''}" data-act="escort" data-id="${e}" aria-pressed="${ui.escort === e}">${ESCORTS[e].name}${ESCORTS[e].cost ? ` · ${money(ESCORTS[e].cost)}` : ''} · ${pct(risk(e))}</button>`).join('');
  return `
    <h3>L'alcool</h3>
    <p class="flavor">Tes speakeasies vendent ce que tu leur fournis : jusqu'à ${SPEAKEASY_DEMAND} caisses chacun par semaine, le whisky d'abord, puis le gin, puis la bière. Les beaux quartiers paient plus cher au verre.</p>
    <div class="stockbar" role="meter" aria-valuenow="${total + pending}" aria-valuemin="0" aria-valuemax="${cap}" aria-label="Stock">
      <i class="s-whisky" style="width:${(s.stock.whisky / cap) * 100}%"></i><i class="s-gin" style="width:${(s.stock.gin / cap) * 100}%"></i><i class="s-biere" style="width:${(s.stock.biere / cap) * 100}%"></i><i class="s-pending" style="width:${(pending / cap) * 100}%"></i>
    </div>
    <div class="facts">
      <span>Stock <b>${total}/${cap}</b> caisses</span>
      ${pending ? `<span>En route <b>${pending}</b></span>` : ''}
      <span>Demande des bars <b>${demand}</b>/sem.</span>
      ${plan.produced ? `<span>Distilleries <b>+${plan.produced}</b> gin/sem.</span>` : ''}
      ${plan.shortage ? `<span class="danger">Il manquera ${plan.shortage} caisses</span>` : `<span class="clean">Bars approvisionnés</span>`}
    </div>
    <h4>Livraison par le lac</h4>
    <p class="note">Moins cher, livré pendant la nuit (vendable la semaine prochaine). Risque d'interception par les Prohis ou d'embuscade d'un rival, selon la heat${s.safeRouteWeeks ? ` · route du garagiste encore ${s.safeRouteWeeks} sem. (risque ÷2)` : ''}.</p>
    <div class="launder" role="group" aria-label="Escorte"><span>Escorte</span><span class="seg wrap">${escorts}</span></div>
    ${s.shipments.length ? `<div class="rows">${s.shipments.map((x) => `
      <div class="row"><div class="grow">${x.qty} caisses de ${GOODS[x.good].plural}<small>${ESCORTS[x.escort].name} · ${pct(B.shipmentRisk(s, x.escort))} de risque · payé ${money(x.paid)}</small></div>
        <button class="btn small" data-act="cancel-ship" data-id="${x.id}">Annuler</button></div>`).join('')}</div>` : ''}
    <h4>Le marché</h4>
    ${rows}
    <p class="note">Grossiste : immédiat et sans risque, mais 50 % plus cher que le lac. Revente en gros : pour profiter des pénuries. Les achats se paient en sale, puis en propre si besoin. Place libre : ${room} caisses.</p>`;
}

// ---------- Coups ----------
function rewardText(j: Job) {
  const w = j.reward;
  const r = j.rivalId ? rival(s, j.rivalId) : undefined;
  const parts: string[] = [];
  if (w.dirty) parts.push(`<span class="dirty">+${money(w.dirty)} sale</span>`);
  if (w.clean) parts.push(`<span class="clean">+${money(w.clean)} propre</span>`);
  if (w.crates) parts.push(`+${w.crates.qty} caisses de ${GOODS[w.crates.good].plural}`);
  if (w.respect) parts.push(`+${w.respect} respect`);
  if (w.heat) parts.push(w.heat < 0 ? `<span class="clean">${w.heat} heat</span>` : `<span class="danger">+${w.heat} heat</span>`);
  if (w.rivalHit && r) parts.push(`${esc(r.name)} −${w.rivalHit} force`);
  if (w.burnBusiness && r) parts.push(`un établissement de ${esc(r.name)} détruit`);
  return parts.join(' · ');
}

function jobsPanel() {
  if (!s.jobs.length) return `<h3>Les coups</h3><p class="empty">Aucune opportunité cette semaine. Reviens après la fin de semaine.</p>`;
  const jobCity = s.jobs[0]?.city ?? 'corrano';
  const avail = activeMembers(s).filter((m) => CT.memberCity(m) === jobCity);
  return `
    <h3>Les coups de la semaine · ${esc(CT.cityName(jobCity))}</h3>
    <p class="flavor">Les opportunités viennent au Don, dans la ville où il se trouve. Seuls tes hommes présents à ${esc(CT.cityName(jobCity))} peuvent y participer. Choisis une équipe : la force ou la discrétion décide. Les hommes engagés ne gardent pas leur quartier cette semaine.</p>
    ${s.jobs.map((j) => {
      const skill = teamSkill(s, j);
      const p = jobChance(s, j);
      const r = j.rivalId ? rival(s, j.rivalId) : undefined;
      const missing = Math.max(0, j.minMen - j.team.length);
      return `
      <article class="job ${j.team.length ? 'staffed' : ''}">
        <div class="job-head"><b>${esc(j.title)}</b><span class="tag">${j.stat === 'force' ? 'Force' : 'Discrétion'} · difficulté ${j.difficulty}</span></div>
        <p>${esc(j.text)}</p>
        <div class="job-meta">
          <span>Butin : ${rewardText(j)}</span>
          <span>Si ça rate : <span class="danger">+${j.failHeat} heat</span>, ${j.danger >= 0.5 ? 'gros risque' : j.danger >= 0.35 ? 'risque' : 'petit risque'} de ${j.stat === 'discretion' ? 'prison' : 'blessures'}${r && j.relationHit ? ` · relation avec ${esc(r.name)} −${j.relationHit}` : ''}</span>
        </div>
        <div class="team">
          ${avail.map((m) => {
            const tired = (m.fatigue ?? 0) > 0;
            const inThis = j.team.includes(m.id);
            const stat = j.stat === 'force' ? m.force : m.discretion;
            return `<label class="check"><input type="checkbox" data-act="job-pick" data-job="${j.id}" data-id="${m.id}" ${inThis ? 'checked' : ''} ${tired ? 'disabled' : ''}>
              <span>${m.isDon ? '<b class="donmark">Le Don</b> ' : ''}${esc(m.nickname)} <span class="muted">· ${j.stat === 'force' ? 'F' : 'D'}${stat}${m.rank === 'capo' ? '+2' : ''}${traitHint(m, j.stat)}${inThis ? '' : ' · ' + busyLabel(m)}</span></span></label>`;
          }).join('')}
        </div>
        <div class="odds" style="--odds:${j.team.length ? oddsTone(p) : 'var(--line)'}">
          ${j.team.length
            ? missing ? `Il manque ${missing} homme${missing > 1 ? 's' : ''} (minimum ${j.minMen}).`
              : `Équipe <b class="num">${skill}</b> contre difficulté <b class="num">${j.difficulty}</b> · <b style="color:${oddsTone(p)}">${pct(p)}</b>`
            : `Il faut au moins ${j.minMen} homme${j.minMen > 1 ? 's' : ''}.`}
        </div>
      </article>`;
    }).join('')}`;
}

// ---------- Portraits ----------
function memberPortrait(m: Member, size: number) {
  const age = m.birthWeek !== undefined ? ageOf(s, m) : 24 + (m.level ?? 0) * 3 + (seedOf(m.name) % 12);
  const rank = m.isDon ? 'boss' : m.rank === 'capo' ? 'capo' : 'soldat';
  return portrait({ seed: m.seed ?? seedOf(m.name, m.id), size, age, sex: m.sex, scars: m.scars ?? 0, rank });
}

// ---------- Le Don et sa famille ----------
function donPanel() {
  const d = donOf(s);
  if (!d) {
    const reg = s.regency;
    const heir = reg ? (s.children ?? []).find((c) => c.id === reg.childId) : undefined;
    return `<h3>La régence</h3>
      <p class="flavor">Le Don n'est plus. ${reg ? `${esc(reg.regentName)} tient la famille en attendant que ${heir ? esc(heir.name) : "l'héritier"} ait ${F.ADULT_AGE} ans.` : ''}</p>
      ${heir ? `<div class="kid">${portrait({ seed: heir.seed, size: 64, age: F.childAge(s, heir), sex: heir.sex, rank: 'child' })}<div><b>${esc(heir.name)}</b><small>${Math.floor(F.childAge(s, heir))} ans · prend la tête de la famille dans ${Math.max(0, Math.ceil((F.ADULT_AGE - F.childAge(s, heir)) * 6))} semaines</small></div></div>` : ''}
      <p class="note">Pendant la régence, les talents du Don ne s'appliquent plus. Un régent peu loyal (sous 50) peut tenter de garder le pouvoir : surveille sa loyauté dans l'onglet Famille.</p>
      ${dynastyBlock()}`;
  }
  const age = Math.floor(ageOf(s, d));
  const lvl = d.level ?? 0;
  const need = donXpForNext(lvl);
  const stats = (Object.keys(DON_STATS) as DonStat[]).map((k) => {
    const v = (d[k] ?? 5) as number;
    return `<div class="dstat"><span title="${esc(DON_STATS[k].desc)}">${DON_STATS[k].name}</span><b class="num">${v}</b>
      <button class="btn small" data-act="don-stat" data-id="${k}" ${d.points && v < STAT_CAP ? '' : 'disabled'} aria-label="+1 ${DON_STATS[k].name}">+1</button>
      <small>${esc(DON_STATS[k].desc)}</small></div>`;
  }).join('');
  const branches = (Object.keys(BRANCHES) as Branch[]).map((b) => `
    <div class="branch"><h4>${BRANCHES[b].name}</h4><p class="note">${BRANCHES[b].desc}</p>
      ${TALENTS.filter((t) => t.branch === b).map((t) => {
        const owned = d.talents?.includes(t.id);
        const can = canLearn(d, t) && !!d.points;
        return `<button class="talent ${owned ? 'owned' : can ? 'can' : ''}" data-act="talent" data-id="${t.id}" ${owned || !can ? 'disabled' : ''} aria-pressed="${!!owned}">
          <span class="tier">${t.tier}</span><b>${t.name}</b><small>${t.desc}</small></button>`;
      }).join('')}
    </div>`).join('');
  return `
    <div class="don-card">
      ${memberPortrait(d, 104)}
      <div>
        <h3>${esc(d.name)}</h3>
        <p class="flavor">« ${esc(d.nickname)} » · ${age} ans · niveau ${lvl}${d.status !== 'actif' ? ` · <span class="danger">${d.status === 'blessé' ? 'blessé' : 'en prison'} (${d.statusWeeks} sem.)</span>` : ` · ${busyLabel(d)}`}</p>
        <div class="xp wide" role="meter" aria-valuenow="${d.xp ?? 0}" aria-valuemin="0" aria-valuemax="${need}" aria-label="Expérience du Don"><i style="width:${((d.xp ?? 0) / need) * 100}%"></i></div>
        <p class="note">${d.xp ?? 0}/${need} XP · ${d.points ? `<b class="clean">${d.points} point${d.points > 1 ? 's' : ''} à placer</b>` : 'chaque niveau donne 1 point'} · le Don gagne le double d'expérience sur le terrain.</p>
      </div>
    </div>
    <div class="dstats">${stats}</div>
    <div class="box-note">
      <b>Au front.</b> Ajoute le Don à un assaut ou à un coup comme n'importe quel homme : +${2} par homme à ses côtés en assaut (+1 sur un coup), +2 respect si l'assaut réussit. Mais il est vu sur les lieux (+5 heat), peut être blessé, arrêté ou tué. S'il meurt sans héritier, la partie est finie.
    </div>
    <h4>Talents</h4>
    <div class="branches">${branches}</div>
    ${familyBlock()}
    ${dynastyBlock()}
    ${endingBlock()}`;
}

function familyBlock() {
  const sp = s.spouse;
  const c = s.courtship;
  const kids = s.children ?? [];
  const heir = F.currentHeir(s);
  const meter = (v: number, label: string) => `<div class="mood-meter wide" role="meter" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}"><i style="width:${v}%;background:${v < 30 ? 'var(--oxblood-bright)' : v < 60 ? 'var(--brass)' : 'var(--good)'}"></i></div>`;
  const sTraits = (ts: F.SpouseTraitId[]) => `<span class="traits">${ts.map((x) => `<span class="trait" title="${esc(F.SPOUSE_TRAITS[x].desc)}">${F.SPOUSE_TRAITS[x].name}<small>${F.SPOUSE_TRAITS[x].desc}</small></span>`).join('')}</span>`;
  let spouseHtml = '';
  if (sp) {
    spouseHtml = `<div class="person">${portrait({ seed: sp.seed, size: 72, age: ageOf(s, sp), sex: 'f' })}<div class="grow">
      <b>${esc(sp.name)}</b> <span class="muted">· ${esc(F.ORIGINS[sp.origin].label(s, sp.rivalId))} · ${Math.floor(ageOf(s, sp))} ans</span>
      ${sTraits(sp.traits)}
      <div class="aff">Affection ${sp.affection}/100 ${meter(sp.affection, 'Affection')}</div>
      ${sp.pregnantWeeks ? `<p class="clean">Enceinte : naissance dans ${sp.pregnantWeeks} semaine${sp.pregnantWeeks > 1 ? 's' : ''}.</p>` : ''}
      <div class="diplo">
        <button class="btn small" data-act="spouse" data-id="soiree" ${sp.lastGift !== s.week && s.clean >= F.EVENING_COST ? '' : 'disabled'}>Soirée à l'opéra · ${money(F.EVENING_COST)} · +8</button>
        <button class="btn small" data-act="spouse" data-id="bijou" ${sp.lastGift !== s.week && s.clean >= F.GIFT_COST ? '' : 'disabled'}>Collier de perles · ${money(F.GIFT_COST)} · +20</button>
      </div>
      <p class="note">Son affection baisse avec la heat, les blessures du Don et ton absence (sans attention depuis 4 semaines). Plus elle est haute, plus vous aurez vite des enfants. À 5, elle part.</p>
    </div></div>`;
  } else if (c) {
    spouseHtml = `<div class="person">${portrait({ seed: c.seed, size: 72, age: ageOf(s, c), sex: 'f' })}<div class="grow">
      <b>${esc(c.name)}</b> <span class="muted">· ${esc(F.ORIGINS[c.origin].label(s, c.rivalId))}</span>
      ${sTraits(c.traits)}
      <div class="aff">Elle se laisse séduire : ${c.progress}/100 ${meter(c.progress, 'Séduction')}</div>
      <div class="diplo">
        <button class="btn small" data-act="court" data-id="diner" ${c.lastDate !== s.week && s.clean >= F.DATE_COST ? '' : 'disabled'}>Dîner aux chandelles · ${money(F.DATE_COST)}</button>
        <button class="btn small" data-act="court" data-id="cadeau" ${c.lastDate !== s.week && s.clean >= F.GIFT_COST ? '' : 'disabled'}>Un bijou · ${money(F.GIFT_COST)}</button>
        <button class="btn small primary" data-act="propose" ${c.progress >= 100 && s.clean >= F.WEDDING_COST ? '' : 'disabled'}>Demander sa main · ${money(F.WEDDING_COST)}</button>
        <button class="btn small danger" data-act="abandon">${ui.confirm === 'abandon' ? 'Confirmer' : 'Renoncer'}</button>
      </div>
      <p class="note">Une attention par semaine. Le Verbe du Don rend chaque rendez-vous plus efficace.${c.rivalId ? ' Ce mariage scellera une alliance avec sa famille.' : ''}</p>
    </div></div>`;
  } else {
    spouseHtml = `<p class="empty">Le Don n'est pas marié. Les rencontres arrivent au fil des semaines : une chanteuse, une héritière, la fille d'un commerçant… ou celle d'un Don rival qui veut une alliance.</p>`;
  }
  const kidsHtml = kids.length
    ? kids.map((k) => {
        const a = F.childAge(s, k);
        const member = k.memberId ? s.members.find((m) => m.id === k.memberId) : undefined;
        const isHeir = heir?.id === k.id;
        const sibling = k.generation < (s.generation ?? 1);
        return `<div class="kid ${isHeir ? 'heir' : ''}">${member ? memberPortrait(member, 56) : portrait({ seed: k.seed, size: 56, age: a, sex: k.sex, rank: 'child' })}<div class="grow">
          <b>${esc(k.name)}</b>${isHeir ? ' <span class="rank">Héritier' + (k.sex === 'f' ? 'e' : '') + '</span>' : ''}
          <small>${sibling ? (k.sex === 'f' ? 'Sœur' : 'Frère') + ' du Don · ' : ''}${Math.floor(a)} ans · ${F.childStage(a)}${k.education.length ? ' · ' + k.education.map((e) => F.EDUCATION[e].name).join(', ') : ''}${member ? ' · dans les affaires (onglet Famille)' : a < F.ADULT_AGE ? ` · rejoint la famille dans ${Math.ceil((F.ADULT_AGE - a) * 6)} sem.` : ''}</small>
          ${isHeir ? '' : `<button class="btn small" data-act="heir" data-id="${k.id}">Désigner comme héritier</button>`}
        </div></div>`;
      }).join('')
    : `<p class="empty">Pas encore d'enfant. ${sp ? 'Avec de l’affection, ça viendra.' : 'Il faudra d’abord trouver une épouse.'} Sans héritier, la mort du Don met fin à la partie.</p>`;
  return `
    <h4>La famille du Don</h4>
    ${spouseHtml}
    <h4>Les enfants${heir ? ` · héritier : ${esc(heir.name.split(' ')[0])}` : ''}</h4>
    <div class="kids">${kidsHtml}</div>
    <p class="note">1 an passe toutes les 6 semaines. À ${F.ADULT_AGE} ans, l'enfant rejoint les affaires et gagne de l'expérience. Si le Don meurt, l'héritier prend sa place avec la moitié de ses talents ; s'il est encore mineur, un régent tient la famille.</p>`;
}

function dynastyBlock() {
  const dy = s.dynasty ?? [];
  if (!dy.length) return '';
  return `<h4>La dynastie</h4><ul class="log">${dy.map((p) => `<li class="tone-neutral"><span class="w">S${p.fromWeek}–${p.toWeek}</span>${esc(p.name)} « ${esc(p.nickname)} » ${esc(p.cause)}</li>`).join('')}</ul>`;
}

// ---------- Famille ----------
function familyPanel() {
  const mine = owned(s);
  const memberRow = (m: Member) => {
    const statusTxt = m.status === 'actif' ? '' : `<span class="status">${m.status === 'blessé' ? 'Blessé' : 'En prison'} · ${m.statusWeeks} sem.</span>`;
    const solid = m.force + m.discretion >= 12 || (m.level ?? 0) >= 3;
    const canPromote = m.rank === 'soldat' && m.loyalty >= 60 && solid && s.dirty >= PROMOTE_COST;
    const missing = m.rank !== 'soldat' ? '' : [
      m.loyalty < 60 ? `loyauté ${m.loyalty}/60` : '',
      !solid ? `force + discrétion ${m.force + m.discretion}/12 ou niveau ${m.level ?? 0}/3` : '',
      s.dirty < PROMOTE_COST ? `${money(PROMOTE_COST)} sales` : '',
    ].filter(Boolean).join(', ');
    const lvl = m.level ?? 0;
    const need = xpForNext(lvl);
    const fam = m.isDon || m.isChild;
    return `
    <div class="man">
      <div class="who with-face">${memberPortrait(m, 46)}<div>
        <b>${esc(m.name)}</b> <span class="nick">« ${esc(m.nickname)} »</span><span class="rank">${m.isDon ? (m.sex === 'f' ? 'La Donna' : 'Le Don') : m.isChild ? `${m.sex === 'f' ? 'Fille' : 'Fils'} du Don · niv. ${lvl}` : `${rankTitle(m)} · niv. ${lvl}`}</span>
        <div class="xp" role="meter" aria-valuenow="${m.xp ?? 0}" aria-valuemin="0" aria-valuemax="${need}" aria-label="Expérience de ${esc(m.nickname)}" title="${lvl >= 8 ? 'Niveau maximum' : `${m.xp ?? 0}/${need} XP avant le niveau ${lvl + 1}`}"><i style="width:${lvl >= 8 ? 100 : ((m.xp ?? 0) / need) * 100}%"></i></div>
        ${traitChips(m.traits, true)}
        <div class="attrs">
          <span>Force <b>${m.force}</b></span><span>Discrétion <b>${m.discretion}</b></span>
          <span class="${m.loyalty < 35 ? 'loy-low' : ''}">Loyauté <b>${m.loyalty}</b></span>
          <span>Salaire <b class="dirty">${money(m.salary)}</b></span>
        </div>
        ${statusTxt}${m.status === 'actif' ? `<span class="muted" style="font-size:12px">${busyLabel(m)}</span>` : ''}
      </div></div>
      <div></div>
      <div class="acts">
        <select data-act="assign-member" data-id="${m.id}" aria-label="Affectation de ${esc(m.nickname)}" ${m.status !== 'actif' ? 'disabled' : ''}>
          <option value="" ${!m.assignment ? 'selected' : ''}>Réserve</option>
          ${mine.filter((d) => CT.cityOf(d) === CT.memberCity(m)).map((d) => `<option value="${d.id}" ${m.assignment === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
        ${CT.openCities(s).length > 1 ? `<select data-act="travel" data-id="${m.id}" aria-label="Envoyer ${esc(m.nickname)} dans une autre ville" ${m.status === 'prison' ? 'disabled' : ''}>
          <option value="">À ${esc(CT.cityName(CT.memberCity(m)))}</option>
          ${CT.openCities(s).filter((c) => c.id !== CT.memberCity(m)).map((c) => `<option value="${c.id}">Envoyer à ${esc(c.name)} · ${money(CT.TRAVEL_COST)}</option>`).join('')}
        </select>` : ''}
        ${fam ? '' : `<button class="btn small" data-act="bonus" data-id="${m.id}" ${s.dirty >= 300 ? '' : 'disabled'}>Prime 300 $</button>`}
        ${m.isDon ? `<button class="btn small" data-act="tab" data-id="don">Fiche du Don</button>` : ''}
        ${m.rank === 'soldat' ? `<button class="btn small" data-act="promote" data-id="${m.id}" ${canPromote ? '' : 'disabled'}>Faire capo · ${money(PROMOTE_COST)}</button>${missing ? `<span class="muted need">Il manque : ${missing}</span>` : ''}` : ''}
        ${m.status === 'prison' ? `<button class="btn small" data-act="free" data-id="${m.id}" ${s.favors ? '' : 'disabled'}>Faire libérer · 1 faveur</button>` : ''}
        ${fam ? '' : `<button class="btn small danger" data-act="fire" data-id="${m.id}">${ui.confirm === `fire-${m.id}` ? 'Confirmer le renvoi' : 'Renvoyer'}</button>`}
      </div>
    </div>`;
  };
  return `
    <h3>La famille</h3>
    <p class="flavor">Chaque assaut, défense ou coup donne de l'expérience. À chaque niveau, +1 dans la stat qu'il utilise le plus ; tous les deux niveaux, un nouveau trait. Un homme mal payé finit par parler : sous 25 de loyauté, il peut trahir.</p>
    ${s.members.length ? s.members.map(memberRow).join('') : '<p class="empty">Plus personne. Recrute avant que la ville ne l\'apprenne.</p>'}
    <h4>Recrues de la semaine <span class="muted">· nouvelle liste chaque lundi</span></h4>
    <div class="rows">${s.recruits.map((r) => {
      const cost = recruitCost(s, r);
      return `
      <div class="row recruit">${portrait({ seed: seedOf(r.name, r.id), size: 40, age: 22 + (r.level ?? 0) * 4, rank: 'soldat' })}<div class="grow">${esc(r.name)} « ${esc(r.nickname)} »${r.level ? ` <span class="rank">${r.level >= 3 ? 'Homme de confiance' : 'Soldat'} · niv. ${r.level}</span>` : ''}
        <small>Force ${r.force} · Discrétion ${r.discretion} · Loyauté ${r.loyalty} · Salaire ${money(r.salary)}</small>
        ${traitChips(r.traits, true)}</div>
        <button class="btn small" data-act="hire" data-id="${r.id}" ${s.dirty + s.clean >= cost ? '' : 'disabled'} title="Payé en sale d'abord, puis en propre">Recruter ${money(cost)}${cost < r.cost ? ' (recruteur)' : ''}</button></div>`;
    }).join('')}
    </div>`;
}


// ---------- Villes ----------
function citiesPanel() {
  const allowed = CT.citiesAllowed(s);
  const n = CT.openCities(s).length;
  const nextTier = CT.nextCityTier(s);
  const don = donOf(s);
  return `
    <h3>Les villes</h3>
    <p class="flavor">Le Don ne peut être qu'à un endroit à la fois. Ailleurs, un capo gouverneur tient la ville en ton nom ; sans lui, les hommes se servent dans la caisse (revenus −30 %) et leur loyauté s'effrite. Un gouverneur peu loyal peut faire sécession.</p>
    <div class="facts"><span>Villes <b>${n}/${allowed}</b> autorisées par ton rang</span>${nextTier && n >= allowed ? `<span>Prochaine ville : <b>${esc(nextTier.name)}</b> (${nextTier.min} respect)</span>` : ''}<span>Voyage <b>${money(CT.TRAVEL_COST)}</b>/homme, 1 semaine sans assaut</span></div>
    ${CITIES.map((c) => cityCard(c.id, allowed > n, don)).join('')}`;
}

function cityCard(id: string, canOpen: boolean, don: Member | undefined) {
  const c = cityDef(id);
  const open = CT.isOpen(s, id);
  const men = CT.membersInCity(s, id);
  const h = CT.holder(s, id);
  const gov = CT.governor(s, id);
  const candidates = men.filter((m) => CT.canGovern(m));
  const rivals = CT.rivalsIn(s, id).filter((r) => r.alive);
  let body = '';
  if (open) {
    body = `
      <div class="facts">
        <span>Quartiers <b>${CT.ownedIn(s, id).length}/${CT.cityDistricts(s, id).length}</b></span>
        <span>Hommes sur place <b>${men.filter((m) => m.status === 'actif').length}</b></span>
        <span>${h === 'don' ? '<b class="clean">Le Don est ici</b>' : h === 'gouverneur' ? `Gouverneur <b>${esc(gov!.nickname)}</b> · loyauté ${gov!.loyalty}` : '<b class="danger">Personne ne tient la ville : revenus −30 %</b>'}</span>
      </div>
      <div class="diplo">
        ${don && CT.memberCity(don) !== id ? `<button class="btn small primary" data-act="travel-don" data-id="${id}" ${don.status === 'prison' ? 'disabled' : ''}>Le Don part pour ${esc(c.name)} · ${money(CT.TRAVEL_COST)}</button>` : ''}
        <select data-act="governor" data-id="${id}" aria-label="Gouverneur de ${esc(c.name)}">
          <option value="">${candidates.length ? 'Pas de gouverneur' : 'Aucun capo sur place'}</option>
          ${candidates.map((m) => `<option value="${m.id}" ${gov?.id === m.id ? 'selected' : ''}>Gouverneur : ${esc(m.nickname)} (loyauté ${m.loyalty})</option>`).join('')}
        </select>
        <button class="btn small" data-act="city" data-id="${id}">Voir la carte</button>
      </div>`;
  } else {
    const gate = s.districts.find((d) => d.id === c.gate);
    const gateFree = gate?.owner === 'neutral';
    const team = [...ui.expedition].map((x) => s.members.find((m) => m.id === x)).filter((m): m is Member => !!m && m.status === 'actif');
    const cost = CT.openCost(s, id, team.length);
    const leader = team.some((m) => m.isDon || CT.canGovern(m));
    const pool = activeMembers(s).filter((m) => !(m.isChild && !CT.canGovern(m)));
    body = `
      <p class="note">${rivals.length ? `Tenue par ${rivals.map((r) => `<b style="color:${r.color}">${esc(r.name)}</b>`).join(', ')}.` : 'Plus aucune famille ne tient la ville.'} On débarque à ${esc(gate?.name ?? 'la gare')}, achetée ${money(c.openCost)}, avec une équipe menée par un capo qui deviendra gouverneur.</p>
      ${!canOpen ? `<p class="note danger">Ton rang ne permet pas une ville de plus${CT.nextCityTier(s) ? ` : il faut être ${esc(CT.nextCityTier(s)!.name)} (${CT.nextCityTier(s)!.min} respect)` : ''}.</p>`
        : !gateFree ? `<p class="note danger">${esc(gate?.name ?? 'La gare')} est déjà tenue : impossible d'y débarquer.</p>`
        : `<details class="expedition" ${ui.expedition.size ? 'open' : ''}><summary>Préparer l'expédition</summary>
          ${pool.map((m) => `<label class="check"><input type="checkbox" data-act="exp-pick" data-id="${m.id}" ${ui.expedition.has(m.id) ? 'checked' : ''}>
            <span>${m.isDon ? '<b class="donmark">Le Don</b> ' : ''}${esc(m.nickname)} <span class="muted">· F${m.force} · ${m.rank === 'capo' ? 'capo' : rankTitle(m)} · ${busyLabel(m)}</span></span></label>`).join('')}
          <div class="diplo"><button class="btn primary" data-act="open-city" data-id="${id}" ${team.length && leader && s.dirty + s.clean >= cost ? '' : 'disabled'}>Prendre pied à ${esc(c.name)} · ${money(cost)}</button>
          ${!leader ? '<span class="muted need">Il faut un capo ou le Don dans l’équipe.</span>' : ''}</div>
        </details>`}`;
  }
  return `<article class="city-card ${open ? 'open' : ''} ${ui.city === id ? 'viewed' : ''}">
    <div class="job-head"><b>${esc(c.name)}</b><span class="tag">${esc(c.kind)}</span></div>
    <p class="flavor">${esc(c.desc)}</p>
    <p class="note">Atout : ${esc(c.perk)}.</p>
    ${body}
  </article>`;
}

// ---------- Commission ----------
function commissionPanel() {
  const c = CM.commission(s);
  const tier = tierOf(s.respect);
  const m = c.motion;
  const ladder = TIERS.map((x, i) => `<li class="${i === tier ? 'now' : i < tier ? 'done' : ''}"><b>${esc(x.name)}</b> <span class="muted">${x.min} respect</span><small>${esc(x.perk)}</small></li>`).join('');
  const weeks = Math.max(0, c.next - s.week);
  const f = m ? CM.tallyForecast(s) : null;
  const interest = m ? CM.playerInterest(s, m) : 'pour';
  const dons = CM.living(s).map((r) => {
    const promised = c.bought[r.id] as CM.Stance | undefined;
    const st: CM.Stance = promised ?? CM.stance(s, r);
    const target = m?.target === r.id;
    const pr = CM.reliability(s, r);
    const tone = st === interest ? 'clean' : st === 'indécis' ? 'muted' : 'danger';
    return `<div class="row"><div class="grow"><span style="color:${r.color}">${esc(r.boss)}</span> <span class="muted">· ${esc(CT.cityName(r.city))} · relation ${Math.round(r.relation)}</span>
      <small><b class="${tone}">${promised ? `promis ${promised}${c.pacts.includes(r.id) ? ' (pacte)' : ''} · tient parole à ${Math.round(pr * 100)} %` : st === 'indécis' ? `indécis · ${Math.round(CM.undecidedPour(s, r) * 100)} % pour` : st}</b></small></div>
      ${m && !promised && !target && !r.war && st !== interest ? `<button class="btn small" data-act="buy-vote" data-id="${r.id}" ${s.dirty >= CM.voteCost(r) ? '' : 'disabled'} title="Il tient parole à ${Math.round(pr * 100)} %">Acheter sa voix ${interest} · ${money(CM.voteCost(r))}</button>
        <button class="btn small" data-act="pact" data-id="${r.id}" ${r.relation >= CM.PACT_MIN_RELATION || r.alliance ? '' : 'disabled'} title="${CM.PACT_WEEKS} semaines de paix entre vous en échange de sa voix · relation ${CM.PACT_MIN_RELATION} requise">Pacte</button>` : ''}
    </div>`;
  }).join('');
  const props = c.chair ? CM.proposable(s) : [];
  return `
    <h3>La Commission des Dons</h3>
    <p class="flavor">Toutes les familles du pays se réunissent toutes les ${CM.MEETING_EVERY} semaines pour voter une motion. Une voix par famille ; à égalité, la motion est rejetée, sauf si le Capo dei Capi a voté pour. Les voix s'achètent et se promettent par pacte. Elles se trahissent aussi.</p>
    <div class="facts">
      <span>Ton rang <b>${esc(TIERS[tier].name)}</b></span>
      <span>${c.chair ? '<b class="clean">Capo dei Capi</b>' : c.seat ? '<b class="clean">Tu sièges à la Commission</b>' : `Pas de siège${tier < CM.SEAT_TIER ? ` · candidature à ${TIERS[CM.SEAT_TIER].min} respect` : ' · ta candidature viendra au vote'}`}</span>
      <span>Prochaine réunion <b>${weeks ? `dans ${weeks} sem.` : 'dimanche'}</b></span>
    </div>
    ${m ? `<article class="job staffed motion">
      <div class="job-head"><b>${esc(m.title)}</b><span class="tag">ton intérêt : ${interest}</span></div>
      <p>${esc(m.desc)}</p>
      <div class="odds" style="--odds:${f!.pour > f!.contre ? 'var(--good)' : 'var(--oxblood-bright)'}">Voix sûres : <b class="num">${f!.pour}</b> pour, <b class="num">${f!.contre}</b> contre, <b class="num">${f!.undecided}</b> indécis</div>
      ${c.seat ? `<div class="launder" role="group" aria-label="Ton vote"><span>Ta voix</span><span class="seg">
        ${(['pour', 'contre'] as const).map((v) => `<button class="btn small ${c.vote === v ? 'on' : ''}" data-act="vote" data-id="${v}" aria-pressed="${c.vote === v}">${v === 'pour' ? 'Pour' : 'Contre'}</button>`).join('')}
        <button class="btn small ${!c.vote ? 'on' : ''}" data-act="vote" data-id="" aria-pressed="${!c.vote}">Abstention</button></span></div>` : '<p class="note">Sans siège, tu ne votes pas : tu ne peux qu’acheter des voix.</p>'}
      ${c.chair && props.length ? `<label class="note">Ordre du jour du Capo dei Capi
        <select data-act="propose">${props.map((p, i) => `<option value="${i}" ${p.kind === m.kind && p.target === m.target ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>` : ''}
    </article>
    <h4>Les Dons</h4>
    <div class="rows">${dons || '<p class="empty">Plus aucune famille.</p>'}</div>` : '<p class="empty">Aucune motion à l’ordre du jour.</p>'}
    <h4>Paliers de puissance</h4>
    <ol class="ladder">${ladder}</ol>
    ${c.history.length ? `<h4>Derniers votes</h4><ul class="log">${c.history.map((h) => `<li class="tone-${h.passed ? 'good' : 'neutral'}"><span class="w">S${h.week}</span>${esc(h.title)} : ${h.passed ? 'adoptée' : 'rejetée'} (${h.pour}–${h.contre})${h.betrayed ? ` · trahi par ${esc(h.betrayed.join(', '))}` : ''}</li>`).join('')}</ul>` : ''}`;
}

// ---------- Fin choisie ----------
function endingBlock() {
  const lines = SC.scoreLines(s);
  const base = SC.scoreBase(s);
  const legit = SC.legitBlockers(s);
  const retireWhy = SC.retireBlocker(s);
  const best = SC.readBest();
  return `
    <h4>Quitter la scène</h4>
    <p class="note">Il n'y a pas de victoire automatique : c'est toi qui décides quand t'arrêter. Plus tu attends, plus l'empire vaut cher… et plus le procès, les balles et les traîtres se rapprochent. Mort ou condamné sans héritier : score ÷2.</p>
    <div class="facts"><span>Valeur de l'empire <b class="num">${base}</b> · ${esc(SC.scoreRank(base))}</span>${best ? `<span>Record <b class="num">${best}</b></span>` : ''}</div>
    <details class="score-detail"><summary>Détail du score</summary><div class="ledger-rows">${lines.map((l) => `<span>${esc(l.label)}</span><span class="num ${l.value < 0 ? 'danger' : 'clean'}">${l.value > 0 ? '+' : ''}${l.value}</span>`).join('')}</div></details>
    <div class="diplo">
      <button class="btn small" data-act="retire" ${retireWhy ? 'disabled' : ''} title="${esc(retireWhy ?? 'Score ×1')}">${ui.confirm === 'retire' ? 'Confirmer la retraite' : 'Prendre sa retraite · score ×1'}</button>
      <button class="btn small primary" data-act="legit" ${legit.length ? 'disabled' : ''}>${ui.confirm === 'legit' ? 'Confirmer : se ranger' : 'Se ranger, devenir légitime · score ×1,5'}</button>
    </div>
    ${legit.length ? `<p class="note">La légitimité demande encore : ${esc(legit.join(', '))}.</p>` : '<p class="note clean">Tout est prêt pour devenir respectable.</p>'}
    ${retireWhy ? `<p class="note">${esc(retireWhy)}</p>` : ''}`;
}

// ---------- Corruption ----------
function dossierBlock() {
  const d = Math.round(s.dossier ?? 0);
  const fc = dossierForecast(s);
  const net = fc.reduce((a, l) => a + l.value, 0);
  const ld = s.lastDossier;
  const row = (l: { label: string; value: number }) => `<span>${esc(l.label)}</span><span class="num ${l.value > 0 ? 'danger' : 'clean'}">${l.value > 0 ? '+' : ''}${l.value}</span>`;
  return `
  <div class="heat-detail fed">
    <div class="ledger-rows">${fc.length ? fc.map(row).join('') : '<span>Rien ne bouge cette semaine</span><span class="num">0</span>'}
      <span class="total">Cette semaine</span><span class="num total ${net > 0 ? 'danger' : 'clean'}">${net > 0 ? '+' : ''}${net}</span></div>
    <p class="note">Ce qui le fait monter aussi : le Don vu sur une opération (+4), un homme arrêté (+2), un traître qui parle (+10), un braquage de banque (+5), un scandale (+6). À 100, le Don est inculpé : procès en 3 étapes (jury, témoin, avocat), puis verdict.</p>
    ${ld && ld.lines.length ? `<h4>Semaine dernière : ${Math.round(ld.from)} → ${Math.round(ld.to)}</h4><div class="ledger-rows">${ld.lines.map(row).join('')}</div>` : ''}
    ${s.trial ? `<p class="danger">Procès en cours : ${s.trial.score} points de défense, ${Math.round(acquittalChance(s) * 100)} % d'acquittement à ce stade.</p>` : d >= 80 ? '<p class="danger">Inculpation imminente.</p>' : ''}
  </div>`;
}

function contactRow(c: NET.ContactDef) {
  const st = NET.contactState(s, c.id);
  const why = NET.blocker(s, c);
  const price = NET.priceOf(s, c.id);
  const status = st.burned ? '<span class="danger">Grillé</span>' : st.active ? '<span class="clean">À ta solde</span>' : why ? `<span class="muted">${esc(why)}</span>` : '<span class="muted">Disponible</span>';
  const useWhy = c.action ? NET.canUse(s, c.id) : null;
  return `<div class="person contact ${st.active ? 'on' : ''}">${portrait({ seed: seedOf(c.name), size: 44, age: 35 + (seedOf(c.name) % 25), sex: 'm', rank: 'soldat' })}<div class="grow">
    <b>${esc(c.name)}</b> <span class="muted">· ${esc(c.role)}</span> · ${status}
    <small>${esc(c.passive)}${c.retainer ? ` · ${money(price)} propres/sem.` : ''}</small>
    <div class="diplo">
      ${c.retainer ? (st.active
        ? `<button class="btn small" data-act="net-dismiss" data-id="${c.id}">Arrêter de payer</button>`
        : `<button class="btn small" data-act="net-hire" data-id="${c.id}" ${why ? 'disabled' : ''}>Le mettre dans ta poche · ${money(price)}/sem.</button>`) : ''}
      ${c.action ? `<button class="btn small" data-act="net-use" data-id="${c.id}" ${useWhy ? 'disabled' : ''} title="${esc(useWhy ?? c.action.desc)}">${esc(c.action.label)} · ${money(c.action.cost)}</button><span class="muted need">${esc(c.action.desc)}${useWhy && st.active ? ` · ${esc(useWhy)}` : ''}</span>` : ''}
    </div>
  </div></div>`;
}

function corruptionPanel() {
  const mine = owned(s);
  const milieux = Object.keys(NET.MILIEUX) as NET.Milieu[];
  return `
    <h3>Le réseau</h3>
    <p class="flavor">Des gens, pas des boutons. Ils se paient en argent propre chaque semaine, deviennent gourmands, peuvent être démasqués (heat et dossier qui explosent) ou rachetés par un rival qui te déteste. Le Verbe du Don fait baisser leurs tarifs.</p>
    <h4>Le dossier fédéral (${Math.round(s.dossier ?? 0)}/100)</h4>
    ${dossierBlock()}
    <h4>D'où vient ta heat (${s.heat}/100)</h4>
    ${heatBlock(true)}
    <h4>Les vieux amis</h4>
    <div class="rows">
      <div class="row"><div class="grow">Le juge Halloran
        <small>+15 % de chances d'acquittement au procès, et peines de tes hommes ÷2 · ${money(JUDGE_BRIBE)}/sem. · ${E.JUDGE_MIN_RESPECT} respect requis · introduit au procureur adjoint</small></div>
        <button class="btn small" data-act="judge">${s.judge ? 'Arrêter de payer' : 'Acheter le juge'}</button></div>
      <div class="row"><div class="grow">Le conseiller Doyle
        <small>−3 heat par semaine et +25 % de capacité de blanchiment · ${money(COUNCIL_BRIBE)}/sem. · ${E.COUNCIL_MIN_RESPECT} respect requis · introduit au maire</small></div>
        <button class="btn small" data-act="council">${s.councilman ? 'Arrêter de payer' : 'Acheter le conseiller'}</button></div>
      <div class="row"><div class="grow">Profil bas cette semaine
        <small>Ferme tous tes commerces illégaux : aucune vente ni revenu sale, −6 heat, descentes ×0,3</small></div>
        <button class="btn small" data-act="low">${s.lowProfile ? 'Rouvrir' : 'Faire profil bas'}</button></div>
      <div class="row"><div class="grow">Alibi des commerçants
        <small>Tes amis jurent que tu étais à la messe : −${ALIBI_HEAT} heat · ${s.favors} faveur${s.favors > 1 ? 's' : ''} en réserve</small></div>
        <button class="btn small" data-act="alibi" ${s.favors ? '' : 'disabled'}>Utiliser 1 faveur</button></div>
    </div>
    ${milieux.map((m) => `<h4>${NET.MILIEUX[m]}</h4>${NET.CONTACTS.filter((c) => c.milieu === m).map(contactRow).join('')}`).join('')}
    <h4>Sergents de quartier · ${money(COP_BRIBE)} propre/sem. chacun</h4>
    <div class="rows">${mine.map((d) => `
      <div class="row"><div class="grow">${esc(d.name)}<small>Police ${['', 'faible', 'moyenne', 'forte'][d.police]}</small></div>
        <button class="btn small" data-act="cop" data-id="${d.id}">${d.bribedCop ? 'Payé · arrêter' : 'Acheter'}</button></div>`).join('')}
    </div>`;
}

function objectivesBlock() {
  const list = s.objectives ?? [];
  if (!list.length) return '';
  return `<div class="contracts">
    <h3 class="feed-title">Contrats</h3>
    ${list.map((o) => {
      const p = objProgress(s, o);
      const left = o.deadline - s.week;
      return `<div class="contract">
        <div class="c-head"><b>${esc(o.title)}</b><span class="${left <= 2 ? 'danger' : 'muted'}">${left} sem.</span></div>
        <div class="xp wide"><i style="width:${Math.min(100, (p / o.goal) * 100)}%"></i></div>
        <small>${esc(o.giver)} · ${o.kind === 'dossier' ? `dossier à ${Math.round(s.dossier ?? 0)}` : `${p}/${o.goal}`} · récompense : ${objReward(o)}</small>
      </div>`;
    }).join('')}
  </div>`;
}

// ---------- Rivaux ----------
function relationMeter(r: RivalFamily) {
  const v = clamp(r.relation, -100, 100);
  const left = v < 0 ? 50 + v / 2 : 50;
  const width = Math.abs(v) / 2;
  const tone = r.war ? 'var(--oxblood-bright)' : v >= 0 ? 'var(--good)' : 'var(--oxblood)';
  return `<div class="rel" role="meter" aria-valuenow="${Math.round(v)}" aria-valuemin="-100" aria-valuemax="100" aria-label="Relation avec ${esc(r.name)}">
    <i style="left:${left}%;width:${width}%;background:${tone}"></i><b></b></div>`;
}

function rivalsPanel() {
  const max = Math.max(30, ...s.rivals.map((r) => r.strength));
  const myForce = D.playerForce(s);
  return `
    <h3>Les familles</h3>
    <p class="flavor">Ta force de frappe : <b>${myForce}</b>. Une relation haute les dissuade de t'attaquer ; une guerre double leur agressivité.</p>
    ${CITIES.map((c) => `<h4>${esc(c.name)}</h4>` + CT.rivalsIn(s, c.id).map((r) => {
      const terr = owned(s, r.id).map((d) => d.name).join(', ');
      if (!r.alive) return `<div class="rival"><div class="rival-name" style="color:${r.color}">${esc(r.name)} <span class="muted">· éliminée</span></div><div class="boss">${esc(r.boss)} a quitté la ville.</div></div>`;
      const cd = r.talkCooldown ? ` (${r.talkCooldown} sem.)` : '';
      return `<div class="rival">
        <div class="with-face">${portrait({ seed: seedOf(r.boss), size: 52, age: 40 + (seedOf(r.boss) % 25), rank: 'rival', scars: r.id === 'kilbride' || r.id === 'vasquez' ? 1 : 0 })}<div>
        <div class="rival-name" style="color:${r.color}">${esc(r.name)}</div>
        <div class="boss">${esc(r.boss)}</div></div></div>
        ${(r.bannedWeeks ?? 0) > 0 ? `<p class="note danger">Mise au ban par la Commission : encore ${r.bannedWeeks} sem.</p>` : ''}
        ${(r.traits ?? []).length ? `<span class="traits">${(r.traits ?? []).map((x) => `<span class="trait don" title="${esc(DON_TRAITS[x].desc)}">${esc(DON_TRAITS[x].name)}<small>${esc(DON_TRAITS[x].desc)}</small></span>`).join('')}</span>` : ''}
        <div class="facts" style="margin-top:6px">
          <span>Force <b>${Math.round(r.strength)}</b></span>
          <span>Relation <b>${Math.round(r.relation)}</b> · ${D.relationLabel(r)}</span>
          ${r.truceWeeks ? `<span>Trêve <b>${r.truceWeeks} sem.</b></span>` : ''}
          <span>Territoire : ${esc(terr || 'aucun')}</span>
        </div>
        <div class="meter"><i style="width:${clamp((r.strength / max) * 100, 4, 100)}%;background:${r.color}"></i></div>
        ${relationMeter(r)}
        <div class="diplo">
          ${r.war
            ? `<button class="btn small" data-act="peace" data-id="${r.id}" ${s.clean >= D.PEACE_COST ? '' : 'disabled'}>Négocier la paix · ${money(D.PEACE_COST)} propre</button>`
            : `<button class="btn small" data-act="sitdown" data-id="${r.id}" ${!r.talkCooldown && s.clean >= D.SIT_DOWN_COST ? '' : 'disabled'}>Dîner d'affaires · ${money(D.SIT_DOWN_COST)}${cd}</button>
               <button class="btn small" data-act="tribute" data-id="${r.id}" ${s.dirty >= D.TRIBUTE_PAY ? '' : 'disabled'}>Payer un tribut · ${money(D.TRIBUTE_PAY)}</button>
               <button class="btn small" data-act="demand" data-id="${r.id}" ${r.talkCooldown ? 'disabled' : ''} title="Réussit si ta force dépasse ${Math.ceil(r.strength * 1.15)}">Exiger un tribut${myForce > r.strength * 1.15 ? '' : ' (risqué)'}${cd}</button>
               ${r.alliance
                 ? `<button class="btn small danger" data-act="break" data-id="${r.id}">${ui.confirm === `break-${r.id}` ? 'Confirmer la rupture' : "Rompre l'alliance"}</button>`
                 : `<button class="btn small" data-act="ally" data-id="${r.id}" ${r.relation >= D.ALLIANCE_MIN ? '' : 'disabled'} title="Relation ${D.ALLIANCE_MIN} requise">Proposer une alliance</button>`}
               <button class="btn small danger" data-act="war" data-id="${r.id}">${ui.confirm === `war-${r.id}` ? 'Confirmer la guerre' : 'Déclarer la guerre'}</button>`}
        </div>
      </div>`;
    }).join('')).join('')}`;
}

// ---------- Journal ----------
function herald(h: { week: number; title: string; sub: string }, big = false) {
  return `<div class="herald ${big ? 'big' : ''}">
    <div class="masthead"><span>The Corrano Herald</span><span>${weekLabel(h.week)} · 2 cents</span></div>
    <div class="headline">${esc(h.title)}</div>
    <div class="dek">${esc(h.sub)}</div>
  </div>`;
}

function journalPanel() {
  return `<h3>Journal</h3>
    ${s.headlines.length ? `<h4>Les unes du Corrano Herald</h4><div class="heralds">${s.headlines.slice(0, 6).map((h) => herald(h)).join('')}</div>` : ''}
    <h4>Registre de la famille</h4>
    <ul class="log">${s.log.slice(0, 80).map((e) => `<li class="tone-${e.tone}"><span class="w">S${e.week}</span>${esc(e.text)}</li>`).join('')}</ul>`;
}

// ---------- Modales ----------
function modals() {
  if (s.status !== 'playing') {
    const e = s.ending;
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
      <h2>${esc(e?.title ?? (s.status === 'won' ? 'Capo dei Capi' : 'Fin de la famille'))}</h2>
      <p>${esc(s.endReason)}</p>
      ${e ? `<div class="final-score"><span class="muted">Score final</span><b class="num">${e.score}</b><span class="rank">${esc(e.rank)}</span>
        ${e.best !== undefined ? `<small>${e.score > e.best ? (e.best ? `Nouveau record (ancien : ${e.best})` : 'Premier record') : `Record : ${e.best}`}</small>` : ''}</div>
      <details class="score-detail"><summary>Détail</summary><div class="ledger-rows">${e.lines.map((l) => `<span>${esc(l.label)}</span><span class="num ${l.value < 0 ? 'danger' : 'clean'}">${l.value > 0 ? '+' : ''}${l.value}</span>`).join('')}
        <span class="total">Valeur de l'empire</span><span class="num total">${e.base}</span>
        <span>${esc(e.title)}</span><span class="num">×${e.mult.toLocaleString('fr-FR')}</span></div></details>` : ''}
      <div class="facts"><span>Semaines <b>${s.week - 1}</b></span><span>Combats gagnés <b>${s.stats.battlesWon}</b></span>
        <span>Perdus <b>${s.stats.battlesLost}</b></span><span>Coups réussis <b>${s.stats.jobsDone}</b></span>
        <span>Caisses vendues <b>${s.stats.cratesSold}</b></span><span>Descentes subies <b>${s.stats.raids}</b></span>
        <span>Blanchi <b>${money(s.stats.laundered)}</b></span></div>
      <div class="actions"><button class="btn primary" data-act="restart-confirm">Nouvelle partie</button></div>
    </div></div>`;
  }
  if (ui.showIntro) {
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="intro-t">
      <h2 id="intro-t">New Corrano, 1925</h2>
      <p>Ton oncle vient de tomber pour fraude fiscale. Il te laisse Little Sicily, un speakeasy, une cave de 45 caisses et quatre hommes. Les Castellano, les Irlandais de Kilbride et le clan Wolska se partagent le reste de la ville. Plus loin, Port Halloran, Mirage Springs et Washburn attendent leur heure.</p>
      ${SC.readBest() ? `<p class="muted">Ton record : ${SC.readBest()} points.</p>` : ''}
      <ul class="rules">${rulesList()}</ul>
      <label for="fam" class="muted" style="font-size:13px">Nom de ta famille</label>
      <input id="fam" type="text" value="${esc(s.familyName)}" maxlength="32">
      <div class="actions"><button class="btn primary" data-act="start">Prendre la relève</button></div>
    </div></div>`;
  }
  if (s.pendingEvent) {
    const ev = s.pendingEvent;
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
      <p class="muted when">${dayLabel(s.week, s.day ?? 0)} · l'horloge attend ta décision</p>
      <h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p>
      <div class="choices">${ev.choices.map((c) => `
        <button class="choice" data-act="choice" data-id="${c.effect}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b><span>${esc(c.hint)}</span></button>`).join('')}
      </div></div></div>`;
  }
  return '';
}

function rulesList() {
  return `
    <li><b>Le temps passe</b> : lance l'horloge, les jours défilent (×1, ×2, ×3). Tes ordres se jouent dans la nuit de dimanche. Les décisions importantes mettent le jeu en pause.</li>
    <li><b>Alcool</b> : tes speakeasies vendent les caisses que tu leur fournis. Achète par le lac (moins cher, risqué) ou au grossiste, et revends en gros quand les prix flambent.</li>
    <li><b>Coups</b> : chaque semaine, de nouvelles opportunités. Choisis l'équipe, la chance est affichée.</li>
    <li><b>Commerçants</b> : règle le tarif de protection. Rends-leur service, ils te devront des faveurs.</li>
    <li><b>Argent</b> : le <span class="dirty">sale</span> vient des rackets ; les façades le blanchissent en <span class="clean">propre</span>, qui paie flics, juges et élus.</li>
    <li><b>Heat et dossier fédéral</b> : la heat nourrit le dossier fédéral. À 100, le Don passe en procès. Ton réseau (journalistes, flics, juges) t'aide à tenir.</li>
    <li><b>Villes</b> : le respect ouvre d'autres villes (le port, la ville du jeu, la capitale). Le Don n'est que dans l'une ; un capo gouverneur tient les autres.</li>
    <li><b>Commission des Dons</b> : toutes les ${CM.MEETING_EVERY} semaines, les familles votent. Obtiens un siège, achète des voix, deviens Capo dei Capi. Au-delà de ${COALITION_AT} quartiers, elles peuvent te mettre au ban.</li>
    <li><b>La fin, c'est toi qui la choisis</b> : retraite ou légitimité (score ×1,5). Mort ou condamné sans héritier, le score est divisé par deux.</li>`;
}

// =====================================================================
// Interactions
// =====================================================================
function toast(msg: string) {
  ui.toast = msg;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = window.setTimeout(() => {
    ui.toast = '';
    render();
  }, 2800);
}

/** Double clic de confirmation (les dialogues natifs ne marchent pas partout) */
function confirmed(key: string) {
  if (ui.confirm === key) {
    ui.confirm = '';
    return true;
  }
  ui.confirm = key;
  clearTimeout(ui.confirmTimer);
  ui.confirmTimer = window.setTimeout(() => {
    ui.confirm = '';
    render();
  }, 3500);
  render();
  return false;
}

function run(r: E.ActionResult) {
  if (!r.ok) toast(r.error);
  render();
}

app.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const id = el.dataset.id ?? '';
  switch (el.dataset.act) {
    case 'select':
      if (ui.selected !== id) ui.attackers.clear();
      ui.selected = id;
      ui.tab = 'quartier';
      render();
      if (window.innerWidth <= 900) document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'tab':
      ui.tab = id as Tab;
      render();
      if (window.innerWidth <= 900 && el.classList.contains('linkish')) document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'build': return run(E.build(s, ui.selected, id as BusinessKind));
    case 'sell': return run(E.sellBusiness(s, ui.selected, Number(id)));
    case 'tariff': return run(setTariff(s, ui.selected, id as Tariff));
    case 'cop': return run(E.toggleCop(s, id));
    case 'judge': return run(E.toggleJudge(s));
    case 'council': return run(E.toggleCouncil(s));
    case 'low': return run(E.toggleLowProfile(s));
    case 'alibi': return run(favorAlibi(s));
    case 'free': return run(favorFreePrisoner(s, Number(id)));
    case 'launder': return run(E.setLaunderRate(s, Number(id)));
    case 'qty': {
      const g = id as Good;
      ui.qty[g] = clamp(ui.qty[g] + Number(el.dataset.d), 0, 500);
      return render();
    }
    case 'escort': ui.escort = id as Escort; return render();
    case 'heat-toggle': ui.heatOpen = !ui.heatOpen; return render();
    case 'fit': ui.qty[id as Good] = Math.max(0, B.freeRoom(s)); return render();
    case 'smuggle': return run(B.orderSmuggle(s, id as Good, ui.qty[id as Good], ui.escort));
    case 'wholesale': return run(B.buyWholesaler(s, id as Good, ui.qty[id as Good]));
    case 'resale': return run(B.sellResale(s, id as Good, ui.qty[id as Good]));
    case 'cancel-ship': return run(B.cancelShipment(s, Number(id)));
    case 'sitdown': return run(D.sitDown(s, id));
    case 'tribute': return run(D.payTribute(s, id));
    case 'demand': return run(D.demandTribute(s, id));
    case 'ally': return run(D.proposeAlliance(s, id));
    case 'break': if (confirmed(`break-${id}`)) run(D.breakAlliance(s, id)); return;
    case 'war': if (confirmed(`war-${id}`)) run(D.declareWar(s, id)); return;
    case 'peace': return run(D.makePeace(s, id));
    case 'don-stat': return run(spendPoint(s, id as DonStat));
    case 'talent': return run(learnTalent(s, id as TalentId));
    case 'spouse': return run(F.spouseAttention(s, id as 'soiree' | 'bijou'));
    case 'court': return run(F.dateCourtship(s, id as 'diner' | 'cadeau'));
    case 'propose': return run(F.propose(s));
    case 'abandon': if (confirmed('abandon')) run(F.abandonCourtship(s)); return;
    case 'heir': return run(F.setHeir(s, Number(id)));
    case 'net-hire': return run(NET.hire(s, id as NET.ContactId));
    case 'net-dismiss': return run(NET.dismiss(s, id as NET.ContactId));
    case 'net-use': return run(NET.useAction(s, id as NET.ContactId));
    case 'hire': return run(E.hire(s, Number(id)));
    case 'fire': if (confirmed(`fire-${id}`)) run(E.fire(s, Number(id))); return;
    case 'promote': return run(E.promote(s, Number(id)));
    case 'bonus': return run(E.payBonus(s, Number(id)));
    case 'assign': return run(E.assign(s, Number(id), el.dataset.to || null));
    case 'attack': {
      const r = E.orderAttack(s, id, [...ui.attackers].filter((x) => !((s.members.find((m) => m.id === x)?.fatigue ?? 0) > 0)));
      if (r.ok) ui.attackers.clear();
      return run(r);
    }
    case 'cancel-attack': ui.attackers.clear(); return run(E.cancelAttack(s, id));
    case 'city': {
      ui.city = id;
      if (CT.cityOf(district(s, ui.selected)) !== id) {
        ui.selected = CT.ownedIn(s, id)[0]?.id ?? cityDef(id).gate ?? CT.cityDistricts(s, id)[0].id;
        ui.attackers.clear();
      }
      if (el.classList.contains('btn')) ui.tab = 'quartier';
      return render();
    }
    case 'travel-don': {
      const don = donOf(s);
      if (!don) return;
      const r = CT.travel(s, don.id, id);
      if (r.ok) ui.city = id;
      return run(r);
    }
    case 'open-city': {
      const r = CT.openCity(s, id, [...ui.expedition]);
      if (r.ok) { ui.expedition.clear(); ui.city = id; ui.selected = cityDef(id).gate ?? ui.selected; }
      return run(r);
    }
    case 'buy-vote': {
      const m = s.commission?.motion;
      return run(m ? CM.buyVote(s, id, CM.playerInterest(s, m)) : { ok: false, error: 'Aucune motion.' });
    }
    case 'pact': {
      const m = s.commission?.motion;
      return run(m ? CM.makePact(s, id, CM.playerInterest(s, m)) : { ok: false, error: 'Aucune motion.' });
    }
    case 'vote': return run(CM.setVote(s, (id || null) as 'pour' | 'contre' | null));
    case 'retire': if (confirmed('retire')) run(SC.retire(s)); return;
    case 'legit': if (confirmed('legit')) run(SC.goLegit(s)); return;
    case 'end': return resolveWeek();
    case 'play': ui.playing = !ui.playing; return updateClock();
    case 'speed': s.speed = Number(id); save(s); return render();
    case 'choice': resolveEvent(s, id); return render();
    case 'help': ui.showIntro = true; return render();
    case 'start': {
      const name = (document.getElementById('fam') as HTMLInputElement | null)?.value.trim();
      if (name && name !== s.familyName) {
        s.familyName = name.startsWith('Famille') ? name : `Famille ${name}`;
        s.log.forEach((e) => (e.text = e.text.replace(/^Famille \S+/, s.familyName)));
        const don = donOf(s);
        if (don && s.week === 1) don.name = `${don.name.split(' ')[0]} ${s.familyName.replace(/^Famille /, '')}`;
      }
      ui.showIntro = false;
      ui.playing = true;
      return render();
    }
    case 'restart':
      if (!confirmed('restart')) return;
    // fallthrough
    case 'restart-confirm':
      clearSave();
      s = E.startGame();
      ui.selected = 'sicily';
      ui.city = 'corrano';
      ui.expedition.clear();
      ui.tab = 'quartier';
      ui.attackers.clear();
      ui.showIntro = true;
      ui.playing = false;
      ui.progress = 0;
      ui.feed = [];
      ui.shown = { dirty: s.dirty, clean: s.clean, respect: s.respect };
      return render();
  }
});

app.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLSelectElement;
  const act = el.dataset.act;
  if (act === 'pick') {
    const mid = Number(el.dataset.id);
    if ((el as HTMLInputElement).checked) ui.attackers.add(mid);
    else ui.attackers.delete(mid);
    render();
  } else if (act === 'job-pick') {
    run(toggleJobMember(s, Number(el.dataset.job), Number(el.dataset.id)));
  } else if (act === 'qty-input') {
    ui.qty[el.dataset.id as Good] = clamp(Math.round(Number(el.value) || 0), 0, 500);
    render();
  } else if (act === 'assign-select' && el.value) {
    run(E.assign(s, Number(el.value), ui.selected));
  } else if (act === 'assign-member') {
    run(E.assign(s, Number(el.dataset.id), el.value || null));
  } else if (act === 'travel' && el.value) {
    run(CT.travel(s, Number(el.dataset.id), el.value));
  } else if (act === 'governor') {
    run(CT.setGovernor(s, el.dataset.id!, el.value ? Number(el.value) : null));
  } else if (act === 'exp-pick') {
    const mid = Number(el.dataset.id);
    if ((el as HTMLInputElement).checked) ui.expedition.add(mid);
    else ui.expedition.delete(mid);
    render();
  } else if (act === 'propose') {
    run(CM.propose(s, Number(el.value)));
  }
});

document.addEventListener('keydown', (ev) => {
  const tag = (ev.target as HTMLElement).tagName;
  if (ev.key === ' ' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'BUTTON' && !blocked()) {
    ev.preventDefault();
    ui.playing = !ui.playing;
    updateClock();
  }
});
document.addEventListener('visibilitychange', () => updateClock());
requestAnimationFrame(tick);
