# Minnesota Mayhem — Balance Report
Generated 2026-10-31T19:56:35.781Z by `npm run balance` (seeded, reproducible).

## 1. Match duration & archetype win rates (AI-only, 4 archetypes per table)
Matches simulated: 720. Hands per match: mean 40.5, median 41, p10 31, p90 49, max 59.
Estimated human duration at 4.5s/hand: median 3.1 min (p10 2.3, p90 3.7). Target 3–6 min.
Hand-cap finishes: 0 (the documented chip-count safety rule).

Identical AI personalities; only the 5-ability archetype loadout differs. Fair share = 25%.

| Archetype | Peasant tier | Centurion tier | Imperator tier |
|---|---|---|---|
| Bluff | 18.5% (n=119) | 25.4% (n=122) | 25.5% (n=110) |
| Pressure | 19.0% (n=121) | 17.5% (n=120) | 21.8% (n=133) |
| Discipline | 34.5% (n=116) | 25.9% (n=116) | 28.4% (n=116) |
| Counterplay | 23.8% (n=105) | 20.4% (n=113) | 24.2% (n=120) |
| Momentum | 16.4% (n=116) | 33.9% (n=121) | 23.2% (n=112) |
| Economy | 23.7% (n=131) | 24.4% (n=127) | 24.0% (n=121) |
| Comeback | 32.8% (n=125) | 34.7% (n=118) | 33.9% (n=127) |
| Information | 30.7% (n=127) | 17.9% (n=123) | 19.0% (n=121) |

No archetype exceeds 36% win rate in any tier (no single dominant build).

## 2. Career progression (simulated competent player, full game rules)
The "player" is driven by the same AI decision engine (skill 0.7, balanced profile) and uses arena / trial / recovery choices automatically. It buys one new ability every few matches and a Villa once affordable.

Careers: 6 × 140 matches.

| Rank | Careers reaching it | Median matches to reach |
|---|---|---|
| Peasant | 6/6 | 0 |
| Plebeian | 6/6 | 8 |
| Gladiator | 6/6 | 19 |
| Centurion | 6/6 | 49 |
| Praetor | 4/6 | 66 |
| Consul | 4/6 | 84 |
| Imperator | 4/6 | 120 |
| Caesar | 2/6 | 139 |
| Augustus | 0/6 | — |

Final ranks after 140 matches: Imperator, Imperator, Caesar, Centurion, Caesar, Centurion.
Promotion trials: 32/61 passed (52%).
Bankroll (median across careers) after 10/40/80/140 matches: $528.17 / $256.29 / $477.90 / $553.17.
Low-bankroll episodes: 2; recovery matches played: 3; episodes fully recovered: 1.

## 3. Bankruptcy & recovery (deliberately weak player)
Scenario: a timid, low-skill player who has fallen to $10 (below the $20 entry). Went broke in 10 episodes across 4 careers × 60 matches; a playable match was available every single time (never stuck).
Recovery matches needed to afford a ranked entry again: median 1, max 3.

## 4. Arena Exchange profitability
Each strategy buys 20 contracts pre-match in each of 150 markets (fees included).

| Strategy | Markets traded | Total P/L | P/L per market | Win % |
|---|---|---|---|---|
| Always buy the favourite | 150 | $-173.21 | $-1.15 | 26% |
| Always buy the longshot | 150 | $-4.24 | $-0.03 | 22% |
| Random outcome | 150 | $56.93 | $0.38 | 29% |
| Fair-value edge (Library model, only if edge > 4¢) | 12 | $-14.58 | $-1.22 | 17% |

Market maker (per market, incl. simulated traders): mean net $-109.32, worst $-182.38; LMSR loss-bound violations: 0. Cancelled (withdrawal) markets refunded: 12.
Fees (2%) and house-favouring rounding make naive strategies lose slowly; research-driven trading can profit only when the crowd misprices. There is no guaranteed-profit loop.

## 5. Property payback
| Asset | Level | Cost | Net/day | Payback (days = arena matches) |
|---|---|---|---|---|
| Lakeside Villa | 1 | $400.00 | $10.00 | 40 |
| Lakeside Villa | 2 | $600.00 | $16.00 | 38 |
| Lakeside Villa | 3 | $900.00 | $20.00 | 45 |
| Augur's Library | 1 | $350.00 | $-3.00 | utility (no income) |
| Augur's Library | 2 | $500.00 | $-5.00 | utility (no income) |
| Card Club of St. Paul | 1 | $900.00 | $10.00 | 90 |
| Card Club of St. Paul | 2 | $1200.00 | $16.00 | 75 |
| Training Academy | 1 | $700.00 | $-4.00 | utility (no income) |
| Training Academy | 2 | $1100.00 | $-7.00 | utility (no income) |
| Tournament Arena | 1 | $3000.00 | $40.00 | 75 |
| Tournament Arena | 2 | $4000.00 | $55.00 | 73 |
| Sponsorship Office | 1 | $1500.00 | $-8.00 | utility (no income) |
| Sponsorship Office | 2 | $2000.00 | $-12.00 | utility (no income) |
| Imperial Estate | 1 | $5000.00 | $-25.00 | utility (no income) |

Income levels show diminishing returns per level; maximum combined passive income is bounded (~$141/day net with everything owned) versus Augustus entry fees of $300, so property supplements but never replaces playing.

_Total harness runtime: 108s._
