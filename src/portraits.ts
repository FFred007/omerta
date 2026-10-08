// Portraits générés en SVG, façon gravure de journal : encre sur papier jauni.
// Déterministes (même graine = même visage) et évolutifs (âge, cicatrices, rang).

export interface PortraitOpts {
  seed: number;
  sex?: 'm' | 'f';
  age?: number; // années
  scars?: number;
  rank?: 'boss' | 'capo' | 'soldat' | 'rival' | 'child';
  size?: number;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = '#1f1a12';
const PAPER = '#e9e1cc';
const SKINS = ['#e8cfb0', '#dcb894', '#c99c74', '#b07f57', '#8a5e3c'];
const HAIRS = ['#1d1712', '#3a2a1c', '#5b3b22', '#7a5530', '#2b2b2b'];

export function portrait(o: PortraitOpts): string {
  const r = rng(o.seed);
  const pickR = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const size = o.size ?? 56;
  const female = o.sex === 'f';
  const age = o.age ?? 30;
  const child = o.rank === 'child' || age < 16;
  const skin = pickR(SKINS);
  const grey = age >= 60 ? 1 : age >= 48 ? 0.55 : 0;
  const baseHair = pickR(HAIRS);
  const hair = grey >= 1 ? '#cfc8b8' : grey > 0 ? '#8d8576' : baseHair;
  const faceW = child ? 30 : 30 + r() * 8;
  const faceH = child ? 34 : 38 + r() * 8;
  const cx = 50;
  const cy = child ? 52 : 47;
  const jaw = r();
  const brow = 0.5 + r() * 0.6;
  const scars = o.scars ?? 0;
  const boss = o.rank === 'boss' || o.rank === 'rival';
  const capo = o.rank === 'capo';
  const parts: string[] = [];

  // fond : médaillon de papier
  parts.push(`<circle cx="50" cy="50" r="49" fill="${PAPER}"/>`);
  parts.push(`<circle cx="50" cy="50" r="46" fill="none" stroke="${INK}" stroke-width="0.6" opacity="0.35"/>`);

  // buste
  const suit = boss ? '#222' : capo ? '#3b3127' : child ? '#5b6b7a' : pickR(['#4a4036', '#3d3a33', '#55493a']);
  if (female && !child) {
    parts.push(`<path d="M18 100 C22 80 36 74 50 74 C64 74 78 80 82 100 Z" fill="${pickR(['#6b2a2a', '#2d3d55', '#3e2f45', '#1f1f1f'])}"/>`);
    parts.push(`<path d="M38 77 Q50 86 62 77" fill="none" stroke="#f3eee0" stroke-width="2.2" stroke-dasharray="0.1 3.4" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="M14 100 C18 80 34 73 50 73 C66 73 82 80 86 100 Z" fill="${suit}"/>`);
    if (boss) for (let x = 20; x < 82; x += 6) parts.push(`<line x1="${x}" y1="80" x2="${x + 2}" y2="100" stroke="#777" stroke-width="0.5" opacity="0.6"/>`);
    // col et cravate / nœud papillon
    parts.push(`<path d="M41 74 L50 86 L59 74 Z" fill="#f2ede0"/>`);
    parts.push(boss && r() > 0.5
      ? `<path d="M45 79 L50 82 L55 79 L55 84 L50 82 L45 84 Z" fill="${INK}"/>`
      : `<path d="M48.5 78 L51.5 78 L53 92 L50 96 L47 92 Z" fill="${pickR(['#7a1f1f', '#1f2f4a', '#2a2a2a', '#5a4a1a'])}"/>`);
    if (boss) parts.push(`<path d="M30 82 L34 80 L33 84 Z" fill="#c4a052"/>`); // œillet / épingle
  }

  // cou
  parts.push(`<rect x="${cx - 6}" y="${cy + faceH / 2 - 6}" width="12" height="12" fill="${skin}"/>`);

  // cheveux arrière (femmes : carré années 20)
  if (female) {
    parts.push(`<path d="M${cx - faceW / 2 - 5} ${cy + 6} Q${cx - faceW / 2 - 6} ${cy - faceH / 2 - 6} ${cx} ${cy - faceH / 2 - 7} Q${cx + faceW / 2 + 6} ${cy - faceH / 2 - 6} ${cx + faceW / 2 + 5} ${cy + 6} L${cx + faceW / 2 + 2} ${cy + 12} L${cx - faceW / 2 - 2} ${cy + 12} Z" fill="${hair}"/>`);
  }

  // visage
  const jx = jaw > 0.5 ? 1 : 4; // mâchoire carrée ou fine
  parts.push(`<path d="M${cx - faceW / 2} ${cy} Q${cx - faceW / 2} ${cy - faceH / 2} ${cx} ${cy - faceH / 2} Q${cx + faceW / 2} ${cy - faceH / 2} ${cx + faceW / 2} ${cy} Q${cx + faceW / 2 - jx} ${cy + faceH / 2} ${cx} ${cy + faceH / 2 + (jaw > 0.5 ? 1 : 0)} Q${cx - faceW / 2 + jx} ${cy + faceH / 2} ${cx - faceW / 2} ${cy} Z" fill="${skin}" stroke="${INK}" stroke-width="0.8"/>`);
  // oreilles
  parts.push(`<ellipse cx="${cx - faceW / 2}" cy="${cy}" rx="2.6" ry="4.5" fill="${skin}" stroke="${INK}" stroke-width="0.6"/>`);
  parts.push(`<ellipse cx="${cx + faceW / 2}" cy="${cy}" rx="2.6" ry="4.5" fill="${skin}" stroke="${INK}" stroke-width="0.6"/>`);
  // hachures d'ombre sur la joue (effet gravure)
  for (let i = 0; i < 5; i++) {
    const y = cy - 2 + i * 3.2;
    parts.push(`<line x1="${cx + faceW / 2 - 6}" y1="${y}" x2="${cx + faceW / 2 - 1.5}" y2="${y + 2}" stroke="${INK}" stroke-width="0.4" opacity="0.45"/>`);
  }

  // cheveux avant
  if (!female) {
    const bald = age >= 50 && r() > 0.55;
    if (!bald) parts.push(`<path d="M${cx - faceW / 2 - 1} ${cy - 2} Q${cx - faceW / 2} ${cy - faceH / 2 - 5} ${cx} ${cy - faceH / 2 - 4} Q${cx + faceW / 2} ${cy - faceH / 2 - 5} ${cx + faceW / 2 + 1} ${cy - 2} Q${cx + 6} ${cy - faceH / 2 + 2} ${cx - faceW / 2 - 1} ${cy - 2} Z" fill="${hair}"/>`);
    else parts.push(`<path d="M${cx - faceW / 2} ${cy - 1} Q${cx - faceW / 2 + 1} ${cy - 8} ${cx - faceW / 2 + 5} ${cy - 10} L${cx - faceW / 2 + 3} ${cy} Z M${cx + faceW / 2} ${cy - 1} Q${cx + faceW / 2 - 1} ${cy - 8} ${cx + faceW / 2 - 5} ${cy - 10} L${cx + faceW / 2 - 3} ${cy} Z" fill="${hair}"/>`);
  } else {
    parts.push(`<path d="M${cx - faceW / 2 - 2} ${cy - 2} Q${cx - 4} ${cy - faceH / 2 - 8} ${cx + faceW / 2 + 2} ${cy - 6} Q${cx + 2} ${cy - faceH / 2 + 4} ${cx - faceW / 2 - 2} ${cy - 2} Z" fill="${hair}"/>`);
  }

  // sourcils, yeux, nez, bouche
  const ey = cy - 3;
  const ex = faceW * 0.22;
  const browY = ey - 4 - brow;
  const stern = boss || r() > 0.6;
  parts.push(`<path d="M${cx - ex - 4} ${browY + (stern ? 1 : 0)} L${cx - ex + 3} ${browY - (stern ? 0.6 : 0)}" stroke="${grey ? '#6e665a' : hair}" stroke-width="${female ? 0.9 : 1.6}" stroke-linecap="round"/>`);
  parts.push(`<path d="M${cx + ex - 3} ${browY - (stern ? 0.6 : 0)} L${cx + ex + 4} ${browY + (stern ? 1 : 0)}" stroke="${grey ? '#6e665a' : hair}" stroke-width="${female ? 0.9 : 1.6}" stroke-linecap="round"/>`);
  const patch = scars >= 3;
  parts.push(`<ellipse cx="${cx - ex}" cy="${ey}" rx="1.6" ry="${female ? 1.4 : 1.1}" fill="${INK}"/>`);
  if (patch) {
    parts.push(`<ellipse cx="${cx + ex}" cy="${ey}" rx="4" ry="3.4" fill="${INK}"/>`);
    parts.push(`<line x1="${cx - faceW / 2}" y1="${ey - 6}" x2="${cx + faceW / 2}" y2="${ey - 2}" stroke="${INK}" stroke-width="0.8"/>`);
  } else parts.push(`<ellipse cx="${cx + ex}" cy="${ey}" rx="1.6" ry="${female ? 1.4 : 1.1}" fill="${INK}"/>`);
  if (female) {
    parts.push(`<path d="M${cx - ex - 2.5} ${ey - 1.6} l-1 -1 M${cx + ex + 2.5} ${ey - 1.6} l1 -1" stroke="${INK}" stroke-width="0.6"/>`);
  }
  if (age >= 45) {
    parts.push(`<path d="M${cx - ex - 3} ${ey + 3} q2 1.2 4 0 M${cx + ex - 1} ${ey + 3} q2 1.2 4 0" stroke="${INK}" stroke-width="0.4" fill="none" opacity="0.6"/>`);
    parts.push(`<path d="M${cx - 6} ${cy - faceH / 2 + 8} q6 -1.5 12 0" stroke="${INK}" stroke-width="0.4" fill="none" opacity="0.5"/>`);
  }
  const nose = 3 + r() * 3;
  parts.push(`<path d="M${cx} ${ey + 1} L${cx - 1.8} ${ey + 4 + nose} Q${cx} ${ey + 5.5 + nose} ${cx + 2} ${ey + 4.5 + nose}" fill="none" stroke="${INK}" stroke-width="0.7"/>`);
  const my = ey + 10 + nose * 0.6;
  const smile = !boss && r() > 0.4;
  parts.push(`<path d="M${cx - 4.5} ${my} Q${cx} ${my + (smile ? 2.4 : 0.6)} ${cx + 4.5} ${my}" fill="none" stroke="${female ? '#8a2b2b' : INK}" stroke-width="${female ? 1.6 : 0.9}" stroke-linecap="round"/>`);
  // moustache
  if (!female && !child && r() > 0.45) {
    parts.push(`<path d="M${cx - 6} ${my - 1.5} Q${cx - 3} ${my - 4} ${cx} ${my - 2.6} Q${cx + 3} ${my - 4} ${cx + 6} ${my - 1.5} Q${cx} ${my - 1} ${cx - 6} ${my - 1.5} Z" fill="${grey ? '#a39b8b' : hair}"/>`);
  }
  // cicatrices
  if (scars >= 1) parts.push(`<path d="M${cx - ex - 6} ${ey + 4} L${cx - ex + 1} ${ey + 11}" stroke="#7a2b2b" stroke-width="0.9"/><path d="M${cx - ex - 4.5} ${ey + 5} l1.6 -1 M${cx - ex - 2.5} ${ey + 7.4} l1.6 -1 M${cx - ex - 0.6} ${ey + 9.6} l1.6 -1" stroke="#7a2b2b" stroke-width="0.5"/>`);
  if (scars >= 2) parts.push(`<path d="M${cx + 4} ${cy - faceH / 2 + 5} L${cx + 9} ${cy - faceH / 2 + 12}" stroke="#7a2b2b" stroke-width="0.8"/>`);

  // chapeau
  if (child) {
    parts.push(`<path d="M${cx - faceW / 2 - 1} ${cy - faceH / 2 + 3} Q${cx} ${cy - faceH / 2 - 10} ${cx + faceW / 2 + 1} ${cy - faceH / 2 + 3} L${cx + faceW / 2 + 8} ${cy - faceH / 2 + 5} L${cx - faceW / 2 - 1} ${cy - faceH / 2 + 5} Z" fill="#6b5a44" stroke="${INK}" stroke-width="0.6"/>`);
  } else if (female) {
    if (r() > 0.45) parts.push(`<path d="M${cx - faceW / 2 - 4} ${cy - faceH / 2 + 4} Q${cx} ${cy - faceH / 2 - 14} ${cx + faceW / 2 + 4} ${cy - faceH / 2 + 4} Q${cx} ${cy - faceH / 2 + 1} ${cx - faceW / 2 - 4} ${cy - faceH / 2 + 4} Z" fill="${pickR(['#3a2a3f', '#2a2a2a', '#5a2424', '#2e3e52'])}" stroke="${INK}" stroke-width="0.6"/>`);
  } else if (boss || r() > 0.35) {
    const hy = cy - faceH / 2 + 2;
    const hatC = boss ? '#1c1c1c' : pickR(['#3a3128', '#2c2c2c', '#4b3f30']);
    parts.push(`<ellipse cx="${cx}" cy="${hy + 1}" rx="${faceW / 2 + 11}" ry="4" fill="${hatC}" stroke="${INK}" stroke-width="0.6"/>`);
    parts.push(`<path d="M${cx - faceW / 2 + 1} ${hy + 1} L${cx - faceW / 2 + 3} ${hy - 13} Q${cx} ${hy - 18} ${cx + faceW / 2 - 3} ${hy - 13} L${cx + faceW / 2 - 1} ${hy + 1} Z" fill="${hatC}" stroke="${INK}" stroke-width="0.6"/>`);
    parts.push(`<path d="M${cx - faceW / 2 + 2} ${hy - 3} L${cx + faceW / 2 - 2} ${hy - 3} L${cx + faceW / 2 - 1.5} ${hy} L${cx - faceW / 2 + 1.5} ${hy} Z" fill="${boss ? '#7a1f1f' : '#1a1a1a'}"/>`);
    parts.push(`<path d="M${cx - 3} ${hy - 16} Q${cx} ${hy - 13} ${cx + 3} ${hy - 16}" stroke="${INK}" stroke-width="0.6" fill="none"/>`);
  }
  // cigare du patron
  if (o.rank === 'boss' && age >= 30) {
    parts.push(`<rect x="${cx + 3}" y="${my - 0.8}" width="11" height="2.4" rx="1" fill="#6b4423" transform="rotate(12 ${cx + 3} ${my})"/>`);
    parts.push(`<circle cx="${cx + 14}" cy="${my + 2.3}" r="1.1" fill="#d05a2a"/>`);
    parts.push(`<path d="M${cx + 15} ${my} q2 -4 0 -7 q-2 -3 1 -6" stroke="#9a948a" stroke-width="0.6" fill="none" opacity="0.7"/>`);
  }

  return `<svg class="portrait" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-hidden="true"><defs><clipPath id="pc${o.seed}"><circle cx="50" cy="50" r="49"/></clipPath></defs><g clip-path="url(#pc${o.seed})">${parts.join('')}</g><circle cx="50" cy="50" r="49" fill="none" stroke="#c4a052" stroke-width="2"/></svg>`;
}

/** Graine stable pour un personnage sans graine stockée */
export function seedOf(text: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
