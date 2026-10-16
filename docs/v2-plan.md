# v2 plan (proposed 2026-10-13; decisions recorded the same day; the offer breakdown approved 2026-10-15; brought up to date 2026-10-15)

**Status: decided in part, not built.** D1 and D14 are approved (2026-10-13); D2-D15 stand as recommended unless the user comments on
pull request #29 (below, "Decisions"). **Item 5, the offer breakdown (the next section), is approved (2026-10-15): B1-B12 as
recommended, with conditions on B4, B5 and B8 and a rule for labels (B13).** It makes the tool evaluator-first and goes first. Step 0 is
built (pull request #31); nothing else is, and nothing starts until testers have answered each item's questions. What to build after v1
(UI slices 1-8 and Copy as document), in the priority order approved with item 5 (item numbers are stable IDs; before item 5 the order
was 1, 2, 3, 4):
1. **Item 5, the offer breakdown:** every offer's own standalone breakdown is the primary view, and the comparison is a layer that
   appears with two or more offers. Quick mode starts from one offer.
2. **Item 2, market benchmarks:** where each offer's base salary sits among BLS's wage percentiles for its occupation and metro area
   (OEWS, May 2025), as a part of that offer's breakdown.
3. **Items 4a-4c, accuracy, the small parts:** days off, commuting and relocation costs.
4. **Item 3, negotiation help:** what each lever (salary, sign-on) is worth to you, from one offer; L-3's ties once there are two;
   the published wages; an optional draft email. Facts, not advice.
5. **Item 1, beyond the money:** what else each offer is worth to you, in dollars you name, and whether (and at what figure) that flips
   the verdict. Comparison-only.
6. **Items 4d-4f, accuracy, the large parts:** remote work and working across a state line, startup options as scenarios, and Public
   Service Loan Forgiveness.

A fresh session should be able to build an approved item from this file, `CLAUDE.md` and `docs/ui-design.md`.

**Testers first.** Each item has questions to put to testers before it's built ("Questions for testers", below). Record the
answers in `docs/user-testing.md`; each item says which answers would change it.

**Working agreements apply** (CLAUDE.md): a branch and a pull request per review stop, CI green before merging; tests, typecheck,
the engine guard and an unchanged grid before each merge; `npm run build` for UI work; tax-engine changes on their own branch in
separate commits, each with the oracle byte-identical (or the difference explained); live screenshots, light and dark, at each UI
stop.

## 5. Offer breakdown (approved 2026-10-15, with conditions; first in priority)

**Status: approved, not built.** Proposed and approved on 2026-10-15 (pull request #45): B1-B12 as recommended, with the conditions
below on B4, B5 and B8 and a rule for labels (B13), which the rest of this section follows. No code until the audit's items under
"Before stop 5A" are done and the testers' first question is answered.

**The conditions** (the user's review of pull request #45, 2026-10-15):
1. **Own-city dollars stay inside one breakdown (B4).** An offer's own city's dollars are for its breakdown alone. Two offers' figures
   never sit side by side in their own cities' dollars as if they were comparable: wherever they sit together (the ledger's "On its
   own" row, the comparison, any table, chart, print or document with more than one offer), they're in the common reference dollars
   (the prices picked under "Prices in", the U.S. average by default), or the conversion step sits inline beside them ("New York $7,563
   − New York prices $367 = U.S.-avg $7,196"). And every figure says which dollars it's in: an after-rent figure names its place's
   prices on the figure itself ("New York $6,671", "U.S.-avg $7,196"); figures before rent and prices are dollars as paid, and say so
   ("$, as paid"); a column's unit sits in its head, and every figure's accessible name, Show the work title, CSV header and line in the
   copied document carry it.
2. **The sample comparison stays one click away (B5).** The first screen has "See a sample comparison" next to "Start with my offer",
   both in view without scrolling on a phone and on a desktop; one click loads the three samples, compared.
3. **Comparison-only warnings stay with the comparison (B8).** L-5's warnings about one offer fold into that offer's A-6. A warning about
   more than one offer (the comparability warning: a cost or benefit counted for one offer but not another) stays with the comparison,
   under the verdict.
4. **Every rate and share states its period (B13).** "Tax: 32.4% of its pay over your stay", not "tax 32.4%"; "$27.27 of each $100 of
   year-1 pay"; "17% under the base case, over your stay"; "a month over your stay" or "a month in year 1". On the figure's label, and in
   its accessible name, its Show the work title, CSV headers and the copied document.

**Their test** (stop 5A, like `prices.test.ts`): it renders every breakdown part, the "On its own" row, the comparison, the CSVs and the
copied document, and fails on an after-rent figure that doesn't name its dollars, two offers' own-city figures in one row, table or chart,
or a rate or share that doesn't state its period.

**Why.** From user testing (`docs/user-testing.md`): the project's owner, using the tool with a real offer, had only that one, so had
to compare it against a sample, which made the real offer harder to understand (finding 2); two testers had already asked for each
offer's numbers and logic in a document they could read at their own pace (finding 1). The conclusion: the product should be
**evaluator-first**. Every offer gets its own standalone breakdown, and the comparison is a layer that appears once there are two or
more offers. Nothing here changes a figure the engine works out; it changes what one offer can show on its own, and what the page
leads with.

**Today** (checked in the code, 2026-10-15): one offer shows nothing.
- The worker computes only once two offers are complete (`App.tsx`: `compare` is null under two; `horizonSweep` throws under two). The
  lead says "Fill in at least two offers to compare them.", and Copy as document is disabled with the same reason.
- An offer's × shows only while there are three (`Ledger.tsx`), and "Start with my offers" makes two blank offers (`session.ts`).
- Yet nearly everything a breakdown needs is per offer already: the fast lane's `OfferDetail` (your stay's window totals, bear and
  bull, withholding, employment years, tax by calendar year, payments as posted, bonuses and vests), the year figures as shown
  (`footing.ts`), the bridge, L-6's tables, L-4's cliffs and panel, M-9's terms. The breakdown is mostly those, worked out for one
  offer and laid out for one reader.

### What a breakdown holds

One offer, read top to bottom. Its workpaper references are the offer's letter and a part (B9): `A-1` to `A-7` now, `A-8` and `A-9`
when items 2 and 3 arrive, each placed where it reads best (references are stable IDs, as D6 has it). A printed or copied breakdown
cites its parts the way the comparison cites `L-2`. Every figure is ticked, opens its work and foots as displayed, as everywhere.

The sketches are sample A at the samples' fixed dates (start Jul 13, 2026, valued that day, a 4-year stay, 5%, 2.5% inflation), worked
out with the engine on `main` (2026-10-15); `x` is a figure not worked out yet.

**A-1 · The bottom line** (the breakdown's head)
- **A month to spend after rent, plus what you save, over your stay, in today's dollars.** Each is the level monthly amount over the
  stay with the same present value: M-7.2's annuity, over this offer's own stay (B3).
  - **To spend:** take-home − planned savings − rent − expected out-of-pocket health costs.
  - **Saved:** the face-value money: planned savings, your 401(k) and HSA, vested employer 401(k), employer HSA, perks.
  - **Their sum** is the after-rent total at this offer's own prices, which is total rewards − rent (M-6.3's identity at a price
    factor of 1). So there's no new engine arithmetic: the window totals already carry the local spending (`nonHousingLocal`, and the
    out-of-pocket costs) and the face-value money. The total a month is the engine's present value ÷ the annuity factor as shown,
    rounded once; saved likewise; to spend is the difference, so one line takes the rounding, as `shownPv` has it.
- **In this offer's own dollars** (B4): what you'd actually have where you'd live, with no price conversion, which is the comparison's
  step. Each figure names them ("New York $6,671"). When "Prices in" names a city (yours, say), or once there's a comparison to tie to,
  one more line restates the total at those prices with the conversion step inline ("New York $7,563 − New York prices $367 = U.S.-avg
  $7,196 a month over your stay"), so the figure the comparison uses sits beside the own-city one, never in place of it (condition 1).
- **Year 1, as paid:** the same split, nominal, for the first employment year, since a first budget is year 1's, with one line saying
  why the stay's figure differs, from L-1's notes (`yearNotes`).
- **The effective tax rate:** the offer's tax over your stay ÷ its pay, nominal, the tax worked out as everywhere (household tax with
  the offer minus without it). Its help says it isn't your top rate.
- **Per hour worked,** when hours are entered: the after-rent total at its own prices, nominal, ÷ the hours worked in the stay (the
  comparison's per hour, at the offer's own prices).
- **The bad case,** in a line, from A-4: a month over your stay, and how far under the base case, over your stay.

```
 A-1 · A · NYC INVESTMENT BANKING ANALYST · ON ITS OWN                                              [ SAMPLE ]
   Your 4-year stay (Jul 13, 2026 – Jul 12, 2030), a month, in today's dollars at New York prices:
     New York $6,671✓ to spend after rent  +  New York $892✓ saved  =  New York $7,563✓ a month over your stay
   Year 1, as paid: New York $4,647✓ a month to spend after rent + New York $825✓ a month saved, in year 1. Later years
   pay more: the bonus rises each year, and the 2029 promotion (base case).
   Tax: 32.4%✓ of its pay over your stay · Per hour worked over your stay, after tax and rent: New York $22.96✓
   Bear case: New York $6,245✓ a month over your stay, 17%✓ under the base case over your stay
   With a comparison: New York $7,563✓ − New York prices $367✓ = U.S.-avg $7,196✓ a month over your stay
```

(Checked: $6,671.23 + $892.09 = $7,563.32 a month, × the annuity factor 43.5191 = $329,149 of present value, which is A's total
rewards less its rent, each a present value; at U.S. prices it's $313,175, the rank list's figure. Year 1: $55,762 to spend and $9,900
saved, ÷ 12. Tax $265,889 ÷ pay $821,486. Per hour: the after-rent total at New York prices, nominal, ÷ 16,000 hours. The prices
step: $7,563.32 − $7,196.26 = $367.06 a month.)

**A-2 · Where the money goes** (year 1, or any year)
- **Of every $100 paid to you in the year:** tax, rent, health costs (premiums and expected out-of-pocket), saved (your 401(k) and HSA,
  planned savings) and left to spend, to the cent, adding to $100.00. Each part is the year's figure as shown ÷ the year's pay as shown,
  and the money left to spend takes the rounding (the year figures as shown, in `footing.ts`). Each share states its year ("$27.27 of
  each $100 of year-1 pay"), and the bridge's figures are dollars as paid until the after-rent line, which names its prices.
- **Then what the employer adds, outside the $100:** 401(k) money (and how much of it vests by your stay's end), HSA money, perks.
- **A bar with its numbers beside it:** each segment labeled in words, a table view, no color alone.
- **The bridge under it, in dollars** (B7): from the offer letter to after rent, at this offer's own prices, for any year. It's L-1's
  bridge (`bridge()` in `byYearModel.ts`), moved here. With a comparison it keeps its last two lines (the prices line, then after rent
  at U.S. prices, which ties to L-1), so a figure in A-2 and in L-1 is one figure.
- **A negative year** (rent over take-home) shows the money left to spend in parentheses, and A-1 says so in words.

```
 A-2 · WHERE THE MONEY GOES · year 1 (Jul 13, 2026 – Jul 12, 2027), as paid                          [ Year 1 ▾ ]
   Paid to you in year 1: $152,986✓, as paid. Where each $100 of it goes:
     tax                $27.27✓ of each $100 of year-1 pay
     rent               $29.81✓ of each $100 of year-1 pay
     health costs        $2.16✓ of each $100 of year-1 pay
     saved               $4.31✓ of each $100 of year-1 pay
     left to spend      $36.45✓ of each $100 of year-1 pay
                       $100.00^
     [████████████████████████████|█████████████████████████████|██|████|████████████████████████████████████]
   Your employer adds $3,300✓ of 401(k) money in year 1, on top: it vests at 3 years, and you stay 4.

                                                                                $, as paid
   Offer letter: salary + target bonus + sign-on                                190,000T
     less  first bonus is a stub                                                (37,014)✓  paid Jan 31 for Jul–Dec only
   Paid in year 1                                                               152,986^
     less  tax                                                                  (41,724)✓  federal, FICA, NY, NYC
     less  health premiums                                                       (1,800)T
   After-tax pay                                                                109,462^
     plus  employer 401(k)                                                         3,300✓  vested by the end of your stay
     less  expected out-of-pocket health costs                                   (1,500)T
   Total rewards                                                                111,262^
     less  rent                                                                 (45,600)T  $3,800 a month
   After rent, at New York prices                                       New York $65,662^
     = New York $4,647✓ a month to spend after rent + New York $825✓ a month saved, in year 1 (your 401(k) and the match)
```

(Year 1's figures as shown: $152,986 − $41,724 tax − $45,600 rent − $3,300 health costs − $6,600 of your own 401(k) = $55,762 left to
spend. The shares: 27.27 + 29.81 + 2.16 + 4.31 + 36.45 = 100.00.)

**A-3 · Pay by year, and when it arrives**
- **Gross pay by employment year and component:** salary, bonus, sign-on and other cash, stock vests, clawbacks repaid. Stacked
  columns with a table view, the year figures as shown (`shownYears`), so they tie to A-2 and to L-1.
- **When it arrives:** a dated line for each payment that isn't salary (each bonus with the period it's for, each cash award, each
  vest with its grant), from the fast lane's `bonuses` and `rsus` and the awards' dates; salary as a monthly figure. It answers "a
  sign-on in August, a first bonus in January for half a year, then each January's bonus".
- **The year's notes,** as L-1's (`yearNotes`): a promotion, new-hire RSUs finishing.
- Gross and as paid, not on the comparison's selected basis: that's L-1, across offers.

**A-4 · Terms that can bite**
- **The terms, in words:** each bonus condition (its pay date and period, whether you must be employed on the payout date, a cutoff, a
  guaranteed first payout); each clawback window (in full or in part, until when); each vesting cliff (the first RSU vest, the employer
  401(k) money's vesting). From the inputs: M-9's `leaveTerms` (`leaveModel.ts`), extended to the cutoff and the guarantee.
- **The cliffs inside your stay,** dated, each with what leaving the day before costs: a bonus forfeited, a clawback owed, a vest or
  401(k) money left behind (`cliffs()`; L-4's markers and `cliffText`). From the slow lane while A-4 is on screen, about 4-8 ms an offer.
- **The next cliff** from your start (from today, once the offer has started), and what staying until it is worth after tax: `nextCliff`,
  as L-4's panel has it, past a prorated clawback's monthly steps.
- **If you left on a day you pick** (B6): what you'd keep after tax, repay and leave behind, L-4's panel for this offer (the same job,
  `cursorJob`, and with a comparison the same last day as L-4's, so the figures are one figure). L-4's chart stays in the comparison.
- **The bad case:** the bottom line in the bear and bull cases, and what goes wrong in the bear case, generated from the inputs (L-2's
  `caseChanges`, `changeText` and `riskCarriers`, `cases.ts`); with no ranges, "no ranges entered", and where to add one, as L-2 says it.

```
 A-4 · TERMS THAT CAN BITE
   Bonus       Paid each Jan 31, for the year before; you must be employed on the payout date. The first, Jan 31, 2027, is
               for Jul 13 – Dec 31, 2026 only.
   Sign-on     $10,000T, paid Aug 12, 2026; repaid in full if you leave before Jul 12, 2027.
   401(k)      The employer's money vests after 3 years, all at once: leave before then and you keep none of it.
   In your stay  Jan 31, 2027  first bonus, $32,986✓: leave the day before and it's forfeited
                 Jul 12, 2027  the sign-on's clawback ends: work through this day and it's yours
                 Jul 12, 2029  the employer's 401(k) money vests, $x✓: work through this day and it's yours
   Next cliff  …, worth $x✓ after tax to stay until it.
   Bad case    New York $6,245✓ a month over your stay in the bear case, 17%✓ under the base case over your stay; New York
               $8,391✓ a month in the bull case. In the bear case, bonuses are 20% under target and the 2029 promotion doesn't come.
   If you left on [ Jan 12, 2028 ▾ ]: you'd keep $x✓ after tax (as paid), repay nothing, and leave $x✓ of 401(k)
               money behind.
```

**A-5 · What the benefits are worth**
- **By year and over your stay:** the employer's 401(k) money (credited, and vested by your stay's end, with its vesting), the
  employer's HSA money, perks (education, commuter), against health costs (premiums, expected out-of-pocket at your usage, and the
  out-of-pocket maximum as the worst year), and your own 401(k) and HSA contributions.
- **What they add up to:** total rewards − after-tax pay, a year and a month.
- **Not entered, not counted:** a blank plan says so ("No 401(k) entered: not counted. Add it in detailed mode."), as the comparability
  warning does across offers.
- From the year figures as shown (`credited`, `employer`, `hsa`, `perks`, `oop`, `premiums`, `yours`) and the window's `benefits`.

**A-6 · Tax, and warnings**
- **Tax by calendar year:** the offer's tax and its rate, each rate with its year ("x% of its 2027 pay"), by kind (federal income tax, FICA, state, city), projected law marked. From
  the fast lane's `taxYears`, with no slow job.
- **Withholding against what you'll owe:** L-5's cash-timing estimate (`withholding`), with what to set aside for April.
- **Every warning for this offer** over your stay, by kind (changes your numbers, not modeled, cash timing), each with "Show at the
  field": L-5's lines (`warningWords`, `warningKinds`, `warningAt`), for this offer. L-5 then retires (B8). A warning about more than
  one offer, the comparability warning, stays with the comparison, under the verdict (condition 3).

**A-7 · The work** (collapsed until "Show the tables")
- L-6's four tables for this offer, as they are: the employment years as numbered lines, your stay's totals, every payment with its
  formula and tax, each calendar year's tax with and without the offer. L-6 moves here and retires as a reference (B8); its CSVs keep
  their contents under the new names (`A-7-employment-years`, …). The payments come from the slow lane's `paymentsJob` while it's
  open, as now.

**Copy as document, for one offer**
- With one offer, "Copy as document" copies its breakdown, about 2 pages, for someone who's never seen the tool: the bottom line in plain
  English; where the money goes (the $100 and year 1's bridge); pay by year and when it arrives; the terms that can bite; the benefits;
  tax by year; the offer as entered; the assumptions. As today's document: no tickmarks or references, every total adding up as
  displayed, every calculation it states in `worked` (`copydoc.test.ts`), the samples flagged first and last.
- With two or more (B10), the button offers a choice, as "Print…" does: the breakdown of the offer shown, the comparison (today's
  document), or both. In "both", each breakdown comes in turn under its own heading, every after-rent figure naming its dollars, and the
  comparison's tables that set offers side by side (year 1's bridges among them) stay in the common dollars, with the prices line
  (condition 1).
- **Print** follows: the summary prints each offer's A-1 to A-6 and A-7 without its list of every payment, then the comparison; the full
  workpaper adds every payment, as now.

### How it's reached

**A section of the one page, one offer at a time** (B2). Inputs and results stay together (§2), and the methodology and the Data page
keep their routes.

```
 ONE OFFER (desktop)                                         TWO OR MORE
 ┌ About you ──────────────────────────────────────┐        ┌ About you ───────────────────────────────────────────┐
 ├ Offers ────────────┬ A-1 · A on its own (pinned)┤        ├ Offers ──────────────────────────┬ L · Lead (pinned) ─┤
 │            A       │ New York $ a month, stay:  │        │            A       B       C     │ C leaves you about │
 │ Salary  110,000    │ 6,671 spend + 892 saved    │        │ Salary  110,000  80,000  105,000 │ $487 a month more  │
 │ …                  │ = 7,563; year 1 as paid: … │        │ …                                │ than A …           │
 │ + Add an offer     │ Tax 32.4% of pay over stay │        │ On its own (U.S.-avg $, a month) │                    │
 │   to compare       │                            │        │          7,196   4,510   7,683   │                    │
 ├────────────────────┴────────────────────────────┤        ├──────────────────────────────────┴────────────────────┤
 │ A-2 Where the money goes  A-3 Pay by year       │        │ THE OFFERS, ONE AT A TIME          [ A | B | C ]      │
 │ A-4 Terms  A-5 Benefits  A-6 Tax  A-7 The work  │        │ A-1 … A-7 for the offer chosen                        │
 └─────────────────────────────────────────────────┘        │ L-1 By year · L-2 · L-3 · L-4: the comparison         │
                                                            └───────────────────────────────────────────────────────┘
```

- **With one offer:** About you; the ledger with one column; beside it, pinned where the verdict goes, A-1, so the answer stays in view
  as you edit; under the columns, A-2 to A-7, full width. No offer switch and no comparison.
- **With two or more:** the pinned column is the verdict (L), as now. The ledger gains a foot row, "On its own", with each offer's
  bottom line under its own column: a month over its own stay, in the common dollars (the prices picked, "U.S.-avg $" by default), never
  its own city's, since the row sets offers side by side (condition 1). Each figure is ticked, its work steps from the offer's own-city
  figure to the common one, and it links to its breakdown. Under the columns: the breakdown
  section, one offer at a time behind an A | B | C switch, then the comparison's L-1 to L-4, loading as you scroll toward them, as now.
- **The offer chosen** is one state for the phone's ledger tabs and the breakdown's switch (`ui.offerTab`, already saved), so on a phone
  the offer you're editing is the breakdown under it. "Edit it" from a breakdown's figure opens its offer's tab and field, as now.
- **Breakdown before comparison,** since it's the primary view. A breakdown is long, so A-2 to A-6 are compact, each part's detail behind
  its own "Show …" (as L-6's tables are), and the section's head has "Skip to the comparison" when there is one.

**Why not the alternatives:**
- **A page per offer** (`#/offer/A`): inputs and results would split across pages (or the ledger would repeat on each), the breakdowns and
  the comparison couldn't print or copy as one, and each switch would be a route change with focus to manage. A URL per offer isn't
  something the design wants anyway (§10: no share links).
- **Tabs that replace the comparison** (A | B | C | Compare): the verdict would be out of view while you edit an offer, and print would
  open every tab anyway.

**Relation to the comparison's schedules: each fact lives in one place.** An offer's own figures are worked out in its breakdown; the
comparison adds only what lies between offers (gaps, winners, ties, what would flip the verdict) and cross-foots (`<`) its per-offer
figures to the breakdowns.

| Today | In this model | Why |
|---|---|---|
| L: verdict, rank list, if-you-stay row, pipeline winners, pay per extra hour, close call, rent note, comparability warning | Stays (comparison) | Between offers. The rank list's figures cross-foot to each breakdown's line at the prices picked (A-1) |
| L-1: the chart and table of every offer by year | Stays (comparison) | Across offers, on the selected basis |
| L-1: the bridge | Moves to A-2 (B7) | One offer and one year. With a comparison it keeps its prices line, which ties to L-1 |
| L-2: who holds up best, the range chart, the winner in each scenario | Stays (comparison) | Between offers |
| L-2: what goes wrong in the bear case, per offer | Moves to A-4; L-2's sentence keeps naming who has most to lose | One offer's inputs |
| L-3: what it would take | Stays (comparison) | A tie is between offers. Item 3 adds each lever's value with one offer (A-9) |
| L-4: the chart over every offer by date, one last day | Stays (comparison) | One date across offers. Its panel for one offer is A-4's "if you left on", the same job and state |
| L-5: warnings | Each offer's warnings into its A-6; L-5 retires (B8) | They're about one offer. A warning about more than one (the comparability warning: a cost or benefit counted for one offer but not another) stays with the comparison, under the verdict (condition 3) |
| L-6: the work | Into each breakdown as A-7; L-6 retires (B8) | Already one offer at a time |

Retired references (L-5, L-6) aren't reused, as with any stable ID.

**When starts differ.** A breakdown runs over its offer's own stay, from its own start (B3), so adding an offer never changes another's
breakdown. The comparison runs, as decided, from the earliest start, so a later start counts as lost days. Where they differ, the
comparison's figure for that offer shows the step in its work: "B on its own (A-1, Aug 3, 2026 – Aug 2, 2030), less what falls after the
comparison's window ends (Jul 12, 2030), = B in the comparison `<`", like L-6's stay rows (the years, less what runs past your stay).
Employment years are the same in both; only the stay's totals differ. The samples share a start date, so for them the two are one.

**The view models it reuses** (each already per offer, so a figure in a breakdown and in the comparison is one figure):
- `footing.ts` (`shownYears`, `shownStay`): every year figure, in A-1's year 1, A-2, A-3 and A-5.
- `byYearModel.ts`: `bridge` (A-2, given an option to end at the offer's own prices) and `yearNotes` (A-1, A-3).
- `cases.ts`: `windowValue`, `caseChanges`, `changeText`, `riskCarriers`, `hasRanges` (A-4's bad case).
- `leaveModel.ts`: `leaveTerms`, `cliffText`, `segmentText`, `forfeits` and the panel's words (A-4).
- `warningKinds.ts`, `warningWords.ts`, `warningAt.ts` (A-6).
- `workpaper.ts`: `yearTable`, `stayRows`, `paymentYears`, `taxTables` (A-6's tax by year, A-7).
- `summary.ts` and `copyDoc.ts`' `vestingText` (A-4's terms, the document's offer as entered).
- `verdict.ts`' `shownFactor` and `monthOf` (A-1's months), and `derive.ts`, `metrics.ts` and `sections.ts`, extended with the
  breakdown's figures.
- **New:** `breakdownModel.ts`, A-1's and A-2's figures (the local split, the $100's shares, the rate, per hour), shared with `derive.ts`,
  `csv.ts` and `copyDoc.ts`, as each schedule's view model is.

**The worker:** a per-offer job in the fast lane, run for every complete offer whether or not there's a comparison: its own stay's
projection (base, bear, bull), its withholding, its own window's annuity terms, and the pieces `stayDetail` builds today (`OfferDetail`).
- The worker remembers each offer's job by its inputs, About you, the stay and today, so an edit to B re-projects B alone.
- With two or more offers the comparison reuses each breakdown's projections where the windows match (every offer that starts on the
  earliest start date), and projects again only for a later start, unless B11.
- `horizonSweep` runs only with two or more offers.

**The engine:** nothing new for A-1 to A-7. The window totals carry the local split; `cliffs`, `nextCliff`, `withholdingShortfall` and
`annuityFactor` already take one offer and any window. One candidate (B11): `projectScenario` returning totals for several windows from
one projection, so a later-starting offer's own stay and the comparison's window don't cost two projections.

### Quick mode from one offer

- **One offer is enough.** The ledger holds one to three offers; × removes any offer while two or more remain; "+ Add an offer to
  compare (up to 3)" sits under the last column. "Start with my offer" makes one blank offer A, not two. A one-offer session is a valid
  schema-3 session, so nothing migrates (an older build would show it as "Fill in at least two offers…", and save it unchanged). The Data
  page's import already accepts one offer.
- **A first-time visitor** (B5) sees sample A alone, as a breakdown: the ledger's one column, A-1 pinned beside it, A-2 to A-7 below. The
  banner: "Sample offer: illustrative inputs, not market data. [Start with my offer] [See a sample comparison]", the two side by side
  and both in view without scrolling on a phone and a desktop (condition 2); one click loads the three samples, compared.
  - **Why A:** there's something in every part: a stub first bonus, a sign-on with a full clawback, a 401(k) cliff at three years, New
    York City's tax, rent near 30% of pay, a promotion that the bear case drops, 80-hour weeks.
  - **The alternative** keeps today's three samples. They show the comparison's point (the after-rent flip), but they open on three
    offers that aren't the visitor's, which is finding 2's problem.
- **Filling in your offer:** quick mode's fields as now (salary, bonus, city, start date, rent with its `E` estimate). Until the offer is
  complete, the pinned column says what's missing ("Add a salary, a city and a start date to see A on its own"); the moment it's complete,
  A-1 fills in. The first-use note for the after-rent figure comes with A-1 ("This is much less than the salary on purpose: it's what's
  left to spend after tax and rent, plus what you save. [See where the money goes] [Got it]"), pointing to A-2.
- **Adding a second offer brings in the comparison.** + adds column B, blank. A's breakdown doesn't change (B3). Once B is complete:
  - the pinned column becomes the verdict, and the live region says the verdict's sentence once;
  - A's bottom line moves to the ledger's "On its own" row, the breakdown section gets its A | B switch, and L-1 to L-4 appear under it;
  - nothing else moves, and focus stays where it was.
  Removing offers back to one reverses it: the comparison goes, and focus moves to the remaining offer's A-1 heading.
- **The bars:** with one offer, the phone's bottom bar and the tablet's top bar show A-1's figure with its dollars ("A New York $7,563 a month · stay 4 yrs");
  with two or more, the verdict, as now.
- **Samples in this model:** a sample is an offer like any other, with its breakdown, stamped wherever it appears (§7's rules don't
  change: `SAMPLE`, `EDITED SAMPLE`, the exports' first line and `-sample` names, chart captions). "See a sample comparison" loads all
  three (the footer's "Reload the samples" does too). A sample is never offered as something to compare your own offer against: that's
  what finding 2 had to do. Published wages (item 2) are the honest context for one offer.

### v2's other items in this model

- **Market benchmarks (item 2) move into the breakdown,** as `A-8 · Published wages`, after A-3. The occupation picker lives there, per
  offer; the range, the placement words, the caveats, the data and the tests stand as written in item 2. It still never enters a figure,
  a total or a tie (D1). With a comparison there's nothing more to add: each offer's range is in its own breakdown. L-7 isn't built, and
  D6 falls away.
- **Negotiation help (item 3) moves into the breakdown too, and works with one offer,** as `A-9 · What a change would be worth`, after
  A-6:
  - with one offer: what each lever adds to the bottom line, as facts ("Each $1,000 of starting salary is worth $x a month to you over
    your stay, after tax and rent; it also raises your bonus and match"; "Each $1,000 of sign-on is worth $x after tax, paid Aug 12, and
    is repaid if you leave before Jul 12, 2027"), each worked out from one projection with the lever moved, in the slow lane while A-9 is
    on screen;
  - with two or more: L-3's ties for this offer join it, and the published wages from A-8, as planned;
  - the draft email, the wording rules and their test stand as written.
- **Beyond the money (item 1) stays comparison-only** (B12). Its point is whether your values flip the money verdict, and with one offer
  there's no verdict to flip; adding your values to one offer's figures would put them in the money figures, which D1 rules out. Its row
  group shows with two or more offers; values entered stay saved if an offer is removed.
- **Accuracy (item 4) feeds the breakdown with no new layout:** days off and commuting time into per hour (A-1); commuting's cost into
  A-2 (a "getting to work" share of the $100); relocation into year 1 (A-2, A-3); startup options into A-3 and A-4's bad case; Public
  Service Loan Forgiveness beside A-1. It also matters more here: in a comparison, an error common to every offer (two weeks off assumed
  for each) partly cancels out, but in one offer's bottom line nothing cancels. Hence 4a-4c move up.

### Re-ranked priority (approved 2026-10-15)

Item numbers are stable IDs; the order is separate.
1. **Item 5, the offer breakdown** (this section), with quick mode from one offer and §1's new wording.
2. **Item 2, market benchmarks,** as A-8: the context a one-offer evaluator lacks (finding 2), still context only.
3. **Items 4a-4c, days off, commuting and relocation:** small, and a standalone bottom line has nothing to cancel their errors.
4. **Item 3, negotiation help,** as A-9: lever values from one offer, ties from two.
5. **Item 1, beyond the money:** comparison-only, so it waits for the comparison's users.
6. **Items 4d-4f:** large, and each still set by the testers' answers (D10).

**Before stop 5A:** the audit's "fix before v2" items this item leans on (`docs/audit-2026-10.md`; IDs prefixed "audit" where they'd
read as this plan's decisions). Each is done, so 5A waits only on the testers' first question. The audit's other open "fix before v2"
items (T1, D3, D4) don't block it; CLAUDE.md's "Now" lists them. `scripts/lib/plan.test.ts` keeps this table and CLAUDE.md
agreeing.

| Audit | What item 5 needs from it | Done |
|---|---|---|
| P1-P4 | The stylesheet and the worker reported, the worker budgeted, the first answer's time marked, CLS and TBT gated, one chunk enforced: the gates the bundle plan below relies on | #47 |
| T2 | The tests on frozen tax law, so the new tests don't pin sample outputs a data refresh moves | #46 |
| T5 | The defaults test sees what it checks, as the breakdown shows every default as a value with its `D` | #55 |
| H1 | The hooks linter, before the breakdown's stateful parts (its switch, A-4's last day) | #56 |
| D7 | The two design docs this item changes, marked historical | #57 |
| D8 | This plan, brought up to date | #58 |
| D1 | Per hour documented as the code works it out (the after-rent total), since A-1's per hour opens M-5.4 | #60 |

### The scope change: §1, evaluator-first

`docs/ui-design.md` §1 today says the user holds two or three offers, and its jobs start with "Which offer leaves me better off,
honestly?" D1 (approved) already revised its "not the job" lines for v2. The wording, approved with B1, replacing §1 whole at stop 5A (rev 4):

> ## 1. Audience and job
>
> **Who.** A new grad or early-career analyst (0-3 years out) with a job offer, often on a deadline: exploding offers give one to three
> weeks. Many hold a single offer; some hold two or three at once.
> - **Finance-literate:** knows what a bonus, an RSU and a 401(k) match are. Not a tax expert.
> - **Often moving:** the offer is in a city they don't live in yet (New York, Charlotte, Seattle).
> - **Often unlike pay:** a bonus-heavy banking offer, salary plus RSUs in tech, steady corporate finance.
>
> **What the tool is: an evaluator first.** Every offer gets its own breakdown, and that's the primary view: what the offer pays out, year
> by year, after tax and rent and per hour worked; what its terms can cost you; and the work behind every figure. Comparison is a layer
> that appears when there are two or more offers. It adds the verdict and what lies between the offers: the gaps, the winner on each
> basis, what would tie, what would flip it. It never replaces an offer's breakdown, and an offer's breakdown never depends on the others.
>
> **The principle: the tool informs the decision and shows its work; you make the call.**
>
> **Context.** Laptop first: one sitting of 10-20 minutes, then return visits as an offer changes (a negotiated sign-on, a recruiter's
> new number) or another one arrives. Phone second: checking an offer's bottom line or the verdict, or showing someone.
>
> **Jobs, in order.** For any offer:
> 1. **What would I actually have?** A month to spend after rent, plus what I'd save, in today's dollars (A-1).
> 2. **Where does the money go?** Tax, rent, health costs, savings (A-2).
> 3. **When does it arrive?** Pay by year and component, with the dates (A-3).
> 4. **What can bite?** Bonus conditions, clawback windows, vesting cliffs, the bad case (A-4).
> 5. **Can I trust this?** Every figure's tickmark opens its work.
>
> With two or more offers, the comparison adds:
>
> 6. **Which leaves me better off, honestly, and by how much?** The verdict, per month, not "$21,182 of present value".
> 7. **Does it depend on how long I stay, or on things going badly? What would it take for another offer to win? What would leaving
>    early cost under each?** The if-you-stay row, L-2, L-3, L-4.
>
> **Not the job:**
> - Telling you which job to take, or whether an offer is good. Career fit is yours: values you set (beyond the money) are added up,
>   never suggested.
> - Market data as a verdict. Published wages are context, traced to their source, never an input to a figure, a total or a tie.
> - Financial advice.
>
> The methodology page and the footer say this once, plainly.

With it, at rev 4: the masthead's tagline ("Job offers worked out the way they'd pay out: after tax, after rent and prices, per hour, year
by year, and compared side by side when you have more than one") and the first page's name in the navigation ("Offers", not "Compare").

### Methodology

- **M-1, the pipeline,** for one offer first: gross → after tax → total rewards → after rent, at the offer's own prices → per hour. Then
  "Comparing offers": every offer restated at one place's prices (the U.S. average by default), the step only the comparison needs. Its
  worked example is A's year-1 bridge, ending in New York dollars, then the prices line.
- **New, M-1.1, where every $100 goes:** the shares, the money left to spend taking the rounding, and what's outside the $100.
- **M-4:** the effective tax rate (the offer's tax ÷ its pay; with the offer minus without; why it isn't your top rate).
- **M-6.3:** the identity at the offer's own prices (a factor of 1: total rewards − rent), and why the breakdown uses it.
- **M-7:** the breakdown's stay (its own start) against the comparison's window (the earliest start), with the step between them; A-1's
  months (M-7.2's annuity over its own stay).
- **M-9:** the next cliff from your start, and the fuller terms list.
- **M-12** lists each offer's assumptions, and the live numbers (M-1, M-6.3, M-7.2, M-8, M-9) follow the offer shown and work with one
  offer (today `res()` throws under two).
- **M-13:** the references `A-1` to `A-9` beside `L` and `M`.
- At each stop, the methodology says what the code does (audit D3).

### Bundle and LCP (within budget)

**Where it stands** (2026-10-15, `main` at #54; `npm run check-bundle`, and CI's `npm run lighthouse`): the main thread 365.6 / 111.7 kB
raw / gzip for a quick-mode visit, one chunk, against 120 kB: 8.3 kB of room. The worker 68.1 kB gzip against its 75 kB budget. LCP 1.87 s
(the median of five; single runs 1.86-2.38 s) against 2.5 s; its element is About you's assumptions line, painted before the worker
answers. The first answer, observed unthrottled, 1.29 s.

- **Main thread: at most 0.5 kB gzip for the item,** v2's rule 1. What has to be there: the one-offer session rules (× and +, "Start
  with my offer"), the breakdown section's slot, the ledger's "On its own" row, and the bars' one-offer text.
- **A-1, the head, loads beside the worker, not in the main chunk.** Its chunk (an estimated 1-2 kB gzip) is requested at start, in
  parallel with the worker, whose answer it can't render before anyway, so it should add no time to the first figures; 5A measures that
  it doesn't delay the worker's first answer on Lighthouse's throttled profile. Like every lazy schedule it imports `figures.tsx`, never
  `Tickmarks.tsx` (the one-chunk rule, which `check-bundle` and `scripts/lib/imports.test.ts` enforce: audit P4, #47).
- **A-2 to A-7:** one lazy chunk (an estimated 8-12 kB gzip), loaded as you scroll toward the section, as L-1 to L-6 are. A-7 is L-6's
  chunk, moved. A-8 and A-9 come with items 2 and 3, in their own chunks.
- **Copy as document for one offer:** in its chunk (an estimated 3-4 kB more gzip).
- **The first visit gets lighter:** one sample and one ledger column on the page, no `horizonSweep` in the worker, and no L-1 to L-4 to
  load until a second offer.
- **LCP:** the LCP element doesn't change. A-1 holds its place at about its own height until its figures come, as L-1's place is held,
  so nothing shifts when it fills (CLS at most 0.02, gated since audit P3). The time to the first answer (audit P2's mark, "first-answer",
  `Lead.tsx`) marks whichever paints first,
  A-1 or the verdict, reported at each stop.
- **The worker:** one-offer visits skip `horizonSweep`; remembering each offer's job means an edit projects only the offer edited. A
  later-starting offer in a comparison costs a second set of projections (base, bear and bull: about 8 ms) unless B11. `npm run bench`
  gains "one offer's breakdown" and "an edit to one of three offers", side by side with `main`. The worker grows by under 2 kB.
- **Print:** the summary grows by each offer's A-1 to A-6, an estimated 2-3 pages an offer; the stop reports the samples' pages.

### Accessibility

- **The offer switch** is a tab list, as the phone's tabs are: arrow keys, Home and End choose; one Tab stop; each tab names its offer;
  the section's heading names the offer shown ("A · NYC investment banking analyst, on its own").
- **Headings:** the breakdown is an `h2` and each part an `h3`, so a screen reader's list of headings reads as its contents.
- **The $100 bar:** each segment labeled in text, a table view, no color alone (graphite fills with labels: these parts aren't offers,
  so offer colors don't apply), the drawing hidden from screen readers beside its text.
- **The live region:** with one offer it says A-1's sentence ("A leaves you about New York $7,563 a month over your stay, after rent:
  $6,671 to spend and $892 saved, in today's dollars at New York prices.") a second after the last result, only when it changes; when the comparison appears, its verdict
  once. Not on the first load, as now.
- **Focus:** removing offers down to one moves focus to A-1's heading; adding a second offer doesn't move it; "Edit it" from any
  breakdown figure works as now.
- **The bars** keep WCAG 2.4.11's guards with their one-offer text.
- **Tickmarks:** every new figure has a kind, a methodology section and a derivation (`metrics.test.ts`) and foots as displayed
  (`display.test.ts`, extended to the breakdown and to sessions of one offer).
- **The scan's new states:** one offer (quick and detailed), each part open, each tab, the "On its own" row, the comparison appearing,
  in every project (desktop, phone, tablet; light, dark). P5's decision about dimmed figures applies to the breakdown's too.
- **The NVDA walkthrough** gains a part for one offer and one for the switch, before launch.

### Review stops

| Stop | What | Needs first |
|---|---|---|
| 5A | One offer works: one is the minimum, "Start with my offer", the worker's per-offer job (its own stay, remembered by its inputs), A-1 pinned with one offer and its derivations, the live region and bars with one offer, the ledger's "On its own" row, the comparison appearing and going, M-1 and M-7, §1's wording into `docs/ui-design.md` rev 4, the conditions' label rules (1 and 4) and their test. Live screenshots, light and dark, of one offer and of three | B1-B13 (approved 2026-10-15), the audit items above, the testers' first question |
| 5B | A-2 to A-6 and A-7 (L-6 moved), L-5 folded in, the bridge moved; the comparison's cross-foots and the step between windows; CSV names; print; M-1.1, M-4, M-6.3, M-9 | 5A |
| 5C | Copy as document for one offer, and its choice with two or more; the first visit's single sample, with "See a sample comparison" beside "Start with my offer" (condition 2); the scan's new states; the NVDA walkthrough's new parts | 5B |

Each stop: `npm run check-bundle` (the main thread at most 0.5 kB more over the three), `npm run lighthouse` (the LCP element
unchanged, CLS at most 0.02), `npm run bench` side by side with `main`, and the grid unchanged (no engine change unless B11, which goes
on its own branch under the engine's rules).

### Questions for testers

Ask before 5A, ideally while the tester has their own offers in front of them, and record the answers in `docs/user-testing.md`. Open
questions first; show a sketch only after.
1. **When you used it, how many offers did you actually have?** And how many did you expect, by when?
2. Before a second offer came, what did you want to know about the first?
3. What in your offer letter worried you, or didn't you understand (a clawback, vesting, the bonus's terms)?
4. Shown the bottom line ("$6,671 a month to spend after rent, plus $892 saved, in today's dollars, over 4 years"), what do you take
   "today's dollars" to mean? Would you plan around that, or around year 1's figure as paid?
5. Would you want an offer's figures in its own city's dollars, or restated in a place you know?
6. Would you share one offer's breakdown with anyone (family, a mentor, a friend at the firm)? As a document, a print, or something
   else?
7. Shown the sketch: which part would you read first, and which would you skip?
- **Would change it:** most testers arrive with two or more offers (then the first visit keeps the three samples, B5); "today's dollars"
  isn't understood (then year 1, as paid, leads A-1, and the stay's figure follows); testers think in a place they know (then the
  breakdown follows "Prices in", B4).

### Decisions (item 5): approved 2026-10-15

B1-B12 as recommended, at the user's review of pull request #45, with conditions on B4, B5 and B8 (at the top of this section); B13
was added at the same review.

| # | Decision | Decided | The alternative (not taken) |
|---|---|---|---|
| B1 | The product's scope (`docs/ui-design.md` §1) | Evaluator-first, worded as above, keeping D1's principle | Comparison-first, with a breakdown as one more schedule |
| B2 | How a breakdown is reached | A section of the one page, one offer at a time (A \| B \| C); A-1 pinned when there's one offer | A page per offer (`#/offer/A`); or tabs that replace the comparison |
| B3 | A breakdown's stay | Its own start, for your stay; the comparison shows the step to its window when starts differ | The comparison's window once there is one (a breakdown would change when another offer is added) |
| B4 | A breakdown's prices | **With a condition:** its own city's dollars within one breakdown, with one line at the prices picked (the conversion inline) once they're a city or there's a comparison; wherever two offers' figures sit together, the common dollars or the conversion inline; every figure names its dollars (condition 1) | Follow "Prices in" everywhere (the U.S. average by default) |
| B5 | The first visit | **With a condition:** sample A alone, with "See a sample comparison" one click away, next to "Start with my offer" on the first screen (condition 2) | The three samples, as now |
| B6 | Leaving early with one offer | A-4's "if you left on", L-4's panel for that offer (the same job and last day); L-4's chart stays in the comparison | L-4 shows with one offer too |
| B7 | The bridge | Moves to A-2, ending at the offer's own prices, with the prices line when there's a comparison | Stays in L-1; A-2 shows the $100 alone |
| B8 | L-5 and L-6 | **With a condition:** folded into each breakdown (A-6, A-7), the references retiring; a warning about more than one offer (the comparability warning) stays with the comparison (condition 3) | Stay as schedules of their own, shown with one offer too, with the breakdown pointing to them |
| B9 | References | The offer's letter and a part: `A-1` … `A-9` | One prefix with the offer after it (`O-1.A`) |
| B10 | Copy as document with two or more offers | A choice: the offer shown, the comparison, or both | The comparison only, as now |
| B11 | Two windows for a later start | A second set of projections, unless `npm run bench` shows it matters; then `projectScenario` returns several windows' totals (an engine change, on its own branch) | The engine change from the start |
| B12 | Beyond the money | Comparison-only | Per offer too (values beside A-1, never in it) |
| B13 | Labels (added at review) | Every rate and share states its period, on screen, in accessible names, derivations, CSVs and the copied document (condition 4) | — |

**With stop 5A:** `docs/ui-design.md` rev 4, with its status note (audit D7, #57) saying what's still historical: §0 (a row for
evaluator-first), §1 (as above), §3.1's map and §3.2's layouts (the breakdown section, A-1 pinned, the "On its own" row), §3.3 (quick
mode from one offer), §4 (the breakdown's parts; L-5 and L-6 into it; the bridge into A-2), §7 (the first visit), §8 (the methodology),
§10 (copy and print), §12 (stops 5A-5C), and the conditions' rules where they belong (§2's principles, §9's labels); CLAUDE.md (Now,
the docs index) with it. `docs/nvda-walkthrough.md` before launch.

## What v2 changes about the product's scope

`docs/ui-design.md` §1 says what the tool isn't for: market data or salary benchmarks; telling you which job to take ("we compare
money, time and prices; career fit is yours"); financial advice. Items 1-3 move those lines. **Approved (D1, 2026-10-13), on this
principle: "The tool informs the decision and shows its work; you make the call."** Nothing in v2 recommends a job or says an offer is
too low. In practice:
- **Career fit stays yours.** Item 1 adds up values you set. The tool never suggests one, and the money verdict and L-1 to L-6 stay
  money (L-3's ties too, unless you choose otherwise: D4).
- **Market data is context, never an input.** Item 2's percentiles never enter the verdict, a total or a tie. They're published data,
  traced (`T`) to BLS, with their definitions and limits beside them.
- **Still not advice.** Item 3 restates figures the tool already has: what would tie, and where that sits among published wages. It
  never says what to ask for, and the draft is text you edit and send yourself.

`docs/ui-design.md` rev 4 records the new §1, with the principle, at the first v2 stop, now 5A (item 5, approved 2026-10-15), which
rewords §1 further (evaluator-first, keeping this principle: item 5, "The scope change"). Each item's design follows as
it's built.

## Performance plan (every item)

**Where it stands** (2026-10-15, `main` at #54). The commands print these; each stop reports them.
- **Main thread:** 365.6 / 111.7 kB raw / gzip for a quick-mode visit (`npm run check-bundle`), one chunk, against the 120 kB budget:
  8.3 kB of room. Step 0 took it from 117.35 to 109.69 kB (2026-10-13); changes since, mostly the audit's fixes, added 2.0 kB. The
  stylesheet, render-blocking too, is 47.6 / 10.4 kB, reported and not budgeted.
- **LCP:** 1.87 s in CI (`npm run lighthouse`: mobile, a discarded warm-up, the median of five; single runs 1.86-2.38 s; performance
  98), against 2.5 s. You've seen about 2.2 s, so this plan works to that: about 0.3 s of room. The LCP element is About you's
  assumptions line, which renders before the worker answers, so LCP follows the main chunk's and the stylesheet's download and parse,
  not the engine. CLS 0 and TBT 42 ms, each gated (at most 0.02 and 200 ms), and the late-fonts pass holds the font swap's CLS at 0.
- **What the main chunk held** (2026-10-13, before step 0; attributed through a source map; each piece gzipped on its own, so the pieces
  add to more than the whole): React, react-dom and the scheduler about 64 kB, over half; the city list (`cities.json`, 434 places) 6.5
  kB; the app's own code about 47 kB, led by `App.tsx` 5.3, `Lead.tsx` 3.8, `ByYear.tsx` 3.8, `model.ts` 3.7, `metrics.ts` 3.5 and
  `help.ts` 3.1.
- **Worker:** 255.8 / 68.1 kB raw / gzip, against a 75 kB gzip budget (`check-bundle`). Off the LCP path, but it sets when the first
  answer appears: 1.29 s observed in CI.

**The rules:**
1. **Nothing new on the main thread but entry points.** Each item's code loads on first use, in a chunk of its own or an existing lazy
   one (as L-2 to L-6, detailed mode, the derivations, CSV, print and Copy as document do). Each item's data loads where it's used: the
   worker, or a same-origin fetch. The target is at most 0.5 kB gzip on the main thread per item, reported at each stop.
2. **Make room first** (step 0: its own pull request, before item 1, no change on screen). Aim for 6-9 kB gzip back. **Built (pull
   request #31, 2026-10-13): 117.35 to 109.69 kB gzip (−7.66), one chunk; LCP 1.95 s to 1.87 s side by side; nothing on screen
   changed.** As planned, with one addition: L-1's place is held at about its own height until its code arrives, or the schedules below
   it came near the screen and loaded at once.
   - **L-1 and the bridge load as you scroll toward them,** as L-2 to L-6 do: they sit under the two columns, far below the first screen
     on a phone (Lighthouse's profile) and near its foot on a desktop; the stop checks the LCP element doesn't change. About 5-7 kB:
     `ByYear.tsx`, L-1's and the bridge's view models (out of `metrics.ts`), and
     `footing.ts` if the lead doesn't need it. Watch the chunk rule (a lazy schedule imports `figures.tsx`, never `Tickmarks.tsx`; check
     `grep -c modulepreload dist/index.html` is 0), print (Print… loads every schedule already; Ctrl+P prints what's loaded, as for L-2
     to L-6), and the scan's L-1 states.
   - **Quick mode's ⓘ help loads on first open,** as detailed mode's `helpText.ts` does; the hints stay. About 2 kB.
   - **Held in reserve:** the city list (6.5 kB) off the main thread. It names places synchronously in the ledger, About you, every
     after-rent label (`prices.ts`) and the model's states, so the session would have to carry the chosen places' names and states.
     More change than the two above, for when they fall short.
   - **Considered, not proposed:** Preact in place of react-dom (about 55 kB less). React 19's APIs (`flushSync` in print), the tests'
     `react-dom/server` and every accessibility behavior would need proving again: a project of its own.
   - The budget stays 120 kB.
3. **LCP is measured at every stop** (`npm run lighthouse` locally, and in CI), and `check-bundle` also prints the stylesheet's size
   (reported, not budgeted; built, #47). A feature's CSS is a few rules; anything bigger goes with its chunk.
4. **Time to the first verdict** joins the Lighthouse report: a `performance.mark` when the first verdict paints, read from the trace.
   Reported, not a gate, until there's a baseline. It's what item 4's engine work (a bigger worker, more per edit) would move. **Built
   (#47):** the "first-answer" mark (`Lead.tsx`), 1.29 s observed in CI on 2026-10-15.
5. **Data is never in a JavaScript chunk.** Item 2's OEWS files are static JSON fetched on demand, one per occupation, from a path that
   carries the vintage, cached as immutable (`vercel.json`). The CSP already allows it (`connect-src 'self'`).
6. **The fast lane's per-edit time** (`npm run bench`, side by side with `main`) at every stop that adds to it. Item 1 adds a closed form
   (microseconds); item 4 adds projection work.

**The estimate for v2 in all:** about 1 kB gzip more on the main thread (item 1 about 0.3 kB, item 2 about 0.2, item 3 none, item 4
under 0.3), against the 6-9 kB step 0 frees, so the main thread ends lighter than today and LCP no worse. Everything else (an estimated
15-20 kB gzip of new lazy chunks, plus OEWS's JSON) loads only when it's used.

## 1. Beyond the money

**With item 5 (approved 2026-10-15):** comparison-only (B12). The row group shows with two or more offers, and the rest stands as written.

**The job:** "A pays less, but I'd learn more there." Today the tool says career fit is yours and stops there. This lets you put your
own dollar figure on what else each offer is worth to you, and shows whether that's enough to flip the money verdict, and at what
figure it would. The tool does the arithmetic; the values are yours. (It's the even-swaps half of roadmap item 4, and it covers
roadmap item 3's remote-work valuation without a default: "Flexibility" is a factor you value yourself.)

**Scope**
- **Factors:** up to six, each a name and, per offer, a value a year, positive or negative; a blank is $0. Suggested names, one click
  each: Career growth, Team and manager, Stability, Brand, Flexibility. Any other name is fine.
- **What a value means** (its help): "What would you give up a year, in after-tax pay, to have this at this offer?" In today's dollars.
  Only the differences between offers matter, and the help says so.
- **Where you enter them:** a "Beyond the money" row group at the foot of the ledger, in quick and detailed mode alike, closed until
  first used ("+ Beyond the money: what else each offer is worth to you"). Offers are columns, as everywhere in the ledger; on a phone,
  the chosen offer's tab.
- **Not in scope:** suggested values, weights or scores; values in L-1, L-2, L-4, L-5 or L-6; ranges on values.

**The arithmetic** (engine, `src/offer/compare.ts`: numbers only)
- **A value is a level stream:** the value ÷ 12 at each month's end, from the offer's start to the end of the comparison window (your
  stay), rising with the inflation input at each anniversary of the offer's start (so it keeps its value in today's dollars, as rent
  does by default), discounted like every payment. Not taxed and not priced: it's in your own dollars, so it counts at face value, as
  savings do (D5).
- **`valueFactor(offer, window, valuationDate, discountRate, inflation)`:** the present value of $1 a year paid that way. For the
  samples at their fixed dates (start Jul 13, 2026, 4 years, 5%, 2.5%) it's 3.7592, against the per-month annuity factor's 43.5191.
- **With your values:** each offer's total on the selected basis, plus each value × that offer's factor. The lead with them, per month,
  is the gap ÷ the annuity factor, as the verdict's is.
- **Where it flips** (closed form, like `rentFlipFrom`): for each offer X behind the money winner W, the values a year at X that would
  tie W, with W's as entered: (W's total + W's values' present value − X's total) ÷ X's factor. Shown as a difference ("$5,635 a year
  more at A than at C") when the two start the same day, otherwise as X's total needed. An offer starting after the window has no time
  to count them ("noTime").
- **What each factor carries:** the winner with each factor left out in turn ("Without Career growth, C leads again").
- **Cost:** one sum of 24-60 terms per offer in the fast lane; no projection, no bisection. No money figure changes, nor the grid.
- **Hand-checked edges:** the day before and the day of an anniversary, a later start, an offer starting after the window, negative
  values, every value blank.

**In the verdict** (the lead schedule). The money verdict stays the hero, the bars' text and the live region's sentence (D3). Under the
disagreement line, once any value isn't blank:

```
 BEYOND THE MONEY · your values, a year, in today's dollars           A          B          C
   Career growth                                                 10,000T          –      2,000T
   Team and manager                                                    –      3,000T     1,000T
 Counting them, A leads C by about $118 a month✓.
 It flips at $5,635✓ a year more at A than at C; your values put A $7,000✓ ahead.
 Without Career growth, C leads again.
```

The samples at their fixed dates (4 years, after rent at U.S. prices), with example values: C's money lead over A is $21,182 of present
value, so a tie takes $21,182 ÷ 3.7592 = $5,635 a year; $7,000 a year is worth $26,314, so A leads by $5,132, or $118 a month.
- Every figure is ticked, with its derivation (M-14); the values are `T`.
- **Per hour:** a flip isn't defined per hour (nor is breakeven), so the block says so and uses the figures per hour divides (the
  after-rent total), as L-3 does.
- **Unchanged:** the if-you-stay row, the sticky bars, L-1 to L-6. L-2 stays money only, and says so when values are entered.

**L-3** stays money only at first. At stop 1A you choose (D4) whether to add a switch that counts your values in L-3's ties ("the salary
that ties, counting what else it's worth to you"): `breakeven` with a constant added to the target, the same bisection.

**In the copied document:** a section after "What would change the answer": the values as a table, the totals with them, where it
flips, what each factor carries, and "These are your values, not figures the tool worked out." The answer gets one sentence. Every
calculation is in `worked` and checked by `copydoc.test.ts`.

**In the methodology:** M-14, Beyond the money: what a value means; how it's counted (the stream, inflation, discounting, no tax or
prices); why it stays out of the money figures; the flip and the leave-one-out test; and a pointer: career growth you expect to see as
pay is better entered as raises or promotions (detailed mode), where it's taxed and priced. M-1 mentions the block; M-12 lists your
values.

**Also:** print (with the lead); the session and JSON export at schema 4 (`household.beyond`: names, and values keyed by offer letter;
v3 sessions and files migrate with none); help for every new input (`help.test.ts`); the import review names them; the scan (the block,
the rows open, a phone's tab).

**Bundle and LCP:** the ledger's closed row and the lead's slot on the main thread (about 0.3 kB gzip); the rows, the block and their
words in a lazy chunk (an estimated 3-5 kB gzip), loaded on first open, or at start when the session has values; the derivations in
their chunk. The block renders when the worker answers, as the verdict does, so LCP doesn't move.

**Risks**
- **Read as the tool's opinion.** The block says "your values", nothing is suggested, and the hero stays money.
- **Double counting.** "Career growth" often means faster raises, which are money; the help and M-14 point to raises and promotions.
- **False precision:** a $118 lead from guessed values. Where it flips sits beside the result, so a guess is weighed against the figure
  that matters.
- **Three offers:** the flip is against the money winner, offer by offer, as in L-3.

**Review stops**
- **1A:** `valueFactor` and the flip in the engine, the fast lane, the ledger's rows, the lead's block, derivations, M-14, the session
  and export. Live screenshots.
- **1B:** the copied document's section, print, the scan's states, and L-3's switch if chosen.

## 2. Market benchmarks (BLS OEWS, May 2025)

**With item 5 (approved 2026-10-15):** this becomes `A-8 · Published wages` in each offer's breakdown, after A-3, rather than L-7 after L-3, so it
works with one offer, and D6 falls away. The picker, the range, the placement words, the caveats, the data and the tests stand as written.

**The job:** "Is $110,000 a good offer for this?" Testers look it up elsewhere and come back. This puts each offer's base salary
against published wages for its occupation where you'd live, with what those figures do and don't cover said beside them. Context
only: it never enters the verdict, a total or a tie (D1).

**Scope**
- **A new schedule, L-7 · Published wages,** right after L-3 on the page (D6: references are stable IDs, so L-7 sits where it reads
  best; its last part is item 3's summary). It loads as you scroll toward it, like L-2 to L-6.
- **The occupation picker,** in L-7, per offer: a search over BLS's occupation titles (and alternate job titles, if the data allows;
  see Data), saved with the offer. It lives in L-7, not the ledger: it changes no money figure, and the ledger stays the money's inputs.
  Nothing is picked for you.
- **Per offer, the range first** (decided 2026-10-13): BLS's full range for that occupation in the offer's metro area, the 10th to
  the 90th percentile annual wage, labeled "all experience levels", with the 25th, 50th and 75th as ticks inside it and the offer's
  starting base salary marked on it in its offer color. The median isn't singled out: it's one tick among five. Then one sentence:

```
 L-7 · PUBLISHED WAGES                          BLS, May 2025 · base salary · all experience levels
   A  Financial and investment analysts · New York metro area                                  [ Change occupation ]
      All experience levels: $xx,xxxT (10th percentile) to $xxx,xxxT (90th)
        10th     25th        50th              75th              90th
        ├─────────┼─────────────┼─────────────────┼─────────────────┤
                                    ◆ A $110,000T
      A's $110,000 falls between the xxth and xxth percentiles of that range.
```
  (A layout sketch: the figures come from BLS's files at stop 2A. For scale, BLS's query system gives this occupation's May 2025 median
  in the New York-Newark-Jersey City metro area as $128,930, which is why the range, not the median, leads: a first job's salary set
  against a median of every experience level reads as a verdict it isn't.) Each published figure is `T`, traced to BLS with its table,
  area and vintage; the sentence is ✓, with its comparison as the derivation. A table view and its CSV, as L-1's and L-2's.
- **Neutral placement words, not an invented percentile:** "falls between the 25th and 50th percentiles", "falls under the 10th
  percentile", "falls at or over the 90th percentile". Never "below market", "above market", "low", "high", "underpaid", "competitive"
  or the like (decided 2026-10-13); item 3's wording test covers L-7 too. No interpolated "62nd percentile": BLS publishes five points,
  and a figure between them would be ours, not theirs.
- **Entry-level pay isn't characterized** (decided 2026-10-13). L-7 says nothing about where entry-level pay usually falls unless a
  verified source supports it, such as a state labor agency's published entry-wage method (several publish an "entry wage" from OEWS
  data); stop 2A may look for one, and without one the tool doesn't say it. The caveats say only what BLS says.
- **What's compared:** the starting base salary only (D7). BLS's wages leave out year-end bonuses, stock and benefits (below), so the
  offer's bonus, RSUs and the rest stay in the money comparison, where they belong.
- **The caveats, always shown under the strips** (short, each linking to M-15, which quotes BLS):
  1. **Every experience level.** BLS: the survey "does not gather demographic information", and its data "do not contain information
     about pay according to the level of work performed"; trainees are counted in the occupation they're training for. So the
     percentiles run from new hires to people decades in.
  2. **What BLS counts as wages:** "straight-time, gross pay, exclusive of premium pay": base pay, cost-of-living allowances, guaranteed
     pay, commissions, production bonuses and tips. Not overtime, on-call or shift pay, severance, nonproduction bonuses (BLS's FAQ
     lists year-end, holiday and profit-sharing payments, relocation allowances and stock bonuses), or benefits. Signing bonuses
     aren't mentioned; BLS's benefits survey classes hiring bonuses as nonproduction, so they're out too (our inference, said as one).
     Hence base salary.
  3. **A year is 2,080 hours.** BLS works annual wages out as hourly × 2,080 (except for occupations paid by the year), and part-time
     workers are in the survey; a 70-hour week's salary isn't comparable hour for hour.
  4. **Where the job is:** an establishment's own location, so metro figures are by workplace; the offer's city here is where you'd live.
  5. **When:** May 2025, pooled from six surveys over three years (November 2022 to May 2025, about 1.1 million establishments), the older
     ones brought forward by BLS's own wage-aging factors. Offers starting in 2026-2027 will usually sit higher against them.
  6. **Occupations are broad,** and set by duties, not titles: "financial and investment analysts" spans banking and corporate finance.
- **Where data is missing:** BLS withholds some estimates ("Estimate not released") and some high percentiles for high-paying
  occupations. A missing metro figure falls back to the state, then the nation, and says which. From May 2025, BLS publishes many high
  percentiles as figures where it used to print "$239,200 or more"; where a cap remains, it shows as BLS shows it.
- **No precision beyond BLS's:** BLS publishes relative standard errors only for employment and the mean, not for percentiles, and asks
  for care with small differences; so the words stay coarse ("between the 25th and 50th percentiles"), and nothing averages
  percentiles (BLS: it "does not recommend calculating averages of percentile wages").

**Data**
- **Source:** BLS Occupational Employment and Wage Statistics, May 2025 estimates, released May 15, 2026 (USDL-26-0725; later than
  BLS's usual late March or early April, after the fall 2025 shutdown slowed collection). Three of the downloads on BLS's OEWS tables
  page: `oesm25nat.zip` (national), `oesm25st.zip` (states) and `oesm25ma.zip` (metropolitan and nonmetropolitan areas), each an
  xlsx. BLS's HTML query system shows only means and medians for May 2025; the other percentiles are in these files. BLS data are in
  the public domain; BLS asks to be cited ("Bureau of Labor Statistics, U.S. Department of Labor, Occupational Employment and Wage
  Statistics", with the date accessed), and M-15 and the copied document do.
- **Verified from BLS's pages (2026-10-13):** the release, the wage definition, the 2,080 hours, who's covered, the panels and aging,
  the area definitions, the end of the old top-code, the occupations. **Still to verify at stop 2A,** from the files' "Field
  Descriptions" sheet: the field names, the markers for withheld and capped figures, and any cap still in force.
- **`npm run fetch-oews [-- --file <zip> …]`,** like `fetch-fmr`: three requests, spaced, with a User-Agent that names the project and a
  way to reach it (BLS's robot policy may block robots that "do not contain information that can be used to contact the owner", and
  any that call "multiple times per second"), and `--file` with copies downloaded in a browser if it's blocked anyway. It reads the xlsx
  with `scripts/lib/zip.ts`.
- **What it writes** (D8): `app/public/oews/2025-05/index.json` (each occupation's code and title, plus alternate titles if used) and
  one file per occupation (`13-2051.json`: national, each state, each metro area: employment and the five percentiles, with markers),
  each with its source and vintage inside, like `fmr.json`. Served from the site, fetched by L-7 when an occupation is picked, cached
  as immutable (the path carries the vintage). Stop 2A reports the files' sizes.
- **Matching areas:** the offer's city is a BEA area, by CBSA code, on OMB Bulletin 23-01's delineations (`rpp.json` says so). OEWS has
  used the same 2020-census delineations since May 2024, with no NECTAs in New England and no metropolitan divisions (New York is the
  whole New York-Newark-Jersey City MSA), so metros should match by code; the script proves it. OEWS's 135 nonmetropolitan areas are its
  own groups of counties within a state, which BEA's "outside metro areas" places don't line up with, so those use the state's figures.
  About 530 areas in all (394 metropolitan). The script reports every area it can't match, and a test fails if a city in the list has
  neither a match nor a stated fallback.
- **Occupations:** about 830 in OEWS (2018 SOC, some combined). BLS's 2018 SOC Direct Match Title File maps over 6,500 job titles to
  single occupations ("financial analyst" and the like); whether to include it in the picker's index is for stop 2A, by its size and
  the testers' answers. BLS classifies by duties, not titles, and the picker's help says so.
- **Refresh:** yearly, when BLS publishes the next May's estimates (usually late March or early April; the May 2026 estimates have no
  date yet). Added to `docs/data-refresh.md`.

**Tests:** the parser on a small fixture; the area match for every city in the list; the placement words at the edges (a salary equal to
a percentile, under the 10th, over the 90th, a top-coded 90th, suppressed percentiles); L-7's figures in `metrics.test.ts`; the copied
document's section; the scan (an occupation picked, the picker open, a fallback to the state, a phone).

**In the copied document:** a short section, "Published wages": each offer's occupation, area, the range (all experience levels) and
placement sentence, the five figures, and the caveats in one paragraph. **In the methodology:** M-15, Published wages: the source and
vintage, BLS's definitions quoted, the caveats at length, the area match and fallbacks; M-11 lists the dataset.

**Bundle and LCP:** L-7's slot on the main thread (about 0.2 kB gzip). L-7, its picker and words in a lazy chunk (an estimated 5-7 kB
gzip). The title index is fetched when the picker first opens and an occupation's file when it's picked (sizes at stop 2A). The worker
doesn't change. L-7 is far below the first screen, so LCP doesn't move.

**Risks**
- **Misreading:** percentiles of every experience level can make a new grad's offer look low. The biggest risk: hence the range first,
  labeled, the neutral words and their test, and the testers' answers (question 3), which decide whether the item ships.
- **The wrong occupation:** SOC titles are broad and unfamiliar. Alternate titles help; testers will show whether they're needed.
- **Area mismatch:** where you'd live vs where the job is, and BEA vs OEWS areas. Stated, and tested city by city.
- **The scope line** (D1): once the tool shows published wages, people may read them as "what you should be paid". The wording never
  says so, and never says an offer is too low.
- **BLS blocks scripts:** `--file` covers it, as for HUD.
- **Repository size:** several hundred small JSON files a year. Stop 2A measures it; the alternative is one compact file split at build.

**Review stops**
- **2A, the data:** `fetch-oews`, the files and their sizes, the area match report, BLS's definitions verified and quoted, and the
  samples' occupations and metros printed (`npm run offers` gains a published-wages table). No UI.
- **2B, L-7:** the picker, the ranges, the caveats, the table view and CSV, M-15, the copied document, print, the scan. Live screenshots.

## 3. Negotiation help

**With item 5 (approved 2026-10-15):** this becomes `A-9 · What a change would be worth` in each offer's breakdown. With one offer it says what each
lever (starting salary, sign-on) is worth to you after tax and rent; with two or more, L-3's ties for that offer join it, as below. The
draft email, the wording rules and their test stand as written (item 5, "v2's other items in this model").

**The job:** L-3 already says what would tie ("A: starting salary $110,000 → $118,626"). Someone about to negotiate wants that in a
form they can use, beside where the figure sits among published wages, without the tool telling them what to do.

**Scope**
- **A summary,** the last part of L-7 ("Putting it together"), for each offer behind the winner, and the winner's cushion:

```
 PUTTING IT TOGETHER · what would tie C · after rent at U.S. prices · 4 years
   A  A starting salary of $118,626✓ (+$8,626✓, +7.8%) would tie C, or a sign-on of $45,487✓ instead of $10,000T.
      For financial and investment analysts in the New York metro area, BLS's range across all experience levels (May 2025)
      is $xx,xxxT to $xxx,xxxT; $118,626 falls between its xxth and xxth percentiles.
      Counting what you said the rest is worth, A already leads C.                          (only with item 1's values)
   These are what would make the offers even on the numbers you entered, not advice on what to ask for.
                                                                                            [ Draft an email… ]
```
  (The ties are W7a's, the samples at their fixed dates; the values line is item 1's example; the range comes with stop 2A's data, as in
  L-7's sketch. Where the values don't already put an offer ahead, the salary that ties counting them needs L-3's switch, D4.)
- **The draft email** (optional): "Draft an email…" opens an editable text box, filled from a template, with brackets for what the tool
  can't know ([Recruiter's name], [Company], [Your name]). You pick what it mentions: the gap to your other offer, in words; the salary
  that ties; the sign-on that ties; BLS's range (off by default); the other offer's own figures (off by default: those are yours to
  share or not). "Copy" puts it on the clipboard as
  plain text. Nothing is sent or saved, and there's no `mailto:` link: the design keeps salary figures out of URLs (§10's "no share
  links").
- **Its sentences are factual, in the first person:** "After taxes and rent, the other offer comes out about $487 a month ahead for me.
  A starting salary of $118,626 would make the two about even." Never "deserve", "market rate", "below market", "underpaid", "you
  should", "ask for". A test fails on a list of such words in the summary, the template and L-7, as `check-engine.ts` guards the engine.
- **Basis:** the summary follows the verdict's basis; the email speaks in starting salary and sign-on, the levers a recruiter knows, and
  names the basis in words ("after taxes and rent"). Per hour: the figures per hour divides (the after-rent total), as L-3.
- **Without an occupation:** no published-wages sentence; the summary is L-3's ties alone. Built before item 2 (D9), the summary is L-3's last
  part instead of L-7's, and moves to L-7 when L-7 arrives.

**Data:** nothing new: L-3's ties (the slow lane's `tieJob`, shared), L-7's figures, item 1's values.

**Bundle and LCP:** the summary in L-7's chunk (or L-3's; about 1 kB); the template and the box in a chunk of their own, loaded by "Draft an
email…" (an estimated 2-3 kB gzip). Nothing on the main thread; LCP unaffected.

**Risks**
- **Read as advice.** The biggest. The wording rules and their test, the line under the summary, and a draft you edit word by word.
- **The tie isn't an ask.** A recruiter may meet a tie halfway, or not at all; the summary says "would tie", never "ask", and doesn't
  imply the tie is a floor or a target.
- **Disclosure:** the other offer's details are off by default.
- **Negotiability isn't knowable:** analyst pay at banks is often set for a whole class. The summary never claims a figure is
  negotiable.
- **A stale draft:** once copied, text doesn't follow later edits. The box shows the inputs' state it was made from, and "Start over"
  refills it.

**Review stop:** one (3A), after item 2's 2B (or after item 1, without item 2): the summary, the draft, the wording test, M-7.4's addition,
the clipboard in the smoke tests, the scan.

## 4. Accuracy

Seven parts, each its own pull request, in this order (D10): the two small ones that feed "per hour of your life" first, then
relocation, then the large ones. The order is meant to be reset by the testers' answers. 4g, Philadelphia's wage tax for commuters,
was added to the backlog on 2026-10-15, unranked: it's small and its engine is built, so the testers' answers (question 4) place it.

| Part | Size | Engine | Main thread |
|---|---|---|---|
| 4a Days off | Small | `hours`: vacation and holidays in place of weeks | 0 (detailed mode) |
| 4b Commuting | Small-medium | a monthly cost, and hours | 0 (detailed mode) |
| 4c Relocation | Small | a dated cost; reimbursements as wages | 0 (detailed mode) |
| 4d Remote work and working across a state line | Large | tax engine: nonresident tax, credits, sourcing | 0 (detailed mode) |
| 4e Startup options | Medium-large | an option grant, exit scenarios, its tax | 0 (detailed mode) |
| 4f Public Service Loan Forgiveness | Large, volatile | loans, payment plans, AGI by year | under 0.3 kB (a closed About-you row) |
| 4g Philadelphia's wage tax for commuters | Small | none: the nonresident rate is in (`resident: false`) | 0 (detailed mode) |

Every part's inputs live in detailed mode (a lazy chunk, 14 kB gzip today), or for 4f behind a closed row in About you that loads its
inputs on first use, so none adds more than an entry point to the main thread. Each grows the worker and may grow the fast lane's
per-edit time, so each stop reports `npm run bench` side by side with `main` and the time to the first verdict.

### 4a. Days off

- **Today:** "weeks a year", default 50 (`D`, "two weeks off"), feeds hours and per hour. Offer letters and people count time off in
  days, and two weeks is short of what's typical: BLS's National Compensation Survey (March 2026, USDL-26-1534) has private-industry
  workers with paid vacation averaging 11 days after a year's service (16 after five), and paid holidays averaged 8 days in 2025.
- **Scope:** per offer, in the Hours section, in place of weeks: "Vacation days you'd take" and "Paid holidays". Weeks worked = 52 −
  (vacation + holidays) ÷ 5. "Unlimited" PTO: the days you expect to take, and the help says so.
- **Defaults** (D14, approved): BLS's figures, 11 and 8 (`D`, each with its source, editable), so 48.2 weeks. That's honest but moves every default per-hour
  figure about 4% (and pay per extra hour), once, explained in the stop's notes; `npm run offers`' hours and the hand-checked per-hour
  tests move with it; the grid doesn't. The alternative keeps one "days off" input at 10, today's 50 weeks, and moves nothing.
- **Not in scope:** sick days (BLS: 7 a year on average in private industry; usage is personal), and paying out unused vacation when
  you leave. Payout is required in some states where the employer offers vacation (California, Lab. Code §227.3; Massachusetts; Illinois;
  Louisiana; Rhode Island after a year; Nebraska; North Dakota; Maine, for vacation accrued from 2023; Colorado and Montana, by case law
  and guidance). L-4 names it as "not modeled" for an employer in those states, rather than guess an accrual.
- **Engine:** `hours.vacationDays` and `hours.holidays` beside `weeksPerYear` (one or the other), validated, in `docs/offer-model.md`.
  JSON exports carry them; older files keep their weeks.
- **Bundle:** detailed mode's chunk; a few lines in the worker.
- **Risk:** small, apart from the one-time move in per-hour figures (D14).

### 4b. Commuting

- **Why it matters here:** the tool's claim is "per hour of your life". An hour on a train is an hour of it, and a car costs money.
- **Scope,** per offer, in a Commute section of detailed mode: days a week in the office, minutes each way, and the cost: by car (miles
  each way × a cost per mile, plus parking and tolls a month) or a monthly transit pass. Blank means not counted, and the comparability
  warning names it when only some offers have it.
- **How it counts:**
  - **Money:** an after-tax cost (commuting isn't deductible: IRS Pub. 463), like expected out-of-pocket health spending: it comes off
    total rewards, and after rent it's local spending, priced through the non-housing factor (M-6.3).
  - **The 132(f) benefit, fixed while we're here:** 2026's limits are $340 a month for transit and vanpools and a separate $340 for
    parking (Rev. Proc. 2025-32 §3.16); the engine has one input capped at $340, a known gap. 4b splits it in two, each against its
    limit. (Bicycle commuting reimbursements are gone for good: Pub. L. 119-21 §70112 repealed the exclusion from 2026.)
  - **Time:** commuting hours join hours worked in per hour, labeled ("per hour worked and commuting"), when every offer has a commute
    (D15).
- **The cost per mile is yours to enter,** with no default (no misleading defaults). The help gives the published figures and what each
  covers:
  - the IRS business rate for 2026, 72.5¢ a mile through June 30 and 76¢ from July 1 (Notice 2026-10; Announcement 2026-11, for the
    price of fuel), of which 35¢ is depreciation: owning the car, not just running it;
  - the IRS medical and moving rate, 20.5¢ then 23.5¢, "based on only the variable costs";
  - AAA's Your Driving Costs 2026: fuel 17.3¢ and maintenance, repair and tires 11.7¢, 29.0¢ to run a car (86¢ a mile in all at 15,000
    miles a year). A car you'd own anyway costs its running costs; one bought for the commute costs the lot.
  Stop 4b re-reads these, since the IRS changed its rate mid-year.
- **Engine:** a monthly piece in `benefits.ts` (like out-of-pocket), hours in the window, the two 132(f) inputs; `docs/offer-model.md`.
- **Bundle:** detailed mode; a few lines in the worker.
- **Risks:** small; office days are shared with 4d.

### 4c. Relocation

- **Today:** a relocation payment can be entered as a cash award (taxable, with its clawback). The move's own cost can't.
- **Scope:** per offer, "Moving costs" (what the move costs you: movers, travel, a broken lease, a deposit you won't get back), paid at
  the start, after tax; and how the employer helps: a lump sum (the cash award, as now), reimbursements, or payments to the movers. All
  of them are wages (W-2 boxes 1, 3 and 5; income tax withholding, at the 22% supplemental rate, and FICA: the 2026 W-2 instructions
  and Pub. 15 §7), with an optional gross-up when the employer pays the tax.
- **Tax, verified:** moving costs aren't deductible and employer moving payments aren't excluded from wages, permanently from 2026
  (Pub. L. 119-21 §70113, making the 2018-2025 suspensions of IRC 217 and 132(g) permanent), except for active-duty military moving
  under orders and, from 2026, intelligence-community employees moved for an assignment. The tool says so and models neither exception.
- **Not in scope:** part-year residency in the move year (two part-year returns: CLAUDE.md's known gap). A new grad earned little in
  the old state that year (the "other wages" input), so it stays a gap unless testers' moves say otherwise.
- **Bundle:** detailed mode; a few lines in the worker.
- **Risk:** small.

### 4d. Remote work, and working across a state line

- **Today:** you're taxed as a full-year resident of your residence state only; when the employer is in another state with a
  convenience-of-employer rule, there's a warning, and nothing is computed. The bigger gap behind it: a New Jersey resident commuting
  to a New York office owes New York nonresident tax on that pay, with a New Jersey credit for it, and the tool computes neither. For
  the New York metro, the audience's most common case, that understates tax.
- **The rules in 2026, verified:**
  - **Convenience rules in force:** New York (20 NYCRR 132.18(a)), Delaware (30 Del. C. §1124(b)(1); its 2025 Schedule W: a home office
    isn't "necessity" unless the job requires it) and Pennsylvania (61 Pa. Code §109.8); Connecticut (Conn. Gen. Stat.
    §12-711(b)(2)(C)) and New Jersey (P.L.2023, c.125) only for residents of states with a similar rule.
  - **No longer:** Nebraska, from tax year 2025 (Neb. Rev. Stat. §77-2733(8)(c) as amended by LB1023; the 2026 Circular EN: "only the
    compensation paid for services performed within Nebraska"); Alabama says it won't apply one (its Department of Revenue, Aug 25,
    2026); Arkansas repealed its rule in 2021 (Act 1019) and Massachusetts' pandemic rule ended in 2021; Oregon sources by where you
    physically work (OAR 150-316-0165).
  - **The credit, for a New Jersey resident:** Schedule NJ-COJ, the lesser of the tax paid to the other state on income both tax and
    (that income ÷ New Jersey income) × New Jersey tax (GIT-3B, Jan 2026): in effect about the higher of the two states' tax.
  - **Local:** New York City's tax is for residents only (its nonresident earnings tax ended in 1999: notice N-00-7); Yonkers still taxes
    nonresidents' earnings; Philadelphia's wage tax follows the workplace.
  - **Reciprocity:** where two states agree only the residence state taxes wages (New Jersey and Pennsylvania, for one), no nonresident
    tax and no credit.
- **v1's warning was out of date:** `CONVENIENCE_RULE_STATES` (`src/offer/location.ts`) listed Nebraska, so a Nebraska employer raised a
  warning that no longer applied. Fixed on its own, outside v2 (pull request #30, 2026-10-13): Nebraska employers raise none, and a
  Nebraska resident is still warned for a New Jersey or Connecticut employer, since New Jersey's FAQ still names Nebraska. Fixed since,
  from the same FAQ (pull requests #32 and #34, 2026-10-14): New Jersey's rule doesn't reach Pennsylvania residents (the reciprocal
  agreement) or Connecticut residents, nor Pennsylvania's the residents of its reciprocal states, and the tool no longer warns them.
- **Scope:** per offer, days a week in the employer's state (shared with 4b), and whether remote days are for the employer's necessity
  (default: your convenience, the usual case). The engine works out the wages sourced to the employer's state (the days worked there,
  plus remote days under a convenience rule), that state's nonresident tax on them by its own method, the residence state's credit by its
  own limit, reciprocity, and the local taxes above.
- **Which pairs** (D12): the framework is general, but each pair's rules are data with sources and hand-checked tests. First the pairs the
  city list's multi-state metros produce, by population (NY-NJ-CT-PA; DC-MD-VA; PA-NJ-DE; IL-IN-WI; MA-NH; MO-KS; OR-WA; NC-SC; …), each a
  commit. An unsupported pair keeps today's warning.
- **Validation:** the oracle checks residents only, so it can't check this; the 2026 report must stay byte-identical (residents are
  untouched). Each pair gets hand-checked cases worked from the nonresident return and the residence state's credit form (IT-203 and
  NJ-COJ for the first), at the edges: every day in the office, none, a remote worker under a convenience rule.
- **Risks:** the largest engine change since v1. State methods differ, the convenience rule's facts are yours to state, the rules move
  (two states changed theirs in a year, and a federal bill is pending), and there's no oracle. Hence the tax-engine rules in full: its own
  branch, separate commits, tests per pair, the oracle byte-identical, and each state's rule dated and sourced so the data refresh calendar
  can recheck it each January.
- **Stops:** 4d-A, the engine with its first pairs and their tests (`npm run offers` gains a cross-state case); 4d-B, the inputs, L-5's
  warning narrowed to unsupported pairs, M-4's new part, the bridge's tax line by state.

### 4e. Startup options, as scenarios

- **Today:** options and private-company equity (double-trigger RSUs too) count as $0, and the methodology says so.
- **Scope:** an option grant per offer: shares, strike price, ISO or NSO, its vesting (the existing presets and tranches), the plan's
  exercise window after you leave (default 3 months, the statute's limit for ISO treatment, IRC 422(a)(2)), and the company's current
  price per common share (its 409A value). Then an exit per scenario: a date and a price per common share, after preferences. Defaults:
  base and bull at the current price (so a new grant, struck at that price, adds $0: uncertain things default to nothing), bear at $0.
  You enter the upside; L-2 shows what it does.
- **How it counts:** at the exit, vested options are exercised and sold the same day; the gain is (exit price − strike) × vested shares.
  - **NSO:** wages at exercise (IRC 83; W-2 boxes 1, 3 and 5), so income tax, FICA and withholding.
  - **ISO sold the same day:** a disqualifying disposition, reported as wages in box 1 but not FICA wages (IRC 3121(a)(22)), with no
    withholding required (IRC 421(b)); so the cash-timing warning (L-5) names it. ISOs beyond the $100,000 a year first exercisable
    (IRC 422(d)) are NSOs.
  - **Why a same-day sale:** exercising and holding ISOs creates an AMT adjustment, and the engine has no AMT (2026: a $90,100 exemption
    for a single filer, phasing out at 50% from $500,000, permanent under Pub. L. 119-21 §70107). Out of scope, and said. QSBS (IRC 1202)
    needs stock held from exercise, so a same-day sale gets none.
  - Double-trigger RSUs take the same exit, taxed as wages at it.
- **Your stay** (D11): an exit inside it counts, in its scenario. Most exits come later, and pay after your stay isn't counted. The
  proposal: vested options at your stay's end show beside the verdict, per scenario ("if C's exit is Jun 2031 at $8 a share: $x after
  tax, not counted"), and L-4 says leaving means exercising within the window or losing them. The alternative, counting them at the exit's
  value, would be the one exception to the stay rule, and needs the exercise's cost (and AMT for ISOs held) modeled.
- **Data:** none beyond tax rules, cited above from IRS Pub. 525 and the code; stop 4e-A re-reads Form 6251's instructions on a
  same-year sale.
- **Risks:** speculative upside dominating a verdict (hence the defaults and the scenarios); preferences and dilution hidden in "price per
  share" (the help asks for the common price); ISO exercise-and-hold and AMT (out of scope, said).
- **Stops:** 4e-A, the engine (the grant, the exit events, the tax by type, hand-checked at a vest and the exit); 4e-B, the inputs, L-2's
  words for an exit, L-4's warning, M-3.

### 4f. Public Service Loan Forgiveness

- **Why it's last:** it's large, the law is moving, and it doesn't fit the window. Forgiveness comes after 120 qualifying monthly
  payments (ten years) while working full-time for a qualifying employer (government at any level, 501(c)(3) organizations, some other
  nonprofits), past any stay the tool compares; what you'd owe at the stay's end depends on staying in public service after it.
- **The law as of 2026-10-13, verified:**
  - **The Repayment Assistance Plan** (20 U.S.C. 1087e(q), Pub. L. 119-21 §82001), from July 1, 2026: a yearly payment of a share of all
    of your AGI by band ($120 a year up to $10,000; 1% from $10,001, a point more for each $10,000, up to 9%; 10% over $100,000), less
    $50 a month per dependent, at least $10 a month. Its on-time payments count toward PSLF. It needs only AGI, which the tax projection
    already has.
  - **Which plans you can use:** loans first disbursed from July 1, 2026 have RAP or the Tiered Standard Plan (which doesn't count toward
    PSLF); existing borrowers keep IBR, and ICR and PAYE end by July 1, 2028; SAVE ended (a court order of March 10, 2026).
  - **Tax on forgiveness:** PSLF is excluded from federal income (IRC 108(f)(1), by its standard reading); other income-driven
    forgiveness is federally taxable again from 2026 (Pub. L. 119-21 §70119). States mostly follow; sources disagree on a few (Mississippi
    the likeliest exception), so the tool would say "check your state".
  - **Employers:** the Department of Education's 2025 rule excluding employers with a "substantial illegal purpose" (90 FR 48966) was
    vacated on June 30, 2026 by two district courts; the appeals are pending.
- **What a version could be** (the spike decides): in About you, federal student loans (balance, rate, plan, when first disbursed); per
  offer, whether it's a qualifying employer. The engine works out each year's payment from that year's AGI, so income-driven payments
  differ by offer, and counts the payments in your stay. Forgiveness shows beside the verdict, not in it (D13): the qualifying payments
  made by your stay's end, the months left, and an estimate of the balance forgiven if you continue.
- **The spike** (4f-0, a written finding, no code): the formulas above re-read at the time, IBR's (it uses HHS's poverty guidelines, a
  yearly dataset), how a balance and its interest run under each plan, the employer rule's appeals, and whether testers hold qualifying
  offers. Then you decide whether to build.
- **Risks:** policy churn and litigation; a horizon the tool doesn't otherwise model; most of the audience may not need it.

### 4g. Philadelphia's wage tax for commuters (added 2026-10-15)

- **Today:** Philadelphia's resident wage tax is counted (audit C2, pull request #40): the "Inside Philadelphia" choice for an offer
  in the Philadelphia metro in Pennsylvania, default inside. Someone who lives outside the city (the Pennsylvania suburbs, South
  Jersey, Delaware) and works in it owes the nonresident rate on that pay, and the tool counts nothing: M-10 and CLAUDE.md list it
  as a known gap. That understates tax by about $3,400 a year per $100,000 of pay.
- **The engine has it:** `locality: { kind: "philadelphia", resident: false }` applies the nonresident rate (`src/tax/local.ts`), 3.43%
  for pay dates to Jun 30, 2026 and 3.425% from Jul 1, 2026, blended for the year like the resident rate (`PHILLY_2026`, from the
  Department of Revenue's rate table, checked 2026-10-14). No test covers it yet, and the app never sets it: a locality goes with
  where you live, never where you work. Its warning, `phillyNonresident`, says the tax "applies only to days physically worked in the
  city", which overstates the exclusion (below): its words change with this part.
- **The rules, from the city** (its refund petition's instructions, phila.gov; re-read at the stop): the tax follows the
  workplace. A nonresident whose base is the employer's Philadelphia office owes it on all pay, bonuses and paid leave included,
  except for days the employer requires them to work outside the city; working from home for their own convenience doesn't count,
  even with the employer's approval. The excluded days come back as a refund petition after the year, with the employer's
  certification, not through withholding.
- **Scope:** per offer, whether the job is in Philadelphia, asked when the employer state is Pennsylvania, and offered when you'd live
  outside the city (in the metro or in New Jersey or Delaware). It's the city's tax on top of your state's. Required remote days
  share 4b's and 4d's office days, if those are built first: with neither, every working day is in the city, and the help says so.
- **Credits, to verify at the stop:** whether your state credits the city's tax. Secondary sources say New Jersey does, on Schedule
  NJ-COJ, capped at New Jersey's tax on that pay, and that the New Jersey-Pennsylvania reciprocal agreement doesn't reach it.
  Pennsylvania residents outside the city, and Delaware's credit, are unchecked. Until each is verified from the state's own
  instructions, the tool counts the city's tax with no credit, and says so. A credit is 4d's machinery, so with 4d built first it
  comes with it.
- **Validation:** the oracle checks residents only, so hand-checked tests: a commuter at $60,000 and $100,000, the July rate change,
  a bonus, a required remote day against a convenience one. The 2026 oracle report stays byte-identical.
- **Bundle:** detailed mode; nothing in the worker beyond the input.
- **Risk:** small. Philadelphia's rates change each July 1 (CLAUDE.md, the data refresh calendar, already covers it).

**Review stops:** one per part, except 4d and 4e (two each: the engine with its hand-checked tests, then the UI); 4f starts with a spike
(a short written finding, no code merged) and you decide from it.

## Questions for testers

Ask these before building each item, ideally while the tester has their own offers in front of them, and record the answers in
`docs/user-testing.md` (a finding per row, as now). Open questions first; show a sketch only after. Each group ends with what would
change the plan.

**Item 5, the offer breakdown:** its questions are in its section ("Questions for testers" there), and go first; its first, "When you
used it, how many offers did you actually have?", before anything else.

**Item 1, Beyond the money**
1. Besides the money, what's pulling you toward one offer? (Listen for the factors' names before suggesting ours.)
2. Could you put a dollar figure a year on that? How sure would you be of it?
3. Should a figure like that change the tool's answer, or sit beside it?
4. If the tool said "the money flips if career growth at A is worth $5,600 a year more to you", would that help you decide?
- **Would change it:** testers can't or won't put dollars on factors (then a ranking or a note, not values); they want their values in
  the verdict itself (then D3 the other way).

**Item 2, Market benchmarks**
1. Did you look up what these jobs usually pay? Where (Glassdoor, Levels.fyi, a school's salary report, BLS, friends)? What did you
   trust?
2. Which occupation would you pick for each offer from BLS's titles? (Watch whether they can.)
3. BLS's figures cover everyone in the occupation, new hires to veterans. Would those help you, or make your offer look low?
4. Shown your salary within BLS's range for all experience levels, what would you take from it?
- **Would change it:** testers can't find their occupation (then curated titles for the audience's jobs); they read every-experience
  percentiles as "underpaid" even with the range first and the caveats (then drop the item, or say where entry-level pay falls only
  if stop 2A finds a verified source for it).

**Item 3, Negotiation help**
1. Did you negotiate any of these offers, or plan to? What did you ask for, and how did you arrive at it?
2. Would you use a draft email? What would make you uncomfortable sending one built from a tool?
3. Would you mention the other offer's figures, or BLS's?
- **Would change it:** nobody negotiates (then the summary alone, no draft); testers read "would tie" as "ask for" (then wording again,
  before building).

**Item 4, Accuracy** (one question each, to size them)
1. How many days off do you expect at each offer, holidays included? Is any "unlimited"?
2. How would you get to work, how long would it take, and what would it cost?
3. Do any offers pay for the move, and what will moving cost you?
4. Would you live in one state and work for an employer in another, in the office or remotely? Which states? Would you live outside
   a city that taxes commuters (Philadelphia) and work in it?
5. Does any offer include stock options or private-company RSUs? Do you know the strike price and the number of shares?
6. Do you have federal student loans? Is any offer from a government employer or a nonprofit?
- **Would change it:** the answers set item 4's order (D10); a part no tester needs waits.

## Decisions for you

Recorded 2026-10-13: **D1 and D14 approved.** D2-D13 and D15 stand as recommended unless the user comments on pull request #29;
a comment there that disagrees replaces the row. Item 5's decisions, B1-B13, are in its section: approved 2026-10-15, with conditions
on B4, B5 and B8, and B13 added at review.

| # | Decision | Recommended | The alternative |
|---|---|---|---|
| D1 | The tool's scope (`docs/ui-design.md` §1) | **Approved:** revised as in "What v2 changes", on the principle "The tool informs the decision and shows its work; you make the call" | Keep §1; build item 4 only |
| D2 | Room on the main thread | Step 0 first; the budget stays 120 kB | Raise the budget again, with Lighthouse holding LCP |
| D3 | Where your values show | Their own block under the verdict; the hero stays money | A step in the pipeline that the verdict can follow |
| D4 | L-3 with your values | Decide at stop 1A, once the block is seen | Build the switch with 1A |
| D5 | A value's units | A year, today's dollars, rising with inflation at anniversaries; not taxed or priced | The same nominal dollars every year |
| D6 | L-7's place | After L-3 on the page, as L-7 (superseded by item 5, approved 2026-10-15: A-8 in each offer's breakdown, B9) | A second part of L-3 |
| D7 | What L-7's range compares | Base salary against May 2025 wages as published | Wages aged to the offer's start by the ECI |
| D8 | Where OEWS data lives | One file per occupation under `app/public/oews/<vintage>/`, committed | One compact file, split at build |
| D9 | Item 3 without item 2 | Only if testers want negotiation help before market data | Always after 2B |
| D10 | Item 4's order | 4a, 4b, 4c, 4d, 4e, then 4f's spike, reset by testers' answers | By tester demand alone |
| D11 | Options vested at your stay's end | Shown beside the verdict, per scenario; not counted | Counted at the exit's value (an exception to the stay rule) |
| D12 | Cross-state pairs (4d) | The multi-state metros' pairs first, each with sources and tests | Every state at once |
| D13 | Public Service Loan Forgiveness | A spike first; forgiveness beside the verdict, never in it | Drop it from v2 |
| D14 | Days off (4a) | **Approved:** vacation and holidays apart, at BLS's 11 and 8, each a sourced default with its `D` tickmark, editable (per-hour figures move about 4%, once) | One "days off" input at 10, today's 50 weeks: nothing moves |
| D15 | Commute time in per hour (4b) | Counted once every offer has a commute, labeled | Never; per hour stays hours worked |

## Order and stops

In the order approved with item 5 (before it: 0, 1A, 1B, 2A, 2B, 3A, then 4a-4f).

| Stop | What | Needs first |
|---|---|---|
| 0 | Make room: L-1 and the bridge on first use, quick mode's help on first open. **Done** (pull request #31) | D2 |
| 5A | Offer breakdown: one offer works, A-1, the comparison as a layer, §1's new wording, the label rules | B1-B13 (approved), testers (item 5), the audit's items listed in item 5 |
| 5B | Offer breakdown: A-2 to A-7, L-5 and L-6 folded in, the bridge moved | 5A |
| 5C | Offer breakdown: Copy as document for one offer, the first visit, the scan | 5B |
| 2A | OEWS data: `fetch-oews`, the files, the area match, the samples' figures | testers (item 2), D7, D8 |
| 2B | Published wages, A-8: picker, ranges, caveats, M-15, the copied document | 2A, B9 |
| 4a-4c | Accuracy, the small parts: days off, commuting, relocation, a stop each | testers (item 4), D10, D14, D15 |
| 3A | Negotiation help, A-9 (with the levers' values): the summary, the draft email, the wording test | 2B (or 5B alone, D9), testers (item 3) |
| 1A | Beyond the money: engine, lead block, ledger rows, M-14, session and export | testers (item 1), D3, D5, 5A |
| 1B | Beyond the money: the copied document, print, the scan; L-3's switch if chosen | 1A, D4 |
| 4d-4f | Accuracy, the large parts (two stops for 4d and 4e; a spike for 4f) | testers (item 4), D10-D13 |

**On approval:** `docs/ui-design.md` rev 4 (§1, the ledger's new rows in §3.3, L-7 in §4, M-14 and M-15 in §8, the v2 stops in §12);
CLAUDE.md (Now, the docs index); `docs/offer-model.md` for each engine change; `docs/nvda-walkthrough.md`, a part for each new
control, before launch. The data refresh calendar (`docs/data-refresh.md`) gains each dataset as its item is built: OEWS (yearly,
spring), BLS's paid-leave figures (yearly, September, if D14's defaults use them), the IRS mileage rates (each December, and mid-year
when the IRS changes them, as in 2026), each convenience rule and cross-state pair's sources (each January), and, if 4f is built, the
repayment plans' rules.

## Backlog beyond v2

Open items from v1's roadmap (CLAUDE.md's until 2026-10-15; the whole roadmap is in `docs/history.md`) that v2 doesn't plan. Its
other open items became v2's: the commute's cost (4b) and remote work (4d, and as a value you set, item 1), and even swaps for soft
factors (item 1). Each needs the user's go-ahead.
- **Neighborhood rents (v1's item 9):** HUD's Small Area FMRs by ZIP code, since a metro FMR averages the city center with its
  suburbs (a Manhattan or downtown-Seattle 1-bedroom runs well above it). An optional ZIP field per offer, its SAFMR used when
  given, else the metro FMR. HUD publishes them for every metro ZIP each fiscal year (`fy<year>_safmrs`, with a ZIP-to-FMR-area
  crosswalk); tens of thousands of ZIPs, so the data loads in the worker or on demand, never in the main bundle. M-10 calls it
  planned.
- **Sensitivity, one input at a time (v1's item 4):** a tornado chart beside the joint bear and bull scenarios.
- **The gap per paycheck (v1's item 4):** the verdict's monthly lead also restated per paycheck, against distinction bias.
