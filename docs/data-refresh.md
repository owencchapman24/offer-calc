# Data refresh

Every dataset the tool depends on: when it's usually published, how to refresh it, and what to re-run afterward. Dates in
parentheses are the last ones seen. A refresh is a change like any other: its own branch and pull request. (Moved here from
CLAUDE.md on 2026-10-15; CLAUDE.md keeps the next checks.)

## Next checks (set 2026-10-12; checked 2026-10-15)
- **Done 2026-10-15: SSA's 2027 wage base**, $192,300 (announced Oct 14, 2026, with the 3.6% COLA), in `FEDERAL_2027`.
- **Now to mid-November 2026: the IRS's 2027 inflation revenue procedure** (brackets, standard deduction, 132(f), and 127, indexed
  from 2027) **and the 402(g) notice.** Neither was out on 2026-10-15 (the IRS's newsroom and irs-drop listing). Add them to
  `FEDERAL_2027`. If neither is out by **2026-11-16**, check weekly.
- **December 2026 to February 2027: BEA's 2025 RPPs, Pub. 15 and 15-T for 2027, the states' 2027 payroll caps, then the Tax
  Foundation's 2027 state table** (the start of moving the base year to 2027, below).
- **The Census's 2025 ACS 1-year estimates:** delayed with no date (the Census Bureau's advisory of Aug 4, 2026; still none in
  September). Check its release schedule monthly.

## After a refresh
**Tax data:** `npm test`.
- An amount published for a later year goes in that year's file (`federal2027.ts`), listed in `src/tax/params/enacted.ts`. It fails
  `test/law.test.ts` only, by design: update that test with the amounts and their sources.
- Every other test runs on the tests' frozen copy (`test/frozen-enacted.ts`, swapped in by `vitest.config.ts`), so none moves. One
  that does means the change reached beyond `enacted.ts`.
- A change to 2026 data can move hand-checked values in `test/tax.test.ts`, `test/params.test.ts` and `test/offer.test.ts`: redo
  their arithmetic.
- Then `npm run typecheck` and `npm run grid` (2026 only: byte-identical unless 2026 law changed).
- Then `npm run oracle`: 2026 against PolicyEngine-US, byte-identical or the difference explained, with M-4's match statistics and
  CLAUDE.md's baseline updated with it. For a later year's amounts, compare with PolicyEngine-US's own parameters for that year
  where it has them.
- `npm run offers` shows what the samples do. Tax-engine changes go in separate commits, each passing the above.

**Price or rent data:** `npm test` (a test fails if the city list is stale), `npm run offers`, `npm run build`, and `npm run e2e` if
a figure the scan or smoke tests read moved.

**The words that carry a vintage** (audit D4): the years follow the data (`DATA_YEARS` in `src/col/cities.ts`, from the city
list), but some dates are typed in. Update them with the data:
- the methodology (`app/src/Methodology.tsx`): M-6.1's RPP release date, M-6.2's FMR effective date and the ACS rent ($1,487, 2024),
  and M-11's sources table;
- the README's data list;
- a tax source added for a later year (as Rev. Proc. 2026-24 for 2027's HSA limits): M-11 and the README's sources.

## Federal tax
`src/tax/params/federal2026.ts`; amounts published for later years in `federal2027.ts` and so on, listed in `ENACTED`
(`params/enacted.ts`), each with its source.
- **Brackets, standard deduction, 132(f) commuter limit, and the 127 educational assistance limit (indexed from 2027):** the IRS's
  annual inflation revenue procedure, October to mid-November for the next year (2026's: Rev. Proc. 2025-32, IR-2025-103,
  Oct 9, 2025). Listed on IRS.gov, "Inflation-adjusted tax items by tax year".
- **401(k) elective deferral limit, IRC 402(g):** an IRS notice on retirement plan limits, usually in November (2026's: Notice
  2025-67, IR-2025-111, Nov 13, 2025).
- **HSA contribution limits, IRC 223:** their own revenue procedure, in May for the next year (2027's: Rev. Proc. 2026-24, May 29,
  2026; in `federal2027.ts`).
- **SALT cap and phase-down, and the other OBBBA schedules (Pub. L. 119-21):** statutory, so nothing to fetch: the SALT cap is
  $40,400 for 2026, 101% of the prior year's through 2029 and $10,000 from 2030 (`saltForYear`); the 2017 rates are permanent; 127
  is indexed after 2026. Re-check only if Congress amends them, or if an IRS revenue procedure states the cap differently (the
  statute has no rounding).
- **Additional Medicare Tax thresholds:** statutory and not indexed ($200,000 / $250,000). No refresh.
- **Supplemental withholding rates (22%, 37% over $1 million) and the percentage method** (`src/offer/withholding.ts`, which builds
  its tables from the year's brackets and standard deduction): IRS Pub. 15 and Pub. 15-T, each December for the next year.

## Payroll
- **Social Security wage base:** SSA's COLA fact sheet, mid-October for the next year (2026's $184,500 was announced Oct 24, 2025,
  late for the shutdown; 2027's $192,300 on Oct 14, 2026). In `PAYROLL_2026`, or a later year's file
  (`socialSecurityWageBase`). State payroll taxes capped at it (`wageCap: "ssWageBase"`) follow by themselves. SSA's pages block
  scripts (a 403), so read them in a browser: the fact sheet is HTML now (https://www.ssa.gov/news/en/cola/factsheets/2027.html),
  and https://www.ssa.gov/oact/cola/cbb.html lists every year's base.
- **State payroll taxes with their own caps and rates** (`payroll` in `states2026.ts`: NJ $171,100, NY Paid Family Leave $95,350,
  MN $185,000, RI $100,000, and every rate): each state sets the next year's, usually September to December; PolicyEngine-US
  carries them once it updates.

## State and local tax
`src/tax/params/states2026.ts`, special rules in `src/tax/state.ts`, `src/tax/params/local2026.ts`.
- **State income tax law:** the Tax Foundation's "State Individual Income Tax Rates and Brackets" table each February (2026's: data
  as of Feb 11, 2026), then `OVERRIDE:` entries for laws enacted after it, each with its bill or statute (most legislatures adjourn
  by June; changes usually take effect Jan 1). PolicyEngine-US's releases are the cross-check, and where an override was copied
  from it, it says so.
- **Indexed state amounts** (`indexed`, so far CA only, and federal links such as `stdDeductionIsFederal`): projected from 2026 until
  the base year moves.
- **NYC income tax rates:** statutory; check NYS IT-201 instructions each January.
- **Philadelphia wage tax:** changes each July 1, announced around June (2026's blend of the two halves is in `PHILLY_2026`).

## Moving the base year
From 2026 to 2027, once the Tax Foundation's 2027 table is out (about February 2027):
- new `federal2027` and `states2027` data, and `BASE_YEAR`;
- the oracle's year and baseline;
- the tests' hand-checked values, and the tests' frozen law (`test/frozen-enacted.ts`, which moves only then);
- the base year typed as a literal in the engine and the UI (audit C28 lists them; `BASE_YEAR` is exported but not yet used).

Until then, amounts published for 2027 go in `FEDERAL_2027` and the rest of 2027 is projected.

## Prices and rent
- **BEA Regional Price Parities** (`src/col/rpp.json`): annually, usually December, for the year two before (the 2024 RPPs came out
  Feb 19, 2026, late). `npm run fetch-rpp` (it rebuilds the city list). The 16% housing weight (`HOUSING_WEIGHT` in
  `scripts/fetch-rpp.ts`, baked into `rpp.json`, and in `app/src/footing.ts`; BEA SCB March 2022) changes only if BEA publishes new
  weights.
- **HUD Fair Market Rents** (`src/col/fmr.json`): each August or September for the fiscal year starting Oct 1 (FY2027 was published
  Aug 26, 2026). `npm run fetch-fmr -- <FY>`, or `--file` with a copy downloaded in a browser when HUD USER answers with an empty 202.
- **The rent fallback's anchor, the U.S. median gross rent** (`US_MEDIAN_GROSS_RENT` in `src/col/rent.ts`, $1,487, ACS 2024 1-year,
  table B25064): the Census's ACS 1-year estimates, usually mid-September (2024's: Sep 11, 2025). By hand from data.census.gov, with
  the table and date in its comment; it matters only for places without an FMR (BEA state nonmetro portions).

## The oracle's Python environment
`requirements.txt` pins PolicyEngine-US to 2.30.3, and `requirements-lock.txt` locks every package of the `.venv` the baseline was
taken with (a `pip freeze`: Windows, Python 3.14.7, pip 26.2.1, 2026-10-12; `policyengine-core` 3.32.21 among them). Install with
`python -m pip install -r requirements.txt -c requirements-lock.txt`, so setting up a `.venv` never moves the baseline; `npm run
oracle` warns before it runs if the environment has drifted from the lock. The lock is from Windows: packages only macOS or Linux
need (IPython's `pexpect`, `ptyprocess`) aren't in it, install unpinned there, and the runner lists them as not in the lock.

Upgrading PolicyEngine-US is a deliberate step, a change of its own (its own branch and pull request), never folded into a data or
engine change, and the lock is regenerated with it, never on its own (a Python upgrade takes the same steps):
1. Take the old report from `main` in the locked `.venv` (`npm run oracle`, saved aside).
2. Bump the pin in `requirements.txt`. In a fresh `.venv` (nothing of the old environment left), install without the lock,
   `python -m pip install -r requirements.txt`, so the dependencies resolve afresh.
3. Regenerate the lock from that `.venv`: `python -m pip freeze` under the lock's header comment, with its date and the Python and
   pip versions updated. `scripts/lib/lock.test.ts` checks that it pins the same PolicyEngine-US as `requirements.txt`. Commit the
   two files together.
4. Re-run `npm run oracle` with nothing else changed (it should say the environment matches the lock), and compare the reports.
5. Explain every difference in the pull request: PolicyEngine fixed or updated something (then our engine may be the one that's off:
   fix it, or add it to the known gaps), or changed how it models something (an intentional difference, or a gap); a change in a
   dependency alone can move the report too. Update CLAUDE.md's baseline (date, version, the match counts), M-4's figures, and the
   intentional differences and known gaps as they move.
6. Only then use the new baseline for engine changes.

## As v2 adds data
v2's plan adds datasets as their items are built (`docs/v2-plan.md`, "On approval"): BLS OEWS (yearly, spring), BLS's paid-leave
figures (yearly, September, with D14's defaults), the IRS mileage rates (each December, and mid-year when the IRS changes them),
each convenience rule's and cross-state pair's sources (each January), and, if 4f is built, the repayment plans' rules. Each gets a
section here when its item lands.

**Days off and unused vacation (4a, built 2026-10-19):**
- **The vacation-payout states, each January:** re-read the ten in `src/offer/timeOff.ts` (`VACATION_PAYOUT_STATES`: CA, CO, IL, LA, ME,
  MA, MT, NE, ND, RI, each with its source) from the statute or the state's labor agency, and look for states that have added or
  dropped a payout rule (the plan's table, `docs/v2-plan.md` 4a, has what was read on 2026-10-19). A change is a data edit with a
  hand-checked test (`test/offer.test.ts`, "days off, and unused vacation paid when you leave"), the help (`helpText.ts`,
  `timeOff.payout`) and M-9's list.
- **BLS's days-off defaults, each September** (the National Compensation Survey's March release): 11 vacation days after a year's
  service and 8 paid holidays (`DEFAULT_DAYS_OFF` in `timeOff.ts`, the reasons in `app/src/detailedDefaults.ts`, M-5.4 and M-11). A new
  figure moves every default per-hour figure: the hand-checked per-hour tests and `npm run offers` move with it.
