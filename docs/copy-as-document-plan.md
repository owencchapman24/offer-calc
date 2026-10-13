# Copy as document (approved 2026-10-12, built)

**Status: built** (proposed and approved with changes on 2026-10-12; the changes are below). It answers finding 1 in
`docs/user-testing.md`: two of the first testers independently asked to paste the comparison into a document, so they could read the
numbers and the logic behind each offer at their own pace.

**The sample:** `docs/copy-as-document-sample.html` is what the feature copies for the samples, as the live site made it on Oct 12, 2026
(valued that day; they start Jul 13, 2027). Open it in a browser: its button copies the same two flavors, for a paste test. It goes
stale as the date and the data move; the tests use the samples at their fixed dates.

## Approved with these changes (2026-10-12)

1. **Section 2 describes vesting and refreshers precisely:** each grant's split by year, its shape and its cadence ("a $120,000 new-hire
   grant vesting 5/15/40/40 (back-loaded), semiannual after a 1-year cliff"), refreshers' size, timing and schedule ("plus $25,000
   refresher grants each year from the first anniversary, each vesting 25/25/25/25 (even), quarterly after a 1-year cliff"), and the
   company's vest dates.
2. **The pipeline's per-hour row is "After rent, per hour worked"** ("Total rewards, per hour worked" when there's no city).
3. **Section 6 uses one date:** L-4's last day if one was picked, otherwise six months in, and ends with a line pointing to the tool's
   Leaving early section for any other.
4. **The L-2 sentence is included when any offer has a range.**
5. **While the inputs have a problem the button is disabled and says why.**

## What it does

**"Copy as document"** sits beside "Print…" at the top of the comparison, on every screen size. A click copies a summary of the
comparison to the clipboard, as HTML with a plain-text fallback, that pastes into Google Docs, Word and email with its tables, then
says "Copied: paste it into a document or an email." It's written for someone who has never seen the tool: no tickmarks, workpaper
references or "basis"; every figure says what it is and over what stretch.

While the inputs have a problem, or an offer isn't filled in, the button is disabled (`aria-disabled`, so it stays focusable) with the
reason beside it: "Fix the problems listed under the verdict to copy the comparison.", "Fill in or remove offer C to copy the
comparison.", "Fill in at least two offers to copy the comparison."

## The document, section by section

Each section is built from the view model that draws it on the page, so the document and the page can't disagree. The answer, section 4
and section 5 follow the basis picked in the pipeline, as the page does; every after-rent label follows "Prices in".

| # | Section | What it holds | Built from |
|---|---|---|---|
| | **Header** | "Three job offers compared"; the date; base case, your stay and its dates, when the offers start. **The sample line** ("Includes sample offers: illustrative inputs, not market data.") first, and again at the end. | `verdict.ts` |
| 1 | **The answer** | The verdict's sentence and what its measure means; the pipeline in plain English ("A pays more; C wins once rent and prices are counted"), with the rent-and-prices swing as the two leads shown add ("$883 + $500"); a table of each step's totals over your stay and who leads by how much, per hour last; other stay lengths and the extra hours (the winner against the runner-up); the close-call line; L-2's sentence when any offer has a range; "not counted for every offer". | `verdictSentence`, the steps, stays and `extraHoursView`, L-3's ties, `riskView`, `comparability.ts` |
| 2 | **The offers, as entered** | One line per offer: salary, raises and promotions; the bonus (each year's, where entered by year) and its pay date; cash awards; RSUs, precisely (change 1); hours; where you'd live and the rent, marked as HUD's estimate when it is. | the offers compared |
| 3 | **From the offer letter to what you'd have: year 1** | Every offer's bridge side by side; "–" where an offer has no such line. Labels are the bridge's where the offers agree, general where their reasons differ (each offer's reason then in the notes). Notes: the offer letter's parts (so it adds up too), the bridge's glosses grouped by offer ("paid Mar 15 for Jul–Dec only (B and C)"), and how prices other than rent compare. | `bridge(ctx, letter, 1)` |
| 4 | **From year 1 to the answer** | Each year of your stay, as paid, with L-1's notes on a year (a promotion); your stay as paid (less what runs past your stay's last day, for a later start); less discounting to today; your stay in today's dollars (the rank list). Then the gap and its per month, worked as Show the work works the verdict. | `shownYears`, `shownStay`, `yearNotes`, the verdict's derivation |
| 5 | **What would change the answer** | L-3 as a table, Now / Ties at / Change, each offer behind the winner (salary, its first cash award, its rent after rent), then the winner's cushion; what scales with each salary; the rent note, with the entered rent and the rent that flips it. | `tieView`, `scalesText`, `rentNotes` |
| 6 | **If you leave early** | Each offer's terms (M-9's, shared: `leaveTerms`); one last day (change 3): what you'd keep after tax, repay, the bonus earned but not paid, RSUs and employer 401(k) not yet vested, the next payout or vest and what staying until it adds; notes on the forfeited bonuses (their parts add up to the table's figure) and the leave-date warnings; the pointer to Leaving early. | `leaveTerms`, L-4's panel (`forfeits`) |
| 7 | **Assumptions** | Base case; your stay; the discount rate and inflation; the tax setup; rent (yours or an estimate, with HUD's estimates) and prices; health use and savings; RSUs at vest; each About-you value still at its default says so; warnings that change the numbers; what isn't modeled. | About you, `ASSUMPTIONS`, `warningWords` |
| | **Footer** | Worked out in your browser, nothing sent; the methodology's address; the data vintages; not financial advice; the sample line again. | |

**Left out on purpose:** the charts (they don't paste reliably; the tables carry their numbers); L-5's cash timing; L-6's payments and
tax tables (print and CSV give them in full); tickmarks and workpaper references.

## The rules it keeps

- **Adds up as displayed** (CLAUDE.md, "The year figures as shown"). The year figures come from `footing.ts` through the bridge,
  `shownYears` and `shownStay`, so each column adds up as shown. What the document adds keeps the rule: a sum in a sentence is its parts
  as shown, a change is the shown "ties at" less the shown "now", the discounting line is the shown total as paid less the shown total
  today. Present values, per month and per hour stay the engine's, and the per-month division is shown as Show the work shows it. Every
  calculation the document states is listed in the model's `worked`, and the tests check each one, and every table's totals.
- **Samples are illustrative:** the sample line first and last, whenever any offer is a sample.
- **Entirely client-side:** built in the browser; the clipboard is local; no new request.
- **Loads on first use:** `app/src/copyDoc.ts` (27.9 / 11.2 kB raw / gzip) loads on the first click. The button and its reasons add
  2.5 / 0.9 kB to the main thread (381.6 / 117.4 kB, budget 120 kB gzip), which stays one chunk.

## How the copy works

1. **The click writes at once:** `navigator.clipboard.write()` with a `ClipboardItem` whose HTML and text are promises, kept once the
   chunk has loaded and the figures are in (Safari allows a write only inside the click).
2. **The figures the page may not have yet:** L-3's ties and L-4's panel, worked out only while they're on screen. The document asks the
   worker for them exactly as L-3 and L-4 ask (`tieJob`, and `cursorJobFor`, which L-4 now uses too), so a result is shared and an
   identical request is skipped. The document's last day is L-4's own, so L-4's panel is never replaced by another date's. (The proposal
   had a new slow-lane job for this; it isn't needed.)
3. **While it works,** "Getting the document ready…".
4. **The fallback:** a browser that won't take a promised write (no `ClipboardItem`, or it refuses) gets "Copy now", which copies the
   ready document through a `copy` event that sets both flavors.

## Pasting cleanly

- **One document model, two renderers:** blocks (headings, paragraphs, notes, lists, tables of cells with their kinds), written as HTML
  and as plain text, so the two can't disagree.
- **HTML:** inline styles only; Arial 11 pt (tables 9.5 pt), no colors; real `<h1>` and `<h2>`; tables with a header row in `<thead>`
  (Word repeats it on each page), a border on every cell, figures right-aligned, a heavier rule above a subtotal and a double one above
  a total; deductions in parentheses.
- **Plain text:** headings in capitals, underlined; tables as space-aligned columns of at most 80 characters (a long label wraps); prose
  left for the destination to wrap.
- **Checked in Word** (Microsoft 365, pasted from Edge into a new document, Letter, 1-inch margins; the samples, 2026-10-12): five
  tables, fonts, rules, headings and links come through. Two fixes came from it: each cell's text sits in a paragraph with no spacing of
  its own (Word otherwise gives every cell its Normal style's space after, which made each row twice as tall), with the font set on it.
  Then a few lines came out (the footer's data vintages moved into the assumptions), so the samples paste into a new document at
  exactly 3 pages.

## Tests

- **`app/src/copydoc.test.ts`**, over eight comparisons (the samples; a 5-year stay, a close call; per hour; total rewards; prices in
  Charlotte; an offer starting later, with other wages; two offers; no ranges and no samples):
  - every table's totals are the lines above them as displayed, and every stated calculation works out as displayed (sums and
    differences exactly; a division to the precision shown);
  - the HTML and the plain text carry identical figures, in the same order;
  - its figures are the page's: the verdict, the rank list, each step, the bridge, L-1's years, L-3's ties, L-4's panel;
  - the sample line first and last, only with samples; no tickmarks, workpaper references, styles, classes, scripts or images; vesting
    described precisely; the L-2 sentence only with a range; one last day for leaving early, with the pointer; plain-text tables within
    80 columns.
- **`e2e/smoke.e2e.ts`:** a click puts both flavors on the clipboard, its code loaded only then; "Copy now" where `ClipboardItem` is
  missing; the button waits, and says why, while the inputs have a problem.
- **The scan:** "copied" and "waiting on a problem", in every project.
