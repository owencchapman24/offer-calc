# Offer model: design (rev 3, approved)

Roadmap item 1. Turns one offer into a year-by-year projection, gross to after-tax, on top
of the tax engine. Rev 3 records the decisions approved in review on 2026-10-07. The
engine refactor in §8 comes first, then the offer model.

## 0. Decisions

| # | Decision |
|---|---|
| 1 | An event dated exactly on an anniversary counts toward the year just ended. A 12-month cliff vest is year-1 comp. |
| 2 | Offers are compared over a common date window (default: from the earliest start date). Totals are shown both nominal and as present value at a discount rate (default 5%), discounted to **today's date**. |
| 3 | Before the offer model, the engine moves to per-year parameters (`paramsForYear`), including the statutory SALT schedule and its 2030 reversion (§8). |
| 3a | States: a standard deduction linked to the federal one follows federal indexing **only where verified**; unclear ones stay flat. Every other state parameter is held flat at 2026 law in projected years. No per-state indexing research. |
| 4 | Inflation (default 2.5%) only indexes tax law. Pay growth is a separate input: an annual raise % plus optional promotion step-ups. (Later: inflation is also the default rent growth, §3.) |
| 5 | The bonus percentage applies to salary earned during the performance period. |
| 6 | Clawback tax relief is federal-only in v1. Repayment defaults to gross. FICA isn't automatically refunded after a cross-year repayment. |
| 7 | One leave date cuts off every stream: salary, unpaid bonus, unvested RSUs, unpaid cash awards, clawbacks, and (roadmap 2) unvested 401(k) match. |
| 8 | Scenarios are `bear / base / bull`. They're joint scenarios: each one sets every uncertain input at once. |
| 9 | Each offer's location is split into **residence** (state + locality, where you're taxed) and **employer state**. We warn when the employer state has a convenience-of-employer rule and differs from your residence state. |

Naming: because "base" is now a scenario, the pay component is called **salary**
(`OfferInput.salary`, component `"salary"`). That avoids `base.base`.

## 1. Pipeline

```
OfferInput ──► dated CompEvents ──► group by calendar year ──► computeTaxes(input, paramsForYear(y))
               (salary, bonus, cash,     (+ your other wages,      with offer vs without offer
                RSU, clawback)            spouse wages)                       │
                                                                              ▼
     window totals (nominal + PV) ◄── EmploymentYearResult ◄── per-event tax at the year's offer rate
```

Every payment or vest is a **dated event**. Tax is computed per **calendar year**, the way
the law works. Events are regrouped into **employment years** for display (year 1 = your
first 12 months) and summed over the **comparison window** for totals. All three views
come from the same events, so they reconcile exactly.

## 2. Employment years and calendar tax years

- **Cash basis.** Each event is taxed in the calendar year it's paid or vests. A 2026
  bonus paid in March 2027 is 2027 income.
- **Salary accrues by calendar month** (changed in review after slice 1; rev 3 accrued by
  day). Each calendar month earns 1/12 of the annual rate, and a partial month earns its
  share by days worked ÷ days in that month. That's how salaried payroll treats a month,
  and it keeps leap years from changing anyone's salary. A full calendar year sums exactly
  to the annual rate, and so does a 12-month employment year. The one exception is a year
  that starts in February and crosses a leap day, which is off by about 1% of a month's
  pay. Salary is emitted as one event per month, split at anniversaries, raises and
  promotions.
- **Employment year n** is `[start + (n-1) years, start + n years)` for accrued salary.
  Discrete events dated exactly on an anniversary count toward the year just ended
  (decision 1). A vest that a company calendar moves past the anniversary is the next
  year's.
- **Partial first year.** This comes out of the day count. An August start has about 5
  months of wages in its first calendar year, taxed at low brackets unless `otherWages`
  says you earned elsewhere that year.
- **Full calendar years.** We simulate through the end of the calendar year containing the
  last date we report, so every calendar year is taxed on its full-year income.

## 3. Components

**Salary.**
- **Raises (as built in slice 4):** an annual merit %, as a `bear / base / bull` set.
  Default 0. It takes effect each work anniversary (default) or each Jan 1 after you start
  (`raiseOn`). A review-date eligibility cutoff isn't modeled yet.
- **Promotions:** optional step-ups, e.g. +35% on 2029-07-13. Merit raises compound from
  the new salary, and same-day changes multiply. Each promotion can be limited to some
  scenarios, e.g. base and bull only. A mid-month change splits that month by days.
- **Not tied to inflation:** pay growth is separate from tax indexing (decision 4).

**Bonus.**
- **Amount:** a `bear / base / bull` set, either a % of salary, a fixed dollar amount,
  or a dollar schedule by employment year (`byEmploymentYear`). In the schedule, each
  period uses the employment year it ends in, the last entry repeats, and amounts
  prorate by days employed.
- **Percent of salary:** applies to salary **earned in the performance period**
  (decision 5). That prorates the first year automatically and picks up mid-period
  raises.
- **Fixed amount:** prorated by days employed in the period.
- **Payment:** on the first `payOn` after the period ends, forfeited if your leave date
  comes first.
- **Cutoff:** starting on or after `cutoff` earns nothing for that period.
- `firstPayoutGuaranteed` pins the first payout at the base (target) amount in every
  scenario.

**Cash awards** (sign-on, year-2 sign-on, relocation). Each payment has a date and optional
clawback terms:
- **Terms (as built in slice 3):** a window of `months` and a kind. `full` means you owe
  it all if you leave inside the window. `prorated` means you owe the unworked share:
  by completed months (the default, so leaving after 6 of 12 months owes half), or
  by day.
- **The window's edge:** you're clear if your last day is the day before clock start +
  `months`, or later. So a 12-month window from 2026-08-03 is cleared by leaving on
  2027-08-02.
- **Clock:** starts at your start date (default) or at the payment date.
- **Repayment basis:** defaults to **gross** (decision 6), the usual contract term, even
  though you received the payment net of withholding.
- **Monthly installments:** one entry per installment. The UI can generate them.

**Clawback tax relief (v1):**
- **Same calendar year as the payment:** the wages are reversed, so income tax and FICA
  come back. The relief is that year's tax with the payment minus with it reversed, so
  it's exact. Repaying net costs the same as repaying gross here: you hand back the
  after-tax share and the employer keeps the withholding it reclaims.
- **Later year, net basis:** you repay the after-tax share, taking the payment year's
  average offer rate as the tax on it, and 1341 applies to the amount repaid. This is an
  approximation; employer practice varies.
- **Later year, over $3,000:** IRC §1341 relief using the credit method: re-run the
  earlier year's federal tax without the repaid amount; the difference is the relief.
- **Later year, $3,000 or less:** no relief. Miscellaneous itemized deductions are gone
  permanently under OBBBA.
- **FICA on cross-year repayments isn't automatically refunded.** The employer can return
  the employee share and issue a corrected W-2c, but it doesn't have to happen. v1
  assumes you don't get it back, and the methodology page says so.
- **Not modeled:** state relief.

**RSUs.**
- **Vest value:** a grant is a dollar value at grant. A tranche vests at
  `fraction × value × (1 + g)^(years from grant to vest)`, where `g` is the scenario's
  price growth (default 0).
- **Vesting:** a schedule is any list of `{ month, fraction }` summing to 1.
  `byYear([25,25,25,25], { perYear: 4, cliffMonths: 12 })` is standard 4-year
  quarterly with a 1-year cliff. `byYear([5,15,40,40], { perYear: 2, cliffMonths: 12 })`
  is back-loaded semiannual. `VESTING_PRESETS` names four common schedules by split and
  cadence: `evenQuarterlyAfterCliff`, `evenAnnual`, `backLoadedSemiannualAfterCliff`
  and `frontLoadedMonthly`. `describeSchedule()` builds the label from the tranches (e.g.
  "5/15/40/40, semiannual after a 1-year cliff"), so a label can't drift from the
  schedule. For back-loaded quarterly, use `byYear([5,15,40,40], { perYear: 4, cliffMonths: 12 })`.
- **Company vest dates:** an optional `vestDates` calendar moves each tranche to the next
  company vest date.
- **Taxation:** vest-date value is W-2 wages. We assume you sell at vest.

**Refreshers.** A policy that creates grants: a `bear / base / bull` dollar value per
grant, a first-grant month, an interval and a schedule. Overlapping refreshers stack.
Default: none.

**401(k), health, perks and hours (slice 5).**

- **401(k):**
  - **Deferrals:** a % of eligible pay (salary, optionally plus bonus), pre-tax or Roth,
    capped each calendar year at the 402(g) limit. Pre-tax deferrals flow into the
    engine as `pretax401k`, which lowers income tax but not FICA.
  - **Match:** tiered on each paycheck's actual deferral rate, with no year-end true-up,
    so hitting the cap early loses match. Non-elective contributions are a % of pay.
  - **Vesting:** immediate, cliff or graded, by completed years of service at the leave
    date (or at the window's end if you stay). A year is complete once you work through
    the day before its anniversary.
  - **Reporting:** employer money counts as retirement value, vested amounts only. Your
    deferrals stay in cash net: they're your money, at face value.
- **Health:**
  - **Pre-tax amounts:** premiums and your HSA contributions run through the section 125
    cafeteria plan, so they're excluded from income tax and FICA.
  - **Net health cost:** premiums plus expected out-of-pocket (by the household's usage
    level, capped at the out-of-pocket max), minus employer HSA money.
  - **HSA cap:** your contributions are capped at the HSA limit minus the employer's
    contributions for that year.
  - **Timing:** everything accrues monthly while you're employed.
- **Perks:** Section 127 (up to $5,250 a year) and 132(f) commuter (up to $340 a month),
  both tax-free. They're shown at face value and as a pre-tax cash equivalent, face ÷
  (1 − that year's marginal rate). Total rewards uses face value.
- **Hours:** weekly hours by scenario × weeks a year (default 50), prorated for a
  partial year. The hourly rate is after-tax dollars per hour, on cash only and on total
  rewards.
- **Cash measures (revised after slice 5):**
  - **After-tax comp** (the cash-only basis) = gross − tax − your health premiums.
    Premiums are a cost of the plan, not compensation.
  - **Take-home** = after-tax comp − your 401(k) deferrals − your HSA contributions:
    what reaches your bank account.
- **Total rewards:** after-tax comp + vested employer retirement + perks − out-of-pocket
  + employer HSA, nominal and PV. `compareOffers` shows it next to after-tax comp.
  `breakeven` takes `basis: "cash"` (after-tax comp), `"totalRewards"` or
  `"colAdjustedTotal"` (see cost of living below).
- **Vesting service:** `vestingService` is `"elapsedTime"` (default) or
  `"planYearHours"`. Under the second, each calendar plan year with 1,000+ hours (from
  `offer.hours`) counts, credited on the day the 1,000th hour is worked, even if you leave
  before the year ends (29 CFR 2530.200b-1). At 80 hours a week, A's 3-year cliff vests on
  2028-04-01 this way, against 2029-07-12 under elapsed time.
- **Federal limits:** 402(g), HSA, Section 127 and 132(f) are engine parameters with
  sources, indexed in projected years.

**Cost of living (slice 6, roadmap item 3; the COL-adjusted total and rent growth were added
after slice 6's review).**

- **Data:** BEA Regional Price Parities, baked into `src/col/rpp.json` by
  `npm run fetch-rpp`; the app never fetches at runtime.
  - **Coverage:** 2024 RPPs (released February 19, 2026) for 387 metro areas, every
    state, and each state's metro and nonmetro portions.
  - **Components:** all items, goods, housing (rents), utilities and other services.
  - **Scale:** U.S. all items = 100. The components are price levels on the same scale,
    so the U.S. row itself isn't 100 on each component (housing 100.629). Every
    comparison therefore uses ratios to a reference row.
- **Method:** gross salary is never adjusted.
  - Start from take-home pay, which already excludes your 401(k).
  - Subtract planned savings (household `savingsRate`).
  - Subtract rent: the offer's `monthlyRent`. Left blank, it's estimated:
    - **HUD's FY2027 Fair Market Rent** for the metro: 1 bedroom by default, for the FMR
      area holding most of the metro's people (in your residence state if any is).
    - **Otherwise** (areas without an FMR): an anchor rent × the housing RPP ratio. The
      anchor is the household's reference rent, else the U.S. median gross rent, $1,487
      (ACS 2024).
  - What's left is non-housing spending in local dollars. Multiply it by reference
    non-housing RPP ÷ area non-housing RPP to get **discretionary income after rent, in
    reference-location dollars**.
- **Rent growth:**
  - **Timing:** the entered (or derived) rent is the first lease year's, and the lease
    starts on your start date. Rent rises at each anniversary, so employment year n pays
    `monthlyRent × (1 + g)^(n−1)` a month.
  - **Rate:** `costOfLiving.rentGrowth` per offer, since rents rise at different rates in
    different cities. Default: the `inflation` option (2.5%), shown in the assumptions.
  - **Hand-check:** $1,700 from 2026-07-13 at 2.5% pays $20,400 in year 1 and $20,910 in
    year 2, and $107,229.10 over five years.
  - Rent is paid only while you work there.
- **COL-adjusted total:** the cost-of-living counterpart of total rewards. Spending money is
  local; saved money isn't.
  - **Discretionary income after rent,** converted as above.
  - **Minus expected out-of-pocket health spending.** It comes out of the local spending,
    so the same factor converts it. Leaving it out would let a plan with high out-of-pocket
    costs and an HSA seed beat an otherwise identical plan with neither.
  - **Plus money not spent locally, at face value:** planned savings, your 401(k) and HSA
    contributions, vested employer 401(k), employer HSA and perks.
  - **Reconciliation:** COL-adjusted total = total rewards − rent + (factor − 1) ×
    (local non-housing spending − out-of-pocket). At a factor of 1 with no rent, it equals
    total rewards, whatever the savings rate.
  - **Where it appears:** per employment year, and over the window, nominal and PV.
    `breakeven` takes it as a third basis, `basis: "colAdjustedTotal"`.
- **Non-housing RPP:** (all items − 0.16 × housing) ÷ 0.84. 16% is housing rents' share of
  BEA's PCE-based weights (BEA, *Survey of Current Business*, March 2022). As a
  cross-check, the fixed weights that best reproduce BEA's all-items index put housing at
  0.187. BEA weights each region differently, so a single national weight is an
  approximation.
- **Reference:** default is the U.S. row ("00000"); the user can pick their current city.
- **Output:**
  - `ScenarioResult.costOfLiving`: the area, the reference, the RPPs used, the factor,
    the first-year rent, its growth rate and the vintage.
  - `CostOfLivingTotals`, per employment year and over the window (nominal and PV):
    savings, rent, local non-housing, discretionary (reference $), out-of-pocket
    (reference $), face value, and the COL-adjusted total.

## 4. Leave date

`leaveDate` is your last day of work, inclusive. It's the single cut-off for every stream
(decision 7):

| Stream | At the leave date |
|---|---|
| Salary | Accrues through the leave date, then stops |
| Bonus | Forfeited unless paid on or before the leave date (`mustBeEmployedOnPayDate`, default true). With `false`, every earned bonus still pays on its usual date, and the period you leave in is prorated to the leave date |
| RSUs | Tranches vesting after the leave date are forfeited; later refreshers are never granted |
| Cash awards | Unpaid installments are never paid; each paid award's clawback is evaluated at the leave date |
| 401(k) match (slice 5) | Unvested employer money is forfeited per the plan's vesting schedule; deferrals, health costs and perks stop |

Omit it to stay through the window. It assumes a voluntary exit; layoffs and severance
aren't modeled. Clawbacks are often waived when you're laid off.

**Leave-date sweep (slice 3).** `leaveDateSweep(offer, household, months[])` answers "what
do I keep if I leave after N months" without you picking a date. For each N, the last day
is start + N months − 1 day. Each row gives pay received, clawback owed, net kept after
tax and clawbacks, and unvested RSUs forfeited. It replaces the planned month-by-month
exposure curve and shows the vest cliffs, bonus payout dates and clawback steps in one
table. `ScenarioResult.leave` holds the detail for one leave date: each clawback's owed
amount, its tax treatment, relief and net cost.

**Cliffs and the next cliff (roadmap 7, built 2026-10-08).** `cliffs(offer, household)`
lists the dates where your last day starts to matter. Each is dated by the first last day
that keeps it, under the same rules as a leave date:
- **Bonus payouts:** when you must be employed on the pay date, the default.
- **RSU vests and cash-award payments.**
- **Clawback steps and the window's end:** a step lands when you work through the day before
  a window month completes. Per-day proration shrinks daily, so it has no cliffs.
- **401(k) vesting steps:** found by scanning last days with the projection's own service
  rule (elapsed time or plan-year hours).

`nextCliff(offer, household, leaveDate)` gives the first cliff after a leave date and what
staying until it is worth, nominal:
- **Value of staying:** after-tax comp kept and total rewards kept, if you leave on the cliff
  date instead.
- **`cliffValue`:** the cliffs' own part of that value.
  - Payments count after tax, at that year's average offer rate in the stay-until-the-cliff
    projection.
  - A clawback counts as the repayment no longer owed, net of tax relief.
  - 401(k) money counts as the amount that vests.
  - The rest is pay for the extra days.

`keptIfLeaving` is the per-leave-date calculation behind both and `leaveDateSweep`.

## 5. Scenarios: bear / base / bull

These are **joint scenarios**, not percentiles. "Bear" sets every uncertain input to its
bear value at the same time: bonus payout, raise %, stock growth, refresher size, and
which promotions happen. The bear case is a coherent pessimistic story. It isn't the
worst case, and it isn't "each input's 10th percentile". These inputs tend to move
together with company performance, so independent draws would understate how bad a bad
year gets. Single-input sensitivity is the tornado chart's job (roadmap 5). Inputs
without a scenario set (salary, sign-on, vesting schedule) are the same in all three.

## 6. Attributing tax to the offer

For each calendar year, tax is computed twice: the household **with** the offer and
**without** it (your other wages and spouse wages only). The difference is the offer's
tax: it's taxed on top of whatever else you earn that year. Within a year, the offer's
tax is split across its events pro rata by gross (one average rate per year). So event,
employment-year and window totals all add up to the calendar-year totals.

**Residence vs. employer state (decision 9).** Each offer has a `residence` (state +
locality), which is what the engine taxes, and an `employerState`. If the employer state
applies a convenience-of-employer rule and differs from the residence state, we warn that
remote-work wages may also be taxed there. The rule states are NY, DE and PA; CT and NJ
apply it only to residents of states that have one (reciprocity), and NJ's list still names
Nebraska. NJ's rule doesn't reach Pennsylvania residents (the reciprocal agreement) or
Connecticut residents (NJ's FAQ, last updated Oct 30, 2025), so those pairs raise none. Nebraska itself counts only work done in Nebraska for taxable years from 2025 (Neb.
Rev. Stat. 77-2733(8)(c), amended by LB1023), so a Nebraska employer raises no warning. v1 warns
but doesn't compute nonresident tax or the resident credit.

**Withholding vs liability (roadmap 5, built 2026-10-08).** Totals are liability: what you
owe. `withholdingShortfall(offer, household)` estimates what your employer withholds for
federal income tax, so the difference is due (or refunded) the April after each year. It
changes no total.
- **Salary:** monthly payroll under the IRS percentage method (Pub. 15-T, a 2020+ Form W-4
  with the household's filing status and nothing else). Each month's taxable pay is
  annualized: 1/12 of the tax, with the standard deduction, on 12 × the month's pay.
  - **Partial first year:** comes out over-withheld, as in real payroll. A July start at
    $120,000 has $8,785 withheld against $5,020 owed.
- **Bonuses, RSU vests and cash awards:** supplemental wages, withheld at 22%, and 37% on the
  year's supplemental pay over $1 million (Pub. 15 2026 §7). A $50,000 sign-on in the 24%
  bracket leaves $1,000 due.
- **Deductions:** pre-tax 401(k) deferrals and cafeteria-plan amounts come out of the pay
  they're taken from.
- **Warnings** start at a $1,000 balance due, the estimated-tax penalty threshold (IRC
  6654(e)(1)).
- **Out of scope:**
  - state withholding;
  - FICA, which is withheld exactly up to the Additional Medicare threshold;
  - other jobs' and a spouse's withholding;
  - safe-harbor rules.

## 7. Comparing offers: common window, nominal and present value

- **Window:** `compareOffers` projects every offer over a shared window,
  `[earliest start date, + N years)` by default (overridable, e.g. "from today"). An offer
  starting two months later has two months less pay in the window. That's the real cost
  of the later start. Employment-year tables stay per-offer, for display.
- **Totals:** nominal (sum of net cash) and **present value as of today**. Each event's
  net is discounted by `(1 + r)^-t`, where t = (event date − valuation date) / 365.25
  years. `r` is a nominal rate, default 5%. PV is what makes "$40k more in year 4"
  comparable with "$30k more in year 1". With 2.5% inflation, 5% nominal is about 2.4%
  real.
- **Today comes from the caller.** The valuation date is a required option
  (`valuationDate`): the UI passes today's date, and tests pass a fixed one. That keeps
  `src/` pure and results reproducible.
- **Different start dates:** the window starts at the earliest start date, but PV is
  measured from today. Every offer is discounted to the same date, so a later start is
  discounted further on top of being shorter in the window.
- **Tax timing for PV:** tax is discounted at the event's date, as if withheld when paid.
  April true-ups are ignored.
- **API (slice 4):**
  - `projectOffer` runs bear/base/bull together.
  - `compareOffers(offers, household, { valuationDate, horizonYears })` returns each
    offer's nominal and PV totals per scenario over the shared window.
  - `breakeven(A, B, "salary" | "signOn", …)` finds, by bisection to the cent, the change
    to B's starting salary (or first sign-on) that ties A in base-scenario PV, on after-tax
    comp, total rewards or the COL-adjusted total. Raises and percent-of-salary bonuses
    scale with the new salary.
    - **A negative increase** means B is already ahead and could give some up.
    - **`outcome: "alreadyAhead"`** (with `increase` and `to` null) means B leads even at a
      $0 salary or sign-on. It's a result, not an error.
    - **`aheadBy`** always gives B's PV lead as entered.
    - **The window** (UI slice 4, engine item 14): pass `window: comparisonWindow(offers,
      years)`, the earliest start of every offer compared, so the target is the rank list's
      figure. Without it, it's the two offers' own window, which starts later when a third
      offer starts first.
    - **`breakevenSteps`** is the same search as a generator, one projection per step, so the
      UI's worker can run it in ~8 ms chunks.
  - `rentFlip(A, B, …)` (UI slice 4, engine item 11): the first lease year's monthly rent at
    which B ties A on the COL-adjusted total. Closed form, since the total is linear in rent:
    to = from + aheadBy / (nonHousingFactor × rentFactor), where rentFactor is the PV of $1 a
    month of B's first-year rent over its months there in the window. "rentFree" when B
    trails even at $0 rent; "noRent" when B pays none inside the window. Hand-checked, and
    against a bisection on rent.
- **API for the UI (2026-10-08):**
  - **Window hours:** `WindowTotals.hours` counts each employment year's hours for its days
    inside the window, so it ties to the yearly figures.
  - **Per hour:** `WindowTotals.perHour` is nominal dollars per hour worked, on each basis.
  - **`monthlyEquivalent(pv, window, valuationDate, r)`** restates a PV as the level
    month-end amount over the window with the same PV, discounted like every event. "$487 a
    month" uses it.
  - **`horizonSweep(offers, household, [2, 3, 4, 5], options)`** is the "winner if you stay
    N years" row. For each stay it gives every offer's base-scenario value on each basis
    (`Basis`: cash, totalRewards, colAdjustedTotal, perHour), the leader, the margin and its
    per-month equivalent, and a close-call flag (under 3%, `CLOSE_CALL_SHARE`).
    - **A stay is the window, not a leave date:** pay after it isn't counted, and its last
      calendar year is taxed as though you kept earning through December.
    - **perHour** divides the COL-adjusted total when every offer has cost of living, and
      total rewards otherwise.

## 8. Prerequisite: per-year tax parameters (refactor plan)

**Status: implemented** on branch `refactor/params-by-year`, merged to main. Each step's
2026 oracle report is byte-identical to the pre-refactor baseline. CLAUDE.md describes the
result.

**Goal.** `computeTaxes` works for any year from 2026 on, and 2026 results stay
byte-identical.

**API after the refactor**

```ts
export function paramsForYear(year: number, opts?: { inflation?: number }): TaxParams;
// 2026: the actual 2026 parameters (inflation is ignored).
// After 2026: federal law indexed by (1 + inflation)^(year - 2026) where it indexes, plus
//             enacted changes (SALT schedule). State law held at 2026, except verified links
//             to federal amounts. Throws without `inflation`: the engine has no hidden
//             default (the 2.5% default lives in the offer model's options).
export function computeTaxes(input: TaxInput, params?: TaxParams): TaxResult;
// params defaults to paramsForYear(input.year), so only 2026 works without it.
// TaxInput.year widens from the literal 2026 to number.
```

**What indexes, and with what**

| Parameter | Later years | Why |
|---|---|---|
| Federal brackets, standard deductions, 401(k) limit | × index factor | IRC §1(f), §63(c)(7), §415; no IRS rounding (≤ $50 per threshold, documented) |
| SALT cap and phase-down | Statutory schedule, below | IRC §164(b)(7), verified on Cornell LII including the Pub. L. 119-21 amendments |
| SS wage base | × index factor | Really indexed to the national average wage, not CPI (documented simplification) |
| Additional Medicare thresholds ($200k / $250k) | Fixed | IRC §3101(b)(2): not indexed |
| State brackets, deductions, exemptions, credits, special-rule thresholds | **Held flat at 2026 law**, except CA (indexed per R&TC 17041(h), 17073.5(d), 17054(i), 17054.1(f)) | Scope decision 3a: no per-state indexing research; error is tens of dollars a year (known gap) |
| State standard deduction equal to federal by statute | Follows the federal value **where verified** | Verified: CO, IA, MO, MT, NM, ND (rolling conformity, citations in `states2026.ts`). ID stays flat: static conformity by annual bill |
| UT taxpayer credit (6% of the federal standard deduction) | Follows the federal value | Utah Code 59-10-1018(2)(a)(i), "for that taxable year"; phase-out thresholds stay flat |
| State payroll wage caps set to the SS wage base | Follow the SS wage base | CO, CT, DE, ME, MA, OR, WA (already `SS_BASE` in the data) |
| NYC brackets | Fixed | Not indexed by statute |
| Philadelphia wage tax | 2026 blended rate held | Set by the annual budget; unknowable |

**SALT schedule (IRC §164(b)(7))** applies to years beginning after Dec 31, 2024 (Pub. L.
119-21 §70120):

| Tax year | Cap | Phase-down threshold (MAGI) | Phase-down |
|---|---:|---:|---|
| 2026 | $40,400 | $505,000 | −30% of excess, floor $10,000 |
| 2027 | $40,804 | $510,050 | same |
| 2028 | $41,212.04 | $515,150.50 | same |
| 2029 | $41,624.16 | $520,302.01 | same |
| 2030 on | $10,000 | (no phase-down: only for years before Jan 1, 2030) | none |

Statute: 2027-29 cap and threshold are 101% of the prior year's figure, with no rounding.
We compute them rather than hardcoding the table. Married-filing-separately halving isn't
needed because we don't support MFS. MAGI = AGI plus §911/931/933 exclusions, which is
just AGI for our users.

**Steps.** Each step ends with `npm test` and `npm run typecheck` passing, and
`oracle_report.json` byte-identical to a baseline saved before step 1.
1. **Plumbing, no behavior change.** Add `src/tax/params/index.ts` with `TaxParams`; have
   `paramsForYear(2026)` return today's constants. Thread `params` through `federal.ts`
   (`federalIncomeTax`, `saltCap`, `payrollTaxes`), `state.ts` and `local.ts` instead of
   module-level constants. Move the 401(k)-limit warning number into params.
2. **SALT schedule** from §164(b)(7), as above. `saltCap(magi, params)` reads
   `params.federal.salt`.
3. **Federal and payroll indexing** for years after 2026, per the table.
4. **Federal links in state data.**
   - **Federal-linked deductions:** add `stdDeductionIsFederal` to `StateSpec`, only for
     the states verified to follow the federal standard deduction, each with a source.
   - **SS-capped payroll:** `PayrollComponent.wageCap` accepts `"ssWageBase"`.
   - **UT:** the credit reads the federal standard deduction from params.
   - **Everything else:** held flat.
5. **Docs.** CLAUDE.md "Current state", conventions and known gaps:
   - **State indexing not modeled:** tens of dollars a year; states can be upgraded one at
     a time.
   - **Scheduled state rate cuts aren't modeled;** 2026 rates are held. Examples: phased
     schedules such as NE and MS, revenue-trigger cuts such as KY and WV.
   - **SS wage base** is indexed by CPI rather than the national wage index.
   - **No IRS rounding** of projected thresholds.

Each step adds its own tests:
- **2026 equality:** `paramsForYear(2026)` matches the 2026 constants.
- **Zero inflation:** with inflation 0, 2027 equals 2026 except the SALT figures.
- **SALT checkpoints:** the 2027, 2029 and 2030 figures. 2030 is $10,000 at any MAGI.
- **Flat state law:** NY's and CA's 2027 brackets are unchanged.
- **Federal-linked states:** each one's 2026 standard deduction equals the federal one,
  and in 2027 it matches the indexed federal amount.
- **Projected-year warning:** a warning is added for years after 2026.

**Acceptance.** Tests pass. The 2026 oracle report is byte-identical to the pre-refactor
baseline, which confirms 2026 is unchanged. Federal/state/payroll code no longer imports
2026 constants directly.

**Size and risk.** About 150 new lines (params module plus tests) and signature changes in
three engine files. Holding states flat removes most of the risk. What remains is the
plumbing, and the oracle catches any 2026 drift.

## 9. Out of scope and known gaps (v1)

**Known gaps** (also in CLAUDE.md):
- **Part-year residency in a relocation year.** If you move for the job, the move year
  has two part-year resident returns, and wages are split by period and source. We tax the
  whole year as a full-year resident of the new state.
- **Spouse income is shared across offers.** `Household.spouseWages` is the same for
  every offer, so if your spouse would also change jobs or stop working, you can't model
  that per offer yet.
- **Nonresident tax in the employer state** isn't computed: no nonresident return, no
  resident credit. Decision 9 only warns.
- **Projected state tax:** state law is held flat at 2026, apart from verified federal
  links (decision 3a) and CA, which is indexed. Measured as an upper bound (single filers
  at $75k-$250k, 2.5% inflation), this overstates state tax by about $15-20 at the median
  in the first projected year, compounding to about $80-100 by year 5. It's largest in
  states that do index (VT: about $95 in 2027 and $500 by 2031 at $150k).

**Out of scope:**

- Stock options, private-company/double-trigger RSUs, ESPP.
- 401(k)/benefits (roadmap 2). They plug into each calendar year's `TaxInput` and use
  `leaveDate`.
- Cash-flow timing beyond federal withholding (§6): state withholding, paycheck dates.
- Pay lag (a late-December paycheck paid in January).
- Share rounding.
- Moving states mid-window.
- Severance.
- Married-filing-separately.

## 10. Worked example (becomes the first offer test)

New grad, single, TX. Start **2026-08-03**:
- **Salary:** $150,000, no raise.
- **Bonus:** 5/10/15% (bear/base/bull) of salary earned in the period, calendar period,
  paid Mar 15, cutoff Oct 1.
- **Sign-on:** $30,000, paid 30 days after start, prorated 12-month clawback from start,
  repay gross.
- **RSUs:** $200,000, `byYear([5,15,40,40], { perYear: 2, cliffMonths: 12 })`, company
  vest dates the 15th of Feb/May/Aug/Nov.

Base scenario, first two years:

| Date | Event | Gross | Cal. yr | Emp. yr |
|---|---|---:|:-:|:-:|
| 2026-08-03 → 12-31 | Salary: 29/31 of August + 4 months at $12,500 | 61,693.55 | 2026 | 1 |
| 2026-09-02 | Sign-on | 30,000.00 | 2026 | 1 |
| 2027-01-01 → 08-02 | Salary: 7 months + 2/31 of August | 88,306.45 | 2027 | 1 |
| 2027-03-15 | 2026 bonus: 10% × 61,693.55 | 6,169.35 | 2027 | 1 |
| 2027-08-03 → 12-31 | Salary: 29/31 of August + 4 months | 61,693.55 | 2027 | 2 |
| 2027-08-15 | RSU 5% (nominal 08-03, moved to the company vest date) | 10,000.00 | 2027 | 2 |

- **Employment year 1:** $186,169.35 gross. The recruiter-style "year-1 TC" is $205,000.
  Actual first-12-month pay is **$18,830.65 (9.2%) lower**: the bonus is prorated and the
  cliff vest lands 12 days into year 2. (The vest is on 08-15, not the anniversary, so
  decision 1 doesn't pull it back into year 1.)
- **Calendar years:** 2026 = $91,693.55 (partial year, taxable income $75,593.55, 22%
  bracket; offer tax $18,357.14). 2027 = $166,169.35.
- **Clawback with a leave date of 2027-02-02** (6 months): you owe $15,000 gross. It was
  paid in 2026 and repaid in 2027, so §1341 recovers 22% federal = $3,300. FICA ($1,147.50)
  and state aren't recovered, so the net cost is $11,700.

## 11. Open questions

None. Rev 2's three questions were resolved in review: the window starts at the earliest
start date with PV discounted to today (decision 2); federal links only where verified
(decision 3a); refactor first, on its own branch.

## 12. Types

These were the proposal reviewed before building. The authoritative versions are now in
`src/offer/types.ts` and `src/tax/params/index.ts`. They differ in detail: clawback terms,
the bonus bases, `raiseOn`, and the leave and window results.

### 12a. Engine additions (`src/tax/params/index.ts`, `StateSpec`)

```ts
import type { FilingStatus, Schedule } from "../types";
import type { StateSpec } from "./states2026";

export interface TaxParams {
  year: number;
  /** (1 + inflation)^(year - 2026); exactly 1 for 2026. */
  indexFactor: number;
  /** True after 2026: law projected from 2026 (surfaced as a warning). */
  projected: boolean;
  federal: {
    standardDeduction: Record<FilingStatus, number>;
    brackets: Record<FilingStatus, Schedule>;
    /** IRC 164(b)(7). phaseDown is absent from 2030 (cap = floor = $10,000). */
    salt: { cap: number; phaseDown?: { threshold: number; rate: number; floor: number } };
    k401Limit: number;
  };
  payroll: {
    socialSecurityRate: number;
    socialSecurityWageBase: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: Record<FilingStatus, number>;
  };
  /** 2026 law (held flat), with verified federal links resolved for this year. */
  states: Record<string, StateSpec>;
  local: {
    nyc: Record<"single" | "joint", Schedule>;
    philadelphia: { resident: number; nonresident: number };
  };
}

export declare function paramsForYear(year: number, opts?: { inflation?: number }): TaxParams;

/** New StateSpec field (states2026.ts). Set only where verified, with a source comment. */
export interface StateFederalLinks {
  /** Standard deduction is the federal amount for the same year by statute; follows federal indexing. */
  stdDeductionIsFederal?: boolean;
}
// PayrollComponent.wageCap widens to: number | "ssWageBase"
```

### 12b. Offer model (`src/offer/types.ts`)

```ts
import type { FilingStatus, Locality, TaxInput, TaxResult } from "../tax/types";

// ---- shared -----------------------------------------------------------------
/** Civil date "YYYY-MM-DD". Date math is on calendar days (UTC), never local time. */
export type ISODate = string;
/** A date that recurs every year, e.g. { month: 3, day: 15 }. */
export interface MonthDay { month: number; day: number }

/** Joint scenarios: each sets every uncertain input to its bear/base/bull value at once. */
export type Scenario = "bear" | "base" | "bull";
export interface ByScenario { bear: number; base: number; bull: number }

// ---- inputs -----------------------------------------------------------------
export interface OfferInput {
  label: string;
  /** Where you'd live: the engine taxes you as a full-year resident here. Per offer. */
  residence: { state: string; locality?: Locality };
  /** Where the employer is. Drives the convenience-of-employer warning (§6); not taxed in v1. */
  employerState: string;
  startDate: ISODate;
  /** Your last day of work (inclusive). Cuts off every stream (§4). Omit to stay. */
  leaveDate?: ISODate;
  salary: Salary;
  bonus?: AnnualBonus;
  /** Sign-on, year-2 sign-on, relocation: anything paid as a lump of cash. */
  cashAwards?: CashAward[];
  equity?: Equity;
}

export interface Salary {
  annual: number;
  /** Annual raise, e.g. 0.03. Default 0 in every scenario. Not tied to inflation. */
  raise?: ByScenario;
  /** Default "anniversary". A review date applies once you've been there `minMonths`. */
  raiseOn?: "anniversary" | { review: MonthDay; minMonths: number };
  promotions?: Promotion[];
}

export interface Promotion {
  on: ISODate;
  /** Increase at that date, e.g. 0.12 = +12%. Annual raises compound from the new salary. */
  stepUp: number;
  /** Scenarios that include this promotion. Default all three. */
  scenarios?: Scenario[];
}

export interface AnnualBonus {
  /** percentOfSalary: fraction of salary earned in the period. fixed: dollars, prorated by days. */
  basis: "percentOfSalary" | "fixed";
  amount: ByScenario;
  /** Performance period = 12 months from this date. Default Jan 1. */
  periodStart?: MonthDay;
  /** Paid on the first occurrence of this date after the period ends. */
  payOn: MonthDay;
  /** Starting on/after this date in a period earns nothing for that period. */
  cutoff?: MonthDay;
  /** First payout at the base (target) amount in every scenario. */
  firstPayoutGuaranteed?: boolean;
  /** Forfeited if the leave date comes before payOn. Default true. */
  mustBeEmployedOnPayDate?: boolean;
}

export interface CashAward {
  label: string;
  amount: number;
  paidOn: ISODate | { daysAfterStart: number };
  clawback?: Clawback;
}

export interface Clawback {
  /** Clock starts at your start date, or at this payment's date. */
  from: "start" | "payment";
  terms:
    /** First step whose beforeMonths you haven't reached applies; e.g. [{ beforeMonths: 12, owe: 1 }]. */
    | { kind: "steps"; steps: Array<{ beforeMonths: number; owe: number }> }
    /** Owe the unworked share of `months`. */
    | { kind: "prorated"; months: number; per: "day" | "month" };
  /** Default "gross": you repay the full payment though you received it net of withholding. */
  repay?: "gross" | "net";
}

export interface Equity {
  /** Annual share-price growth, one path for all grants. Default 0 in every scenario. */
  priceGrowth?: ByScenario;
  grants: RsuGrant[];
  refreshers?: RefresherPolicy;
}

export interface RsuGrant {
  kind: "rsu"; // room for "option" later
  label: string;
  /** Dollar value at grant, as quoted. (Have shares? Pass shares x grant price.) */
  value: number;
  grantDate?: ISODate; // default startDate
  vestStart?: ISODate; // default startDate
  schedule: VestingSchedule;
}

export interface VestingSchedule {
  /** Fraction vesting at each month offset from vestStart. Must sum to 1. */
  tranches: Array<{ month: number; fraction: number }>;
  /** Company vest calendar, e.g. { months: [2, 5, 8, 11], day: 15 }. A tranche moves to the
   *  first company vest date on or after its nominal date. Omit to vest on the nominal date. */
  vestDates?: { months: number[]; day: number };
}

export interface RefresherPolicy {
  /** Dollar value of each refresher grant. */
  value: ByScenario;
  firstAfterMonths: number;
  everyMonths: number;
  schedule: VestingSchedule;
}

/** byYear([5, 15, 40, 40], { perYear: 2, cliffMonths: 12 }): percents per year, split evenly
 *  into perYear vests; anything before the cliff vests at the cliff. */
export declare function byYear(
  pctPerYear: number[], opts: { perYear: number; cliffMonths?: number },
): VestingSchedule;

/** About you, not the job: shared by every offer being compared. */
export interface Household {
  filingStatus: FilingStatus;
  /** Your W-2 wages from other jobs, by calendar year (e.g. the job you're leaving). */
  otherWages?: Record<number, number>;
  /** Joint filers: spouse's W-2 wages by calendar year. Unlisted years are 0. */
  spouseWages?: Record<number, number>;
}

export interface ProjectionOptions {
  /** Present values are as of this date. Required: the UI passes today; tests pass a fixed date. */
  valuationDate: ISODate;
  /** Employment years to show. Default 5. */
  years?: number;
  /** Indexes federal tax law after 2026 (brackets, deductions, wage base). Not pay growth. Default 0.025. */
  inflation?: number;
  /** Nominal annual rate for present values. Default 0.05. */
  discountRate?: number;
  /** Totals window. Default [startDate, startDate + years); compareOffers defaults it to the earliest start. */
  window?: { start: ISODate; years: number };
}

/** States applying a convenience-of-employer rule to remote employees' wages. CT and NJ
 *  apply it only to residents of states that have one (reciprocity); `named` are states without
 *  one that NJ's list still names (NE, since LB1023 from 2025); `notReaching`, residents an
 *  employer state's rule doesn't reach (NJ's: PA and CT, per its FAQ). */
export declare const CONVENIENCE_RULE_STATES: {
  always: ["NY", "DE", "PA"]; reciprocal: ["CT", "NJ"]; named: ["NE"]; notReaching: { NJ: ["PA", "CT"] };
};

// ---- outputs ------------------------------------------------------------------
export type Component = "salary" | "bonus" | "cash" | "rsu" | "clawback";
export type ByComponent = Record<Component, number> & { total: number };
export interface Money { gross: number; tax: number; net: number }

/** One dated payment or vest: the unit of "show the work". */
export interface CompEvent {
  date: ISODate; // pay/vest date; salary months use the segment's last day
  component: Component;
  label: string; // "RSU: initial grant, tranche 1 of 7"
  formula: string; // "$200,000 x 5% x 1.000 price factor"
  gross: number; // negative for clawback repayments
  calendarYear: number;
  employmentYear: number; // 1-based
  inWindow: boolean;
  tax: number;
  net: number;
  /** (1 + discountRate)^-((date - valuationDate) / 365.25); PV of this event = net x discountFactor. */
  discountFactor: number;
}

export interface CalendarYearResult {
  year: number;
  offerGross: ByComponent;
  /** Exactly what went into the engine, both runs. Offer tax = difference in totalTax. */
  withOffer: { input: TaxInput; result: TaxResult };
  withoutOffer: { input: TaxInput; result: TaxResult };
  offerTax: number;
  /** offerTax / offerGross.total, applied to every event in the year. */
  offerTaxRate: number;
  /** From paramsForYear: (1 + inflation)^(year - 2026); 1 in 2026. */
  indexFactor: number;
  projectedLaw: boolean;
}

export interface EmploymentYearResult {
  year: number;
  start: ISODate;
  end: ISODate; // exclusive
  gross: ByComponent;
  tax: number;
  net: number;
  /** Offer-letter view: salary rate at year start + target bonus on it + cash awards
   *  + new-hire RSU tranches nominally in months (12(n-1), 12n], no price growth.
   *  Refreshers are excluded: they aren't in an offer letter. */
  quotedTC: number;
}

export interface ScenarioResult {
  events: CompEvent[];
  calendarYears: CalendarYearResult[];
  employmentYears: EmploymentYearResult[];
  /** Sums over events inside the window; presentValue is as of options.valuationDate. */
  window: { nominal: Money; presentValue: Money };
}

export interface ClawbackPoint {
  /** If this were your leave date... */
  leaveDate: ISODate;
  owed: number;
  /** Same-year wage reversal, or §1341 federal relief for prior-year payments. */
  taxRelief: number;
  netCost: number;
}

export interface OfferProjection {
  label: string;
  window: { start: ISODate; end: ISODate };
  scenarios: Record<Scenario, ScenarioResult>;
  /** Month-ends from start until nothing is owed; base scenario. */
  clawbackExposure: ClawbackPoint[];
  /** Input-specific, plain language ("First bonus is paid 2028-03-15: you start after the cutoff"). */
  warnings: string[];
  /** Assumptions behind these numbers, for the methodology page. */
  assumptions: string[];
}

export declare function projectOffer(
  offer: OfferInput, household: Household, options: ProjectionOptions,
): OfferProjection;

/** Projects every offer over one shared window (default: from the earliest start date). */
export declare function compareOffers(
  offers: OfferInput[], household: Household, options: ProjectionOptions,
): { window: { start: ISODate; end: ISODate }; projections: OfferProjection[] };
```

Planned files: `src/offer/types.ts`, `src/offer/dates.ts` (civil-date math, month adds that
clamp Jan 31 + 1 month to Feb 28), `src/offer/vesting.ts` (`byYear`, vest-date snapping),
`src/offer/project.ts` (`projectOffer`, `compareOffers`), and `test/offer.test.ts` with §10
as hand-checked values.
