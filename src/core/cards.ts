/** Card encoding: card = rank*4 + suit, rank 0..12 (2..A), suit 0..3 */
export type Card = number;
export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const rankOf = (c: Card) => c >> 2;
export const suitOf = (c: Card) => c & 3;
export function cardStr(c: Card): string { return RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)]; }
export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0].toUpperCase());
  const su = SUIT_CHARS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0) throw new Error('bad card ' + s);
  return r * 4 + su;
}
export function parseCards(s: string): Card[] { return s.trim().split(/\s+/).filter(Boolean).map(parseCard); }
export function fullDeck(): Card[] { return Array.from({ length: 52 }, (_, i) => i); }
