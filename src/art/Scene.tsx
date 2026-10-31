import { useEffect, useRef } from 'react';
import { Rng } from '../core/rng';

const SKIES: [string, string, string][] = [
  ['#1b2a4a', '#3c5a80', '#a8c4e0'],
  ['#24203f', '#4b3f6b', '#c9a5b5'],
  ['#2a1a2a', '#6b2f2f', '#e09060'],
  ['#14223a', '#2f4f6f', '#8fb8d8'],
  ['#101a30', '#2a3d6b', '#6f8fd0'],
  ['#1a1030', '#3f2366', '#a070c0'],
  ['#2a1a10', '#7a4a1a', '#f0c060'],
  ['#1a1408', '#5a4010', '#f2d27a'],
  ['#0a0a20', '#2a2050', '#fff2c0'],
];
const W = 192, H = 96;

function drawStatic(x: CanvasRenderingContext2D, rank: number, rng: Rng) {
  const bands = SKIES[rank] ?? SKIES[0];
  for (let y = 0; y < 62; y++) {
    const f = (y / 62) * 2;
    const i = Math.min(1, Math.floor(f));
    const frac = f - i;
    for (let xx = 0; xx < W; xx++) {
      const dither = ((xx + y) % 2 === 0 ? 0.08 : -0.08) + (xx % 4 === 0 && y % 4 === 0 ? 0.12 : 0);
      x.fillStyle = frac + dither > 0.5 ? bands[i + 1] : bands[i];
      x.fillRect(xx, y, 1, 1);
    }
  }
  // hills
  for (let xx = 0; xx < W; xx++) {
    const hh = Math.round(46 + Math.sin(xx / 23) * 5 + Math.sin(xx / 9) * 2);
    x.fillStyle = '#2a3550'; x.fillRect(xx, hh, 1, 62 - hh);
    x.fillStyle = '#dfe9f5'; x.fillRect(xx, hh, 1, 1);
  }
  // pines
  for (let i = 0; i < 26; i++) {
    const px = i * 8 + rng.int(6) - 3, h = 10 + rng.int(12), base = 62;
    for (let k = 0; k < h; k++) {
      const w = Math.floor((k / h) * 4) + 1;
      x.fillStyle = k % 4 === 0 ? '#e8f0f8' : '#1d3b2e';
      x.fillRect(px - w, base - h + k, w * 2 + 1, 1);
    }
  }
  // marble floor
  x.fillStyle = '#d8d2c8'; x.fillRect(0, 62, W, 34);
  x.fillStyle = '#c4bdb2';
  for (let yy = 62; yy < H; yy += 6) x.fillRect(0, yy, W, 1);
  for (let row = 0; row < 6; row++) for (let xx = 0; xx < W; xx += 12) x.fillRect(xx + (row % 2) * 6, 62 + row * 6, 1, 6);
  // colonnade
  for (const cx of [10, 40, 142, 172]) {
    x.fillStyle = '#f4efe6'; x.fillRect(cx, 24, 10, 40);
    x.fillStyle = '#cfc8bc'; x.fillRect(cx + 2, 26, 1, 36); x.fillRect(cx + 5, 26, 1, 36); x.fillRect(cx + 8, 26, 1, 36);
    x.fillStyle = '#fff'; x.fillRect(cx - 2, 21, 14, 4); x.fillRect(cx - 2, 63, 14, 2);
  }
  // pediment
  x.fillStyle = '#f4efe6';
  for (let k = 0; k < 10; k++) x.fillRect(60 + k * 3, 24 - k, 72 - k * 6, 1);
  x.fillStyle = '#fff';
  for (let k = 0; k < 10; k++) { x.fillRect(60 + k * 3, 23 - k, 3, 1); x.fillRect(129 - k * 3, 23 - k, 3, 1); }
  x.fillStyle = '#f2c94c'; x.fillRect(92, 18, 8, 3);
  x.fillStyle = '#f4efe6'; x.fillRect(62, 25, 68, 2);
}

/** Low-res animated Roman frontier backdrop: colonnade, banners, pines, snow and aurora. */
export function ArenaScene({ rank, reduced, height = 150 }: { rank: number; reduced: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const rng = new Rng(1234 + rank);
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    drawStatic(off.getContext('2d')!, rank, rng);
    const flakes = Array.from({ length: 70 }, () => ({ x: rng.next() * W, y: rng.next() * H, s: 0.25 + rng.next() * 0.6, d: rng.next() * 6 }));
    const stars = Array.from({ length: 40 }, () => ({ x: rng.int(W), y: rng.int(34), t: rng.next() * 6 }));
    const banner = rank >= 5 ? '#6a2f8f' : '#b0262d';
    let raf = 0, t = 0, last = 0;
    const frame = (now: number) => {
      if (now - last >= 50) {
        last = now; t++;
        x.drawImage(off, 0, 0);
        for (const s of stars) if (Math.sin(t / 12 + s.t) > 0.3) { x.fillStyle = '#fff'; x.fillRect(s.x, s.y, 1, 1); }
        if (rank === 0 || rank >= 3) {
          x.fillStyle = rank >= 6 ? 'rgba(255,220,120,0.32)' : 'rgba(80,255,170,0.28)';
          for (let xx = 0; xx < W; xx++) {
            const yy = Math.round(12 + Math.sin(xx / 17 + t / 40) * 5 + Math.sin(xx / 7 + t / 25) * 2);
            x.fillRect(xx, yy, 1, Math.round(4 + Math.sin(xx / 5 + t / 20) * 2));
          }
        }
        for (const bx of [24, 156]) {
          x.fillStyle = '#f2c94c'; x.fillRect(bx - 1, 26, 9, 1);
          for (let yy = 0; yy < 24; yy++) {
            const sway = reduced ? 0 : Math.round(Math.sin(t / 10 + yy / 6) * (yy / 18));
            x.fillStyle = banner; x.fillRect(bx + sway, 27 + yy, 7, 1);
            x.fillStyle = '#f2c94c'; x.fillRect(bx + sway, 27 + yy, 1, 1); x.fillRect(bx + 6 + sway, 27 + yy, 1, 1);
          }
          x.fillStyle = '#f2c94c'; x.fillRect(bx + 2, 33, 3, 3); x.fillRect(bx + 3, 32, 1, 5);
        }
        for (const f of flakes) {
          if (!reduced) { f.y += f.s; f.x += Math.sin((t + f.d * 30) / 20) * 0.25; if (f.y > H) { f.y = -1; f.x = (f.x * 7.3 + 31) % W; } }
          x.fillStyle = '#fff'; x.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
        }
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    frame(100);
    return () => cancelAnimationFrame(raf);
  }, [rank, reduced]);
  return <canvas ref={ref} className="scene" style={{ height }} aria-hidden="true" />;
}
