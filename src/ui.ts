import { BUSINESSES, COP_BRIBE, COUNCIL_BRIBE, JUDGE_BRIBE, LAUNDER_FEE, PROMOTE_COST, weekLabel } from './data';
import * as E from './engine';
import { resolveEvent } from './events';
import {
  activeMembers, attackPower, businessIncome, winChance, clamp, clearSave, committedToAttack, defenseOf, district, isAttackable, load, membersIn,
  newGame, owned, projection, rival, save,
} from './state';
import type { BusinessKind, District, GameState, Member, Owner } from './types';

type Tab = 'quartier' | 'famille' | 'corruption' | 'rivaux' | 'journal';

const ui = {
  tab: 'quartier' as Tab,
  selected: 'sicily',
  attackers: new Set<number>(),
  showReport: false,
  showIntro: false,
  toast: '',
  toastTimer: 0,
  confirm: '', // clé du bouton en attente de confirmation
  confirmTimer: 0,
};

let s: GameState = load() ?? newGame();
if (s.week === 1 && s.log.length <= 1) ui.showIntro = true;

const app = document.getElementById('app')!;

// =====================================================================
// Helpers d'affichage
// =====================================================================
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = E.fmt;

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
  blanchisserie: 'Lavoir', restaurant: 'Resto', garage: 'Garage',
};


// =====================================================================
// Rendu
// =====================================================================
export function render() {
  save(s);
  // mémorise le focus pour le restaurer après le re-rendu (navigation clavier)
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.act ? `[data-act="${active.dataset.act}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ''}` : null;
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
}

function topbar() {
  const heatTone = s.heat >= 70 ? 'danger' : '';
  return `
  <header class="topbar">
    <div class="brand">
      <h1>Omertà</h1>
      <span class="date">${esc(s.familyName)} · semaine ${s.week} · ${weekLabel(s.week)}</span>
    </div>
    <div class="ledger-strip">
      <div class="stat"><span class="k">Argent sale</span><span class="v dirty">${money(s.dirty)}</span></div>
      <div class="stat"><span class="k">Argent propre</span><span class="v clean">${money(s.clean)}</span></div>
      <div class="stat"><span class="k">Respect</span><span class="v">${s.respect}</span></div>
      <div class="stat heat"><span class="k">Heat <span class="num ${heatTone}">${s.heat}/100</span></span>
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
  const tiles = [...s.districts]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((d) => {
      const mine = d.owner === 'player';
      const target = isAttackable(s, d);
      const order = s.orders.find((o) => o.districtId === d.id);
      const men = mine ? membersIn(s, d.id).length : 0;
      const chips = d.businesses
        .map((b) => `<span class="chip ${BUSINESSES[b.kind].illegal ? 'illegal' : 'legal'}">${SHORT[b.kind]}</span>`)
        .join('');
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
        <span class="tfoot">${chips}${extra}</span>
        ${order ? '<span class="badge-attack">Assaut prévu</span>' : ''}
      </button>`;
    })
    .join('');
  const legend = [
    `<span><i style="background:var(--player)"></i>${esc(s.familyName)}</span>`,
    ...s.rivals.filter((r) => r.alive).map((r) => `<span><i style="background:${r.color}"></i>${esc(r.name)}</span>`),
    `<span><i style="background:var(--neutral)"></i>Indépendants</span>`,
  ].join('');
  return `
  <div class="map-wrap">
    <div class="map-title"><h2>New Corrano</h2><span class="muted" style="font-size:13px">${owned(s).length} / 9 quartiers</span></div>
    <div class="map">${tiles}</div>
    <div class="legend">${legend}</div>
  </div>`;
}

function weekCard() {
  const p = projection(s);
  const f = E.settle(s);
  const net = p.heatGain - 3 + (s.councilman ? -3 : 0) + (s.lowProfile ? -6 : 0);
  const blocked = !!s.pendingEvent || s.status !== 'playing';
  const rate = s.launderRate ?? 1;
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
  const row = (label: string, n: number, cls: string) =>
    n ? `<span>${label}</span><span class="num ${cls}">${sign(n)}</span>` : '';
  const rates: [number, string][] = [[1, 'Max'], [0.5, 'Moitié'], [0, 'Arrêt']];
  return `
  <div class="week-card">
    <h3>Prévisions de la semaine</h3>
    <div class="ledger-cols">
      <div>
        <h4 class="dirty">Argent sale</h4>
        <div class="ledger-rows">
          ${row('Rackets et commerces illégaux', f.dirtyIn, 'dirty')}
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
    ${f.unpaid ? `<p class="note danger">Il manquera ${money(f.unpaid)} pour payer tes hommes : leur loyauté va chuter.</p>` : ''}
    ${!f.bribesOk && f.bribes ? `<p class="note danger">Pas assez d'argent propre pour les enveloppes : tes contacts vont te lâcher.</p>` : ''}
    ${p.launderCap ? `<div class="launder" role="group" aria-label="Blanchiment">
      <span>Blanchiment <span class="muted">(capacité ${money(p.launderCap)})</span></span>
      <span class="seg">${rates.map(([r, l]) => `<button class="btn small ${rate === r ? 'on' : ''}" data-act="launder" data-id="${r}" aria-pressed="${rate === r}">${l}</button>`).join('')}</span>
    </div>` : ''}
    <div class="heat-line"><span>Variation de heat (hors combats)</span><span class="num ${net > 0 ? 'danger' : 'clean'}">${net > 0 ? '+' : ''}${net}</span></div>
    <div class="end-dock">
      <button class="btn primary end-turn" data-act="end" ${blocked ? 'disabled' : ''}>
        ${s.orders.length ? `Fin de semaine · ${s.orders.length} assaut${s.orders.length > 1 ? 's' : ''}` : 'Fin de semaine'}
      </button>
    </div>
  </div>`;
}

function tabs() {
  const injured = s.members.filter((m) => m.status !== 'actif').length;
  const items: [Tab, string, string][] = [
    ['quartier', 'Quartier', ''],
    ['famille', 'Famille', `${activeMembers(s).length}${injured ? `+${injured}` : ''}`],
    ['corruption', 'Corruption', ''],
    ['rivaux', 'Rivaux', ''],
    ['journal', 'Journal', ''],
  ];
  return `<nav class="tabs" role="tablist">${items
    .map(([id, label, count]) => `<button class="tab ${ui.tab === id ? 'active' : ''}" role="tab" aria-selected="${ui.tab === id}" data-act="tab" data-id="${id}">${label}${count ? `<span class="count">${count}</span>` : ''}</button>`)
    .join('')}</nav>`;
}

function panel() {
  switch (ui.tab) {
    case 'quartier': return districtPanel(district(s, ui.selected));
    case 'famille': return familyPanel();
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
      <span>Protection <b class="dirty">${money(d.racket)}</b>/sem.</span>
      <span>Police ${policeTxt}</span>
      <span>Défense <b>${defenseOf(s, d)}</b></span>
      <span>Emplacements <b>${d.businesses.length}/${d.slots}</b></span>
      ${(d.unrest ?? 0) > 0 && d.owner === 'player' ? `<span class="danger">Pacification : revenus ÷2 encore ${d.unrest} sem.</span>` : ''}
    </div>`;

  if (d.owner === 'player') html += ownDistrict(d);
  else if (isAttackable(s, d)) html += attackPanel(d);
  else {
    html += `<h4>Établissements</h4>${businessList(d, false)}
      <p class="note">Hors de portée : prends d'abord un quartier voisin pour pouvoir attaquer.</p>`;
  }
  return html;
}

function businessList(d: District, sellable: boolean) {
  if (!d.businesses.length) return `<p class="empty">Aucun établissement.</p>`;
  return `<div class="rows">${d.businesses
    .map((b) => {
      const def = BUSINESSES[b.kind];
      const inc = def.illegal ? `<span class="dirty">+${money(businessIncome(s, d, b.kind))} sale</span>` : `<span class="clean">blanchit ${money(def.launder)}${def.income ? `, +${money(def.income)} propre` : ''}</span>`;
      return `<div class="row"><div class="grow">${def.name}<small>${inc}</small></div>
        ${sellable ? `<button class="btn small" data-act="sell" data-id="${b.id}">Revendre ${money(def.cost * 0.4)}</button>` : ''}</div>`;
    })
    .join('')}</div>`;
}

function ownDistrict(d: District) {
  const men = membersIn(s, d.id);
  const reserve = activeMembers(s).filter((m) => m.assignment !== d.id);
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
  return `
    <h4>Établissements</h4>
    ${businessList(d, true)}
    <h4>Ouvrir un établissement ${full ? '<span class="muted">(quartier plein)</span>' : ''}</h4>
    <div class="build-grid">${builds}</div>
    <h4>Hommes postés ici</h4>
    ${men.length ? `<div class="rows">${men.map((m) => `<div class="row"><div class="grow">${esc(m.name)} « ${esc(m.nickname)} »${m.rank === 'capo' ? ' <span class="muted">(capo, +20 % revenus)</span>' : ''}<small>Force ${m.force} · Loyauté ${m.loyalty}${committedToAttack(s, m.id) ? ' · part à l\'assaut' : ''}</small></div>
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
  const avail = activeMembers(s);
  if (order && !ui.attackers.size) order.memberIds.forEach((id) => ui.attackers.add(id));
  const ids = [...ui.attackers].filter((id) => avail.some((m) => m.id === id && !((m.fatigue ?? 0) > 0)));
  const power = attackPower(s, ids);
  const def = defenseOf(s, d);
  const p = winChance(power, def);
  const tone = p >= 0.7 ? '#6ea866' : p >= 0.4 ? 'var(--brass)' : 'var(--oxblood-bright)';
  const verdict = !ids.length ? 'Choisis tes hommes.' : p >= 0.7 ? 'Favorable' : p >= 0.4 ? 'Risqué' : 'Suicidaire';
  return `
    <h4>Établissements à saisir</h4>${businessList(d, false)}
    <h4>Préparer un assaut</h4>
    ${avail.length ? avail.map((m) => {
      const tired = (m.fatigue ?? 0) > 0;
      return `
      <label class="check"><input type="checkbox" data-act="pick" data-id="${m.id}" ${ui.attackers.has(m.id) && !tired ? 'checked' : ''} ${tired ? 'disabled' : ''}>
        <span>${esc(m.nickname)} <span class="muted">· F${m.force}${m.rank === 'capo' ? '+2' : ''} · ${tired ? 'récupère du dernier assaut' : m.assignment ? 'garde ' + esc(district(s, m.assignment).name) : 'réserve'}</span></span></label>`;
    }).join('')
      : '<p class="empty">Aucun homme disponible.</p>'}
    <div class="odds" style="--odds:${tone}">
      Puissance <b class="num">${power}</b> contre défense <b class="num">${def}</b> ·
      <b style="color:${tone}">${verdict}${ids.length ? ` (${Math.round(p * 100)} %)` : ''}</b>
      <div class="note">Chaque camp tire un multiplicateur entre ×0,75 et ×1,25 ; le pourcentage est exact. Un quartier conquis ne peut pas être repris par un rival la même nuit. Les hommes engagés ne défendent pas leur quartier cette semaine. En cas de victoire, ceux de la réserve tiennent le nouveau quartier, les autres rentrent à leur poste. Un assaut fait monter la heat de ${5 + d.police * 2}.</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn primary" data-act="attack" data-id="${d.id}" ${ids.length ? '' : 'disabled'}>${order ? "Modifier l'assaut" : "Ordonner l'assaut"}</button>
      ${order ? `<button class="btn" data-act="cancel-attack" data-id="${d.id}">Annuler l'assaut</button>` : ''}
    </div>`;
}

// ---------- Famille ----------
function familyPanel() {
  const mine = owned(s);
  const memberRow = (m: Member) => {
    const statusTxt = m.status === 'actif' ? '' : `<span class="status">${m.status === 'blessé' ? 'Blessé' : 'En prison'} · ${m.statusWeeks} sem.</span>`;
    const canPromote = m.rank === 'soldat' && m.loyalty >= 60 && m.force + m.discretion >= 12 && s.dirty >= PROMOTE_COST;
    return `
    <div class="man">
      <div class="who">
        <b>${esc(m.name)}</b> <span class="nick">« ${esc(m.nickname)} »</span><span class="rank">${m.rank}</span>
        <div class="attrs">
          <span>Force <b>${m.force}</b></span><span>Discrétion <b>${m.discretion}</b></span>
          <span class="${m.loyalty < 35 ? 'loy-low' : ''}">Loyauté <b>${m.loyalty}</b></span>
          <span>Salaire <b class="dirty">${money(m.salary)}</b></span>
        </div>
        ${statusTxt}
      </div>
      <div></div>
      <div class="acts">
        <select data-act="assign-member" data-id="${m.id}" aria-label="Affectation de ${esc(m.nickname)}" ${m.status !== 'actif' ? 'disabled' : ''}>
          <option value="" ${!m.assignment ? 'selected' : ''}>Réserve</option>
          ${mine.map((d) => `<option value="${d.id}" ${m.assignment === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
        <button class="btn small" data-act="bonus" data-id="${m.id}" ${s.dirty >= 300 ? '' : 'disabled'}>Prime 300 $</button>
        ${m.rank === 'soldat' ? `<button class="btn small" data-act="promote" data-id="${m.id}" ${canPromote ? '' : 'disabled'} title="Loyauté ≥ 60, force + discrétion ≥ 12, ${PROMOTE_COST} $ sale">Faire capo</button>` : ''}
        <button class="btn small danger" data-act="fire" data-id="${m.id}">${ui.confirm === `fire-${m.id}` ? 'Confirmer le renvoi' : 'Renvoyer'}</button>
      </div>
    </div>`;
  };
  return `
    <h3>La famille</h3>
    <p class="flavor">Un homme mal payé, ou posté là où la police frappe, finit par parler. Sous 25 de loyauté, il peut trahir.</p>
    ${s.members.length ? s.members.map(memberRow).join('') : '<p class="empty">Plus personne. Recrute avant que la ville ne l\'apprenne.</p>'}
    <h4>Recrues disponibles cette semaine</h4>
    <div class="rows">${s.recruits.map((r) => `
      <div class="row"><div class="grow">${esc(r.name)} « ${esc(r.nickname)} »
        <small>Force ${r.force} · Discrétion ${r.discretion} · Loyauté ${r.loyalty} · Salaire ${money(r.salary)}</small></div>
        <button class="btn small" data-act="hire" data-id="${r.id}" ${s.dirty + s.clean >= r.cost ? '' : 'disabled'} title="Payé en sale d'abord, puis en propre">Recruter ${money(r.cost)}</button></div>`).join('')}
    </div>`;
}

// ---------- Corruption ----------
function corruptionPanel() {
  const mine = owned(s);
  return `
    <h3>Corruption</h3>
    <p class="flavor">Les enveloppes se paient en argent propre, chaque semaine. Si tu ne peux plus payer, tout le monde te lâche d'un coup.</p>
    <div class="rows">
      <div class="row"><div class="grow">Le juge Halloran
        <small>Annule ton inculpation une fois la heat au plus haut, et divise par deux les peines de tes hommes · ${money(JUDGE_BRIBE)}/sem. · ${E.JUDGE_MIN_RESPECT} respect requis</small></div>
        <button class="btn small" data-act="judge">${s.judge ? 'Arrêter de payer' : 'Acheter le juge'}</button></div>
      <div class="row"><div class="grow">Le conseiller Doyle
        <small>−3 heat par semaine et +25 % de capacité de blanchiment · ${money(COUNCIL_BRIBE)}/sem. · ${E.COUNCIL_MIN_RESPECT} respect requis</small></div>
        <button class="btn small" data-act="council">${s.councilman ? 'Arrêter de payer' : 'Acheter le conseiller'}</button></div>
      <div class="row"><div class="grow">Profil bas cette semaine
        <small>Ferme tous tes commerces illégaux : aucun revenu sale, −6 heat, descentes ×0,3</small></div>
        <button class="btn small" data-act="low">${s.lowProfile ? 'Rouvrir' : 'Faire profil bas'}</button></div>
    </div>
    <h4>Sergents de quartier · ${money(COP_BRIBE)} propre/sem. chacun</h4>
    <div class="rows">${mine.map((d) => `
      <div class="row"><div class="grow">${esc(d.name)}<small>Police ${['', 'faible', 'moyenne', 'forte'][d.police]}</small></div>
        <button class="btn small" data-act="cop" data-id="${d.id}">${d.bribedCop ? 'Payé · arrêter' : 'Acheter'}</button></div>`).join('')}
    </div>`;
}

// ---------- Rivaux ----------
function rivalsPanel() {
  const max = Math.max(30, ...s.rivals.map((r) => r.strength));
  return `
    <h3>Les familles</h3>
    ${s.rivals.map((r) => {
      const terr = owned(s, r.id).map((d) => d.name).join(', ');
      return `<div class="rival">
        <div class="rival-name" style="color:${r.color}">${esc(r.name)}${r.alive ? '' : ' <span class="muted">· éliminée</span>'}</div>
        <div class="boss">${esc(r.boss)}</div>
        ${r.alive ? `
        <div class="facts" style="margin-top:6px"><span>Force <b>${Math.round(r.strength)}</b></span><span>Territoire : ${esc(terr || 'aucun')}</span>${r.truceWeeks ? `<span>Trêve <b>${r.truceWeeks} sem.</b></span>` : ''}</div>
        <div class="meter"><i style="width:${clamp((r.strength / max) * 100, 4, 100)}%;background:${r.color}"></i></div>` : ''}
      </div>`;
    }).join('')}
    <p class="note">La défense d'un quartier rival dépend de la force de la famille, répartie sur ses territoires. Chaque victoire contre elle l'affaiblit.</p>`;
}

// ---------- Journal ----------
function journalPanel() {
  return `<h3>Journal</h3>
    <ul class="log">${s.log.slice(0, 80).map((e) => `<li class="tone-${e.tone}"><span class="w">S${e.week}</span>${esc(e.text)}</li>`).join('')}</ul>`;
}

// ---------- Modales ----------
function modals() {
  if (s.status !== 'playing') {
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
      <h2>${s.status === 'won' ? 'Capo dei Capi' : 'Fin de la famille'}</h2>
      <p>${esc(s.endReason)}</p>
      <div class="facts"><span>Semaines <b>${s.week - 1}</b></span><span>Combats gagnés <b>${s.stats.battlesWon}</b></span>
        <span>Perdus <b>${s.stats.battlesLost}</b></span><span>Descentes subies <b>${s.stats.raids}</b></span>
        <span>Blanchi <b>${money(s.stats.laundered)}</b></span></div>
      <div class="actions"><button class="btn primary" data-act="restart-confirm">Nouvelle partie</button></div>
    </div></div>`;
  }
  if (ui.showIntro) {
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="intro-t">
      <h2 id="intro-t">New Corrano, 1925</h2>
      <p>Ton oncle vient de tomber pour fraude fiscale. Il te laisse Little Sicily, un speakeasy et quatre hommes. Les Castellano, les Irlandais de Kilbride et le clan Wolska se partagent le reste de la ville.</p>
      <ul class="rules">${rulesList()}</ul>
      <label for="fam" class="muted" style="font-size:13px">Nom de ta famille</label>
      <input id="fam" type="text" value="${esc(s.familyName)}" maxlength="32">
      <div class="actions"><button class="btn primary" data-act="start">Prendre la relève</button></div>
    </div></div>`;
  }
  if (ui.showReport && s.lastReport.length) {
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
      <h2>Rapport · semaine ${s.week - 1}</h2>
      <ul class="log">${s.lastReport.map((e) => `<li class="tone-${e.tone}">${esc(e.text)}</li>`).join('')}</ul>
      <div class="actions"><button class="btn primary" data-act="close-report">${s.pendingEvent ? 'Suite' : 'Continuer'}</button></div>
    </div></div>`;
  }
  if (s.pendingEvent) {
    const ev = s.pendingEvent;
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
      <h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p>
      <div class="choices">${ev.choices.map((c) => `
        <button class="choice" data-act="choice" data-id="${c.effect}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b><span>${esc(c.hint)}</span></button>`).join('')}
      </div></div></div>`;
  }
  return '';
}

function rulesList() {
  return `
    <li>Une semaine par tour. Donne tes ordres, puis clique sur « Fin de semaine ».</li>
    <li>Les rackets rapportent de l'argent <span class="dirty">sale</span>. Tes façades (blanchisserie, restaurant, garage) le transforment en argent <span class="clean">propre</span>, le seul qui paie les flics, les juges et les façades.</li>
    <li>Poste tes hommes dans tes quartiers pour les défendre, et lance des assauts sur les quartiers voisins.</li>
    <li>La heat attire les descentes. Au-delà de 85, les fédéraux peuvent t'arrêter. Seul un juge acheté te sauve.</li>
    <li>Victoire : les 9 quartiers, ou 7 quartiers avec 100 de respect.</li>`;
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
  }, 2600);
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
  if (!el || el.tagName === 'SELECT' || (el as HTMLInputElement).type === 'checkbox') return;
  const id = el.dataset.id ?? '';
  switch (el.dataset.act) {
    case 'select':
      if (ui.selected !== id) ui.attackers.clear();
      ui.selected = id;
      ui.tab = 'quartier';
      render();
      if (window.innerWidth <= 900) document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'tab': ui.tab = id as Tab; return render();
    case 'build': return run(E.build(s, ui.selected, id as BusinessKind));
    case 'sell': return run(E.sellBusiness(s, ui.selected, Number(id)));
    case 'cop': return run(E.toggleCop(s, id));
    case 'judge': return run(E.toggleJudge(s));
    case 'council': return run(E.toggleCouncil(s));
    case 'low': return run(E.toggleLowProfile(s));
    case 'launder': return run(E.setLaunderRate(s, Number(id)));
    case 'hire': return run(E.hire(s, Number(id)));
    case 'fire': {
      if (confirmed(`fire-${id}`)) run(E.fire(s, Number(id)));
      return;
    }
    case 'promote': return run(E.promote(s, Number(id)));
    case 'bonus': return run(E.payBonus(s, Number(id)));
    case 'assign': return run(E.assign(s, Number(id), el.dataset.to || null));
    case 'attack': {
      const r = E.orderAttack(s, id, [...ui.attackers].filter((x) => !((s.members.find((m) => m.id === x)?.fatigue ?? 0) > 0)));
      if (r.ok) ui.attackers.clear();
      return run(r);
    }
    case 'cancel-attack': ui.attackers.clear(); return run(E.cancelAttack(s, id));
    case 'end': {
      E.endTurn(s);
      ui.attackers.clear();
      if (district(s, ui.selected).owner !== 'player' && !isAttackable(s, district(s, ui.selected))) ui.selected = owned(s)[0]?.id ?? ui.selected;
      ui.showReport = true;
      window.scrollTo({ top: 0 });
      return render();
    }
    case 'close-report': ui.showReport = false; return render();
    case 'choice': resolveEvent(s, id); return render();
    case 'help': ui.showIntro = true; return render();
    case 'start': {
      const name = (document.getElementById('fam') as HTMLInputElement | null)?.value.trim();
      if (name && name !== s.familyName) {
        s.familyName = name.startsWith('Famille') ? name : `Famille ${name}`;
        s.log.forEach((e) => (e.text = e.text.replace(/^Famille \w+/, s.familyName)));
      }
      ui.showIntro = false;
      return render();
    }
    case 'restart':
      if (!confirmed('restart')) return;
    // fallthrough
    case 'restart-confirm':
      clearSave();
      s = newGame();
      ui.selected = 'sicily';
      ui.tab = 'quartier';
      ui.attackers.clear();
      ui.showReport = false;
      ui.showIntro = true;
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
  } else if (act === 'assign-select' && el.value) {
    run(E.assign(s, Number(el.value), ui.selected));
  } else if (act === 'assign-member') {
    run(E.assign(s, Number(el.dataset.id), el.value || null));
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && ui.showReport) {
    ui.showReport = false;
    render();
  }
});
