# UI slice 3 plan: detailed mode (approved 2026-10-08)

**Status (2026-10-08): done.** Step 0, group 1 (checkpoint approved), group 2, JSON export/import
and the public-repo prep are merged and live. Where the build differs from this plan is in
`docs/ui-design.md` §12, "UI slice 3 versus this design". What's left of the prep is the settings
the user changes (item 7) and the visibility.

The plan for UI slice 3 and the public-repo prep after it, with the decisions made in review on
2026-10-08. A fresh session should be able to execute it from this file, `CLAUDE.md` and
`docs/ui-design.md`.

**Starting point.** Slice 2 is done and live (merge `d4ef7de`, then `5557b31`). The engine already
supports every detailed input below (`src/offer/types.ts`); slice 3 is mostly UI, plus engine
item 7 (errors tied to the field that caused them).

**Working agreements apply** (CLAUDE.md): a branch for the slice (`ui-slice-3-detailed`); separate
commits per step; tests, typecheck, the engine guard and an unchanged grid before each merge;
`npm run build` before merging UI work; pushing `main` deploys production.

## Scope (from `docs/ui-design.md`)

- **§12, slice 3:** detailed mode, every section, with the help text for each, and engine item 7
  (§11): error codes with input paths instead of message-only throws.
- **§3.3, the nine sections,** one column per offer: pay, bonus, sign-on and other cash, equity,
  401(k), health, perks, hours, where you'd live.
- **§3.3, the rules:**
  - One Quick/Detailed switch for the whole ledger, with one section open at a time.
  - Hidden inputs still count, and say so: quick mode's chip lists what's still counted, with "Show".
  - Ranges are opt-in: one value (base) and a "+ range" link that reveals bear and bull.
  - Complex inputs open an editor beneath their row, spanning the ledger, so the other offers stay
    in view (W3): vesting tables, promotions, match tiers, cash awards, the bonus schedule.
- **§3.5, help on every input:**
  - a hint of 12 words or fewer, always visible;
  - an ⓘ toggle with 2-4 sentences: what it means, an example, what its default does;
  - "How this is used →", a link to the methodology section.
  - It lives in `app/help.ts`, keyed by input path; a test fails if any input lacks a hint or help.
- **§3.6, defaults:** a default is a real, visible, editable value with a `D` tickmark that says
  why, and "Reset to default" in its help. Editing removes the `D`.
- **§3.4, errors:** an error shows under the field that caused it, in plain English. Results keep
  the last valid state and say so.

## Decisions (2026-10-08)

1. **Build order:** step 0 (groundwork), group 1 (the inputs that most often change the verdict),
   a review checkpoint, group 2 (benefits and clawbacks), JSON export/import, then the final review
   stop. Public-repo prep follows the slice.
2. **A checkpoint after group 1:** merge, deploy, screenshots, stop for review, as in slice 2.
3. **JSON export/import moves into slice 3** (from slice 6), with the Data page's "Delete all
   data". CSV export of each table and print stay in slice 6. Why: detailed offers take real effort
   to enter, browser-only storage is easy to lose, slice 3 changes the saved format anyway, and an
   import is checked with step 0's validator.
4. **Blank defaults for weekly hours and the health premium.** No number is honest for either
   (40 or 80 hours; a premium you haven't seen), so the field stays blank and the offer is marked
   "Not counted" for it, rather than inventing a value.
5. **An asymmetry warning** whenever a cost or benefit is counted for some offers but not others
   (step 0.5).
6. **Per-hour figures only when every offer has hours.** The engine already omits per hour unless
   every offer has hours; the UI must never show one offer's per-hour figure alone (step 0.5).
7. **No open-source license.** The repo will be public but all rights reserved, to keep the option
   to commercialize. No LICENSE file; the README says "All rights reserved; source shown for review
   only." (Public-repo prep, below.)

## Step 0: groundwork

### 0.1 Engine item 7: validation with input paths
- `validateOffer(offer, household?)` in `src/offer/validate.ts` returns **every** problem at once:
  `Array<{ code, path, params }>`, for example
  `{ code: "trancheSum", path: "equity.grants.0.schedule", params: { sum: 0.95 } }`. The engine
  returns codes and numbers only; `src/format` writes the words (`formatIssue`), so
  `scripts/check-engine.ts` keeps passing.
- It covers every check the engine throws today (about 40: `grep -n "throw new Error" src/offer`),
  each with a path. `projectScenario` keeps its throws as a backstop.
- Plain-English messages, at the field:
  - "These tranches add up to 95%: 5% is missing." (and "105%: 5% too much")
  - "Each match tier must go higher than the one before it."
  - "The promotion date must be after your start date."
  - "Weekly hours must be between 1 and 168." / "Weeks a year must be between 1 and 52."
  - "A clawback window is a whole number of months, at least 1."
  - "Payments before 2026 aren't supported: tax data starts in 2026."
- Percent editors take rounding into account: a schedule entered as 33.33/33.33/33.34 is 100%; one
  at 99.99% offers a fix ("Make the last row 33.34%") rather than only an error.
- Tests: each code, its path, and its edge (exactly 100%, a promotion on the start date and the day
  after, hours 168 vs 168.5).

### 0.2 Offers become editable detailed data
- `AppOffer` holds a full detailed draft for every offer, not just the samples' opaque `base`.
  Quick fields map onto it; the samples become ordinary editable values (still stamped `SAMPLE`
  until edited, then `EDITED SAMPLE`).
- The saved session moves to `schemaVersion: 2` with a migration from v1 (`base` becomes the
  draft). Old saves load; a test round-trips a v1 session.

### 0.3 Shared building blocks
- `app/help.ts` keyed by input path, and its coverage test (every rendered input has a hint and help).
- A defaults registry: each default's value, its reason, and its methodology section. It drives the
  `D` tickmarks, their derivations and "Reset to default", so they can't disagree.
- The "+ range" control (base, then bear and bull), and the row editor that opens beneath a row.
- The Quick/Detailed switch becomes live (today it's disabled and says "coming soon"); update that
  wording, the "Also counted" row, and the methodology's "detailed mode, coming soon" mentions.

### 0.4 "Show the work" reaches every detailed input
- Each detailed input gets a metric id (`in.A.bonus.payOn`, `in.A.equity.grants.0.schedule`, ...)
  and a `Trace` wrapper, so derivations that use it light it up.
- The figures it affects point to it with a `T` tickmark, for example: the bridge's bonus line ->
  the bonus amount and payout date; the RSU line -> the grant and its schedule; per hour -> weekly
  hours; the 401(k) line -> the match and vesting; the tax line -> where you'd live.
- "Edit it" opens the right section (and row editor) and focuses the field.
- The registry test renders detailed mode with every section open, so a detailed input without a
  kind, a section or a derivation fails it.

### 0.5 Comparability: the asymmetry warning and per-hour
- **The warning:** whenever a cost or benefit is counted for some offers but not others, the lead
  schedule says so under the verdict, naming who and what, and why it matters:
  > Health costs are counted for A but not for B. If B has a health plan, add it: otherwise the
  > comparison favors B.
  - Categories: health premium, out-of-pocket costs, employer 401(k) money, employer HSA money,
    perks, and hours. Not offer terms that are genuinely absent (an offer without RSUs, a bonus or
    a sign-on is just smaller).
  - It stays while it applies (no dismiss), and moves into L-5 when that schedule arrives (slice 5).
  - Computed in the app from the inputs (`app/src/comparability.ts`); words in the app; tests for
    each category, and for none when all or no offers have it.
- **Per hour only when every offer has hours:** the "Per hour" step is disabled with "Add weekly
  hours for every offer"; pay per extra hour and L-1's per-hour view don't appear; no per-hour
  figure for one offer shows alone. A test renders two offers, one without hours, and checks that no
  per-hour figure appears.

## Group 1: the inputs that most often change the verdict

For every input: a hint and ⓘ help with "How this is used →", a default with a `D` tickmark and its
reason (or blank, where decided), validation at the field, and a "Show the work" path from the
figures it affects. Ranges are opt-in where the field is uncertain.

| Input | Engine field | Default | Checks | Figures it affects |
|---|---|---|---|---|
| Weekly hours (+ range) | `hours.weekly` | **Blank: "Not counted"** (decision 4) | 1-168 | Per hour, pay per extra hour, 401(k) plan-year hours |
| Weeks a year | `hours.weeksPerYear` | 50 `D`: two weeks off | 1-52 | Same |
| Bonus basis | `bonus.basis` | % of salary `D` (the usual quote) | — | Bridge bonus line, every total |
| Bonus amount (+ range) | `bonus.amount` | Blank = no bonus | ≥ 0 | Same |
| Bonus by year (schedule editor) | `bonus.amounts` (`byEmploymentYear`) | — (the last year repeats; say so) | at least one year, each ≥ 0 | Same |
| Payout date | `bonus.payOn` | Mar 15 `D`: the most common date | a real month/day | Bridge bonus gloss, L-1, PV |
| Bonus year starts | `bonus.periodStart` | Jan 1 `D`: the calendar year | a real month/day | Same |
| Cutoff | `bonus.cutoff` | None `D` | a real month/day | First bonus |
| First payout guaranteed | `bonus.firstPayoutGuaranteed` | No `D` | — | Scenarios (slice 4) |
| Must be employed on the pay date | `bonus.mustBeEmployedOnPayDate` | Yes `D`: the usual rule | — | Leaving early (slice 5) |
| RSU grant: value | `equity.grants[i].value` | — | ≥ 0 | Bridge RSU line, every total |
| Grant date, vesting start | `grantDate`, `vestStart` | Your start date `D` | a real date; no vest before 2026 | Same |
| Vesting schedule | `schedule.tranches` | 25/25/25/25, quarterly after a 1-year cliff `D` (`evenQuarterlyAfterCliff`, the most common) | — | Same |
| Presets | `VESTING_PRESETS` | Named by `describeSchedule`: 25/25/25/25 quarterly after a 1-year cliff; 25/25/25/25 annual; 5/15/40/40 semiannual after a 1-year cliff; 33/33/22/12 monthly | — | Same |
| Custom schedule (editor) | `schedule.tranches` | — | sums to 100%; months whole ≥ 0; each % > 0 | Same |
| Company vest dates | `schedule.vestDates` | None `D`: vests on the schedule's dates | at least one month; a real day | Bridge "RSUs vest on company dates" |
| Share-price growth (+ range) | `equity.priceGrowth` | 0% `D`: uncertain, so zero | > −100% | RSU values |
| Refreshers (+ range) | `equity.refreshers` | None `D` | value ≥ 0; first after ≥ 0 and every ≥ 1 whole months; schedule sums to 100% | Later years |
| Merit raise (+ range) | `salary.raise` | 0% `D`: uncertain, so zero | > −100% | Every year after the first |
| Raises take effect | `salary.raiseOn` | Each work anniversary `D` | — | Same |
| Promotions (editor) | `salary.promotions` | None | after the start date; step-up > −100%; scenarios (default all three `D`) | L-1 notes, every later total |

**Checkpoint after group 1:** full checks (tests, typecheck, engine guard, grid, build with bundle
sizes, bench side by side with `main`, keyboard-only, phone width), then merge, deploy, and stop with
light and dark screenshots of the live site: detailed mode open, a row editor, a validation error,
and a popover tracing to a detailed input.

## Group 2: benefits and clawbacks

| Input | Engine field | Default | Checks |
|---|---|---|---|
| Your 401(k) contribution | `retirement.contributionPct` | 0% `D`, with help saying the full match needs X% (from the tiers); no advice | 0-100% |
| Pre-tax or Roth | `retirement.type` | Pre-tax `D` | — |
| Pay that counts | `retirement.eligiblePay` | Salary `D` | — |
| Match tiers (editor) | `retirement.match` | None | each tier higher than the last; rate ≥ 0 |
| Non-elective | `retirement.nonElectivePct` | 0% `D` | ≥ 0 |
| Vesting | `retirement.vesting` | Immediate `D`, with help: many plans vest immediately; check your plan's summary for a cliff or a graded schedule | cliff years whole ≥ 1; graded steps increasing to 100% |
| Vesting service | `retirement.vestingService` | Elapsed time `D` | plan-year hours needs weekly hours |
| Health premium | `health.premium` | **Blank: "Not counted"** (decision 4) | ≥ 0 |
| Out-of-pocket, low/medium/high | `health.outOfPocket` | Blank: "Not counted" | ≥ 0; low ≤ medium ≤ high |
| Out-of-pocket maximum | `health.oopMax` | Blank | ≥ 0 |
| HSA, yours and the employer's | `health.employeeHsa`, `employerHsa` | $0 `D` | ≥ 0; over the limit warns |
| Coverage | `health.coverage` | Self `D` | — |
| Health usage (About you) | `household.healthUsage` | Medium `D`: the middle of your own estimates | — |
| Education assistance | `perks.section127` | $0 `D` | ≥ 0; over $5,250 warns |
| Commuter, a month | `perks.commuterMonthly` | $0 `D` | ≥ 0; over $340 warns |
| Cash award: amount, label | `cashAwards[i]` | — | ≥ 0 |
| Paid on | `paidOn` | 30 days after start `D` | a date in 2026 or later, or whole days ≥ 0 |
| Clawback window | `clawback.months` | None; when added: 12 months `D` | whole number ≥ 1 |
| Full or prorated; per month or day | `kind`, `per` | Prorated `D`, by completed months `D` | — |
| Clock starts | `from` | Your start date `D` | — |
| Repay | `repay` | Gross `D`: the usual contract term | — |
| Employer state | `employerState` | The state you'd live in `D` | a state; the remote-work warning shows when it applies |
| Rent growth | `costOfLiving.rentGrowth` | Inflation, 2.5% `D` | > −100% |

The asymmetry warning (step 0.5) covers health, employer 401(k) and HSA money, and perks.

## JSON export/import (moved from slice 6)

- **The Data page** at `#/data` (§3.1, §10): what's stored (this browser only), Export, Import and
  "Delete all data".
- **Export:** one versioned JSON file:
  - `{ format: "offer-calc", schemaVersion, exportedAt, household, offers }`, with view choices
    optional.
  - The file name is `offer-calc-YYYY-MM-DD.json`, ending `-sample` while any sample is present,
    and the file carries a note that the samples are illustrative.
- **Import:**
  - Reject other formats; migrate older schema versions; check every offer with `validateOffer`.
  - Show a summary of what will be replaced (offers, household), and the problems found, field by
    field, before anything changes. Import replaces everything only after "Replace".
- **Delete all data** clears this browser's storage after a confirmation and reloads the samples.
- **Tests:** a round trip gives the same results; an invalid file lists its problems and changes
  nothing; a v1 export migrates.

Then the final slice-3 checks, docs (`docs/ui-design.md` §12 "slice 3 versus this design",
CLAUDE.md), merge, deploy, and stop with light and dark screenshots of the live site.

## Public-repo prep (after slice 3, before the repo goes public)

Scanned on 2026-10-08: all 69 commits are authored with the GitHub noreply address; no keys,
tokens or passwords appear in any commit; no sensitive file was committed and deleted; `.vercel/`,
`.venv/`, `node_modules/`, `dist/` and the generated grid and oracle reports are ignored. Re-run the
scan before switching the visibility.

1. **No open-source license** (decision 7). Add no LICENSE file. The README states "All rights
   reserved; source shown for review only." Worth knowing: GitHub's terms of service let other
   users view and fork a public repository on GitHub.
2. **Rewrite the README:**
   - what it is, the live link (https://offer-calc.vercel.app), screenshots, the pipeline, setup,
     validation, and the license line above;
   - **an honest Claude Code note:** built with Claude Code, Anthropic's AI coding assistant, with
     design, decisions and review by the author. Every commit carries a "Co-Authored-By: Claude"
     trailer.
   - **a data-attribution section:**
     - BEA Regional Price Parities 2024 (released Feb 19, 2026);
     - HUD Fair Market Rents FY2027;
     - Census ACS 2024 1-year, table B25064;
     - IRS Rev. Proc. 2025-32, Notice 2025-67, Rev. Proc. 2025-19 and Pub. 15/15-T;
     - the SSA 2026 fact sheet;
     - the Tax Foundation's "State Individual Income Tax Rates and Brackets, 2026", and each later
       state law (as listed in the methodology's M-11);
     - PolicyEngine-US, used only to validate the tax engine (not bundled);
     - Atkinson Hyperlegible Next and Mono (Braille Institute, OFL-1.1) and React (MIT), installed
       from npm.
3. **Make CLAUDE.md line 5 neutral:** drop "Portfolio piece for analyst-track roles"; keep
   "Correctness and a clear methodology page matter more than features."
4. **Use an honest User-Agent in `scripts/fetch-fmr.ts`,** naming the project and its repo instead
   of imitating a browser. Add a manual-download fallback: if HUD USER answers with its empty 202
   page, print the file's URL and accept `npm run fetch-fmr -- --file <path to FY27_FMRs.xlsx>`.
5. **Add a CI workflow,** `.github/workflows/ci.yml`: on pushes and pull requests, `npm ci`,
   `npm test` (with the engine guard), `npm run typecheck` and `npm run build`. The oracle stays
   manual: it needs Python and PolicyEngine and takes minutes.
6. **Ignore `.claude/`:** add it to `.gitignore` and `git rm --cached .claude/launch.json`. The
   desktop preview config then stays local.
7. **Settings you change** (not in the repo):
   - **GitHub branch protection for `main`:** require a pull request and the CI check, and block
     force pushes and deletion. Pushing `main` deploys production.
   - **Vercel:** keep Git Fork Protection on, so a fork's pull request can't run a deployment
     without approval, and review the preview-deployment settings.
   - Then switch the repository's visibility to public.
