/**
 * Imperial Ascension ability handlers. Every handler is invoked from a fixed hook in match.ts
 * and only produces the same bounded primitives as v1 (tribute, restitution, resolve, waiver,
 * ward, reward, insight). Hooks run in this order each hand:
 *   handStart → (actions: onAct / onArm) → handEnd (queue effects) → resolveEffects
 *   (tributeGuard / tributeMultiplier applied per effect) → onElimination.
 */
import { ABILITY_MAP, ResolvedAbility } from './abilities';
import type { MatchState } from './match';
import { consume, emit, gainResolve, has, hasSyn, usesLeft } from './match';
import type { HandResult, Street } from './poker';

export interface Eff { prio: 1 | 2; owner: number; from: number; to: number; bb: number; source: string; label: string }

export interface EndCtx {
  r: HandResult; bb: number; net: number[]; won: boolean[]; sdLosers: number[]; bigWinner: number;
  postFolders: (o: number) => number[]; effects: Eff[];
}

const X = (m: MatchState, s: number) => (m.arsenal[s].x ??= {});
const ok = (m: MatchState, s: number, id: string) => { const a = has(m, s, id); return a && usesLeft(m, s, a) ? a : undefined; };
const live = (m: MatchState) => m.table.seats.map((_, i) => i).filter(i => !m.table.seats[i].out);
const losersWithChips = (m: MatchState, o: number, c: EndCtx) => m.table.seats.map((_, i) => i).filter(i => i !== o && c.net[i] < 0 && c.r.contrib[i] > 0);

/** Pre-hand passives (after Resolve tick, before blinds are posted). */
export function handStart(m: MatchState, seat: number, nextHand: number, leader: number, effects: Eff[]) {
  const t = m.table;
  const lv = live(m);
  const x = X(m, seat);
  let a: ResolvedAbility | undefined;
  const shortest = lv.reduce((p, c) => (t.seats[c].stack < t.seats[p].stack ? c : p), lv[0]);
  for (const id of ['bubble_lord', 'iron_executioner']) {
    if ((a = ok(m, seat, id)) && lv.length <= 3 && seat === leader && shortest !== seat) {
      consume(m, seat, a);
      effects.push({ prio: 1, owner: seat, from: shortest, to: seat, bb: id === 'bubble_lord' ? a.value : 0.4, source: id, label: a.def.name });
    }
  }
  if ((a = ok(m, seat, 'endurance_pact')) && nextHand > 1 && (nextHand - 1) % a.value === 0) {
    consume(m, seat, a); m.arsenal[seat].wardsLeft++;
    if (hasSyn(m, seat, 'last_legion')) gainResolve(m, seat, 1);
    emit(m, seat, 'ability', `${t.seats[seat].name}'s Endurance Pact: +1 Ward`, a.def.id);
  }
  for (const id of ['cartographer', 'oracles_ledger']) {
    if ((a = ok(m, seat, id)) && nextHand === 21) {
      consume(m, seat, a); gainResolve(m, seat, id === 'cartographer' ? a.value : 3); m.arsenal[seat].wardsLeft += 2;
      emit(m, seat, 'ability', `${a.def.name}: the table is mapped (+Resolve, +2 Wards)`, id);
    }
  }
  x.emberUsed = 0;
}

/** After blinds are posted. */
export function blindsPosted(m: MatchState) {
  const t = m.table;
  for (const s of [t.sbSeat, t.bbSeat]) {
    const a = has(m, s, 'iron_ration');
    if (!a) continue;
    if (t.seats[s].stack + t.seats[s].totalIn < 12 * t.level.bb) {
      const x = X(m, s);
      x.shortBlinds = (x.shortBlinds ?? 0) + 1;
      if (x.shortBlinds % a.value === 0) { m.arsenal[s].pendingWaivers = Math.min(2, m.arsenal[s].pendingWaivers + 1); emit(m, s, 'ability', `Iron Ration: next blind waived`, 'iron_ration'); }
    }
  }
}

/** Observe an executed action (public information only). */
export function onAct(m: MatchState, seat: number, kind: string, street: Street, info: { betBefore: number; aggressorBefore: number; facing: boolean; preFolds: number; firstVol: boolean }) {
  const tr = m.track as any;
  tr.checkStreet ??= []; tr.checkRaise ??= []; tr.threeBet ??= []; tr.calledPre ??= []; tr.foldsTo ??= []; tr.hunter ??= [];
  if (kind === 'check') tr.checkStreet[seat] = street;
  if ((kind === 'raise' || kind === 'bet') && tr.checkStreet[seat] === street) tr.checkRaise[seat] = true;
  if ((kind === 'raise' || kind === 'bet') && street !== 'preflop') { const bs = ((tr.betStreets ??= [])[seat] ??= []); if (!bs.includes(street)) bs.push(street); }
  if (kind === 'raise' && street === 'preflop' && info.betBefore > m.table.level.bb) tr.threeBet[seat] = true;
  if (kind === 'call' && street === 'preflop') tr.calledPre[seat] = true;
  if (kind === 'fold' && street !== 'preflop' && info.facing && info.aggressorBefore >= 0) tr.foldsTo[info.aggressorBefore] = (tr.foldsTo[info.aggressorBefore] ?? 0) + 1;
  if (info.firstVol && (kind === 'call' || kind === 'raise' || kind === 'bet') && info.preFolds >= 4) tr.hunter[seat] = true;
}

/** An opponent armed an ability (arming is visible to the table). */
export function onArm(m: MatchState, seat: number, defId: string) {
  for (const o of live(m)) {
    if (o === seat) continue;
    const a = ok(m, o, 'overwatch');
    if (a) { consume(m, o, a); gainResolve(m, o, a.value); emit(m, o, 'ability', `Overwatch: ${m.table.seats[o].name} +${a.value} Resolve`, 'overwatch'); }
  }
  const x = X(m, seat);
  x[`armed:${defId}`] = m.table.handNo;
  if (defId === 'interdict') { const a = has(m, seat, 'interdict')!; m.arsenal[seat].wardsLeft += a.value; }
  if (defId === 'tell_reader') {
    const t = m.table;
    m.arsenal[seat].insight = {
      ...(m.arsenal[seat].insight?.hand === t.handNo ? m.arsenal[seat].insight : { hand: t.handNo }),
      tells: live(m).filter(i => i !== seat).map(i => {
        const st = m.stats[i];
        return { seat: i, aggr: st.aggr / Math.max(1, st.aggr + st.passive), f2r: st.foldToRaiseOpp ? st.foldToRaise / st.foldToRaiseOpp : -1, bluffs: st.bluffsShown, hands: st.hands };
      }),
    } as any;
  }
  x.lapDiscount = 0; // Victory Lap discount is spent on the next active
}

/** Extra cost / condition rules for actives. Returns cost delta and an optional block reason. */
export function armRules(m: MatchState, seat: number, ab: ResolvedAbility): { delta: number; reason?: string } {
  const t = m.table;
  const x = X(m, seat);
  let delta = 0;
  const id = ab.def.id;
  if (ab.def.cooldown) {
    const last = x[`armed:${id}`];
    if (last !== undefined && t.handNo - last < ab.def.cooldown) return { delta, reason: `Cooldown: ${ab.def.cooldown - (t.handNo - last)} hand(s)` };
  }
  if (x.lapDiscount) delta -= x.lapDiscount;
  if (id === 'mask_of_janus' && hasSyn(m, seat, 'imperial_conspiracy')) delta -= 1;
  if (id === 'thunder_of_jupiter' && hasSyn(m, seat, 'senate_collapse')) delta -= 2;
  if (id === 'tell_reader' && hasSyn(m, seat, 'night_watch')) delta -= 9;
  if (id === 'golden_conspiracy' && hasSyn(m, seat, 'golden_cabal')) delta -= 1;
  const bbs = (t.seats[seat].stack + t.seats[seat].committed) / t.level.bb;
  if (id === 'final_table_nerves' && live(m).length > 3) return { delta, reason: 'Only with 3 or fewer players' };
  if (id === 'desperate_gambit' && bbs >= 6) return { delta, reason: 'Only below 6 BB' };
  if (id === 'call_the_bluff' && t.currentBet - t.seats[seat].committed <= 0) return { delta, reason: 'Only when facing a river bet' };
  return { delta };
}

/** End-of-hand triggers for the expansion abilities. */
export function handEnd(m: MatchState, o: number, c: EndCtx) {
  const t = m.table;
  const tr = m.track as any;
  const A = m.arsenal[o];
  const x = X(m, o);
  const armed = (id: string) => A.armed.includes(id);
  const r = c.r;
  const won = c.won[o];
  const winUnc = r.uncontested && won;
  const winSd = r.showdown && won;
  const trib = (a: ResolvedAbility, from: number, bb: number, label = a.def.name) => c.effects.push({ prio: 1, owner: o, from, to: o, bb, source: a.def.id, label });
  let a: ResolvedAbility | undefined;

  if (won) x.pots = (x.pots ?? 0) + 1;
  if ((a = has(m, o, 'ante_collector')) && won && t.level.ante > 0) { gainResolve(m, o, a.value); emit(m, o, 'ability', `Ante Collector: +${a.value} Resolve`, a.def.id); }
  if ((a = has(m, o, 'dividend')) && won && x.pots % 5 === 0) { A.rewardPct += a.value; emit(m, o, 'ability', `Dividend: +${a.value}% prize`, a.def.id); }
  if (armed('tempo_strike') && (a = has(m, o, 'tempo_strike')) && won) losersWithChips(m, o, c).forEach(j => trib(a!, j, a!.value));
  if ((a = has(m, o, 'feint_line')) && won && tr.checkRaise?.[o]) { gainResolve(m, o, a.value); emit(m, o, 'ability', `Feint Line: +${a.value} Resolve`, a.def.id); }
  if (armed('tactical_retreat') && (a = has(m, o, 'tactical_retreat')) && m.track.foldStreet[o] && c.bigWinner !== o) {
    c.effects.push({ prio: 2, owner: o, from: c.bigWinner, to: o, bb: Math.min(1.5, (r.contrib[o] * a.value) / c.bb), source: a.def.id, label: 'Tactical Retreat' });
  }
  const whisper = has(m, o, 'senate_whisper');
  if (whisper && (tr.foldsTo?.[o] ?? 0) >= (hasSyn(m, o, 'senate_collapse') ? 1 : 2)) { gainResolve(m, o, whisper.value); emit(m, o, 'ability', `Senate Whisper: +${whisper.value} Resolve`, 'senate_whisper'); }
  if (armed('smoke_screen') && winUnc) { A.pendingWaivers = Math.min(2, A.pendingWaivers + 1); emit(m, o, 'ability', 'Smoke Screen: next blind waived', 'smoke_screen'); }
  // Relentless: streak of preflop-raise wins
  if (m.track.raisedPre[o]) x.raiseStreak = won ? (x.raiseStreak ?? 0) + 1 : 0;
  else if (won || !m.track.foldStreet[o]) x.raiseStreak = 0;
  if ((a = ok(m, o, 'relentless')) && won && x.raiseStreak >= 3) {
    const f = t.seats.map((_, i) => i).filter(i => i !== o && m.track.foldStreet[i] === 'preflop' && r.contrib[i] > 0);
    if (f.length) { consume(m, o, a); f.forEach(j => trib(a!, j, a!.value)); }
    x.raiseStreak = 0;
  }
  if ((a = has(m, o, 'shield_bash')) && won && tr.threeBet?.[o]) { gainResolve(m, o, a.value); emit(m, o, 'ability', `Shield Bash: +${a.value} Resolve`, a.def.id); }
  if ((a = ok(m, o, 'patient_hunter')) && won && tr.hunter?.[o]) {
    const l = losersWithChips(m, o, c);
    if (l.length) { consume(m, o, a); l.forEach(j => trib(a!, j, a!.value)); }
  }
  if (armed('call_the_bluff') && (a = has(m, o, 'call_the_bluff')) && winSd) {
    const bettors = c.sdLosers.filter(j => m.track.riverAgg[j]);
    bettors.forEach(j => trib(a!, j, a!.value));
  }
  // Grudge: same opponent beats you twice in a row
  if (c.net[o] < 0 && !won) {
    const beater = c.bigWinner;
    if (x.grudgeBy === beater) x.grudgeN = (x.grudgeN ?? 0) + 1; else { x.grudgeBy = beater; x.grudgeN = 1; }
    if ((a = ok(m, o, 'grudge')) && x.grudgeN >= 2) { consume(m, o, a); gainResolve(m, o, a.value); A.wardsLeft++; x.grudgeN = 0; emit(m, o, 'ability', `Grudge against ${t.seats[beater].name}: +${a.value} Resolve, +1 Ward`, a.def.id); }
  } else if (won) x.grudgeN = 0;
  if ((a = has(m, o, 'victory_lap')) && winSd) { x.lapDiscount = a.value; emit(m, o, 'ability', `Victory Lap: next active −${a.value} Resolve`, a.def.id); }
  if (armed('charge_of_equites') && (a = has(m, o, 'charge_of_equites')) && won) {
    t.seats.map((_, i) => i).filter(i => i !== o && tr.calledPre?.[i] && c.net[i] < 0).forEach(j => trib(a!, j, a!.value));
  }
  if (armed('desperate_gambit') && (a = has(m, o, 'desperate_gambit')) && won) losersWithChips(m, o, c).forEach(j => trib(a!, j, a!.value));
  if (armed('final_table_nerves') && (a = has(m, o, 'final_table_nerves'))) { A.pendingWaivers = Math.max(A.pendingWaivers, Math.min(3, a.value)); emit(m, o, 'ability', 'Final Table Nerves: blinds waived', a.def.id); }
  if ((a = ok(m, o, 'phantom_tempo')) && winUnc) {
    const l = losersWithChips(m, o, c);
    if (l.length) { consume(m, o, a); l.forEach(j => trib(a!, j, a!.value)); }
    x.phantomWins = (x.phantomWins ?? 0) + 1;
    if (x.phantomWins % 3 === 0) A.pendingWaivers = Math.min(2, A.pendingWaivers + 1);
  }
  if ((a = ok(m, o, 'eternal_flame'))) {
    const below = t.seats[o].stack > 0 && t.seats[o].stack < 8 * c.bb;
    if (below && !x.flameBelow) { consume(m, o, a); gainResolve(m, o, a.value); emit(m, o, 'ability', `Eternal Flame: +${a.value} Resolve`, a.def.id); }
    x.flameBelow = below ? 1 : 0;
  }
}

/** Called for each tribute before it is paid. Returns true if negated. */
export function tributeGuard(m: MatchState, e: Eff): boolean {
  const t = m.table;
  const lv = live(m);
  const shortest = lv.reduce((p, c) => (t.seats[c].stack < t.seats[p].stack ? c : p), lv[0]);
  if (e.from !== shortest) return false;
  const x = X(m, e.from);
  for (const id of ['ember_guard', 'eternal_flame']) {
    const a = has(m, e.from, id);
    if (!a) continue;
    const perHand = id === 'ember_guard' ? a.value : 1;
    if ((x.emberUsed ?? 0) < perHand && (id === 'eternal_flame' || usesLeft(m, e.from, a))) {
      x.emberUsed = (x.emberUsed ?? 0) + 1;
      if (id === 'ember_guard') consume(m, e.from, a);
      emit(m, e.from, 'ability', `${a.def.name} shields ${t.seats[e.from].name} from ${e.label}`, id);
      return true;
    }
  }
  return false;
}

/** Multiplier / bonus applied to a tribute's size before caps. */
export function tributeBonus(m: MatchState, e: Eff): number {
  let bb = e.bb;
  if (hasSyn(m, e.to, 'imperial_conspiracy') && (e.source === 'caesars_gambit' || e.source === 'senates_betrayal')) bb += 0.25;
  if (hasSyn(m, e.to, 'caesars_ascension')) bb += 0.25;
  if (m.arsenal[e.to].armed.includes('blockade')) bb *= has(m, e.to, 'blockade')?.value ?? 1;
  return bb;
}

/** A player was eliminated; `killer` is the hand's biggest winner. */
export function onElimination(m: MatchState, busted: number, killer: number) {
  for (const s of live(m)) {
    const sp = has(m, s, 'survivors_purse');
    if (sp) m.arsenal[s].rewardPct += sp.value;
  }
  if (killer >= 0 && !m.table.seats[killer].out) {
    for (const id of ['executioner', 'iron_executioner']) {
      const a = ok(m, killer, id);
      if (a) { consume(m, killer, a); gainResolve(m, killer, a.value); m.arsenal[killer].rewardPct += a.value; emit(m, killer, 'ability', `${a.def.name}: +${a.value} Resolve, +${a.value}% prize`, id); }
    }
  }
}

/** Match-start setup for expansion passives and combos. */
export function matchStart(m: MatchState, seat: number) {
  const A = m.arsenal[seat];
  A.x ??= {};
  if (hasSyn(m, seat, 'frozen_empire')) A.wardsLeft += 2;
  if (hasSyn(m, seat, 'golden_legion')) A.rewardPct += 5;
  if (hasSyn(m, seat, 'caesars_ascension')) A.resolve = Math.min(10, A.resolve + 1);
  const bi = has(m, seat, 'bankroll_insurance'); if (bi) A.x.insurancePct = bi.value;
  const ol = has(m, seat, 'oracles_ledger'); if (ol) A.rebatePct = Math.max(A.rebatePct, ol.value);
  if (hasSyn(m, seat, 'legions_vow')) A.wardsLeft += 2;
  if (hasSyn(m, seat, 'frozen_throne')) A.wardsLeft += 1;
}

/** Extra uses granted by combos. */
export function extraUses(m: MatchState, seat: number, id: string): number {
  if (id === 'frozen_legion' && hasSyn(m, seat, 'frozen_empire')) return 2;
  return 0;
}
export const formationThreshold = (m: MatchState, seat: number) => (hasSyn(m, seat, 'golden_legion') ? 2 : 3);
export { ABILITY_MAP };
