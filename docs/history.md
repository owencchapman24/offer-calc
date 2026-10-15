# History

What CLAUDE.md recorded before its rewrite on 2026-10-15, kept as it stood: each slice's
narrative, the sizes and load times measured along the way, the dated decisions and their rationale, the next steps of the time,
the code map with its incident notes, and the v1 roadmap. **An archive, not maintained:** where it disagrees with the code or with
CLAUDE.md, those win. The audit (`docs/audit-2026-10.md`, D5) lists contradictions in it that the rewrite resolved.

Each heading below is the old file's, marked "Old".

## Old: Status (2026-10-12)
**Engine: complete for v1** (`src/tax`, `src/offer`, `src/col`).
- **Tax engine:** 2026 law, validated against PolicyEngine-US. Projected later years come
  from `paramsForYear`, cached and frozen. Amounts the IRS has published for a later year are used as published and projected on
  from there (`ENACTED`): so far the 2027 HSA limits, $4,500 and $9,000 (Rev. Proc. 2026-24, `src/tax/params/federal2027.ts`).
  The rest of 2027 is still projected: on 2026-10-12 the IRS's annual inflation revenue procedure, the 402(g) notice and SSA's
  wage base weren't out (when to check again: "Data refresh calendar"). PolicyEngine-US 2.30.3 has no HSA-limit parameter; the
  samples' numbers don't change (their HSA money is far under either limit).
- **Offer model:**
  - salary, bonus and cash awards; RSUs and refreshers;
  - leave date, clawbacks and the leave-date sweep;
  - raises and promotions; bear/base/bull scenarios; PV;
  - `compareOffers`, and `breakeven`, including the "alreadyAhead" outcome, over a window the caller
    passes (`comparisonWindow`: the earliest start of every offer), and as resumable steps
    (`breakevenSteps`); `rentFlip`, the rent that ties, closed form (and `rentFlipFrom`, the same from
    projections already made);
  - 401(k), health, perks, hours;
  - cost of living (BEA RPPs), the COL-adjusted total, rent growth;
  - `cliffs` / `nextCliff`, `withholdingShortfall`, and `horizonSweep` (window hours,
    per hour, `monthlyEquivalent`);
  - per stay row: nominal values, hours, `annuityFactor` and `extraHours` (pay per extra
    hour); `annuityTerms`; the offer-letter total by component (`quoted`).
- **Structured output:** the engine returns numbers and codes. `src/format` writes all the
  words (labels, formulas, warnings, assumptions).
- **Rent estimates:** HUD FY2027 Fair Market Rents by metro (`npm run fetch-fmr`). A
  BEA-derived fallback, anchored at the ACS 2024 median gross rent ($1,487), covers areas
  without an FMR.
- **Speed** (`npm run bench`, median of warm runs; the machine is noisy, so compare
  branches side by side, not with these):
  - one projection 2.8 ms; `compareOffers` 23 ms; `horizonSweep` (stays of 2-5) 25 ms;
  - one breakeven 52 ms; one rent flip 5 ms; a 60-month leave sweep 92 ms.

**UI: slices 1-8 are complete and live at https://offer-calc.vercel.app**, so the plan for slices 4-8 is done (plan:
`docs/ui-slices-4-8-plan.md`; slices 4-8 versus the design: `docs/ui-design.md` §12). **Slice 7** is
done (2026-10-10): stop A (the automated accessibility scan and its fixes), stop B (phone tabs, sticky verdict bars) and
stop C (the NVDA walkthrough, written; its run is deferred to before the public launch, see "Pre-launch checklist"). **Slice 6**
is done: stop A (2026-10-10; owencchapman24/offer-calc#17, L-6 and its ties and the year figures as shown, and
owencchapman24/offer-calc#18, derivation titles that keep their capitals: "U.S.", "NY", "RSUs") and stop B (2026-10-12: CSV,
print, the hide-tickmarks setting; below). **Copy as document** is built (2026-10-12, from user testing; below). What's next is the
user's call: see Next steps.
- **Where things stand** (2026-10-13, v2's step 0): `npm test` 485 passing; `npm run e2e` 164 passing
  (16 skip by design), the scan 198 scans with no violations and no exceptions; main thread 359.2 / 109.8 kB gzip
  against the 120 kB budget, one chunk (117.4 before step 0); Lighthouse (mobile, median of 3) LCP 1.87 s against 2.5 s,
  performance 98, locally (1.95 s before step 0, measured side by side).
  `npm run grid` output is byte-identical to before slice 6 (no engine change).
- **CSV for each table** (slice 6, stop B; `csv.ts`, loaded on the first download): L-1's and L-2's table views ("Download CSV"
  once the table view is open) and L-6's four tables per offer (beside each part's heading). Built from the same view models and
  display formatting as the tables, so each figure is the figure shown, written as a plain number (`(41,724)` is `-41724`, a payment
  `9166.67`, a rate as shown), units in the headers, each figure's tickmark (`metricKind`) in a column beside it. Line 1 flags samples
  (one quoted cell), then a title, the scope, the header, the rows and the tickmark legend; UTF-8 with a BOM, CRLF. Named
  `offer-calc-YYYY-MM-DD-<table>[-sample].csv` (`L-6-A-employment-years`, …). Text cells starting with `=`, `+`, `-`, `@`, a tab
  or a CR get a leading `'`; number cells never. `csv.test.ts` checks every figure in every CSV against the rendered tables. The
  button (`CsvButton`) lives in `figures.tsx` (see Bundles).
- **Print** (slice 6, stop B; `print.ts`, loaded on the first click): "Print…" (top of the comparison) offers a summary (the
  default: everything but L-6's list of every payment) or the full workpaper (`PrintChoice` in `App.tsx`; the `Printing` context
  holds the choice, `usePrintScope`). Print then sets the print layout (the root's `printing` class), loads L-2 to L-6 (`loadLater`),
  works out L-3, L-4 and L-6's payments as though on screen, waits for every schedule (12 s at most), then `window.print()`;
  `afterprint` restores the screen. Ctrl+P sets the layout in `beforeprint` (`flushSync`, so charts re-measure at once: `useChartWidth` in `axes.ts`) but
  prints only what's loaded, holding the last choice made (the summary until one is; not saved). The layout is a 680 px column on screen and on paper, so charts are drawn at the print width; table
  views open; L-6 open on every offer, each on a new page; the screen's controls hidden; inputs print as values; light colors from a
  dark screen; A solid, B dashed, C dotted (also under forced colors); page numbers in the margin; the footer flags samples and gives
  the data vintages. The samples print to 23 Letter pages as a summary, 37 as the full workpaper. A `<tfoot>` prints as a plain row group (Chromium repeats footers on
  each page, blank).
- **Copy as document** (2026-10-12, from user testing, finding 1; `copyDoc.ts`, loaded on the first click; plan and record:
  `docs/copy-as-document-plan.md`): "Copy as document" beside "Print…" puts the comparison on the clipboard as HTML with a plain-text
  fallback, about 3 pages, for someone who has never seen the tool (no tickmarks, workpaper references or "basis"): the answer and the
  pipeline in plain English, with each step's totals and L-2's sentence when any offer has a range; the offers as entered, vesting and
  refreshers described precisely; year 1's bridge for every offer side by side; the years to the answer; what would change it (L-3 as
  a Now / Ties at / Change table, and the rent note); leaving early at L-4's last day (or six months in), pointing to L-4 for others;
  the assumptions. One document model, two renderers (`toHtml`, `toText`): inline styles only, Arial, real headings, header rows in
  `<thead>`, each cell's text in a zero-margin paragraph (Word otherwise doubles row heights); plain-text tables within 80 columns. Every
  total adds up as displayed, and every calculation it states is listed in `worked`, which `copydoc.test.ts` checks, with the HTML's and
  the text's figures identical. The click writes a `ClipboardItem` of promises at once (Safari); `prepare` asks the worker for L-3's
  ties and L-4's panel as they do (`tieJob`, `cursorJobFor`), so the results are shared. "Copy now" (a copy event) where the browser
  won't. Disabled (`aria-disabled`, with the reason) while the inputs have a problem or an offer is incomplete; while the comparison
  is first worked out, its reason ("Working out the comparison…") is for screen readers only, so nothing moves (`copyBlock`, 2026-10-13). The samples paste into
  Word (Letter, 1-inch margins) at 3 pages.
- **The hide-tickmarks setting** (slice 6, stop B): "Show tickmarks | Hide tickmarks" radios in the footer (`ui.ticks`, saved with
  the session; JSON exports carry it as the theme, "shown" or "hidden"). Hidden, the root has `data-ticks="hidden"` and the
  stylesheet hides the figures' marks (and Show the work's, and the `<` ties); figures keep a dotted underline and stay the same
  buttons with the same names and roving tabindex. Legends say so, with "Show tickmarks" (`TickSetting` context in `ui.tsx`). The
  inputs' `D` and `E` stay. `ticks.test.ts`; `keyboard.e2e.ts` checks the names, the underline, the arrow keys and the save.
- **L-6, The work** (slice 6, stop A; `TheWork.tsx`, view model `workpaper.ts`): collapsed until "Show the tables", then one offer
  at a time (A | B | C): its employment years as numbered lines (cash; total rewards and hours; after rent) by year and the years
  added; your stay's totals on each basis (the years, less what runs past the stay, = your stay as paid `<` L-1's; present value
  `<` the rank list); every payment to the cent with its formula and tax, by year and kind, subtotalled; and each calendar year's
  tax with the offer, without it and the offer's share, with the offer's rate. Its payments and tax years come from the worker's
  slow lane (`paymentsJob`, lane `work`) only while it's open; its years come with the comparison. Every figure is a tickmark
  with a derivation, and `l6.test.ts` works every L-6, L-1 and bridge derivation line by line, as displayed.
- **The year figures as shown** (`footing.ts`, main thread): what L-1, the bridge and L-6 show for each employment year. A leaf is
  rounded once (a year's salary, bonus, cash awards and RSUs are its payments as posted, each to the cent, added: `posted` in the
  fast lane's detail; its tax likewise); a subtotal is its lines as shown, added; spending at the prices picked multiplies the
  shown spending by the shown BEA indexes. So every column adds up as displayed, and a few year figures differ by a dollar from
  the engine's own rounding (A's year 1 after rent is 62,594, not W4's 62,595). Present values and per hour stay the engine's.
  In a tax year with the offer, the total is the total without plus the offer's tax, and the federal line takes the rounding.
  `footing.ts` names no places: importing the city list there split it out of the main chunk (Rolldown).
- **Screen readers** (slice 7, stop C): `docs/nvda-walkthrough.md`, ten parts, about 30 minutes, with the keys and what NVDA
  should say at each step. Two gaps found while writing it are fixed: a row editor's button names its offer and row
  ("Edit A's promotions", "Close …" while open, "Add B's promotions" with none yet: `editorButtonName` in `controls.tsx`),
  and L-4's slider says what each offer keeps ("Jan 12, 2028. A keeps $41,254, B $35,029, C $47,560.", `sliderText` in
  `leaveModel.ts`), from the panel once it has the new date, so its figures are the panel's and a step is said once. Both
  were checked through Windows UI Automation, what NVDA reads (Chrome's DevTools accessibility view shows `aria-valuetext`
  as empty, for any slider).
- **Phones and tablets** (slice 7, stop B; `docs/ui-design.md` §3.2, W9):
  - **Offer tabs on a phone** (under 760 px; `useMedia(PHONE)` in `media.ts`): `OfferTabs` in `Ledger.tsx`, a tab list
    (arrow keys, Home and End choose; one Tab stop) with each offer's letter and name, ⚠ on an offer that needs a fix,
    and + while there are fewer than three. Every ledger cell carries `data-offer`; the stylesheet shows the chosen
    offer's (`ui.offerTab`, saved; a missing or removed offer falls back to the first). "Edit it", "Fix it" and "Show at
    the field" show their offer's tab first. Removing an offer moves focus to the tab shown (the Offers heading on a
    desktop).
  - **The sticky verdict bar** (`VerdictBar` in `Lead.tsx`): sticky, not fixed, so it shifts nothing. On a tablet
    (760-1179 px) it sits under About you and sticks at the top, with the verdict's sentence; on a phone it's last on the
    page and sticks at the bottom, short ("C +$500 a month · stay 4 yrs"). One button, to the lead schedule (its heading
    takes focus).
  - **It never hides the focused element** (WCAG 2.4.11): 72 px of scroll padding while a bar shows (`:root:has(...)`),
    `useFocusClearOfBars` (a focused element a bar covers is scrolled clear), and the phone's bar hides while the
    keyboard is up (`useKeyboardUp`: a field you type in has focus on a touch screen, or the visual viewport has shrunk at its
    own scale, so pinch-zoom doesn't count; re-checked once a resize settles, so a rotation never leaves it hidden).
    `e2e/mobile.e2e.ts` tabs down the page and back up on a phone and a tablet: nothing covered (without the guards, 8 and
    6 were).
- **The accessibility scan** (slice 7, stop A): Playwright with axe-core (`e2e/`, `npm run e2e`) on the
  production build, served as Vercel serves it (`scripts/serve-dist.ts`: compressed, `vercel.json`'s CSP).
  33 states (quick mode, every detailed section and row editor, Show the work opened, drilled into and on a
  default, L-1's table view, L-1 to L-5 loaded, L-4 on your stay's last day, the methodology, the Data
  page's import review, its problems, a file it can't import and the delete confirmation; since stop B the
  verdict bar and the phone's tabs; since slice 6 L-6 open on A and on C, and a payment's tax worked out: 36; since stop B, L-2's table view, tickmarks hidden and
  Show the work so, and print on a desktop, in print media; then the Print button's choice, and the printed summary: 42), in
  desktop 1440 and phone 390 projects, light and dark, and the comparison page's states in tablet 820 projects: 186
  scans. L-6's states are the longest pages (every schedule loaded, ~500 figures in its tables): their tests have 180 s. The verdict bar is scanned in its place (`position: static`):
  axe counts targets scrolled under a stuck bar as obscured, which is a scroll position, not the layout. Any WCAG 2.0/2.1/2.2 A or AA violation
  fails, unless `test/a11y-exceptions.json` accepts it with a rule, a selector and a reason (an entry
  without a reason fails, in `npm test` too). None is excepted. The report (`.a11y/report.md`) lists the
  violations, the exceptions, and what axe left for a person to check ("needs review"), by axe's reason.
  - **Smoke tests:** a salary edit updates the verdict; export, change the inputs, import: the same
    results, and the same file again.
  - **Keyboard tests** (`e2e/keyboard.e2e.ts`) for what axe can't see: the verdict announced as one
    sentence; L-1's chart as a slider; the theme radios' arrow keys; focus after picking a city.
  - **Its fixes:** lone tickmarks (`TickButton`) are 24 × 24 px boxes (WCAG 2.5.8 counts the box, not
    `::before`); lists keep their list role (a warning's `role="note"` or an error's `role="alert"` is on a
    wrapper); the vesting table's sideways scroll takes focus; every `aria-describedby` names a rendered hint
    (a nested field points at its parent's, tested in `help.test.ts`); muted text under the highlighter wash
    takes graphite (3.4:1 in dark mode before).
  - **The verdict for screen readers:** `aria-live` no longer wraps the verdict. A polite live region
    (`#verdict-live`, `LiveVerdict` in `Lead.tsx`) says one sentence ("C leaves you about $487 a month more
    than A, after rent, at U.S. prices.") a second after the last result, only when it changes; the first
    verdict isn't announced.
  - **L-1's chart** is a slider over the years: its value text reads every offer at a year ("Year 2: A …, B …, C …"),
    so it speaks only as you move it (arrows, Home, End); the drawn tooltip is `aria-hidden`.
  - **The theme switch** is native radios in a fieldset: arrow keys move and choose, one Tab stop. The
    other two-way switches (Quick / Detailed, Each year / Running total, the bridge's offer, L-4's basis,
    the pipeline's steps) stay `aria-pressed` toggle buttons, each a Tab stop.
  - **The ledger's city** returns focus to Change after a pick or Escape, as "Prices in" does.
- **Prices in a city you know** (slice 8): About you's "Prices in" is the U.S. average (`D`) or any city
  in the list (Change, then a search; "Use the U.S. average" goes back). It's the engine's
  `household.costOfLiving.reference`: that city's own price factor is 1, every offer's spending money
  scales by the same ratio and savings stay at face value. Every after-rent label follows ("after rent,
  at Charlotte prices", "Charlotte $", "today's Charlotte dollars", "priced as in Charlotte"): the lead,
  L-1, the bridge, L-2, L-3, the derivations, M-1, M-6.1, M-6.3 (its title too), M-7.4 and M-12. The words
  come from `app/src/prices.ts`. Saved with the session (schema 3) and in JSON exports (schema 3; older
  files and sessions migrate to the U.S. average).
- **The rent note** (slice 8): under the verdict, on the after-rent basis, "This depends on rent: at HUD's
  estimate for New York ($2,729), A wins", when an offer's entered rent and its estimate lie on either
  side of the rent that flips the verdict (L-3's rent lever; for the winner, the rent at which its lead
  goes). One clause per offer, each on its own. The fast lane works the flips out from your stay's
  projections (`rentFlipFrom`, no extra projection), so it shows without L-3 on screen. The figure is
  the estimate (`E`); its derivation goes from the gap to the rent that ties and on to the estimate.
- **BEA indexes in derivations** (slice 8): worked exactly from BEA's all items and housing (the engine
  reports them to 3 decimals), so the extra decimals a product needs to foot are real ("97.2933"), and
  there are no padded zeros ("105.696", not "105.696000").
- **L-3, What it would take** (slice 4): for each offer behind the winner, the starting salary, the first
  cash award (by its own label and date; with none, a sign-on 30 days in, no clawback) and, after rent,
  the rent that would tie it ("C still wins unless your New York rent for A is under $3,290 a month");
  then the winner's cushion against the runner-up (how far its salary could fall, "still leads A with no
  sign-on", the rent at which its lead goes); and per offer, what scales with its salary. Base case, PV
  over the comparison window, on the verdict's basis (per hour ties the total it divides). Its target is
  the rank list's figure, shown and cross-footed. Between L-2 and L-4; the slow lane works it out while
  it's on screen (0.3-0.7 s on a desktop). M-7.4 explains it.
- **The close-call line** (slice 4): when the verdict's lead is under 3%, "… $2,867 more starting salary
  for A would tie" (dollar bases only), from one breakeven that runs ahead of L-3's and L-4's jobs and
  that L-3 reuses (the worker's memo).
- **L-2, If things go badly** (slice 5, stop A): the sentence (who holds up best, the biggest
  drop, who wins only if things go well), a range chart (bear and bull dots, base diamond), who
  wins each scenario, what goes wrong in the bear case (generated from the inputs), a ticked
  table view, and one line pointing to "+ range" when no offer has a range. Below L-1; it loads
  as you scroll toward it.
- **L-4, Leaving early** (slice 5, stop B): what each offer keeps for any last day, after tax or
  in total rewards, as paid.
  - A stepped chart by calendar date (offers with different start dates line up), steps on their
    own dates, cliff markers ($ payment, ▲ vest, ✓ clawback ends, ◆ 401(k) vests), the stay's end
    dashed, and each prorated clawback as one segment ("Sign-on clawback shrinks $833 a month until
    Jul 12, 2027").
  - The last day: a date field, a month at a time, "Your stay's last day", or dragged on the chart
    (a keyboard slider: arrows a month, Shift a day).
  - The panel per offer: keep, repay, left behind; the next real cliff (past a prorated clawback's
    monthly steps) and what staying until it is worth; the leave-date warnings (a forfeited bonus as
    what was earned toward it by the last day, beside its target; FICA on a later-year clawback); on
    your stay's last day, the reconciliation with the stay in words (the stay taxes its last year as
    though pay continued through December).
  - Its numbers come from the worker's slow lane: the curves when the inputs change (~0.5 s for the
    samples, in ~8 ms chunks), the panel when the last day moves (~50 ms), only while L-4 is on
    screen and the comparison is current. About 0.7-1 s from a keystroke to L-4 filled in, on a
    desktop.
- **L-5, Warnings** (slice 5, stop C): every warning for your stay in three kinds: changes your
  numbers (limits, the bonus cutoff), not modeled (the convenience-of-employer rule), and cash timing
  (the federal withholding shortfall, estimated in the fast lane). A recurring warning is one line with
  its years, and each has "Show at the field". The lead points to L-5 when a warning changes the numbers
  (the worker counts them).
- **Stale schedules:** L-1 to L-5 dim their figures while they're being worked out (a moment) and say
  "Updating…"; while the inputs have a problem they keep full contrast (WCAG 1.4.3) and say "⚠ Last valid
  results" (`staleClass` and `StaleNote` in `ui.tsx`). Captions, legends and "Working it out…" never dim.
- **Methodology live numbers:** M-7.4 L-3's ties once it has run; M-8 lists your bear, base and bull
  cases; M-9 each offer's leaving-early terms, and L-4's panel once it has run.
- **App:** `app/`, React 19 and Vite 8.
  - The engine runs in a Web Worker: inputs debounced 200 ms, stale results dropped.
  - State is saved in this browser only (localStorage `offer-calc:v1`). No backend, no
    login.
  - **Recovery** (2026-10-14, audit C22, C23; `Recovery.tsx`): a root error boundary shows "Something went wrong" with
    "Download what's saved" (an export the Data page imports, `savedFile`), "Start again with the samples" (the saved value set
    aside under `offer-calc:backup`, offered on the Data page until "Delete all data") and "Reload the page". A save from a newer
    schema is never saved over (`saveSession` returns "newer"): the page shows the samples with a notice and a download. An
    unreadable save is set aside before anything replaces it. Imports with one offer id twice are refused; saved sessions with
    one get ids of their own (`uniqueIds`).
- **Features:**
  - quick mode for 2-3 offers;
  - About you, with "How long do you expect to stay?" (default 4 years), and, filing jointly, the spouse's wages (2026-10-14, audit
    C1: `spouseWages`, the first year's, grown with inflation by `spouseByYear` from 2026 on; L-6's tax tables show them);
  - HUD rent estimates;
  - the lead schedule: verdict, rank list, basis pipeline, the "if you stay 2-5 years"
    row, the disagreement line, and pay per extra hour;
  - **tickmarks that open Show the work** (slice 2): every figure is a button (the number
    itself, not just its ✓), with a hit area of at least 24 × 24 px. The popover shows the
    derivation with your values in Next with tabular figures, each part ticked so you can
    drill down, lights up the figures it uses and ties to, and links to its methodology
    section. Arrow keys move between figures; Escape closes and returns focus. On phones
    it's a bottom sheet. A one-time hint under the verdict points to them.
  - **L-1 by year:** a hand-built SVG line chart (each year or running total) with a
    keyboard-readable crosshair, end labels, notes (promotion, new-hire RSUs finishing) and
    a ticked table view (its years and your stay; since slice 6 its present-value tie is L-6's).
  - **The bridge** beside it: the offer letter to after rent, at U.S. prices, for any
    offer and year (W4), each line explained ("first bonus is a stub", "RSUs vest on
    company dates") and footed; its total ties to L-1.
  - The first-use note for the after-rent basis (remembered), and **the methodology** at
    `#/method` (M-1 to M-13, code-split), with live numbers in M-1, M-6.3, M-7.2 and M-12.
  - light and dark themes.
  - **Detailed mode** (slice 3, done 2026-10-08): the Quick / Detailed switch, nine sections
    one open at a time, row editors beneath their row. It loads the first time it's opened.
    - Every input has its hint, ⓘ help and "How this is used →" (`app/src/help.ts`), a default
      with a `D` tickmark and its reason, or a blank where decided (`defaults.ts`), its problems
      at the field (`validateOffer` in the worker), and "Show the work" from the figures it
      affects ("From your inputs"; "Edit it" opens the section and editor).
    - Everything is editable: pay (raises, raise timing, promotions), bonus (basis, target, by
      year, payout date, bonus year, cutoff, guarantee, must-be-employed), cash awards with
      clawbacks, equity (RSU grants with presets or your own tranches, company vest dates,
      share-price growth, refreshers), 401(k) (contribution, type, pay that counts, match
      tiers, non-elective, vesting, service), health (premium, out-of-pocket, maximum, HSAs,
      coverage), perks, hours, and where you'd live (employer state, rent growth). Health use
      is in About you. Ranges are opt-in ("+ range").
    - A 401(k) or health plan is not entered (not counted), entered, or none (entered, as none).
    - Problems keep the last valid results, said in the lead schedule with "Fix it" (cleared
      after an import or a reset). The engine's warnings show at their field. A cost or benefit
      counted for some offers but not others is named under the verdict, and only for
      categories that can be entered. Per hour shows only when every offer has hours.
  - **The Data page** (`#/data`, loaded when opened): what's stored, JSON export
    (`offer-calc-YYYY-MM-DD[-sample].json`), import (format, schema and every field's shape
    checked, then every offer by `validateOffer` in a worker; a review before "Replace
    everything") and "Delete all data".
- **Samples:** loaded by default and stamped illustrative.
- **Deploys:** Vercel deploys every push to `main` from the private GitHub repo (going public
  is deferred; see Decisions). CI (`.github/workflows/ci.yml`) runs on every pull request and every
  push to `main` (not on other branches' pushes, so a pull request runs it once), in three jobs:
  - `check`: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run check-bundle`;
  - `lighthouse`: builds, then `npm run lighthouse` (the runner's Chrome); a warm-up, then five runs; the median LCP's run's report is
    uploaded as the `lighthouse-report` artifact;
  - `e2e (1/4)` to `e2e (4/4)`: four shards (`--shard`), each building, installing Playwright's Chromium (cached) and running
    its quarter of `npm run e2e` (one retry for a slow runner), writing a blob report; then `e2e` merges them
    (`e2e/merge.config.ts`) into one accessibility report and one Playwright report, uploaded as `a11y-report`, and fails if
    any shard did. A newer push to a pull request cancels its older run.
  - Settings: framework none, `npm ci`, `npm run build`, output `dist/`.
  - `vercel.json` sets the CSP, `Referrer-Policy`, `nosniff` and `Permissions-Policy`,
    plus a one-year immutable cache for `/assets/`. All were checked live.
  - **Hygiene** (2026-10-15, audit S2): every action in the workflows is pinned to a commit, its release in a comment
    (`actions/checkout@11d5960… # v4.4.0`); to update one, pin the new release's commit in every workflow. Dependabot alerts and
    security-update pull requests are on (repository settings), for npm and the actions; a security update to `@playwright/test`
    must move `package.json`'s `playwright-core` override with it. `.github/workflows/fuzz.yml` runs `npm run fuzz` each night
    (07:17 UTC) on a random seed, written to the run's summary, and by hand from the Actions tab with a seed to replay.
- **Bundles** (raw / gzip):
  - **Main thread:** 359.2 / 109.8 kB for a quick-mode visit by `npm run check-bundle` (Node's
    gzip; Vite 8's report reads ~1 kB higher, Rolldown's compressor). Copy as document's waiting reason (`copyBlock`) added
    0.3 / 0.1 (2026-10-13). v2's step 0 (2026-10-13) took 22.6 / 7.7 off: L-1 and the
    bridge on first use 6.6 kB gzip, quick mode's ⓘ help 1.0 (381.6 / 117.4 before). Copy as document's button added 2.5 / 0.9
    (379.1 / 116.5 before). The print choice added 1.6 / 0.5; slice 6's stop B
    ended at 377.5 / 116.0, adding 3.6 / 0.9 (the CSV button, the tickmark setting, the print layout and button); its stop A ended at 373.9 / 115.1, adding 4.5 / 1.7 (the year figures as shown,
    L-6's slot and lane); slice 7 ended at 369.4 / 113.4; its stop A at 364.3 / 111.9; slice 8
    at 362.7 / 111.4; slice 4 at 357.9 / 109.7;
    slice 5 at 355.7 / 109.1;
    slice 3 at 351.8 /
    107.7; slice 2 346 / 106; slice 1 276 / 85. Budget: 120 kB gzipped by the check, which CI runs
    after the build (110 kB until 2026-10-09; see Decisions). Slices 4, 8 and 7 add to the main thread
    (the close-call line, the prices control, tabs and sticky bars).
  - **Load time** (`npm run lighthouse`, Lighthouse 13 mobile: simulated slow 4G, 4x CPU slowdown,
    a discarded warm-up, then the median of 3 runs, LCP's and the score's each taken on its own): LCP at most 2.5 s,
    checked in CI. Before the warm-up (2026-10-10), CI's cold first run (TBT ~1 s) could be reported as the median. 2026-10-09: the production build 1.86 s,
    performance 98; the live site 1.47 s, performance 100. 2026-10-10, after slice 6's stop A: 1.94 s in CI and locally,
    performance 98; 2026-10-12, after slice 6's stop B: 1.95 s locally, performance 98. 2026-10-13, v2's step 0, `main` and the branch
    built side by side and run alternately, two rounds each: LCP 1.95 s to 1.87 s (both rounds), TBT about 91 ms to 45 ms, performance
    98 both. The LCP element is About you's assumptions line, which renders before the worker answers, so the main chunk's download
    and parse set LCP. CLS read 0.020 on the branch (0 on `main`): a 24 px shift both had, from Copy as document's "Fill in at least two
    offers…" showing until the first results arrived, which Chrome flagged as following input on `main` (so not counted). A preload of the
    body font was tried and dropped: LCP 2.35 s, and the shift stayed. Fixed the same day (`copyBlock`): CLS 0.000 in every run, LCP
    1.89 s. Two 3-4 px bumps in About you's "Prices in" row remain in a throttled load (0.0015, on `main` too); Lighthouse doesn't
    register them.
  - **Keep the main thread in one chunk:** a lazy schedule imports `figures.tsx`, never
    `Tickmarks.tsx`. When a lazy chunk reached `react-dom` or `metrics.ts`' run-time code through
    its figures, Rolldown split React, the model and the help text out of the main chunk (1-2 kB
    more gzip on every visit). Likewise a new module shared by the main chunk and a lazy schedule: `CsvButton.tsx`, imported
    by L-1 and by L-2 and L-6, split React, `ui.tsx` and `text.ts` out (2026-10-12), so the button lives in `figures.tsx`.
    And `help.ts` stays free of React: the lazy chunks that fill it in (`quickHelp.ts`, `helpText.ts`) import it, and when it
    imported `lazy.ts` for `quickHelp`'s lazy module, React, `lazy.ts` and `text.ts` split out (2026-10-13), so that module is
    in `fields.tsx`. Enforced since 2026-10-15 (audit P4): `npm run check-bundle` fails when `index.html` loads more than one
    script, and `scripts/lib/imports.test.ts` (in `npm test`) walks `app/src`'s imports and checks the rules: no engine values on
    the main thread, `help.ts` free of React, `figures.tsx` free of `react-dom` and of `metrics.ts` at run time, the lazy schedules
    never importing `Tickmarks.tsx`.
  - **Loaded on first use** (raw / gzip, 2026-10-09): detailed mode 54 / 14 KB (sections, editors,
    controls, its help text), the derivations 69 / 22 KB (when a tickmark is hovered, focused or
    opened), the methodology 49 / 16 KB, the Data page 15 / 6 KB, the engine's warning words 4 / 2 KB,
    L-2 9 / 3 KB plus its view model 4 / 2 KB, L-3 7 / 2 KB, L-4 14 / 5 KB plus its view model 4 / 2 KB
    (each view model shared with the derivations), L-5 6 / 3 KB, L-6 11 / 3 KB plus its view model 12 / 5 KB (2026-10-10; the
    derivations are now 92 / 27 KB, with L-6's), the CSV code 7 / 3 KB and the print code 0.4 / 0.3 KB (2026-10-12), Copy as document's 28 / 11 KB (2026-10-12);
    since step 0 (2026-10-13), L-1 and the bridge 11.6 / 4.0 KB plus `byYearModel.ts` 5.7 / 2.5 and `footing.ts` 3.2 / 1.4, and
    quick mode's ⓘ help 2.7 / 1.3.
  - `src/format` is split into modules (numbers, issues, schedule, warnings; `index.ts`
    re-exports them) so each chunk takes only the words it uses: a module lands in one chunk
    with every export any chunk uses.
  - **Worker:** ~250 KB. Per edit it runs `validateOffer` on each offer, then `horizonSweep`, your
    stay's full projection per offer, its bear and bull totals (L-2) and its withholding (L-5): about
    50 ms warm on the samples in Node, 35-65 ms in headless Edge (32 before slice 5). L-3's and L-4's
    jobs, the close-call line's breakeven, and L-6's payments (only while it's open), run in the slow lane.
  - Only the worker holds the engine and the BEA/HUD tables.

**Tests:** 485 passing (`npm test`), and 164 Playwright tests (`npm run e2e`: the scan's tests in six projects, 8 smoke
tests, 8 keyboard tests, and the phone and tablet tests; 16 more skip, each a phone's test on a tablet or the reverse, or the
print scan off a desktop).
- `test/offer.test.ts` 136, `test/params.test.ts` 23, `test/tax.test.ts` 10,
  `test/validate.test.ts` 57, `app/src/app.test.ts` 27, `app/src/metrics.test.ts` 31,
  `app/src/defaults.test.ts` 43, `app/src/comparability.test.ts` 8, `app/src/help.test.ts` 7,
  `app/src/exchange.test.ts` 7, `app/src/jobs.test.ts` 6, `app/src/leave.test.ts` 14, `app/src/l3.test.ts` 19,
  `app/src/l5.test.ts` 6, `app/src/l6.test.ts` 13, `app/src/csv.test.ts` 14, `app/src/ticks.test.ts` 4, `app/src/prices.test.ts` 13,
  `app/src/phone.test.ts` 5, `app/src/copydoc.test.ts` 25,
  `app/src/names.test.ts` 4, `scripts/lib/bundle.test.ts` 3, `scripts/lib/lighthouse.test.ts` 3, `scripts/lib/lock.test.ts` 3, `e2e/lib/exceptions.test.ts` 4.
- `l6.test.ts` (slice 6) checks that every L-6 column adds up as displayed (the years, your stay, the payments, each tax year),
  the ties to L-1, the bridge and the rank list, the anniversary edge (a payment on your stay's last day is counted; on the
  day after, it's year 4's but past the stay), and works every L-6, L-1 and bridge derivation line by line as displayed
  (`footsAsDisplayed`: each "=" is the arithmetic of the lines above it, to the precision shown). `smoke.e2e.ts` checks that the
  worker is asked for L-6's payments only once it's opened.
- `prices.test.ts` (slice 8) renders every schedule, every derivation they reach and the methodology with
  prices in Charlotte, and fails on any label that still names U.S. prices; it also checks the rent note
  against L-3's rent lever to the cent.
- `defaults.test.ts` checks every default in the registry against the engine: an offer with
  the field at its default projects exactly as one with the default's value entered.
- `validate.test.ts` checks each problem at its path, and whether the engine also throws for
  it. `help.test.ts` renders every view of the inputs (each section, each row editor) and fails
  on an input without help, or help that's too long, too short or unused.
- `metrics.test.ts` renders the schedules, L-1 and the bridge (react-dom/server) and fails if
  any tickmark's figure lacks a tickmark kind, a methodology section or a derivation,
  drill-downs included, or if a section has no anchor on the methodology page. It also
  checks the hero against §4.1 and the bridge against W4 to the dollar.
- **Property tests** (2026-10-14, audit T4; fast-check, generators in `app/src/arbitrary.ts`): random valid offers and households
  (joint filing with a spouse's wages, NYC and Philadelphia, start dates on any day, rent of $0, cash before day one, guaranteed
  first bonuses, ranges). `properties.test.ts`: each year's tax on the offer stacks on the household as described, salary in the
  window is pay for the offer's own days, a stay's payments are in the window, a guaranteed first bonus is the target in every
  scenario. `display.test.ts`: the whole page, L-3, L-4, L-6, the CSVs and the copied document are worked out without NaN; every
  derivation on the page foots as displayed (`footsAsDisplayed`, now in `testing.ts`); a figure reads the same wherever it appears;
  the verdict's month is its work's and L-2's. `it.fails` marks a property a known bug breaks: the fix turns it into `it`.
- Hand-checked values carry their arithmetic in comments.
- `npm test` also runs `scripts/check-engine.ts`, the no-formatting-in-the-engine guard.
- **Frozen law** (2026-10-15, audit T2): `vitest.config.ts` runs every test on a frozen copy of the amounts published for years
  after 2026 (`test/frozen-enacted.ts`: 2027's HSA limits), except `test/law.test.ts`, which runs on `src/tax/params/enacted.ts`
  and pins what it lists. So a data refresh fails `law.test.ts` alone; a simulated 2027 refresh (brackets, standard deduction,
  402(g), 127, 132(f), the wage base) failed 46 tests in 11 files before, and 2 after, both in `law.test.ts`.

**Other:**
- `npm run offers` prints the sample tables (NYC IB analyst, Charlotte corporate finance,
  Seattle tech finance), plus FMR vs BEA-derived rent estimates. Inputs are illustrative,
  not market data.
- **Design docs:**
  - `docs/offer-model.md`: approved rev 3, updated per slice. Its §12 types were the
    pre-build proposal; `src/offer/types.ts` is authoritative.
  - `docs/ui-design.md`: UI design, approved rev 3 (2026-10-09). Audit tickmarks are the
    signature element; the default basis is "After rent, at U.S. prices". §12 lists the
    UI slices by stable number, with the build order (rev 3).
  - `docs/ui-slices-4-8-plan.md`: the approved plan for UI slices 4-8 (2026-10-09), in build
    order 5, 4, 8, 7, 6.
  - `docs/slice-3-plan.md`: the approved plan for UI slice 3 (detailed mode, JSON
    export/import) and the public-repo prep after it.
  - `docs/copy-as-document-plan.md`: Copy as document, as approved (with the user's five changes) and built; its sample output,
    `docs/copy-as-document-sample.html` (the samples on 2026-10-12; open it in a browser to paste-test).
  - `docs/user-testing.md`: what testers raise, one row per finding (date, finding, how many testers, what it led to). Keep
    adding to it as findings come in.
  - `docs/v2-plan.md`: v2, **planned (2026-10-13; D1 and D14 approved), not built.** In priority order: Beyond the money (your own
    values per offer, and where they flip the verdict), market benchmarks (BLS OEWS, May 2025), negotiation help, and accuracy
    (days off, commuting, relocation, cross-state tax, startup options, PSLF). With a performance plan (step 0 makes room on the
    main thread first), questions for testers before each item, and decisions D1-D15 for the user.

## Old: Decisions (2026-10-08)
- **The repo stays private for now.** The goal is "user-ready" first; going public comes after.
  The public-repo settings and the visibility switch are deferred. Their checklist, with each
  setting, is `docs/slice-3-plan.md`, "Public-repo prep", item 7. The prep in the repo is done:
  no LICENSE ("© 2026 Owen Chapman. All rights reserved. Source shown for review only." in the README, and "© 2026 Owen
  Chapman. All rights reserved." in the site's footer), the README, the
  neutral opening line here, `fetch-fmr`'s honest User-Agent and `--file` fallback, CI, `.claude/`
  ignored. The history scan (2026-10-08) found only noreply author addresses, no secret-shaped
  strings and no sensitive files; re-run it before switching the visibility.
- **Pull requests by agreement** (see Working agreements). Not enforced: rulesets and branch
  protection on a private repo may need a paid plan.
- **Bundle budget 120 kB, with Lighthouse beside it** (2026-10-09). The bundle check catches
  regressions: it fails as soon as what we ship grows past the budget, whatever the cause. Lighthouse
  measures what users feel: the Largest Contentful Paint on a throttled phone, at most 2.5 s (Google's
  "good" threshold). Kilobytes are a proxy for that, so the proxy's ceiling rose 10 kB while Lighthouse
  holds the outcome.
  - Lighthouse runs from the `lighthouse` package (13.5), not `@lhci/cli`: that one's last release
    (June 2025) pins Lighthouse 12.6 and brought 17 npm advisories.
  - `scripts/lib/serve.ts` serves `dist/` compressed, with `vercel.json`'s headers, as Vercel does;
    `vite preview` sends files uncompressed.
- **The year figures as shown: approved** (2026-10-12; built in slice 6, stop A; `app/src/footing.ts`, `workpaper.ts`). Every
  figure is rounded once, where it's worked out (a year's salary is its payments, each to the cent, added, then rounded), and a
  subtotal is the sum of the rounded items above it, so every column adds up as displayed and a figure shown in two places
  (L-1, the bridge, L-6) is one figure. In a calendar year's tax with the offer, the federal income tax line absorbs the
  rounding, and its working (Show the work) gives the unrounded figure. A few year figures differ by a dollar from the
  engine's own rounding, and from W4/W4a in `docs/ui-design.md` (A's year 1 after rent is 62,594, not 62,595). Present values,
  the verdict and per hour stay the engine's: a present value isn't a sum of the years. Apply the same rule to anything new
  that adds up (CSV included); don't change it without the user.
  - **Extended to every derivation** (2026-10-14, audit C12-C15, item 4 of the audit's fix list): every Show the work foots as
    displayed, exactly (`footsAsDisplayed`, no tolerance; `display.test.ts` checks every figure on the page for generated offers).
    A present value's total stays the engine's, and one line takes the rounding (`shownPv` in `derive.ts`: the tax; the largest
    benefit; the money saved at face value), its own work showing the same figure. A gap is the totals as shown, subtracted, and
    "a month" is that gap ÷ the annuity factor as shown, rounded once (`shownGap`, `monthOf` in `verdict.ts`): the verdict, the
    stays row, the steps, L-2 and the copied document state it so, so it can differ by a dollar from the engine's `perMonth`. L-3's
    rent that ties is worked from the figures shown (`rentTie` in `breakevenModel.ts`), a dollar from the engine's closed form at
    most. Quotients (per hour, extra hours) show the decimals they need to work out to the engine's figure (`quotient`).

## Old: Next steps
The plan for slices 4-8 (`docs/ui-slices-4-8-plan.md`) is done: slice 6's stop B (2026-10-12) was its last review stop. At
stop B the user chose CSV for L-1's and L-2's table views as well as L-6's tables, and JSON exports that carry the
hide-tickmarks setting as they carry the theme. Then (2026-10-12) three follow-ups: the print choice, 2027's published federal
amounts, and the data refresh calendar below. The user is now putting the tool in front of a few people before deciding what to
build next: ask before starting anything new (the Roadmap below; the Pre-launch checklist before going public). User
testing started on 2026-10-12; record each finding in `docs/user-testing.md` as it comes in (two testers asked for the comparison
as a document: "Copy as document" is built; the user's own paste into Google Docs worked, and the other testers' reaction to it
isn't recorded yet). **v2 is planned in `docs/v2-plan.md`** (2026-10-13): D1 (the scope, on the principle "The tool informs the
decision and shows its work; you make the call") and D14 are approved, and D2-D15 stand as recommended unless the user comments on
pull request #29 (merged 2026-10-13). Don't start any v2 feature: the user is putting the plan's tester questions to testers first, and
will come back with the answers. Step 0, the plan's performance step, is done (pull request #31: the main thread 117.35 to 109.69 kB
gzip, LCP 1.95 s to 1.87 s). Data checks are due soon: SSA's 2027 wage base from Oct 14, and the IRS's
2027 inflation revenue procedure and 402(g) notice any day now ("Data refresh calendar", Next checks).

## Old: Code map
- `src/tax/`
  - `index.ts`: `computeTaxes(input, params?)`.
  - `params/`: 2026 data, `federal2027.ts` (amounts published for 2027 so far), `enacted.ts` (`ENACTED`, the list of them by
    year), `paramsForYear` (each federal amount projected from its latest published value), the SALT schedule.
  - `federal.ts`, `state.ts`, `local.ts`.
- `src/offer/`
  - `types.ts`.
  - `project.ts`: `projectScenario`, `leaveDateSweep`, `leaveDaySweep` (any last days, so a
    step lands on its own date), `keptIfLeaving`.
  - `compare.ts`: `projectOffer`, `compareOffers`, `comparisonWindow`, `breakeven` (and
    `breakevenSteps`, the same search a projection at a time), `rentFlip` (and `rentFlipFrom`, its closed
    form from projections already made), `horizonSweep`,
    `monthlyEquivalent`.
  - `cliffs.ts`: `cliffs`, `nextCliff` (optionally past some cliffs: L-4 skips a prorated
    clawback's monthly steps, which say `prorated: true`).
  - `withholding.ts`: `withholdingShortfall`.
  - `validate.ts`: `validateOffer`, every input problem as `{ code, path, params }` (words:
    `formatIssue` in `src/format`).
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
  - `cities.json` / `cities.ts`: the slim city list (code, name, states, data years) for
    the UI's main thread. Generated; don't edit.
- `src/format/`: words for the engine's numbers and codes: event and benefit labels and
  formulas, warnings, assumptions, `usd`, `pct`, `describeSchedule`. Not part of the
  engine; the UI and the scripts use it.
- `src/samples.ts`: the three sample offers (illustrative), shared by the table script,
  the benchmark and the UI.
- `app/`: the UI (React 19, Vite 8; its own `tsconfig.json`).
  - `src/model.ts`: the offer draft (`OfferDraft`: `OfferInput` field by field, null = at
    its default or blank) ↔ `OfferInput`; the samples, moved to start on or after
    today.
  - `src/session.ts`: state, reducer (drafts edited by path, imports, resets), localStorage;
    schema 3 ("Prices in", `household.pricesIn`), migrating v1 and v2. `revision` counts imports and resets.
  - `src/prices.ts`: "Prices in" and its words ("after rent, at Charlotte prices", "Charlotte $"),
    `US_PRICES`, and `shortCity` (a metro's first principal city, by the Census title rules).
  - Inputs: `help.ts` (every field's name and place, and quick mode's hints; no React: see Bundles), `quickHelp.ts` (quick
    mode's and About you's ⓘ help, loaded as a pointer or focus reaches an ⓘ, or with detailed mode; its lazy module,
    `quickHelp`, is in `fields.tsx`), `helpText.ts` (detailed mode's help text, loaded with it), `defaults.ts` (the defaults
    registry), `fields.tsx` (rows and their help, problems at the field: what quick mode
    needs), `controls.tsx` (detailed mode's controls: numbers, "+ range", choices, plans, the
    row editor, the engine's warnings at their field), `rows.tsx` (quick mode's fields),
    `Detailed.tsx` (the sections), `editors.tsx` (promotions, bonus by year, grants,
    refreshers, cash awards, match tiers, vesting steps), `summary.ts` (one-line summaries),
    `presets.ts` (the vesting presets, checked against the engine's), `comparability.ts` (the
    asymmetry warning).
  - `lazy.ts`: a module loaded on first use that components read synchronously once it's
    there (`Ledger.tsx`'s `detailedModule`, `Tickmarks.tsx`'s `derivations`); tests supply
    them up front. `testing.ts` is shared by the tests only.
  - `src/exchange.ts` (export and import: format, schema, the shape check) and `src/Data.tsx`
    (the Data page).
  - `src/engine.worker.ts` and `src/useEngine.ts`: the engine in a Web Worker, debounced
    200 ms, stale generations dropped. `src/compute.ts` is what it computes per request:
    `horizonSweep`, your stay's full projection per offer (`StayDetail`), annuity terms, the rent
    note's rent flips (from those projections) and rent estimates. Only the worker and tests import it.
  - **Bundles:** only the worker holds the engine and the BEA/HUD tables. The main thread
    imports engine types, `src/col/cities.ts`, the samples and the vesting presets (`src/offer/presets.ts`, pure, which
    `app/src/presets.ts` re-exports) only. `src/protocol.ts` holds the
    message types and `rentKey`: never import values from `engine.worker.ts` or
    `compute.ts`.
  - `src/verdict.ts`: the lead schedule's view model, including pay per extra hour and the verdict's sentence (`verdictSentence`).
  - `src/footing.ts`: the year figures as shown (`shownYears`, `shownStay`), shared by L-1, the bridge and L-6, and the BEA
    indexes as shown (`indexDigits`, `shownIndexes`). Main thread; no place names (see "The year figures as shown").
  - `src/TheWork.tsx` is L-6; `src/workpaper.ts` its view model (the year table's numbered lines, your stay's totals, the
    payments by year and kind, each tax year's columns, the rate's digits, and the figures' display text: `moneyText`, `rowText`),
    shared with `derive.ts` and `csv.ts`. Its payments come from `paymentsJob` (`slowJobs.ts`), asked for with `workJob`
    (`protocol.ts`) while it's open, or the page is laid out for print.
  - `src/copyDoc.ts` (loaded on the first click of "Copy as document"): the document model (`buildDoc`: blocks and the calculations it
    states, `worked`), its renderers (`toHtml`, `toText`), and `prepare` (asks for L-3's and L-4's slow jobs, waits, builds). The
    button is `CopyDocument` in `App.tsx`. It shares wording with the page: `yearNotes` (L-1's notes, `metrics.ts`), `leaveTerms` (M-9's
    terms, `leaveModel.ts`), `warningWords` (`src/warningWords.ts`, L-5's lines).
  - `src/csv.ts` (loaded on the first download): each table's CSV (`build`, `csvFile`, `downloadCsv`), from the view models.
    `src/print.ts` (loaded on the first Print): the Print button's wait for every schedule, then `window.print()`.
  - `src/media.ts`: the layout's widths (`PHONE`, `TABLET`, as `styles.css` has them) as `useMedia`, the phone keyboard
    (`useKeyboardUp`) and `useFocusClearOfBars` (WCAG 2.4.11).
  - Show the work: each figure's metric id maps to a tickmark kind, a methodology section
    (`src/sections.ts`) and a derivation built from the engine's numbers.
    - `src/metrics.ts`: what the page renders: the ids, their tickmark kinds, the lookups, the rent note.
    - `src/byYearModel.ts`: the view models behind L-1 (`byYear`, `yearNotes`) and the bridge (`bridge`), so the figures and
      their derivations share one source; shared with `derive.ts`, `copyDoc.ts`, `csv.ts`, L-6 and the methodology. It loads
      with L-1, and `footing.ts` with it (step 0, 2026-10-13).
    - `src/derive.ts` (loaded on first use): the derivations and their words, beside
      `src/format`'s. Pure. The BEA indexes show the fewest decimals (3-6) at which every
      product foots to the dollar (`indexDigits`).
  - `src/figures.tsx`: `Fig` (a figure and its tickmark, one button), `TickButton` (a lone
    mark), `Trace` (an input derivations can light up), `useRovingTicks`, the context they
    read, and `CsvButton` (its CSV code a dynamic import). No `react-dom`, nothing from `metrics.ts` at run time (see Bundles).
  - `src/ui.tsx` also holds the `TickSetting` context (the legends' "Show tickmarks") and `Printing` (the page laid out for print:
    `usePrinting`). `src/axes.ts` has `useChartWidth`, the charts' width, measured again when the print layout comes and goes.
  - `src/Tickmarks.tsx`: `WorkProvider` (it provides that context, with each figure's tickmark
    kind), the popover, and the derivations' lazy module; it re-exports the figures. The context object stays the same
    while the page's context changes (it reads the latest through a ref), so a memoized subtree (L-6's tables) skips its
    figures on each key: with L-6 open, a keystroke renders in ~10 ms, where it took 60-120 ms before.
  - `src/ByYear.tsx`: L-1 (the hand-built SVG chart, notes, table view) and the bridge. Loaded as you scroll toward it, like
    L-2 to L-6, since step 0 (2026-10-13); the first-use note's "See how we get there" loads it first (`showBridge`).
  - `src/Later.tsx`: the schedules under the two columns, L-1 to L-6, each loaded as you scroll toward it
    (`useLoadNear` in `lazy.ts`), and `loadLater` (all of them, for Print…). `src/Risk.tsx` is L-2; `src/cases.ts` its view model (values by
    scenario, the leads, what differs in a scenario, in words), shared with `derive.ts`.
  - `src/jobs.ts`: the worker's two lanes. Edits run ahead of the next chunk of any slow job;
    slow jobs are keyed generators, replaced by a newer job with the same key; a higher priority runs
    first (the close-call line's breakeven).
    `src/slowJobs.ts` (worker only) holds them: L-4's curves (`leaveJob`, sampled by `sweepDays`)
    and its panel at the last day (`cursorJob`); breakevens (`breakevenJob`: L-3's, or the close-call
    line's one), remembered by their inputs so L-3 reuses the line's. `tieJob` in `protocol.ts` builds
    both requests alike. `useEngine` sends them (`requestSlow`, skipping a
    request identical to the last) and reports `updating` from the render that changes the inputs.
  - `src/Warnings.tsx` is L-5. `src/warningAt.ts`: the field each engine warning is about (detailed
    mode and "Show at the field"), and the withholding figure as displayed; `src/warningKinds.ts`: L-5's
    kinds, your stay's warnings grouped, and the count the lead points with (the worker computes it).
  - `src/Breakeven.tsx` is L-3; `src/breakevenModel.ts` its view model (the rows, the cash lever's name,
    what scales with salary), shared with `derive.ts` and the methodology. `useOnScreen` (in `lazy.ts`)
    starts L-3's and L-4's slow jobs.
  - `src/Leaving.tsx` is L-4; `src/leaveModel.ts` its view model (the axis by calendar date, the
    curves, markers and clawback segments, the panel's words, the reconciliation with the stay),
    shared with `derive.ts`. `src/axes.ts`: the charts' tick helpers.
  - `src/Methodology.tsx`: `#/method`, lazy-loaded. Routes are hashes (`App.tsx`):
    `#/`, `#/method`, `#/method/M-7.2`.
  - `About.tsx`, `Ledger.tsx`, `Lead.tsx` (with the first-use note and the tickmark hint),
    `ui.tsx` (the tickmark table, stamps, inputs), `styles.css` (the workpaper tokens).
  - Windows: `cases.ts` and `Risk.tsx` are named apart on purpose, like `metrics.ts` and
    `Tickmarks.tsx`; `work.ts` and
    `Work.tsx` collide on a case-insensitive file system.
- `scripts/`: `grid.ts` and `oracle.py` (validation), `run-oracle.ts`,
  `offer-table.ts`, `bench.ts`, `check-engine.ts`, `check-bundle.ts` (with `lib/bundle.ts`), `lib/lock.ts` (the oracle's locked environment, for `run-oracle.ts`),
  `lighthouse.ts` (with `lib/lighthouse.ts` and `lib/serve.ts`), `serve-dist.ts` (the build for Playwright),
  `fetch-rpp.ts`, `fetch-fmr.ts`, and `lib/zip.ts` (zip and xlsx readers for the fetch scripts).
- `e2e/`: Playwright (its own `tsconfig.json`; files end `.e2e.ts`, so vitest skips them).
  - `a11y.e2e.ts`: the scan's states. `lib/app.ts` drives the app (sections, editors, L-1 shown (`showByYear`: on a phone it's
    screens down), L-1 to L-5 loaded, L-6 open on an
    offer (`openWork`, after the schedules above have filled in: one filling in mid-click moves L-6), when the page has settled:
    `quiet` also waits for L-3 or L-4 near the screen that are working out their first figures, which axe would catch dimmed, and works out any loaded off screen: since 2026-10-12, when CI caught L-4 starting mid-scan on a tablet); `lib/axe.ts` scans and applies `test/a11y-exceptions.json`
    (`lib/exceptions.ts`); `lib/reporter.ts` writes `.a11y/report.md`.
  - `smoke.e2e.ts` (with CSV downloads, the Print button and Copy as document, read back from the clipboard), `keyboard.e2e.ts` (with the hide-tickmarks setting); `mobile.e2e.ts`
    (the phone's tabs and the verdict bars, in the `phone` and `tablet` projects). `lib/app.ts`'s `stubPrint` counts
    `window.print()` calls instead of opening a dialog (and no afterprint follows, so the print layout stays to be scanned), and
    `printWithButton` presses Print and waits for the call.

## Old: Roadmap (remaining)
Numbers are stable IDs; item 1 (COL-adjusted total, rent growth) is done.

2. UI: slices 1-3 live; what's next, in order, is in Next steps (slice numbers per
   `docs/ui-design.md` §12).
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
   misleading defaults, per NN/g calculator guidelines) and a methodology page. Done in UI
   slices 1-3.
7. "Next cliff" UI: from any leave date, show the next vest, bonus payout or clawback
   step, and the after-tax value of staying until it. Engine done (`cliffs`,
   `nextCliff`); the UI shows it in L-4.
8. HUD Fair Market Rents by metro as the rent estimate. Done (2026-10-08): `npm run
   fetch-fmr`, FY2027, matched to BEA metros by CBSA code.
9. HUD Small Area FMRs (ZIP-level) for neighborhood rent estimates:
   - Why: metro FMRs average the city center with the suburbs, so a Manhattan or
     downtown-Seattle 1-bedroom runs well above the metro figure.
   - Shape: an optional ZIP field per offer. Its SAFMR is used when given; otherwise the
     metro FMR.
   - Data: HUD publishes SAFMRs for every metro ZIP each fiscal year (the
     `fy<year>_safmrs` file). A ZIP ↔ FMR-area crosswalk comes with it. Bake it like
     `fmr.json`, but keep it out of the main bundle: tens of thousands of ZIPs is likely
     megabytes of JSON, so load it in the worker, or on demand.
