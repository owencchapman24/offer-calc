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
   state (single + joint) and prints differences. Needs a `.venv` with
   `requirements.txt` installed (see README); the runner uses `.venv`'s Python
   automatically, no activation needed. Takes ~3-4 min.
   Target: FICA, state payroll and NYC exact; state income tax within ~$10 for
   single filers at $60k-$200k.
   Baseline (2026-10-07, policyengine-us 2.30.3): FICA, state payroll, NYC all exact.
   Single $60k-$200k: 44/51 within $5. The 7 misses are all listed below (VT, CO, ND,
   OR, CT, AR, MO). A new state over $10 there is a regression.

## Intentional differences vs PolicyEngine (do not "fix")
- SALT: PolicyEngine deducts *estimated withholding*; we deduct state/local tax *owed*
  (steady-state W-2 assumption). Explains most federal gaps for itemizers in NY/CT/DC.
- Itemize election: we pick whichever minimizes federal+state+local; boundaries can flip
  differently near the threshold (single-point spikes: DC $240k, VA $300k; GA $300k+).
- MO federal-tax deduction: tiers include their upper bound. RSMo 143.171.2 puts AGI of
  exactly $100,000 in the 15% tier ("From $50,001 to $100,000"); PolicyEngine applies 5%.
  Shows as -$62 single / -$36 joint at the $100k grid point only.

## Known gaps (fix in rough priority order)
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
