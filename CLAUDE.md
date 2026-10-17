# Offer Calc — context for Claude Code

## 1. Purpose and principles
A job-offer calculator, live at https://offer-calc.vercel.app. It works an offer out the way it would pay out: gross pay → after tax →
after rent and local prices → per hour worked, year by year over the stay you expect (1-10 years, default 4), and shows the work
behind every figure.
- **Correctness and a clear methodology matter more than features.** Every figure opens its derivation ("Show the work"), and every
  derivation adds up as displayed.
- **The tool informs the decision and shows its work; you make the call** (v2's D1). It never recommends a job, calls an offer low,
  or gives financial advice.
- **The direction: evaluator-first** (approved 2026-10-15, `docs/v2-plan.md` item 5, B1). Every offer gets its own standalone
  breakdown, the primary view, and the comparison is a layer that appears with two or more offers. **Built** (stops 5A-5C,
  2026-10-15 and 16): one offer is enough, a first visit opens on one sample offer, every offer has its breakdown over its own stay,
  A-1 (its bottom line) to A-7 (the work), and Copy as document copies one offer's breakdown, the comparison or both.
- **No backend, no login.** The engine runs in a Web Worker in the browser; the session is saved in that browser only.

## 2. Current state (2026-10-16)
- **Engine:** complete for v1 (`src/tax`, `src/offer`, `src/col`). Tax law is 2026's, validated against PolicyEngine-US; later
  years are projected from it, except amounts published for them (so far 2027's HSA limits and Social Security wage base).
- **UI:** v1 complete: UI slices 1-8, Copy as document, and v2's step 0 (the bundle trim); v2's item 5, stop 5A (one offer works:
  A-1 pinned, the per-offer worker job, the ledger's "On its own" row, the breakdowns' section, the label rules and their test),
  stop 5B (every offer's A-2 to A-7; L-5 and L-6 folded in and retired, the bridge in A-2) and stop 5C (Copy as document for one
  offer and its choice with two or more, the first visit's single sample, a CSV for every breakdown table). How each differs from
  the design: `docs/ui-design.md` §12.
- **The October 2026 audit** (`docs/audit-2026-10.md`): its fixes are merged for spouse wages (C1), Philadelphia's resident tax
  (C2), a later start's days, money before day one and guaranteed bonuses (C3-C5), every derivation footing as displayed (C12-C15),
  recovery from a bad or newer saved session (C22, C23), the e2e shards (T3), the property tests (T4), frozen law for the tests
  (T2), the performance gates (P1-P4), a defaults test that sees what it checks (T5), the hooks linter (H1), CI hygiene (S2, in
  part), this file (D2, D5, D6), the design docs marked historical (D7), v2's plan brought up to date (D8), per hour documented
  as the code works it out (D1) and the methodology's lines the code didn't bear out (D3); and the `main` ruleset is on (S1, in
  part). What's left: section 3.
- **The repository is public on GitHub** (its one visibility event in GitHub's record is at its creation, 2026-10-07), though the
  decision recorded on 2026-10-08 was to keep it private until launch. Whether to keep it public, or make it private until the
  pre-launch checklist is done, is the user's call (section 3).
- **The numbers come from commands, not from this file:** `npm test` (unit tests), `npm run e2e` (Playwright and the scan),
  `npm run check-bundle` (sizes), `npm run lighthouse` (load time), `npm run bench` (engine timings). What they were at each
  milestone is in `docs/history.md`.

## 3. Now
**Ask before starting anything new.** The user is putting the tool, and v2's tester questions, in front of testers; record each
finding in `docs/user-testing.md` as it comes in.

**Next: ask.** v2's item 5 is built (stops 5A-5C, 2026-10-15 and 16), before the testers' answer to its first question ("how many
offers did you actually have?"), at the user's word; record the answer when it comes. The plan's order puts item 2 (market
benchmarks, as A-8) next, after the testers' answers to its questions (`docs/v2-plan.md`, "Questions for testers"). Item 4 gained 4h,
commission (the owner's own use, finding 3), unranked and not built.

**The audit's other open "fix before v2" items**, none of which blocks the breakdown (`scripts/lib/plan.test.ts` keeps this list,
section 2's and the plan's in step):
- **T1** (a committed grid baseline in CI): the breakdown changes no tax code. It guards each tax change: the data refreshes below,
  the base-year move, v2's item 4d.
- **D4** (data vintages typed in: `docs/data-refresh.md` now lists where): due before BEA's refresh, December to February.

**The next data checks** (`docs/data-refresh.md` has the calendar):
- The IRS's 2027 inflation revenue procedure and 402(g) notice (neither out on 2026-10-15; any day, weekly from 2026-11-16). Each
  goes in `FEDERAL_2027`, and `test/law.test.ts` is the one test it should move. SSA's 2027 wage base ($192,300) is in.
- December to February: BEA's 2025 RPPs, Pub. 15-T, the states' payroll caps, then the base-year move to 2027.

**Pre-launch checklist** (before the public launch):
1. **Visibility and settings:** decide public or private now (section 2). For public: `docs/slice-3-plan.md`, "Public-repo prep",
   item 7, has each setting; the ruleset it plans is in place (section 4). What's left of audit S1: Vercel still deploys every push
   to `main` without waiting for CI; have it wait for the checks before promoting.
2. **Re-run the history scan** (author addresses, secret-shaped strings, sensitive files).
3. **The NVDA walkthrough** (`docs/nvda-walkthrough.md`, about 40 minutes, updated for item 5; after D11's remaining steps, Print…
   and the tickmark setting): the user runs it and sends
   the Speech Viewer log; fix what it finds. With it, a VoiceOver pass on a phone for the offer tabs and the verdict bar.
4. **The audit's "fix before going public" items** (its table): C6, C7, C16-C19, C24, C25, C27, C28, T6, T7, T9, S1, S2's
   `npm audit` step, D9-D11, P5-P7.
5. **Retake the README's screenshot** (D10), and check the README and M-4 against the oracle report, and the docs against the code.

## 4. Working agreements
- **Pull requests:** one branch per slice or fix; every change reaches `main` through a pull request. Enforced since 2026-10-15 by
  the repository's `main` ruleset: a pull request, the seven CI checks passing (`check`, `lighthouse`, `e2e` and its four shards) on a
  branch up to date with `main`, no force-push or deletion, no one exempt. So after one pull request merges, bring the next up to
  date (rebase onto `main`) and let CI run again.
  1. `git switch -c <branch>`, commit, `git push -u origin <branch>`;
  2. `gh pr create` (the body ends with the Claude Code line);
  3. CI must pass (`gh pr checks --watch`, or the desktop app's PR monitor);
  4. `gh pr merge --merge --delete-branch`, then `git switch main` and `git pull --ff-only`.

  Before opening it: tests, the typecheck and the hooks linter pass locally; the grid is unchanged (`npm run grid`; `grid_ts.json`
  is ignored, so compare with `main`'s output); `npm run build` for UI work.
- **Merging to `main` deploys to production** (Vercel). Keep `main` green.
- **Tests:** hand-check at the edges: the day before and the day of a vest, payout or window end; thresholds; bracket crossings.
  Hand-checked values carry their arithmetic in comments.
- **Review stops:** stop after each slice (or each v2 stop) for review. Engine slices: show the `npm run offers` tables. UI slices:
  light and dark screenshots of the live site, what differs from the design, and the methodology checked against the code (D3).
- **Tax-engine changes:** their own branch, separate commits; after each, tests pass and the 2026 oracle report is byte-identical
  (or the difference is explained).
- **Windows PowerShell 5.1:** pass multi-line commit messages with `git commit -F <file>`; embedded double quotes break native
  argument passing.
- **Live screenshots:** headless Edge (`msedge --headless=new --remote-debugging-port=<port>`) driven over the DevTools protocol with
  Node's built-in WebSocket: screenshots, real key presses, file inputs (`DOM.setFileInputFiles`), downloads. Close it with
  `Browser.close`, then `taskkill /pid <pid> /T /F`: Edge relaunches itself, so `kill()` leaves processes behind.

## 5. Commands
- `npm test`: the unit tests in two vitest projects (`vitest.config.ts`): "law" (`test/law.test.ts`, on the tax law as published)
  and "frozen law" (every other test, on a frozen copy, so a data refresh moves none of them); then the engine's formatting guard
  (`scripts/check-engine.ts`).
- `npm run typecheck`: `tsc -p .` (src and test, no Node types), `tsc -p scripts` (Node types; also `vitest.config.ts` and
  `app/vite.config.ts`), `tsc -p app` (DOM, React), `tsc -p e2e`. Beyond `strict`: no unused locals or parameters, no implicit
  returns, no switch fallthrough, `override` required; the app also `isolatedModules` and `verbatimModuleSyntax`.
- `npm run lint`: ESLint over `app/src` with the react-hooks rules only (`eslint.config.js`): the rules of hooks and every
  dependency list. A disable comment that disables nothing is an error. Babel's parser, since TypeScript 7 has no JavaScript API for
  typescript-eslint's. `scripts/lib/lint.test.ts` runs it in `npm test` too.
- `npm run fuzz`: the property tests (`app/src/properties.test.ts`, `display.test.ts`) on a random seed at ten times `npm test`'s
  runs, shrinking each counterexample; it prints the seed (`FUZZ_SEED=<seed> npm run fuzz` replays it). CI runs it nightly.
- `npm run dev` / `build` / `preview`: the app (Vite, `app/vite.config.ts`), built to `dist/`.
- `npm run check-bundle` (after a build): the main thread, a quick-mode visit, against 120 kB gzip in one chunk; the worker against
  75 kB gzip; the stylesheet reported (`scripts/lib/bundle.ts`).
- `npm run lighthouse [-- <url>]` (after a build): Lighthouse's mobile profile, a warm-up and five runs. Fails on a median LCP over
  2.5 s, CLS over 0.02 or TBT over 200 ms, or a run that shows no answer (A-1 on a first visit, or the verdict); reports the time to the first answer (observed, not
  budgeted). Needs Chrome or `CHROME_PATH` (Edge on Windows). The median LCP's run's report goes to `.lighthouse/report.html`.
  `npm run lighthouse -- --fonts-late [ms]`: the late-fonts pass, three runs with the web fonts held back (1.5 s), so the page paints
  in the fallback fonts first; it gates only CLS (the swap mustn't move text). CI runs both.
- `npm run e2e` (after a build): Playwright on the production build, served as Vercel serves it (`scripts/serve-dist.ts`, port
  4180): the accessibility scan, then the smoke, keyboard and phone/tablet tests. Locally it drives the installed Edge; CI runs
  Chromium in four shards. One project: `npm run e2e -- --project=phone-dark`. Don't pass `--reporter` (it drops the scan's).
  Reports: `.a11y/report.md`, `.playwright/report/`.
- `npm run grid`: the tax engine over the oracle's grid, to `grid_ts.json` (compare with `main`'s before merging).
- `npm run oracle`: the grid against PolicyEngine-US, 2026, about 3-4 minutes, in the locked `.venv` (`docs/data-refresh.md`).
- `npm run offers`: the sample offers' tables, with FMR and BEA-derived rent estimates.
- `npm run bench`: engine timings on the samples (median of warm runs); compare branches side by side.
- `npm run fetch-rpp`, `npm run fetch-fmr [-- <FY>] [--file <xlsx>]`, `npm run build-cities`: refresh BEA's RPPs, HUD's FMRs and the
  city list (`docs/data-refresh.md`).

## 6. Conventions
**The engine** (`src/tax`, `src/offer`, `src/col`):
- Pure functions, no I/O, runs in the browser. "Today" is always passed in (`valuationDate`), never read from the clock.
- It returns numbers and codes, never formatted text: events carry a `detail`; warnings and assumptions are `{ code, params }`.
  Words go in `src/format`. The guard (`scripts/check-engine.ts`) fails on `toLocaleString`, `Intl` or an import from `src/format`.
- Round only at output (`round2`); internal sums stay unrounded.
- Every parameter carries a source comment. Laws newer than the Tax Foundation's Feb-2026 table are marked `OVERRIDE:` with the
  bill or statute. Schedules are `[lowerBound, rate]`; a 0% first band means "rate starts above X".
- Engine functions take `TaxParams` as an argument: never import `*_2026` constants into `federal.ts`, `state.ts` or `local.ts`.
  State quirks live in `state.ts` under the state's `special` key, data in `params/`; `state.ts`' hardcoded thresholds are 2026
  law, wrapped in `ix()` only if the state sets `indexed.specialThresholds`.
- A state amount changes in projected years only through an explicit, sourced flag: `indexed` (the state indexes it by statute) or
  a federal link (`stdDeductionIsFederal`, `wageCap: "ssWageBase"`). Unverified means held flat. To upgrade a state, add `indexed`
  with the statute and a hand-checked projected-year test (as CA's in `params.test.ts`).
- An amount published for a later year goes in that year's file, listed in `params/enacted.ts`; never in a test's expected value
  except `test/law.test.ts`.
- No misleading defaults: raises, price growth, refreshers and the savings rate default to 0, shown in the assumptions. The engine
  has no default inflation; the offer model defaults to 2.5%, shown.
- Generated data isn't edited by hand: `src/col/rpp.json`, `fmr.json` and `cities.json` (a test fails if the city list is stale).

**The app:**
- **Bundles** (`npm run check-bundle` and `scripts/lib/imports.test.ts` check each):
  - The main thread holds no engine values: only the worker holds the engine and the BEA and HUD tables. Type imports are fine;
    the pure-data exceptions are `src/col/cities.ts`, `src/samples.ts` and `src/offer/presets.ts`. Message types and `rentKey` live
    in `app/src/protocol.ts`; never import a value from `engine.worker.ts`, `compute.ts` or `slowJobs.ts`.
  - The main thread is one chunk. Rolldown splits a module shared by the main chunk and a lazy chunk into a chunk of its own, which
    every visit then preloads (1-2 kB gzip). So: a lazy schedule imports `figures.tsx`, never `Tickmarks.tsx`; `figures.tsx`
    reaches neither `react-dom` nor `metrics.ts` at run time; `help.ts` reaches no React; a component that a lazy chunk and the
    main chunk would both import goes in an existing main-thread module (as `CsvButton` lives in `figures.tsx`).
  - New code loads on first use (`app/src/lazy.ts`, or a schedule's `useLoadNear`); new data loads where it's used (the worker, or a
    same-origin fetch), never in a JavaScript chunk. v2's rule: at most 0.5 kB gzip more on the main thread per item.
  - What can't show before the worker's first answer loads beside it, once the first contentful paint is recorded
    (`useLoadAfterPaint`, `lazy.ts`): the breakdowns (`Breakdown.tsx`, A-1, the "On its own" row, the one-offer bars; `ownSlots`
    places them, so `App.tsx` stays light) and the lead's verdict (`LeadVerdict.tsx`).
    Neither imports `Lead.tsx` (it imports `Tickmarks.tsx`: the main chunk split when one did), so the problems list reaches A-1 as a
    node from `App.tsx`.
  - The breakdowns' parts, A-2 to A-7 (`BreakdownParts.tsx`), are one chunk, loaded as you scroll toward them through
    `partsModule`, which lives in `Breakdown.tsx`: from `Later.tsx`, which `Breakdown.tsx` can't import, it split `text.ts` and
    `ui.tsx` off the main chunk.
  - Which lazy chunks import a main-thread module moves Rolldown's chunking, not only what's new: `LeadVerdict.tsx` imports
    `metrics.ts` at run time (`basisPhrase`) and `verdict.ts` doesn't. Without the first, `prices.ts` and the city list split off the
    main chunk; with the second, `model.ts`, `protocol.ts` and `text.ts` did (2026-10-16). `npm run check-bundle` catches either.
- **The year figures as shown:** every figure is rounded once, where it's worked out, and a subtotal is the sum of the rounded items
  above it, so every column adds up as displayed and a figure shown in two places is one figure (`footing.ts`). Every Show the work
  foots as displayed exactly (`footsAsDisplayed`); a present value's total stays the engine's, with one line taking the rounding
  (`shownPv`); "a month" is the gap as shown ÷ the annuity factor as shown, rounded once (`monthOf`). Apply this to anything new
  that adds up, CSV and the copied document included; don't change it without the user.
- **Tickmarks:** every figure is a button with a tickmark kind, a methodology section and a derivation (`metrics.test.ts`); every
  default shows as a real value with a `D` tickmark, every estimate with an `E`.
- **Hooks:** every dependency list is complete (`npm run lint`). One left out on purpose has `// eslint-disable-next-line
  react-hooks/exhaustive-deps` with its reason above it: today a job or request compared by value (its key), and A-7's tables,
  memoized over `words`, a key kept by hand (`TheWork.tsx`).
- **Inputs:** every input has its hint, its ⓘ help and "How this is used →" (`help.ts`; `help.test.ts` fails on one without); a
  default with its `D` and its reason, or a blank where that was decided (`defaults.ts`; `defaults.test.ts` checks each against the
  engine); its problems at the field (`validateOffer`, in the worker). While any input has a problem, the results are the last valid
  ones, said so in the lead with "Fix it". Ranges are opt-in ("+ range"). A 401(k) or health plan is not entered (not counted),
  entered, or none; a cost or benefit counted for some offers but not others is named under the verdict. Per hour shows only when
  every offer has hours.
- **Type:** Atkinson Hyperlegible Next for text and figures, `font-variant-numeric: tabular-nums` wherever numbers align
  (proportional on the hero number); Atkinson Hyperlegible Mono only for formulas and derivations. Each has a size-matched local
  fallback (`styles.css`: Arial or its metric twins, Courier New or its twins, scaled to Atkinson's widths and given its ascent and
  descent), so text doesn't move when the web fonts swap in; the late-fonts pass checks it. A change of font redoes the numbers.
- **Colors:** offer colors (cobalt, berry, bronze) are for marks and rules only; text stays ink. Each offer keeps its letter and
  color for life. Tokens and their validation: `docs/ui-design.md` §9; re-run the dataviz validator if a color changes.
- **Samples:** `src/samples.ts` keeps fixed dates (start 2026-07-13) for the table script and tests; the app moves them forward by
  whole years to start on or after today, so present values are from today. They're stamped illustrative wherever they appear. A
  first visit (and "Delete all data") is sample A on its own; "See a sample comparison" and the footer's "Reload the samples" load
  all three. The banner under the masthead says so, with "Start with my offer".
- **Today:** the app passes the user's local date as `valuationDate`.
- **Words:** labels follow "Prices in" (`app/src/prices.ts`). Under v2's B13, every rate and share states its period ("a month over
  your stay", "of its 2027 pay"), and under condition 1 every figure names its dollars: after rent the place's, "$" before rent and
  prices; an offer's own city's dollars only inside its breakdown (`docs/v2-plan.md`, item 5's conditions). Where it's said:
  - **tables, column heads and figure labels** (accessible names, Show the work, CSV headers) in the compact style: "U.S.-avg
    $7,196", "New York $6,671";
  - **sentences** (the verdict, the bottom line, the document's paragraphs, the live region) once, in words, the figures without it:
    "C leaves you about $507 a month more than A over your stay, after rent, in U.S.-average dollars" (`basisSaid`, `verdict.ts`;
    the user's amendment, 2026-10-16).

  `labels.test.ts` checks every figure the app renders, each sentence, the CSVs and the document; a new figure needs its entry in
  its `expectOf`.
- **Accessibility:** WCAG 2.2 A and AA, checked by the scan in every state (`e2e/a11y.e2e.ts`); an exception needs a rule, a
  selector and a reason in `test/a11y-exceptions.json` (none today). Behaviors to keep:
  - the verdict is announced in one polite live region (`#verdict-live`), one sentence a second after the last result, only when
    it changes, never on the first load;
  - a chart is a keyboard slider over its axis (L-1's years, L-4's last day), its value text naming every offer; the drawn tooltip
    is hidden from screen readers;
  - the theme switch is native radios; the other two-way switches are `aria-pressed` buttons;
  - focus comes back where it was: Escape from Show the work, a city picked, an offer removed (to the tab shown, or the Offers
    heading);
  - the sticky verdict bars never hide the focused element (WCAG 2.4.11: scroll padding, `useFocusClearOfBars`, and the phone's bar
    hides while the keyboard is up);
  - lone tickmarks are 24 × 24 px boxes (WCAG 2.5.8); "⚠ Last valid results" keeps full contrast (dimming while "Updating…" is
    audit P5, a decision for before launch).
- **Out of the page:**
  - Print… lays the page out as a 680 px column, loads every schedule and waits for it; Ctrl+P prints what's loaded. A is solid, B
    dashed, C dotted.
  - A CSV writes each figure as shown, as a plain number, with its tickmark beside it: UTF-8 with a BOM, CRLF, samples flagged on
    line 1, and a text cell starting with `=`, `+`, `-`, `@`, a tab or a CR gets a leading `'`. L-1's and L-2's table views have
    one, and every table in a breakdown (A-2's two, A-3, A-5, A-6, A-7's four), built from the rows the part draws.
  - Copy as document is one document model with two renderers (HTML with inline styles, text within 80 columns); every table foots
    as displayed and every calculation it states is in `worked`, checked. Its choice, under the masthead as Print…'s: a breakdown in
    summary (the default with one offer: the bottom line, where the money goes, pay by year, the key terms and the bad case, about
    2 pages) or in full detail (every payment and cliff, leaving early, the benefits and tax by year); with two or more offers, the
    comparison (their default) or both too. Copy writes a `ClipboardItem` of promises at once, for Safari.
- **Saved state:** this browser's localStorage only. A session the page can't show gets the error boundary's way out (`Recovery.tsx`:
  download what's saved, start again, reload); a session from a newer schema is never saved over; an unreadable one is set aside
  under `offer-calc:backup`.
- **Files:** on Windows, names that differ only in case collide (`work.ts` and `Work.tsx`): `cases.ts` and `Risk.tsx`, `metrics.ts`
  and `Tickmarks.tsx` are named apart on purpose.

## 7. Settled decisions (don't relitigate without the user)
**Time and tax attribution**
- **Dated events:** every payment or vest is a dated event. Tax is per calendar year, cash basis. Events regroup into employment
  years for display and into the comparison window for totals, so all views reconcile.
- **Employment years:** year n = [start + (n-1) years, start + n years). Accrued pay belongs to the year of its first day; a payment
  dated exactly on an anniversary counts toward the year just ended (a 12-month cliff vest is year-1 pay).
- **Extra-tax attribution:** an offer's tax for a calendar year = household tax with the offer minus without it (other wages, the
  spouse's wages), spread over that year's payments pro rata by gross.
- **Monthly accrual:** salary earns 1/12 of the annual rate per calendar month; a partial month earns days worked ÷ days in month; a
  mid-month rate change splits the month by days.
- **Projected tax law:** `paramsForYear(year, { inflation })`. Inflation indexes tax law and is the default rent growth; it never
  moves pay (raises and promotions do). A federal amount published for a later year (`ENACTED`) is used as published in its year,
  at any inflation, and later years scale from it; everything else scales from 2026.

**Scenarios, present value and comparisons**
- **Scenarios:** bear, base and bull are joint scenarios, not percentiles: each sets every uncertain input at once (bonus, raise,
  price growth, refresher size, which promotions happen).
- **Present value:** each event's after-tax cash is discounted by (1 + r)^-((date - valuationDate) / 365.25), r = 5% nominal by
  default.
- **Comparison window:** the earliest start + the stay. A later start counts as lost pay, exactly its days: accrued pay, benefits
  and rent are cut at the window's edges as at anniversaries. A payment before the start date counts from the start date, taxed
  when it's paid. The engine defaults to 5 years; the UI's stay to 4.
- **Stay length:** a stay of N years is the window, not a leave date: pay after it isn't counted, and its last calendar year is taxed
  as though you kept earning through December. Clawbacks from leaving belong to the leave-date sweep (L-4).
- **A breakdown's stay** (v2 item 5, B3, built at 5A): its own start, so adding an offer never changes another's breakdown (the
  worker projects each offer over its own stay, remembered by its inputs; the comparison takes that projection where an offer starts
  on its first day). The step from a breakdown to the comparison's window, where starts differ, is 5B's.
- **Per month:** a present-value gap restated as the level month-end amount over the window with the same present value. A lead
  under 3% of the leader's value is a close call.
- **Per hour:** the after-rent total, nominal, ÷ hours worked in the window, when every offer has a city (always, in the app); total
  rewards otherwise (`perHourOf`, `compare.ts`).
- **Breakeven:** bisection to the cent on base-scenario present value, on after-tax comp, total rewards or the after-rent total.
  "alreadyAhead" (B leads even at $0) is an outcome, not an error; `aheadBy` is always given.
- **Cliffs:** dated by the first last day that keeps them, by the leave-date rules. `cliffValue` taxes payments at that year's
  average offer rate in the stay-until-the-cliff projection.
- **Quoted total compensation:** the offer-letter view; it excludes refreshers, proration, payout lag and vest snapping.

**Cash measures and benefits**
- **After-tax comp** (cash basis) = gross − tax − your health premiums (premiums are a cost, not pay). **Take-home** = after-tax comp
  − your 401(k) − your HSA. **Total rewards** = after-tax comp + vested employer 401(k) + perks − out-of-pocket + employer HSA. Your
  deferrals count at face value.
- **Leave date:** the last day worked, inclusive; it cuts off every stream. Bonuses unpaid by then are forfeited
  (`mustBeEmployedOnPayDate`, default true; false prorates).
- **Clawbacks:** cleared once the last day is the day before clock start + months; prorated by completed months by default
  (`per: "day"` optional); gross repaid by default. In the same calendar year the wages are reversed, exactly; in a later year, an
  IRC 1341 credit, federal only, over $3,000, and FICA isn't refunded.
- **401(k):** the 402(g) limit per calendar year; the match per paycheck on the actual deferral rate, no true-up. Vesting service is
  `elapsedTime` (default: a year completes by working through the day before the anniversary) or `planYearHours` (a calendar year
  with 1,000+ hours counts from the day the 1,000th hour is worked, 29 CFR 2530.200b-1).

**Cost of living**
- **BEA RPPs:** never adjust gross pay. Take-home − savings − rent = local non-housing money, × reference ÷ area non-housing RPP =
  discretionary income after rent in reference dollars ("Prices in": the U.S. average by default, or a city whose own factor is 1).
- **Non-housing RPP:** (all items − 0.16 × housing) ÷ 0.84; 16% is housing rents' share of BEA's PCE-based weights (BEA SCB, March
  2022). RPP components are on the U.S. all-items scale (U.S. housing is 100.629), so always use ratios to a reference row.
- **Rent:** the rent entered per offer. Left blank: HUD's Fair Market Rent for the metro, 1 bedroom (the FMR area holding most of
  the metro's 2024 population, in your residence state if any is); only where there's no FMR (BEA state nonmetro portions), an anchor
  rent (the U.S. median gross rent, $1,487, ACS 2024) × the housing RPP ratio. It's the first lease year's rent; the lease starts on
  the start date and rises by `rentGrowth` (default: inflation) at each anniversary.
- **The after-rent total** (`colAdjustedTotal`): spending money is local, saved money isn't. Converted through the non-housing
  factor: discretionary income after rent, less expected out-of-pocket health costs. At face value: planned savings, your 401(k)
  and HSA, vested employer 401(k), employer HSA, perks. Check: it equals total rewards − rent + (factor − 1) × (local non-housing −
  out-of-pocket).

**Product and project**
- **Repo visibility:** recorded 2026-10-08 as "private until launch"; it's public (section 2). The user decides.
- **No LICENSE:** "© 2026 Owen Chapman. All rights reserved. Source shown for review only." (README; the footer has the first
  sentence.)
- **Budgets:** the main thread 120 kB gzip, with Lighthouse holding LCP at 2.5 s (kilobytes are the proxy, LCP the outcome);
  Lighthouse from the `lighthouse` package, not `@lhci/cli` (which pins Lighthouse 12.6, with npm advisories).
- **v2's decisions** (D1-D15, B1-B13) are in `docs/v2-plan.md`; D1, D14 and B1-B13 are approved, the rest stand as recommended.

## 8. The validation gate (after any tax change)
1. `npm test`: hand-checked values, and the frozen-law tests unchanged.
2. `npm run grid`, compared with `main`'s: byte-identical unless 2026 law changed.
3. `npm run oracle`: our engine and PolicyEngine-US 2.30.3 over $40k-$320k, every state, single and joint, 2026 only (projected
   years are `test/params.test.ts`'s).
   - **Baseline** (`oracle_report.json`, 2026-10-12; the same report on 2026-10-15): FICA exact; state payroll taxes within $0.01;
     NYC within $0.48 (−$0.48 single, −$0.06 joint at every income).
   - **Federal income tax, single, $60k-$200k:** 50 of 51 within $5 (Alaska is lower: its dividend, a known gap).
   - **State income tax, single, $60k-$200k:** 42 of 51 within $5, 44 within $6; the 7 over $10 are VT, CO, ND, OR, CT, AR and MO,
     each in the known gaps. A new state over $10 is a regression.
   - The report prints whole dollars; read cents from `oracle_report.json` (audit S5).
   - M-4 and the README quote these figures: update them with the baseline.

**Intentional differences from PolicyEngine** (don't "fix"):
- SALT: PolicyEngine deducts estimated withholding; we deduct state and local tax owed (a steady-state W-2 assumption). It explains
  most federal gaps for itemizers in NY, CT and DC.
- The itemizing choice minimizes federal + state + local tax, so it can flip differently near the threshold (single points: DC $240k,
  VA $300k, GA $300k+).
- MO's federal-tax deduction tiers include their upper bound (RSMo 143.171.2 puts exactly $100,000 in the 15% tier; PolicyEngine
  applies 5%): −$62 single, −$36 joint at $100k only.
- Data from PolicyEngine-US: state payroll parameters and nine of the ten `OVERRIDE:`s were copied from it, and Arizona's standard
  deduction, so agreement there is circular (audit D9).

## 9. Code map
**The engine** (`src/`):
- `tax/`: `index.ts` (`computeTaxes`); `federal.ts`, `state.ts` (the states, and their `special` rules), `local.ts` (NYC,
  Philadelphia, a flat local rate); `schedule.ts`, `types.ts`.
- `tax/params/`: `index.ts` (`paramsForYear`, `saltForYear`, `BASE_YEAR`), `federal2026.ts`, `states2026.ts`, `local2026.ts`;
  `federal2027.ts` (amounts published for 2027 so far) and `enacted.ts` (`ENACTED`, the list of them by year).
- `offer/`: `types.ts` (authoritative over `docs/offer-model.md`); `project.ts` (`projectScenario`, the leave-date sweeps,
  `keptIfLeaving`); `compare.ts` (`compareOffers`, `comparisonWindow`, `breakeven`/`breakevenSteps`, `rentFlip`/`rentFlipFrom`,
  `horizonSweep`, annuity terms); `cliffs.ts`; `withholding.ts` (`withholdingShortfall`); `validate.ts` (`validateOffer`: problems
  as codes and paths); `streams.ts` (salary, bonus, cash); `vesting.ts`; `presets.ts` (the vesting presets, main-thread safe);
  `clawback.ts`; `benefits.ts` (401(k), health, perks); `location.ts` (the convenience-of-employer rule); `dates.ts` (civil dates as
  UTC day numbers).
- `col/`: `index.ts` (BEA RPPs, `rpp.json`), `rent.ts` (HUD FMRs, `fmr.json`, and the fallback), `cities.ts` (the slim city list,
  `cities.json`, for the main thread).
- `format/`: the words for the engine's numbers and codes (`numbers`, `issues`, `schedule`, `warnings`). Not part of the engine.
- `samples.ts`: the three sample offers (illustrative), shared by the scripts, the tests and the app.

**The app** (`app/src/`), by schedule:

| Schedule | Component | View model | Unit tests |
|---|---|---|---|
| A-1, an offer's bottom line, and the "On its own" row | `Breakdown.tsx` | `breakdownModel.ts` | `breakdown.test.ts` |
| A-2 to A-6: where the money goes (and the bridge), pay by year, terms, benefits, tax and warnings | `BreakdownParts.tsx` | `partsModel.ts`, `byYearModel.ts` (the bridge), `leaveModel.ts`, `warningKinds.ts`, `warningAt.ts`, `warningWords.ts` | `parts.test.ts`, `l5.test.ts`, `l6.test.ts` |
| A-7, the work | `TheWork.tsx` | `workpaper.ts` | `l6.test.ts` |
| L, the verdict | `Lead.tsx`, `LeadVerdict.tsx` | `verdict.ts` | `metrics.test.ts` |
| L-1, by year | `ByYear.tsx` | `byYearModel.ts`, `footing.ts` | `metrics.test.ts`, `l6.test.ts` |
| L-2, if things go badly | `Risk.tsx` | `cases.ts` | `metrics.test.ts` |
| L-3, what it would take | `Breakeven.tsx` | `breakevenModel.ts` | `l3.test.ts` |
| L-4, leaving early | `Leaving.tsx` | `leaveModel.ts` | `leave.test.ts` |

L-5 and L-6 retired at stop 5B (B8): each offer's warnings are in its A-6, its tables in its A-7; their tests keep their names.

- **Page:** `main.tsx`, `App.tsx` (routes `#/`, `#/method`, `#/data`; print; Copy as document's button), `Recovery.tsx` (the error
  boundary), `About.tsx` (About you), `Ledger.tsx` (the offers' inputs, the phone's tabs, the foot row's slot), `Later.tsx` (the
  breakdowns and the verdict, loaded once the page has first painted; L-1 to L-4, each loaded as you scroll toward it), `Methodology.tsx` (`#/method`, M-1
  to M-13), `Data.tsx` (`#/data`: export, import, delete).
- **Inputs:** `fields.tsx`, `rows.tsx` (quick mode), `Detailed.tsx`, `editors.tsx`, `controls.tsx` (detailed mode); `help.ts`,
  `quickHelp.ts`, `helpText.ts` (each field's name and help); `defaults.ts` (the defaults registry); `summary.ts`; `presets.ts`;
  `comparability.ts` (a cost counted for some offers but not others).
- **State:** `model.ts` (the offer draft ↔ `OfferInput`, the samples), `session.ts` (the session, schema 3, in localStorage under
  `offer-calc:v1`), `exchange.ts` (JSON export and import).
- **The worker:** `engine.worker.ts`, `compute.ts` (the fast lane: per edit; each offer's breakdown, remembered by its inputs, and with
  two or more the comparison), `slowJobs.ts` (L-3's and L-4's jobs, A-4's cliffs, A-7's payments),
  `jobs.ts` (the two lanes), `protocol.ts` (messages), `useEngine.ts` (debounced 200 ms, stale results dropped).
- **Show the work:** `figures.tsx` (`Fig`, `TickButton`, `CsvButton`), `Tickmarks.tsx` (`WorkProvider`, the popover), `metrics.ts`
  (metric ids, tickmark kinds, the rent note), `derive.ts` (the derivations, loaded on first use), `sections.ts` (methodology ids).
- **Out of the page:** `copyDoc.ts` (Copy as document: the comparison, one offer's breakdown, or both), `csv.ts`, `print.ts`, each
  loaded on first use.
- **Shared:** `ui.tsx` (stamps, tickmark legend, contexts), `text.ts` (money and dates as shown), `prices.ts` ("Prices in" and its
  words), `media.ts` (widths, the phone keyboard, focus clear of the sticky bars), `axes.ts`, `lazy.ts`, `styles.css`.
- **Tests only:** `testing.ts`, `arbitrary.ts` (the property tests' generators).

**The tests, and what each guards** (`app/src`, unless named):
- the engine: `test/offer.test.ts` (hand-worked projections), `test/tax.test.ts`, `test/params.test.ts` (projection mechanics),
  `test/validate.test.ts` (each problem at its path), `test/law.test.ts` (the law as published);
- every figure on the page: `metrics.test.ts` (each tickmark's kind, section and derivation; the hero and the bridge against the
  design's worked examples), `l6.test.ts` (A-7, L-1 and the bridge footing and tying), `display.test.ts` and `properties.test.ts`
  (property tests over generated offers: every derivation foots as displayed, no NaN, one figure reads the same everywhere; an
  `it.fails` marks a property a known bug breaks; one offer on its own too), `prices.test.ts` (every label follows "Prices in"),
  `labels.test.ts` (every figure names its dollars, every rate its period, no two offers' own-city figures side by side),
  `breakdown.test.ts` (A-1 against the plan's worked example, the worker's per-offer job, one-offer sessions), `parts.test.ts` (A-2
  to A-7 against it, a breakdown that adding offers doesn't change, the step to the comparison's window);
- each schedule and output: `l3`, `leave` (L-4), `l5` (A-6's warnings), `csv`, `copydoc` (each document's footing and stated calculations), `ticks`, `names` (buttons' names),
  `phone`;
- inputs and state: `help`, `defaults`, `comparability`, `app` (the session, migrations, the model), `exchange`, `jobs` (the lanes);
- the tooling: `scripts/lib/*.test.ts` (the bundle, import and Lighthouse rules, the lock, the hooks linter),
  `e2e/lib/exceptions.test.ts`;
- the docs: `scripts/lib/docs.test.ts` (every doc indexed in section 11, historical ones marked at their head, every
  `docs/<doc>.md §N` citation a section the doc has), `scripts/lib/plan.test.ts` (the audit's fix-before-v2 items: merged or open
  here, and as v2's plan says).

**Around it:** `test/` (the engine's tests, `law.test.ts`, `frozen-enacted.ts`, `a11y-exceptions.json`); `e2e/` (Playwright: the
scan, smoke, keyboard and mobile tests, `lib/app.ts` to drive the app); `scripts/` (the commands above; `lib/` holds what they test:
`bundle.ts`, `imports.ts`, `lighthouse.ts`, `lock.ts`, `serve.ts`, `zip.ts`); `.github/workflows/` (`ci.yml`, `fuzz.yml`);
`eslint.config.js` (the hooks linter); `vercel.json` (CSP and headers).

## 10. Known gaps
The one list; the methodology's M-10 says the same in plain words. Rough priority within each group.

**Tax engine**
- VT's brackets use 2025 widths (up to ~$150 high). ND and OR indexing gaps; OR −$46 single at $140k (its federal-tax subtraction's
  phase-out is approximated).
- Low-income credits and tables: CT's personal credit and AR's tables reach ~$100k (AR single +$112 at $80k, joint +$270 at $100k; CT
  single +$257 at $60k, joint +$310 at $80k). HI and MN refundable credits and ME and NM joint credits matter only below ~$60k.
- CO's TABOR refund (+$19 to +$118) and AK's Permanent Fund Dividend (our federal $120-$480 lower) aren't modeled.
- MD county, OH city and PA EIT taxes aren't defaulted (a flat local rate can be entered). PolicyEngine's SALT includes MD county
  tax, so our federal is up to $3,374 higher (single, $320k), the oracle's largest federal gap.
- Unverified: AL's federal-tax deduction (PolicyEngine includes Additional Medicare Tax: +$9 to +$54 above $200k); MN joint at high
  incomes (−$186 at $300k, −$594 at $320k; single within $6); RI's spike at $280k; AZ's standard deduction ($15,750, copied from
  PolicyEngine; the Tax Foundation says $8,350: needs ADOR's instructions).
- No dependents or credits (CTC, EITC), no AMT; head of household uses single filers' state rules.
- CA's 1% over $1 million is indexed in projected years, though R&TC 17043 isn't (audit C9).
- Projected years: only CA's indexing is modeled; other states are held at 2026 (up to ~$15-20 too much at the median in 2027,
  ~$80-100 by 2031). Scheduled state rate cuts aren't applied. The SS wage base grows with inflation, not wages. Indexed amounts
  aren't rounded as the IRS rounds them (at most ~$50), except published ones. After 2027, the SS wage base is projected from
  2027's published $192,300.
- Section 125 amounts are excluded from every state's wages; CA and NJ tax HSA contributions.

**Where you'd live and work**
- Taxed as a full-year resident of where you'd live: no part-year residency in a move year, no nonresident tax or credit for the
  employer's state. The convenience-of-employer rule (NY, DE, PA; CT and NJ for residents of states with one; NJ's not reaching PA
  or CT residents, PA's not reaching residents of its reciprocal states) only raises a warning. v2 item 4d.
- Philadelphia's nonresident wage tax (3.425%, on commuters) isn't counted, though the engine has it (`resident: false`). v2 item 4g.
- Spouse wages are shared across offers. Another job's wages count for tax, but not its deferrals toward 402(g).

**Pay and benefits**
- Private-company equity (options, double-trigger RSUs) counts as $0; RSUs are sold at vest. v2 item 4e.
- Totals are tax owed; withholding is estimated for federal income tax only (no state, other-job or spouse withholding, W-4
  adjustments, other pay frequencies or safe harbors).
- 401(k): no catch-up, no 415(c) or 401(a)(17) limit; employer HSA money isn't capped at the HSA limit (audit C10); deferrals at face
  value; vesting service from a constant weekly rate.
- Health costs are flat and accrued monthly; the HSA limit isn't prorated for a partial year.
- One 132(f) input, capped at $340 a month, though transit and parking each have a limit (v2 item 4b splits them).
- Breakeven can overstate the change needed where tax jumps at a cliff (audit C8).
- Layoffs, severance and waived clawbacks aren't modeled; a leave date is a voluntary exit.

**Cost of living**
- Relative prices are held at the 2024 RPPs; one national housing weight. RPPs are metro-wide (the NYC metro averages Manhattan with
  its suburbs).
- Rent grows at one rate per offer, stepped at each anniversary, paid only while employed there. HUD's estimate is used as published
  for any start date (audit C27).
- FMRs are 40th-percentile gross rents across a county group; city-center rents for new grads run higher (the UI calls it an
  estimate to edit). ZIP-level rents (HUD's Small Area FMRs) are in the backlog (`docs/v2-plan.md`).
- Perks count at face value, though 132(f) money buys local transit.

## 11. Docs
| Doc | What it is | Status |
|---|---|---|
| `docs/v2-plan.md` | v2: the offer breakdown (item 5) first, market benchmarks, accuracy, negotiation help, beyond the money; decisions D1-D15, B1-B13 | Current. Step 0 and item 5 (stops 5A-5C) built; the rest planned |
| `docs/audit-2026-10.md` | The October 2026 audit: findings ranked fix before v2, before going public, nice to have | A report as of 2026-10-13; section 2 here says which are fixed |
| `docs/user-testing.md` | Testers' findings, one row each | Current; add to it |
| `docs/data-refresh.md` | Every dataset's calendar, refresh steps, the base-year move, the oracle's environment | Current |
| `docs/ui-design.md` | The UI design (rev 4: §1 evaluator-first) and §12, how each slice and stop was built | Historical, except §1 (current); §12 as built |
| `docs/offer-model.md` | The offer model's design (rev 3) | Historical; `src/offer/types.ts` is authoritative |
| `docs/ui-slices-4-8-plan.md`, `docs/slice-3-plan.md`, `docs/copy-as-document-plan.md` | Plans, each built (the last with `copy-as-document-sample.html`) | Done; `slice-3-plan.md`'s public-repo settings (item 7) still apply |
| `docs/nvda-walkthrough.md` | The screen-reader script | Updated for item 5 (2026-10-16); needs D11's other steps (Print…, the tickmark setting) before it's run |
| `docs/history.md` | What CLAUDE.md recorded before 2026-10-15: each slice, the sizes and load times, dated rationale | Archive, not maintained |
| `README.md` | The project for a visitor: what it does, sources, how to run it | Current, except the screenshot (D10) |
