# UI design (rev 2, approved)

Roadmap item 6. It covers:
- who the app is for;
- the information architecture;
- every results view;
- how the COL-adjusted number is explained;
- the methodology and its audit tickmarks;
- visual direction and the tech stack.

**Status.** Rev 1 was reviewed on 2026-10-08 and approved with changes. Rev 2 records them:
- the rent estimate in quick mode;
- pay per extra hour;
- the stay length as an input, with a "winner if you stay" row;
- a revised visual direction, with audit tickmarks as the signature element.

No UI code is written until the engine prerequisites in §11 are done and timed.

**Wireframe numbers.** The wireframes use the three sample offers from `npm run offers`.
- **Illustrative:** those inputs aren't market data.
- **Real output:** every number is engine output for those inputs unless it's marked as an
  example.
- **Dates:** offers start 2026-07-13, PV is as of that date (as in the table script), and the
  stay is the default 4 years.
- **Per month:** per-month figures use the annuity in §4.1. The engine version (§11) may
  differ by a dollar from these.

## 0. Decisions

Approved on 2026-10-08. Rows 2, 5, 7 and 9 were changed in review.

| # | Decision | § |
|---|---|---|
| 1 | **Default basis:** "After rent, at U.S. prices" (the COL-adjusted total) whenever every offer has a city and a rent; otherwise total rewards; never per hour. | 6 |
| 2 | **Rent in quick mode** is prefilled with the engine's BEA-derived estimate: your current rent × the housing price ratio. It's labeled "estimate: edit to your actual rent". HUD Fair Market Rents go on the roadmap, not into this build. | 3.3 |
| 3 | **Close calls:** a lead under 3% of the leader's value is labeled "close call" and shows the smallest salary change that flips it. | 4.1 |
| 4 | **The basis toggle is the pipeline:** after tax → + benefits → − rent & prices → ÷ hours. Each step shows its own winner and margin. | 4.2 |
| 5 | **Per hour** stays as the pipeline's last step. **Pay per extra hour** is added for offers whose hours differ: difference in the chosen basis per year ÷ difference in annual hours. | 4.2 |
| 6 | **"Per month"** is the level monthly amount over the window with the same present value as the gap (an annuity at the discount rate). | 4.1 |
| 7 | **Stay length is an input** in quick mode: "How long do you expect to stay?", default 4 years. It sets the comparison window. A "winner if you stay 2 / 3 / 4 / 5 years" row sits under the verdict. | 3.3, 4.1 |
| 8 | **Sharing:** no URL sharing. Export JSON, CSV or print-to-PDF; everything is saved in this browser only. | 10 |
| 9 | **Visual direction:** a workpaper whose signature is audit tickmarks. Every figure carries a tickmark that opens its derivation, and that's how "methodology linked from every number" works. Cool ledger neutrals, not cream; cobalt, berry and bronze for offers, not terracotta. Schedules with workpaper references, not a hairline-ruled broadsheet. | 9 |

## 1. Audience and job

**Who.** A new grad or early-career analyst (0-3 years out) holding two or three offers,
usually on a deadline: exploding offers give one to three weeks.
- **Finance-literate:** knows what a bonus, an RSU and a 401(k) match are. Not a tax expert.
- **Often comparing cities:** New York vs Charlotte vs Seattle.
- **Often comparing unlike pay:** a bonus-heavy banking offer, salary plus RSUs in tech,
  steady corporate finance.

**Context.** Laptop first: one sitting of 10-20 minutes, then return visits as offers
change (a negotiated sign-on, a recruiter's new number). Phone second: checking the verdict
or showing a friend.

**Jobs, in order:**
1. **Which offer leaves me better off, honestly?** The verdict.
2. **By how much, in terms I can feel?** Per month, not "$21,182 of present value".
3. **Does it depend on how long I stay?** The "if you stay" row.
4. **What if things go badly?** Downside risk.
5. **What would it take for the other offer to win?** Breakeven, for negotiation.
6. **What does leaving early cost me?** Clawbacks, vesting cliffs, forfeited bonuses.
7. **Can I trust this?** Every figure's tickmark opens its work.

**Not the job:**
- Market data or salary benchmarks.
- Telling you which job to take: we compare money, time and prices; career fit is yours.
- Financial advice.

The methodology page and the footer say this once, plainly.

## 2. Principles

From the NN/g calculator guidelines and the project's own conventions:
- **Inputs and results together.** Results update live beside the inputs. There's no
  Calculate button.
- **Inline help on every input.** A hint under the field, longer help on demand, and a link
  to the methodology (§3.5).
- **No misleading defaults.** A default is a real, visible, editable value with a `D`
  tickmark and its reason. An estimate gets an `E` tickmark. A placeholder never looks like
  a value. Uncertain inputs default to 0 and say so: raises, price growth, refreshers,
  savings.
- **Units and a time frame on every number:** "$487 a month, if you stay 4 years, in today's
  dollars".
- **Every figure is ticked and traceable.** Each figure carries an audit tickmark. Clicking
  it opens the derivation with your values, and from there the methodology (§8, §9.1).
- **Say what isn't counted.** Omissions sit beside the results: "Not counted: 401(k) match,
  health costs. Add them in detailed mode."
- **Illustrative is always labeled.** Sample offers carry a stamp wherever they appear (§7).

## 3. Information architecture

### 3.1 Map

```
Offer Calc
├── Compare  (#/)        inputs and results on one page: the whole app for most visits
│   ├── About you         filing status, stay length, current rent, prices in, assumptions
│   ├── Offers (2-3)      quick or detailed; one column per offer
│   └── Results           schedules, each with a workpaper reference:
│                          L    lead schedule: verdict, if-you-stay row, basis, extra hours
│                          L-1  by year           L-2  if things go badly
│                          L-3  what it would take L-4  leaving early
│                          L-5  warnings          L-6  the work (full tables)
├── Methodology  (#/method)  sections M-1 … M-13; every tickmark leads here
└── Data  (#/data)        what's stored (this browser only), export, import, delete all
```

Hash routes, so static hosting needs no rewrite rules. Workpaper references (`L-2`, `M-6.3`)
appear on screen and in exports, so a printed comparison can be cited the way an auditor
cites a workpaper.

### 3.2 Layout

- **Desktop (≥ 1180 px):** two columns. Inputs on the left (about 44%), results on the
  right with the lead schedule pinned at the top, so the verdict stays in view while you edit.
- **Offers are columns.** Rows are fields, so A's match sits next to B's match on one row,
  like a columnar pad.
- **Tablet (760-1179 px):** inputs full width, results below, the verdict as a sticky bar
  at the top.
- **Phone (< 760 px):** one offer at a time (tabs A | B | C), results below, the verdict as
  a sticky bar at the bottom (W9).

### 3.3 Quick mode and detailed mode

**Quick mode, per offer:**

| Field | Notes |
|---|---|
| Salary | Per year, before tax. Accepts `110k`, `110,000`, `$110000`. |
| Bonus | Target, as a % of salary or $ a year. Payout timing is a `D` default: "paid each March for the prior calendar year; the first one is prorated". |
| City | Where you'd live. Searches BEA metro areas. For a multi-state metro it asks the state (New York metro: NY, NJ or PA), and in New York State it asks "Inside New York City?" (city income tax). The employer state defaults to the same state; detailed mode can change it. |
| Start date | Today or later. A date in the past gets a note: PV would compound pay already received. |
| Rent | Monthly, per offer. Prefilled with HUD's Fair Market Rent for a 1-bedroom in that metro, with an `E` tickmark: "estimate (HUD Fair Market Rent): edit to your actual rent". |

**The rent estimate** is HUD's FY2027 Fair Market Rent (`rentSource: "fmr"`). It's the 40th
percentile of gross rents for recent movers, for the FMR area that holds most of the metro's
people, in your residence state if any is (`npm run fetch-fmr`).
- **Bedrooms:** 1 by default; a studio is one setting away (household `fmrBedrooms`).
- **Fallback:** the BEA-derived estimate covers only areas without an FMR (state nonmetro
  portions). It's the U.S. median gross rent, $1,487 (ACS 2024 1-year, B25064, checked on
  data.census.gov), times the housing RPP ratio.
- **Sample estimates** (1 bedroom, with the derived figure for comparison):

  | Metro | HUD FMR area | FMR | BEA-derived |
  |---|---|---:|---:|
  | New York | New York, NY HMFA | $2,729 | $2,196 |
  | Charlotte | Charlotte-Concord-Gastonia HMFA | $1,640 | $1,443 |
  | Seattle | Seattle-Bellevue HMFA | $2,180 | $2,236 |
- **Metro-wide, so often low:** a Manhattan one-bedroom runs above $2,729, which is why the
  label asks for your actual rent.

**About you:** one strip, shared by all offers.
- **Filing status:** default Single (`D`).
- **How long do you expect to stay?** Default 4 years (`D`). It sets the comparison window
  (§4.1).
- **Your wages from another job this year:** default $0 (`D`). It matters for the first
  year's tax: an internship, or the job you're leaving.
- **Prices in:** default U.S. average (`D`); can be your current city (§5).

**Assumptions:** a panel under About you, closed by default; every value is shown with its
tickmark.
- inflation 2.5%
- discount rate 5%
- health usage medium
- savings rate 0%
- spouse wages, by year
- valuation date: today, shown but not editable

**Detailed mode** adds collapsible sections to the ledger, each with one column per offer:
1. **Pay:** raises (with a range), raise timing, promotions.
2. **Bonus:** basis (% of salary, $ a year, by employment year), ranges, period, pay date,
   cutoff, guaranteed first payout, must-be-employed rule.
3. **Sign-on and other cash:** amount, pay date, clawback terms.
4. **Equity:** grants, vesting (presets named by `describeSchedule`, or custom), company
   vest dates, price growth (range), refreshers.
5. **401(k):** your %, pre-tax or Roth, eligible pay, match tiers, non-elective, vesting,
   service method.
6. **Health:** premium, out-of-pocket by usage, out-of-pocket max, HSA (yours and the
   employer's), coverage.
7. **Perks:** Section 127, commuter.
8. **Hours:** per week (range), weeks a year.
9. **Where you'd live:** city, residence state and locality, employer state, rent, rent
   growth.

**Rules:**
- **One switch, Quick / Detailed, for the whole ledger.** Sections expand one at a time in
  detailed mode.
- **Hidden inputs still count, and say so.** Switching to quick mode keeps every detailed
  value. A chip lists what's still counted ("Also counted: RSUs, 401(k), health. Show"),
  so a hidden input never changes results silently.
- **Ranges are opt-in.** An uncertain field shows one value (base) and a "+ range" link
  that reveals bear and bull. Without a range all three are equal, and the risk view says
  so for that offer.
- **Complex inputs open inline.** Vesting tables, promotions, match tiers and cash awards
  open an editor beneath their row, spanning the ledger, so the other offers stay in view
  (W3).

### 3.4 Live updating

- **When:** edits apply as you type (debounced 200 ms), not on blur.
- **Measured** (`npm run bench`; sample offers, Node, median of warm runs; 2026-10-08):

  | Case | Before | After |
  |---|---:|---:|
  | One projection (offer C) | 35.8 ms | 3.4 ms |
  | `compareOffers` (3 offers × 3 scenarios) | 264 ms | 24 ms |
  | `horizonSweep` (3 offers, stays of 2-5 years) | n/a | 29 ms |
  | One breakeven (bisection, COL basis) | 747 ms | 58 ms |
  | 60-month leave sweep, one offer | 989 ms | 103 ms |
  | `nextCliff` / `cliffs` / `withholdingShortfall`, one offer | n/a | 6 / 5 / 3 ms |

  - **Where the time went:** profiling showed tax was about 2% of a projection and
    `paramsForYear` 0.5%. The params cache (built first, as planned) changed nothing
    measurable.
  - **The real cost:** formatting the "show the work" formula strings, and converting day
    numbers to dates. Reusing number formatters and memoizing the date conversions gave the
    10× speedup.
- **Engine in a Web Worker** (recommended at the timing review).
  - **Every edit** costs `compareOffers` plus `horizonSweep`, about 53 ms on a desktop. That's
    at the 50 ms long-task threshold already, and phones run several times slower.
  - **Breakeven and the leave sweep** add 60-300 ms when those schedules are open.
  - **In a worker,** typing stays at frame rate and stale requests can be dropped.

  The work is staged:
  1. `compareOffers` and the if-you-stay row on every edit. They feed the lead schedule,
     L-1 and L-2.
  2. Breakeven for the selected basis only, when L-3 is on screen.
  3. The leave sweep only when L-4 is open. It runs at the cliff months first, then fills
     in months 1-60.
- **Stale results:**
  - Each request carries a generation number, and any older result is dropped.
  - While new results compute, the previous ones stay at 60% opacity: no skeletons, no
    layout jump. The lead schedule shows "Updating…".
- **Errors:**
  - Engine errors map to the field that caused them, shown inline ("The leave date can't
    be before the start date").
  - Results keep the last valid state and say so.

### 3.5 Inline help on every input

Each field has three layers:
1. **Hint:** always visible under the field, 12 words or fewer.
2. **Help:** the ⓘ toggle expands it inline; it's not a hover tooltip. Two to four
   sentences: what it means, an example, and what happens if it's left at its default.
3. **"How this is used →":** a link to the methodology section.

Examples of the tone:

| Field | Hint | Help |
|---|---|---|
| Salary | Per year, before tax. | Your starting base salary from the offer letter. Raises and promotions are separate (detailed mode). Pay accrues by calendar month, so a July start earns about half of it in 2026. |
| Bonus | Target bonus; first one is prorated. | Enter the target from your offer, as a % of salary or dollars. Most firms pay it once a year for the prior year, so a July start gets a partial first bonus about eight months later. If yours works differently, change the timing in detailed mode. |
| How long do you expect to stay? | Sets how many years we compare. | We compare every offer over the same stretch, starting on the earliest start date. Pay after that isn't counted. The row under the verdict shows whether the winner changes if you stay 2, 3, 4 or 5 years. |
| Rent | Estimate (HUD Fair Market Rent): edit to your actual rent. | HUD's Fair Market Rent: what recent movers pay for a typical 1-bedroom across the metro (the 40th percentile, utilities included). City-center rents usually run higher, so enter yours if you know it. |

The help text lives in one typed file keyed by input path (`app/help.ts`). A unit test
fails if any input lacks a hint or help. Each UI slice writes the help for its own inputs.

### 3.6 Defaults

Every default shows in its field as a real value with a `D` tickmark, and the tickmark says
why. Editing removes it, and "Reset to default" sits in the help.

| Input | Default | Why it's honest |
|---|---|---|
| Filing status | Single | Most new grads; visible in About you |
| How long do you expect to stay? | 4 years | A typical first-job tenure; the if-you-stay row shows 2-5 |
| Rent (per offer) | Estimate (`E`): HUD FY2027 Fair Market Rent, 1 bedroom, for the metro | Published, sourced and labeled "estimate (HUD Fair Market Rent): edit to your actual rent" |
| Wages from another job this year | $0 | Visible; the help explains the first-year effect |
| Bonus timing | Paid March 15 for the prior calendar year; no cutoff | The common pattern; shown under the field |
| Raises, share-price growth, refreshers | 0, 0, none | Uncertain, so zero until you say otherwise |
| Inflation | 2.5% | Indexes tax law and is the default rent growth; never pay |
| Discount rate | 5% nominal | About 2.4% real; explained in M-7 |
| Weeks a year | 50 | Two weeks off |
| Health usage | Medium | The middle of your own three estimates |
| Savings rate | 0% | Beyond the 401(k); zero until you say otherwise |
| Rent growth | = inflation | Shown as "2.5% (inflation)" |
| Prices in | U.S. average | Switchable to a city you know (§5) |
| Valuation date | Today | Not editable; shown in Assumptions |

## 4. Results

The results are schedules, each with an on-screen workpaper reference:
- **L:** lead schedule (pinned)
- **L-1:** by year
- **L-2:** if things go badly
- **L-3:** what it would take
- **L-4:** leaving early
- **L-5:** warnings
- **L-6:** the work

### 4.1 Lead schedule: the verdict

**Content:**
- **Sentence:** "C leaves you about **$487 a month** more than A, after rent at U.S. prices."
  The hero figure is the per-month gap.
- **Scope line:** "Base case · stay 4 years (Jul 13, 2026 – Jul 12, 2030) · today's dollars".
- **Rank list:** C 334,357 · A 313,175 · B 196,270, in U.S.-average dollars, present value.
- **If you stay:** the winner and margin per month for stays of 2, 3, 4 and 5 years, on the
  selected basis, base case. The column for your stay length is highlighted. A cell under
  3% is stamped `CLOSE CALL`.
- **Basis toggle** (§4.2), then the disagreement line.
- **Extra hours** (§4.2), when offers' hours differ.
- **Close-call line,** when the main verdict's lead is under 3%: "Close call: $X more
  starting salary for A would tie."
- **Sample stamp** whenever any offer is a sample (§7).

**If you stay** (sample, after rent at U.S. prices):

| Stay | Winner | Margin | |
|---|---|---|---|
| 2 years | C | $722 a month | |
| 3 years | C | $665 a month | |
| 4 years | C | $487 a month | your stay |
| 5 years | C | $155 a month | close call: 2.0% |

The winner holds, but the margin shrinks the longer you stay, because A's 2029 promotion
arrives.
- **On after-tax pay:** A wins at every length: $1,376, $1,177, $1,373 and $1,733 a month.
- **Why show the row:** whenever the winner changes across stays, the row is the clearest
  way to say so.

**What a stay of N years means:**
- **The window:** [earliest start, + N years), as in the settled comparison window. A later
  start is a shorter stay inside it.
- **Pay after the window isn't counted.**
- **Tax:** the window's last calendar year is still taxed as though you kept earning at the
  same rate through December, as at a similar next job. Leaving at the window's end doesn't
  make that year's tax rate look artificially low.
- **401(k) vesting** is counted at the window's last day.
- **Clawbacks triggered by leaving aren't applied here.** L-4 (leaving early) covers them.

**Per month.** m = ΔPV ÷ AF, where AF is the present value of $1 paid at the end of each
month of the window, discounted the same way as every event: (1 + r)^−(days / 365.25). For
4 years at 5% from the valuation date, AF ≈ 43.52, so C's $21,182 lead over A is $487 a
month.
- **Why an annuity:** ΔPV ÷ 48 understates the gap, because PV is already discounted.
  Nominal ÷ 48 ignores timing. The annuity is the level monthly amount worth the same today.
- **Per-hour basis:** the verdict reads per hour instead: "C pays $19.47 more per hour worked
  ($41.32 vs $21.85)".

**Close call.** The threshold is a lead under 3% of the leader's value on the selected
basis.
- **The flip line** comes from breakeven: the smallest starting-salary change to the
  runner-up that ties.
- **Sample:** at 4 years C's lead is 6.3%, so there's no flip line. At 5 years the row stamps
  `CLOSE CALL` (2.0%).

**Three offers.** The sentence names the winner and the runner-up. The third offer is in the
rank list.

**W2. Compare, desktop, quick mode** (sample offers loaded). The letters after figures are
tickmarks (§9.1).

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ OFFER CALC                                          Compare · Methodology · Data   Export ▾       │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ About you  Single D ▾   Stay  4 years D ▾   Other wages in 2026  $0 D   Prices in U.S. avg D ▾    │
│            Rent now  $1,487 D (U.S. median) ▾   Assumptions: 2.5% · 5% · as of today ▸            │
├──────────────────────────────────────────┬────────────────────────────────────────────────────────┤
│ OFFERS          Quick ● Detailed ○       │ L · LEAD SCHEDULE          [ILLUSTRATIVE SAMPLES]      │
│                                          │                                                        │
│             A          B          C      │ C leaves you about                                     │
│           ━━━━━━━━   ━━━━━━━━   ━━━━━━━━ │ $487 a month ✓                                         │
│           NYC bank   CLT corp   SEA tech │ more than A, after rent at U.S. prices.                │
│           [SAMPLE]   [SAMPLE]   [SAMPLE] │ Base case · stay 4 years (Jul 2026 – Jul 2030) ·       │
│                                          │ today's dollars                                        │
│ Salary     110,000     80,000    105,000 │                                                        │
│  per year, before tax                    │ C 334,357✓ · A 313,175✓ · B 196,270✓  U.S.-avg, PV     │
│                                          │                                                        │
│ Bonus     by year:   10% of     15% of   │ If you stay 2 yrs     3 yrs     4 yrs     5 yrs        │
│           70k→130k   salary     salary   │             C +$722✓  C +$665✓  C +$487✓  C +$155✓     │
│  target; paid each March D  ⓘ            │             a month   a month   a month   CLOSE CALL   │
│                                          │                                                        │
│ City      New York   Charlotte  Seattle  │ ┌ BASIS: the pipeline, left to right ──────────────┐   │
│           (NYC) ▾    ▾          ▾        │ │ After tax   + Benefits  − Rent &    ÷ Hours      │   │
│  where you'd live, not the office  ⓘ     │ │                         prices                   │   │
│                                          │ │ A +$1,373✓  A +$896✓    C +$487✓ ●  C +$19.47✓   │   │
│ Start     Jul 13,    Jul 13,    Jul 13,  │ │ a month     a month     a month     an hour      │   │
│           2026       2026       2026     │ └──────────────────────────────────────────────────┘   │
│                                          │                                                        │
│ Rent/mo     3,800      1,700      2,600  │ A leads on pay; C leads once rent and prices are       │
│  what you'd pay there  ⓘ                 │ counted.                                               │
│  (a blank offer shows an estimate:       │                                                        │
│   New York 2,196 E — edit to your        │ Extra hours: A asks 1,750 more hours a year than C     │
│   actual rent)                           │ and leaves you $5,577 a year less ✓ after rent at      │
│                                          │ U.S. prices: more hours for less pay. On after-tax     │
│ + Add an offer (up to 3)                 │ pay, those hours pay $9.59 each ✓.                     │
│                                          │                                                        │
│                                          │ Also counted (detailed): RSUs, 401(k), health,         │
│                                          │ hours. Show ▸                                          │
│                                          │                                                        │
│                                          │ Tickmarks  ✓ recomputed  ^ footed  < cross-footed      │
│                                          │            T traced  D default  E estimate             │
│                                          │                                                        │
│                                          │ L-1 · BY YEAR  …                                       │
└──────────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### 4.2 The basis toggle is the pipeline

The toggle is the product's pipeline drawn as four steps. Each step is a button showing its
own winner and margin. The selected step drives the verdict, the if-you-stay row, the chart,
the risk view and breakeven.

| Step | User label | Engine field | What it is |
|---|---|---|---|
| After tax | After-tax pay | `window.presentValue.afterTaxComp` | gross − tax − health premiums |
| + Benefits | Total rewards | `window.totalRewards.presentValue` | + vested employer 401(k) + employer HSA + perks − expected out-of-pocket |
| − Rent & prices | After rent, at U.S. prices | `window.costOfLiving.presentValue.total` | spending money after rent, priced at U.S. average, + savings at face value |
| ÷ Hours | Per hour worked | `window.perHour` (§11) | the step-3 total, nominal, ÷ hours worked in the window |

**How the steps behave:**
- **When they disagree,** a one-line summary sits under the toggle, built from the step
  winners: "A leads on pay; C leads once rent and prices are counted."
- **A step missing inputs is disabled and says why:** "Add rent for B" or "Add hours for
  all offers".
- **Without rent,** ÷ Hours divides total rewards instead, and its label says so.
- **The selected step is remembered** in this browser.

Sample margins, base case, 4-year stay:

| Step | Winner | Margin |
|---|---|---|
| After tax | A over C | $1,373 a month |
| + Benefits | A over C | $896 a month |
| − Rent & prices | C over A | $487 a month |
| ÷ Hours | C over A | $19.47 an hour (C $41.32, A $21.85, B $21.66) |

**Pay per extra hour.** This shows when offers' hours differ by 2 or more a week. For the
lead schedule's winner and each other offer:
- **Formula:** (difference in the selected basis per year) ÷ (difference in annual hours).
  It's nominal over the window, like per hour.
- **More hours and more pay:** "A asks 1,500 more hours a year than B and pays $22.15 for
  each, after rent at U.S. prices."
- **More hours and less pay:** the ratio would be negative and hard to read, so the line
  says "more hours for less pay" and gives the yearly gap.
- **Below the selected basis,** the line names the lowest basis where the extra hours do
  pay. That shows what the hours buy before rent and prices.

The sample at 4 years, after rent at U.S. prices:
- **A vs C:** A asks 1,750 more hours a year (35 a week) and leaves you $5,577 a year less.
  That's more hours for less pay. On after-tax pay, those extra hours pay $9.59 each,
  against A's average of $21.85.
- **A vs B:** A asks 1,500 more a year and pays $22.15 for each of them after rent at U.S.
  prices.

### 4.3 L-1 · By year

- **Form:** a line chart, one line per offer, employment years 1 through the stay on the
  x-axis and the selected basis per year on the y-axis.
  - Each year is in the dollars paid that year; the caption says the verdict discounts them
    to today.
  - A toggle switches between "Each year" and "Running total"; the running total shows
    where one offer catches up.
- **Marks** (dataviz spec):
  - 2 px lines; 8 px markers with a 2 px surface ring.
  - Offer letter and last-year value as direct end labels, each with its tickmark; a legend
    as well.
  - One y-axis; solid gridlines one step off the surface.
  - A crosshair tooltip listing every offer at that year.
  - A "Table view" link under the chart showing the same numbers, ticked.
- **Annotations,** muted, explain kinks from the events: "A: promotion (base case)",
  "C: new-hire RSUs finish vesting".
- **Under the chart:** the bridge for one offer and year (§5, W4).

**W4a. L-1, after rent at U.S. prices** (sample, base case, 4-year stay)

```
L-1 · BY YEAR                                [ Each year | Running total ]   U.S.-avg $, nominal
   120k ┤                                                                  A● C●    A 118,764✓  C 117,120✓
   110k ┤
   100k ┤                                                C●
    90k ┤                                                A●
    80k ┤                              A● C●
    70k ┤            C●
    60k ┤            A●                                                    B●              B  55,878✓
    50k ┤            B●                B●                B●
        └─────────────┴─────────────────┴─────────────────┴─────────────────┴────────
                     Yr 1              Yr 2              Yr 3              Yr 4
                                                                         ▲ A: promotion (base)
   Lines join each offer's points. Each year is in that year's dollars; the verdict
   discounts them to today.                                                   Table view ▸
```

### 4.4 L-2 · If things go badly

The job is "which offer holds up best", not three columns of numbers. Every part of the view
answers that question.

**W5. L-2** (sample; after rent at U.S. prices, PV, 4-year stay)

```
L-2 · IF THINGS GO BADLY
  C holds up best, and wins in every scenario. In the bear case it leads A by $1,265 a
  month✓. A has the most to lose: $1,250 a month✓ below its base case (−17%), because its
  promotion and bonuses carry the risk.

                175k      225k      275k      325k      375k
                ├─────────┼─────────┼─────────┼─────────┤
  C                                         ●───◆───●         bear 313,862✓   −6%
  A                              ●──────────◆─────●           bear 258,793✓  −17%
  B               ●─◆●                                        bear 187,316✓   −5%
                ● bear and bull   ◆ base      sorted by bear case                Table ▸

  Who wins     Bear: C✓       Base: C✓       Bull: C✓

  What goes wrong in the bear case
    A   bonuses 20% under target; no promotion in 2029
    B   bonus 5% of salary instead of 10%
    C   bonus 10% instead of 15%; refreshers $10k instead of $25k

  The bear case is one coherent bad story: every uncertain input at its bear value at once.
  It isn't the worst case. Methodology M-8 ▸
```

**Parts:**
1. **Sentence.** The offer with the best bear-case value "holds up best". The sentence also
   names the biggest drop from base to bear in $ a month, and any offer that wins only in
   the bull case. At 5 years A wins the bull case, so the sentence would add "A comes out
   ahead only if things go well."
2. **Range chart (dumbbell).** One row per offer: bear and bull dots joined by a line, base
   as a diamond. One x-axis, in PV on the selected basis. Rows sorted by bear value, with
   the bear value and the % drop at the right. Offer colors are fixed by letter.
3. **Winner by scenario,** three cells.
4. **What goes wrong:** each offer's inputs that differ between base and bear, generated
   from the inputs.
5. **Honesty notes:**
   - An offer without ranges shows a single dot and "no ranges entered", rather than
     looking safe.
   - Scenarios are joint (M-8).

Sample values, PV, 4-year stay:

| Offer | Bear | Base | Bull |
|---|---|---|---|
| A | 258,793 | 313,175 | 347,199 |
| B | 187,316 | 196,270 | 199,847 |
| C | 313,862 | 334,357 | 355,704 |

### 4.5 L-4 · Leaving early

The sweep answers "what do I keep if I leave after N months"; the next-cliff panel answers
"what do I give up by leaving now instead of a little later".

**The chart:**
- **Axes:** months worked (1-60) on x; after-tax pay kept, after clawbacks, nominal, on y.
  It's stepped, one line per offer.
- **Cliff markers:** $ bonus paid, ▲ RSU vest, ✓ clawback window ends, ◆ 401(k) vests.
- **Cursor:** a draggable "last day", also a date field and a ± month stepper.
- **Basis:** after-tax pay kept by default; total rewards is a toggle (both come from
  `leaveDateSweep`). The COL basis isn't available here yet, and the view says so.

**The next-cliff panel,** for the cursor date, per offer:
- what you'd keep;
- what you'd repay;
- what's forfeited (unvested RSUs at grant value, unvested 401(k));
- the next cliff, with the after-tax value of staying until it, split into the extra pay
  and the cliff itself (`nextCliff`, §11).

**W6. L-4** (sample, base case)

```
L-4 · LEAVING EARLY             After-tax pay kept, after clawbacks · nominal   [ After tax ▾ ]
   Last day  [ Jan 12, 2027 ▾ ]  ◀ 6 months ▶     $ bonus  ▲ RSU vest  ✓ clawback ends  ◆ 401(k)

   600k ┤                                                                ╭─A
   400k ┤                                              ◆ ╭───────────────╯╭─C
        │                                     $ ╭──────╯       ╭─────────╯ ╭─B
   200k ┤                      $  ▲ ╭──────────╯      ╭────────╯      ╭────╯
        │            ┃ $ ✓ ╭───────╯         ╭────────╯       ╭───────╯
      0 ┼────────────┃──────────┬──────────────┬──────────────┬──────────────┬──
        0            6         12             24             36             48   months
                     ┃ Jan 12, 2027

   If your last day is Jan 12, 2027 (6 months)
   A  keep $41,200✓ · repay the $10,000T sign-on in full (window ends Jul 12, 2027)
      Next cliff: your first bonus, paid Jan 31, 2027, is 19 days away. Staying until
      then is worth +$29,970✓ after tax, $26,057✓ of it the bonus.
   B  keep $34,974✓ · repay $2,500✓ of the sign-on (prorated; drops $417 a month)
      Next cliff: the clawback steps down on Feb 12; first bonus Mar 15, 2027 …
   C  keep $47,506✓ · repay $5,000✓ · $120,000✓ of RSUs unvested
      Next cliff: first bonus Mar 15, 2027; first RSU vest Aug 15, 2027 …
```

(The curve shapes are schematic. The panel's A figures and every "keep", "repay" and
"unvested" figure are engine output.)

### 4.6 L-3 · What it would take

For each offer that isn't winning, show the starting salary, or sign-on, that would tie
the winner on the selected basis. It's base case and PV over your stay, using `breakeven`.

**W7a. L-3** (sample; to tie C, after rent at U.S. prices, 4-year stay)

```
L-3 · WHAT IT WOULD TAKE                         to tie C · after rent at U.S. prices · 4 years
  A   starting salary  $110,000T → $118,626✓   (+$8,626, +7.8%)
      or a sign-on of  $45,487✓ instead of $10,000T   (+$35,487)
  B   starting salary   $80,000T → $125,404✓   (+$45,404, +56.8%)
      or a sign-on of $205,860✓ instead of $5,000T: salary is the lever here.

  Salary moves more than a sign-on: raises, percent bonuses and the 401(k) match scale with it.
  These are what it would take to tie, not advice on what to ask for.
```

**Rules:**
- **Per-hour basis:** breakeven isn't defined per hour. L-3 shows the step-3 numbers and
  says so.
- **Already ahead:** when an offer already leads, L-3 says "A already leads C by $X a month
  on after-tax pay". Breakeven returns that as a structured result instead of throwing
  (§11).
- **Wording stays factual:** "what it would take", never "ask for".

### 4.7 L-5 · Warnings

| Kind | Example | Where | Engine |
|---|---|---|---|
| Changes your numbers | 401(k) deferrals hit the 402(g) limit and the match stops early; HSA or perk over its limit | Inline under the offer's field, and in L-5 | Exists |
| Not modeled: may cost you | Convenience-of-employer rule (NY, DE, NE, PA; CT and NJ reciprocal); FICA on a cross-year clawback not refunded | L-5, with a methodology link | Exists |
| Cash timing | Withholding shortfall: bonuses and RSU vests are withheld at the 22% supplemental rate, below your real rate | L-5 and L-4 | `withholdingShortfall` (§11) |
| Input | Starting after the bonus cutoff: no first bonus | Under the field | Exists |

**Rules:**
- **Never color alone.** Status colors are reserved and always come with an icon and a
  label (§9).
- **Grouped by offer.** Each warning names the offer it's about.
- **Not dismissible** if it changes your numbers.

**W7b. L-5** (examples: the samples raise none)

```
L-5 · WARNINGS
  ⚠ Changes your numbers
    C  Your 2029 401(k) deferrals reach the 402(g) limit before year-end; deferrals and
       the match stop for the rest of that year (no true-up assumed).
  ⓘ Not modeled: may cost you
    A  You'd live in NJ and work for a NY employer. New York's convenience-of-employer
       rule may tax your remote days there too. We don't compute nonresident tax. ▸
  $ Cash timing
    A  Your first bonus (Jan 31, 2027) is withheld at the 22% federal supplemental rate,
       below your rate on it. Set aside about $x,xxx✓ for April 2028. ▸
```

### 4.8 L-6 · The work

The full tables, collapsed by default and ticked like a workpaper:
- **Per offer, as L-6.A, L-6.B and L-6.C:** the employment-year tables from `npm run offers`
  (cash; total rewards and hours; cost of living).
  - Columns are footed (`^`).
  - Totals cross-foot (`<`) to the lead schedule.
  - Inputs are traced (`T`).
- **Events:** every dated payment, with its formula and its tax.
- **Calendar-year tax:** the engine input and output for each year, with and without the
  offer.

Each table exports to CSV, tickmarks included as a column.

## 5. Explaining "after rent, at U.S. prices"

**The problem.** Offer A's letter says $190,000 for year 1. The COL-adjusted figure is
$62,595. Unexplained, that reads as a bug.

**The plan** (approved):
1. **Name it for what it is.** The UI label is **"After rent, at U.S. prices"**. Wherever it's
   the headline, a subtitle reads: "Spending money after rent, priced as in an average U.S.
   city, plus what you save."
   - "COL-adjusted total" is the methodology's term; the UI links to it but never uses it
     as a label.
   - Column units read "U.S.-avg $".
2. **Lead with the difference.** The verdict is "$487 a month more", and an unfamiliar level
   doesn't matter for that. Levels appear in the rank list and the bridge.
3. **Bridge from the offer letter.** A waterfall for one offer and one year (year 1 by
   default, with a year selector). Every line is ticked, and tax and rent visibly do most of
   the work (W4).
4. **Monthly framing.** Under the level: "$4,391 a month to spend after rent, plus $825 a
   month saved". People know their monthly budget.
5. **First-use note.** The first time this basis is shown, an inline note (not a modal)
   above the verdict reads: "This is much lower than your salary on purpose. It's what's
   left to spend after tax and rent, priced as in an average U.S. city, plus what you save.
   [See how we get there] [Got it]". It's remembered in this browser.
6. **Prices in a place you know.** "at U.S. prices" is a control. Switching it to "at
   Charlotte prices" (your current city, say) restates every figure in dollars you
   recognize. The factor for that city becomes 1.
7. **Methodology M-6.3** has the formula, the reconciliation with total rewards, and a link
   back to these numbers.

**W4. The bridge** (sample A, year 1)

```
  A · NYC bank · year 1 (Jul 13, 2026 – Jul 12, 2027)                       [ Year 1 ▾ ]

  Offer letter: salary + target bonus + sign-on            190,000T
    less  first bonus is a stub                            (37,014)✓  paid Jan 31 for Jul–Dec only
  ──────────────────────────────────────────────────────────────────
  Paid in year 1                                           152,986^
    less  tax                                              (41,724)✓  federal, FICA, NY, NYC
    less  health premiums                                   (1,800)T
  ──────────────────────────────────────────────────────────────────
  After-tax pay                                            109,463^ <
    plus  employer 401(k) match                              3,300✓   vests at 3 years; you stay 4
    less  expected out-of-pocket health costs               (1,500)T
  ──────────────────────────────────────────────────────────────────
  Total rewards                                            111,263^ <
    less  rent                                             (45,600)T  $3,800 a month
    less  New York prices                                   (3,068)✓  non-housing prices 5.8%
                                                                       above the U.S. average
  ══════════════════════════════════════════════════════════════════
  After rent, at U.S. prices                                62,595^ <
    = $4,391✓ a month to spend after rent + $825✓ a month saved (your 401(k) and the match)
```

The subtotals are footed (`^`) and cross-foot (`<`) to the engine's employment-year values in
L-6.A. That's the double rule's job: the total ties.

## 6. Default basis (approved)

"After rent, at U.S. prices" whenever every offer has a city and a rent; otherwise total
rewards. Never per hour.

**Why:**
1. **It answers the user's question.** "Where will I be better off?" is a question about
   what you can spend and save, so it has to count rent and local prices.
2. **It prevents the most common mistake.** Comparing New York and Charlotte pay at face
   value is the error this tool exists to fix. In the samples it flips the answer: A leads
   by $1,373 a month after tax, and C leads by $487 a month after rent and prices.
3. **It hides nothing.** The pipeline toggle shows every step's winner beside it, and the
   disagreement line says where the lead flips.
4. **It's honest about uncertainty.** Rent is an estimate until you edit it (`E`), and the
   close-call label makes a thin lead look thin.

**Why not the others:**
- **After tax:** it leaves out the match and benefits, and it's blind to location.
- **Total rewards:** right when everything is in one city, but still blind to rent and
  prices across cities.
- **Per hour:** hours are the softest input (is banking 70 or 90 a week?) and a value
  judgment: people trade hours for career capital on purpose. It's a lens, not a verdict.
  Pay per extra hour carries that lens into the lead schedule instead.

## 7. Sample offers

The samples are the three offers from `scripts/offer-table.ts`. They move to `src/samples.ts`
so the script and the app share one source (§11).

**First run:** two buttons, "Start with my offers" and "Try the sample offers". The second
button is captioned "illustrative inputs, not market data" (W1).

**Where the label appears:**
- **Offer column:** a `SAMPLE` stamp in the header. Editing a sample changes it to
  `EDITED SAMPLE`; it clears only when you replace the offer or press "Clear sample".
- **Lead schedule:** a banner while any sample is present: "Sample offers: illustrative
  inputs, not market data. Replace them with yours."
- **Charts:** the caption ends "(sample inputs)".
- **Exports:**
  - The first line of every file says so.
  - The file name ends `-sample`.
  - The print footer repeats it.
- **Methodology:** worked examples are headed "Example (illustrative)".
- **Tickmarks:** every `T` tickmark on a sample input says "traced to a sample input
  (illustrative)".

**W1. First run**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ OFFER CALC                                                                 │
│                                                                            │
│ Compare job offers the way they'd actually pay out:                        │
│ after tax, after rent and local prices, per hour, year by year.            │
│                                                                            │
│   [ Start with my offers ]      [ Try the sample offers ]                  │
│                                  illustrative inputs, not market data      │
│                                                                            │
│ Runs entirely in your browser. Nothing you enter leaves this device.       │
│ Every figure carries an audit tickmark (✓): click it to see the work.      │
└────────────────────────────────────────────────────────────────────────────┘
```

## 8. Methodology, linked from every figure

**Every figure carries a tickmark, and the tickmark is the link** (§9.1).
1. **Click or press Enter** on a tickmark to open **Show the work**: the derivation with your
   values. Each input in it carries its own tickmark, so you can keep tracing.
2. **The figures it uses light up** wherever they appear on the page (a highlighter wash).
3. **The popover links out:** to the methodology section (M-x), and to any figure it
   cross-foots to.

Each metric id maps to a derivation template, a tickmark kind and a methodology section. A
unit test fails if any figure in the UI renders without all three.

**Sections:**
1. **M-1 The pipeline:** gross → after tax → total rewards → after rent at U.S. prices → per
   hour. The worked example is A's year-1 bridge, marked illustrative.
2. **M-2 Pay:** monthly accrual, raises and promotions, bonus proration and timing, cash
   awards.
3. **M-3 Equity:** RSU vesting, company vest dates, refreshers, price growth, sold at vest.
4. **M-4 Tax:**
   - cash basis by calendar year;
   - the offer's tax as household tax with the offer minus without it;
   - projected law after 2026;
   - withholding vs liability;
   - validation against PolicyEngine-US, with the current match statistics;
   - the intentional differences.
5. **M-5 Benefits:** 401(k), health, perks, hours, per hour and pay per extra hour.
6. **M-6 Cost of living:**
   - 6.1 Prices: BEA RPPs and the non-housing factor
   - 6.2 Rent: the estimate and rent growth
   - 6.3 After rent, at U.S. prices: the formula and its reconciliation
   - 6.4 What it leaves out
7. **M-7 Time:** present value, the per-month annuity, the stay and the window, today as the
   valuation date.
8. **M-8 Scenarios:** joint bear, base and bull.
9. **M-9 Leaving early:** leave date, clawbacks, the IRC 1341 credit, forfeitures, cliffs.
10. **M-10 Known gaps:** CLAUDE.md's known gaps in plain language.
11. **M-11 Data and sources:**
    - tax law (2026, with sources);
    - BEA RPP 2024 (released Feb 19, 2026);
    - ACS median gross rent (2024);
    - IRS Pub. 15 supplemental rates;
    - the engine version.
12. **M-12 Your assumptions:** each offer's live `assumptions[]`, as entered.
13. **M-13 Tickmarks:** what each mark means, as on an auditor's legend.

**Content source:**
- **M-1 to M-11** are written for users from `docs/offer-model.md` and CLAUDE.md. They're
  versioned with the engine; the footer shows the engine version and the data vintages.
- **M-12** is generated.

**W8a. Show the work** (click the tickmark on A's year-1 figure)

```
┌────────────────────────────────────────────────────────────────────────┐
│ SHOW THE WORK · A · year 1 · after rent, at U.S. prices                │
│                                                                        │
│   take-home 102,863✓ − rent 45,600T          =  57,263✓ local          │
│   × price factor 0.9450✓  (U.S. 99.88T ÷ NYC 105.70T)                  │
│                                              =  54,112✓                │
│   − out-of-pocket 1,500T × 0.9450✓           =  −1,417✓                │
│   + saved, at face: your 401(k) 6,600✓                                 │
│     + match 3,300✓                           =   9,900^                │
│                                                 ═══════                │
│                                                  62,595✓               │
│                                                                        │
│   Ties to L-6.A, year 1, row 12 <                                      │
│   Inputs it uses are highlighted on the page.                          │
│   Methodology M-6.3 · After rent, at U.S. prices ▸                     │
└────────────────────────────────────────────────────────────────────────┘
```

**W8b. Methodology page**

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ OFFER CALC                                     Compare · Methodology · Data           │
├────────────────────────┬──────────────────────────────────────────────────────────────┤
│ CONTENTS               │ M-6.3  After rent, at U.S. prices                            │
│                        │                                                              │
│ M-1  The pipeline      │ Spending money is local; saved money isn't. We start from    │
│ M-2  Pay               │ take-home pay, take out rent, and price what's left as if    │
│ M-3  Equity            │ you lived in an average U.S. city. Then we add back what     │
│ M-4  Tax               │ you save, at face value.                                     │
│ M-5  Benefits          │                                                              │
│ M-6  Cost of living    │   (take-home − savings − rent − out-of-pocket) × factor      │
│      6.1 Prices        │   + savings + your 401(k) and HSA + vested match             │
│      6.2 Rent          │   + employer HSA + perks                                     │
│    ● 6.3 After rent    │                                                              │
│      6.4 Leaves out    │ It ties to total rewards (cross-footed <):                   │
│ M-7  Time and PV       │   total rewards − rent + (factor − 1) × local spending       │
│ M-8  Scenarios         │                                                              │
│ M-9  Leaving early     │ Example (illustrative): A, year 1 → the bridge               │
│ M-10 Known gaps        │ Your numbers, year 1: A 62,595✓ · B 53,929✓ · C 73,092✓      │
│ M-11 Data, sources     │                                                              │
│ M-12 Your assumptions  │ Engine 0.1.0 · Tax law 2026, later years projected           │
│ M-13 Tickmarks         │ Prices: BEA RPP 2024 (released Feb 19, 2026)                 │
└────────────────────────┴──────────────────────────────────────────────────────────────┘
```

## 9. Visual direction: the workpaper

No frontend-design skill is installed in this environment, so this section follows the
dataviz skill for charts and color: its palette validator ran on the colors below. The rest
follows from the concept.

**Concept.** An audit workpaper: a lead schedule, the supporting schedules behind it, and a
tickmark beside every figure showing how it was checked. The concept fits the audience,
analysts who'll recognize the conventions from Excel models and audit binders. It also fits
the product's claim: the math is shown, and every figure ties out.

**Avoided on purpose:**
- **Warm cream paper with a terracotta accent.** The neutrals are cool ledger grays; the
  offer colors are cobalt, berry and bronze.
- **The hairline-ruled broadsheet.** No editorial serif, no stack of horizontal section
  rules, no newspaper columns. Structure comes from schedules with workpaper references,
  vertical column rulings inside tables (a columnar pad), and tickmarks.
- **SaaS chrome.** No cards with drop shadows, gradients, illustrations or pill buttons.

### 9.1 The signature: audit tickmarks

Every figure in the results, and every default or estimate in the inputs, carries a small
tickmark: a hand-drawn pencil glyph just after the number. The tickmark is the link to the
figure's derivation.

| Mark | Name | Means | Opens |
|---|---|---|---|
| ✓ | Recomputed | Computed from other figures | The arithmetic, each part ticked in turn |
| ^ | Footed | The total of the column above | The column, summed |
| < | Cross-footed | Ties to the same figure on another schedule | Both figures, side by side |
| T | Traced | An input you entered, or published data (BEA, IRS, Census) | The input field, or the source and vintage |
| D | Default | A default you haven't changed | Why it's the default; edit it |
| E | Estimate | Estimated, not entered (rent) | How it was estimated; edit it |

**Look.**
- **Pencil:** tickmarks are drawn in graphite (the secondary ink) as slightly irregular
  pencil strokes, set at 0.75 em.
- **Not a color:** they never take an offer or status color. A fourth hue beside three offer
  colors can't pass the all-pairs check; the validator failed a green and three teals
  against cobalt, berry and bronze. Shape carries the meaning.
- **Hover, focus and open:** the tickmark and its figure get a highlighter wash (light
  `#fff1a6`, dark `#4a4418`).
- **Tracing:** while a derivation is open, every figure it uses wears the same wash wherever
  it sits on the page. Tracing a number means watching its inputs light up.

**Legend.** Every schedule ends with the tickmark legend, as on a real workpaper, and M-13
explains the marks at length. A setting can hide tickmarks for a cleaner read. The figures
then keep a dotted underline, so they're still links.

**Accessibility.**
- **A real control:** each tickmark is a `<button>` labeled "How 62,595 was worked out
  (recomputed)", with a 24 px hit target from padding.
- **Keyboard:** within a schedule, arrow keys move between tickmarks (a roving tabindex),
  and Tab moves between schedules. A page full of figures doesn't become hundreds of tab
  stops.
- **Popover:** Escape closes it and returns focus to the tickmark. The popover is a dialog
  with its own tickmarks for drilling down.

**Print.** Tickmarks print, and the legend prints on each schedule, so a printed comparison
reads like a ticked workpaper.

### 9.2 Color

The offer colors are used for chart marks and the column rule only. Text stays ink, and an
offer's letter always appears beside its color.

| Token | Light | Dark | Use |
|---|---|---|---|
| Page | `#eef1ef` | `#0e1110` | Background: a cool ledger gray, not cream |
| Sheet | `#fcfdfc` | `#161a18` | Schedule and ledger ground; the chart surface |
| Column band | `#f2f5f3` | `#1b201d` | Alternate table columns, as on a columnar pad |
| Ink | `#121815` | `#e8eeea` | Text, totals, focus ring (2 px, 2 px sheet offset) |
| Graphite | `#46504a` | `#b4beb8` | Tickmarks, hints, captions |
| Muted | `#5d6862` | `#8f9a94` | Axis ticks, annotations |
| Rule | `#cdd6d0` | `#2d3531` | Column rulings, gridlines |
| Highlighter | `#fff1a6` | `#4a4418` | Tickmark hover and trace wash (behind ink) |
| Offer A (cobalt) | `#2f5bd0` | `#5f86e8` | |
| Offer B (berry) | `#b5307a` | `#d65596` | |
| Offer C (bronze) | `#8a6a00` | `#b08a1c` | |

**Validation.** `validate_palette.js` ran all pairs, since range rows and small multiples put
any two offers side by side:
- **Light, on `#fcfdfc`:** passes. Worst CVD ΔE 12.4; normal-vision ΔE 22.4; every color at
  least 3:1.
- **Dark, on `#161a18`:** passes. Worst CVD ΔE 13.2; normal-vision ΔE 22.5.
- **Text tokens:** they clear WCAG AA on page, sheet and column band in both modes. The
  lowest is muted on the light page, 5.10:1.

**Status colors.** The dataviz skill's fixed status palette, always with an icon and a label:
good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`.

**Colors follow the offer.** A is always cobalt. Removing B doesn't repaint C.

### 9.3 Type

One family, chosen for figures: **Atkinson Hyperlegible Next** and **Atkinson Hyperlegible
Mono** (Braille Institute, OFL). They're self-hosted via Fontsource, with no third-party
font requests.
- **Why this family:** it was drawn so that easily confused characters stay distinct (0/O,
  1/l/I, 5/S, 8/B). In a product made of numbers, that matters more than style.
- **It's also not a default choice,** unlike the usual geometric sans, or an editorial serif
  with a mono.

| Role | Face | Notes |
|---|---|---|
| Schedule titles and workpaper refs | Next, bold, small caps, tracked | `L-2 · IF THINGS GO BADLY` |
| UI, labels, numbers | Next | Tabular figures (`font-variant-numeric: tabular-nums`) in tables and axes. Checked in the shipped Fontsource files (2026-10-08): Next's digits are proportional by default (widths 407-648 units), and its `tnum` feature makes all ten 632 units wide, the same as Mono. Proportional for the hero figure, which stays in the same face (dataviz rule). |
| Derivations, formulas, the tickmark legend | Mono | |

- **Scale:** 13 / 15 / 17 / 21 / 28 / 40 / 56 px. Body 15/24, tables 13.5/20.
- **Hero figure:** 48-56 px, semibold.

### 9.4 Layout

- **Schedules, not cards or rules:**
  - Each result is a schedule on the sheet color, square-cornered, with no shadow.
  - Its workpaper reference sits as a tab at the top left (`L-2`) and its legend at the foot.
  - Space separates the schedules; there are no horizontal rules between sections.
- **Columnar tables:**
  - Vertical rulings between columns and alternating column bands.
  - Column numbers above the headings, (1) (2) (3), as on a columnar pad.
  - A single rule above a subtotal and a double rule under a total, the only horizontal
    rules.
  - "less" and "plus" rows; parentheses for deductions in the bridge.
- **Offer columns** are headed with a 3 px rule in the offer's color under the letter. It's
  the only large use of color outside the charts.
- **Stamps:** `SAMPLE`, `CLOSE CALL`, `EDITED SAMPLE`. Outlined, Next bold small caps, ink
  on sheet.
- **Grid:** 12 columns on an 8 px base; maximum width 1440 px; 24 px gutters (16 px side
  gutter on phones). Ledger input rows are 36 px; table rows are 28 px.

### 9.5 Charts, motion, dark mode, print

- **Charts** (dataviz method):
  - 2 px lines; markers of 8 px or more with a 2 px sheet ring.
  - Solid gridlines in the rule color; one y-axis, never two.
  - A legend plus selective direct labels, each ticked.
  - A crosshair tooltip on lines, per-mark tooltips on dots.
  - A ticked table view for every chart.
  - Texture fill only for print, `forced-colors` or an accessibility setting.
- **Motion:**
  - Numbers never count up or animate. Live updates must be readable at a glance.
  - The highlighter wash fades in over 120 ms, and stale-to-fresh is a 120 ms fade.
    `prefers-reduced-motion` turns both off.
- **Dark mode:** designed, not inverted: its own steps, validated against the dark sheet. A
  System / Light / Dark switch sits in the footer.
- **Print:** a workpaper stylesheet:
  - every schedule expanded, tables in full, tickmarks and legends printed;
  - offer colors plus texture;
  - the sample flag and data vintages in the footer.

**W3. Detailed mode, equity open** (sample C)

```
│ OFFERS            Quick ○ Detailed ●                                         │
│                     A               B               C                        │
│ ▸ Pay                                                    raises, promotions  │
│ ▾ 401(k)                                                                     │
│ You defer         6% pre-tax      6% pre-tax      6% pre-tax                 │
│ Match             50% of 6%       100% of 4%      50% of all deferrals   ✎   │
│ Vesting           3-year cliff    immediate       immediate D                │
│ ▾ Equity                                                                     │
│ Grants            —               —               $120,000 new-hire      ✎   │
│   ┌ C · New-hire RSUs ───────────────────────────────────────────────────┐   │
│   │ Value at grant  $120,000      Grant date  Jul 13, 2026 D             │   │
│   │ Vesting   [ 5/15/40/40, semiannual after a 1-year cliff ▾ ]          │   │
│   │ Vest dates [ Feb, May, Aug, Nov 15 ▾ ]                               │   │
│   │ Month      12     18     24     30     36     42     48              │   │
│   │ Vests %    5.0    7.5    7.5    20     20     20     20   = 100%^    │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│ Price growth      —               —               0% D  + range              │
│ Refreshers        —               —               $25,000 a year  + range ✎  │
│ ▸ Health                                       premium, out-of-pocket, HSA   │
```

**W9. Phone**

```
┌──────────────────────────────┐
│ OFFER CALC              ☰    │
│ [ A ][ B ][ C ][ + ]         │
├──────────────────────────────┤
│ A · NYC bank    [SAMPLE]     │
│ Salary           110,000     │
│   per year, before tax       │
│ Bonus       by year ▸        │
│ City        New York (NYC)   │
│ Start       Jul 13, 2026     │
│ Rent/mo           3,800      │
│ Detailed ▸                   │
├──────────────────────────────┤
│ L-1 By year …                │
│ L-2 If things go badly …     │
├──────────────────────────────┤
│ C +$487/mo ✓ · stay 4 yrs ▴  │
└──────────────────────────────┘
```

## 10. Tech

- **Stack:** React 19 and TypeScript on Vite, in a new `app/` folder that imports the engine
  from `src/`. Client-side only: no backend, no login. `src/` stays pure and DOM-free.
- **Engine in a Web Worker** (§3.4's timings), via postMessage or Comlink, with the staged,
  cancellable requests from §3.4.
- **State:** one serializable `Session` object:
  `{ schemaVersion, household, offers[], ui: { basis, mode, pricesIn, … }, sample flags }`.
  It's managed with `useReducer` plus context. Immutable state makes undo/redo cheap, and
  that helps when experimenting.
- **Saved locally:**
  - `localStorage`, autosaved (debounced 500 ms) under `offer-calc:v1`, with a schema
    version and migrations.
  - Every read and write is wrapped. Private windows and blocked storage fall back to
    memory and say so.
  - The Data page has "Delete all data".
- **Export instead of URL sharing:**
  - JSON, re-importable and versioned; validated on import, with a summary of what will be
    replaced.
  - CSV for every table, tickmarks included.
  - Print-to-PDF via the print stylesheet.
  - No share links. Offers are salary data, and URLs leak into browser history, server
    logs, chat-app previews and analytics. A file is an explicit act.
- **Hosting:** a static build on GitHub Pages (or Vercel), with hash routing.
  - No analytics and no third-party requests.
  - A strict CSP: `default-src 'self'`.
- **Charts:** hand-built SVG with `d3-scale` and `d3-shape`, not a chart library. That gives
  full control of the dataviz specs and the tickmarks at a small size.
- **Size:** the engine with tax params is about 44 KB of source; the RPP JSON is about
  98 KB. Code-split the methodology page.
- **Today:** the app takes the local date when it loads, and again on focus after midnight.
  It passes that date as `valuationDate`.
- **Accessibility:** WCAG 2.2 AA.
  - Full keyboard use, with tickmarks reached as in §9.1.
  - Labels on every input, with help tied by `aria-describedby`.
  - A table view for every chart.
  - A polite live region announces verdict changes, debounced.
  - No color-only encoding; `prefers-reduced-motion` is respected.
- **Tests:**
  - Vitest: reducers, migrations, the help-coverage test and the metric-registry test.
  - Playwright smoke tests: load the samples and change a salary, and the verdict updates;
    export, import, then the same results; offline use.
  - axe in CI.

## 11. Engine work

**Prerequisites:** all five were built and hand-checked on 2026-10-08, before any UI code.

| # | Item | For |
|---|---|---|
| 1 | Profile `projectScenario`; cache `paramsForYear` first. Report timings before choosing main thread or Web Worker. Done: §3.4. | §3.4 |
| 2 | `breakeven` returns "already ahead by $X" instead of throwing | L-3 |
| 3 | `nextCliff` (roadmap item 7): each offer's cliffs (bonus payouts, vests, cash awards, clawback steps, 401(k) vesting) and the after-tax value of staying until the next one | L-4 |
| 4 | `withholdingShortfall` (roadmap item 5): federal withholding (percentage method on salary, 22% / 37% supplemental) vs the offer's federal income tax, per year, with the April balance | L-5 |
| 5 | `horizonSweep`: winner and per-month margin on every basis for stays of 2-5 years. It needs window hours, per hour, and the per-month annuity, so those come with it. | Lead schedule |

**With the UI slices:**

| # | Item | For |
|---|---|---|
| 6 | Pay per extra hour (needs item 5's window hours) | Lead schedule |
| 7 | Error codes with input paths instead of message-only throws | Inline validation |
| 8 | Samples moved to `src/samples.ts`, shared by the table script and the app. Done with item 1. | §7 |
| 9 | Rent estimate. Done (2026-10-08): HUD FY2027 FMRs, with the BEA-derived fallback anchored at the ACS median | Rent estimate |
| 10 | City picker data: metro → states, the NYC locality, multi-state prompts (`findRppAreas` exists) | Quick mode |
| 11 | (Optional) Rent flip: the rent change that ties, closed form, since the total is linear in rent | Close calls |
| 12 | (Optional) Leave sweep on the COL basis | L-4 |

**Also done before UI code (2026-10-08):** the engine returns numbers and codes, and
`src/format` writes the words. That's faster (a projection takes 2.5 ms) and lets the UI own
all formatting.

## 12. Build plan

**Done:**
- **Engine prerequisites** (§11, items 1-5) and the before-UI items: structured engine
  output, HUD FMRs, the type check.
- **UI slice 1** (2026-10-08):
  - Vite, React and TS in `app/`, with the engine in a Web Worker: debounced, stale results
    dropped. Saved in this browser.
  - Quick mode for 2-3 offers (salary, bonus, city, start date, rent) and About you
    (filing status, expected stay, other wages).
  - The lead schedule: verdict, rank list, basis pipeline, the "if you stay" row, and the
    disagreement line.
  - Samples loaded by default, stamped illustrative, and moved to start next July so PV is
    taken from today.

**Slice 1 versus this design:**
- **Tickmarks:** they show with their legend but don't open derivations yet (slice 3).
- **Phones:** the ledger scrolls one offer at a time instead of tabs, and there's no
  sticky verdict bar yet.
- **Lead schedule:** the close-call stamp shows; the flip line comes with breakeven
  (slice 5).

**Slices:**
1. **Engine prerequisites** (§11, items 1-5), with a review stop and timings.
2. **Shell:** quick mode, About you, the lead schedule, the if-you-stay row, the pipeline
   toggle, local saving, the samples and the first run. Engine items 6-10 come with it.
3. **Explanations:** tickmarks and Show the work, L-1, the bridge and first-use note, and
   methodology v1.
4. **Detailed mode:** every section, with the help text for each.
5. **L-2 and L-3:** the risk view and breakeven.
6. **L-4 and L-5:** leaving early and warnings.
7. **Finish:** export and import, print, an accessibility pass, then deploy.

## 13. Decided in rev 2 (say if you disagree)

1. **A stay of N years is the comparison window, not a leave date.**
   - **Tax:** the last calendar year is taxed as if you kept earning through December, so a
     short stay doesn't get an artificially low final-year rate.
   - **Clawbacks:** ones triggered by leaving at the end of the stay belong to L-4, not to
     the if-you-stay row.
2. **Rent defaults to HUD's Fair Market Rent** (revised after review). The ACS median
   ($1,487, checked against table B25064) anchors only the fallback for areas without an
   FMR.
3. **Tickmarks are graphite, not colored.** Shape carries meaning, and the highlighter wash
   shows tracing. A colored tickmark failed the palette validator against the offer colors.
4. **Pay per extra hour shows a ratio only when the extra hours also pay more.** Otherwise it
   says "more hours for less pay" with the yearly gap.
