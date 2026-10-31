/**
 * 3.0 "Legendary Arsenal": declarative rule abilities. Each = trigger + conditions + effect(+target).
 * Resolved by the rule engine in arsenal3.ts through the same bounded primitives and caps as v1/v2.
 */
import type { AbilityDef } from './abilities';

export type Trigger = 'win' | 'winShowdown' | 'winUncontested' | 'loseShowdown' | 'foldPre' | 'foldPost' | 'allinWin' | 'multiwayWin'
  | 'riverWin' | 'multiStreetWin' | 'bigPotWin' | 'handStart' | 'elimination' | 'survive' | 'checkRaiseWin' | 'threeBetWin';
export interface RuleCond { short?: number; deep?: number; leader?: boolean; notLeader?: boolean; maxPlayers?: number; minHand?: number; armed?: boolean; streak?: number; lateLevel?: number; highCardOnly?: boolean; weakOnly?: boolean }
export interface RuleEffect { kind: 'tribute' | 'resolve' | 'ward' | 'waiver' | 'reward' | 'restitution'; target?: 'losers' | 'folders' | 'sdLosers' | 'leader' | 'shortest' | 'bettors'; cap?: number }
export interface Rule { trigger: Trigger; cond?: RuleCond; effect: RuleEffect; effect2?: RuleEffect & { value: number } }
export type RuleAbility = AbilityDef & { rule: Rule };

const BB = (v: number) => `${v} BB`;
const A = (x: Omit<RuleAbility, 'kind' | 'cost' | 'uses'> & Partial<Pick<RuleAbility, 'kind' | 'cost' | 'uses'>>): RuleAbility => ({ kind: 'passive', cost: 0, uses: 0, ...x } as RuleAbility);

export const RULE_ABILITIES: RuleAbility[] = [
  // ---- BLUFF / Imperial Deceiver
  A({ id: 'emperors_feint', name: "Emperor's Feint", archetype: 'bluff', rarity: 'epic', uses: 3, values: [0.75, 1, 1.25], rule: { trigger: 'multiStreetWin', cond: { weakOnly: true }, effect: { kind: 'tribute', target: 'folders' } },
    text: v => `Win uncontested after betting on two or more streets while holding one pair or less: each opponent who folded after the flop pays ${BB(v)}.`, counter: 'Call the second barrel.', price: 26000, unlockRank: 3 }),
  A({ id: 'veiled_threat', name: 'Veiled Threat', archetype: 'bluff', rarity: 'common', values: [1, 1, 2], rule: { trigger: 'winUncontested', cond: { maxPlayers: 3 }, effect: { kind: 'resolve' } },
    text: v => `With 3 or fewer players left, every uncontested win grants ${v} Resolve.`, counter: 'Defend more when short-handed.', price: 5000, unlockRank: 0 }),
  A({ id: 'gilded_lie', name: 'Gilded Lie', archetype: 'bluff', rarity: 'rare', uses: 3, values: [4, 5, 6], rule: { trigger: 'winUncontested', cond: { highCardOnly: true }, effect: { kind: 'reward' } },
    text: v => `Win a pot uncontested holding only high card (a successful bluff): +${v}% Dollar prize (shared +20% cap).`, counter: 'Bluff-catch more.', price: 12000, unlockRank: 1 }),
  A({ id: 'mirage', name: 'Mirage', archetype: 'bluff', rarity: 'common', kind: 'active', cost: 1, window: 'postflop', cooldown: 4, values: [1, 1, 1], rule: { trigger: 'winUncontested', cond: { armed: true }, effect: { kind: 'ward' } },
    text: () => `Arm after the flop (4-hand cooldown). If you win uncontested, gain 1 Ward.`, counter: 'Make them show.', price: 6000, unlockRank: 0 }),
  // ---- PRESSURE / Relentless Aggressor
  A({ id: 'battering_ram', name: 'Battering Ram', archetype: 'pressure', rarity: 'rare', uses: 4, values: [0.5, 0.6, 0.75], rule: { trigger: 'threeBetWin', effect: { kind: 'tribute', target: 'losers' } },
    text: v => `Win a hand in which you 3-bet preflop: every opponent who lost chips pays ${BB(v)}.`, counter: 'Four-bet or fold quickly.', price: 13000, unlockRank: 1 }),
  A({ id: 'storm_the_walls', name: 'Storm the Walls', archetype: 'pressure', rarity: 'common', values: [2, 2, 3], rule: { trigger: 'bigPotWin', cond: { deep: 20 }, effect: { kind: 'resolve' } },
    text: v => `Win a pot of 15+ BB while holding 20+ BB: gain ${v} Resolve.`, counter: 'Keep pots small against a big stack.', price: 5000, unlockRank: 0 }),
  A({ id: 'press_the_line', name: 'Press the Line', archetype: 'pressure', rarity: 'epic', kind: 'active', cost: 2, window: 'any', cooldown: 4, uses: 4, values: [0.5, 0.75, 1], rule: { trigger: 'riverWin', cond: { armed: true }, effect: { kind: 'tribute', target: 'sdLosers' } },
    text: v => `Arm (4-hand cooldown). If you bet the river and win, each showdown loser pays ${BB(v)}.`, counter: 'Fold rivers against an armed presser.', price: 24000, unlockRank: 3 }),
  A({ id: 'iron_tide', name: 'Iron Tide', archetype: 'pressure', rarity: 'rare', values: [1, 1, 2], rule: { trigger: 'win', cond: { streak: 3 }, effect: { kind: 'resolve' }, effect2: { kind: 'ward', value: 1 } },
    text: v => `On a 3+ hand winning streak, every further win grants ${v} Resolve and 1 Ward.`, counter: 'Break the streak.', price: 13000, unlockRank: 2 }),
  // ---- DISCIPLINE / Disciplined Professional
  A({ id: 'measured_patience', name: 'Measured Patience', archetype: 'discipline', rarity: 'common', values: [1, 1, 1], rule: { trigger: 'foldPre', cond: { deep: 25 }, effect: { kind: 'resolve' } },
    text: () => `Fold preflop while holding 25+ BB: gain 1 Resolve (deep-stacked patience).`, counter: 'Raise their blinds relentlessly.', price: 5000, unlockRank: 0 }),
  A({ id: 'sentinel_oath', name: "Sentinel's Oath", archetype: 'discipline', rarity: 'rare', uses: 3, values: [0.2, 0.25, 0.3], rule: { trigger: 'loseShowdown', cond: { deep: 15 }, effect: { kind: 'restitution', cap: 1.5 } },
    text: v => `Lose a showdown while holding 15+ BB: the winner refunds ${Math.round(v * 100)}% of your contribution (max 1.5 BB).`, counter: 'Value-bet relentlessly.', price: 12000, unlockRank: 1 }),
  A({ id: 'cold_reading', name: 'Cold Reading', archetype: 'discipline', rarity: 'common', values: [1, 1, 2], rule: { trigger: 'foldPost', effect: { kind: 'resolve' } },
    text: v => `Every time you fold after the flop, gain ${v} Resolve (every 2nd fold).`, counter: 'Check more; bet less.', price: 5000, unlockRank: 0 }),
  A({ id: 'frozen_bastion', name: 'Frozen Bastion', archetype: 'discipline', rarity: 'epic', uses: 2, values: [2, 2, 3], rule: { trigger: 'handStart', cond: { minHand: 25 }, effect: { kind: 'ward' } },
    text: v => `At hand 25, gain ${v} Wards (once per match… twice at higher levels).`, counter: 'End it early.', price: 22000, unlockRank: 3 }),
  // ---- COUNTERPLAY / Counterplay Master
  A({ id: 'senate_reversal', name: 'Senate Reversal', archetype: 'counterplay', rarity: 'epic', uses: 3, values: [1, 1.25, 1.5], rule: { trigger: 'winShowdown', effect: { kind: 'tribute', target: 'bettors' } },
    text: v => `Win a showdown against an opponent who bet or raised on the river: each such opponent pays ${BB(v)} (accurately calling an aggressive line).`, counter: 'Only bet the river for value.', price: 24000, unlockRank: 3 }),
  A({ id: 'turncoat', name: 'Turncoat', archetype: 'counterplay', rarity: 'common', uses: 4, values: [0.5, 0.5, 0.75], rule: { trigger: 'winShowdown', cond: { notLeader: true }, effect: { kind: 'tribute', target: 'leader' } },
    text: v => `Not the chip leader: beat the leader at showdown and they pay ${BB(v)}.`, counter: 'Leaders: avoid marginal showdowns.', price: 6000, unlockRank: 0 }),
  A({ id: 'riposte', name: 'Riposte', archetype: 'counterplay', rarity: 'rare', kind: 'active', cost: 2, window: 'any', cooldown: 3, values: [0.5, 0.75, 1], rule: { trigger: 'checkRaiseWin', cond: { armed: true }, effect: { kind: 'tribute', target: 'losers' } },
    text: v => `Arm (3-hand cooldown). Check-raise and win: every opponent who lost chips pays ${BB(v)}.`, counter: 'Check behind more often.', price: 13000, unlockRank: 1 }),
  A({ id: 'oath_breaker', name: 'Oath Breaker', archetype: 'counterplay', rarity: 'common', values: [2, 2, 3], rule: { trigger: 'elimination', effect: { kind: 'resolve' } },
    text: v => `When you knock a player out, gain ${v} Resolve.`, counter: 'Survive.', price: 5000, unlockRank: 0 }),
  // ---- MOMENTUM / Legion Commander
  A({ id: 'legions_resolve', name: "Legion's Resolve", archetype: 'momentum', rarity: 'epic', values: [1, 1, 2], rule: { trigger: 'survive', cond: { lateLevel: 4 }, effect: { kind: 'resolve' }, effect2: { kind: 'ward', value: 1 } },
    text: v => `From blind level 5 on, each elimination you survive grants ${v} Resolve and 1 Ward.`, counter: 'Target them before the late levels.', price: 22000, unlockRank: 3 }),
  A({ id: 'charging_eagle', name: 'Charging Eagle', archetype: 'momentum', rarity: 'common', values: [0.25, 0.3, 0.4], uses: 6, rule: { trigger: 'win', cond: { streak: 2 }, effect: { kind: 'tribute', target: 'losers' } },
    text: v => `Win two hands in a row: on the second, every opponent who lost chips pays ${BB(v)}.`, counter: 'Contest their next hand.', price: 6000, unlockRank: 0 }),
  A({ id: 'triumphal_march', name: 'Triumphal March', archetype: 'momentum', rarity: 'rare', values: [1, 1, 1], uses: 3, rule: { trigger: 'bigPotWin', effect: { kind: 'waiver' } },
    text: () => `Win a pot of 15+ BB: your next blind is 50% waived.`, counter: 'Keep pots small.', price: 11000, unlockRank: 1 }),
  A({ id: 'standard_bearer', name: 'Standard Bearer', archetype: 'momentum', rarity: 'rare', values: [3, 4, 5], rule: { trigger: 'multiwayWin', effect: { kind: 'reward' } },
    text: v => `Win a three-way (or larger) showdown: +${v}% Dollar prize (shared cap).`, counter: 'Avoid multiway pots with them.', price: 12000, unlockRank: 2 }),
  // ---- ECONOMY / Golden Merchant
  A({ id: 'golden_conspiracy', name: 'Golden Conspiracy', archetype: 'economy', rarity: 'epic', kind: 'active', cost: 3, window: 'any', uses: 2, values: [5, 6, 8], rule: { trigger: 'allinWin', cond: { armed: true }, effect: { kind: 'reward' } },
    text: v => `Arm, then win an all-in this hand: +${v}% Dollar prize (shared +20% cap). A capped reward for a real risk.`, counter: 'Fold to armed shoves.', price: 25000, unlockRank: 3 }),
  A({ id: 'counting_house', name: 'Counting House', archetype: 'economy', rarity: 'common', values: [1, 1, 2], rule: { trigger: 'survive', effect: { kind: 'reward' } },
    text: v => `+${v}% Dollar prize for every elimination you survive (shared cap).`, counter: 'Eliminate them first.', price: 6000, unlockRank: 0 }),
  A({ id: 'trade_winds', name: 'Trade Winds', archetype: 'economy', rarity: 'rare', values: [1, 1, 2], rule: { trigger: 'winShowdown', cond: { deep: 30 }, effect: { kind: 'resolve' } },
    text: v => `Win a showdown holding 30+ BB: gain ${v} Resolve.`, counter: 'Make them shorter.', price: 10000, unlockRank: 1 }),
  A({ id: 'merchant_prince', name: 'Merchant Prince', archetype: 'economy', rarity: 'rare', values: [2, 3, 4], rule: { trigger: 'bigPotWin', effect: { kind: 'reward' } },
    text: v => `Win a pot of 15+ BB: +${v}% Dollar prize (shared cap).`, counter: 'Avoid big pots.', price: 12000, unlockRank: 2 }),
  // ---- COMEBACK / High-Risk Opportunist
  A({ id: 'all_or_nothing', name: 'All or Nothing', archetype: 'comeback', rarity: 'rare', uses: 3, values: [0.5, 0.6, 0.75], rule: { trigger: 'allinWin', cond: { short: 12 }, effect: { kind: 'tribute', target: 'sdLosers' } },
    text: v => `Win an all-in while at 12 BB or less: each showdown loser pays ${BB(v)}.`, counter: 'Respect short shoves.', price: 12000, unlockRank: 1 }),
  A({ id: 'gambler_saint', name: "Gambler's Saint", archetype: 'comeback', rarity: 'common', uses: 2, values: [2, 3, 4], rule: { trigger: 'loseShowdown', cond: { short: 10 }, effect: { kind: 'resolve' } },
    text: v => `Lose a showdown while at 10 BB or less (and survive): gain ${v} Resolve.`, counter: 'Finish them.', price: 5000, unlockRank: 0 }),
  A({ id: 'underworld_pact', name: 'Underworld Pact', archetype: 'comeback', rarity: 'epic', kind: 'active', cost: 2, window: 'preflop', uses: 2, values: [0.75, 1, 1.25], rule: { trigger: 'allinWin', cond: { armed: true, short: 8 }, effect: { kind: 'tribute', target: 'losers' } },
    text: v => `Arm preflop at 8 BB or less. Win the all-in: every opponent who lost chips pays ${BB(v)}.`, counter: 'Fold marginal hands to armed shoves.', price: 22000, unlockRank: 3 }),
  A({ id: 'rising_ember', name: 'Rising Ember', archetype: 'comeback', rarity: 'common', values: [1, 1, 2], rule: { trigger: 'win', cond: { short: 10 }, effect: { kind: 'resolve' } },
    text: v => `Win any pot while at 10 BB or less: gain ${v} Resolve.`, counter: 'Pressure short stacks early.', price: 5000, unlockRank: 0 }),
  // ---- INFORMATION
  A({ id: 'archivist', name: 'Archivist', archetype: 'information', rarity: 'common', values: [1, 1, 2], rule: { trigger: 'winShowdown', cond: { minHand: 15 }, effect: { kind: 'resolve' } },
    text: v => `After hand 15, every showdown win grants ${v} Resolve (you have learned the table).`, counter: 'Avoid showdowns late.', price: 5000, unlockRank: 0 }),
  A({ id: 'seers_veil', name: "Seer's Veil", archetype: 'information', rarity: 'rare', uses: 2, values: [1, 1, 2], rule: { trigger: 'handStart', cond: { minHand: 12 }, effect: { kind: 'ward' } },
    text: v => `At hand 12, gain ${v} Ward(s).`, counter: 'Pressure early.', price: 11000, unlockRank: 1 }),
  A({ id: 'augur_ledger', name: "Augur's Ledger", archetype: 'information', rarity: 'rare', values: [2, 3, 4], rule: { trigger: 'survive', cond: { maxPlayers: 3 }, effect: { kind: 'reward' } },
    text: v => `Reach the final three (and each elimination after): +${v}% Dollar prize (shared cap).`, counter: 'Eliminate them early.', price: 11000, unlockRank: 1 }),
  // ---- TOURNAMENT / Tournament Survivor
  A({ id: 'bubble_survivor', name: 'Bubble Survivor', archetype: 'tournament', rarity: 'common', values: [2, 3, 4], rule: { trigger: 'survive', cond: { maxPlayers: 3 }, effect: { kind: 'resolve' } },
    text: v => `When the field shrinks to 3 or fewer and you survive, gain ${v} Resolve.`, counter: 'Bust them on the bubble.', price: 5000, unlockRank: 0 }),
  A({ id: 'final_table_titan', name: 'Final Table Titan', archetype: 'tournament', rarity: 'epic', uses: 4, values: [0.4, 0.5, 0.6], rule: { trigger: 'winShowdown', cond: { maxPlayers: 2 }, effect: { kind: 'tribute', target: 'sdLosers' } },
    text: v => `Heads-up: every showdown you win costs your opponent an extra ${BB(v)}.`, counter: 'Avoid heads-up showdowns.', price: 24000, unlockRank: 3 }),
  A({ id: 'chip_and_chair', name: 'Chip and a Chair', archetype: 'tournament', rarity: 'rare', uses: 1, values: [0.3, 0.35, 0.4], rule: { trigger: 'loseShowdown', cond: { short: 6 }, effect: { kind: 'restitution', cap: 1 } },
    text: v => `Once per match, losing a showdown at 6 BB or less refunds ${Math.round(v * 100)}% of your contribution from the winner (max 1 BB).`, counter: 'Finish them cleanly.', price: 12000, unlockRank: 1 }),
  // ---- TACTICAL / Senate Manipulator
  A({ id: 'shifting_lines', name: 'Shifting Lines', archetype: 'tactical', rarity: 'common', values: [1, 1, 2], rule: { trigger: 'checkRaiseWin', effect: { kind: 'resolve' }, effect2: { kind: 'ward', value: 1 } },
    text: v => `Check-raise and win: gain ${v} Resolve and 1 Ward.`, counter: 'Check behind.', price: 6000, unlockRank: 0 }),
  A({ id: 'senate_manipulator', name: 'Senate Manipulator', archetype: 'tactical', rarity: 'epic', kind: 'active', cost: 3, window: 'preflop', cooldown: 5, uses: 3, values: [0.5, 0.6, 0.75], rule: { trigger: 'multiwayWin', cond: { armed: true }, effect: { kind: 'tribute', target: 'losers' } },
    text: v => `Arm preflop (5-hand cooldown). Win a 3-way (or larger) pot: every opponent who lost chips pays ${BB(v)}.`, counter: 'Avoid multiway pots with them.', price: 24000, unlockRank: 3 }),
  A({ id: 'ambush', name: 'Ambush', archetype: 'tactical', rarity: 'rare', kind: 'active', cost: 1, window: 'postflop', cooldown: 3, values: [1, 2, 2], rule: { trigger: 'riverWin', cond: { armed: true }, effect: { kind: 'resolve' } },
    text: v => `Arm after the flop (3-hand cooldown). Bet the river and win: gain ${v} Resolve.`, counter: 'Call fewer rivers.', price: 10000, unlockRank: 1 }),
  A({ id: 'feigned_retreat', name: 'Feigned Retreat', archetype: 'tactical', rarity: 'common', values: [0.15, 0.2, 0.25], uses: 4, rule: { trigger: 'foldPost', cond: { deep: 20 }, effect: { kind: 'restitution', cap: 1 } },
    text: v => `Fold after the flop holding 20+ BB: the winner refunds ${Math.round(v * 100)}% of your contribution (max 1 BB).`, counter: 'Win the pot earlier.', price: 6000, unlockRank: 0 }),
  // ---- 3.0 LEGENDARY FUSIONS (rule-based)
  A({ id: 'eternal_emperor', name: 'Eternal Emperor', archetype: 'bluff', rarity: 'legendary', uses: 5, values: [1, 1.25, 1.5], rule: { trigger: 'multiStreetWin', effect: { kind: 'tribute', target: 'folders' }, effect2: { kind: 'resolve', value: 2 } },
    text: v => `Win uncontested after betting two or more streets: each post-flop folder pays ${BB(v)} and you gain 2 Resolve.`, counter: 'Call the second barrel.', fusion: ['emperors_feint', 'gilded_lie'], price: 25000, unlockRank: 5 }),
  A({ id: 'frozen_dominion', name: 'Frozen Dominion', archetype: 'discipline', rarity: 'legendary', uses: 3, values: [2, 3, 3], rule: { trigger: 'handStart', cond: { minHand: 10 }, effect: { kind: 'ward' }, effect2: { kind: 'resolve', value: 2 } },
    text: v => `From hand 10, gain ${v} Wards and 2 Resolve (up to 3 times, every 10 hands).`, counter: 'Beat them in pots.', fusion: ['frozen_bastion', 'sentinel_oath'], price: 25000, unlockRank: 5 }),
  A({ id: 'imperial_legion', name: 'Imperial Legion', archetype: 'momentum', rarity: 'legendary', uses: 8, values: [0.4, 0.5, 0.6], rule: { trigger: 'win', cond: { streak: 2 }, effect: { kind: 'tribute', target: 'losers' }, effect2: { kind: 'ward', value: 1 } },
    text: v => `From your 2nd straight win on, every win taxes each loser ${BB(v)} and grants 1 Ward.`, counter: 'Break the streak.', fusion: ['charging_eagle', 'iron_tide'], price: 25000, unlockRank: 5 }),
  A({ id: 'grand_bazaar', name: 'Grand Bazaar', archetype: 'economy', rarity: 'legendary', values: [3, 4, 5], rule: { trigger: 'bigPotWin', effect: { kind: 'reward' }, effect2: { kind: 'resolve', value: 1 } },
    text: v => `Win a 15+ BB pot: +${v}% prize (shared cap) and 1 Resolve.`, counter: 'Keep pots small.', fusion: ['merchant_prince', 'counting_house'], price: 20000, unlockRank: 5 }),
  A({ id: 'phoenix_crown', name: 'Phoenix Crown', archetype: 'comeback', rarity: 'legendary', uses: 3, values: [0.75, 1, 1.25], rule: { trigger: 'allinWin', cond: { short: 12 }, effect: { kind: 'tribute', target: 'losers' }, effect2: { kind: 'resolve', value: 2 } },
    text: v => `Win an all-in at 12 BB or less: every loser pays ${BB(v)}; gain 2 Resolve.`, counter: 'Fold to short shoves.', fusion: ['all_or_nothing', 'rising_ember'], price: 25000, unlockRank: 5 }),
  A({ id: 'champion_of_rome', name: 'Champion of Rome', archetype: 'tournament', rarity: 'legendary', uses: 5, values: [0.5, 0.6, 0.75], rule: { trigger: 'winShowdown', cond: { maxPlayers: 3 }, effect: { kind: 'tribute', target: 'sdLosers' }, effect2: { kind: 'resolve', value: 1 } },
    text: v => `Three or fewer left: every showdown win taxes each loser ${BB(v)} and grants 1 Resolve.`, counter: 'Avoid late showdowns.', fusion: ['final_table_titan', 'bubble_survivor'], price: 25000, unlockRank: 5 }),
  A({ id: 'tribunal_of_shadows', name: 'Tribunal of Shadows', archetype: 'counterplay', rarity: 'legendary', uses: 4, values: [1.25, 1.5, 1.75], rule: { trigger: 'winShowdown', effect: { kind: 'tribute', target: 'bettors' }, effect2: { kind: 'ward', value: 1 } },
    text: v => `Beat a river bettor at showdown: they pay ${BB(v)}; gain 1 Ward.`, counter: 'Bet rivers only for value.', fusion: ['senate_reversal', 'turncoat'], price: 25000, unlockRank: 5 }),
  A({ id: 'master_strategist', name: 'Master Strategist', archetype: 'tactical', rarity: 'legendary', uses: 6, values: [0.5, 0.6, 0.75], rule: { trigger: 'checkRaiseWin', effect: { kind: 'tribute', target: 'losers' }, effect2: { kind: 'resolve', value: 2 } },
    text: v => `Check-raise and win: every loser pays ${BB(v)}; gain 2 Resolve.`, counter: 'Check behind.', fusion: ['shifting_lines', 'riposte'], price: 25000, unlockRank: 5 }),
];

/** 3.0 named three-piece combos (legendary combinations) — mechanics applied in arsenal3.ts. */
export const COMBOS3 = [
  { id: 'emperors_gambit', name: "Emperor's Gambit", needs: ['emperors_feint', 'thunder_of_jupiter', 'mask_of_janus'], desc: "Emperor's Feint tributes +0.5 BB and grant 2 Resolve; a difficult multi-street bluff under strict conditions." },
  { id: 'legions_vow', name: "Legion's Vow", needs: ['legions_resolve', 'endurance_pact', 'iron_discipline'], desc: '+2 Wards at match start; each late-level survival also grants +1% prize.' },
  { id: 'golden_cabal', name: 'Golden Cabal', needs: ['golden_conspiracy', 'golden_touch', 'counting_house'], desc: 'Golden Conspiracy costs 2 Resolve; its reward +3% (still capped).' },
  { id: 'frozen_throne', name: 'Frozen Throne', needs: ['frozen_bastion', 'vestal_vigil', 'measured_patience'], desc: 'Frozen Bastion triggers at hand 18 instead of 25; +1 Ward.' },
  { id: 'senate_overturned', name: 'Senate Overturned', needs: ['senate_reversal', 'senates_betrayal', 'call_the_bluff'], desc: 'Senate Reversal tributes +0.5 BB.' },
];
