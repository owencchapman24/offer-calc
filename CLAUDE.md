# Offer Calc — context for Claude Code

A job-offer comparison calculator. Differentiator: do the math correctly, in one pipeline —
gross comp -> after-tax -> location-adjusted -> per hour of your life, year by year (years 1-5),
and show the work. Correctness and a clear methodology page matter more than features.

## Status (2026-10-12)
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
  - `lighthouse`: builds, then `npm run lighthouse` (the runner's Chrome); a warm-up, then three runs; the median LCP's run's report is
    uploaded as the `lighthouse-report` artifact;
  - `e2e (1/4)` to `e2e (4/4)`: four shards (`--shard`), each building, installing Playwright's Chromium (cached) and running
    its quarter of `npm run e2e` (one retry for a slow runner), writing a blob report; then `e2e` merges them
    (`e2e/merge.config.ts`) into one accessibility report and one Playwright report, uploaded as `a11y-report`, and fails if
    any shard did. A newer push to a pull request cancels its older run.
  - Settings: framework none, `npm ci`, `npm run build`, output `dist/`.
  - `vercel.json` sets the CSP, `Referrer-Policy`, `nosniff` and `Permissions-Policy`,
    plus a one-year immutable cache for `/assets/`. All were checked live.
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
    in `fields.tsx`. `npm run build` then `grep -c modulepreload dist/index.html` is 0 when the main thread is one chunk.
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

## Pre-launch checklist
Before the repo and the app go public (deferred, see Decisions):
1. **The public-repo settings and the visibility switch:** `docs/slice-3-plan.md`, "Public-repo prep", item 7.
2. **Re-run the history scan** (author addresses, secret-shaped strings, sensitive files) right before switching.
3. **Run the NVDA walkthrough** (`docs/nvda-walkthrough.md`, about 30 minutes, NVDA with Chrome): the user runs it and
   sends the Speech Viewer log; fix what it finds. With it, the plan's VoiceOver pass on a phone for the offer tabs and the
   verdict bar (`docs/ui-slices-4-8-plan.md`, slice 7).

## Decisions (2026-10-08)
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

## Next steps
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

## Commands
- `npm test`: unit tests (engine and app) plus the engine formatting guard.
- `npm run typecheck`: `tsc -p .` (src and test, no Node types), `tsc -p scripts` (Node
  types), `tsc -p app` (DOM, React) and `tsc -p e2e` (the Playwright tests).
- `npm run oracle`: engine vs PolicyEngine-US for 2026, ~3-4 min. It needs a `.venv` installed from
  `requirements.txt` with `requirements-lock.txt` as constraints (see README); the runner picks `.venv`'s Python
  automatically, and warns first if the environment differs from the lock (`scripts/lib/lock.ts`).
- `npm run offers`: sample comparison tables.
- `npm run fuzz`: the property tests (`app/src/properties.test.ts`, `display.test.ts`) on a random seed with ten times the runs,
  shrinking each counterexample; it prints the seed (`FUZZ_SEED=<seed> npm run fuzz` replays it). `npm test` runs them on a fixed
  seed.
- `npm run dev` / `npm run build` / `npm run preview`: the app (Vite, config in
  `app/vite.config.ts`), built to `dist/`.
- `npm run bench`: engine timings on the sample offers (median of warm runs). Re-run after
  engine changes; the UI's live-update budget depends on them.
- `npm run check-bundle`: after `npm run build`, the JS a quick-mode visit loads, gzipped, against
  the 120 kB budget (`scripts/lib/bundle.ts`). CI runs it.
- `npm run lighthouse [-- <url>]`: after `npm run build`, Lighthouse's mobile profile on the
  production build, a warm-up (discarded) and three runs; fails if the median LCP is over 2.5 s
  (`scripts/lib/lighthouse.ts`). With a URL it audits that page instead (the live site). It needs
  Chrome or `CHROME_PATH`; on Windows without Chrome it uses Edge and closes it over the DevTools
  protocol (Edge relaunches itself, so killing the launched process leaves the browser running).
  The median LCP's run's report goes to `.lighthouse/report.html`.
- `npm run e2e`: after `npm run build`, Playwright (`e2e/playwright.config.ts`) on the production build,
  served by `scripts/serve-dist.ts` on port 4180 (a running one is reused locally): the accessibility scan
  in four projects, then the smoke and keyboard tests. Locally it drives the installed Edge
  (`channel: "msedge"`), so nothing is downloaded; CI installs Chromium. The scan's report goes to
  `.a11y/report.md`, Playwright's to `.playwright/report/`. One project: `npm run e2e -- --project=phone-dark`.
  Don't pass `--reporter`: it replaces the config's reporters, the scan's included.
- `npm run fetch-rpp`: re-download BEA RPPs into `src/col/rpp.json`. Run it when BEA
  publishes a new vintage (usually December).
- `npm run fetch-fmr [-- <FY>] [--file <FY27_FMRs.xlsx>]`: re-download HUD Fair Market Rents
  into `src/col/fmr.json` (then the city list). Default FY 2027. HUD publishes each fiscal
  year's FMRs in August or September, effective October 1. The script's User-Agent names the
  project; HUD USER answers non-browser clients with an empty 202, and then the script prints
  the file's URL to download in a browser and pass with `--file`.
- `npm run build-cities`: regenerate `src/col/cities.json`, the UI's slim city list. Both
  fetch scripts run it, and a test fails if it's stale.

## Code map
- `src/tax/`
  - `index.ts`: `computeTaxes(input, params?)`.
  - `params/`: 2026 data, `federal2027.ts` (amounts published for 2027 so far), `paramsForYear` (each federal amount projected
    from its latest published value, `ENACTED`), the SALT schedule.
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
    imports engine types and `src/col/cities.ts` only. `src/protocol.ts` holds the
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

## Working agreements
- **Pull requests** (adopted 2026-10-08, by agreement; not enforced): one branch per slice or
  fix, and every change reaches `main` through a pull request. Never push `main` directly.
  1. `git switch -c <branch>`, commit, `git push -u origin <branch>`;
  2. `gh pr create` (the body ends with the Claude Code line);
  3. `gh pr checks --watch`: CI must pass;
  4. `gh pr merge --merge --delete-branch` (a merge commit, as `--no-ff` was), then
     `git switch main` and `git pull --ff-only`.
  Before opening the PR: tests and typecheck pass locally, the grid is unchanged (`npm run
  grid`; `grid_ts.json` is ignored, so compare against `main`'s output), and `npm run build`
  for UI work.
- **Merging to `main` deploys to production** (Vercel, offer-calc.vercel.app). Keep main green.
- **Tests:** hand-check at the edges: the day before vs the day of a vest, payout or
  window end; thresholds; bracket crossings.
- **Review stops:** stop after each slice for review.
  - Engine slices: show the `npm run offers` tables.
  - UI slices: show light and dark screenshots of the live site and note anything that
    differs from the design.
- **Tax-engine changes:** branch, then separate commits. After each: tests pass and the
  2026 oracle report is byte-identical to the baseline (or the diff is explained).
- **Windows PowerShell 5.1:** pass multi-line commit messages with `git commit -F <file>`;
  embedded double quotes break native argument passing.
- **Live screenshots:** the desktop app's browser pane didn't render this app. Headless Edge
  (`msedge --headless=new --remote-debugging-port=<port>`) driven over the DevTools protocol
  with Node's built-in WebSocket works: screenshots, real key presses, file inputs
  (`DOM.setFileInputFiles`), downloads. Close it with `Browser.close`, then
  `taskkill /pid <pid> /T /F`: Edge relaunches itself, so `kill()` leaves processes behind (about
  290 once, which crashed vitest's workers).

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
  New text goes in `src/format`. `scripts/check-engine.ts` (run by `npm test`) fails on
  `toLocaleString`, `Intl` or an import from `src/format` inside the engine.
- Generated data files aren't edited by hand:
  - `src/col/rpp.json` (`fetch-rpp`), `src/col/fmr.json` (`fetch-fmr`);
  - `src/col/cities.json` (`build-cities`, which both fetch scripts run; a test fails if
    it's stale).
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

## UI conventions (keep these)
- **Bundles:** the main thread never imports engine values (`src/offer`, `src/tax`,
  `src/col/index.ts`, `src/col/rent.ts`); type imports are fine.
  - It uses `src/col/cities.ts` (the slim city list) and gets everything else from the
    worker.
  - Message types and `rentKey` live in `app/src/protocol.ts`. Never import a value from
    `engine.worker.ts`: that pulls the engine and its data into the main bundle.
- **Type:**
  - Atkinson Hyperlegible Next for all text and figures.
  - `font-variant-numeric: tabular-nums` wherever numbers align: tables, axes, inputs, the
    rank list. Next's `tnum` makes every digit 632 units wide; checked in the shipped
    Fontsource files.
  - Proportional figures on the hero number.
  - Atkinson Hyperlegible Mono only for formulas and derivations.
- **Samples:** `src/samples.ts` keeps fixed dates (start 2026-07-13) for the table script
  and tests. The app moves them forward by whole years to start on or after today, next
  July, so PV is taken from today. They're stamped illustrative wherever they appear.
- **Today:** the app passes the user's local date as `valuationDate`; nothing in `src/`
  reads the clock.
- **Colors and marks:** offer colors (cobalt, berry, bronze) are for marks and rules only;
  text stays ink. Each offer keeps its letter and color for life. Tokens and validation are
  in `docs/ui-design.md` §9; re-run the dataviz validator if a color changes.
- **Defaults:** every default shows as a real value with a `D` tickmark; every estimate
  shows an `E` tickmark.

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
  promotions. A federal amount published for a later year (`ENACTED`, one file per year: `federal2027.ts`) is used as
  published in its year, at any inflation, and later years scale it from there; everything else scales from 2026.

**Scenarios, PV and comparisons**
- **Scenarios:** bear/base/bull are joint scenarios, not percentiles. Each sets every
  uncertain input at once: bonus, raise, price growth, refresher size, which promotions
  happen. Single-input sensitivity is for the planned tornado chart.
- **Present value:** each event's after-tax cash is discounted by
  (1 + r)^-((date - valuationDate) / 365.25), default r = 5% nominal. The UI passes
  today's date.
- **Comparison window:** earliest start + horizon, so a later start counts as lost pay: exactly its days, since accrued pay, benefits
  and rent are cut at the window's edges as at anniversaries (`cuts` in `project.ts`, 2026-10-14, audit C3). A payment before the
  start date counts in the window from the start date, taxed when it's paid (audit C4).
  The engine defaults to 5 years; the UI's "How long do you expect to stay?" defaults to 4.
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
   Single $60k-$200k: 42/51 within $5 and 44/51 within $6 (NE -$5.67, WI -$5.59, from
   `oracle_report.json` of 2026-10-08; this line said "44 within $5" until then). The 7
   over $10 are all listed below (VT, CO, ND, OR, CT, AR, MO). A new state over $10 there
   is a regression. The methodology page (M-4) quotes these figures: update it with them.
   The oracle checks 2026 only. Projected years are covered by `test/params.test.ts`.
   Offer-model changes don't touch the engine: check that `npm run grid` output is
   unchanged instead.

## Data refresh calendar
Every dataset the tool depends on: when it's usually published, how to refresh it, and what to re-run afterward. Dates in
parentheses are the last ones seen. A refresh is a change like any other: its own branch and pull request.

**Next checks** (set 2026-10-12):
- **2026-10-14 and after: SSA's 2027 wage base** (with the COLA). Add `socialSecurityWageBase` to `FEDERAL_2027`.
- **Now to mid-November 2026: the IRS's 2027 inflation revenue procedure** (brackets, standard deduction, 132(f), and
  127, indexed from 2027) **and the 402(g) notice.** Add them to `FEDERAL_2027`. If neither is out by **2026-11-16**, check weekly.
- **December 2026 to February 2027: BEA's 2025 RPPs, Pub. 15 and 15-T for 2027, the states' 2027 payroll caps, then the Tax
  Foundation's 2027 state table** (the start of moving the base year to 2027, below).
- **The Census's 2025 ACS 1-year estimates:** delayed with no date (the Census Bureau's advisory of Aug 4, 2026; still none in
  September). Check its release schedule monthly.

**After any tax data change:** `npm test` (hand-checked values in `test/tax.test.ts`, `test/params.test.ts` and
`test/offer.test.ts` may move: redo their arithmetic), `npm run typecheck`, `npm run grid` (2026 only: byte-identical unless 2026
law changed), and `npm run oracle` (2026 against PolicyEngine-US: byte-identical, or the diff explained, and M-4's match
statistics updated with it; for a later year's amounts, compare with PolicyEngine-US's own parameters for that year where it has
them). `npm run offers` shows what the samples do. Tax-engine changes go in separate commits, each passing the above.
**After any price or rent data change:** `npm test` (a test fails if the city list is stale), `npm run offers`, `npm run build`,
and `npm run e2e` if a figure the scan or smoke tests read moved.

**Federal tax** (`src/tax/params/federal2026.ts`; amounts published for later years in `federal2027.ts` and so on, listed in
`ENACTED` in `params/index.ts`, with their sources):
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
- **Supplemental withholding rates (22%, 37% over $1 million) and the percentage method** (`src/offer/withholding.ts`, which
  builds its tables from the year's brackets and standard deduction): IRS Pub. 15 and Pub. 15-T, each December for the next year.

**Payroll:**
- **Social Security wage base:** SSA's COLA fact sheet, mid-October for the next year (2026's $184,500 was announced Oct 24, 2025,
  late for the shutdown; usually around Oct 10-15). In `PAYROLL_2026`, or a later year's file (`socialSecurityWageBase`). State
  payroll taxes capped at it (`wageCap: "ssWageBase"`) follow by themselves.
- **State payroll taxes with their own caps and rates** (`payroll` in `states2026.ts`: NJ $171,100, NY Paid Family Leave $95,350,
  MN $185,000, RI $100,000, and every rate): each state sets the next year's, usually September to December; PolicyEngine-US
  carries them once it updates.

**State and local tax** (`src/tax/params/states2026.ts`, special rules in `src/tax/state.ts`, `src/tax/params/local2026.ts`):
- **State income tax law:** the Tax Foundation's "State Individual Income Tax Rates and Brackets" table each February (2026's: data
  as of Feb 11, 2026), then `OVERRIDE:` entries for laws enacted after it, each with its bill or statute (most legislatures
  adjourn by June; changes usually take effect Jan 1). PolicyEngine-US's releases are the cross-check, and where an override was
  copied from it, it says so.
- **Indexed state amounts** (`indexed`, so far CA only, and federal links such as `stdDeductionIsFederal`): projected from 2026 until
  the base year moves.
- **NYC income tax rates:** statutory; check NYS IT-201 instructions each January. **Philadelphia wage tax:** changes each July 1,
  announced around June (2026's blend of the two halves is in `PHILLY_2026`).

**Moving the base year** (from 2026 to 2027, once the Tax Foundation's 2027 table is out, about February 2027): new `federal2027`
and `states2027` data, `BASE_YEAR`, the oracle's year and baseline, and the tests' hand-checked values. Until then, amounts
published for 2027 go in `FEDERAL_2027` and the rest of 2027 is projected.

**Prices and rent:**
- **BEA Regional Price Parities** (`src/col/rpp.json`): annually, usually December, for the year two before (the 2024 RPPs came out
  Feb 19, 2026, late). `npm run fetch-rpp` (it rebuilds the city list). The 16% housing weight (`HOUSING_WEIGHT` in `scripts/fetch-rpp.ts`,
  baked into `rpp.json`, and in `app/src/footing.ts`; BEA SCB March 2022) changes only if BEA publishes new weights.
- **HUD Fair Market Rents** (`src/col/fmr.json`): each August or September for the fiscal year starting Oct 1 (FY2027 was published
  Aug 26, 2026). `npm run fetch-fmr -- <FY>`, or `--file` with a copy downloaded in a browser when HUD USER answers with an empty 202.
- **The rent fallback's anchor, the U.S. median gross rent** (`US_MEDIAN_GROSS_RENT` in `src/col/rent.ts`, $1,487, ACS 2024 1-year,
  table B25064): the Census's ACS 1-year estimates, usually mid-September (2024's: Sep 11, 2025). By hand from data.census.gov,
  with the table and date in its comment; it matters only for places without an FMR (BEA state nonmetro portions).

**The oracle's Python environment:** `requirements.txt` pins PolicyEngine-US to 2.30.3, and `requirements-lock.txt` locks every
package of the `.venv` the baseline was taken with (a `pip freeze`: Windows, Python 3.14.7, pip 26.2.1, 2026-10-12;
`policyengine-core` 3.32.21 among them). Install with `python -m pip install -r requirements.txt -c requirements-lock.txt`, so
setting up a `.venv` never moves the baseline; `npm run oracle` warns before it runs if the environment has drifted from the lock.
The lock is from Windows: packages only macOS or Linux need (IPython's `pexpect`, `ptyprocess`) aren't in it, install unpinned
there, and the runner lists them as not in the lock.

Upgrading PolicyEngine-US is a deliberate step, a change of its own (its own branch and pull request), never folded into a data or
engine change, and the lock is regenerated with it, never on its own (a Python upgrade takes the same steps):
1. Take the old report from `main` in the locked `.venv` (`npm run oracle`, saved aside).
2. Bump the pin in `requirements.txt`. In a fresh `.venv` (nothing of the old environment left), install without the lock,
   `python -m pip install -r requirements.txt`, so the dependencies resolve afresh.
3. Regenerate the lock from that `.venv`: `python -m pip freeze` under the lock's header comment, with its date and the Python and
   pip versions updated. `scripts/lib/lock.test.ts` checks that it pins the same PolicyEngine-US as `requirements.txt`. Commit the
   two files together.
4. Re-run `npm run oracle` with nothing else changed (it should say the environment matches the lock), and compare the reports.
5. Explain every difference in the pull request: PolicyEngine fixed or updated something (then our engine may be the one that's
   off: fix it, or add it to the known gaps), or changed how it models something (an intentional difference, or a gap); a change
   in a dependency alone can move the report too. Update the Validation workflow's baseline line (date, version, the match
   counts), M-4's figures, and "Intentional differences" and "Known gaps" as they move.
6. Only then use the new baseline for engine changes.

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
  rounded the way the IRS rounds them (at most ~$50 per threshold), except those the IRS has published (`ENACTED`: so far
  the 2027 HSA limits). The inflation input stands in for chained CPI.
- State conformity: the engine excludes section 125 amounts (premiums, HSA) from every
  state's wages. CA and NJ actually tax HSA contributions.

## Known gaps — offer model
- **Residence and household:**
  - **City taxes:** New York City's income tax and Philadelphia's resident wage tax (2026-10-14, audit C2: `inPhiladelphia`, the
    "Inside Philadelphia" checkbox for the Philadelphia metro in PA, default inside) are counted; Philadelphia's nonresident wage tax
    (3.425%, on commuters) isn't, though the engine has it (`resident: false`).
  - **Nonresident tax:** taxed as a full-year resident of the residence state only. No
    part-year residency in a relocation year, and no nonresident tax or resident credit
    for the employer state; the convenience-of-employer rule (NY, DE, PA; CT/NJ
    reciprocal; NJ's not reaching PA or CT residents, PA's not reaching residents of its reciprocal-agreement states, IN, MD, NJ,
    OH, VA and WV) only triggers a warning.
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
