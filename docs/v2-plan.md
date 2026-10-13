# v2 plan (proposed 2026-10-13)

**Status: proposed, not approved. Nothing in it is built.** What to build after v1 (UI slices 1-8 and Copy as document), in
priority order:
1. **Beyond the money:** what else each offer is worth to you, in dollars you name, and whether (and at what figure) that flips
   the verdict.
2. **Market benchmarks:** where each offer's base salary sits among BLS's wage percentiles for its occupation and metro area
   (OEWS, May 2025).
3. **Negotiation help:** L-3's ties and the market figures in one short summary, with an optional draft email: what would tie,
   not advice.
4. **Accuracy:** days off, commuting, relocation costs, remote work under convenience-of-employer rules, startup options as
   scenarios, and Public Service Loan Forgiveness.

A fresh session should be able to build an approved item from this file, `CLAUDE.md` and `docs/ui-design.md`.

**Testers first.** Each item has questions to put to testers before it's built ("Questions for testers", below). Record the
answers in `docs/user-testing.md`; each item says which answers would change it.

**Working agreements apply** (CLAUDE.md): a branch and a pull request per review stop, CI green before merging; tests, typecheck,
the engine guard and an unchanged grid before each merge; `npm run build` for UI work; tax-engine changes on their own branch in
separate commits, each with the oracle byte-identical (or the difference explained); live screenshots, light and dark, at each UI
stop.

## What v2 changes about the product's scope

`docs/ui-design.md` §1 says what the tool isn't for: market data or salary benchmarks; telling you which job to take ("we compare
money, time and prices; career fit is yours"); financial advice. Items 1-3 move those lines, so they need your approval before
anything else (D1). Proposed:
- **Career fit stays yours.** Item 1 adds up values you set. The tool never suggests one, and the money verdict and L-1 to L-6 stay
  money (L-3's ties too, unless you choose otherwise: D4).
- **Market data is context, never an input.** Item 2's percentiles never enter the verdict, a total or a tie. They're published data,
  traced (`T`) to BLS, with their definitions and limits beside them.
- **Still not advice.** Item 3 restates figures the tool already has: what would tie, and where that sits among published wages. It
  never says what to ask for, and the draft is text you edit and send yourself.

With approval, `docs/ui-design.md` rev 4 records the new §1 and each item's design as it's built.

## Performance plan (every item)

**Where it stands** (2026-10-13, `main` after Copy as document):
- **Main thread:** 381.6 / 117.35 kB raw / gzip for a quick-mode visit (`npm run check-bundle`), one chunk, against the 120 kB budget:
  2.65 kB of room. The stylesheet, render-blocking too, is 46.4 / 10.2 kB and isn't budgeted.
- **LCP:** 1.96 s locally today (`npm run lighthouse`: mobile, a discarded warm-up, the median of 3; performance 97), 1.91 s in CI at
  slice 6's stop B, against 2.5 s. You've seen about 2.2 s, so this plan works to that: about 0.3 s of room. The LCP element is About
  you's assumptions line, which renders before the worker answers, so LCP follows the main chunk's and the stylesheet's download and
  parse, not the engine.
- **What the main chunk holds** (attributed through a source map; each piece gzipped on its own, so the pieces add to more than the
  whole): React, react-dom and the scheduler about 64 kB, over half; the city list (`cities.json`, 434 places) 6.5 kB; the app's own code
  about 47 kB, led by `App.tsx` 5.3, `Lead.tsx` 3.8, `ByYear.tsx` 3.8, `model.ts` 3.7, `metrics.ts` 3.5 and `help.ts` 3.1.
- **Worker:** 255.6 kB raw. Off the LCP path, but it sets when the first verdict appears.

**The rules:**
1. **Nothing new on the main thread but entry points.** Each item's code loads on first use, in a chunk of its own or an existing lazy
   one (as L-2 to L-6, detailed mode, the derivations, CSV, print and Copy as document do). Each item's data loads where it's used: the
   worker, or a same-origin fetch. The target is at most 0.5 kB gzip on the main thread per item, reported at each stop.
2. **Make room first** (step 0: its own pull request, before item 1, no change on screen). Aim for 6-9 kB gzip back:
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
   (reported, not budgeted). A feature's CSS is a few rules; anything bigger goes with its chunk.
4. **Time to the first verdict** joins the Lighthouse report: a `performance.mark` when the first verdict paints, read from the trace.
   Reported, not a gate, until there's a baseline. It's what item 4's engine work (a bigger worker, more per edit) would move.
5. **Data is never in a JavaScript chunk.** Item 2's OEWS files are static JSON fetched on demand, one per occupation, from a path that
   carries the vintage, cached as immutable (`vercel.json`). The CSP already allows it (`connect-src 'self'`).
6. **The fast lane's per-edit time** (`npm run bench`, side by side with `main`) at every stop that adds to it. Item 1 adds a closed form
   (microseconds); item 4 adds projection work.

**The estimate for v2 in all:** about 1 kB gzip more on the main thread (item 1 about 0.3 kB, item 2 about 0.2, item 3 none, item 4
under 0.3), against the 6-9 kB step 0 frees, so the main thread ends lighter than today and LCP no worse. Everything else (an estimated
15-20 kB gzip of new lazy chunks, plus OEWS's JSON) loads only when it's used.

## 1. Beyond the money

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
- **Per hour:** a flip isn't defined per hour (nor is breakeven), so the block says so and uses the step-3 figures, as L-3 does.
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

**The job:** "Is $110,000 a good offer for this?" Testers look it up elsewhere and come back. This puts each offer's base salary
against published wages for its occupation where you'd live, with what those figures do and don't cover said beside them. Context
only: it never enters the verdict, a total or a tie (D1).

**Scope**
- **A new schedule, L-7 · Against the market,** right after L-3 on the page (D6: references are stable IDs, so L-7 sits where it reads
  best; its last part is item 3's summary). It loads as you scroll toward it, like L-2 to L-6.
- **The occupation picker,** in L-7, per offer: a search over BLS's occupation titles (and alternate job titles, if the data allows;
  see Data), saved with the offer. It lives in L-7, not the ledger: it changes no money figure, and the ledger stays the money's inputs.
  Nothing is picked for you.
- **Per offer, a strip:** the 10th, 25th, 50th, 75th and 90th percentile annual wages for that occupation in the offer's metro area,
  with the offer's starting base salary marked in its offer color, and one sentence:

```
 L-7 · AGAINST THE MARKET                       base salary vs BLS wage percentiles · May 2025 · every experience level
   A  Financial and investment analysts · New York metro area                                  [ Change occupation ]
        10th     25th        median            75th              90th
        ├─────────┼─────────────┼─────────────────┼─────────────────┤
                                          ◆ A $110,000T
      A's $110,000 is below the median ($128,930T).                (with the files, the sentence names its band)
```
  (A layout sketch. The median is BLS's May 2025 figure for this occupation in the New York-Newark-Jersey City metro area, from its
  query system, where the mean is $148,350 and the national median $102,740; the other percentiles are only in the downloadable
  files, so they come at stop 2A.) The sample shows the main risk at once: a new grad's $110,000 sits below a median that covers every
  experience level. Each published figure is `T`, traced to BLS with its table, area and vintage; the sentence is ✓, with its comparison
  as the derivation. A table view and its CSV, as L-1's and L-2's.
- **Placement words, not an invented percentile:** "below the 10th percentile", "between the 25th percentile and the median", "at or
  above the 90th percentile". No interpolated "62nd percentile": BLS publishes five points, and a figure between them would be ours,
  not theirs.
- **What's compared:** the starting base salary only (D7). BLS's wages leave out year-end bonuses, stock and benefits (below), so the
  offer's bonus, RSUs and the rest stay in the money comparison, where they belong.
- **The caveats, always shown under the strips** (short, each linking to M-15, which quotes BLS):
  1. **Every experience level.** BLS: the survey "does not gather demographic information", and its data "do not contain information
     about pay according to the level of work performed"; trainees are counted in the occupation they're training for. So the
     percentiles run from new hires to people decades in. A first job below the median isn't a low offer.
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
  for care with small differences; so the words stay coarse ("between the 25th percentile and the median"), and nothing averages
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
  date yet). Added to CLAUDE.md's data refresh calendar.

**Tests:** the parser on a small fixture; the area match for every city in the list; the placement words at the edges (a salary equal to
a percentile, under the 10th, over the 90th, a top-coded 90th, suppressed percentiles); L-7's figures in `metrics.test.ts`; the copied
document's section; the scan (an occupation picked, the picker open, a fallback to the state, a phone).

**In the copied document:** a short section, "Against published wages": each offer's occupation, area and placement sentence, the five
figures, and the caveats in one paragraph. **In the methodology:** M-15, Against the market: the source and vintage, BLS's definitions
quoted, the caveats at length, the area match and fallbacks; M-11 lists the dataset.

**Bundle and LCP:** L-7's slot on the main thread (about 0.2 kB gzip). L-7, its picker and words in a lazy chunk (an estimated 5-7 kB
gzip). The title index is fetched when the picker first opens and an occupation's file when it's picked (sizes at stop 2A). The worker
doesn't change. L-7 is far below the first screen, so LCP doesn't move.

**Risks**
- **Misreading:** every-experience percentiles make a new grad's offer look low. The biggest risk; the caveats, the words, and the
  testers' answers (question 3) decide whether the item ships.
- **The wrong occupation:** SOC titles are broad and unfamiliar. Alternate titles help; testers will show whether they're needed.
- **Area mismatch:** where you'd live vs where the job is, and BEA vs OEWS areas. Stated, and tested city by city.
- **The scope line** (D1): once the tool shows market data, people may read it as "what you should be paid". The wording never says so.
- **BLS blocks scripts:** `--file` covers it, as for HUD.
- **Repository size:** several hundred small JSON files a year. Stop 2A measures it; the alternative is one compact file split at build.

**Review stops**
- **2A, the data:** `fetch-oews`, the files and their sizes, the area match report, BLS's definitions verified and quoted, and the
  samples' occupations and metros printed (`npm run offers` gains a market table). No UI.
- **2B, L-7:** the picker, the strips, the caveats, the table view and CSV, M-15, the copied document, print, the scan. Live screenshots.

## 3. Negotiation help

**The job:** L-3 already says what would tie ("A: starting salary $110,000 → $118,626"). Someone about to negotiate wants that in a
form they can use, beside where the figure sits among published wages, without the tool telling them what to do.

**Scope**
- **A summary,** the last part of L-7 ("Putting it together"), for each offer behind the winner, and the winner's cushion:

```
 PUTTING IT TOGETHER · what would tie C · after rent at U.S. prices · 4 years
   A  A starting salary of $118,626✓ (+$8,626✓, +7.8%) would tie C, or a sign-on of $45,487✓ instead of $10,000T.
      Among financial and investment analysts in the New York metro area (BLS, May 2025, every experience level),
      $118,626 is below the median ($128,930T); so is A's $110,000.
      Counting what you said the rest is worth, A already leads C.                          (only with item 1's values)
   These are what would make the offers even on the numbers you entered, not advice on what to ask for.
                                                                                            [ Draft an email… ]
```
  (The ties are W7a's, the samples at their fixed dates; the values line is item 1's example; the median is BLS's May 2025 figure, as in
  L-7's sketch. Where the values don't already put an offer ahead, the salary that ties counting them needs L-3's switch, D4.)
- **The draft email** (optional): "Draft an email…" opens an editable text box, filled from a template, with brackets for what the tool
  can't know ([Recruiter's name], [Company], [Your name]). You pick what it mentions: the gap to your other offer, in words; the salary
  that ties; the sign-on that ties; the market band (off by default); the other offer's own figures (off by default: those are yours to
  share or not). "Copy" puts it on the clipboard as
  plain text. Nothing is sent or saved, and there's no `mailto:` link: the design keeps salary figures out of URLs (§10's "no share
  links").
- **Its sentences are factual, in the first person:** "After taxes and rent, the other offer comes out about $487 a month ahead for me.
  A starting salary of $118,626 would make the two about even." Never "deserve", "market rate", "you should", "ask for". A test fails
  on a list of such words in the summary and the template, as `check-engine.ts` guards the engine.
- **Basis:** the summary follows the verdict's basis; the email speaks in starting salary and sign-on, the levers a recruiter knows, and
  names the basis in words ("after taxes and rent"). Per hour: the step-3 figures, as L-3.
- **Without an occupation:** no market sentence; the summary is L-3's ties alone. Built before item 2 (D9), the summary is L-3's last
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

Six parts, each its own pull request, in this order (D10): the two small ones that feed "per hour of your life" first, then
relocation, then the large ones. The order is meant to be reset by the testers' answers.

| Part | Size | Engine | Main thread |
|---|---|---|---|
| 4a Days off | Small | `hours`: vacation and holidays in place of weeks | 0 (detailed mode) |
| 4b Commuting | Small-medium | a monthly cost, and hours | 0 (detailed mode) |
| 4c Relocation | Small | a dated cost; reimbursements as wages | 0 (detailed mode) |
| 4d Remote work and working across a state line | Large | tax engine: nonresident tax, credits, sourcing | 0 (detailed mode) |
| 4e Startup options | Medium-large | an option grant, exit scenarios, its tax | 0 (detailed mode) |
| 4f Public Service Loan Forgiveness | Large, volatile | loans, payment plans, AGI by year | under 0.3 kB (a closed About-you row) |

Every part's inputs live in detailed mode (a lazy chunk, 14 kB gzip today), or for 4f behind a closed row in About you that loads its
inputs on first use, so none adds more than an entry point to the main thread. Each grows the worker and may grow the fast lane's
per-edit time, so each stop reports `npm run bench` side by side with `main` and the time to the first verdict.

### 4a. Days off

- **Today:** "weeks a year", default 50 (`D`, "two weeks off"), feeds hours and per hour. Offer letters and people count time off in
  days, and two weeks is short of what's typical: BLS's National Compensation Survey (March 2026, USDL-26-1534) has private-industry
  workers with paid vacation averaging 11 days after a year's service (16 after five), and paid holidays averaged 8 days in 2025.
- **Scope:** per offer, in the Hours section, in place of weeks: "Vacation days you'd take" and "Paid holidays". Weeks worked = 52 −
  (vacation + holidays) ÷ 5. "Unlimited" PTO: the days you expect to take, and the help says so.
- **Defaults** (D14): BLS's figures, 11 and 8 (`D`, each with its source), so 48.2 weeks. That's honest but moves every default per-hour
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
- **v1's warning is out of date:** `CONVENIENCE_RULE_STATES` (`src/offer/location.ts`) still lists Nebraska, so a Nebraska employer
  raises a warning that no longer applies. That's a fix to make now, on its own (flagged separately), not part of v2.
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

**Review stops:** one per part, except 4d and 4e (two each: the engine with its hand-checked tests, then the UI); 4f starts with a spike
(a short written finding, no code merged) and you decide from it.

## Questions for testers

Ask these before building each item, ideally while the tester has their own offers in front of them, and record the answers in
`docs/user-testing.md` (a finding per row, as now). Open questions first; show a sketch only after. Each group ends with what would
change the plan.

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
4. What would you do with "between the median and the 75th percentile"?
- **Would change it:** testers can't find their occupation (then curated titles for the audience's jobs); they read every-experience
  percentiles as "underpaid" even with the caveats (then show only the lower half's figures for entry level, or drop the item).

**Item 3, Negotiation help**
1. Did you negotiate any of these offers, or plan to? What did you ask for, and how did you arrive at it?
2. Would you use a draft email? What would make you uncomfortable sending one built from a tool?
3. Would you mention the other offer's figures, or the market's?
- **Would change it:** nobody negotiates (then the summary alone, no draft); testers read "would tie" as "ask for" (then wording again,
  before building).

**Item 4, Accuracy** (one question each, to size them)
1. How many days off do you expect at each offer, holidays included? Is any "unlimited"?
2. How would you get to work, how long would it take, and what would it cost?
3. Do any offers pay for the move, and what will moving cost you?
4. Would you live in one state and work for an employer in another, in the office or remotely? Which states?
5. Does any offer include stock options or private-company RSUs? Do you know the strike price and the number of shares?
6. Do you have federal student loans? Is any offer from a government employer or a nonprofit?
- **Would change it:** the answers set item 4's order (D10); a part no tester needs waits.

## Decisions for you

Each with the recommendation first.

| # | Decision | Recommended | The alternative |
|---|---|---|---|
| D1 | The tool's scope (`docs/ui-design.md` §1) | Revise it as in "What v2 changes", for items 1-3 | Keep §1; build item 4 only |
| D2 | Room on the main thread | Step 0 first; the budget stays 120 kB | Raise the budget again, with Lighthouse holding LCP |
| D3 | Where your values show | Their own block under the verdict; the hero stays money | A step in the pipeline that the verdict can follow |
| D4 | L-3 with your values | Decide at stop 1A, once the block is seen | Build the switch with 1A |
| D5 | A value's units | A year, today's dollars, rising with inflation at anniversaries; not taxed or priced | The same nominal dollars every year |
| D6 | L-7's place | After L-3 on the page, as L-7 | A second part of L-3 |
| D7 | What the market strip compares | Base salary against May 2025 wages as published | Wages aged to the offer's start by the ECI |
| D8 | Where OEWS data lives | One file per occupation under `app/public/oews/<vintage>/`, committed | One compact file, split at build |
| D9 | Item 3 without item 2 | Only if testers want negotiation help before market data | Always after 2B |
| D10 | Item 4's order | 4a, 4b, 4c, 4d, 4e, then 4f's spike, reset by testers' answers | By tester demand alone |
| D11 | Options vested at your stay's end | Shown beside the verdict, per scenario; not counted | Counted at the exit's value (an exception to the stay rule) |
| D12 | Cross-state pairs (4d) | The multi-state metros' pairs first, each with sources and tests | Every state at once |
| D13 | Public Service Loan Forgiveness | A spike first; forgiveness beside the verdict, never in it | Drop it from v2 |
| D14 | Days off (4a) | Vacation and holidays apart, at BLS's 11 and 8 (per-hour figures move about 4%, once) | One "days off" input at 10, today's 50 weeks: nothing moves |
| D15 | Commute time in per hour (4b) | Counted once every offer has a commute, labeled | Never; per hour stays hours worked |

## Order and stops

| Stop | What | Needs first |
|---|---|---|
| 0 | Make room: L-1 and the bridge on first use, quick mode's help on first open | D2 |
| 1A | Beyond the money: engine, lead block, ledger rows, M-14, session and export | testers (item 1), D3, D5 |
| 1B | Beyond the money: the copied document, print, the scan; L-3's switch if chosen | 1A, D4 |
| 2A | OEWS data: `fetch-oews`, the files, the area match, the samples' figures | testers (item 2), D7, D8 |
| 2B | L-7, Against the market: picker, chart, caveats, M-15, the copied document | 2A, D6 |
| 3A | Negotiation help: the summary, the draft email, the wording test | 2B (or 1A, D9), testers (item 3) |
| 4a-4f | Accuracy, a stop per part (two for 4d and 4e; a spike for 4f) | testers (item 4), D10-D15 |

**On approval:** `docs/ui-design.md` rev 4 (§1, the ledger's new rows in §3.3, L-7 in §4, M-14 and M-15 in §8, the v2 stops in §12);
CLAUDE.md (Next steps, the design docs); `docs/offer-model.md` for each engine change; `docs/nvda-walkthrough.md`, a part for each new
control, before launch. The data refresh calendar gains each dataset as its item is built: OEWS (yearly, spring), BLS's paid-leave
figures (yearly, September, if D14's defaults use them), the IRS mileage rates (each December, and mid-year when the IRS changes them, as
in 2026), each convenience rule and cross-state pair's sources (each January), and, if 4f is built, the repayment plans' rules.
