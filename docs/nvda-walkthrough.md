# NVDA walkthrough (slice 7, stop C)

A screen-reader check of Offer Calc's main flows, about 30 minutes, with NVDA and Chrome on Windows. You run it and send
back NVDA's Speech Viewer log; Claude fixes what it shows (`docs/ui-slices-4-8-plan.md`, slice 7).

**How to read the steps.** Each step gives the keys to press, then what NVDA should say. NVDA's wording and word order vary a
little between versions ("heading level 2, About you" or "About you, heading level 2"), so match the content, not the
punctuation. Figures come from the sample offers as of 2026-10-10. They move with the date, so "about $500" can read $498 or
$503. **Insert** is the NVDA key throughout.

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
4. **A clean window:** in Chrome press **Ctrl+Shift+N** (Incognito). The app then starts from the sample offers and leaves
   your own saved data alone.
5. **Open the app:** press **Ctrl+L**, type `offer-calc.vercel.app`, then Enter. Press **Windows+Up** to maximize and
   **Ctrl+0** for 100% zoom.
   - NVDA should say "Offer Calc" and may start reading the page. Press **Ctrl** to stop it.
6. **Mark the part:** press **Insert+F12**. NVDA says the time, which marks where this part starts in the log. Do the same at
   the start of every part.

## Part 2 · Find your way (2 min) · browse mode

7. **Insert+F12.** Then press **H** five times. NVDA should say, one at a time:
   - "About you, heading level 2"
   - "Offers, heading level 2"
   - "L Lead schedule, heading level 2"
   - "L-1 By year, heading level 2"
   - "From the offer letter, heading level 3"

   (L-2 to L-5 load as you get near them, so they aren't there yet.)
8. **Ctrl+Home** to go back to the top.

## Part 3 · Quick-mode entry, and hearing the verdict change (6 min)

9. **Insert+F12.** Press **E** six times; each press moves to the next edit field. NVDA should say, one at a time:
   - "Your wages from another job in 2027, edit, 0"
   - "Offer A name, edit, NYC bank"
   - "Offer B name, edit, Charlotte corp"
   - "Offer C name, edit, Seattle tech"
   - "Offer A salary, edit, 110,000"
   - "Offer B salary, edit, 80,000"
10. **Enter** switches to focus mode in that field. NVDA should say "Offer B salary, edit, 80,000" and the hint "Per year,
    before tax."
11. **Ctrl+A**, then type `400000`. NVDA echoes the digits as you type. **Stop and wait 2 seconds.**
    - NVDA should then say **once**, about a second after you stop: "B leaves you about $18,060 a month more than C, after
      rent, at U.S. prices."
    - It must not re-read the lead schedule, and must not speak after each digit.
12. **Type `x`.** NVDA should say "Enter an amount like 110000 or 110k." (an alert).
13. **Ctrl+A**, then type `80000`, and wait 2 seconds. NVDA should say once: "C leaves you about $500 a month more than A,
    after rent, at U.S. prices."
14. **Escape** to go back to browse mode.

## Part 4 · Read the verdict (3 min) · browse mode

15. **Insert+F12.** Press **H** until "L Lead schedule, heading level 2".
16. **Down Arrow** a line at a time, about 12 presses. In order, NVDA should say:
    - "Illustrative samples"
    - "Sample offers: illustrative inputs, not market data. They start next July." and "Start with my offers, button"
    - "This is much lower than your salary on purpose…" and the buttons "See how we get there" and "Got it"
    - "C leaves you about"
    - "How $500 a month was worked out (recomputed), button". It may add "collapsed" or "opens dialog".
    - "more than A, after rent, at U.S. prices."
    - "Spending money after rent, priced as in an average U.S. city, plus what you save."
    - "Base case · stay 4 years (Jul 13, 2027 – Jul 12, 2031) · today's dollars"
    - "This depends on rent: at HUD's estimate for New York (", a button "How HUD's estimate for New York, $2,729 a month was
      estimated (estimate)", then "), A wins."
17. **T** jumps to the next table. NVDA should say "Winner if you stay, table with 2 rows and 5 columns".
18. **Ctrl+Alt+Down Arrow** goes down a row; **Ctrl+Alt+Right Arrow** three times goes across to the 4-year column. NVDA
    should name the column "4 yrs" and read "C, How C +$500 a month if you stay 4 years was worked out (recomputed), button, a
    month".

## Part 5 · Show the work, and drilling in (5 min)

19. **Insert+F12.** Press **H** until "L Lead schedule". Then press **B** (next button) until "How $500 a month was worked out
    (recomputed), button". That's about four presses, past "Start with my offers", "See how we get there" and "Got it".
20. **Enter.** NVDA should say "Show the work C over A · after rent, at U.S. prices, dialog", then "heading level 3, Show the
    work C over A · after rent, at U.S. prices". Focus is now on that heading.
21. **Down Arrow** through the dialog. NVDA should say:
    - "Close, button"
    - "Base case · stay 4 years … today's dollars"
    - "table" (5 rows), with rows such as "C: 4-year total, present value" and "How C: 4-year total, present value, 323,121 was
      worked out (recomputed), button"
    - the annuity factor row and "A month, for 48 months, $500"
    - two notes
    - "Uses and ties to the highlighted figures: …"
    - "Methodology M-7.2 · Per month, link"
22. **Drill in:** press **Tab** until "How C: 4-year total, present value, 323,121 was worked out (recomputed), button". The
    order is "Close, button", then that figure; the dialog's figures share one Tab stop. **Enter.** NVDA should say "Show the
    work C · 4-year after rent, at U.S. prices", heading level 3.
23. **Go back:** press **Tab** until "← Back, button". NVDA may read the arrow as "left arrow". **Enter.** NVDA should say the
    first heading again: "Show the work C over A · after rent, at U.S. prices".
24. **Escape** closes the dialog. NVDA should say "How $500 a month was worked out (recomputed), button": focus is back where
    you opened it. If NVDA only switched modes (you hear nothing, or a beep), press **Escape** again.

## Part 6 · The phone's offer tabs, at a narrow width (4 min)

25. **Insert+F12.** Press **Ctrl+Plus** until the page shows one offer at a time, with tabs A, B and C above the ledger:
    about 300% on a 1920-pixel screen, about 200% on a 1366-pixel one. Then **Ctrl+Home**.
26. Press **H** until "Offers, heading level 2". **Tab** past "Quick, toggle button, pressed" and "Detailed, toggle button, not
    pressed". NVDA should then say "Offers, tab control, A NYC bank, tab, selected, 1 of 3".
27. **Right Arrow.** NVDA should say "B Charlotte corp, tab, selected, 2 of 3".
    - If instead NVDA just reads the next thing on the page, or names B without "selected", you're in browse mode. Press
      **Insert+Space** for focus mode and press **Right Arrow** again. Note which happened.
28. **End** goes to "C Seattle tech, tab, selected, 3 of 3"; **Home** goes back to "A NYC bank, tab, selected, 1 of 3".
29. **Tab** a few times. You should hear only offer A's fields: "More help, button", "Remove offer A, button", "Offer A name,
    edit, NYC bank", and so on. Nothing of B's or C's should come up.
30. **The verdict bar:** press **Escape** (browse mode), then **Ctrl+End**. NVDA should say "C leads by +$500 a month · stay 4
    yrs. Go to the lead schedule, button". **Enter.** NVDA should say "L Lead schedule, heading level 2".
31. **Ctrl+0** to go back to 100% zoom.

## Part 7 · A detailed-mode row editor (5 min)

32. **Insert+F12. Ctrl+Home**, then **H** until "Offers". Press **B** until "Detailed, toggle button, not pressed", then
    **Enter**. NVDA should say "pressed".
33. Press **B** until "Sign-on and other cash amounts, pay dates, clawbacks, button, collapsed", then **Enter**. NVDA should
    say "expanded".
34. Press **B** until the first "Edit, button, collapsed". That's offer A's. **Note whether NVDA tells you which offer it's
    for.** Press **Enter**.
    - The editor opens and focus jumps into it: "Offer A payment 1 name, edit, Sign-on", in focus mode.
35. **Tab** through the editor. NVDA should say, in order:
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
36. **Shift+Tab** until "Done, button", then **Enter**. The editor closes and NVDA should say "Edit, button, collapsed":
    focus is back on the button that opened it.
37. Press **Escape** if you're in focus mode. Press **Shift+B** until "Quick, toggle button, not pressed", then **Enter**, to go
    back to quick mode.

## Part 8 · L-4's last-day slider (4 min)

38. **Insert+F12.** Press **Ctrl+End**, then **Shift+H** until "L-4 Leaving early, heading level 2". The later schedules load
    as you get near.
39. **Tab** past:
    - "After tax, toggle button, pressed"
    - "Total rewards, toggle button, not pressed"
    - "Last day", a date field. Chrome reads it in parts.
    - "A month earlier, button"
    - "A month later, button"
    - "Your stay's last day (Jul 12, 2031), button"

    The next Tab stop is the chart. NVDA should say "Last day, slider, Jan 12, 2028" and the hint "Your last day of work. Drag
    along the chart, or step a month at a time." NVDA should switch to focus mode by itself.
40. **Right Arrow** moves a month: "Feb 12, 2028". Right Arrow again: "Mar 12, 2028". **Shift+Right Arrow** moves a day: "Mar
    13, 2028". **Home** goes to the first day on the chart: "Jul 13, 2027". **End** goes to the last.
    - **Note:** moving the slider says only the date. The panel below it changes too. Tell me whether you'd want to hear what
      each offer keeps as you move it.
41. **Escape** (browse mode), then **Down Arrow** to read the panel under the chart. It starts "If your last day is …", then a
    line per offer: "A, … worked · keep $…, button …".

## Part 9 · Export, then import (5 min)

42. **Insert+F12. Ctrl+Home.** Press **K** (next link) until "Data, link", then **Enter**. NVDA should say "Your data, heading
    level 1": focus moves to the new page.
43. Press **B** until "Download offer-calc-2026-10-10-sample.json, button", then **Enter**. The date in the name is the day
    you run this; the rest of these steps use 2026-10-10. NVDA should say "Saved offer-calc-2026-10-10-sample.json."
    Chrome's download bubble may speak too.
44. Press **B** until "Choose a file…, button", then **Enter**. Windows' Open dialog appears ("Open, dialog, File name,
    edit").
    - Type `offer-calc-2026-10-10-sample.json` and press Enter. If the dialog isn't in Downloads, type
      `%USERPROFILE%\Downloads\offer-calc-2026-10-10-sample.json` instead.
45. Back in Chrome, focus moves to the review. NVDA should say "Importing offer-calc-2026-10-10-sample.json, region".
    **Down Arrow** reads:
    - the file name
    - "Replaces your 3 offers (A NYC bank, B Charlotte corp, C Seattle tech) with 3 from the file: …"
    - "Replaces About you: single, a stay of 4 years, …"
    - "Takes the file's view choices: …"
    - the sample note
    - "Its inputs check out: no problems found."
    - "Replace everything, button", "Cancel, button"
46. **Tab** to "Replace everything, button", then **Enter**. NVDA should say "Imported 3 offers. See the comparison". Focus is
    on that message.
47. **Tab** to "See the comparison, link", then **Enter**. You're back on the comparison with the same verdict: press **H**
    until "L Lead schedule", then **Down Arrow** to hear "C leaves you about … $500 a month …".

## Part 10 · Send me the log (2 min)

48. Press **Insert+F12** a last time.
49. **Alt+Tab** to the **NVDA Speech Viewer** window and click in its text (or press Tab once to put focus there).
50. **Ctrl+A**, then **Ctrl+C**, then paste it into our chat with **Ctrl+V**. Send all of it, however long. The time stamps
    split it into parts.
51. Tell me, in a line each:
    - your NVDA version (Insert+N, then Help, then About) and Chrome's (type `chrome://version` in the address bar);
    - any step where a key did something other than the step said: the step number and what happened;
    - at step 34, whether NVDA said which offer "Edit" was for;
    - at step 40, whether you'd want to hear the offers' figures as the date moves.

Then close the Incognito window (Ctrl+Shift+W). Nothing you did in it is kept.
