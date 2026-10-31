import { BUILDINGS, ICONS, PAL } from './sprites';
import { Rng } from '../core/rng';

const cache = new Map<string, string>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

export function drawRows(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, ox = 0, oy = 0, tint?: string) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = tint && ch !== 'k' ? tint : pal[ch] ?? '#ff00ff';
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

export function spriteURL(kind: 'building' | 'icon', name: string, tint?: string): string {
  const key = `${kind}:${name}:${tint ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = (kind === 'building' ? BUILDINGS : ICONS)[name];
  if (!rows) return '';
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const [c, ctx] = canvas(w, h);
  drawRows(ctx, rows, PAL, 0, 0, tint);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#6b3e1f'];
const HAIR = ['#2a1a14', '#5a3a1a', '#8a5a2b', '#c9a15b', '#d9d0c0', '#1a1a1a', '#7a2a1a'];
const TOGA = ['#8b6b4a', '#9a9a9a', '#8a5030', '#b0282e', '#2f5e9e', '#6a2f8f', '#b0282e', '#5a2382', '#f2efe6'];
const TRIM = ['#5a4430', '#6a6a6a', '#5a3018', '#f2c94c', '#cfd8e6', '#f4efe6', '#f2c94c', '#f2c94c', '#f2c94c'];
const BGS: Record<string, string> = {
  bluff: '#5a1e22', pressure: '#5e3410', discipline: '#1d3557', counterplay: '#3d2257', momentum: '#5a4a10',
  economy: '#1d4a2b', comeback: '#4a1030', information: '#124a48', player: '#2b1d4a',
};

/** Procedural 16×16 Roman portrait, deterministic from seed. */
export function portraitURL(seed: number, rank: number, style: string): string {
  const key = `p:${seed}:${rank}:${style}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(seed);
  const [c, x] = canvas(16, 16);
  const px = (cx: number, cy: number, col: string) => { x.fillStyle = col; x.fillRect(cx, cy, 1, 1); };
  const rect = (cx: number, cy: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(cx, cy, w, h); };
  // background with dither
  const bg = BGS[style] ?? '#333';
  rect(0, 0, 16, 16, bg);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) if ((i + j) % 4 === 0 && j < 6) px(i, j, 'rgba(255,255,255,0.06)');
  const skin = rng.pick(SKIN);
  const shade = 'rgba(0,0,0,0.18)';
  const hair = rng.pick(HAIR);
  const beard = rng.chance(0.45);
  const wide = rng.chance(0.5) ? 1 : 0;
  // shoulders / toga
  const toga = TOGA[rank] ?? '#888', trim = TRIM[rank] ?? '#aaa';
  rect(2, 13, 12, 3, toga);
  rect(1, 14, 14, 2, toga);
  rect(9, 13, 1, 3, trim); rect(10, 12, 1, 1, trim);
  // neck
  rect(6, 11, 4, 2, skin); rect(6, 12, 4, 1, shade);
  // face
  rect(5 - wide, 4, 6 + wide * 2, 8, skin);
  rect(4 - wide, 5, 1, 5, skin); rect(11 + wide, 5, 1, 5, skin);
  rect(5 - wide, 11, 6 + wide * 2, 1, shade);
  // eyes
  const eye = rng.chance(0.3) ? '#2a5aa0' : '#1a1020';
  px(6, 7, '#fff'); px(7, 7, eye); px(9, 7, '#fff'); px(10, 7, eye);
  rect(6, 6, 2, 1, hair); rect(9, 6, 2, 1, hair);
  // nose & mouth
  px(8, 8, shade); px(8, 9, shade);
  rect(7, 10, 3, 1, rng.chance(0.5) ? '#8a3a3a' : '#a04848');
  if (beard) { rect(5 - wide, 9, 1, 3, hair); rect(11 + wide, 9, 1, 3, hair); rect(6, 11, 5, 1, hair); px(6, 10, hair); px(10, 10, hair); }
  // headwear by rank
  if (rank <= 1) {
    // hood / hair with snow
    if (rank === 0) { rect(3, 2, 10, 3, '#6b4a2e'); rect(3, 4, 2, 7, '#6b4a2e'); rect(11, 4, 2, 7, '#6b4a2e'); rect(4, 2, 8, 1, '#fff'); px(3, 3, '#fff'); }
    else { rect(4, 3, 8, 2, hair); rect(4, 4, 1, 3, hair); rect(11, 4, 1, 3, hair); }
  } else if (rank <= 5) {
    // galea helmet with crest
    const metal = rank >= 4 ? '#d9c06a' : '#b8b8c0';
    const crest = rank === 4 ? '#2f5e9e' : rank === 5 ? '#6a2f8f' : '#c0262d';
    rect(4, 2, 8, 3, metal); rect(3, 4, 2, 5, metal); rect(11, 4, 2, 5, metal);
    rect(4, 4, 8, 1, 'rgba(0,0,0,0.25)');
    rect(5, 0, 6, 2, crest); rect(4, 1, 1, 1, crest); rect(11, 1, 1, 1, crest);
    px(7, 2, '#fff');
  } else {
    // laurel wreath on hair
    rect(4, 3, 8, 2, hair);
    const leaf = rank >= 7 ? '#f2c94c' : '#4f9e4f';
    for (let i = 3; i <= 12; i += 2) { px(i, 3, leaf); px(i + 1, 2, leaf); }
    px(3, 4, leaf); px(12, 4, leaf);
    if (rank === 8) { px(7, 1, '#fff2a8'); px(8, 1, '#fff2a8'); }
  }
  // outline frame
  x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.strokeRect(0.5, 0.5, 15, 15);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
