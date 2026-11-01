# MINNESOTA MAYHEM 3.0 — THE ETERNAL EMPIRE

## Version 2.0 audit (verified before any change)
| Claim | Verified |
|---|---|
| 72 unit tests | ✔ 72/72 (`docs/TEST_RESULTS_V2.txt`) |
| 27 browser checks | ✔ 27/27 (`docs/E2E_RESULTS_V2.json`) |
| 76 abilities · 10 archetypes · 8 legendaries | ✔ counted from `ABILITIES` |
| ~120 rivals, cap 140 | ✔ 121 at career start |
| 8 game modes, 9 arenas, 3 contract types, 16-player tournament, 15-day seasons, Palace, V1 migration | ✔ |
| Save schema | 4 |

**Checkpoint:** commit `580d161` on `claude/ecstatic-heisenberg-8bawmy` (local tag `v2.0-checkpoint`; this environment's git proxy rejects tag pushes, so the commit hash is the recoverable reference). V2 reports archived as `*_V2.*`; a real V2 save with an in-progress tournament, contract books and properties is frozen at `tests/fixtures/v2-save.json`. Development continued on the designated session branch, as the session rules require all pushes to go there.

## What's new — completed and verified
| Area | 3.0 |
|---|---|
| **Imperial Circuit** | Rolling calendar of 16-player events in six tiers: Local, Regional, Invitational, High-Roller Festival, Rival Revenge Night, and a Last Chance Qualifier. Each event has eligibility, an entry fee, a 100%-distributed prize split, a roster, heats and a final, stored replays and highlights, history and career impact. Registration and a no-show rule apply. |
| **Seasonal playoffs** | Regular season → top 16 + wildcard qualify → **Imperial Grand Championship** (snake-seeded) → awards ceremony → Hall of Champions (the playoff champion, not the points leader). |
| **Integrity** | One canonical write path. Tests check that bracket, history, news, champion-market settlement, rival titles and the Hall agree, and that pools are fully distributed. |
| **AI 3.0** | Bet-size memory (pattern-relative, empirical-Bayes), push/fold against public shoving ranges, stack-commitment discipline, personality exploits. **Significantly beats AI 2.0** (95% CIs in the balance report §6). |
| **Legendary Arsenal** | Declarative rule engine: trigger + conditions + effect/target, deterministic, through the same bounded primitives and caps. **122 abilities** (was 76), **16 legendary fusions** (was 8), **10 named combos** (was 5), 26 legendary combinations in total. Every ability has been coverage-tested in simulation. |
| **Grand Exchange** | Out-of-sample forecasting study (`docs/MARKET_CALIBRATION.md`), recalibrated priors and live model, 16-outcome **tournament champion markets**, **real limit orders** (escrow, partial fills, cancel, expiry), and a trader fix. |
| **Dynasty** | **Sponsorship contracts** (upfront to the rival, 30% revenue share, conflict-of-interest blocks) and a **Championship Venue** (hosting fees from pools; Profit or Prestige focus). |
| **Presentation** | Portrait **expressions** (smile, frown, shock, smirk) driven by table events; idle, lean, slump, all-in shake and victory-jump animations; arena **crowds** and warm lighting; **outfits & headgear** cosmetics (crown, galea, laurels, armour); the Grand Champion ceremony; an original **procedural soundtrack** (menu theme, arena drums, fanfares) with music toggle and volume. |
| **Legacy** | Career profile: winnings, net worth, highest rank, win rate, largest bluff, biggest comeback, favourite build, Exchange record, properties, rivalry records. Also a trophy room, timeline and 7 new achievements. |
| **Saves** | Schema 5. Migrations 3→4→5 with a pre-migration backup, tested on **both** archived V1 and V2 fixtures, including an in-progress V2 tournament. |

## Investigations (details in the balance report)
* **Imperial Tournament EV (V2 reported −$28.44 over n = 25).** There is no payout defect. The pool is 18 entries and is 100% distributed, so an average entrant expects +12.5% of their entry. Over 400 runs the simulated player averaged **+$32.84 per run, 95% CI [$13.91, $51.76]**, on a $90 entry with a standard deviation of $193. The V2 figure was small-sample noise, so the payouts were left unchanged.
* **Forecasting.** Pre-match public information (rating, win rate, form, Arsenal) does **not** predict winners in this format: every model scored log loss ≈ 1.386, the same as uniform guessing. Live chip share predicts well: log loss 1.14 at hand 20 with good reliability. Priors now follow this evidence. The Exchange's skill lies in **live** trading, and the UI and docs say so.
* **Live market calibration bug.** Before the fix, traders skipped an overpriced outcome they didn't hold (for example an eliminated player) instead of buying the underpriced ones. Live prices therefore scored worse than uniform (Brier 0.770). After the fix, Brier at hand 20 is **0.678**.

## Bugs found and fixed during verification
* A rival could retire while entered in a scheduled event. Event rosters and sponsored rivals now count as busy, and the event runner substitutes defensively.
* Chip and a Chair could never trigger (it required surviving a lost all-in at 6 BB).
* Emperor's Feint was too rare to matter: 3 triggers in 200 matches, now 17.
* Sponsorship revenue share ignored background bouts. Terms were rebalanced from −97% (and a harness metric bug) to about −6% to −11%: a fair gamble.
* At the population cap, a rank could fall below 4 rivals. The minimum is now always guaranteed.
* A new career showed an empty circuit calendar. The calendar is now scheduled at start and on load.
* Matches got shorter with AI 3.0 (median 2.7 min). Blinds now rise every 6 hands, giving a median of 41 hands ≈ 3.1 min.
* AI 3.0's first bet-size read made it *worse* than AI 2.0 (46%, CI excluding 50%). It was redesigned to be pattern-relative, and it was the push/fold improvements that produced the significant gain.

## Partially completed / not implemented (honest list)
* **Arsenal:** 122 abilities sits within the 120–150 target. Six abilities are mostly informational for the AI and rarely trigger in AI-only simulation (the info actives and pure reward passives).
* **Exchange markets:** tournament champion markets are done. **Finalist, final-placement, promotion-outcome, qualification, season-milestone and rival-streak markets are not implemented.**
* **Limit orders** exist on match markets only, not on champion markets.
* **Business customization** is limited to the Championship Venue's Profit/Prestige focus. There are no property interiors, and only 2 new business types (Championship Venue; sponsorships through the existing office).
* **Character animation** is lightweight: CSS motion plus 5 expression frames per portrait. There are no frame-by-frame sprite animations or full-body poses.
* **Audio** is a small procedural synthesizer soundtrack, not composed or recorded music.
* **Discipline** is the strongest archetype at the Imperator tier (~37–40% on fresh seeds; fair share 25%). It sits at 25–29% at the other tiers. Several nerfs were applied and the residual is documented, not hidden.
* **Rival population** is held at 121–140 rather than 150–250. That range was chosen for save size and day-simulation cost (§14), not tested at larger sizes.
* **AI improvement attribution:** bet-size memory alone showed **no** measurable benefit; the significant gain over AI 2.0 comes from push/fold and stack discipline.
* **iPhone:** layout and touch play are verified in an iPhone 13 viewport (Chromium emulation). True offline use on iPhone still requires HTTPS hosting of `dist/`, as in 2.0, and was not verified on a physical device.
