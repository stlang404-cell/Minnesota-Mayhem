/**
 * Arsenal ability catalogue. Abilities NEVER touch the deck, reveal hidden cards
 * or alter hand rankings. Their effects are limited to these primitives:
 *   - tribute:     bounded chip transfer between players after a hand settles
 *   - restitution: bounded chip refund from a hand's winner to a loser
 *   - resolve:     gain of the per-match Resolve resource
 *   - waiver:      waiving up to 50% of your own next blind
 *   - ward:        negating tributes aimed at you
 *   - reward:      bounded post-match Dollar modifiers
 *   - insight:     displays computed from PUBLIC information + your own cards
 */
export type Archetype = 'bluff' | 'pressure' | 'discipline' | 'counterplay' | 'momentum' | 'economy' | 'comeback' | 'information' | 'tournament' | 'tactical';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Window = 'preflop' | 'postflop' | 'river' | 'any';

export const ARCHETYPES: { id: Archetype; name: string; color: string; motto: string }[] = [
  { id: 'bluff', name: 'Bluff', color: '#e0524a', motto: 'Win the pots no one contests.' },
  { id: 'pressure', name: 'Pressure', color: '#f08a24', motto: 'Raise, raise, and collect.' },
  { id: 'discipline', name: 'Discipline', color: '#4a8fe0', motto: 'Patience is armour.' },
  { id: 'counterplay', name: 'Counterplay', color: '#9b59d0', motto: 'Punish the liar.' },
  { id: 'momentum', name: 'Momentum', color: '#e8c33a', motto: 'Victory begets victory.' },
  { id: 'economy', name: 'Economy', color: '#4bbf6a', motto: 'Every denarius counts.' },
  { id: 'comeback', name: 'Comeback', color: '#c2185b', motto: 'Never truly beaten.' },
  { id: 'information', name: 'Information', color: '#2bb5b0', motto: 'Knowledge from what is seen.' },
  { id: 'tournament', name: 'Tournament', color: '#e66fb2', motto: 'Outlast, then devour.' },
  { id: 'tactical', name: 'Tactical', color: '#c7d0db', motto: 'Timing is the sharpest blade.' },
];

export interface AbilityDef {
  id: string;
  name: string;
  archetype: Archetype;
  rarity: Rarity;
  kind: 'passive' | 'active';
  cost: number;            // Resolve cost (actives)
  window?: Window;         // when an active may be armed (on your turn)
  uses: number;            // per-match triggers/activations (0 = unlimited)
  values: [number, number, number]; // main magnitude by level 1..3
  text: (v: number) => string;
  counter: string;
  fusion?: [string, string];
  cooldown?: number;       // hands between activations (actives)
  price: number;           // Dollars (cents) to buy in the Forge
  unlockRank: number;      // rank index required to buy
}

const BB = (v: number) => `${v} BB`;

export const ABILITIES: AbilityDef[] = [
  // ---------------- BLUFF ----------------
  { id: 'caesars_gambit', name: "Caesar's Gambit", archetype: 'bluff', rarity: 'common', kind: 'passive', cost: 0, uses: 6,
    values: [0.5, 0.75, 1], text: v => `When you bet or raise after the flop and every opponent folds, each opponent who folded after the flop pays ${BB(v)} tribute.`,
    counter: 'Call down more often; Ward and Veto negate the tribute.', price: 0, unlockRank: 0 },
  { id: 'silver_tongue', name: 'Silver Tongue', archetype: 'bluff', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `When you raise preflop and everyone folds, gain ${v} Resolve.`,
    counter: 'Defend your blinds.', price: 6000, unlockRank: 0 },
  { id: 'mask_of_janus', name: 'Mask of Janus', archetype: 'bluff', rarity: 'rare', kind: 'active', cost: 2, window: 'any', uses: 4,
    values: [3, 4, 5], text: v => `Arm on your turn. If you win this hand without showdown, gain ${v} Resolve. If you lose at showdown, lose 1 Resolve.`,
    counter: 'Call the masked player down to showdown.', price: 15000, unlockRank: 1 },
  { id: 'thunder_of_jupiter', name: 'Thunder of Jupiter', archetype: 'bluff', rarity: 'epic', kind: 'active', cost: 3, window: 'postflop', uses: 3,
    values: [1.25, 1.5, 2], text: v => `Arm after the flop. If you win this hand uncontested, every opponent who folded after the flop pays ${BB(v)} tribute.`,
    counter: 'An armed player must be bluffing often — call.', price: 32000, unlockRank: 3 },
  { id: 'phantom_legion', name: 'Phantom Legion', archetype: 'bluff', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [2, 2, 3], text: v => `Every 3rd uncontested win grants ${v} Resolve and waives 50% of your next blind.`,
    counter: 'Refuse to let them win uncontested.', price: 14000, unlockRank: 2 },

  // ---------------- PRESSURE ----------------
  { id: 'siege_engine', name: 'Siege Engine', archetype: 'pressure', rarity: 'common', kind: 'passive', cost: 0, uses: 6,
    values: [0.5, 0.75, 1], text: v => `If you raised twice or more in a hand and win at showdown, each showdown loser pays ${BB(v)} tribute.`,
    counter: 'Fold to repeated aggression without a strong hand.', price: 6000, unlockRank: 0 },
  { id: 'war_drums', name: 'War Drums', archetype: 'pressure', rarity: 'common', kind: 'active', cost: 1, window: 'preflop', uses: 0,
    values: [2, 3, 3], text: v => `Arm preflop. If you raise preflop and win the hand, gain ${v} Resolve.`,
    counter: 'Three-bet the drummer.', price: 5000, unlockRank: 0 },
  { id: 'decimation', name: 'Decimation', archetype: 'pressure', rarity: 'epic', kind: 'active', cost: 3, window: 'river', uses: 3,
    values: [1.5, 2, 2.5], text: v => `Arm on the river. If you bet or raise the river and beat a caller at showdown, each such loser pays ${BB(v)} tribute.`,
    counter: 'Fold marginal hands to armed river bets.', price: 30000, unlockRank: 3 },
  { id: 'iron_grip', name: 'Iron Grip', archetype: 'pressure', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Begin a hand as chip leader: gain ${v} Resolve (every other hand).`,
    counter: 'Take the chip lead away.', price: 12000, unlockRank: 1 },
  { id: 'big_stack_tyranny', name: 'Tyranny of the Large', archetype: 'pressure', rarity: 'rare', kind: 'passive', cost: 0, uses: 5,
    values: [0.5, 0.75, 1], text: v => `When you beat a shorter stack at showdown, they pay ${BB(v)} tribute.`,
    counter: 'Short stacks should pick spots carefully.', price: 14000, unlockRank: 2 },

  // ---------------- DISCIPLINE ----------------
  { id: 'iron_discipline', name: 'Iron Discipline', archetype: 'discipline', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [3, 3, 2], text: v => `After folding preflop ${v} hands in a row, your next blind is 50% waived.`,
    counter: 'Steal their blinds anyway — waivers are capped.', price: 0, unlockRank: 0 },
  { id: 'frozen_legion', name: 'Frozen Legion', archetype: 'discipline', rarity: 'rare', kind: 'passive', cost: 0, uses: 4,
    values: [0.25, 0.3, 0.4], text: v => `When you fold facing a bet after the flop, the hand's winner refunds ${Math.round(v * 100)}% of your contribution (max 2 BB).`,
    counter: 'Make them fold earlier, before they invest.', price: 13000, unlockRank: 1 },
  { id: 'stoic_patience', name: 'Stoic Patience', archetype: 'discipline', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Every 2nd time you fold preflop without posting a blind, gain ${v} Resolve.`,
    counter: 'Pressure their blinds when they finally play.', price: 5000, unlockRank: 0 },
  { id: 'fortress_wall', name: 'Fortress Wall', archetype: 'discipline', rarity: 'rare', kind: 'active', cost: 2, window: 'any', uses: 3,
    values: [0.3, 0.35, 0.45], text: v => `Arm on your turn. If you lose this hand at showdown, the winner refunds ${Math.round(v * 100)}% of your contribution (max 3 BB).`,
    counter: 'Value-bet thinner against the fortress.', price: 15000, unlockRank: 1 },
  { id: 'vestal_vigil', name: 'Vestal Vigil', archetype: 'discipline', rarity: 'epic', kind: 'passive', cost: 0, uses: 0,
    values: [2, 3, 3], text: v => `Ward: the first ${v} tributes aimed at you each match are negated.`,
    counter: 'Win chips at showdown rather than through tribute.', price: 26000, unlockRank: 3 },

  // ---------------- COUNTERPLAY ----------------
  { id: 'senates_betrayal', name: "Senate's Betrayal", archetype: 'counterplay', rarity: 'common', kind: 'passive', cost: 0, uses: 5,
    values: [1, 1.25, 1.5], text: v => `When you beat a river bettor at showdown who held only High Card or One Pair, they pay ${BB(v)} tribute.`,
    counter: 'Bluff less on the river against this build.', price: 0, unlockRank: 0 },
  { id: 'veto', name: 'Tribune\'s Veto', archetype: 'counterplay', rarity: 'rare', kind: 'active', cost: 2, window: 'any', uses: 3,
    values: [1, 1, 2], text: v => `Arm on your turn. All tributes aimed at you this hand are negated; gain ${v} Resolve per tribute blocked.`,
    counter: 'Bait the Veto, then strike the next hand.', price: 12000, unlockRank: 1 },
  { id: 'brutus_dagger', name: "Brutus' Dagger", archetype: 'counterplay', rarity: 'epic', kind: 'active', cost: 3, window: 'any', uses: 2,
    values: [2, 2.5, 3], text: v => `Arm on your turn. If you beat the hand-start chip leader at showdown, they pay ${BB(v)} tribute.`,
    counter: 'Chip leaders should avoid armed opponents.', price: 30000, unlockRank: 3 },
  { id: 'augurs_warning', name: "Augur's Warning", archetype: 'counterplay', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Whenever an opponent's tribute or restitution takes chips from you, gain ${v} Resolve.`,
    counter: 'Beat them in pots, not with abilities.', price: 5000, unlockRank: 0 },
  { id: 'mirror_shield', name: 'Mirror Shield', archetype: 'counterplay', rarity: 'rare', kind: 'passive', cost: 0, uses: 3,
    values: [0.5, 0.6, 0.75], text: v => `When you pay a tribute, the tributer forfeits ${Math.round(v * 100)}% of it back to you.`,
    counter: 'Use restitution effects instead of tribute.', price: 16000, unlockRank: 2 },

  // ---------------- MOMENTUM ----------------
  { id: 'imperial_momentum', name: 'Imperial Momentum', archetype: 'momentum', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Win 2 hands in a row: gain ${v} Resolve. At 3+ in a row, also waive 50% of your next blind.`,
    counter: 'Break the streak with a re-raise.', price: 6000, unlockRank: 0 },
  { id: 'legion_formation', name: 'Legion Formation', archetype: 'momentum', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [0.15, 0.2, 0.25], text: v => `Each pot you win adds 1 Formation (max 5; reset on a showdown loss). At 3+, each win also collects ${v} BB × Formation from the largest losing stack (max 1 BB).`,
    counter: 'Beat them at showdown to shatter the formation.', price: 15000, unlockRank: 1 },
  { id: 'triumph', name: 'Triumph', archetype: 'momentum', rarity: 'epic', kind: 'passive', cost: 0, uses: 0,
    values: [3, 4, 5], text: v => `When you win a pot of 20 BB or more, gain ${v} Resolve.`,
    counter: 'Keep pots small against them.', price: 22000, unlockRank: 2 },
  { id: 'forced_march', name: 'Forced March', archetype: 'momentum', rarity: 'common', kind: 'active', cost: 2, window: 'preflop', uses: 4,
    values: [0.5, 0.5, 0.5], text: () => `Arm preflop. If you win this hand, your next 2 blinds are 50% waived.`,
    counter: 'Contest the marching player.', price: 7000, unlockRank: 0 },
  { id: 'eagle_standard', name: 'Eagle Standard', archetype: 'momentum', rarity: 'epic', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `While you have won 2 of the last 3 hands, your active abilities cost ${v} less Resolve (min 0).`,
    counter: 'Interrupt their run of wins.', price: 24000, unlockRank: 3 },

  // ---------------- ECONOMY ----------------
  { id: 'golden_touch', name: 'Golden Touch', archetype: 'economy', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [5, 7, 10], text: v => `+${v}% Dollar prize money when you finish in the money (all reward bonuses cap at +20%).`,
    counter: 'Knock them out of the money.', price: 0, unlockRank: 0 },
  { id: 'merchants_ledger', name: "Merchant's Ledger", archetype: 'economy', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [15, 20, 25], text: v => `Finish 3rd or 4th: ${v}% of your entry fee is refunded.`,
    counter: 'None needed — it only softens losses.', price: 6000, unlockRank: 0 },
  { id: 'tax_collector', name: 'Tax Collector', archetype: 'economy', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [0.15, 0.2, 0.25], text: v => `Whenever the blinds rise, each opponent pays you ${BB(v)} tribute.`,
    counter: 'Wards blunt the tax.', price: 16000, unlockRank: 2 },
  { id: 'patrons_favor', name: "Patron's Favor", archetype: 'economy', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Every 4th hand, gain ${v} Resolve.`,
    counter: 'End the match quickly.', price: 11000, unlockRank: 1 },
  { id: 'sponsors_mark', name: "Sponsor's Mark", archetype: 'economy', rarity: 'epic', kind: 'active', cost: 3, window: 'any', uses: 3,
    values: [3, 4, 5], text: v => `Arm on your turn. Adds +${v}% to your Dollar prize if you finish in the money (shared +20% cap).`,
    counter: 'Eliminate them before they cash.', price: 25000, unlockRank: 2 },

  // ---------------- COMEBACK ----------------
  { id: 'last_stand', name: 'Last Stand', archetype: 'comeback', rarity: 'rare', kind: 'passive', cost: 0, uses: 1,
    values: [1, 1.25, 1.5], text: v => `Once per match, when you lose an all-in with 8 BB or less while 3+ players remain, the winner refunds up to ${BB(v)} to you (at most half their gain).`,
    counter: 'Plan to knock them out twice.', price: 0, unlockRank: 0 },
  { id: 'phoenix_ash', name: 'Phoenix Ash', archetype: 'comeback', rarity: 'epic', kind: 'passive', cost: 0, uses: 2,
    values: [4, 5, 6], text: v => `When your stack drops below 8 BB, gain ${v} Resolve.`,
    counter: 'Finish them quickly.', price: 22000, unlockRank: 2 },
  { id: 'underdogs_fury', name: "Underdog's Fury", archetype: 'comeback', rarity: 'common', kind: 'passive', cost: 0, uses: 3,
    values: [0.5, 0.5, 0.75], text: v => `Win an all-in showdown as the shorter stack: gain 2 Resolve and the loser pays ${BB(v)} tribute.`,
    counter: 'Don\'t call short-stack shoves lightly.', price: 6000, unlockRank: 0 },
  { id: 'gladiators_oath', name: "Gladiator's Oath", archetype: 'comeback', rarity: 'common', kind: 'active', cost: 2, window: 'preflop', uses: 2,
    values: [2, 2, 2], text: v => `Arm preflop while below 15 BB: your next ${v} blinds are 50% waived.`,
    counter: 'Attack them while the oath lasts.', price: 7000, unlockRank: 0 },
  { id: 'second_wind', name: 'Second Wind', archetype: 'comeback', rarity: 'rare', kind: 'passive', cost: 0, uses: 2,
    values: [3, 4, 5], text: v => `When any player is eliminated while you hold the shortest stack, gain ${v} Resolve.`,
    counter: 'Eliminate them before the others.', price: 11000, unlockRank: 1 },

  // ---------------- INFORMATION ----------------
  { id: 'augurs_eye', name: "Augur's Eye", archetype: 'information', rarity: 'common', kind: 'active', cost: 1, window: 'any', uses: 0,
    values: [1, 1, 1], text: () => `Reveal your hand's estimated equity against random hands (your cards + the board only). Lasts the hand.`,
    counter: 'It reveals nothing about you.', price: 4000, unlockRank: 0 },
  { id: 'spy_network', name: 'Spy Network', archetype: 'information', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Counter-intelligence: the first ${v} tribute(s) aimed at you are warded. Shows every opponent's public betting statistics; gain 1 Resolve when an opponent is shown bluffing.`,
    counter: 'Play honestly.', price: 5000, unlockRank: 0 },
  { id: 'oracle_of_delphi', name: 'Oracle of Delphi', archetype: 'information', rarity: 'rare', kind: 'active', cost: 2, window: 'any', uses: 0,
    values: [1, 1, 1], text: () => `Reveal pot odds and equity versus each live opponent's observed range (from their public history).`,
    counter: 'Vary your play to blur your range.', price: 12000, unlockRank: 1 },
  { id: 'scroll_of_records', name: 'Scroll of Records', archetype: 'information', rarity: 'common', kind: 'passive', cost: 0, uses: 1,
    values: [2, 3, 4], text: v => `After 10 hands of study, gain ${v} Resolve and 1 Ward once. Shows each rival's fold-to-raise rate.`,
    counter: 'End the match before the scroll is complete.', price: 4000, unlockRank: 0 },
  { id: 'sibyls_insight', name: "Sibyl's Insight", archetype: 'information', rarity: 'epic', kind: 'passive', cost: 0, uses: 5,
    values: [1, 1, 2], text: v => `Each showdown you witness grants ${v} Resolve. Your Information actives cost 0.`,
    counter: 'Avoid showdowns.', price: 20000, unlockRank: 3 },

  // ---------------- FUSIONS (crafted, legendary) ----------------
  { id: 'ides_of_march', name: 'Ides of March', archetype: 'counterplay', rarity: 'legendary', kind: 'passive', cost: 0, uses: 5,
    values: [1.5, 1.75, 2], text: v => `When you beat the chip leader or a river bluffer at showdown, they pay ${BB(v)} tribute.`,
    counter: 'Leaders and liars must tread carefully.', fusion: ['senates_betrayal', 'brutus_dagger'], price: 20000, unlockRank: 4 },
  { id: 'pax_romana', name: 'Pax Romana', archetype: 'discipline', rarity: 'legendary', kind: 'passive', cost: 0, uses: 0,
    values: [3, 4, 5], text: v => `Ward ${v} tributes per match. After 2 straight preflop folds your next blind is 50% waived.`,
    counter: 'Beat them in pots — they rarely enter them.', fusion: ['iron_discipline', 'vestal_vigil'], price: 20000, unlockRank: 4 },
  { id: 'gold_of_croesus', name: 'Gold of Croesus', archetype: 'economy', rarity: 'legendary', kind: 'passive', cost: 0, uses: 0,
    values: [8, 10, 12], text: v => `+${v}% Dollar prize when in the money; 25% of entry refunded on 3rd/4th.`,
    counter: 'Knock them out of the money.', fusion: ['golden_touch', 'merchants_ledger'], price: 15000, unlockRank: 4 },
  { id: 'wrath_of_mars', name: 'Wrath of Mars', archetype: 'pressure', rarity: 'legendary', kind: 'passive', cost: 0, uses: 8,
    values: [0.75, 1, 1.25], text: v => `Win uncontested after a postflop bet, or at showdown after 2+ raises: each folder/loser pays ${BB(v)} tribute.`,
    counter: 'Ward and Veto; fold early.', fusion: ['caesars_gambit', 'siege_engine'], price: 20000, unlockRank: 4 },

  // ================= IMPERIAL ASCENSION EXPANSION =================
  // ---------------- TOURNAMENT ----------------
  { id: 'bubble_lord', name: 'Bubble Lord', archetype: 'tournament', rarity: 'rare', kind: 'passive', cost: 0, uses: 4,
    values: [0.25, 0.3, 0.4], text: v => `With 3 or fewer players left, whenever you begin a hand as chip leader the shortest stack pays ${BB(v)} tribute.`,
    counter: 'Short stacks must double through the leader quickly.', price: 14000, unlockRank: 1 },
  { id: 'survivors_purse', name: "Survivor's Purse", archetype: 'tournament', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [2, 3, 4], text: v => `+${v}% Dollar prize for every opponent eliminated while you survive (shared +20% reward cap).`,
    counter: 'Eliminate them early.', price: 6000, unlockRank: 0 },
  { id: 'ante_collector', name: 'Ante Collector', archetype: 'tournament', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Once antes are in play, every pot you win grants ${v} Resolve.`,
    counter: 'Contest their late-game steals.', price: 5000, unlockRank: 0 },
  { id: 'final_table_nerves', name: 'Final Table Nerves', archetype: 'tournament', rarity: 'rare', kind: 'active', cost: 2, window: 'preflop', uses: 2,
    values: [2, 2, 3], text: v => `Arm preflop with 3 or fewer players left: your next ${v} blinds are 50% waived.`,
    counter: 'Pressure them while the waiver lasts.', price: 12000, unlockRank: 1 },
  { id: 'executioner', name: 'Executioner', archetype: 'tournament', rarity: 'epic', kind: 'passive', cost: 0, uses: 3,
    values: [3, 4, 5], text: v => `When you eliminate a player, gain ${v} Resolve and +${v}% Dollar prize (shared cap).`,
    counter: 'Avoid all-ins against the executioner.', price: 24000, unlockRank: 2 },
  { id: 'endurance_pact', name: 'Endurance Pact', archetype: 'tournament', rarity: 'rare', kind: 'passive', cost: 0, uses: 3,
    values: [12, 10, 8], text: v => `Every ${v} hands you survive, gain 1 Ward (max 3 per match).`,
    counter: 'Win through pots, not tribute.', price: 12000, unlockRank: 1 },
  // ---------------- TACTICAL ----------------
  { id: 'tempo_strike', name: 'Tempo Strike', archetype: 'tactical', rarity: 'rare', kind: 'active', cost: 2, window: 'any', uses: 0, cooldown: 4,
    values: [0.25, 0.35, 0.5], text: v => `Arm on your turn (4-hand cooldown). If you win this hand, every opponent who lost chips in it pays ${BB(v)} tribute.`,
    counter: 'Fold early against an armed Tempo Strike.', price: 13000, unlockRank: 1 },
  { id: 'blockade', name: 'Blockade', archetype: 'tactical', rarity: 'epic', kind: 'active', cost: 2, window: 'preflop', uses: 3, cooldown: 5,
    values: [1.5, 1.5, 2], text: v => `Arm preflop (5-hand cooldown). Tributes you collect this hand are multiplied ×${v} (per-hand caps still apply).`,
    counter: 'Wards and Vetoes ignore the multiplier.', price: 22000, unlockRank: 2 },
  { id: 'feint_line', name: 'Feint Line', archetype: 'tactical', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [2, 2, 3], text: v => `Check-raise on a street and go on to win the hand: gain ${v} Resolve.`,
    counter: 'Bet less often into a checker.', price: 5000, unlockRank: 0 },
  { id: 'tactical_retreat', name: 'Tactical Retreat', archetype: 'tactical', rarity: 'common', kind: 'active', cost: 1, window: 'postflop', uses: 0, cooldown: 3,
    values: [0.2, 0.25, 0.3], text: v => `Arm after the flop (3-hand cooldown). If you later fold this hand, the winner refunds ${Math.round(v * 100)}% of your contribution (max 1.5 BB).`,
    counter: 'Make them fold before the flop.', price: 6000, unlockRank: 0 },
  { id: 'overwatch', name: 'Overwatch', archetype: 'tactical', rarity: 'common', kind: 'passive', cost: 0, uses: 6,
    values: [1, 1, 2], text: v => `Whenever an opponent arms an ability, gain ${v} Resolve.`,
    counter: 'Rely on passives against them.', price: 5000, unlockRank: 0 },
  { id: 'interdict', name: 'Interdict', archetype: 'tactical', rarity: 'epic', kind: 'active', cost: 3, window: 'any', uses: 2,
    values: [2, 2, 3], text: v => `Arm on your turn: gain ${v} Wards for the rest of the match.`,
    counter: 'Shift to restitution and pot equity.', price: 20000, unlockRank: 2 },
  // ---------------- additions to the original eight ----------------
  { id: 'senate_whisper', name: 'Senate Whisper', archetype: 'bluff', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [2, 2, 3], text: v => `When two or more opponents fold to your bets after the flop in one hand, gain ${v} Resolve.`,
    counter: 'Defend together — someone must call.', price: 12000, unlockRank: 1 },
  { id: 'smoke_screen', name: 'Smoke Screen', archetype: 'bluff', rarity: 'common', kind: 'active', cost: 1, window: 'postflop', uses: 0, cooldown: 3,
    values: [1, 1, 1], text: () => `Arm after the flop (3-hand cooldown). If you win this hand uncontested, your next blind is 50% waived.`,
    counter: 'Call the smoke.', price: 5000, unlockRank: 0 },
  { id: 'relentless', name: 'Relentless', archetype: 'pressure', rarity: 'rare', kind: 'passive', cost: 0, uses: 4,
    values: [0.5, 0.6, 0.75], text: v => `Win 3 hands in a row in which you raised preflop: everyone who folded preflop in the third pays ${BB(v)} tribute.`,
    counter: 'Re-raise to break the chain.', price: 13000, unlockRank: 1 },
  { id: 'shield_bash', name: 'Shield Bash', archetype: 'pressure', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `Re-raise preflop (3-bet) and win the hand: gain ${v} Resolve.`,
    counter: 'Four-bet light occasionally.', price: 5000, unlockRank: 0 },
  { id: 'patient_hunter', name: 'Patient Hunter', archetype: 'discipline', rarity: 'rare', kind: 'passive', cost: 0, uses: 3,
    values: [0.5, 0.6, 0.75], text: v => `After 4+ straight preflop folds, if you win the next hand you play, every opponent who lost chips in it pays ${BB(v)} tribute.`,
    counter: 'Respect the rock when it finally plays.', price: 12000, unlockRank: 1 },
  { id: 'iron_ration', name: 'Iron Ration', archetype: 'discipline', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [3, 3, 2], text: v => `While below 12 BB, every ${v} blinds you post earn a 50% waiver on your next blind.`,
    counter: 'Eliminate short stacks decisively.', price: 5000, unlockRank: 0 },
  { id: 'call_the_bluff', name: 'Call the Bluff', archetype: 'counterplay', rarity: 'rare', kind: 'active', cost: 2, window: 'river', uses: 3,
    values: [1, 1.25, 1.5], text: v => `Arm on the river while facing a bet. If you call and win at showdown, the river bettor pays ${BB(v)} tribute.`,
    counter: 'Value-bet only; never bluff into an armed caller.', price: 13000, unlockRank: 1 },
  { id: 'grudge', name: 'Grudge', archetype: 'counterplay', rarity: 'common', kind: 'passive', cost: 0, uses: 3,
    values: [2, 2, 3], text: v => `When the same opponent beats you in two pots in a row, gain ${v} Resolve and 1 Ward.`,
    counter: 'Spread your aggression around.', price: 5000, unlockRank: 0 },
  { id: 'victory_lap', name: 'Victory Lap', archetype: 'momentum', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `After you win a showdown, your next active ability costs ${v} less Resolve.`,
    counter: 'Win the showdowns yourself.', price: 11000, unlockRank: 1 },
  { id: 'charge_of_equites', name: 'Charge of the Equites', archetype: 'momentum', rarity: 'epic', kind: 'active', cost: 2, window: 'preflop', uses: 0, cooldown: 3,
    values: [0.25, 0.35, 0.5], text: v => `Arm preflop (3-hand cooldown). If you win the hand, every opponent who called preflop and lost pays ${BB(v)} tribute.`,
    counter: 'Fold or re-raise preflop instead of flatting.', price: 22000, unlockRank: 2 },
  { id: 'dividend', name: 'Dividend', archetype: 'economy', rarity: 'rare', kind: 'passive', cost: 0, uses: 0,
    values: [1, 1, 2], text: v => `+${v}% Dollar prize for every 5 pots you win (shared +20% cap).`,
    counter: 'Win the pots yourself.', price: 11000, unlockRank: 1 },
  { id: 'bankroll_insurance', name: 'Bankroll Insurance', archetype: 'economy', rarity: 'common', kind: 'passive', cost: 0, uses: 0,
    values: [30, 40, 50], text: v => `Finish 4th: ${v}% of your entry fee is refunded.`,
    counter: 'None — it only softens the worst result.', price: 5000, unlockRank: 0 },
  { id: 'desperate_gambit', name: 'Desperate Gambit', archetype: 'comeback', rarity: 'rare', kind: 'active', cost: 1, window: 'preflop', uses: 2,
    values: [0.5, 0.6, 0.75], text: v => `Arm preflop below 6 BB. If you win the hand, every opponent who lost chips in it pays ${BB(v)} tribute.`,
    counter: 'Only call with real hands.', price: 11000, unlockRank: 1 },
  { id: 'ember_guard', name: 'Ember Guard', archetype: 'comeback', rarity: 'rare', kind: 'passive', cost: 0, uses: 3,
    values: [1, 1, 2], text: v => `While you hold the shortest stack, up to ${v} tribute(s) per hand aimed at you are negated.`,
    counter: 'Let someone else become shortest.', price: 11000, unlockRank: 1 },
  { id: 'cartographer', name: 'Cartographer', archetype: 'information', rarity: 'rare', kind: 'passive', cost: 0, uses: 1,
    values: [3, 4, 5], text: v => `After 20 hands of mapping the table, gain ${v} Resolve and 2 Wards.`,
    counter: 'Finish them before hand 20.', price: 11000, unlockRank: 1 },
  { id: 'tell_reader', name: 'Tell Reader', archetype: 'information', rarity: 'common', kind: 'active', cost: 1, window: 'any', uses: 0,
    values: [1, 1, 1], text: () => `Reveal every live opponent's public tendencies this match (aggression, fold-to-raise, showdown bluffs).`,
    counter: 'Mix up your play.', price: 4000, unlockRank: 0 },
  // ---------------- NEW FUSIONS ----------------
  { id: 'iron_executioner', name: 'Iron Executioner', archetype: 'tournament', rarity: 'legendary', kind: 'passive', cost: 0, uses: 6,
    values: [4, 5, 6], text: v => `Eliminate a player: +${v} Resolve and +${v}% prize. With 3 or fewer left, starting a hand as leader taxes the shortest stack 0.4 BB.`,
    counter: 'Never become the shortest stack.', fusion: ['executioner', 'bubble_lord'], price: 20000, unlockRank: 4 },
  { id: 'eternal_flame', name: 'Eternal Flame', archetype: 'comeback', rarity: 'legendary', kind: 'passive', cost: 0, uses: 3,
    values: [5, 6, 7], text: v => `Below 8 BB: +${v} Resolve (3×/match). While shortest, the first tribute each hand against you is negated.`,
    counter: 'Eliminate, do not tax.', fusion: ['phoenix_ash', 'ember_guard'], price: 20000, unlockRank: 4 },
  { id: 'phantom_tempo', name: 'Phantom Tempo', archetype: 'tactical', rarity: 'legendary', kind: 'passive', cost: 0, uses: 8,
    values: [0.25, 0.3, 0.4], text: v => `Every uncontested win: opponents who put chips in pay ${BB(v)}. Every 3rd also waives your next blind.`,
    counter: 'Make them show their cards.', fusion: ['tempo_strike', 'phantom_legion'], price: 20000, unlockRank: 4 },
  { id: 'oracles_ledger', name: "Oracle's Ledger", archetype: 'economy', rarity: 'legendary', kind: 'passive', cost: 0, uses: 1,
    values: [25, 30, 35], text: v => `After 20 hands: +3 Resolve and 2 Wards. Finish 3rd or 4th: ${v}% of entry refunded.`,
    counter: 'End it early.', fusion: ['cartographer', 'merchants_ledger'], price: 15000, unlockRank: 4 },
];

export const ABILITY_MAP: Record<string, AbilityDef> = Object.fromEntries(ABILITIES.map(a => [a.id, a]));

export type SigilId = 'haste' | 'might' | 'endurance' | 'thrift';
export const SIGILS: Record<SigilId, { name: string; desc: string; price: number; appliesTo: (d: AbilityDef) => boolean }> = {
  haste: { name: 'Sigil of Haste', desc: 'Active costs 1 less Resolve, but effect ×0.75.', price: 8000, appliesTo: d => d.kind === 'active' && d.cost > 0 },
  might: { name: 'Sigil of Might', desc: 'Effect ×1.25, but actives cost +1 Resolve / passives lose 1 use (min 1).', price: 10000, appliesTo: d => d.kind === 'active' || d.uses > 1 },
  endurance: { name: 'Sigil of Endurance', desc: '+2 uses per match, but effect ×0.85.', price: 8000, appliesTo: d => d.uses > 0 },
  thrift: { name: 'Sigil of Thrift', desc: 'Effect ×0.9, but each trigger also grants +1 Resolve.', price: 7000, appliesTo: d => d.kind === 'passive' },
};

export interface AbilityInstance { uid: string; defId: string; level: number; sigil?: SigilId }

export interface ResolvedAbility {
  def: AbilityDef; level: number; sigil?: SigilId;
  value: number; cost: number; uses: number; thriftBonus: number;
}

export function resolveAbility(inst: { defId: string; level: number; sigil?: SigilId }): ResolvedAbility {
  const def = ABILITY_MAP[inst.defId];
  if (!def) throw new Error('unknown ability ' + inst.defId);
  const lvl = Math.max(1, Math.min(3, inst.level));
  let value = def.values[lvl - 1];
  let cost = def.cost;
  let uses = def.uses;
  let thriftBonus = 0;
  // integer-ish magnitudes (Resolve, counts, %) round; BB/fractions keep two decimals
  const isInt = Number.isInteger(def.values[0]) && def.values.every(Number.isInteger);
  const scale = (m: number) => { value = isInt ? Math.max(1, Math.round(value * m)) : Math.round(value * m * 100) / 100; };
  switch (inst.sigil) {
    case 'haste': if (def.kind === 'active') { cost = Math.max(0, cost - 1); scale(0.75); } break;
    case 'might': scale(1.25); if (def.kind === 'active') cost += 1; else if (uses > 1) uses -= 1; break;
    case 'endurance': if (uses > 0) { uses += 2; scale(0.85); } break;
    case 'thrift': if (def.kind === 'passive') { scale(0.9); thriftBonus = 1; } break;
  }
  return { def, level: lvl, sigil: inst.sigil, value, cost, uses, thriftBonus };
}

/** Pair synergies: equipped together they grant a small explicit bonus. */
export const SYNERGIES: { id: string; name: string; needs: string[]; desc: string }[] = [
  { id: 'wolf_capitol', name: 'Wolf of the Capitol', needs: ['caesars_gambit', 'thunder_of_jupiter'], desc: "Caesar's Gambit tribute +0.25 BB." },
  { id: 'unbreakable', name: 'Unbreakable', needs: ['frozen_legion', 'fortress_wall'], desc: 'Refund caps on Frozen Legion and Fortress Wall +1 BB.' },
  { id: 'phoenix_rising', name: 'Phoenix Rising', needs: ['last_stand', 'phoenix_ash'], desc: 'Last Stand may trigger twice per match.' },
  { id: 'rolling_thunder', name: 'Rolling Thunder', needs: ['imperial_momentum', 'legion_formation'], desc: 'Formation maximum rises to 6.' },
  { id: 'tribunal', name: 'Tribunal', needs: ['senates_betrayal', 'spy_network'], desc: "Senate's Betrayal also grants 1 Resolve when it triggers." },
  { id: 'iron_tax', name: 'Iron Tax', needs: ['tax_collector', 'iron_grip'], desc: 'Tax Collector triggers also grant 1 Resolve.' },
  { id: 'drumline', name: 'Drumline', needs: ['war_drums', 'siege_engine'], desc: 'War Drums costs 0 Resolve.' },
  { id: 'stoic_order', name: 'Stoic Order', needs: ['stoic_patience', 'iron_discipline'], desc: 'Iron Discipline needs one fewer fold.' },
  { id: 'night_watch', name: 'Night Watch', needs: ['overwatch', 'tell_reader'], desc: 'Tell Reader costs 0 Resolve.' },
  { id: 'last_legion', name: 'Last Legion', needs: ['endurance_pact', 'ember_guard'], desc: 'Endurance Pact Wards also grant 1 Resolve.' },
  // ---- Named three-piece combos (Imperial Ascension) ----
  { id: 'imperial_conspiracy', name: 'Imperial Conspiracy', needs: ['caesars_gambit', 'senates_betrayal', 'mask_of_janus'], desc: "Caesar's Gambit and Senate's Betrayal tributes +0.25 BB; Mask of Janus costs 1 Resolve." },
  { id: 'golden_legion', name: 'Golden Legion', needs: ['iron_discipline', 'golden_touch', 'legion_formation'], desc: 'Formation tribute starts at 2 Formation; +5% prize (shared cap).' },
  { id: 'frozen_empire', name: 'Frozen Empire', needs: ['frozen_legion', 'vestal_vigil', 'fortress_wall'], desc: '+2 Wards at the start of the match; Frozen Legion gains +2 uses.' },
  { id: 'senate_collapse', name: 'Senate Collapse', needs: ['thunder_of_jupiter', 'senate_whisper', 'caesars_gambit'], desc: 'Thunder of Jupiter costs 1 Resolve; Senate Whisper triggers when any single opponent folds to you after the flop.' },
  { id: 'caesars_ascension', name: "Caesar's Ascension", needs: ['@two_legendaries'], desc: 'Equip any two legendary fusions: +1 starting Resolve and every tribute you collect gains +0.25 BB (caps still apply).' },
];
export const COMBO_IDS = ['imperial_conspiracy', 'golden_legion', 'frozen_empire', 'senate_collapse', 'caesars_ascension'];

export function activeSynergies(defIds: string[]): typeof SYNERGIES {
  const set = new Set(defIds);
  const legendaries = defIds.filter(id => ABILITY_MAP[id]?.rarity === 'legendary').length;
  return SYNERGIES.filter(s => s.needs[0] === '@two_legendaries' ? legendaries >= 2 : s.needs.every(n => set.has(n)));
}

/** Archetype set bonuses: 3 of a kind -> +1 starting Resolve, 5 -> +2, plus +1 max Resolve. */
export function setBonuses(defIds: string[]): { archetype: Archetype; count: number; startResolve: number }[] {
  const counts: Partial<Record<Archetype, number>> = {};
  for (const id of defIds) { const d = ABILITY_MAP[id]; if (d) counts[d.archetype] = (counts[d.archetype] ?? 0) + 1; }
  return (Object.entries(counts) as [Archetype, number][])
    .filter(([, c]) => c >= 3)
    .map(([a, c]) => ({ archetype: a, count: c, startResolve: c >= 5 ? 2 : 1 }));
}

export const STARTER_ABILITIES = ['caesars_gambit', 'iron_discipline', 'senates_betrayal', 'golden_touch', 'last_stand', 'war_drums', 'augurs_eye'];

export function upgradeCost(def: AbilityDef, toLevel: number): number {
  const base = { common: 4000, rare: 8000, epic: 14000, legendary: 20000 }[def.rarity];
  return toLevel === 2 ? base : base * 2.5;
}
