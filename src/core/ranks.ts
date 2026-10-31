export interface RankDef {
  name: string; threshold: number; entry: number /* cents */; color: string; arena: string; motto: string;
  aiSkill: number; unlock: string;
}

/** Nine Roman ranks. Rank is earned only by rating + promotion trials; Dollars can never buy it. */
export const RANKS: RankDef[] = [
  { name: 'Peasant', threshold: 1000, entry: 2000, color: '#8d7b68', arena: 'Frozen Fields of Minnesota', motto: 'Every legend starts in the snow.', aiSkill: 0.25, unlock: 'Starter Arsenal' },
  { name: 'Plebeian', threshold: 1080, entry: 3000, color: '#a3a3a3', arena: 'Forum Tavern', motto: 'The crowd begins to know your name.', aiSkill: 0.35, unlock: 'Rare abilities, Villa & Library' },
  { name: 'Gladiator', threshold: 1170, entry: 4500, color: '#c0603a', arena: 'Ludus of the North', motto: 'Blood on the sand, ice in the veins.', aiSkill: 0.45, unlock: 'Sigil crafting, Card Club' },
  { name: 'Centurion', threshold: 1260, entry: 6500, color: '#b33a3a', arena: 'Legion Camp at the Lakes', motto: 'Command a hundred bluffs.', aiSkill: 0.55, unlock: 'Epic abilities, Tournament Arena' },
  { name: 'Praetor', threshold: 1350, entry: 9000, color: '#3a7bb3', arena: 'Hall of Magistrates', motto: 'Judge every bet.', aiSkill: 0.62, unlock: 'Legendary fusions, Sponsorships' },
  { name: 'Consul', threshold: 1440, entry: 12500, color: '#7a3ab3', arena: 'Senate Floor', motto: 'The republic bends to your raise.', aiSkill: 0.68, unlock: 'Luxury Estate' },
  { name: 'Imperator', threshold: 1530, entry: 17000, color: '#d4a017', arena: 'Triumphal Way', motto: 'Victory is your herald.', aiSkill: 0.73, unlock: 'Imperial cosmetics' },
  { name: 'Caesar', threshold: 1620, entry: 23000, color: '#e8c33a', arena: 'Palatine Hill', motto: 'All roads lead to your table.', aiSkill: 0.78, unlock: 'Golden table' },
  { name: 'Augustus', threshold: 1710, entry: 30000, color: '#fff2a8', arena: 'Temple of the Divine', motto: 'You are the empire.', aiSkill: 0.82, unlock: 'Prestige Ascension' },
];

export const K_FACTOR = 48;
export const START_RATING = 1000;

/** Multi-player Elo: each pair of finishers is scored as a head-to-head result. placement[i] = finishing place (0 = winner). */
export function ratingDeltas(ratings: number[], placement: number[], k = K_FACTOR): number[] {
  const n = ratings.length;
  return ratings.map((ri, i) => {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const e = 1 / (1 + 10 ** ((ratings[j] - ri) / 400));
      const s = placement[i] < placement[j] ? 1 : placement[i] > placement[j] ? 0 : 0.5;
      sum += s - e;
    }
    return Math.round((k * sum) / (n - 1));
  });
}

export function ratingFloor(rank: number): number { return RANKS[rank].threshold - 40; }
/** Rating is capped above the next threshold until the promotion trial is passed. */
export function ratingCeiling(rank: number): number {
  return rank >= RANKS.length - 1 ? Infinity : RANKS[rank + 1].threshold + 60;
}
export function trialAvailable(rank: number, rating: number): boolean {
  return rank < RANKS.length - 1 && rating >= RANKS[rank + 1].threshold;
}
/** Trials: top-2 finish required against opponents of the next rank. */
export const TRIAL_PASS_PLACE = 1;
export const TRIAL_FAIL_PENALTY = 15;

export function applyRating(rank: number, rating: number, delta: number): number {
  return Math.max(ratingFloor(rank), Math.min(ratingCeiling(rank), rating + delta));
}

/** Prize distribution for an arena of a rank: pool = 4 entries + Senate purse (60% of an entry). */
export function prizeTable(entry: number): number[] {
  const pool = entry * 4 + Math.round(entry * 0.6);
  return [Math.round(pool * 0.5), Math.round(pool * 0.3), Math.round(pool * 0.2), 0];
}
export const RECOVERY_PRIZES = [3000, 1500, 500, 0];
export const RECOVERY_THRESHOLD = 4000; // bankroll below $40 unlocks free Bread & Circuses matches
