// Effets visuels : une couche fixe au-dessus de la page, jamais reconstruite par render().
import type { FxEvent } from './types';

let layer: HTMLDivElement | null = null;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function fxLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

const tile = (id: string) => document.querySelector<HTMLElement>(`.tile[data-id="${id}"]`);

function spawn(cls: string, x: number, y: number, life: number, html = '') {
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = html;
  fxLayer().appendChild(el);
  window.setTimeout(() => el.remove(), life);
  return el;
}

function pulseTile(id: string, cls: string, life: number) {
  const t = tile(id);
  if (!t) return;
  t.classList.remove(cls);
  void t.offsetWidth; // relance l'animation
  t.classList.add(cls);
  window.setTimeout(() => t.classList.remove(cls), life);
}

function gunfire(id: string) {
  const t = tile(id);
  if (!t) return;
  pulseTile(id, 'fx-shake', 700);
  if (reduced()) return;
  const r = t.getBoundingClientRect();
  for (let i = 0; i < 7; i++) {
    window.setTimeout(() => {
      const x = r.left + 12 + Math.random() * (r.width - 24);
      const y = r.top + 18 + Math.random() * (r.height - 30);
      spawn('flash', x, y, 260);
    }, i * 90 + Math.random() * 120);
  }
}

function floatText(id: string, text: string, cls: string) {
  const t = tile(id);
  if (!t || reduced()) return;
  const r = t.getBoundingClientRect();
  spawn(`float ${cls}`, r.left + r.width / 2, r.top + r.height / 2, 1400, text);
}

const TRUCK = `<svg viewBox="0 0 40 20" width="34" height="17"><rect x="1" y="4" width="24" height="11" rx="1" fill="#3a2a17" stroke="#c4a052"/><path d="M25 7h8l5 5v3H25z" fill="#2a2016" stroke="#c4a052"/><circle cx="9" cy="16" r="3" fill="#14110d" stroke="#c4a052"/><circle cx="31" cy="16" r="3" fill="#14110d" stroke="#c4a052"/></svg>`;

/** Camions de la nuit : du bord du lac (en haut à gauche de la carte) vers la cave de la famille */
export function trucks(count: number, toId: string, ms: number) {
  const map = document.querySelector<HTMLElement>('.map');
  const dest = tile(toId);
  if (!map || !dest || reduced() || !count) return [];
  const m = map.getBoundingClientRect();
  const d = dest.getBoundingClientRect();
  const els: HTMLElement[] = [];
  for (let i = 0; i < Math.min(3, count); i++) {
    const el = spawn('truck', m.left - 10, m.top + 20 + i * 22, ms + 400, TRUCK);
    el.style.transitionDuration = `${ms}ms`;
    el.style.transitionDelay = `${i * 140}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const dx = d.left + d.width / 2 - 17 - (m.left - 10);
      const dy = d.top + d.height / 2 - 8 - (m.top + 20 + i * 22);
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }));
    els.push(el);
  }
  return els;
}

export function playFx(events: FxEvent[], speed: number, homeId: string) {
  const gap = 260 / speed;
  let t = 0;
  for (const e of events) {
    const at = t;
    t += e.kind === 'sale' ? gap / 3 : gap;
    window.setTimeout(() => {
      switch (e.kind) {
        case 'battle': if (e.d) gunfire(e.d); break;
        case 'capture': if (e.d) { pulseTile(e.d, 'fx-capture', 1400); floatText(e.d, 'Pris !', 'good'); } break;
        case 'lost': if (e.d) { pulseTile(e.d, 'fx-lost', 1400); floatText(e.d, 'Perdu', 'bad'); } break;
        case 'raid': if (e.d) { pulseTile(e.d, 'fx-raid', 1800); floatText(e.d, 'Descente !', 'police'); } break;
        case 'sale': if (e.d) floatText(e.d, '$', 'money'); break;
        case 'ship': floatText(homeId, '+ caisses', 'money'); break;
        case 'intercept': pulseTile(homeId, 'fx-lost', 900); floatText(homeId, 'Camion intercepté', 'bad'); break;
        case 'job': pulseStat('.stat-dirty', 'fx-gain'); break;
        case 'jobfail': pulseStat('.heat', 'fx-loss'); break;
      }
    }, at);
  }
  return t;
}

function pulseStat(sel: string, cls: string) {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), 900);
}

/** Compteurs : défilement de l'ancienne valeur vers la nouvelle */
export function countUp(el: HTMLElement, from: number, to: number, format: (n: number) => string, ms = 700) {
  if (from === to || reduced()) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  el.classList.add(to > from ? 'rising' : 'falling');
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
    else window.setTimeout(() => el.classList.remove('rising', 'falling'), 300);
  };
  requestAnimationFrame(step);
}

/** La une du Herald glisse sur la table quelques secondes */
export function dropHerald(html: string, onOpen: () => void, ms = 6500) {
  fxLayer().querySelectorAll('.herald-drop').forEach((x) => x.remove());
  const el = document.createElement('button');
  el.className = 'herald-drop';
  el.type = 'button';
  el.setAttribute('aria-label', 'Ouvrir le journal');
  el.innerHTML = html;
  el.addEventListener('click', () => {
    el.remove();
    onOpen();
  });
  fxLayer().appendChild(el);
  window.setTimeout(() => el.classList.add('leaving'), ms);
  window.setTimeout(() => el.remove(), ms + 500);
}
