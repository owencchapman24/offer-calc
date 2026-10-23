# Offer Calc

Work out a job offer the way it would actually pay out: from gross pay, after federal, state, local and payroll tax, after
rent and local prices, and per hour worked, year by year over the years you expect to stay. Start with one offer and get its
whole breakdown; add a second or a third, and a comparison appears beside each one's breakdown. Every figure shows its work.

**Live:** https://offer-calc.vercel.app

![Offer Calc with one illustrative sample offer, a New York bank: its inputs on the left, and its bottom line pinned on the right, about $7,564 a month over a 4-year stay after tax and rent, in New York dollars, split into money to spend and money saved](docs/screenshot.png)

*The sample offers are illustrative inputs, not market data.*

## What it does

### One offer

Enter an offer in quick mode (salary, bonus, city, start date and rent, which it estimates if you leave it blank) and its
breakdown fills in, over its own stay and at its own city's prices:

- **A-1, the bottom line:** what it leaves you each month over your stay after tax and rent, split into money to spend and
  money saved (and tax-free benefits, on a line of their own), in today's dollars; year 1 as paid; its tax rate; per hour worked; and
  the bad case.
- **A-2, where the money goes:** each $100 of a year's pay as tax, rent, health costs, savings and spending, and the bridge
  from the offer letter to what you'd have.
- **A-3, pay by year,** and when each bonus, cash award, RSU vest and ESPP purchase arrives.
- **A-4, the terms that can bite:** bonus rules, clawbacks and vesting cliffs, what staying until the next cliff is worth, and
  what you'd keep if you left on a given day.
- **A-5, what the benefits are worth:** the employer 401(k), HSA money, perks and other benefits, against health costs.
- **A-6, tax and warnings:** tax by calendar year, and warnings such as federal withholding falling short of what you'll owe.
- **A-7, the work:** every line, payment and tax year behind the figures.

Each offer goes through the same pipeline: gross pay; after tax (each calendar year, as the offer's share of your household's
tax, less your health premiums); plus benefits (total rewards: the employer 401(k) money you'd keep, perks and HSA money, less
expected out-of-pocket costs); less rent and local prices (spending money priced with BEA's Regional Price Parities, savings at
face value); and per hour worked.

### Two or three offers

Add an offer and the comparison appears: which leaves you more each month over your stay, and by how much, after tax, in total
rewards, after rent and per hour, with the winner for stays of 2 to 5 years beside it; then by year (L-1), if things go badly
(L-2), what it would take to tie (L-3), and leaving early (L-4). The comparison counts every offer over the same years and in the
same dollars, priced as in an average U.S. city or in a city you pick; each offer's own breakdown stays in its own city's dollars.

### Showing the work

Every figure carries an audit tickmark: click it to see its derivation with your values, the figures it uses, and its section of
the [methodology](https://offer-calc.vercel.app/#/method). Detailed mode covers raises, promotions, bonus timing, RSU vesting and
refreshers, an employee stock purchase plan (each lot sold the day it's bought), the 401(k), health, perks and other benefits
(taxable or tax-free), cash awards with clawbacks, and hours and days off. Copy as document puts an offer's breakdown (a summary
or the full detail), the comparison, or both on the clipboard, tables and all, for a document or an email; every table downloads
as a CSV; and Print… gives a summary or the full workpaper.

It runs entirely in your browser: no account, no server, no analytics. What you enter is saved in this browser only, and the Data
page exports it to a JSON file and imports it back. It informs a decision and shows its work; it never recommends a job.

## Setup

Needs Node.js 24.

```bash
npm ci
npm test            # unit tests (engine and app), then the no-formatting-in-the-engine check
npm run typecheck
npm run dev         # the app at http://localhost:5173
npm run build       # static build in dist/ (deployed on Vercel; see vercel.json)
npm run e2e         # after the build: the accessibility scan (axe), smoke and keyboard tests, in Playwright
npm run offers      # the sample offers' tables, in the terminal
```

The code: `src/tax` (the tax engine), `src/offer` (offers to dated, taxed payments; comparisons),
`src/col` (BEA price levels and HUD rents), `src/format` (words for the engine's numbers), and `app/`
(React 19 on Vite; the engine runs in a Web Worker). The design documents are
[`docs/offer-model.md`](docs/offer-model.md), [`docs/ui-design.md`](docs/ui-design.md) and
[`docs/v2-plan.md`](docs/v2-plan.md).

## How it's validated

- **Every figure adds up as displayed.** Each figure is rounded once, where it's worked out, and every subtotal is the sum of the
  rounded figures above it, so every column, every derivation, every CSV and the copied document foot exactly as shown; a test
  fails on any that doesn't, and on any calculation the copied document states that doesn't work out as written.
- **Property tests** ([fast-check](https://fast-check.dev)) generate offers and households the samples never reach (joint
  filing, a later start, rent of $0, a sign-on paid before day one, fractional vesting, ranges) and check that every derivation
  foots as displayed, no figure is undefined, and one figure reads the same everywhere it appears. A nightly run tries ten times
  as many on a new random seed, and shrinks any failure it finds to its smallest case, which its seed replays.
- **The tax engine is checked against [PolicyEngine-US](https://github.com/PolicyEngine/policyengine-us)**
  (version 2.30.3) for 2026 law, on wages from $40,000 to $320,000 for every state and DC, single and
  married filing jointly. Social Security, Medicare and state payroll taxes match exactly; New York
  City within $0.48. For single filers from $60,000 to $200,000, federal income tax is within $5 in 50
  of 51 places and state income tax in 42 of 51 (44 within $6). The differences that remain, and the
  ones that are intentional, are listed in the methodology (M-4, M-10).
- **Unit tests** check hand-worked values at the edges: the day before and the day of a vest, a payout
  or a window's end; tax thresholds and bracket crossings. The app's tests fail if any figure lacks a
  tickmark, a methodology section or a derivation, if any input lacks its help, if a default shown
  in the app disagrees with the engine's, or if an after-rent figure doesn't say whose dollars it's in.
- **Accessibility:** an axe scan for WCAG 2.2 A and AA covers each state of the page (one offer and its parts, the comparison, the
  editors, Show the work, print, the copy choice) on a desktop, a tablet and a phone, in light and dark.

To run the comparison yourself (a few minutes; it writes `oracle_report.json`), install PolicyEngine
into a virtual environment named `.venv`, which `npm run oracle` uses automatically. `requirements-lock.txt`
holds every package at the version the comparison's baseline was taken with (Python 3.14 on Windows), so
install with it as constraints; `npm run oracle` warns if your environment differs from it.

macOS / Linux:
```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt -c requirements-lock.txt
npm run oracle
```

Windows (PowerShell):
```powershell
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -c requirements-lock.txt
npm run oracle
```

## Data and attribution

- **BEA Regional Price Parities**, 2024, released February 19, 2026 (U.S. Bureau of Economic
  Analysis): price levels for every metro area and state. Re-download with `npm run fetch-rpp`.
- **HUD Fair Market Rents**, FY 2027 (U.S. Department of Housing and Urban Development): the rent
  estimates. Re-download with `npm run fetch-fmr`; HUD USER may ask for the file to be downloaded in a
  browser, and the script says how.
- **Census Bureau, American Community Survey 2024 1-year, table B25064:** the U.S. median gross rent,
  used only where HUD has no figure.
- **IRS** Rev. Proc. 2025-32, Notice 2025-67, Rev. Proc. 2025-19, Rev. Proc. 2026-24 (2027's HSA
  limits), and Publications 15 and 15-T; the **Social Security Administration**'s 2026 and 2027 fact
  sheets (the wage base).
- **Tax Foundation**, "State Individual Income Tax Rates and Brackets, 2026", and each state law enacted
  after it, listed in the methodology (M-11).
- **PolicyEngine-US**, used only to validate the tax engine; it isn't part of the app.
- **Atkinson Hyperlegible Next and Mono** (Braille Institute, SIL Open Font License 1.1) and **React**
  (MIT License), installed from npm.

The sample offers are illustrative inputs, not market data. Nothing here is tax or financial advice.

## How it was built

Offer Calc was built with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding assistant, working under the
direction of its author. The author decided what to build and in what order, set the rules it follows (show the work, never
recommend a job, every figure adds up as displayed), made the calls recorded in its design documents, reviewed every stage
with screenshots of the live site, and tried it with real offers. Claude Code wrote the code, the tests and the documentation,
and proposed designs that the author approved or changed. Since its second day (2026-10-08) every change has reached `main` through a
pull request, and since 2026-10-15 none can merge until the tests, the accessibility scan and the load-time budget pass. Every
non-merge commit carries a "Co-Authored-By: Claude" trailer.

## License

© 2026 Owen Chapman. All rights reserved. Source shown for review only.
