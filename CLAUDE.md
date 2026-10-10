# Offer Calc — context for Claude Code

A job-offer comparison calculator. Differentiator: do the math correctly, in one pipeline —
gross comp -> after-tax -> location-adjusted -> per hour of your life, year by year (years 1-5),
and show the work. Correctness and a clear methodology page matter more than features.

## Status (2026-10-09)
**Engine: complete for v1** (`src/tax`, `src/offer`, `src/col`).
- **Tax engine:** 2026 law, validated against PolicyEngine-US. Projected later years come
  from `paramsForYear`, cached and frozen.
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

**UI: slices 1-5 and 8 are complete and live at https://offer-calc.vercel.app** (plan for slices 4-8:
`docs/ui-slices-4-8-plan.md`; slices 4, 5 and 8 versus the design: `docs/ui-design.md` §12). **Slice 7** is
under way: its stop A (the automated accessibility scan and its fixes) is done; stop B (phone tabs, sticky
verdict bars) is next.
- **The accessibility scan** (slice 7, stop A): Playwright with axe-core (`e2e/`, `npm run e2e`) on the
  production build, served as Vercel serves it (`scripts/serve-dist.ts`: compressed, `vercel.json`'s CSP).
  29 states (quick mode, every detailed section and row editor, Show the work opened, drilled into and on a
  default, L-1's table view, L-1 to L-5 loaded, L-4 on your stay's last day, the methodology, the Data
  page's import review, its problems, a file it can't import and the delete confirmation), each in four
  projects (desktop 1440 and phone 390, light and dark): 116 scans. Any WCAG 2.0/2.1/2.2 A or AA violation
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
- **Features:**
  - quick mode for 2-3 offers;
  - About you, with "How long do you expect to stay?" (default 4 years);
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
    a ticked table view whose present-value row ties to the rank list.
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
  - `e2e`: builds, installs Playwright's Chromium, then `npm run e2e` (the scan, smoke and keyboard tests;
    one retry for a slow runner); the scan's report and Playwright's are uploaded as `a11y-report`.
  - Settings: framework none, `npm ci`, `npm run build`, output `dist/`.
  - `vercel.json` sets the CSP, `Referrer-Policy`, `nosniff` and `Permissions-Policy`,
    plus a one-year immutable cache for `/assets/`. All were checked live.
- **Bundles** (raw / gzip):
  - **Main thread:** 364.3 / 111.9 kB for a quick-mode visit by `npm run check-bundle` (Node's
    gzip; Vite 8's report reads ~1 kB higher, Rolldown's compressor). Slice 8 ended at 362.7 / 111.4; slice
    4 at 357.9 / 109.7;
    slice 5 at 355.7 / 109.1;
    slice 3 at 351.8 /
    107.7; slice 2 346 / 106; slice 1 276 / 85. Budget: 120 kB gzipped by the check, which CI runs
    after the build (110 kB until 2026-10-09; see Decisions). Slices 4, 8 and 7 add to the main thread
    (the close-call line, the prices control, tabs and sticky bars).
  - **Load time** (`npm run lighthouse`, Lighthouse 13 mobile: simulated slow 4G, 4x CPU slowdown,
    a discarded warm-up, then the median of 3 runs, LCP's and the score's each taken on its own): LCP at most 2.5 s,
    checked in CI. Before the warm-up (2026-10-10), CI's cold first run (TBT ~1 s) could be reported as the median. 2026-10-09: the production build 1.86 s,
    performance 98; the live site 1.47 s, performance 100. The LCP element is About you's assumptions
    line, which renders before the worker answers, so the main chunk's download and parse set LCP.
  - **Keep the main thread in one chunk:** a lazy schedule imports `figures.tsx`, never
    `Tickmarks.tsx`. When a lazy chunk reached `react-dom` or `metrics.ts`' run-time code through
    its figures, Rolldown split React, the model and the help text out of the main chunk (1-2 kB
    more gzip on every visit).
  - **Loaded on first use** (raw / gzip, 2026-10-09): detailed mode 54 / 14 KB (sections, editors,
    controls, its help text), the derivations 69 / 22 KB (when a tickmark is hovered, focused or
    opened), the methodology 49 / 16 KB, the Data page 15 / 6 KB, the engine's warning words 4 / 2 KB,
    L-2 9 / 3 KB plus its view model 4 / 2 KB, L-3 7 / 2 KB, L-4 14 / 5 KB plus its view model 4 / 2 KB
    (each view model shared with the derivations), L-5 6 / 3 KB.
  - `src/format` is split into modules (numbers, issues, schedule, warnings; `index.ts`
    re-exports them) so each chunk takes only the words it uses: a module lands in one chunk
    with every export any chunk uses.
  - **Worker:** ~250 KB. Per edit it runs `validateOffer` on each offer, then `horizonSweep`, your
    stay's full projection per offer, its bear and bull totals (L-2) and its withholding (L-5): about
    50 ms warm on the samples in Node, 35-65 ms in headless Edge (32 before slice 5). L-3's and L-4's
    jobs, and the close-call line's breakeven, run in the slow lane.
  - Only the worker holds the engine and the BEA/HUD tables.

**Tests:** 403 passing (`npm test`), and 95 Playwright tests (`npm run e2e`: the scan's 22 tests in each of four
projects, 2 smoke tests and 5 keyboard tests).
- `test/offer.test.ts` 126, `test/params.test.ts` 22, `test/tax.test.ts` 10,
  `test/validate.test.ts` 57, `app/src/app.test.ts` 24, `app/src/metrics.test.ts` 31,
  `app/src/defaults.test.ts` 43, `app/src/comparability.test.ts` 8, `app/src/help.test.ts` 7,
  `app/src/exchange.test.ts` 7, `app/src/jobs.test.ts` 6, `app/src/leave.test.ts` 14, `app/src/l3.test.ts` 19,
  `app/src/l5.test.ts` 6, `app/src/prices.test.ts` 13,
  `scripts/lib/bundle.test.ts` 3, `scripts/lib/lighthouse.test.ts` 3, `e2e/lib/exceptions.test.ts` 4.
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

## Decisions (2026-10-08)
- **The repo stays private for now.** The goal is "user-ready" first; going public comes after.
  The public-repo settings and the visibility switch are deferred. Their checklist, with each
  setting, is `docs/slice-3-plan.md`, "Public-repo prep", item 7. The prep in the repo is done:
  no LICENSE ("All rights reserved; source shown for review only" in the README), the README, the
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

## Next steps (in this order)
The plan, approved 2026-10-09, is `docs/ui-slices-4-8-plan.md`: scope, build order, review stops
and tests for each slice. `docs/ui-design.md` §12 keeps the slice numbers; this is the order to
build them in.
1. **Slice 7: mobile and accessibility:** stop A (the scan, the smoke tests and their fixes) is done. Next,
   stop B: phone tabs (A | B | C | +) and the sticky verdict bars (bottom on phones, top on tablets), never
   hiding the focused field (scroll padding; the phone's bar hides while the keyboard is up), within the
   bundle budget and Lighthouse's LCP. Then stop C: the NVDA script the user runs; fix what it finds.
2. **Slice 6:** the reconciliation schedule (L-6, "The work", §4.8: the full tables, footed and
   cross-footed to the lead schedule), CSV export of each table, print, and the hide-tickmarks
   setting.

## Commands
- `npm test`: unit tests (engine and app) plus the engine formatting guard.
- `npm run typecheck`: `tsc -p .` (src and test, no Node types), `tsc -p scripts` (Node
  types), `tsc -p app` (DOM, React) and `tsc -p e2e` (the Playwright tests).
- `npm run oracle`: engine vs PolicyEngine-US for 2026, ~3-4 min. It needs a `.venv` with
  `requirements.txt` (see README); the runner picks `.venv`'s Python automatically.
- `npm run offers`: sample comparison tables.
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
  - `params/`: 2026 data, `paramsForYear`, the SALT schedule.
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
  - Inputs: `help.ts` (every field's name and place, and quick mode's help text),
    `helpText.ts` (detailed mode's help text, loaded with it), `defaults.ts` (the defaults
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
  - `src/verdict.ts`: the lead schedule's view model, including pay per extra hour.
  - Show the work: each figure's metric id maps to a tickmark kind, a methodology section
    (`src/sections.ts`) and a derivation built from the engine's numbers.
    - `src/metrics.ts`: what the page renders: the ids, their tickmark kinds, the lookups,
      and the view models behind L-1 (`byYear`) and the bridge (`bridge`), so the figures and
      their derivations share one source.
    - `src/derive.ts` (loaded on first use): the derivations and their words, beside
      `src/format`'s. Pure. The BEA indexes show the fewest decimals (3-6) at which every
      product foots to the dollar (`indexDigits`).
  - `src/figures.tsx`: `Fig` (a figure and its tickmark, one button), `TickButton` (a lone
    mark), `Trace` (an input derivations can light up), `useRovingTicks`, and the context they
    read. No `react-dom`, nothing from `metrics.ts` at run time (see Bundles).
  - `src/Tickmarks.tsx`: `WorkProvider` (it provides that context, with each figure's tickmark
    kind), the popover, and the derivations' lazy module; it re-exports the figures.
  - `src/ByYear.tsx`: L-1 (the hand-built SVG chart, notes, table view) and the bridge.
  - `src/Later.tsx`: the schedules after L-1, each loaded as you scroll toward it
    (`useLoadNear` in `lazy.ts`). `src/Risk.tsx` is L-2; `src/cases.ts` its view model (values by
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
  `offer-table.ts`, `bench.ts`, `check-engine.ts`, `check-bundle.ts` (with `lib/bundle.ts`),
  `lighthouse.ts` (with `lib/lighthouse.ts` and `lib/serve.ts`), `serve-dist.ts` (the build for Playwright),
  `fetch-rpp.ts`, `fetch-fmr.ts`, and `lib/zip.ts` (zip and xlsx readers for the fetch scripts).
- `e2e/`: Playwright (its own `tsconfig.json`; files end `.e2e.ts`, so vitest skips them).
  - `a11y.e2e.ts`: the scan's states. `lib/app.ts` drives the app (sections, editors, L-2 to L-5 loaded,
    when the page has settled); `lib/axe.ts` scans and applies `test/a11y-exceptions.json`
    (`lib/exceptions.ts`); `lib/reporter.ts` writes `.a11y/report.md`.
  - `smoke.e2e.ts`, `keyboard.e2e.ts`.

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
  promotions.

**Scenarios, PV and comparisons**
- **Scenarios:** bear/base/bull are joint scenarios, not percentiles. Each sets every
  uncertain input at once: bonus, raise, price growth, refresher size, which promotions
  happen. Single-input sensitivity is for the planned tornado chart.
- **Present value:** each event's after-tax cash is discounted by
  (1 + r)^-((date - valuationDate) / 365.25), default r = 5% nominal. The UI passes
  today's date.
- **Comparison window:** earliest start + horizon, so a later start counts as lost pay.
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
