# Minnesota Mayhem 2.0 — Game Rules & Design Reference

## Imperium Poker (the match)
* Four players, No-Limit Texas Hold'em, 1,500 tournament chips each. Tournament chips are separate from Dollars.
* Blind schedule (5 hands per level): 10/20 → 15/30 → 25/50 (ante 5) → 40/80 (10) → 60/120 (15) → 100/200 (25) → 150/300 (40) → 250/500 (60) → 400/800 (100) → 600/1200 (150).
* **Accelerated finish rule:** after the last listed level, blinds and antes keep **doubling every 5 hands**. This guarantees a natural finish (median ≈ 42 hands; see `BALANCE_REPORT.md`).
* **Safety rule (documented, practically unreachable):** if hand 200 is ever reached, remaining players are ranked by chip count. In 720 simulated matches the maximum was 64 hands; the rule never fired.
* Full rules: fold / check / call / raise / all-in, minimum raise = last full raise, incomplete all-in raises do not reopen betting, uncalled bets are returned, side pots, dealer rotation, heads-up blinds (button posts the small blind), odd chips go to the first winner left of the button.
* Placement = reverse elimination order; players busting on the same hand are ordered by their stack at the start of that hand.
* Chips are conserved exactly. Verified by tests on every action of hundreds of simulated matches.

## Resolve
A per-match tactical resource (0–10). You start with 2 (+1 or +2 for archetype set bonuses) and gain +1 every second hand, plus whatever your passives grant. Actives cost Resolve. Resolve is not money and disappears after the match.

## The Arsenal (44 abilities, 8 archetypes)
Bluff · Pressure · Discipline · Counterplay · Momentum · Economy · Comeback · Information. Each archetype has five abilities; four legendary **fusions** are crafted from two abilities.

### Integrity rules (enforced in code)
Abilities never touch the deck, never reveal hidden cards, never predict random outcomes, never change hand rankings and never alter how pots are split. AI opponents only ever see an `AIView` that contains their own cards, the board and public betting history (unit-tested: swapping opponents' hidden cards and the deck order cannot change an AI decision). Equity displays (Augur's Eye, Oracle of Delphi) are computed from your own cards + the board only, sampling unseen cards, never the real deck.

### Effect primitives
| Primitive | Meaning | Bounds |
|---|---|---|
| Tribute | chips from one player to another **after** the pot is settled | ≤ 3 BB received / paid per hand per player; ≤ 25% of payer's stack; can never eliminate (payer keeps ≥ 1 chip) |
| Restitution | refund from the hand's biggest winner to a loser | ≤ loser's contribution; ≤ 50% of the payer's net gain that hand; ≤ 3 BB |
| Waiver | 50% of your own next blind is waived | at most 2 queued |
| Ward / Veto | negates a tribute aimed at you | — |
| Resolve | gain/lose Resolve | 0–10 |
| Reward | post-match Dollar modifiers | all prize bonuses capped at +20% |

### Resolution order (simultaneous effects)
1. Pots are settled by normal poker rules (unchangeable).
2. Wards and Vetoes are checked as each tribute is applied.
3. **Tributes**, in seat order starting left of the button.
4. **Restitutions**, same order.
5. Resolve gains.
6. Next-hand modifiers (blind waivers).
7. Eliminations are evaluated last.

### Timing windows for actives
`preflop`, `postflop` (flop or later), `river`, `any` — always only on **your own turn**, once per hand per ability, subject to Resolve cost and per-match uses.

### Build systems
* 8-slot loadouts, saved presets, respec by unequipping (free) or dismantling (40% refund).
* Levels 1–3 (bounded magnitudes), Sigils (Haste / Might / Endurance / Thrift — each a trade-off), legendary fusions.
* Set bonus: 3 of an archetype → +1 starting Resolve, 5 → +2.
* Eight pair synergies (e.g. *Phoenix Rising*: Last Stand + Phoenix Ash).

## Ranks
Peasant 1000 · Plebeian 1080 · Gladiator 1170 · Centurion 1260 · Praetor 1350 · Consul 1440 · Imperator 1530 · Caesar 1620 · Augustus 1710.
* Rating: multi-player Elo (K = 48, every pair of finishers scored head-to-head) + podium bonus (+6 for 1st, +3 for 2nd).
* Rating floor = current rank threshold − 40. Rating is capped at next threshold + 60 until the **Promotion Trial** is passed.
* Trial: three opponents of the next rank; finish top 2 to be promoted. Failing costs at most 15 rating and never your rank.
* Dollars can never buy rating or rank.
* **Ascension** (prestige): at Augustus with 1770+ rating you may return to Peasant with a laurel, title and +10% Glory per Ascension. No competitive power is granted.

## Economy (one currency: Dollars, stored as integer cents)
* Start: $500. Every movement is a ledger entry with account and reason; duplicate rewards are blocked by idempotency keys; overdrafts are refused.
* Arena prize pool = 4 entries + a Senate purse (60% of an entry): 50% / 30% / 20% / 0%.
* **Bread & Circuses**: free match whenever bankroll < $40 (prizes $30/$15/$5, no rating change). You can never be locked out.
* Sinks: entry fees, Forge, property, upkeep, cosmetics, 2% exchange fees.

## The Arena Exchange
* Every market is backed by one canonical, fully simulated AI-only match (same engine as yours). That single result settles contracts, updates rival careers and is shown in the match feed.
* LMSR market maker, `C(q) = b·ln Σ exp(qᵢ/b)`, b = 120, computed with log-sum-exp. Prices only move when someone trades. Worst-case market-maker loss `b·ln(1/min p₀)` is tracked and shown.
* Buy costs round **up** to the cent, sell proceeds round **down**, plus a 2% fee. Whole contracts only. No short selling: you cannot sell more than you own.
* Ten simulated traders per market (fundamental, momentum, contrarian, noise, whale) with finite budgets trade on public information only (priors from ratings, chip counts between hands).
* Trading is open before the match and **between hands**; it is locked while a hand is in progress and after the match ends.
* Settlement is idempotent (status + key). If a competitor withdraws before the match (3% chance, decided deterministically), the market is cancelled and the open cost basis is refunded once.
* Priors were calibrated by log-loss against 500 simulated matches (softened rating strength, exponent 0.5).

## Empire
Villa (rent), Augur's Library (Exchange research), Card Club (Club Nights), Training Academy (Forge discounts), Tournament Arena (rent + Grand Games every 5th day), Sponsorship Office (top-2 bonuses), Imperial Estate (Glory, gold cosmetics). One day passes per arena match; income and upkeep are applied daily. Selling refunds 50%.

## Rivals
~56 persistent rivals with procedural pixel portraits, names, style archetype, six personality parameters (aggression, bluff, tightness, risk, adaptation, skill), loadouts, bankroll, career record, form, nemesis and rivalry with you. Each day 8 summarised background matches run among rivals (Plackett–Luce on strength), rivals promote/demote, slowly gain skill (bounded by rank) and upgrade abilities. Matches you play and Exchange matches are fully simulated.

## Imperial Ascension additions

### Expansion hooks (resolution order is unchanged)
`arsenal2.ts` adds hooks at fixed points: **hand start** (Bubble Lord, Endurance Pact, Cartographer), **blinds posted** (Iron Ration), **after each action** (check-raise, 3-bet, flat-call and fold-to-bettor tracking from public actions), **on arm** (Overwatch, Interdict, Tell Reader, Victory Lap discount), **hand end** (effects queued like V1), **per tribute** (Ember Guard / Eternal Flame guards, then Blockade, Imperial Conspiracy and Caesar's Ascension bonuses, then Veto and Wards), and **elimination** (Executioner, Survivor's Purse). Cooldowns are counted in hands. Every effect is still one of the bounded V1 primitives and remains subject to the same per-hand caps.

### Named combos
| Combo | Pieces | Effect |
|---|---|---|
| Imperial Conspiracy | Caesar's Gambit + Senate's Betrayal + Mask of Janus | Gambit/Betrayal tributes +0.25 BB; Mask costs 1 |
| Golden Legion | Iron Discipline + Golden Touch + Legion Formation | Formation tribute from 2 Formation; +5% prize |
| Frozen Empire | Frozen Legion + Vestal Vigil + Fortress Wall | +2 Wards; Frozen Legion +2 uses |
| Senate Collapse | Thunder of Jupiter + Senate Whisper + Caesar's Gambit | Thunder costs 1; Whisper triggers on a single fold |
| Caesar's Ascension | any two legendary fusions | +1 starting Resolve; +0.25 BB on every tribute you collect |

### Game modes
| Mode | Rules | Rewards | Unlock |
|---|---|---|---|
| Quick Clash | 800 chips, blinds every 3 hands | ½ entry, ½ rating swing, ½ season points | 1 match |
| Daily Challenge | one Arsenal and deal seed per calendar day (local date) | first attempt pays 3× / 1.5× / 0.5× entry; later attempts are practice | 2 matches |
| Draft Arena | pick 1 of 3, eight times; level-2 temporary Arsenal | prize table ×1.1, unrated | 3 matches |
| Rival Challenge | your fiercest rival + 2 | bounty 1.5× entry for finishing ahead of them | a rivalry (3 shared matches) |
| Survival Gauntlet | up to 5 matches; top-2 to advance; opponents get stronger | cash out 2.2× / 4.8× / 10× / 20× / 40× entry after stage 1–5; fail = lose it | Plebeian |
| Imperial Tournament | 16 players, four 4-seat heats, winners → final | pool = 18 entries: 40/22/13/9% to the final table, 4% to each heat runner-up | Plebeian + 5 matches |
| High Roller | 4× entry, rivals +0.06 skill | richer purse, 1.25× rating swing | Gladiator |

### Exchange books
| Book | Outcomes | Resolution rule | Early lock |
|---|---|---|---|
| Match Winner | 4 | last player with chips (hand-cap rule ranks by chips) | — |
| First Elimination | 4 | first player eliminated; same-hand busts ordered by smaller starting stack | when the first player busts |
| Long Match | Over / Under | Over if hand 41 is dealt before a champion is decided | when hand 40 completes or the match ends |

### World
* One canonical write path (`recordWorldMatch`) updates rival careers, season points and reputation for every fully simulated match (yours, Exchange matches, tournament heats). Background bouts are statistical and are labelled as such.
* News is generated only from those writes: promotions/demotions, upsets (winner priced < 17%), market results, tournaments, seasons, bankruptcies, retirements and rookies.
* Seasons last 15 days. Points per placement: 10 / 6 / 3 / 1 (Quick Clash and background bouts ×0.5, Imperial Tournament finals ×2). Player rewards: champion 20× entry, top 3 8×, top 10 3×.

# 3.0 — The Eternal Empire additions

## The Imperial Circuit (`src/core/circuit.ts`)
* **Calendar** (rolling 6 days, seeded from the world seed): Local event every 3rd day (your rank ±1), Regional every 5th (rank band of three), and every 7th day an Invitational (top-rated rivals; you are invited at your rank's threshold rating), a High-Roller Festival (5× buy-in) or a Rival Revenge Night (your fiercest rivals). Each season, a **Last Chance Qualifier** three days before the end, open to everyone outside the top 16, awards the playoff wildcard.
* **Format:** 16 players, four 4-seat heats (random tables; playoffs use snake seeding 1-8-9-16 …), heat winners form the final table. Tournament chips are separate from Dollars.
* **Prize split of the pool** (16 entries + purse): champion 35%, runner-up 18%, 3rd 11%, 4th 8%, each heat 2nd 4%, each heat 3rd 3% = **100%** (verified in tests with a rounding tolerance of a few cents). A Championship Venue owner takes a hosting fee out of the pool (not on top of it).
* **Eligibility & registration:** opens 2 days before the event; the entry is charged on registration. The lowest-rated entrant gives up their seat to you. **No-show rule:** if you do not take your seat within 3 days of the event day, an alternate replaces you and the entry is not refunded.
* **Seasons (15 days) → playoffs:** regular-season points come from every recorded match plus circuit finishes. At season end the top 16 (and the wildcard) qualify for the **Imperial Grand Championship**, scheduled immediately. Its champion — not the points leader — enters the **Hall of Champions**. Regular-season awards for the player: 8× / 4× / 2× entry for points-leader / top 3 / top 10.
* **One canonical write path:** each table is simulated once; that result feeds the bracket record, rival careers (titles), season points, news, the champion market settlement and the Hall. Integrity tests check all of them agree.
* **Replays & highlights:** every table stores its per-hand stack history and highlights (biggest pot, eliminations, bluffs) for hand-by-hand replay in the bracket viewer.

## AI 3.0 (`src/core/ai.ts`)
* **Bet-size memory:** every showdown records whether the shown hand followed a big (≥ ¾ pot) or small post-flop bet and whether it was strong (two pair or better). Facing a bet, the AI compares the strength rate for that size bucket against the same opponent's overall showdown strength (empirical-Bayes shrinkage) and adjusts its calling margin only for a genuine *pattern*.
* **Push/fold** at ≤ 12 BB: calls shoves on true pot odds against the shover's public range; widens shoves against opponents who fold often.
* **Stack-commitment discipline:** avoids committing > 60% of its stack with marginal equity.
* **Personalities:** aggressive rivals bluff more into passive tables; conservative rivals bluff less and punish shown bluffers; tournament specialists tighten near elimination; combo specialists read visible loadouts (v2).
* Information boundary unchanged: own cards, the board, public actions/sizes, and shown-down hands only.

## Legendary Arsenal rule engine (`src/core/abilities3.ts`, `arsenal3.ts`)
Rule = **trigger** (win, winShowdown, winUncontested, loseShowdown, foldPre, foldPost, allinWin, multiwayWin, riverWin, multiStreetWin, bigPotWin, checkRaiseWin, threeBetWin, handStart, elimination, survive) + **conditions** (stack ≤/≥ X BB, players left ≤ N, hand ≥ N, armed, streak ≥ N, late blind level, chip leader/not, weak/high-card-only hands) + **effect** (tribute to losers/folders/showdown losers/river bettors/leader, restitution, Resolve, Ward, waiver, reward %) with an optional second effect. Each ability triggers at most once per evaluation (stacking limit); per-hand tribute caps, Wards and Vetoes apply unchanged; replay is deterministic (tested).

## Grand Exchange
* **Tournament champion markets:** 16-outcome LMSR (b = 150) on every scheduled circuit event; closes when play starts; settles once to the canonical final-table winner. You cannot trade an event you entered or that includes a rival you sponsor.
* **Limit orders** (match markets, every book): buy orders reserve ⌈qty × limit × 1.02⌉ in escrow; sell orders reserve contracts; fills only between hands and only up to the quantity that keeps the marginal price at the limit (natural partial fills); cancel / expire (chosen hand, match end, settlement, early book lock) releases unused escrow exactly once.
* **Priors:** pre-match priors are now the fitted, near-uniform rating model and live fair value is chip share^0.8 — both chosen from the out-of-sample study in `MARKET_CALIBRATION.md`.

## Dynasty
* **Sponsorships** (needs a Sponsorship Office; level + 1 concurrent contracts): pay an upfront fee (2× the rival's rank entry × form factor) directly to the rival; for 10 days receive 30% of every prize they win (circuit, Exchange matches, background bouts), paid out of their winnings. You cannot trade markets involving a sponsored rival; their decisions remain their own.
* **Championship Venue** (3 levels): hosts circuit events up to its tier and takes a 4–6% hosting fee from those pools (+1% with *Profit* focus; *Prestige* focus gives +150 Glory per hosted event instead).
