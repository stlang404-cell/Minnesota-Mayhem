/** 3.0 rule engine: evaluates declarative rule abilities at fixed hooks. Deterministic; bounded effects only. */
import { ABILITY_MAP, ResolvedAbility } from './abilities';
import type { Rule, RuleEffect, Trigger } from './abilities3';
import type { EndCtx, Eff } from './arsenal2';
import { categoryOf, evaluate } from './handEval';
import type { MatchState } from './match';
import { abilitiesOf, consume, emit, gainResolve, hasSyn, usesLeft } from './match';

const ruleOf = (a: ResolvedAbility): Rule | undefined => (a.def as any).rule;

export interface RuleCtx { trigger: Trigger; end?: EndCtx; effects: Eff[]; bb: number }

function condOk(m: MatchState, o: number, rule: Rule, ab: ResolvedAbility, c: RuleCtx): boolean {
  const k = rule.cond;
  const t = m.table;
  const A = m.arsenal[o];
  const startBB = (t.seats[o].startStack ?? t.seats[o].stack) / c.bb;
  const live = t.seats.filter(s => !s.out).length;
  if (!k) return true;
  if (k.armed && !A.armed.includes(ab.def.id)) return false;
  if (k.short !== undefined && startBB > k.short) return false;
  if (k.deep !== undefined && startBB < k.deep) return false;
  if (k.maxPlayers !== undefined && live > k.maxPlayers) return false;
  if (k.minHand !== undefined && t.handNo < k.minHand) return false;
  if (k.streak !== undefined && A.consecWins < k.streak) return false;
  if (k.lateLevel !== undefined && t.levelIndex < k.lateLevel) return false;
  if (k.leader && m.track.chipLeader !== o) return false;
  if (k.notLeader && m.track.chipLeader === o) return false;
  if (k.weakOnly) { const s = t.seats[o]; if (s.hole.length < 2 || t.board.length < 3 || categoryOf(evaluate([...s.hole, ...t.board])) > 1) return false; }
  if (k.highCardOnly) { const s = t.seats[o]; if (s.hole.length < 2 || t.board.length < 3 || categoryOf(evaluate([...s.hole, ...t.board])) !== 0) return false; }
  return true;
}

function triggered(m: MatchState, o: number, trig: Trigger, c: RuleCtx): boolean {
  if (trig !== c.trigger) {
    // hand-end triggers are all evaluated in the 'win' pass; map them
    if (c.trigger !== 'win') return false;
  }
  const e = c.end;
  const tr = m.track as any;
  if (trig === 'handStart' || trig === 'elimination' || trig === 'survive') return trig === c.trigger;
  if (!e) return false;
  const won = e.won[o], r = e.r;
  const allIn = m.table.seats[o].stack === 0 || r.contrib[o] >= m.table.seats[o].startStack;
  switch (trig) {
    case 'win': return won;
    case 'winShowdown': return r.showdown && won;
    case 'winUncontested': return r.uncontested && won;
    case 'loseShowdown': return e.sdLosers.includes(o);
    case 'foldPre': return m.track.foldStreet[o] === 'preflop';
    case 'foldPost': return !!m.track.foldStreet[o] && m.track.foldStreet[o] !== 'preflop';
    case 'allinWin': return won && (allIn || r.contrib[o] >= m.table.seats[o].startStack * 0.95);
    case 'multiwayWin': return won && Object.keys(r.scores).length >= 3;
    case 'riverWin': return won && m.track.riverAgg[o];
    case 'multiStreetWin': return won && r.uncontested && (tr.betStreets?.[o]?.length ?? 0) >= 2;
    case 'bigPotWin': return won && Math.max(...r.pots.map(p => p.amount)) >= 15 * e.bb;
    case 'checkRaiseWin': return won && !!tr.checkRaise?.[o];
    case 'threeBetWin': return won && !!tr.threeBet?.[o];
  }
  return false;
}

function targets(m: MatchState, o: number, eff: RuleEffect, c: RuleCtx): number[] {
  const e = c.end;
  const t = m.table;
  switch (eff.target) {
    case 'losers': return e ? t.seats.map((_, i) => i).filter(i => i !== o && e.net[i] < 0 && e.r.contrib[i] > 0) : [];
    case 'folders': return e ? e.postFolders(o) : [];
    case 'sdLosers': return e ? e.sdLosers.filter(i => i !== o) : [];
    case 'bettors': return e ? e.sdLosers.filter(i => i !== o && m.track.riverAgg[i]) : [];
    case 'leader': return e && m.track.chipLeader !== o && e.sdLosers.includes(m.track.chipLeader) ? [m.track.chipLeader] : [];
    case 'shortest': { const lv = t.seats.map((_, i) => i).filter(i => !t.seats[i].out && i !== o); return lv.length ? [lv.reduce((a, b) => (t.seats[b].stack < t.seats[a].stack ? b : a))] : []; }
  }
  return [];
}

function apply(m: MatchState, o: number, ab: ResolvedAbility, eff: RuleEffect, value: number, c: RuleCtx): boolean {
  const A = m.arsenal[o];
  const label = ab.def.name;
  switch (eff.kind) {
    case 'tribute': {
      const tg = targets(m, o, eff, c);
      if (!tg.length) return false;
      let v = value;
      if (ab.def.id === 'emperors_feint' && hasSyn(m, o, 'emperors_gambit')) v += 0.5;
      if (ab.def.id === 'senate_reversal' && hasSyn(m, o, 'senate_overturned')) v += 0.5;
      tg.forEach(j => c.effects.push({ prio: 1, owner: o, from: j, to: o, bb: v, source: ab.def.id, label }));
      return true;
    }
    case 'restitution': {
      const e = c.end; if (!e || e.bigWinner === o) return false;
      c.effects.push({ prio: 2, owner: o, from: e.bigWinner, to: o, bb: Math.min(eff.cap ?? 1.5, (e.r.contrib[o] * value) / c.bb), source: ab.def.id, label });
      return true;
    }
    case 'resolve': gainResolve(m, o, Math.round(value)); return true;
    case 'ward': A.wardsLeft += Math.round(value); return true;
    case 'waiver': A.pendingWaivers = Math.min(2, A.pendingWaivers + 1); return true;
    case 'reward': A.rewardPct += value + (ab.def.id === 'golden_conspiracy' && hasSyn(m, o, 'golden_cabal') ? 3 : 0); return true;
  }
  return false;
}

/** Evaluate every rule ability of every live seat for a trigger. One trigger per ability per call (stacking limit). */
export function runRules(m: MatchState, trigger: Trigger, c: Omit<RuleCtx, 'trigger'>, onlySeat?: number) {
  const t = m.table;
  for (let o = 0; o < t.seats.length; o++) {
    if (onlySeat !== undefined && o !== onlySeat) continue;
    if (t.seats[o].out && trigger !== 'elimination') continue;
    for (const ab of abilitiesOf(m, o)) {
      const rule = ruleOf(ab);
      if (!rule) continue;
      const ctx: RuleCtx = { ...c, trigger };
      if (!triggered(m, o, rule.trigger, ctx)) continue;
      if (!condOk(m, o, rule, ab, ctx)) continue;
      if (!usesLeft(m, o, ab)) continue;
      // per-trigger extra gating
      if (rule.trigger === 'handStart') {
        const x = (m.arsenal[o].x ??= {});
        const startAt = rule.cond?.minHand ?? 1;
        const at = ab.def.id === 'frozen_bastion' && hasSyn(m, o, 'frozen_throne') ? 18 : startAt;
        const every = ab.def.id === 'frozen_dominion' ? 10 : 0;
        const due = every ? t.handNo >= at && (t.handNo - at) % every === 0 : t.handNo === at;
        if (!due || x[`rule:${ab.def.id}:${t.handNo}`]) continue;
        x[`rule:${ab.def.id}:${t.handNo}`] = 1;
      }
      if (ab.def.id === 'cold_reading') { const x = (m.arsenal[o].x ??= {}); x.cold = (x.cold ?? 0) + 1; if (x.cold % 2) continue; }
      const did = apply(m, o, ab, rule.effect, ab.value, ctx);
      if (!did) continue;
      if (rule.effect2) apply(m, o, ab, rule.effect2, rule.effect2.value, ctx);
      if (ab.uses > 0) consume(m, o, ab); else m.arsenal[o].triggers++;
      if (rule.effect.kind !== 'tribute' && rule.effect.kind !== 'restitution') emit(m, o, 'ability', `${ab.def.name} (${t.seats[o].name})`, ab.def.id);
    }
  }
}

export function comboStart(m: MatchState, seat: number) {
  if (hasSyn(m, seat, 'legions_vow')) m.arsenal[seat].wardsLeft += 2;
  if (hasSyn(m, seat, 'frozen_throne')) m.arsenal[seat].wardsLeft += 1;
}
export const golden_cabal_discount = (m: MatchState, seat: number, id: string) => (id === 'golden_conspiracy' && hasSyn(m, seat, 'golden_cabal') ? -1 : 0);
export { ABILITY_MAP };
