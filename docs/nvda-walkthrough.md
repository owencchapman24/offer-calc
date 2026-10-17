# NVDA walkthrough (slice 7, stop C; updated for v2's stops 5A to 5C)

A screen-reader check of Offer Calc's main flows, about 40 minutes, with NVDA and Chrome on Windows. You run it and send
back NVDA's Speech Viewer log; Claude fixes what it shows (`docs/ui-slices-4-8-plan.md`, slice 7). **When:** before the public
launch (CLAUDE.md, "Pre-launch checklist"). Written 2026-10-10; the two gaps found while writing it (the editors' "Edit"
buttons, L-4's slider) are fixed and the steps expect the fixes. **Updated 2026-10-16** for v2's item 5 (stops 5A to 5C): a first
visit is one sample offer on its own, every offer has its breakdown (A-1 to A-7), the comparison's breakdowns switch one offer at
a time, and Copy as document copies one offer's breakdown or offers a choice (parts 2, 3, 7 and 8 are new). **Still to add before
it's run** (audit D11): Print… and the tickmark setting.

**How to read the steps.** Each step gives the keys to press, then what NVDA should say. NVDA's wording and word order vary a
little between versions ("heading level 2, About you" or "About you, heading level 2"), so match the content, not the
punctuation. Figures come from the sample offers as of 2026-10-16. They move with the date, so "about $507" can read $504 or
$510. **Insert** is the NVDA key throughout.

**Browse mode and focus mode.** In **browse mode** NVDA reads the page and the single letters move you around: H heading, B
button, E edit field, K link, T table. In **focus mode** keys go to the page: you type into fields, and arrow keys work
sliders and tabs. NVDA switches to focus mode by itself when you Tab into a field or slider. **Insert+Space** switches by
hand, and **Escape** returns to browse mode. Each step says which mode it needs.

**What counts as a problem.** Write down the step number when you hear any of these:
- something with no name ("button", "edit", "clickable" and nothing else);
- the same thing read twice;
- the whole verdict read again while you type;
- silence where a step expects speech;
- NVDA jumping back to the top of the page after an action ("Offer Calc, document");
- a key that does something other than the step says.

---

## Part 1 · Set up (4 min)

1. **Start NVDA:** Ctrl+Alt+N, if it isn't running.
2. **Open Speech Viewer:** Insert+N opens the NVDA menu. Press Down Arrow to **Tools**, Right Arrow, Down Arrow to **Speech
   viewer**, then Enter. A small window opens and logs everything NVDA says. Drag it beside Chrome, where it stays on top.
3. **Live updates on:** press **Insert+5**. NVDA should say "report dynamic content changes on". If it says "off", press it
   again. The verdict announcements need this setting.
4. **A clean window:** in Chrome press **Ctrl+Shift+N** (Incognito). The app then starts as a first visit does, with sample
   offer A on its own, and leaves your own saved data alone.
5. **Open the app:** press **Ctrl+L**, type `offer-calc.vercel.app`, then Enter. Press **Windows+Up** to maximize and
   **Ctrl+0** for 100% zoom.
   - NVDA should say "Offer Calc" and may start reading the page. Press **Ctrl** to stop it.
6. **Mark the part:** press **Insert+F12**. NVDA says the time, which marks where this part starts in the log. Do the same at
   the start of every part.

## Part 2 · One offer on its own: find your way (3 min) · browse mode

7. **Insert+F12.** Press **H** five times. NVDA should say, one at a time:
   - "About you, heading level 2"
   - "Offers, heading level 2"
   - "A · NYC bank, on its own, heading level 2"
   - "A-1 The bottom line, heading level 3"
   - "A · NYC bank, in full, heading level 2"

   (A-2 to A-7 load as you get near them. If the fifth press says nothing, wait a moment and press **H** again.)
8. **Ctrl+Home**, then **Down Arrow** until "Sample offer: illustrative inputs, not market data." The next two should be "Start
   with my offer, button" and "See a sample comparison, button", one after the other.
9. Press **H** until "A-1 The bottom line", then **Down Arrow** a line at a time. NVDA should say, in order:
   - the first-use note, "This is much less than the salary on purpose…", and "Got it, button";
   - "Your 4-year stay (Jul 13, 2027 – Jul 12, 2031), a month, in today's dollars at New York prices:";
   - "How New York $7,564 a month over your stay was worked out (recomputed), button", then "a month over your stay";
   - "= ", the button for "$6,672 a month to spend after rent", "to spend after rent +", the button for "$892 a month saved", "saved";
   - "Year 1, as paid, in New York dollars:" and its two figures; then "Tax:", "32.4%", "of its pay over your stay"; then per
     hour and the bear case.

## Part 3 · One offer's breakdown, A-2 to A-7 (6 min) · browse mode

10. **Insert+F12.** Press **H** until "A-2 Where the money goes, heading level 3". Then **Tab** once. NVDA should say "A-2,
    employment year, combo box, Year 1".
11. **Escape** if you're in focus mode, then **T**. NVDA should say "table with 7 rows and 3 columns", its caption "Where each
    $100 of year-1 pay goes, and its dollars as paid". **Ctrl+Alt+Down Arrow** goes down a row: "tax", then the button "How
    tax, $27.27 of each $100 of year-1 pay was worked out (recomputed)" and "$41,484" (or near it).
12. Press **B** until "Download CSV: A-2, where each $100 of year-1 pay goes, button". **Enter** saves the file. NVDA should
    say "Saved offer-calc-…-A-2-where-the-money-goes-year-1-sample.csv." Chrome's download bubble may speak too.
13. Press **B** until "Show the bridge from the offer letter, button, collapsed", then **Enter**. NVDA should say "expanded".
    **Down Arrow** reads "From the offer letter, year 1", "Download CSV: A-2, from the offer letter, year 1, button", then the
    table: "Offer letter: salary + target bonus + sign-on" and its figure, down to "After rent, at New York prices".
14. Press **H** to each of A-3 to A-7 in turn: "A-3 Pay by year, and when it arrives", "A-4 Terms that can bite", "A-5 What the
    benefits are worth", "A-6 Tax, and warnings", "A-7 The work", each "heading level 3". At A-4, **Down Arrow** reads its
    terms as a list ("The $10,000 sign-on is repaid in full if you leave before Jul 12, 2028." and the others), the next
    cliff, then "If you left on" and a date field, and what you'd keep.
15. At A-6, press **B** until "Show tax by calendar year, button, collapsed", then **Enter** ("expanded"). Press **T**: NVDA
    should say a table, its caption "A's tax by calendar year: its pay, its tax by kind and its rate, $, as paid". **B** then
    reaches "Download CSV: A-6, tax by calendar year, button".
16. **Copy as document, one offer:** **Ctrl+Home**, then **B** until "Copy as document, button" (with one offer it says no
    "collapsed": it copies at once). **Enter.** NVDA should say "Getting the document ready…", then "Copied: paste it into a
    document or an email." Focus stays on the button.

## Part 4 · The sample comparison, and hearing the verdict change (6 min)

17. **Insert+F12.** Press **B** until "See a sample comparison, button", then **Enter**. NVDA should say, once, a moment later:
    "C leaves you about $507 a month more than A over your stay, after rent, in U.S.-average dollars." The page now has three
    offers, and the "See a sample comparison" button has gone.
18. Press **E** six times; each press moves to the next edit field. NVDA should say, one at a time:
    - "Your wages from another job in 2027, edit, 0"
    - "Offer A name, edit, NYC bank"
    - "Offer B name, edit, Charlotte corp"
    - "Offer C name, edit, Seattle tech"
    - "Offer A salary, edit, 110,000"
    - "Offer B salary, edit, 80,000"
19. **Enter** switches to focus mode in that field. NVDA should say "Offer B salary, edit, 80,000" and the hint "Per year,
    before tax."
20. **Ctrl+A**, then type `400000`. NVDA echoes the digits as you type. **Stop and wait 2 seconds.**
    - NVDA should then say **once**, about a second after you stop: "B leaves you about $18,000 a month more than C over your
      stay, after rent, in U.S.-average dollars." (the figure to the dollar).
    - It must not re-read the lead schedule, and must not speak after each digit.
21. **Type `x`.** NVDA should say "Enter an amount like 110000 or 110k." (an alert).
22. **Ctrl+A**, then type `80000`, and wait 2 seconds. NVDA should say once: "C leaves you about $507 a month more than A over
    your stay, after rent, in U.S.-average dollars."
23. **Escape** to go back to browse mode.

## Part 5 · Read the verdict (3 min) · browse mode

24. **Insert+F12.** Press **H** until "L Lead schedule, heading level 2".
25. **Down Arrow** a line at a time, about 12 presses. In order, NVDA should say:
    - "Illustrative samples"
    - "This is much lower than your salary on purpose…" and the buttons "See how we get there" and "Got it"
    - "C leaves you about"
    - "How U.S.-avg $507 a month over your stay was worked out (recomputed), button". It may add "collapsed" or "opens dialog".
    - "more than A over your stay, after rent, in U.S.-average dollars."
    - "Spending money after rent, priced as in an average U.S. city, plus what you save."
    - "Base case · stay 4 years (Jul 13, 2027 – Jul 12, 2031) · today's dollars"
    - "This depends on rent: at HUD's estimate for New York (", a button "How HUD's estimate for New York, $2,729 a month was
      estimated (estimate)", then "), A wins."
26. **T** jumps to the next table. NVDA should say "Winner if you stay, table with 2 rows and 5 columns".
27. **Ctrl+Alt+Down Arrow** goes down a row; **Ctrl+Alt+Right Arrow** three times goes across to the 4-year column. NVDA
    should name the column "4 yrs" and read C's lead if you stay 4 years, its button "How C … was worked out (recomputed)",
    and "a month".

## Part 6 · Show the work, and drilling in (5 min)

28. **Insert+F12.** Press **H** until "L Lead schedule". Then press **B** (next button) until "How U.S.-avg $507 a month over
    your stay was worked out (recomputed), button". That's about three presses, past "See how we get there" and "Got it".
29. **Enter.** NVDA should say "Show the work C over A", a dialog, then the same as a heading, level 3. Focus is now on that
    heading.
30. **Down Arrow** through the dialog. NVDA should say:
    - "Close, button"
    - "Base case · stay 4 years … today's dollars"
    - "table" (5 rows), with rows such as "C: 4-year total, present value" and its button "How C: 4-year total, present value,
      323,380 was worked out (recomputed)"
    - the annuity factor row and "A month, for 48 months, $507"
    - two notes
    - "Uses and ties to the highlighted figures: …"
    - "Methodology M-7.2 · Per month, link"
31. **Drill in:** press **Tab** until the button for "C: 4-year total, present value". The order is "Close, button", then that
    figure; the dialog's figures share one Tab stop. **Enter.** NVDA should say "Show the work C", heading level 3.
32. **Go back:** press **Tab** until "← Back, button". NVDA may read the arrow as "left arrow". **Enter.** NVDA should say the
    first heading again: "Show the work C over A …".
33. **Escape** closes the dialog. NVDA should say "How U.S.-avg $507 a month over your stay was worked out (recomputed),
    button": focus is back where you opened it. If NVDA only switched modes (you hear nothing, or a beep), press **Escape**
    again.

## Part 7 · The breakdowns, one offer at a time (4 min)

34. **Insert+F12.** Press **H** until "A · NYC bank, on its own, heading level 2" (after the lead schedule).
35. **Tab** once. NVDA should say "Offers, one at a time, tab control, A NYC bank, tab, selected, 1 of 3", and switch to focus
    mode by itself.
36. **Right Arrow.** NVDA should say "B Charlotte corp, tab, selected, 2 of 3". The section now shows B: press **Escape**
    (browse mode), then **H** until "B-1 The bottom line, heading level 3", and **H** again for "B-2 Where the money goes".
    - If instead NVDA just reads the next thing on the page, or names B without "selected", you were in browse mode. Press
      **Shift+Tab** back to the tabs, **Insert+Space** for focus mode, and **Right Arrow** again. Note which happened.
37. **End** on the tabs goes to "C Seattle tech, tab, selected, 3 of 3"; **Home** back to "A NYC bank, tab, selected, 1 of 3".
38. **"See how we get there":** **Ctrl+Home**, **H** until "L Lead schedule", **B** until "See how we get there, button",
    **Enter**. NVDA should say "From the offer letter, year 1, heading level 4": C's bridge, open in its A-2 (C leads).

## Part 8 · Copy as document, with two or more offers (3 min)

39. **Insert+F12. Ctrl+Home**, then **B** until "Copy as document, button, collapsed". **Enter.** NVDA should say "What to
    copy, grouping" and "The comparison, the offers side by side: 2-3 pages, radio button, checked, 1 of 3", in focus mode.
40. **Down Arrow** goes to "C's breakdown, the offer shown, on its own: about 2 pages, radio button, checked, 2 of 3" (the
    offer whose breakdown is shown: C after step 38), and again to "Both, each offer's breakdown, then the comparison, 3 of 3".
41. **Tab** to "Copy, button", then **Enter**. The choice closes and NVDA should say "Copy as document, button, collapsed",
    then "Getting the document ready…" and "Copied: paste it into a document or an email."
42. **Escape** from the choice instead of copying (open it again with **Enter**, then **Escape**) goes back to "Copy as
    document, button, collapsed", with nothing copied.

## Part 9 · The phone's offer tabs, at a narrow width (4 min)

43. **Insert+F12.** Press **Ctrl+Plus** until the page shows one offer at a time, with tabs A, B and C above the ledger:
    about 300% on a 1920-pixel screen, about 200% on a 1366-pixel one. Then **Ctrl+Home**.
44. Press **H** until "Offers, heading level 2". **Tab** past "Quick, toggle button, pressed" and "Detailed, toggle button, not
    pressed". NVDA should then say "Offers, tab control, A NYC bank, tab, selected, 1 of 3".
45. **Right Arrow.** NVDA should say "B Charlotte corp, tab, selected, 2 of 3".
    - If instead NVDA just reads the next thing on the page, or names B without "selected", you're in browse mode. Press
      **Insert+Space** for focus mode and press **Right Arrow** again. Note which happened.
46. **End** goes to "C Seattle tech, tab, selected, 3 of 3"; **Home** goes back to "A NYC bank, tab, selected, 1 of 3".
47. **Tab** a few times. You should hear only offer A's fields: "More help, button", "Remove offer A, button", "Offer A name,
    edit, NYC bank", and so on. Nothing of B's or C's should come up.
48. **The verdict bar:** press **Escape** (browse mode), then **Ctrl+End**. NVDA should say "C leads by U.S.-avg +$507 a month
    · stay 4 yrs. Go to the lead schedule, button". **Enter.** NVDA should say "L Lead schedule, heading level 2".
49. **Ctrl+0** to go back to 100% zoom.

## Part 10 · A detailed-mode row editor (5 min)

50. **Insert+F12. Ctrl+Home**, then **H** until "Offers". Press **B** until "Detailed, toggle button, not pressed", then
    **Enter**. NVDA should say "pressed".
51. Press **B** until "Sign-on and other cash amounts, pay dates, clawbacks, button, collapsed", then **Enter**. NVDA should
    say "expanded".
52. Press **B** until "Edit A's sign-on and other cash, button, collapsed". The next two are B's and C's, each named the same
    way. Press **Enter**.
    - The editor opens and focus jumps into it: "Offer A payment 1 name, edit, Sign-on", in focus mode.
53. **Tab** through the editor. NVDA should say, in order:
    - "More help, button"
    - "Offer A payment 1 amount, edit, 10,000"
    - "More help, button"
    - "Offer A payment 1, paid, combo box, Days after you start"
    - "Offer A payment 1, days after you start, edit, 30"
    - "More help, button"
    - "Offer A payment 1 clawback window, edit, 12"
    - "Offer A payment 1 clawback, owed back, combo box, All of it"
    - "Offer A payment 1 clawback clock, combo box, Your start date"
    - "Why the payment 1 clawback clock is the default (default), button"
    - and on to "Remove the clawback", "Remove this payment" and "+ Add another payment"
54. **Shift+Tab** until "Done, button", then **Enter**. The editor closes and NVDA should say "Edit A's sign-on and other
    cash, button, collapsed": focus is back on the button that opened it. (While the editor is open, the same button is "Close
    A's sign-on and other cash".)
55. Press **Escape** if you're in focus mode. Press **Shift+B** until "Quick, toggle button, not pressed", then **Enter**, to go
    back to quick mode.

## Part 11 · L-4's last-day slider (4 min)

56. **Insert+F12.** Press **Ctrl+End**, then **Shift+H** until "L-4 Leaving early, heading level 2". The later schedules load
    as you get near.
57. **Tab** past:
    - "After tax, toggle button, pressed"
    - "Total rewards, toggle button, not pressed"
    - "Last day", a date field. Chrome reads it in parts.
    - "A month earlier, button"
    - "A month later, button"
    - "Your stay's last day (Jul 12, 2031), button"

    The next Tab stop is the chart. NVDA should say "Last day, slider, Jan 12, 2028. A keeps $41,254, B $35,029, C $47,560."
    and the hint "Your last day of work. Drag along the chart, or step a month at a time." NVDA should switch to focus mode by
    itself. (Figures as of 2026-10-10.)
58. **Right Arrow** moves a month. A moment later NVDA should say, once: "Feb 12, 2028. A keeps $73,975, B $41,695, C
    $56,617." A's figure jumps because its bonus is paid on Jan 31. Each step is the date, then what each offer keeps after
    tax, matching the panel under the chart.
    - Right Arrow again: "Mar 12, 2028. …".
    - **Shift+Right Arrow** moves a day: "Mar 13, 2028. …".
    - **Home** goes to the first day on the chart, "Jul 13, 2027. …"; **End** goes to the last.
    - Hold Right Arrow down: you should hear the day you stop on, not every month you pass.
59. **Escape** (browse mode), then **Down Arrow** to read the panel under the chart. It starts "If your last day is …", then a
    line per offer: "A, … worked · keep $…, button …".

## Part 12 · Export, then import (5 min)

60. **Insert+F12. Ctrl+Home.** Press **K** (next link) until "Data, link", then **Enter**. NVDA should say "Your data, heading
    level 1": focus moves to the new page.
61. Press **B** until "Download offer-calc-2026-10-16-sample.json, button", then **Enter**. The date in the name is the day
    you run this; the rest of these steps use 2026-10-16. NVDA should say "Saved offer-calc-2026-10-16-sample.json."
    Chrome's download bubble may speak too.
62. Press **B** until "Choose a file…, button", then **Enter**. Windows' Open dialog appears ("Open, dialog, File name,
    edit").
    - Type `offer-calc-2026-10-16-sample.json` and press Enter. If the dialog isn't in Downloads, type
      `%USERPROFILE%\Downloads\offer-calc-2026-10-16-sample.json` instead.
63. Back in Chrome, focus moves to the review. NVDA should say "Importing offer-calc-2026-10-16-sample.json, region".
    **Down Arrow** reads:
    - the file name
    - "Replaces your 3 offers (A NYC bank, B Charlotte corp, C Seattle tech) with 3 from the file: …"
    - "Replaces About you: single, a stay of 4 years, …"
    - "Takes the file's view choices: …"
    - the sample note
    - "Its inputs check out: no problems found."
    - "Replace everything, button", "Cancel, button"
64. **Tab** to "Replace everything, button", then **Enter**. NVDA should say "Imported 3 offers. See the comparison". Focus is
    on that message.
65. **Tab** to "See the comparison, link", then **Enter**. You're back on the comparison with the same verdict: press **H**
    until "L Lead schedule", then **Down Arrow** to hear "C leaves you about … $507 a month …".

## Part 13 · Send me the log (2 min)

66. Press **Insert+F12** a last time.
67. **Alt+Tab** to the **NVDA Speech Viewer** window and click in its text (or press Tab once to put focus there).
68. **Ctrl+A**, then **Ctrl+C**, then paste it into our chat with **Ctrl+V**. Send all of it, however long. The time stamps
    split it into parts.
69. Tell me, in a line each:
    - your NVDA version (Insert+N, then Help, then About) and Chrome's (type `chrome://version` in the address bar);
    - any step where a key did something other than the step said: the step number and what happened;
    - at step 58, whether the figures came quickly enough, and whether you'd rather hear less (or more) on each step.

Then close the Incognito window (Ctrl+Shift+W). Nothing you did in it is kept.
