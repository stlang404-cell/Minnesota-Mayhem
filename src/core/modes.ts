/** Game mode definitions (Imperial Ascension). Each mode has distinct rules and rewards. */
import type { TableConfig } from './poker';
import { DEFAULT_CONFIG } from './poker';

export type ModeKind = 'arena' | 'trial' | 'recovery' | 'club' | 'grand' | 'quick' | 'highroller' | 'draft' | 'gauntlet' | 'rival' | 'daily' | 'tournament';

export interface ModeDef {
  kind: ModeKind; name: string; icon: string; desc: string;
  entryMult: number; ratingScale: number; gloryScale: number; group: 'core' | 'modes';
  config?: TableConfig; skillBonus?: number;
}

export const QUICK_CONFIG: TableConfig = { ...DEFAULT_CONFIG, startingStack: 800, handsPerLevel: 3 };

export const MODES: Record<ModeKind, ModeDef> = {
  arena: { kind: 'arena', name: 'Ranked Arena', icon: '⚔', desc: 'The main competitive ladder: rating, Glory and prize money.', entryMult: 1, ratingScale: 1, gloryScale: 1, group: 'core' },
  trial: { kind: 'trial', name: 'Promotion Trial', icon: '♛', desc: 'Face three opponents of the next rank. Top 2 is promoted.', entryMult: 1, ratingScale: 1, gloryScale: 1.5, group: 'core' },
  recovery: { kind: 'recovery', name: 'Bread & Circuses', icon: '🍞', desc: 'Free charity match when your purse is nearly empty. Unrated.', entryMult: 0, ratingScale: 0, gloryScale: 0, group: 'core' },
  club: { kind: 'club', name: 'Club Night', icon: '♣', desc: 'Ranked match in your own Card Club with a richer purse.', entryMult: 1, ratingScale: 1, gloryScale: 1, group: 'core' },
  grand: { kind: 'grand', name: 'The Grand Games', icon: '🏛', desc: 'Double stakes in your Tournament Arena, every 5th day.', entryMult: 2, ratingScale: 1, gloryScale: 2, group: 'core' },
  quick: { kind: 'quick', name: 'Quick Clash', icon: '⚡', desc: '800-chip stacks, blinds rise every 3 hands. Half stakes, half rating swing — about 90 seconds.', entryMult: 0.5, ratingScale: 0.5, gloryScale: 0.5, group: 'modes', config: QUICK_CONFIG },
  highroller: { kind: 'highroller', name: 'High Roller', icon: '💰', desc: 'Four times the entry against sharper rivals. Bigger purse, bigger swings.', entryMult: 4, ratingScale: 1.25, gloryScale: 2, group: 'modes', skillBonus: 0.06 },
  draft: { kind: 'draft', name: 'Draft Arena', icon: '🎴', desc: 'Draft a temporary 8-ability Arsenal (pick 1 of 3, eight times) at level 2. Unrated.', entryMult: 1, ratingScale: 0, gloryScale: 1, group: 'modes' },
  gauntlet: { kind: 'gauntlet', name: 'Survival Gauntlet', icon: '🔥', desc: 'Up to 5 consecutive matches, each harder. Finish top 2 to advance; cash out between stages or lose it all.', entryMult: 2, ratingScale: 0, gloryScale: 1, group: 'modes' },
  rival: { kind: 'rival', name: 'Rival Challenge', icon: '⚔', desc: 'Face your fiercest rival. Finish ahead of them for a bounty of 1.5× entry.', entryMult: 1, ratingScale: 1, gloryScale: 1.5, group: 'modes' },
  daily: { kind: 'daily', name: 'Daily Challenge', icon: '📜', desc: 'Same seed for everyone today: fixed Arsenal and opponents. Free; first attempt each day pays.', entryMult: 0, ratingScale: 0, gloryScale: 0.5, group: 'modes' },
  tournament: { kind: 'tournament', name: 'Imperial Tournament', icon: '🏆', desc: '16 competitors, four heat tables, one final table. Win your heat to reach the final.', entryMult: 2, ratingScale: 0, gloryScale: 3, group: 'modes' },
};

export const GAUNTLET_PAYOUT = [0.6, 1.5, 2.6, 4, 6.5]; // × entry, cash-out value after clearing stage i+1
export const GAUNTLET_STAGES = 5;
/** Imperial Tournament payouts as fraction of pool: 1st..4th of final, then the 4 heat runners-up. */
export const TOURNAMENT_SPLIT = [0.4, 0.22, 0.13, 0.09];
export const TOURNAMENT_RUNNER_UP = 0.04;

export function todaySeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
