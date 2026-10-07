# Offer Calc — context for Claude Code

A job-offer comparison calculator. Differentiator: do the math correctly, in one pipeline —
gross comp -> after-tax -> location-adjusted -> per hour of your life, year by year (years 1-5),
and show the work. Portfolio piece for analyst-track roles, so correctness and a clear
methodology page matter more than features.

## Current state
`src/tax/` is a 2026 tax engine (annual liability, not withholding):
federal income tax, FICA + Additional Medicare, state income tax (50 states + DC),
employee state payroll taxes (SDI/paid leave/LTC), NYC + Philadelphia local tax,
a flat-rate local escape hatch, and a standard-vs-itemize optimizer (OBBBA SALT cap).
Entry point: `computeTaxes(input)` in `src/tax/index.ts`.

## Conventions (keep these)
- Every parameter carries a source comment. Laws newer than the Tax Foundation Feb-2026
  table are marked `OVERRIDE:` with the bill/statute.
- Schedules are `[lowerBound, rate]`; a 0% first band means "rate starts above X".
- State quirks live in `state.ts` under the state's `special` key; keep data in `params/`.
- All money math is annual. Round only at output (`round2`).
- Pure functions, no I/O in `src/`. The engine must run client-side in the browser.

## Validation workflow (run after any tax change)
1. `npm test` — unit tests with hand-checked values.
2. `npm run oracle` — runs our engine and PolicyEngine-US over $40k-$320k for every
   state (single + joint) and prints differences. Needs `pip install -r requirements.txt`.
   Target: FICA, state payroll and NYC exact; state income tax within ~$10 for
   single filers at $60k-$200k.

## Intentional differences vs PolicyEngine (do not "fix")
- SALT: PolicyEngine deducts *estimated withholding*; we deduct state/local tax *owed*
  (steady-state W-2 assumption). Explains most federal gaps for itemizers in NY/CT/DC.
- Itemize election: we pick whichever minimizes federal+state+local; boundaries can flip
  differently near the threshold.

## Known gaps (fix in rough priority order)
- VT brackets use 2025 widths (up to ~$150 high). ND/OR small indexing gaps.
- Low-income credits: CT personal credit, AR low-income table, HI/MN refundable credits
  (only matter below ~$60k).
- CO TABOR sales-tax refund, AK Permanent Fund Dividend: not modeled.
- MD county tax not defaulted (user enters via flat local). Same for OH cities, PA EIT.
- AZ standard deduction uncertain (PolicyEngine $15,750 vs TF $8,350); verify.
- No dependents/credits (CTC, EITC), no AMT, head-of-household uses single state params.
- Convenience-of-employer rule (NY, DE, NE, PA; CT/NJ reciprocal) not modeled — should
  at least warn on remote offers.

## Roadmap
1. Offer model on top of the engine: year-by-year cash comp (base, bonus as range,
   sign-on with clawback exposure, RSU vesting incl. back-loaded schedules, refreshers),
   calendar-year vs employment-year split (partial first year for new grads).
2. Benefits: 401(k) match x vesting x expected tenure; health plan expected cost
   (premium + OOP scenarios - employer HSA); tax-free perks grossed up at marginal rate
   (Section 127 $5,250, 132(f) $340/mo).
3. Cost of living: apply BEA Regional Price Parities only to post-tax, post-savings
   spending (never gross salary); user rent override.
4. Time: commute cost (IRS 76c/mi includes depreciation — offer variable-cost option),
   effective hourly rate, remote-work valuation default ~5% of pay (editable).
5. Decision layer: breakeven ("Offer B needs $X base to tie"), sensitivity/tornado,
   even-swaps for soft factors; show gaps per paycheck to counter distinction bias.
6. UI (React/TS, client-side only, no login, live-updating, inline input help,
   no misleading defaults — per NN/g calculator guidelines) + methodology page.
