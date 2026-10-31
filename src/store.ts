import { useSyncExternalStore } from 'react';
import { GameState, newGame } from './core/game';
import { loadGame, saveGame, deserialize, serialize } from './core/save';

type Listener = () => void;
let state: GameState | null = null;
let version = 0;
const listeners = new Set<Listener>();
let saveTimer: number | undefined;
export let lastSaveStatus = { ok: true, at: 0, msg: '' };

function emit() { version++; listeners.forEach(l => l()); }

export function getGame(): GameState | null { return state; }

/** Run a mutation against the game state, re-render and schedule an autosave. */
export function dispatch<T>(fn: (g: GameState) => T): T | undefined {
  if (!state) return undefined;
  const r = fn(state);
  emit();
  scheduleSave();
  return r;
}

export function scheduleSave(delay = 400) {
  if (!state) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void persist(); }, delay);
}

export async function persist() {
  if (!state) return;
  try { await saveGame(state); lastSaveStatus = { ok: true, at: Date.now(), msg: 'Saved' }; }
  catch (e) { lastSaveStatus = { ok: false, at: Date.now(), msg: (e as Error).message }; }
}

export async function boot(): Promise<string | undefined> {
  try {
    const { game, warning } = await loadGame();
    if (game) { state = game; emit(); }
    return warning;
  } catch (e) {
    return 'Storage unavailable: ' + (e as Error).message + '. Progress may not persist in this browser mode.';
  }
}

export function startNew(name: string, seed?: number) {
  state = newGame(name, seed);
  emit();
  void persist();
}

export function importSave(text: string) {
  const g = deserialize(text);
  state = g; emit(); void persist();
}
export function exportSave(): string { return state ? serialize(state) : ''; }
export function closeGame() { state = null; emit(); }

window.addEventListener('beforeunload', () => { if (state) { try { localStorage.setItem('mm-backup', serialize(state)); } catch { /* ignore */ } } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void persist(); });

export function useGame(): GameState | null {
  useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
  return state;
}
export function useVersion(): number {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
}
/** Force a re-render after mutating the active match directly (animation loop). */
export function touch() { emit(); }
