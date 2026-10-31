/** Tiny synthesised sound effects (WebAudio). No external audio files. */
let ctx: AudioContext | null = null;
let enabled = true;
export function setSound(on: boolean) { enabled = on; }
function ac(): AudioContext | null {
  if (!enabled) return null;
  try { ctx = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.05, delay = 0) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = a.currentTime + delay;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
export const sfx = {
  chip: () => { tone(1200, 0.05, 'square', 0.03); tone(1600, 0.04, 'square', 0.02, 0.03); },
  card: () => tone(420, 0.04, 'triangle', 0.04),
  fold: () => tone(180, 0.08, 'triangle', 0.04),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.04, i * 0.08)),
  ability: () => [880, 1320, 1760].forEach((f, i) => tone(f, 0.1, 'sine', 0.05, i * 0.05)),
  promote: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'square', 0.045, i * 0.1)),
  coin: () => { tone(988, 0.06, 'square', 0.04); tone(1319, 0.12, 'square', 0.04, 0.06); },
  error: () => tone(110, 0.15, 'sawtooth', 0.04),
  elim: () => [400, 300, 200].forEach((f, i) => tone(f, 0.12, 'sawtooth', 0.03, i * 0.09)),
};
