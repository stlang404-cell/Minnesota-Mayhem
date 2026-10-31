import { useEffect, useRef } from 'react';
import { Rng } from '../core/rng';

/** Nine distinct rank environments: each promotion moves deeper into the empire. */
const SKIES: [string, string, string][] = [
  ['#1b2a4a', '#3c5a80', '#a8c4e0'], // Peasant: frozen fields at dusk
  ['#1a1424', '#3a2a3f', '#8a5a5a'], // Plebeian: tavern night
  ['#2a1a2a', '#6b2f2f', '#e09060'], // Gladiator: fiery ludus
  ['#14223a', '#2f4f6f', '#8fb8d8'], // Centurion: lake camp
  ['#101a30', '#2a3d6b', '#6f8fd0'], // Praetor: hall of magistrates
  ['#1a1030', '#3f2366', '#a070c0'], // Consul: senate
  ['#2a1a10', '#7a4a1a', '#f0c060'], // Imperator: triumph at sunset
  ['#1a1408', '#5a4010', '#f2d27a'], // Caesar: palatine gold
  ['#0a0a20', '#2a2050', '#fff2c0'], // Augustus: divine
];
const FLOORS = ['#e8f0f8', '#5a3a22', '#d8b878', '#cfd8df', '#d8d2c8', '#cfc4d8', '#e0c890', '#f0e0a0', '#fffaf0'];
const W = 192, H = 96;
export const BANNER_COLORS: Record<string, [string, string]> = {
  banner_crimson: ['#b0262d', '#f2c94c'], banner_purple: ['#6a2f8f', '#f2c94c'], banner_gold: ['#d4a017', '#fff2a8'], banner_aurora: ['#2bb5a0', '#c8fff0'],
};

function px(x: CanvasRenderingContext2D, c: string, a: number, b: number, w = 1, h = 1) { x.fillStyle = c; x.fillRect(a, b, w, h); }

function column(x: CanvasRenderingContext2D, cx: number, top: number, bottom: number, gold = false) {
  px(x, '#f4efe6', cx, top, 10, bottom - top);
  px(x, '#cfc8bc', cx + 2, top + 2, 1, bottom - top - 4); px(x, '#cfc8bc', cx + 5, top + 2, 1, bottom - top - 4); px(x, '#cfc8bc', cx + 8, top + 2, 1, bottom - top - 4);
  px(x, gold ? '#f2c94c' : '#fff', cx - 2, top - 3, 14, 4); px(x, gold ? '#f2c94c' : '#fff', cx - 2, bottom - 1, 14, 2);
}
function statue(x: CanvasRenderingContext2D, cx: number, base: number, gold: boolean) {
  const c = gold ? '#f2c94c' : '#e8e2d6', s = gold ? '#b8862b' : '#bdb5a8';
  px(x, s, cx - 4, base - 4, 9, 4);         // plinth
  px(x, c, cx - 1, base - 18, 3, 3);        // head
  px(x, c, cx - 2, base - 15, 5, 7);        // torso
  px(x, c, cx - 3, base - 14, 1, 5); px(x, c, cx + 3, base - 16, 1, 4); px(x, c, cx + 3, base - 19, 1, 3); // arms + spear arm
  px(x, c, cx - 2, base - 8, 2, 4); px(x, c, cx + 1, base - 8, 2, 4);
}
function pine(x: CanvasRenderingContext2D, cx: number, base: number, h: number) {
  for (let k = 0; k < h; k++) { const w = Math.floor((k / h) * 4) + 1; px(x, k % 4 === 0 ? '#e8f0f8' : '#1d3b2e', cx - w, base - h + k, w * 2 + 1, 1); }
}
function tent(x: CanvasRenderingContext2D, cx: number, base: number) {
  for (let k = 0; k < 12; k++) px(x, k % 3 === 0 ? '#e8e0c8' : '#c8b890', cx - k, base - 12 + k, k * 2 + 1, 1);
  px(x, '#5a3a22', cx - 1, base - 6, 3, 6);
}
function arch(x: CanvasRenderingContext2D, cx: number, top: number, bottom: number) {
  px(x, '#e8d8b0', cx - 30, top, 60, bottom - top);
  px(x, '#d4a017', cx - 30, top, 60, 3); px(x, '#d4a017', cx - 30, top + 10, 60, 1);
  for (let yy = top + 16; yy < bottom; yy++) { const w = yy < top + 26 ? Math.round(Math.sqrt(Math.max(0, 100 - (top + 26 - yy) ** 2))) : 10; px(x, '#3a2a40', cx - w, yy, w * 2, 1); }
  px(x, '#f2c94c', cx - 4, top + 4, 8, 5);
}

function drawStatic(x: CanvasRenderingContext2D, rank: number, rng: Rng) {
  const bands = SKIES[rank] ?? SKIES[0];
  for (let y = 0; y < 62; y++) {
    const f = (y / 62) * 2, i = Math.min(1, Math.floor(f)), frac = f - i;
    for (let xx = 0; xx < W; xx++) {
      const dither = ((xx + y) % 2 === 0 ? 0.08 : -0.08) + (xx % 4 === 0 && y % 4 === 0 ? 0.12 : 0);
      px(x, frac + dither > 0.5 ? bands[i + 1] : bands[i], xx, y);
    }
  }
  // distant hills / city silhouettes
  for (let xx = 0; xx < W; xx++) {
    const hh = Math.round(46 + Math.sin(xx / 23) * 5 + Math.sin(xx / 9) * 2);
    px(x, rank >= 5 ? '#2a2040' : '#2a3550', xx, hh, 1, 62 - hh);
    px(x, rank >= 6 ? '#f2d27a' : '#dfe9f5', xx, hh, 1, 1);
  }
  if (rank <= 3) for (let i = 0; i < 26; i++) pine(x, i * 8 + rng.int(6) - 3, 62, 8 + rng.int(rank === 0 ? 16 : 10));
  // floor
  const fl = FLOORS[rank];
  px(x, fl, 0, 62, W, 34);
  if (rank === 0) { for (let i = 0; i < 60; i++) px(x, '#ffffff', rng.int(W), 62 + rng.int(34), 2, 1); }
  else if (rank === 1) { for (let yy = 64; yy < H; yy += 4) px(x, '#4a2e1a', 0, yy, W, 1); }
  else if (rank === 2) { for (let i = 0; i < 80; i++) px(x, '#c0a060', rng.int(W), 62 + rng.int(34)); }
  else { for (let yy = 62; yy < H; yy += 6) px(x, 'rgba(0,0,0,0.08)', 0, yy, W, 1); for (let row = 0; row < 6; row++) for (let xx = 0; xx < W; xx += 12) px(x, 'rgba(0,0,0,0.08)', xx + (row % 2) * 6, 62 + row * 6, 1, 6); }
  switch (rank) {
    case 0: // frozen fields: fence and hut
      for (let xx = 4; xx < W; xx += 14) { px(x, '#6b4a2e', xx, 54, 2, 10); }
      px(x, '#6b4a2e', 0, 57, W, 1); px(x, '#6b4a2e', 0, 60, W, 1);
      px(x, '#7a5a3a', 80, 40, 32, 22); for (let k = 0; k < 10; k++) px(x, '#ffffff', 78 + k, 40 - k, 36 - k * 2, 1);
      px(x, '#f2c94c', 92, 48, 6, 6); px(x, '#3a2a1a', 104, 52, 6, 10);
      break;
    case 1: // tavern
      px(x, '#5a3a22', 40, 26, 112, 36); for (let k = 0; k < 12; k++) px(x, '#3a2414', 36 + k, 26 - k, 120 - k * 2, 1);
      for (const wx of [52, 76, 124, 148 - 12]) px(x, '#f2a040', wx, 36, 10, 8);
      px(x, '#2a1a0e', 96, 40, 14, 22); px(x, '#f2c94c', 98, 22, 10, 4);
      break;
    case 2: // ludus: palisade and racks
      for (let xx = 0; xx < W; xx += 5) { px(x, '#6b4a2e', xx, 30, 4, 32); px(x, '#4a301c', xx, 28, 4, 2); }
      for (const wx of [60, 120]) { px(x, '#4a301c', wx, 46, 16, 2); for (let k = 0; k < 4; k++) px(x, '#b8b8c0', wx + 2 + k * 4, 36, 1, 10); }
      break;
    case 3: // legion camp
      for (const tx of [30, 70, 122, 162]) tent(x, tx, 62);
      for (const sx of [96, 50, 142]) { px(x, '#6b4a2e', sx, 24, 2, 38); px(x, '#f2c94c', sx - 4, 22, 10, 3); px(x, '#b0262d', sx - 3, 26, 8, 8); }
      break;
    case 4: case 5: { // marble halls / senate
      for (const cx of [10, 40, 142, 172]) column(x, cx, 24, 64);
      for (let k = 0; k < 10; k++) px(x, '#f4efe6', 60 + k * 3, 24 - k, 72 - k * 6, 1);
      px(x, '#f2c94c', 92, 18, 8, 3); px(x, '#f4efe6', 62, 25, 68, 2);
      if (rank === 5) for (let row = 0; row < 4; row++) px(x, row % 2 ? '#8a6aa0' : '#6a4a80', 60 - row * 6, 48 + row * 4, 72 + row * 12, 3);
      break;
    }
    case 6: // triumphal arch
      arch(x, 96, 14, 62); for (const cx of [10, 172]) column(x, cx, 24, 64, true);
      break;
    case 7: // palatine: gold dome & statues
      px(x, '#e8d8b0', 56, 30, 80, 32);
      for (let k = 0; k < 16; k++) { const w = Math.round(Math.sqrt(256 - k * k) * 2.2); px(x, '#f2c94c', 96 - w, 30 - 16 + (16 - k), w * 2, 1); }
      for (const cx of [64, 84, 104, 124]) column(x, cx - 4, 36, 62, true);
      statue(x, 24, 64, true); statue(x, 168, 64, true);
      break;
    case 8: // temple of the divine with light rays
      for (let k = 0; k < 40; k++) px(x, 'rgba(255,248,200,0.10)', 96 - k * 2, 0, 4 + k * 4 > W ? W : 4 + k * 4, 1);
      for (const cx of [44, 66, 88, 110, 132]) column(x, cx, 26, 62, true);
      for (let k = 0; k < 12; k++) px(x, '#fffaf0', 40 + k * 3, 26 - k, 112 - k * 6, 1);
      statue(x, 20, 64, false); statue(x, 172, 64, false); statue(x, 96, 22, true);
      break;
  }
}

/** Animated rank arena: torches, banners, snow or embers, aurora. Pure render code (no simulation RNG). */
export function ArenaScene({ rank, reduced, height = 150, banner = 'banner_crimson' }: { rank: number; reduced: boolean; height?: number; banner?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const rng = new Rng(1234 + rank);
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    drawStatic(off.getContext('2d')!, rank, rng);
    const embers = rank === 2 || rank === 6 || rank === 7;
    const flakes = Array.from({ length: embers ? 40 : 70 }, () => ({ x: rng.next() * W, y: rng.next() * H, s: 0.25 + rng.next() * 0.6, d: rng.next() * 6 }));
    const stars = Array.from({ length: 40 }, () => ({ x: rng.int(W), y: rng.int(34), t: rng.next() * 6 }));
    const [bc, trim] = BANNER_COLORS[banner] ?? BANNER_COLORS.banner_crimson;
    const torches = [[1, [36, 156]], [2, [30, 162]], [3, [20, 176]], [6, [56, 136]], [7, [40, 152]]].find(([r]) => r === rank)?.[1] as number[] | undefined;
    let raf = 0, t = 0, last = 0;
    const frame = (now: number) => {
      if (now - last >= 50) {
        last = now; t++;
        x.drawImage(off, 0, 0);
        for (const s of stars) if (Math.sin(t / 12 + s.t) > 0.3) px(x, '#fff', s.x, s.y);
        if (rank === 0 || rank === 3 || rank === 4 || rank === 8) {
          x.fillStyle = rank === 8 ? 'rgba(255,220,120,0.28)' : 'rgba(80,255,170,0.26)';
          for (let xx = 0; xx < W; xx++) x.fillRect(xx, Math.round(10 + Math.sin(xx / 17 + t / 40) * 5 + Math.sin(xx / 7 + t / 25) * 2), 1, Math.round(4 + Math.sin(xx / 5 + t / 20) * 2));
        }
        if (rank >= 4 || rank === 0) for (const bx of [24, 160]) {
          px(x, trim, bx - 1, 26, 9, 1);
          for (let yy = 0; yy < 24; yy++) {
            const sway = reduced ? 0 : Math.round(Math.sin(t / 10 + yy / 6) * (yy / 18));
            px(x, bc, bx + sway, 27 + yy, 7, 1); px(x, trim, bx + sway, 27 + yy, 1, 1); px(x, trim, bx + 6 + sway, 27 + yy, 1, 1);
          }
          px(x, trim, bx + 2, 33, 3, 3); px(x, trim, bx + 3, 32, 1, 5);
        }
        if (torches) for (const tx of torches) {
          px(x, '#4a301c', tx, 44, 2, 18);
          const fl = reduced ? 0 : (t + tx) % 3;
          px(x, '#ff8a2a', tx - 1, 39 - fl, 4, 5 + fl); px(x, '#ffd84a', tx, 41 - fl, 2, 3);
          x.fillStyle = 'rgba(255,170,60,0.10)'; x.beginPath(); x.arc(tx + 1, 42, 14, 0, Math.PI * 2); x.fill();
        }
        // crowds (Gladiator+): rows of bobbing spectators along the arena edge
        if (rank >= 2) {
          const cols = ['#3a2a40', '#4a3020', '#2a3550', '#5a1a20', '#3a4a2a'];
          for (let row = 0; row < 2; row++) for (let xx = 2 + row * 3; xx < W; xx += 6) {
            const bob = reduced ? 0 : Math.round(Math.sin(t / 6 + xx * 0.7 + row) * 0.6 + (Math.sin(t / 30) > 0.92 ? -1 : 0));
            const cy = 58 + row * 3 + bob;
            if (rank >= 4 && xx > 50 && xx < 142 && row === 0) continue; // keep the hall centre clear
            px(x, cols[(xx + row) % cols.length], xx, cy, 3, 4); px(x, '#e0b090', xx + 1, cy - 2, 2, 2);
          }
        }
        // warm lighting vignette for torch-lit and golden arenas
        if (torches || rank >= 6) { const gr = x.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.75); gr.addColorStop(0, 'rgba(255,200,120,0.06)'); gr.addColorStop(1, 'rgba(10,0,20,0.35)'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
        for (const f of flakes) {
          if (!reduced) {
            if (embers) { f.y -= f.s; f.x += Math.sin((t + f.d * 30) / 15) * 0.3; if (f.y < 0) { f.y = H; f.x = (f.x * 7.3 + 31) % W; } }
            else { f.y += f.s; f.x += Math.sin((t + f.d * 30) / 20) * 0.25; if (f.y > H) { f.y = -1; f.x = (f.x * 7.3 + 31) % W; } }
          }
          px(x, embers ? (f.d > 3 ? '#ffb040' : '#ff6a2a') : '#fff', Math.round(f.x), Math.round(f.y));
        }
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    frame(100);
    return () => cancelAnimationFrame(raf);
  }, [rank, reduced, banner]);
  return <canvas ref={ref} className="scene" style={{ height }} aria-hidden="true" />;
}
