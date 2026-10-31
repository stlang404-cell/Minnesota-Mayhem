import { GameState, SAVE_VERSION, v4PlayerDefaults, v4WorldDefaults, v5Defaults } from './game';
import { hashString } from './rng';

export interface SaveEnvelope { format: 'minnesota-mayhem-save'; version: number; savedAt: number; checksum: string; data: GameState }

export function checksum(json: string): string {
  // two independent FNV-style hashes for corruption detection
  const a = hashString(json);
  let b = 5381;
  for (let i = 0; i < json.length; i++) b = (Math.imul(b, 33) ^ json.charCodeAt(i)) >>> 0;
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function serialize(g: GameState): string {
  const data = JSON.stringify(g);
  const env = { format: 'minnesota-mayhem-save', version: g.version, savedAt: Date.now(), checksum: checksum(data) };
  // data appended raw so the checksum covers the exact bytes
  return JSON.stringify(env).slice(0, -1) + `,"data":${data}}`;
}

export class SaveError extends Error {}

/** Migrations from older schema versions. Each step upgrades exactly one version. */
const MIGRATIONS: Record<number, (d: any) => any> = {
  1: d => { d.archive = d.archive ?? []; d.version = 2; return d; },
  2: d => { d.stats = { exchangeTrades: 0, exchangePnl: 0, marketsSettled: 0, bestStreak: 0, streak: 0, earnedPrizes: 0, propertyIncome: 0, ...(d.stats ?? {}) }; d.version = 3; return d; },
  // v3 (Version 1.0) → v4 (Imperial Ascension). Everything existing is preserved; new systems get defaults.
  3: d => {
    const w = v4WorldDefaults(d.day ?? 1);
    for (const [k, v] of Object.entries(w)) if (d[k] === undefined) d[k] = v;
    d.player = { ...v4PlayerDefaults(), ...d.player };
    d.player.career.hands = d.player.career.hands || 0;
    d.settings = { volume: 0.7, ...d.settings };
    d.player.equipped = { frame: 'frame_bronze', banner: 'banner_crimson', victory: 'victory_laurels', ...d.player.equipped };
    for (const c of ['frame_bronze', 'banner_crimson', 'victory_laurels']) if (!d.player.cosmetics.includes(c)) d.player.cosmetics.push(c);
    // existing players have already learned the basics
    d.tutorial = { step: 99, done: (d.player.matches ?? 0) > 0 };
    if (d.active) {
      const k = d.active.kind;
      d.active.ratingScale ??= k === 'recovery' ? 0 : 1;
      d.active.gloryScale ??= k === 'recovery' ? 0 : 1;
    }
    const fixMatch = (m: any) => { if (!m) return; for (const a of m.arsenal ?? []) a.x ??= {}; };
    fixMatch(d.active?.match);
    for (const mk of d.markets ?? []) { fixMatch(mk.match); mk.extra ??= []; mk.kind ??= 'winner'; mk.labels ??= mk.names; mk.rule ??= 'Pays $1 if this competitor wins the match.'; }
    d.migratedFrom = 3;
    d.version = 4;
    return d;
  },
  // v4 (2.0 Imperial Ascension) → v5 (3.0 The Eternal Empire)
  4: d => {
    const w = v5Defaults();
    for (const [k, v] of Object.entries(w)) if (d[k] === undefined) d[k] = v;
    d.legacy.highestRank = Math.max(d.legacy.highestRank ?? 0, d.player?.rank ?? 0);
    d.legacy.careerWinnings ||= d.stats?.earnedPrizes ?? 0;
    for (const r of Object.values<any>(d.reputation ?? {})) { r.bigBets ??= 0; r.bigBetsStrong ??= 0; r.smallBets ??= 0; r.smallBetsStrong ??= 0; }
    if (d.active?.match) for (const st of d.active.match.stats ?? []) { st.bigBets ??= 0; st.bigBetsStrong ??= 0; st.smallBets ??= 0; st.smallBetsStrong ??= 0; }
    for (const mk of d.markets ?? []) if (mk.match) for (const st of mk.match.stats ?? []) { st.bigBets ??= 0; st.bigBetsStrong ??= 0; st.smallBets ??= 0; st.smallBetsStrong ??= 0; }
    d.timeline.push({ day: d.day, text: 'Your house enters the age of the Eternal Empire (save upgraded to 3.0)', icon: '🏛' });
    d.settings = { music: true, ...d.settings };
    d.migratedFrom ??= 4;
    d.version = 5;
    return d;
  },
};

export function migrate(d: any): GameState {
  let v = d.version ?? 1;
  if (v > SAVE_VERSION) throw new SaveError(`Save is from a newer version (${v})`);
  while (v < SAVE_VERSION) {
    const f = MIGRATIONS[v];
    if (!f) throw new SaveError(`No migration from version ${v}`);
    d = f(d); v = d.version;
  }
  return d as GameState;
}

export function deserialize(text: string): GameState {
  let env: any;
  try { env = JSON.parse(text); } catch { throw new SaveError('Save file is not valid JSON (corrupted?)'); }
  if (env?.format !== 'minnesota-mayhem-save' || !env.data) throw new SaveError('Not a Minnesota Mayhem save');
  const i = text.indexOf(',"data":');
  const raw = text.slice(i + 8, -1);
  if (checksum(raw) !== env.checksum) throw new SaveError('Checksum mismatch — the save is corrupted or was edited');
  const g = migrate(env.data);
  validate(g);
  return g;
}

export function validate(g: GameState) {
  const p = g.player;
  if (!p || !Number.isInteger(p.bankroll) || p.bankroll < 0) throw new SaveError('Invalid bankroll');
  if (!Array.isArray(g.rivals) || !Array.isArray(g.markets)) throw new SaveError('Invalid world data');
  if (p.rank < 0 || p.rank > 8) throw new SaveError('Invalid rank');
}

// ---------------------------------------------------------------- IndexedDB
const DB = 'minnesota-mayhem';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
export async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb();
  const v = await new Promise<string | undefined>((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result as string | undefined);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return v;
}

/**
 * Two-slot atomic save: write to the inactive slot, then flip the pointer.
 * An interrupted write leaves the previous slot intact.
 */
export async function saveGame(g: GameState): Promise<void> {
  const text = serialize(g);
  const cur = (await idbGet('pointer')) ?? 'B';
  const next = cur === 'A' ? 'B' : 'A';
  await idbPut('slot' + next, text);
  await idbPut('pointer', next);
  try { localStorage.setItem('mm-backup', text); } catch { /* quota: IndexedDB copy still exists */ }
}

/** Version of a serialized save without migrating it (null if unreadable). */
export function peekVersion(text: string): number | null {
  try { const v = JSON.parse(text.slice(0, text.indexOf(',"data":')) + '}').version; return typeof v === 'number' ? v : null; } catch { return null; }
}

export async function loadGame(): Promise<{ game: GameState | null; warning?: string }> {
  const ptr = await idbGet('pointer');
  const order = ptr === 'A' ? ['slotA', 'slotB'] : ['slotB', 'slotA'];
  let warning: string | undefined;
  for (const k of order) {
    const t = await idbGet(k);
    if (!t) continue;
    const v = peekVersion(t);
    // keep an untouched copy of any older-version save before migrating it
    if (v !== null && v < SAVE_VERSION && !(await idbGet(`backup-v${v}`))) await idbPut(`backup-v${v}`, t);
    try {
      const game = deserialize(t);
      if (v !== null && v < SAVE_VERSION) warning = `Save upgraded from version ${v} to ${SAVE_VERSION}. A backup of the original was kept.`;
      return { game, warning };
    }
    catch (e) { warning = `Primary save unreadable (${(e as Error).message}); restored the previous save.`; }
  }
  try {
    const t = localStorage.getItem('mm-backup');
    if (t) return { game: deserialize(t), warning: warning ?? 'Restored from local backup copy.' };
  } catch { /* ignore */ }
  return { game: null, warning };
}

export async function wipeSave(): Promise<void> {
  await idbPut('slotA', ''); await idbPut('slotB', ''); await idbPut('pointer', 'A');
  try { localStorage.removeItem('mm-backup'); } catch { /* ignore */ }
}
