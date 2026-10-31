/**
 * Original procedural soundtrack (WebAudio, no files): a lyre-like menu theme in D Dorian,
 * a drum + drone arena loop, and one-shot fanfares. Starts only after a user gesture.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | undefined;
let theme: 'off' | 'menu' | 'arena' = 'off';
let volume = 0.35;
let enabled = true;
let step = 0;

const D_DORIAN = [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0];
const MENU = [7, 9, 10, 9, 7, 4, 5, 7, -1, 4, 5, 4, 2, 0, 2, -1, 7, 9, 11, 10, 9, 7, 9, -1, 5, 4, 2, 4, 0, -1, 0, -1];
const ARENA = [0, -1, 0, 3, -1, 0, 5, -1, 0, -1, 0, 3, -1, 7, 5, 3];

function ac() {
  if (!enabled) return null;
  try { ctx = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  if (!master) { master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function note(freq: number, t0: number, dur: number, type: OscillatorType, vol: number) {
  const a = ac(); if (!a || !master) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function drum(t0: number, low: boolean) {
  const a = ac(); if (!a || !master) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(low ? 90 : 160, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
  g.gain.setValueAtTime(low ? 0.5 : 0.25, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + 0.25);
}
function tick() {
  const a = ac(); if (!a || theme === 'off') return;
  const t0 = a.currentTime + 0.05;
  if (theme === 'menu') {
    const n = MENU[step % MENU.length];
    if (n >= 0) { note(D_DORIAN[n] * 2, t0, 0.6, 'triangle', 0.18); if (step % 4 === 0) note(D_DORIAN[n % 5] / 2, t0, 1.4, 'sine', 0.12); }
  } else {
    const n = ARENA[step % ARENA.length];
    drum(t0, step % 4 === 0); if (step % 8 === 4) drum(t0, false);
    if (n >= 0 && step % 2 === 0) note(D_DORIAN[n] / 2, t0, 0.35, 'sawtooth', 0.05);
    if (step % 16 === 0) note(D_DORIAN[0] / 2, t0, 3.5, 'triangle', 0.08);
  }
  step++;
}
export function playTheme(t: 'off' | 'menu' | 'arena') {
  if (t === theme) return;
  theme = t; step = 0;
  window.clearInterval(timer);
  if (t !== 'off' && enabled) timer = window.setInterval(tick, t === 'menu' ? 420 : 260);
}
export function fanfare() {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + 0.05;
  [0, 4, 7, 11, 7, 11].forEach((n, i) => note(D_DORIAN[n] * 2, t0 + i * 0.14, 0.35, 'square', 0.12));
  note(D_DORIAN[0], t0 + 0.84, 1.2, 'triangle', 0.15);
}
export function setMusic(on: boolean, vol: number) {
  enabled = on; volume = Math.max(0, Math.min(1, vol)) * 0.5;
  if (master) master.gain.value = volume;
  if (!on) { window.clearInterval(timer); const prev = theme; theme = 'off'; if (prev !== 'off') theme = 'off'; }
}
