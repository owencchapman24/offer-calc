# UI slices 4-8 plan (approved 2026-10-09)

**Status (2026-10-09): approved; slices 5, 4 and 8 done** (slice 5's review stops A, B and C, and slice 4's and
slice 8's stop A, merged; how each differs from the design is in `docs/ui-design.md` §12, "UI slice 5 versus
this design", "UI slice 4 versus this design" and "UI slice 8 versus this design"). Slice 7 is next.

The plan for the UI slices after slice 3, with the decisions made in review on 2026-10-09. A fresh
session should be able to execute it from this file, `CLAUDE.md` and `docs/ui-design.md` (rev 3,
which records the design changes approved with this plan).

**Starting point.** Slices 1-3 are done and live. The engine already has everything slices 4-6 need
(`horizonSweep`, `breakeven` with "alreadyAhead", `leaveDateSweep`, `keptIfLeaving`, `cliffs`,
`nextCliff`, `withholdingShortfall`, the bear/base/bull scenarios), except the small additions named
below: a leave sweep by day, the breakeven window fix and the rent flip.

**Working agreements apply** (CLAUDE.md): a branch and a pull request per review stop, CI green
before merging, tests, typecheck, the engine guard and an unchanged grid before each merge, and
`npm run build` for UI work. Merging deploys production, so the screenshots at each stop are of the
live site, light and dark.

## Build order

Slice numbers are stable IDs (`docs/ui-design.md` §12); this is the order to build them in:

1. **Slice 5:** leaving early and downside risk (L-2, L-4 with the next-cliff panel, L-5).
2. **Slice 4:** close calls and breakeven (L-3, the flip line).
3. **Slice 8:** prices in a city you know (§5, item 6).
4. **Slice 7:** mobile and accessibility.
5. **Slice 6:** the reconciliation schedule (L-6), CSV export, print and the hide-tickmarks setting.

## Decisions (2026-10-09)

1. **Mobile and accessibility is slice 7**, out of slice 6. Slice 6 keeps L-6, CSV and print.
2. **L-3 adds the winner's cushion row and the rent lever** (engine item 11).
3. **The hide-tickmarks setting goes with slice 6. W1 (the first-run choice screen) is dropped:** the
   samples load by default, as since slice 1. **"Prices in a city you know" is its own small slice
   (8),** built right after slice 4, ahead of slices 7 and 6.
4. **The axe check fails CI on any WCAG A/AA violation.** Exceptions live in a file where every
   entry must state its reason; an entry without one fails the check.
5. **The breakeven window is fixed in slice 4 step 0** (design change 4a), with a test that L-3's
   target equals the rank list to the cent with three offers on different start dates.
6. **All ten design changes are approved** and recorded in `docs/ui-design.md` (rev 3):
   1. §12: the slice scopes above.
   2. §3.1, §4: L-2 to L-6 sit full width under L-1; the lead stays the only sticky schedule.
   3. §4.5, L-4: dates on the x-axis and the cursor; prorated clawback steps drawn as one segment;
      the next cliff plus the next one that isn't a clawback step; leave-date warnings in L-4's
      panel; the reconciliation with your stay at its end; steps on their real dates.
   4. §4.6, L-3: the comparison window; "already ahead" in the winner's cushion; the cash-award
      lever named by its own label and date; what scales with salary said per offer.
   5. §4.4, L-2: no ranges anywhere, one line pointing to "+ range".
   6. §4.7, L-5: the roll-up, each warning with "Show at the field"; the comparability warning
      stays under the verdict.
   7. §3.4: one worker, two lanes.
   8. §3.2: the tablet's sticky bar, and WCAG 2.2's 2.4.11 for both bars.
   9. §10: Playwright and axe in CI (slice 7), no offline claim, no d3, the bundle budget.
   10. The unassigned items placed (decision 3).

## Rules for every slice

- **One pull request per review stop.** Each is complete on its own.
- **New schedules load on first use** (when they near the viewport, or when opened). The quick-mode
  main thread is 109.1 KB gzipped against a 120 KB budget (110 KB until 2026-10-09); a CI check (slice
  5 step 0) fails above it, and a Lighthouse check fails if a throttled phone's LCP passes 2.5 s.
- **Every new figure** gets a tickmark kind, a methodology section and a derivation;
  `app/src/metrics.test.ts` fails otherwise. New controls get help (`app/src/help.ts`).
- **Hand-check the edges:** the day before vs the day of a vest, payout, clawback step or window end.
- **Bench** (`npm run bench`) side by side with `main` when a stage's per-edit work grows.

## Slice 5: leaving early and downside risk

**Scope**
- **L-2, If things go badly (§4.4):** the sentence; the range chart (bear and bull dots joined, base
  as a diamond, PV on the selected basis, sorted by bear value, with the bear value and % drop); the
  winner in each scenario; "What goes wrong in the bear case", generated from the inputs; the honesty
  notes (an offer without ranges shows one dot and says so; with no ranges anywhere, one line
  pointing to "+ range"); a ticked table view.
- **L-4, Leaving early (§4.5):** the stepped chart of what you keep after clawbacks, by date; cliff
  markers; a last-day cursor (drag, date field, ± month); an after-tax / total-rewards switch; the
  next-cliff panel per offer (keep, repay, forfeited, the next real cliff, past a prorated
  clawback's monthly steps, with the value of staying until it); the leave-date warnings at the cursor; the
  reconciliation with your stay at its end.
- **L-5, Warnings (§4.7):** every engine warning for your stay, grouped by kind then offer, each
  with "Show at the field"; the withholding shortfall for your stay's calendar years; a one-line
  pointer in the lead when a warning changes your numbers.
- **M-8 and M-9** get live numbers.

**Build order**
0. **Groundwork:**
   - **Fast lane, every edit:** bear and bull over your stay for each offer (about 17 ms more).
     The withholding estimate joins at review stop C, where L-5 uses it.
   - **Slow lane:** a job runner in the worker that runs slow jobs in small chunks, yields between
     them so a new edit runs next, and drops jobs from older generations. L-4 (stop B) and L-3
     (slice 4) are its users.
   - **Engine:** a leave sweep by day (`keptIfLeaving` at given last days), so steps land on their
     real dates: month ends, plus the day before and the day of each cliff that isn't on one.
   - **The bundle-size check** in CI: the JS a quick-mode visit loads, gzipped, at most 110 KB.
1. **L-2.** **Review stop A:** merge, deploy, light and dark screenshots of L-2 on the live site.
2. **L-4,** with the cursor and the next-cliff panel. **Review stop B.**
3. **L-5,** the lead's pointer, the withholding estimate, and M-8 and M-9's live numbers. **Review
   stop C** (end of the slice; `docs/ui-design.md` §12 "slice 5 versus this design", CLAUDE.md).

**Tests**
- L-2: each offer's base value ties to the rank list to the cent; "what goes wrong" lists exactly
  the inputs whose bear value differs from base; an offer without ranges shows one value; no ranges
  anywhere shows the one-line prompt; every figure has a kind, a section and a derivation.
- L-4: the day before vs the day of a vest, bonus payout and clawback step; at the end of your
  stay, the kept figure reconciles to L-1's running total (the difference is the last year's tax
  and any clawback).
- The job runner: a newer generation cancels an older job between chunks; a fast request waits at
  most one chunk.
- The bundle check fails on an oversized fixture.

## Slice 4: close calls and breakeven

**Scope**
- **L-3, What it would take (§4.6):** for each offer behind the winner, the starting salary and the
  cash award that would tie it, base case, PV over your stay, on the selected basis. On the per-hour
  basis it shows the after-rent figures and says so.
- **The winner's cushion:** how far the winner's salary could fall, or whether it still leads with
  no sign-on ("alreadyAhead"), before the runner-up ties.
- **The rent lever** on the after-rent basis (engine item 11): the monthly rent, first lease year,
  that ties. Closed form, since the total is linear in rent.
- **The close-call line in the lead (§4.1):** "Close call: $X more starting salary for B would tie."

**Build order**
0. **Groundwork:**
   - **The breakeven window (design change 4a):** the UI passes the comparison window (earliest start
     of every offer, your stay). Test: three offers on different start dates; L-3's target equals the
     winner's rank-list value to the cent.
   - **The rent flip** in the engine, closed form, hand-checked against a bisection.
   - **Breakeven in the slow lane:** about 55 ms each; L-3 needs 4 to 6. The close-call line's runs
     first, and only when there's a close call.
1. The flip line, L-3 with the cushion row, the rent lever, the methodology (M-7 and M-6.3 links).
   **Review stop A** (end of the slice).

**Tests:** re-entering the salary L-3 reports gives a tie (gap under a cent); the cushion's
"alreadyAhead" case; the cash-award lever names the award it changes; the rent lever matches a
bisection on rent to the cent.

## Slice 8: prices in a city you know

**Scope (§5, item 6):** "Prices in" in About you becomes a city picker (default U.S. average, `D`).
Every after-rent figure is restated at that city's prices: its non-housing factor becomes 1. Labels
follow ("after rent, at Charlotte prices"; units "Charlotte $"): the basis step, the verdict, the
bridge, L-1, L-2, L-3, derivations, the methodology (M-6.1, M-6.3) and exports. The engine already
takes the reference area (`household.reference`). Saved with the session and in JSON exports (the
schema change migrates).

**Build order:** the control and the saved field; the labels everywhere; the derivations and the
methodology. **Review stop A** (end of the slice).

**Tests:** at the reference city's own prices, that city's factor is 1; switching the reference
scales every offer's converted spending by the same ratio (new reference ÷ old) and leaves savings
at face value (hand-checked example); every label that says "U.S." follows the choice.

## Slice 7: mobile and accessibility

**Scope**
- **Phones (< 760 px):** offer tabs A | B | C | + instead of the sideways-scrolling ledger; the
  sticky verdict bar at the bottom (W9), opening the lead.
- **Tablets (760-1179 px):** the sticky verdict bar at the top (§3.2).
- **Both bars:** never hide the focused field (WCAG 2.2, 2.4.11): scroll padding, and the bar hides
  while a phone's keyboard is up.
- **Automated scan:** Playwright and `@axe-core/playwright` in CI against `vite preview`. It covers
  quick mode, every detailed section and row editor, Show the work open, L-1's table view, each L
  schedule, the methodology, and the Data page's import review, light and dark, at desktop and phone
  widths. It fails on any WCAG A/AA violation (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa`). Exceptions: `test/a11y-exceptions.json`, each entry with a rule, a selector and a
  reason; an entry without a reason fails.
- **Smoke tests (§10):** a salary edit updates the verdict; export then import gives the same results.
- **Screen-reader walkthrough:** Claude writes a script of the main flows with the expected
  announcements. The user runs it with NVDA in Chrome or Edge (and VoiceOver on a phone for the tabs
  and the bar) and pastes NVDA's Speech Viewer text; Claude fixes what it finds. (Claude can't run a
  screen reader: no audio, and key presses sent over the DevTools protocol bypass NVDA.)
- **Known before the scan:**
  - `aria-live` wraps the whole verdict (`app/src/Lead.tsx`), so every recompute is read again. The
    design asks for one short sentence, announced after typing pauses.
  - The chart tooltip is `role="status"` (`app/src/ByYear.tsx`): it speaks as the crosshair moves.
  - The theme switch is `role="radio"` buttons without arrow keys (`app/src/App.tsx`); check the
    other switches.

**Build order**
1. The scan and smoke tests in CI, and their fixes. **Review stop A:** the report.
2. Tabs and sticky bars. **Review stop B:** phone and tablet screenshots, light and dark.
3. The screen-reader script; the user's run; fixes. **Review stop C** (end of the slice).

Locally, Playwright can drive the installed Edge (`channel: "msedge"`), so nothing is downloaded;
CI installs Chromium.

## Slice 6: the reconciliation schedule, CSV export and print

**Scope**
- **L-6.A/B/C, The work (§4.8):** each offer's employment-year tables (cash; total rewards and
  hours; after rent), footed (`^`), cross-footed to the lead and L-1 (`<`), inputs traced (`T`);
  every dated payment with its formula and tax; each calendar year's tax with and without the
  offer. Collapsed by default; the worker sends the events only once L-6 is opened.
- **The `<` ties** move from L-1's table view to L-6 rows (W8a: "Ties to L-6.A, year 1, row 12").
- **CSV for each table:** tickmarks as a column; the sample flag on line 1 and `-sample` in the file
  name; text cells guarded so a spreadsheet won't run them as formulas (offer labels are free text).
- **Print:** every schedule expanded with its legend; offer colors plus texture; the sample flag and
  data vintages in the footer. A Print button loads the lazy schedules first (Ctrl+P prints what's
  loaded: `beforeprint` can't wait for a chunk).
- **The hide-tickmarks setting (§9.1):** figures keep a dotted underline, so they're still links.

**Build order:** L-6 and its ties, **review stop A**; CSV, print and the hide-tickmarks setting,
**review stop B** (end of the slice), with a printed PDF of the samples.
