import { ABILITY_MAP, activeSynergies, resolveAbility, ResolvedAbility, setBonuses, SigilId, AbilityDef } from './abilities';
import { AIProfile, AIView, decide, decideV1, decideV2, emptyStats, PublicStats } from './ai';
import { equityMC } from './equity';
import { categoryOf, evaluate } from './handEval';
import {
  Action, applyAction, createTable, DEFAULT_CONFIG, finalizeHand, legalActions, liveSeats, placements,
  startHand, Street, TableConfig, TableState, transferChips, potTotal,
} from './poker';
import { mix, Rng } from './rng';
import * as X2 from './arsenal2';

export interface LoadoutEntry { defId: string; level: number; sigil?: SigilId }

export interface MatchPlayer {
  id: string; name: string; isHuman: boolean; loadout: LoadoutEntry[]; profile: AIProfile;
  /** public reputation from earlier matches (observable statistics only) */
  reputation?: PublicStats;
  /** how many past matches this player has shared with each opponent id (scales memory use) */
  familiarity?: Record<string, number>;
  aiVersion?: 1 | 2 | 3;
}

export interface SeatArsenal {
  resolve: number;
  used: Record<string, number>;
  armed: string[];
  wardsLeft: number;
  pendingWaivers: number;
  consecPreFolds: number;
  consecWins: number;
  uncontestedWins: number;
  formation: number;
  stoicFolds: number;
  recent: boolean[];
  phoenixBelow: boolean;
  rewardPct: number;
  rebatePct: number;
  triggers: number;
  /** generic counters for expansion abilities (serializable) */
  x?: Record<string, number>;
  insight: { hand: number; equity?: number; oracle?: { seat: number; equity: number }[]; potOdds?: number; tells?: { seat: number; aggr: number; f2r: number; bluffs: number; hands: number }[] } | null;
}

export interface MatchEvent { n: number; hand: number; seat: number; kind: 'ability' | 'win' | 'bluff' | 'elim' | 'champion' | 'info' | 'arm'; text: string; abilityId?: string }

interface HandTrack {
  raises: number[]; raisedPre: boolean[]; betPost: boolean[]; riverAgg: boolean[];
  foldStreet: (Street | null)[]; foldFacingBetPost: boolean[]; vpip: boolean[]; raisedStreet: boolean[];
  chipLeader: number; levelIndex: number;
}

export interface HandSummary { hand: number; stacks: number[]; out: boolean[]; pot: number; winners: number[]; text: string }

export interface MatchState {
  id: string;
  seed: number;
  kind: 'arena' | 'trial' | 'recovery' | 'exhibition';
  table: TableState;
  players: MatchPlayer[];
  arsenal: SeatArsenal[];
  stats: PublicStats[];
  track: HandTrack;
  events: MatchEvent[];
  eventCounter: number;
  history: HandSummary[];
  done: boolean;
  placementIds: string[];
  aiIters?: number;
}

export const MAX_RESOLVE = 10;

function freshTrack(n: number): HandTrack {
  return {
    raises: Array(n).fill(0), raisedPre: Array(n).fill(false), betPost: Array(n).fill(false), riverAgg: Array(n).fill(false),
    foldStreet: Array(n).fill(null), foldFacingBetPost: Array(n).fill(false), vpip: Array(n).fill(false), raisedStreet: Array(n).fill(false),
    chipLeader: -1, levelIndex: 0,
  };
}

export function abilitiesOf(m: MatchState, seat: number): ResolvedAbility[] {
  return m.players[seat].loadout.slice(0, 8).filter(e => ABILITY_MAP[e.defId]).map(resolveAbility);
}
export function has(m: MatchState, seat: number, id: string): ResolvedAbility | undefined {
  return abilitiesOf(m, seat).find(a => a.def.id === id);
}
export function hasSyn(m: MatchState, seat: number, id: string): boolean {
  return activeSynergies(m.players[seat].loadout.map(l => l.defId)).some(s => s.id === id);
}

export function createMatch(players: MatchPlayer[], seed: number, kind: MatchState['kind'] = 'arena', config: TableConfig = DEFAULT_CONFIG, id?: string): MatchState {
  const table = createTable(players.map(p => ({ id: p.id, name: p.name })), seed, config);
  const m: MatchState = {
    id: id ?? `m${seed.toString(36)}`, seed, kind, table, players,
    arsenal: [], stats: players.map(() => emptyStats()), track: freshTrack(players.length),
    events: [], eventCounter: 0, history: [], done: false, placementIds: [],
  };
  m.arsenal = players.map((p, i) => {
    const ids = p.loadout.map(l => l.defId);
    const bonus = setBonuses(ids).reduce((s, b) => s + b.startResolve, 0);
    const a: SeatArsenal = {
      resolve: Math.min(MAX_RESOLVE, 2 + bonus), used: {}, armed: [], wardsLeft: 0, pendingWaivers: 0,
      consecPreFolds: 0, consecWins: 0, uncontestedWins: 0, formation: 0, stoicFolds: 0, recent: [], phoenixBelow: false,
      rewardPct: 0, rebatePct: 0, triggers: 0, insight: null,
    };
    return a;
  });
  players.forEach((_, i) => {
    const a = m.arsenal[i];
    const vv = has(m, i, 'vestal_vigil'); if (vv) a.wardsLeft += vv.value;
    const pr = has(m, i, 'pax_romana'); if (pr) a.wardsLeft += pr.value;
    const sn = has(m, i, 'spy_network'); if (sn) a.wardsLeft += sn.value;
    const gt = has(m, i, 'golden_touch'); if (gt) a.rewardPct += gt.value;
    const gc = has(m, i, 'gold_of_croesus'); if (gc) { a.rewardPct += gc.value; a.rebatePct = Math.max(a.rebatePct, 25); }
    const ml = has(m, i, 'merchants_ledger'); if (ml) a.rebatePct = Math.max(a.rebatePct, ml.value);
    X2.matchStart(m, i);
  });
  return m;
}

export function emit(m: MatchState, seat: number, kind: MatchEvent['kind'], text: string, abilityId?: string) {
  m.events.push({ n: ++m.eventCounter, hand: m.table.handNo, seat, kind, text, abilityId });
  if (m.events.length > 120) m.events.splice(0, m.events.length - 120);
}

export function usesLeft(m: MatchState, seat: number, ab: ResolvedAbility): boolean {
  if (ab.uses <= 0) return true;
  let max = ab.uses;
  if (ab.def.id === 'last_stand' && hasSyn(m, seat, 'phoenix_rising')) max += 1;
  max += X2.extraUses(m, seat, ab.def.id);
  return (m.arsenal[seat].used[ab.def.id] ?? 0) < max;
}
export function consume(m: MatchState, seat: number, ab: ResolvedAbility) {
  const a = m.arsenal[seat];
  a.used[ab.def.id] = (a.used[ab.def.id] ?? 0) + 1;
  a.triggers++;
  if (ab.thriftBonus) gainResolve(m, seat, ab.thriftBonus);
}
export function gainResolve(m: MatchState, seat: number, n: number) {
  const a = m.arsenal[seat];
  a.resolve = Math.max(0, Math.min(MAX_RESOLVE, a.resolve + n));
}

// ---------------------------------------------------------------------------
// Effect queue & resolution order
//   P0 Wards/Vetoes (static, checked on application)
//   P1 Tributes        (in seat order starting left of the dealer)
//   P2 Restitutions    (refunds from a hand's winner)
//   P3 Resolve gains
//   P4 Next-hand modifiers (blind waivers)
// Caps: each seat may receive at most 3 BB and pay at most 3 BB per hand via
// Arsenal effects; tributes can never eliminate a player (payer keeps >= 1 chip).
// ---------------------------------------------------------------------------
interface Effect { prio: 1 | 2; owner: number; from: number; to: number; bb: number; source: string; label: string }

function seatOrder(m: MatchState, seat: number) {
  const n = m.table.seats.length;
  return (seat - m.table.dealer - 1 + n) % n;
}

function resolveEffects(m: MatchState, effects: Effect[], bb: number, gains?: number[], contrib?: number[]) {
  effects.sort((a, b) => a.prio - b.prio || seatOrder(m, a.owner) - seatOrder(m, b.owner));
  const t = m.table;
  const recv = t.seats.map(() => 0), paid = t.seats.map(() => 0);
  const cap = 3 * bb;
  for (const e of effects) {
    if (e.from === e.to || t.seats[e.from].out || t.seats[e.to].out && e.prio === 1) continue;
    const payer = m.arsenal[e.from];
    if (e.prio === 1) {
      if (X2.tributeGuard(m, e)) continue;
      e.bb = X2.tributeBonus(m, e);
      if (payer.armed.includes('veto')) {
        const v = has(m, e.from, 'veto');
        gainResolve(m, e.from, v?.value ?? 1);
        emit(m, e.from, 'ability', `${t.seats[e.from].name}'s Tribune's Veto blocks ${e.label}`, 'veto');
        continue;
      }
      if (payer.wardsLeft > 0) {
        payer.wardsLeft--;
        emit(m, e.from, 'ability', `${t.seats[e.from].name}'s Ward negates ${e.label}`, has(m, e.from, 'pax_romana') ? 'pax_romana' : has(m, e.from, 'vestal_vigil') ? 'vestal_vigil' : 'spy_network');
        continue;
      }
    }
    let amt = Math.round(e.bb * bb);
    amt = Math.min(amt, cap - recv[e.to], cap - paid[e.from]);
    if (e.prio === 1) {
      // tributes: at most 25% of the payer's stack; never eliminates (payer keeps >= 1 chip)
      amt = Math.min(amt, Math.floor(t.seats[e.from].stack * 0.25), t.seats[e.from].stack - 1);
    } else {
      // restitution: bounded by what the loser put in and by half of the payer's net gain this hand
      const gain = Math.max(0, (gains?.[e.from] ?? 0) - paid[e.from]);
      amt = Math.min(amt, contrib?.[e.to] ?? amt, Math.floor(gain * 0.5), t.seats[e.from].stack - 1);
    }
    if (amt <= 0) continue;
    const moved = transferChips(t, e.from, e.to, amt);
    recv[e.to] += moved; paid[e.from] += moved;
    emit(m, e.owner, 'ability', `${e.label}: ${t.seats[e.from].name} → ${t.seats[e.to].name} ${moved} chips`, e.source);
    const aw = has(m, e.from, 'augurs_warning'); if (aw) gainResolve(m, e.from, aw.value);
    if (e.prio === 1) {
      const ms = has(m, e.from, 'mirror_shield');
      if (ms && usesLeft(m, e.from, ms)) {
        const back = Math.min(Math.round(moved * ms.value), t.seats[e.to].stack - 1);
        if (back > 0) {
          transferChips(t, e.to, e.from, back);
          consume(m, e.from, ms);
          emit(m, e.from, 'ability', `Mirror Shield reflects ${back} chips back to ${t.seats[e.from].name}`, 'mirror_shield');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
export function beginHand(m: MatchState) {
  const t = m.table;
  if (m.done || t.handActive) return;
  const n = t.seats.length;
  const prevLevel = t.levelIndex;
  const nextHand = t.handNo + 1;
  const bbNext = (() => { const idx = Math.floor((nextHand - 1) / t.config.handsPerLevel); return idx; })();
  const live = liveSeats(t);
  const effects: Effect[] = [];
  const bbNow = t.level.bb;
  // pre-hand passives
  let leader = live[0];
  for (const i of live) if (t.seats[i].stack > t.seats[leader].stack) leader = i;
  for (const i of live) {
    const a = m.arsenal[i];
    a.armed = [];
    if (nextHand % 2 === 0) gainResolve(m, i, 1);
    const ig = has(m, i, 'iron_grip');
    if (ig && i === leader && nextHand % 2 === 0 && nextHand > 1) { gainResolve(m, i, ig.value); emit(m, i, 'ability', `${t.seats[i].name}'s Iron Grip: +${ig.value} Resolve`, 'iron_grip'); }
    const pf = has(m, i, 'patrons_favor');
    if (pf && nextHand % 4 === 0) { gainResolve(m, i, pf.value); emit(m, i, 'ability', `Patron's Favor: +${pf.value} Resolve`, 'patrons_favor'); }
    const sr = has(m, i, 'scroll_of_records');
    if (sr && nextHand === 11 && usesLeft(m, i, sr)) { consume(m, i, sr); gainResolve(m, i, sr.value); m.arsenal[i].wardsLeft++; emit(m, i, 'ability', `Scroll of Records complete: +${sr.value} Resolve`, 'scroll_of_records'); }
    X2.handStart(m, i, nextHand, leader, effects);
    const tc = has(m, i, 'tax_collector');
    if (tc && nextHand > 1 && bbNext > prevLevel) {
      for (const j of live) if (j !== i) effects.push({ prio: 1, owner: i, from: j, to: i, bb: tc.value, source: 'tax_collector', label: 'Tax Collector' });
      if (hasSyn(m, i, 'iron_tax')) gainResolve(m, i, 1);
    }
  }
  if (effects.length) resolveEffects(m, effects, bbNow);
  // blind waivers
  const waiver: Record<number, number> = {};
  for (const i of live) if (m.arsenal[i].pendingWaivers > 0) waiver[i] = 0.5;
  startHand(t, waiver);
  for (const i of [t.sbSeat, t.bbSeat]) if (waiver[i]) {
    m.arsenal[i].pendingWaivers--;
    emit(m, i, 'ability', `${t.seats[i].name}'s blind is 50% waived`, 'iron_discipline');
  }
  m.track = freshTrack(n);
  X2.blindsPosted(m);
  m.track.chipLeader = leader;
  m.track.levelIndex = t.levelIndex;
  for (const i of live) m.stats[i].hands++;
  if (!t.handActive) endOfHand(m);
}

/** Abilities a seat may arm right now. */
export function armable(m: MatchState, seat: number): { ab: ResolvedAbility; cost: number; ok: boolean; reason: string }[] {
  const t = m.table;
  const a = m.arsenal[seat];
  const out: { ab: ResolvedAbility; cost: number; ok: boolean; reason: string }[] = [];
  const recentWins = a.recent.slice(-3).filter(Boolean).length;
  const eagle = has(m, seat, 'eagle_standard');
  const sibyl = has(m, seat, 'sibyls_insight');
  for (const ab of abilitiesOf(m, seat)) {
    if (ab.def.kind !== 'active') continue;
    let cost = ab.cost;
    if (eagle && recentWins >= 2) cost = Math.max(0, cost - eagle.value);
    if (sibyl && ab.def.archetype === 'information') cost = 0;
    if (ab.def.id === 'war_drums' && hasSyn(m, seat, 'drumline')) cost = 0;
    const rule = X2.armRules(m, seat, ab);
    if (rule.delta < 0) cost = Math.max(cost > 0 && ab.def.id !== 'tell_reader' ? 1 : 0, cost + rule.delta);
    let ok = true, reason = '';
    const w = ab.def.window;
    if (!t.handActive || t.toAct !== seat) { ok = false; reason = 'Only on your turn'; }
    else if (a.armed.includes(ab.def.id)) { ok = false; reason = 'Already armed'; }
    else if (w === 'preflop' && t.street !== 'preflop') { ok = false; reason = 'Preflop only'; }
    else if (w === 'postflop' && t.street === 'preflop') { ok = false; reason = 'After the flop'; }
    else if (w === 'river' && t.street !== 'river') { ok = false; reason = 'River only'; }
    else if (!usesLeft(m, seat, ab)) { ok = false; reason = 'No uses left'; }
    else if (a.resolve < cost) { ok = false; reason = `Needs ${cost} Resolve`; }
    else if (rule.reason) { ok = false; reason = rule.reason; }
    else if (ab.def.id === 'gladiators_oath' && t.seats[seat].stack + t.seats[seat].committed > 15 * t.level.bb) { ok = false; reason = 'Only below 15 BB'; }
    out.push({ ab, cost, ok, reason });
  }
  return out;
}

export function activate(m: MatchState, seat: number, defId: string): boolean {
  const opt = armable(m, seat).find(o => o.ab.def.id === defId);
  if (!opt || !opt.ok) return false;
  const a = m.arsenal[seat];
  a.resolve -= opt.cost;
  a.armed.push(defId);
  if (opt.ab.uses > 0 || defId === 'sponsors_mark') consume(m, seat, opt.ab); else a.triggers++;
  const t = m.table;
  const name = t.seats[seat].name;
  if (defId === 'sponsors_mark') { a.rewardPct += opt.ab.value; }
  if (defId === 'augurs_eye' || defId === 'oracle_of_delphi') computeInsight(m, seat, defId === 'oracle_of_delphi');
  emit(m, seat, 'arm', `${name} arms ${opt.ab.def.name}`, defId);
  X2.onArm(m, seat, defId);
  return true;
}

export function computeInsight(m: MatchState, seat: number, oracle: boolean) {
  const t = m.table;
  const s = t.seats[seat];
  const opps = t.seats.map((o, i) => i).filter(i => i !== seat && !t.seats[i].folded && !t.seats[i].out);
  const rng = new Rng(mix(m.seed, 'eye', t.handNo, t.board.length, seat));
  const equity = equityMC(s.hole, t.board, opps.length, 600, rng);
  const L = legalActions(t, seat);
  const pot = potTotal(t);
  const ins: SeatArsenal['insight'] = { hand: t.handNo, equity, potOdds: L.toCall > 0 ? L.toCall / (pot + L.toCall) : 0 };
  if (oracle) {
    ins.oracle = opps.map(o => {
      const st = m.stats[o];
      const loose = st.hands >= 4 ? st.vpip / st.hands : 0.4;
      const r = Math.max(0.1, Math.min(1, loose * 1.2 * (m.track.raises[o] > 0 ? 0.7 : 1)));
      return { seat: o, equity: equityMC(s.hole, t.board, 1, 400, new Rng(mix(m.seed, 'oracle', t.handNo, o, t.board.length)), [r]) };
    });
  }
  m.arsenal[seat].insight = ins;
}

/** Apply a betting action for the seat to act and update public statistics. */
export function act(m: MatchState, seat: number, action: Action) {
  const t = m.table;
  const street = t.street;
  const L = legalActions(t, seat);
  const facing = L.toCall > 0;
  const facingRaise = facing && (street !== 'preflop' || t.currentBet > t.level.bb);
  const isBlind = seat === t.sbSeat || seat === t.bbSeat;
  const betBefore = t.currentBet, aggressorBefore = t.aggressor, preFolds = m.arsenal[seat].consecPreFolds, firstVol = !m.track.vpip[seat];
  const potBefore = potTotal(t), committedBefore = t.seats[seat].committed;
  applyAction(t, seat, action);
  const last = [...t.log].reverse().find(e => e.seat === seat && ['fold', 'check', 'call', 'bet', 'raise'].includes(e.kind));
  const kind = last?.kind ?? action.type;
  const tr = m.track, st = m.stats[seat];
  if (facingRaise) { st.foldToRaiseOpp++; if (kind === 'fold') st.foldToRaise++; }
  if (kind === 'fold') {
    tr.foldStreet[seat] = street;
    if (street !== 'preflop' && facing) tr.foldFacingBetPost[seat] = true;
    if (street === 'preflop') {
      m.arsenal[seat].consecPreFolds++;
      const idis = has(m, seat, 'iron_discipline');
      const need = idis ? Math.max(1, idis.value - (hasSyn(m, seat, 'stoic_order') ? 1 : 0)) : 99;
      if (idis && m.arsenal[seat].consecPreFolds >= need) {
        m.arsenal[seat].consecPreFolds = 0; m.arsenal[seat].pendingWaivers = Math.min(2, m.arsenal[seat].pendingWaivers + 1);
        emit(m, seat, 'ability', `${t.seats[seat].name}'s Iron Discipline readies a blind waiver`, 'iron_discipline');
      }
      const pr = has(m, seat, 'pax_romana');
      if (pr && m.arsenal[seat].consecPreFolds >= 2) { m.arsenal[seat].consecPreFolds = 0; m.arsenal[seat].pendingWaivers = Math.min(2, m.arsenal[seat].pendingWaivers + 1); }
      const sp = has(m, seat, 'stoic_patience');
      if (sp && !isBlind) {
        m.arsenal[seat].stoicFolds++;
        if (m.arsenal[seat].stoicFolds % 2 === 0) { gainResolve(m, seat, sp.value); emit(m, seat, 'ability', `Stoic Patience: +${sp.value} Resolve`, 'stoic_patience'); }
      }
    }
  } else if (kind === 'call') {
    st.passive++;
    if (street === 'preflop' && !tr.vpip[seat]) { tr.vpip[seat] = true; st.vpip++; }
    if (street === 'preflop') m.arsenal[seat].consecPreFolds = 0;
  } else if (kind === 'bet' || kind === 'raise') {
    st.aggr++;
    tr.raises[seat]++;
    if (street === 'preflop') { if (!tr.raisedPre[seat]) st.pfr++; tr.raisedPre[seat] = true; if (!tr.vpip[seat]) { tr.vpip[seat] = true; st.vpip++; } m.arsenal[seat].consecPreFolds = 0; }
    else {
      tr.betPost[seat] = true;
      const added = t.seats[seat].committed - committedBefore;
      ((tr as any).betFrac ??= [])[seat] = added / Math.max(1, potBefore);
    }
    if (street === 'river') tr.riverAgg[seat] = true;
  }
  X2.onAct(m, seat, kind, street, { betBefore, aggressorBefore, facing, preFolds, firstVol });
  if (!t.handActive) endOfHand(m);
}

function endOfHand(m: MatchState) {
  const t = m.table;
  const r = t.lastResult!;
  const n = t.seats.length;
  const bb = t.level.bb;
  const tr = m.track;
  const dealtIn = t.seats.map((s, i) => !s.out);
  const net = r.winnings.map((w, i) => w - r.contrib[i]);
  const won = r.winnings.map(w => w > 0);
  const contenders = Object.keys(r.scores).map(Number);
  const sdLosers = r.showdown ? contenders.filter(i => r.winnings[i] === 0) : [];
  let bigWinner = 0;
  for (let i = 1; i < n; i++) if (net[i] > net[bigWinner]) bigWinner = i;
  const effects: Effect[] = [];
  const postFolders = (owner: number) => t.seats.map((_, i) => i).filter(i => i !== owner && tr.foldStreet[i] && tr.foldStreet[i] !== 'preflop' && r.contrib[i] > 0);
  const bluffers = sdLosers.filter(i => tr.riverAgg[i] && categoryOf(r.scores[i].score) <= 1);
  const maxPot = Math.max(...r.pots.map(p => p.amount));

  // public stats from showdown
  if (r.showdown) for (const i of contenders) {
    m.stats[i].showdowns++;
    const bf = (tr as any).betFrac?.[i];
    if (bf !== undefined) {
      const strong = categoryOf(r.scores[i].score) >= 2 ? 1 : 0;
      const st = m.stats[i];
      if (bf >= 0.75) { st.bigBets = (st.bigBets ?? 0) + 1; st.bigBetsStrong = (st.bigBetsStrong ?? 0) + strong; }
      else { st.smallBets = (st.smallBets ?? 0) + 1; st.smallBetsStrong = (st.smallBetsStrong ?? 0) + strong; }
    }
    if (tr.riverAgg[i] && categoryOf(r.scores[i].score) === 0 && r.winnings[i] === 0) {
      m.stats[i].bluffsShown++;
      emit(m, i, 'bluff', `${t.seats[i].name} is caught bluffing with ${r.scores[i].name}!`);
    }
  }
  if (r.uncontested) {
    const w = r.pots[0].winners[0];
    if (tr.betPost[w] && t.board.length >= 3 && categoryOf(evaluate([...t.seats[w].hole, ...t.board])) === 0) {
      const lb = ((m as any).largestBluff ??= []);
      lb[w] = Math.max(lb[w] ?? 0, r.pots[0].amount);
    }
    if (tr.betPost[w] && postFolders(w).length) emit(m, w, 'bluff', `${t.seats[w].name} takes it down with pressure`);
  }
  for (const p of r.pots) emit(m, p.winners[0], 'win', `${p.winners.map(w => t.seats[w].name).join(' & ')} win${p.winners.length > 1 ? '' : 's'} ${p.amount}${p.handName ? ' — ' + p.handName : ''}`);

  for (let o = 0; o < n; o++) {
    if (!dealtIn[o]) continue;
    const A = m.arsenal[o];
    const armed = (id: string) => A.armed.includes(id);
    const ab = (id: string) => { const x = has(m, o, id); return x && usesLeft(m, o, x) ? x : undefined; };
    const winUnc = r.uncontested && won[o];
    const winSd = r.showdown && won[o];
    const lostSd = r.showdown && sdLosers.includes(o);
    const trib = (x: ResolvedAbility, from: number, bbAmt: number, label = x.def.name) => effects.push({ prio: 1, owner: o, from, to: o, bb: bbAmt, source: x.def.id, label });
    const fire = (x: ResolvedAbility, msg?: string) => { consume(m, o, x); if (msg) emit(m, o, 'ability', msg, x.def.id); };
    let x: ResolvedAbility | undefined;

    if ((x = ab('caesars_gambit')) && winUnc && tr.betPost[o]) {
      const f = postFolders(o);
      if (f.length) { fire(x); const v = x.value + (hasSyn(m, o, 'wolf_capitol') ? 0.25 : 0); f.forEach(j => trib(x!, j, v)); }
    }
    if ((x = ab('wrath_of_mars'))) {
      const f = winUnc && tr.betPost[o] ? postFolders(o) : winSd && tr.raises[o] >= 2 ? sdLosers : [];
      if (f.length) { fire(x); f.forEach(j => trib(x!, j, x!.value)); }
    }
    if ((x = ab('silver_tongue')) && winUnc && tr.raisedPre[o] && r.board.length === 0) { gainResolve(m, o, x.value); fire(x, `Silver Tongue: +${x.value} Resolve`); }
    if (armed('mask_of_janus') && (x = has(m, o, 'mask_of_janus'))) {
      if (winUnc) { gainResolve(m, o, x.value); emit(m, o, 'ability', `Mask of Janus: +${x.value} Resolve`, x.def.id); }
      else if (lostSd) gainResolve(m, o, -1);
    }
    if (armed('thunder_of_jupiter') && (x = has(m, o, 'thunder_of_jupiter')) && winUnc) postFolders(o).forEach(j => trib(x!, j, x!.value));
    if (winUnc) {
      A.uncontestedWins++;
      if ((x = ab('phantom_legion')) && A.uncontestedWins % 3 === 0) { gainResolve(m, o, x.value); A.pendingWaivers = Math.min(2, A.pendingWaivers + 1); fire(x, `Phantom Legion: +${x.value} Resolve & blind waiver`); }
    }
    if ((x = ab('siege_engine')) && winSd && tr.raises[o] >= 2 && sdLosers.length) { fire(x); sdLosers.forEach(j => trib(x!, j, x!.value)); }
    if (armed('war_drums') && (x = has(m, o, 'war_drums')) && tr.raisedPre[o] && won[o]) { gainResolve(m, o, x.value); emit(m, o, 'ability', `War Drums: +${x.value} Resolve`, x.def.id); }
    if (armed('decimation') && (x = has(m, o, 'decimation')) && winSd && tr.riverAgg[o]) sdLosers.forEach(j => trib(x!, j, x!.value));
    if ((x = ab('big_stack_tyranny')) && winSd) {
      const j = sdLosers.find(j => t.seats[j].startStack < t.seats[o].startStack);
      if (j !== undefined) { fire(x); trib(x, j, x.value); }
    }
    if ((x = ab('frozen_legion')) && tr.foldFacingBetPost[o] && bigWinner !== o) {
      const cap = 2 + (hasSyn(m, o, 'unbreakable') ? 1 : 0);
      const amt = Math.min(cap, (r.contrib[o] * x.value) / bb);
      if (amt > 0) { fire(x); effects.push({ prio: 2, owner: o, from: bigWinner, to: o, bb: amt, source: x.def.id, label: 'Frozen Legion' }); }
    }
    if (armed('fortress_wall') && (x = has(m, o, 'fortress_wall')) && lostSd) {
      const cap = 3 + (hasSyn(m, o, 'unbreakable') ? 1 : 0);
      effects.push({ prio: 2, owner: o, from: bigWinner, to: o, bb: Math.min(cap, (r.contrib[o] * x.value) / bb), source: x.def.id, label: 'Fortress Wall' });
    }
    if ((x = ab('senates_betrayal')) && winSd && bluffers.length) {
      fire(x); bluffers.forEach(j => trib(x!, j, x!.value));
      if (hasSyn(m, o, 'tribunal')) gainResolve(m, o, 1);
    }
    if ((x = ab('ides_of_march')) && winSd) {
      const targets = sdLosers.filter(j => j === tr.chipLeader || bluffers.includes(j));
      if (targets.length) { fire(x); targets.forEach(j => trib(x!, j, x!.value)); }
    }
    if (armed('brutus_dagger') && (x = has(m, o, 'brutus_dagger')) && winSd && tr.chipLeader !== o && sdLosers.includes(tr.chipLeader)) trib(x, tr.chipLeader, x.value);
    // momentum
    const anyWin = won[o];
    A.recent.push(anyWin); if (A.recent.length > 3) A.recent.shift();
    A.consecWins = anyWin ? A.consecWins + 1 : 0;
    if ((x = has(m, o, 'imperial_momentum')) && anyWin && A.consecWins >= 2) {
      if (A.consecWins === 2) { gainResolve(m, o, x.value); fire(x, `Imperial Momentum: +${x.value} Resolve`); }
      else { A.pendingWaivers = Math.min(2, A.pendingWaivers + 1); fire(x, `Imperial Momentum: blind waiver`); }
    }
    if ((x = has(m, o, 'legion_formation'))) {
      const maxF = hasSyn(m, o, 'rolling_thunder') ? 6 : 5;
      if (anyWin) {
        A.formation = Math.min(maxF, A.formation + 1);
        if (A.formation >= X2.formationThreshold(m, o)) {
          const contested = new Set([...sdLosers, ...postFolders(o)]);
          const losers = t.seats.map((_, i) => i).filter(i => i !== o && dealtIn[i] && net[i] < 0 && contested.has(i));
          if (losers.length) {
            const tgt = losers.reduce((a, b) => t.seats[b].stack > t.seats[a].stack ? b : a);
            fire(x); trib(x, tgt, Math.min(1, x.value * A.formation), `Legion Formation (${A.formation})`);
          }
        }
      } else if (lostSd) A.formation = 0;
    }
    if ((x = has(m, o, 'triumph')) && anyWin && maxPot >= 20 * bb) { gainResolve(m, o, x.value); fire(x, `Triumph! +${x.value} Resolve`); }
    if (armed('forced_march') && anyWin) { A.pendingWaivers = 2; emit(m, o, 'ability', `Forced March: next 2 blinds waived 50%`, 'forced_march'); }
    if (armed('gladiators_oath') && (x = has(m, o, 'gladiators_oath'))) A.pendingWaivers = Math.max(A.pendingWaivers, Math.min(3, x.value));
    // comeback
    const wasAllIn = t.seats[o].stack === 0 || r.contrib[o] >= t.seats[o].startStack;
    if ((x = ab('last_stand')) && wasAllIn && net[o] < 0 && t.seats[o].startStack <= 8 * bb && bigWinner !== o && t.seats.filter(z => !z.out).length >= 3) {
      fire(x, `LAST STAND! ${t.seats[o].name} refuses to fall`);
      effects.push({ prio: 2, owner: o, from: bigWinner, to: o, bb: x.value, source: x.def.id, label: 'Last Stand' });
    }
    if ((x = ab('underdogs_fury')) && winSd && wasAllIn) {
      const j = sdLosers.find(j => t.seats[j].startStack > t.seats[o].startStack);
      if (j !== undefined) { fire(x); gainResolve(m, o, 2); trib(x, j, x.value); }
    }
    // information
    if ((x = has(m, o, 'spy_network'))) {
      const caught = bluffers.filter(j => j !== o && categoryOf(r.scores[j].score) === 0);
      if (caught.length) { gainResolve(m, o, 1); fire(x, `Spy Network notes the bluff: +1 Resolve`); }
    }
    if ((x = ab('sibyls_insight')) && r.showdown) { gainResolve(m, o, x.value); fire(x); }
  }
  const ctx: X2.EndCtx = { r, bb, net, won, sdLosers, bigWinner, postFolders, effects };
  for (let o = 0; o < n; o++) if (dealtIn[o]) X2.handEnd(m, o, ctx);
  resolveEffects(m, effects, bb, net, r.contrib);
  // post-resolution: phoenix
  for (let o = 0; o < n; o++) {
    if (!dealtIn[o]) continue;
    const A = m.arsenal[o];
    const below = t.seats[o].stack > 0 && t.seats[o].stack < 8 * bb;
    const ph = has(m, o, 'phoenix_ash');
    if (ph && below && !A.phoenixBelow && usesLeft(m, o, ph)) { consume(m, o, ph); gainResolve(m, o, ph.value); emit(m, o, 'ability', `Phoenix Ash: +${ph.value} Resolve`, 'phoenix_ash'); }
    A.phoenixBelow = below;
    A.armed = [];
  }
  const busted = finalizeHand(t);
  for (const b of busted) {
    emit(m, b, 'elim', `${t.seats[b].name} is eliminated`);
    X2.onElimination(m, b, bigWinner);
    const live = liveSeats(t);
    if (live.length > 1) {
      const shortest = live.reduce((a, c) => t.seats[c].stack < t.seats[a].stack ? c : a);
      const sw = has(m, shortest, 'second_wind');
      if (sw && usesLeft(m, shortest, sw)) { consume(m, shortest, sw); gainResolve(m, shortest, sw.value); emit(m, shortest, 'ability', `Second Wind: +${sw.value} Resolve`, 'second_wind'); }
    }
  }
  m.history.push({
    hand: r.hand, stacks: t.seats.map(s => s.stack), out: t.seats.map(s => s.out), pot: r.pots.reduce((s, p) => s + p.amount, 0),
    winners: [...new Set(r.pots.flatMap(p => p.winners))],
    text: r.pots.map(p => `${p.winners.map(w => t.seats[w].name).join('&')} +${p.amount}${p.handName ? ` (${p.handName})` : ''}`).join('; '),
  });
  if (m.history.length > 300) m.history.shift();
  if (t.finished) {
    m.done = true;
    m.placementIds = placements(t).map(i => t.seats[i].id);
    emit(m, t.winner, 'champion', `${t.seats[t.winner].name} is the champion of the arena!`);
  }
}

/** Merge current-match public stats with an opponent's (scaled) reputation. */
function remembered(m: MatchState, viewer: number, target: number): PublicStats {
  const cur = m.stats[target];
  const rep = m.players[target].reputation;
  if (!rep || rep.hands <= 0) return { ...cur };
  const fam = m.players[viewer].familiarity?.[m.players[target].id] ?? 0;
  const w = Math.min(1, (fam + 2) / 8) * Math.min(1, 30 / rep.hands);
  const out = { ...cur };
  for (const k of Object.keys(out) as (keyof PublicStats)[]) out[k] = cur[k] + Math.round(rep[k] * w);
  return out;
}

export function buildView(m: MatchState, seat: number): AIView {
  const t = m.table;
  const s = t.seats[seat];
  const liveIdx = t.seats.map((_, i) => i).filter(i => !t.seats[i].out);
  // position: order of action postflop, button last
  const order = liveIdx.map(i => (i - t.dealer - 1 + t.seats.length) % t.seats.length).sort((a, b) => a - b);
  const myOrd = (seat - t.dealer - 1 + t.seats.length) % t.seats.length;
  const position = order.length > 1 ? order.indexOf(myOrd) / (order.length - 1) : 1;
  const leader = liveIdx.reduce((a, b) => (t.seats[b].stack > t.seats[a].stack ? b : a), liveIdx[0]);
  return {
    position, aggressor: t.aggressor >= 0 && t.aggressor !== seat ? t.aggressor : undefined, isChipLeader: leader === seat,
    seat, hole: [...s.hole], board: [...t.board], street: t.street, pot: potTotal(t), stack: s.stack, committed: s.committed,
    currentBet: t.currentBet, bb: t.level.bb, legal: legalActions(t, seat),
    opponents: t.seats.map((o, i) => ({
      seat: i, stack: o.stack, committed: o.committed, folded: o.folded, allIn: o.allIn, out: o.out,
      stats: remembered(m, seat, i), raisedThisHand: m.track.raises[i] > 0, raisedThisStreet: false,
      loadout: m.players[i].loadout.map(l => l.defId),
    })).filter(o => o.seat !== seat),
    playersLeft: liveSeats(t).length, isButton: t.dealer === seat, handNo: t.handNo, resolve: m.arsenal[seat].resolve,
  };
}

/** AI chooses which Arsenal actives to arm given its intended action. Uses only its view. */
function aiArm(m: MatchState, seat: number, view: AIView, eq: number, action: Action, rng: Rng) {
  const opts = armable(m, seat).filter(o => o.ok);
  if (!opts.length) return;
  const aggressive = action.type === 'raise' || action.type === 'allin';
  const bbs = (view.stack + view.committed) / view.bb;
  const live = view.opponents.filter(o => !o.folded && !o.out).length;
  for (const o of opts) {
    const id = o.ab.def.id;
    let want = false;
    switch (id) {
      case 'war_drums': want = aggressive; break;
      case 'forced_march': want = aggressive && eq * (live + 1) > 1.5; break;
      case 'gladiators_oath': want = bbs < 15; break;
      case 'mask_of_janus': want = aggressive && eq < 0.4 && view.street !== 'preflop'; break;
      case 'thunder_of_jupiter': want = aggressive && view.pot > 6 * view.bb; break;
      case 'decimation': want = aggressive && eq > 0.68; break;
      case 'fortress_wall': want = action.type === 'call' && view.legal.toCall > 4 * view.bb && eq > 0.3; break;
      case 'veto': want = m.arsenal[seat].resolve >= 6 && view.pot > 10 * view.bb; break;
      case 'brutus_dagger': {
        const lead = view.opponents.filter(x => !x.out).reduce((a, b) => b.stack > a.stack ? b : a, view.opponents[0]);
        want = !lead.folded && lead.stack > view.stack && eq > 0.55; break;
      }
      case 'sponsors_mark': want = m.arsenal[seat].resolve >= 7; break;
      case 'tempo_strike': want = aggressive && eq > 0.5; break;
      case 'blockade': want = aggressive && abilitiesOf(m, seat).some(a => /gambit|siege|tyranny|tempo|wrath|formation|charge/.test(a.def.id)); break;
      case 'tactical_retreat': want = action.type === 'call' && eq < 0.45 && view.pot > 6 * view.bb; break;
      case 'interdict': want = m.arsenal[seat].resolve >= 6; break;
      case 'smoke_screen': want = aggressive && eq < 0.45; break;
      case 'call_the_bluff': want = action.type === 'call'; break;
      case 'charge_of_equites': want = aggressive && eq * (live + 1) > 1.4; break;
      case 'desperate_gambit': want = aggressive || action.type === 'call'; break;
      case 'final_table_nerves': want = m.arsenal[seat].resolve >= 4; break;
      default: want = false;
    }
    if (want && rng.chance(0.85)) {
      // re-check affordability after previous arms
      const again = armable(m, seat).find(a => a.ab.def.id === id);
      if (again?.ok) activate(m, seat, id);
    }
  }
}

/** Advance the match by one AI decision (or start a hand). Returns false if waiting on the human or done. */
export function step(m: MatchState): boolean {
  if (m.done) return false;
  const t = m.table;
  if (!t.handActive) { beginHand(m); return true; }
  const seat = t.toAct;
  if (seat < 0) return false;
  if (m.players[seat].isHuman) return false;
  const rng = new Rng(mix(m.seed, 'ai', t.handNo, seat, t.log.length));
  const view = buildView(m, seat);
  const infoCount = m.players[seat].loadout.filter(l => ABILITY_MAP[l.defId]?.archetype === 'information').length;
  const prof = infoCount ? { ...m.players[seat].profile, skill: Math.min(1, m.players[seat].profile.skill + 0.04 * infoCount) } : m.players[seat].profile;
  const av = m.players[seat].aiVersion;
  const d = (av === 1 ? decideV1 : av === 2 ? decideV2 : decide)(view, prof, rng, m.aiIters);
  aiArm(m, seat, view, d.equity, d.action, rng);
  try { act(m, seat, d.action); }
  catch {
    // Defensive fallback: never stall on an illegal AI action
    const L = legalActions(t, seat);
    act(m, seat, L.canCheck ? { type: 'check' } : { type: 'fold' });
  }
  return true;
}

export function humanTurn(m: MatchState): number {
  const t = m.table;
  if (m.done || !t.handActive || t.toAct < 0) return -1;
  return m.players[t.toAct].isHuman ? t.toAct : -1;
}

/** Run an AI-only match to completion (or until a human must act). */
export function runUntilBlocked(m: MatchState, maxSteps = 100000): void {
  for (let i = 0; i < maxSteps && step(m); i++) { /* loop */ }
}

/** Play AI decisions until the current hand finishes. */
export function runHand(m: MatchState): void {
  if (m.done) return;
  if (!m.table.handActive) beginHand(m);
  let guard = 0;
  while (m.table.handActive && guard++ < 1000) { if (!step(m)) break; }
}

export function rewardMultiplierPct(m: MatchState, seat: number): number {
  return Math.min(20, m.arsenal[seat].rewardPct);
}

export type { AbilityDef };
