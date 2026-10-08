# Offer Calc — context for Claude Code

A job-offer comparison calculator. Differentiator: do the math correctly, in one pipeline —
gross comp -> after-tax -> location-adjusted -> per hour of your life, year by year (years 1-5),
and show the work. Portfolio piece for analyst-track roles, so correctness and a clear
methodology page matter more than features.

## Status (2026-10-08)
- **Tax engine** (`src/tax/`): done and validated against PolicyEngine-US for 2026, with
  projected later years (`paramsForYear`).
- **Offer model** (`src/offer/`): slices 1-6 done, merged to main and pushed:
  - **Slice 1:** salary, bonus and cash awards.
  - **Slice 2:** RSUs, vesting and refreshers.
  - **Slice 3:** leave date, clawbacks and the leave-date sweep.
  - **Slice 4:** raises and promotions, bear/base/bull, PV, `compareOffers` and `breakeven`.
  - **Slice 5:** 401(k), health, perks, hours and total rewards.
  - **Slice 6:** cost of living (BEA RPPs). The fixes made with it: after-tax comp and
    take-home as the cash measures, plan-year-hours vesting.
  - **After slice 6:** the COL-adjusted total (per year, window nominal and PV, a third
    breakeven basis) and rent growth.
  - **UI engine prerequisites (2026-10-08):**
    - profiling and caching: a projection is 10× faster;
    - `breakeven` outcomes;
    - `cliffs` / `nextCliff`;
    - `withholdingShortfall`;
    - `horizonSweep` with window hours, per hour and `monthlyEquivalent`.
  - **Before UI code (2026-10-08):**
    - the engine returns numbers and codes, and `src/format` writes the words;
    - HUD FY2027 Fair Market Rents as the rent estimate;
    - the type check for tabular figures.
- **Tests:** 141 passing: `test/offer.test.ts` 109, `test/params.test.ts` 22,
  `test/tax.test.ts` 10. Hand-checked values carry their arithmetic in comments.
  `npm test` also runs `scripts/check-engine.ts`: no text formatting inside the engine.
- `npm run offers` prints the sample tables: NYC IB analyst, Charlotte corporate finance,
  Seattle tech finance. Inputs are illustrative, not market data.
- **Design docs:**
  - `docs/offer-model.md`: approved rev 3, updated per slice. Its §12 types were the
    pre-build proposal; `src/offer/types.ts` is authoritative.
  - `docs/ui-design.md`: UI design, approved rev 2 (2026-10-08). Audit tickmarks are the
    signature element; the default basis is "After rent, at U.S. prices".

## Next steps
1. **Timing review** (stopped here). The engine prerequisites are done; their timings are
   in `docs/ui-design.md` §3.4, which recommends a Web Worker. Confirm that before UI code.
2. **UI slices** per `docs/ui-design.md` §12, starting with slice 2 (the shell). Engine
   items 6-10 in §11 come with it.

## Commands
- `npm test`: unit tests. `npm run typecheck`: `tsc -p .` (src and test, no Node types)
  and `tsc -p scripts` (Node types).
- `npm run oracle`: engine vs PolicyEngine-US for 2026, ~3-4 min. It needs a `.venv` with
  `requirements.txt` (see README); the runner picks `.venv`'s Python automatically.
- `npm run offers`: sample comparison tables.
- `npm run bench`: engine timings on the sample offers (median of warm runs). Re-run after
  engine changes; the UI's live-update budget depends on them.
- `npm run fetch-rpp`: re-download BEA RPPs into `src/col/rpp.json`. Run it when BEA
  publishes a new vintage (usually December).
- `npm run fetch-fmr [-- <FY>]`: re-download HUD Fair Market Rents into
  `src/col/fmr.json`. Default FY 2027. HUD publishes each fiscal year's FMRs in August or
  September, effective October 1. HUD USER needs a browser User-Agent, which the script
  sends.

## Code map
- `src/tax/`
  - `index.ts`: `computeTaxes(input, params?)`.
  - `params/`: 2026 data, `paramsForYear`, the SALT schedule.
  - `federal.ts`, `state.ts`, `local.ts`.
- `src/offer/`
  - `types.ts`.
  - `project.ts`: `projectScenario`, `leaveDateSweep`, `keptIfLeaving`.
  - `compare.ts`: `projectOffer`, `compareOffers`, `breakeven`, `horizonSweep`,
    `monthlyEquivalent`.
  - `cliffs.ts`: `cliffs`, `nextCliff`.
  - `withholding.ts`: `withholdingShortfall`.
  - `streams.ts`: salary path, bonus, cash.
  - `vesting.ts`: `byYear`, presets, snapping, refreshers.
  - `clawback.ts`.
  - `benefits.ts`: 401(k), health, perks, monthly pieces.
  - `location.ts`: convenience-rule warning.
  - `dates.ts`: civil dates as day numbers, UTC. `fromDays` and `yearOfDay` are memoized.
- `src/col/`
  - `rpp.json` (BEA data, source and vintage inside): `nonHousingRpp`, `rppArea`,
    `findRppAreas`.
  - `fmr.json` (HUD FY2027 FMRs, metro areas, source inside): `rent.ts` has `fmrArea`,
    `estimateRent` and `US_MEDIAN_GROSS_RENT`.
- `src/format/`: words for the engine's numbers and codes: event and benefit labels and
  formulas, warnings, assumptions, `usd`, `pct`, `describeSchedule`. Not part of the
  engine; the UI and the scripts use it.
- `src/samples.ts`: the three sample offers (illustrative), shared by the table script,
  the benchmark and the UI.
- `scripts/`: `grid.ts` and `oracle.py` (validation), `run-oracle.ts`,
  `offer-table.ts`, `bench.ts`, `check-engine.ts`, `fetch-rpp.ts`, `fetch-fmr.ts`, and
  `lib/zip.ts` (zip and xlsx readers for the fetch scripts).

## Working agreements
- **Branches:** one branch per slice. Merge to main with `--no-ff` when green (tests,
  typecheck, grid unchanged), push, delete the branch.
- **Tests:** hand-check at the edges: the day before vs the day of a vest, payout or
  window end; thresholds; bracket crossings.
- **Review stops:** stop after each slice and show `npm run offers` tables for review.
- **Tax-engine changes:** branch, then separate commits. After each: tests pass and the
  2026 oracle report is byte-identical to the baseline (or the diff is explained).
- **Windows PowerShell 5.1:** pass multi-line commit messages with `git commit -F <file>`;
  embedded double quotes break native argument passing.

## Conventions (keep these)
- Every parameter carries a source comment. Laws newer than the Tax Foundation Feb-2026
  table are marked `OVERRIDE:` with the bill/statute.
- Schedules are `[lowerBound, rate]`; a 0% first band means "rate starts above X".
- State quirks live in `state.ts` under the state's `special` key; keep data in `params/`.
- Round only at output (`round2`); internal sums stay unrounded.
- Pure functions, no I/O in `src/`. The engine must run client-side in the browser.
  "Today" is always passed in (`valuationDate`), never read from the clock.
- The engine (`src/tax`, `src/offer`, `src/col`) returns numbers and codes, never
  formatted text. Events carry a `detail`; warnings and assumptions are `{ code, params }`.
  New text goes in `src/format`, and `npm test` enforces this.
- Engine functions take `TaxParams` as an argument; never import `*_2026` constants into
  `federal.ts`/`state.ts`/`local.ts`. Hardcoded thresholds in `state.ts` specials are
  2026 law; wrap them in `ix()` only if the state sets `indexed.specialThresholds`.
- A state amount changes in projected years only via an explicit, sourced flag: `indexed`
  (the state indexes it by statute) or a federal link (`stdDeductionIsFederal`,
  `wageCap: "ssWageBase"`). Unverified = held flat. To upgrade a state, add `indexed`
  with the statute and a hand-checked projected-year test (see CA in params.test.ts).
- No misleading defaults: these default to 0 and are visible in assumptions:
  - raises
  - price growth
  - refreshers
  - savings rate
  The engine has no default inflation; the offer model defaults to 2.5%, shown.

## Key design decisions (settled; don't relitigate without the user)
**Time and tax attribution**
- **Dated events:** every payment or vest is a dated event. Tax is computed per
  calendar year on a cash basis. Events regroup into employment years for display and
  into the comparison window for totals, so all views reconcile.
- **Employment years:** employment year n = [start + (n-1) years, start + n years).
  Accrued pay belongs to the year of its first day. A discrete payment dated exactly on an
  anniversary counts toward the year just ended (a 12-month cliff vest is year-1 pay).
- **Extra-tax attribution:** an offer's tax for a calendar year = household tax with the
  offer minus without it (other wages, spouse wages). It's spread over that year's
  payments pro rata by gross.
- **Monthly accrual:** salary earns 1/12 of the annual rate per calendar month, and a
  partial month earns days worked / days in month. Calendar and employment years both sum
  to the annual rate. A rate change mid-month splits the month by days.
- **Projected tax law:** `paramsForYear(year, { inflation })`. Inflation indexes tax law
  and is the default rent growth; it never moves pay. Pay growth comes from raises and
  promotions.

**Scenarios, PV and comparisons**
- **Scenarios:** bear/base/bull are joint scenarios, not percentiles. Each sets every
  uncertain input at once: bonus, raise, price growth, refresher size, which promotions
  happen. Single-input sensitivity is for the planned tornado chart.
- **Present value:** each event's after-tax cash is discounted by
  (1 + r)^-((date - valuationDate) / 365.25), default r = 5% nominal. The UI passes
  today's date.
- **Comparison window:** earliest start + horizon (default 5 years), so a later start
  counts as lost pay.
- **Breakeven:** bisection to the cent on base-scenario PV, on after-tax comp, total
  rewards or the COL-adjusted total. "alreadyAhead" (B leads even at $0) is an outcome,
  not an error; `aheadBy` is always given.
- **Stay length (UI horizon):** a stay of N years is the comparison window, not a leave
  date. Pay after it isn't counted, and its last calendar year is taxed as though you kept
  earning through December. Clawbacks from leaving belong to the leave-date sweep.
- **Per month:** a PV gap restated as the level month-end amount over the window with the
  same PV (`monthlyEquivalent`). A lead under 3% of the leader's value is a close call.
- **Cliffs:** dated by the first last day that keeps them, by the leave-date rules.
  `cliffValue` taxes payments at that year's average offer rate in the stay-until-the-cliff
  projection, like every payment.
- **Quoted TC:** the offer-letter view. It excludes refreshers, proration, payout lag and
  vest snapping.

**Cash measures and benefits**
- **Cash measures:**
  - **after-tax comp** (cash basis) = gross - tax - your health premiums. Premiums are a
    cost, not compensation.
  - **take-home** = after-tax comp - your 401(k) - your HSA.
  - **total rewards** = after-tax comp + vested employer 401(k) + perks - out-of-pocket +
    employer HSA.
  - Your deferrals count at face value.
- **Leave date:** last day worked, inclusive. It cuts off every stream. Bonuses unpaid
  by then are forfeited (`mustBeEmployedOnPayDate`, default true; `false` prorates).
- **Clawbacks:**
  - **Window:** cleared once the last day is the day before clock start + months.
    Prorated by completed months by default (`per: "day"` optional). Repay gross by
    default.
  - **Same calendar year:** the wages are reversed, and relief is exact.
  - **Later year:** IRC 1341 credit, federal only, for repayments over $3,000. FICA
    isn't automatically refunded.
- **401(k):**
  - **Cap:** 402(g) limit per calendar year.
  - **Match:** per paycheck on the actual deferral rate, with no true-up.
  - **Vesting service:** `elapsedTime` (default: complete a year by working through the
    day before the anniversary) or `planYearHours`. Under `planYearHours`, each calendar
    plan year with 1,000+ hours counts from the day the 1,000th hour is worked, even if
    you leave before year-end (29 CFR 2530.200b-1). Example: A, 80 hours a week, vests
    2028-04-01, not at the end of 2028.

**Cost of living**
- **BEA RPPs:** 2024, released 2026-02-19. Never adjust gross pay: take-home - savings -
  rent = local non-housing money, times reference/area non-housing RPP = discretionary
  income after rent in reference dollars.
- **Non-housing RPP:** (all items - 0.16 x housing) / 0.84. 16% is housing rents' share
  of BEA's PCE-based weights (BEA SCB, March 2022). A least-squares cross-check gives
  0.187 but fits poorly, so the published weight wins.
- **Scale:** RPP components are on the U.S. all-items scale (U.S. housing = 100.629, not
  100). Always use ratios to a reference row (default U.S. "00000").
- **Rent:** the rent you enter per offer. Left blank, it's estimated:
  - **HUD's Fair Market Rent** for the metro, 1 bedroom by default (household
    `fmrBedrooms`, 0-4). Big metros span several FMR areas; the estimate takes the one
    holding most of the metro's 2024 population, in your residence state if any is.
    Every BEA metro has one.
  - **Only where there's no FMR** (BEA state nonmetro portions): an anchor rent × the
    housing RPP ratio. The anchor is the household reference rent, else the U.S. median
    gross rent, $1,487 (ACS 2024 1-year, B25064, checked on data.census.gov).
  - **Lease timing:** it's the first lease year's rent. The lease starts on the start date,
    and rent rises by `rentGrowth` (per offer, default the inflation input) at each
    anniversary.
- **COL-adjusted total:** spending money is local; saved money isn't.
  - **Converted:** discretionary after rent, minus expected out-of-pocket health
    spending, both through the non-housing factor.
  - **At face value:** planned savings, your 401(k) and HSA, vested employer 401(k),
    employer HSA and perks.
  - **Check:** it equals total rewards - rent + (factor - 1) x (local non-housing -
    out-of-pocket). At factor 1 with no rent, it equals total rewards.

## Validation workflow (run after any tax change)
1. `npm test` — unit tests with hand-checked values.
2. `npm run oracle` — runs our engine and PolicyEngine-US over $40k-$320k for every
   state (single + joint) and prints differences. Target: FICA, state payroll and NYC
   exact; state income tax within ~$10 for single filers at $60k-$200k.
   Baseline (2026-10-07, policyengine-us 2.30.3): FICA, state payroll, NYC all exact.
   Single $60k-$200k: 44/51 within $5. The 7 misses are all listed below (VT, CO, ND,
   OR, CT, AR, MO). A new state over $10 there is a regression.
   The oracle checks 2026 only. Projected years are covered by `test/params.test.ts`.
   Offer-model changes don't touch the engine: check that `npm run grid` output is
   unchanged instead.

## Intentional differences vs PolicyEngine (do not "fix")
- SALT: PolicyEngine deducts *estimated withholding*; we deduct state/local tax *owed*
  (steady-state W-2 assumption). Explains most federal gaps for itemizers in NY/CT/DC.
- Itemize election: we pick whichever minimizes federal+state+local; boundaries can flip
  differently near the threshold (single-point spikes: DC $240k, VA $300k; GA $300k+).
- MO federal-tax deduction: tiers include their upper bound. RSMo 143.171.2 puts AGI of
  exactly $100,000 in the 15% tier ("From $50,001 to $100,000"); PolicyEngine applies 5%.
  Shows as -$62 single / -$36 joint at the $100k grid point only.

## Known gaps — tax engine (fix in rough priority order)
- VT brackets use 2025 widths (up to ~$150 high). ND/OR small indexing gaps; OR also
  -$46 single at $140k (federal-tax subtraction phase-out is approximated).
- Low-income credits/tables: CT personal credit and AR low/middle-income tables reach
  up to ~$100k, not just below $60k (AR single +$112 at $80k, AR joint +$270 at $100k;
  CT single +$257 at $60k, CT joint +$310 at $80k). HI/MN refundable credits and
  ME/NM joint low-income credits (ME +$215, NM +$45 at $40k) matter only below ~$60k.
- CO TABOR sales-tax refund: not modeled (+$19 to +$118).
- AK Permanent Fund Dividend: not modeled. PolicyEngine taxes ~$1,000/person federally,
  so our federal is $120-$480 lower at every income.
- MD county tax not defaulted (user enters via flat local). Same for OH cities, PA EIT.
  Federal side effect: PolicyEngine's SALT includes MD county tax, so it itemizes sooner;
  our federal is up to +$3,374 higher (single, $320k), the largest federal gap in the oracle.
- AL federal-tax deduction (unverified): PolicyEngine includes Additional Medicare Tax in
  it; `state.ts` uses federal income tax only. +$9 to +$54 above $200k single ($250k
  joint), exactly 5% x 0.9% of the excess. Check Ala. Code 40-18-15 / Form 40 instructions.
- MN joint at high income (unverified): -$186 at $300k, -$594 at $320k; single is within $5.
  Suspect MN alternative minimum tax.
- RI: single-point spikes at $280k (+$37 single, +$74 joint), likely a phase-out boundary.
- AZ standard deduction uncertain (PolicyEngine $15,750 vs TF $8,350). The oracle can't
  settle this: we copied PolicyEngine's value, so agreement is circular. Needs a primary
  source (ADOR 2026 Form 140 instructions).
- No dependents/credits (CTC, EITC), no AMT, head-of-household uses single state params.
- Projected years: state indexing modeled for CA only. Other states are held at 2026 law.
  Measured upper bound (single, $75k-$250k, 2.5% inflation, as if every state indexed):
  overstates state tax by ~$15-20 at the median in 2027, compounding to ~$80-100 by 2031.
  Largest: VT ~$95 in 2027 and ~$500 by 2031 at $150k; MN, DC, HI, RI similar. States that
  don't index (e.g. NY, NJ) are already right. Upgrade states one at a time, each with a source.
- Projected years: scheduled state rate cuts not modeled; 2026 rates are held, so tax is
  overstated where cuts are enacted (phased schedules such as NE and MS; revenue-trigger
  cuts such as KY and WV). Not yet itemized with sources.
- Projected years, federal: the SS wage base is scaled by the inflation input, though it
  really tracks the national average wage index (usually faster). Indexed amounts aren't
  rounded the way the IRS rounds them (at most ~$50 per threshold). The inflation input
  stands in for chained CPI.
- State conformity: the engine excludes section 125 amounts (premiums, HSA) from every
  state's wages. CA and NJ actually tax HSA contributions.

## Known gaps — offer model
- **Residence and household:**
  - **Nonresident tax:** taxed as a full-year resident of the residence state only. No
    part-year residency in a relocation year, and no nonresident tax or resident credit
    for the employer state; the convenience-of-employer rule (NY, DE, NE, PA; CT/NJ
    reciprocal) only triggers a warning.
  - **Spouse wages:** shared across offers; they can't vary per offer.
  - **Other jobs:** wages from another job in the same year count for tax, but those
    deferrals don't count toward the 402(g) cap.
- **Equity:** private-company equity (options, double-trigger RSUs) is out of scope for
  v1 and valued at $0. RSUs are assumed sold at vest; post-vest price moves aren't
  modeled.
- **Cash timing:** totals are liability. `withholdingShortfall` estimates federal income
  tax withholding only. Not modeled:
  - state withholding, and withholding at other jobs or a spouse's job;
  - W-4 adjustments, pay frequency other than monthly, and safe-harbor rules.
- **401(k):**
  - no catch-up contributions, no 415(c) check
  - pre-tax deferrals at face value: no tax on withdrawal, no investment growth
  - vesting service uses elapsed time or plan-year hours from a constant weekly rate
- **Health:** costs held flat (no medical inflation) and accrued monthly; the HSA limit
  isn't prorated for partial-year eligibility.
- **Commuter:** one 132(f) input capped at $340 a month, though transit and parking each
  have their own limit.
- **Cost of living:**
  - **Prices:** relative prices held at the 2024 RPPs for every year; one national
    housing weight, while BEA weights each region differently.
  - **Rent:** one growth rate per offer, stepped once a year at the start-date
    anniversary; paid only while employed there.
  - **Perks:** counted at face value in the COL-adjusted total, though 132(f) commuter
    money buys local transit.
  - **Geography:** RPPs are metro-wide; the NYC metro averages Manhattan with its
    suburbs.
  - **FMR estimates:**
    - 40th-percentile gross rents (utilities included) across the FMR area. City-center
      rents for new grads usually run higher, which is why the UI labels it an estimate
      to edit.
    - An FMR area is a county group; we don't pick sub-areas within it.
- **Layoffs:** a layoff, severance, or clawbacks waived on a layoff aren't modeled. The
  leave date assumes a voluntary exit.

## Roadmap (remaining)
Numbers are stable IDs; item 1 (COL-adjusted total, rent growth) is done.

2. (Next) UI: the design is approved (`docs/ui-design.md`); next are the engine
   prerequisites, then the UI (item 6 below).
3. Time: commute cost (IRS 76c/mi includes depreciation — offer a variable-cost option),
   remote-work valuation default ~5% of pay (editable). Weekly hours and effective hourly
   rate are done.
4. Decision layer: sensitivity/tornado and even-swaps for soft factors; show gaps per
   paycheck to counter distinction bias. Breakeven is done.
5. Withholding-shortfall warning: employers withhold federal tax on bonuses and RSU vests
   at the flat 22% supplemental rate (37% above $1M), below the real marginal rate for
   many offers. Warn and estimate the April balance due. Totals are already right; this
   is a cash-timing warning. Engine done (`withholdingShortfall`); the UI shows it in L-5.
6. UI (React/TS, client-side only, no login, live-updating, inline input help, no
   misleading defaults, per NN/g calculator guidelines) and a methodology page.
7. "Next cliff" UI: from any leave date, show the next vest, bonus payout or clawback
   step, and the after-tax value of staying until it. Engine done (`cliffs`,
   `nextCliff`); the UI shows it in L-4.
8. HUD Fair Market Rents by metro as the rent estimate. Done (2026-10-08): `npm run
   fetch-fmr`, FY2027, matched to BEA metros by CBSA code.
