import { STATES_2026, type StateSpec } from "./params/states2026";
import { applySchedule, bandIndex, clamp0 } from "./schedule";
import type { FilingStatus, Schedule } from "./types";

export interface StateContext {
  status: FilingStatus;
  /** Federal AGI (wages net of 401(k), cafeteria-plan and commuter deductions). */
  federalAGI: number;
  /** Added back for states that tax 401(k) deferrals (PA). */
  pretax401k: number;
  federalIncomeTax: number;
  /** Employee Social Security + Medicare, per person (MA deducts up to $2,000 each). */
  ficaByPerson: number[];
  /** True when the household itemizes on the federal return. */
  itemizingFederally: boolean;
  /** Federal itemized deductions excluding the state/local income tax portion of SALT. */
  federalItemizedExIncomeTax: number;
}

export interface StateTaxOutput {
  taxableIncome: number;
  tax: number;
  payrollTax: number;
  warnings: string[];
}

const steps = (excess: number, step: number) => (excess > 0 ? Math.ceil(excess / step) : 0);
/** Linear phase-out: full `amount` at or below `start`, zero at or above `start + width`. */
const phaseOut = (amount: number, agi: number, start: number, width: number) =>
  amount * Math.min(1, Math.max(0, 1 - (agi - start) / width));

export function stateTax(code: string, ctx: StateContext, payrollWagesByPerson: number[]): StateTaxOutput {
  const spec: StateSpec | undefined = STATES_2026[code];
  if (!spec) throw new Error(`Unknown state code: ${code}`);
  const warnings: string[] = [...(spec.notes ?? [])];

  // Payroll taxes apply per worker; callers pass each person's wages.
  const payrollTax = payrollWagesByPerson.filter((w) => w > 0).reduce((total, w) =>
    total + (spec.payroll ?? []).reduce((sum, c) => sum + (c.flat ?? 0) + Math.min(w, c.wageCap ?? Infinity) * c.rate, 0), 0);

  if (spec.kind === "none") return { taxableIncome: 0, tax: 0, payrollTax, warnings };

  const joint = ctx.status === "joint";
  const i = joint ? 1 : 0;
  if (ctx.status === "headOfHousehold") {
    warnings.push("Head of household: state tax uses single-filer brackets and deductions (approximation).");
  }
  const sched: Schedule = (joint ? spec.joint : spec.single)!;
  const agi = spec.taxes401kDeferrals ? ctx.federalAGI + ctx.pretax401k : ctx.federalAGI;

  let std = spec.stdDeduction?.[i] ?? 0;
  let exemption = spec.exemption?.[i] ?? 0;
  let credit = spec.exemptionCredit?.[i] ?? 0;
  let otherDeductions = 0;
  const persons = ctx.ficaByPerson.length;

  if (spec.itemizedWhenFederalItemizes && ctx.itemizingFederally) {
    // Federal itemized deductions flow through, minus state/local income taxes (the "SALT addback").
    std = ctx.federalItemizedExIncomeTax;
  }

  // ---- Pre-schedule adjustments --------------------------------------------
  switch (spec.special) {
    case "AL": {
      // fn (c): std deduction stepped down above AGI threshold; fn (b): federal tax deductible.
      std = joint
        ? Math.max(5_000, 8_500 - 175 * steps(agi - 25_999, 500))
        : Math.max(2_500, 3_000 - 25 * steps(agi - 25_499, 500));
      // AL itemized deductions include employee payroll (FICA) taxes, which beat the
      // small std deduction for most W-2 earners (PolicyEngine-US: al.deductions.itemized.sources).
      std = Math.max(std, ctx.ficaByPerson.reduce((a, b) => a + b, 0));
      otherDeductions += ctx.federalIncomeTax;
      break;
    }
    case "CA": {
      // Exemption credit falls $6 per $2,500 of AGI above ~$257,919 ($515,842 joint), 2026 indexed.
      credit = clamp0(credit - 6 * (joint ? 2 : 1) * steps(agi - (joint ? 515_842 : 257_919), 2_500));
      break;
    }
    case "CO": {
      // High-income addback: above AGI $300k, deductions are limited to $1,000 ($2,000 joint).
      if (agi >= 300_000) std = Math.min(std, joint ? 2_000 : 1_000);
      break;
    }
    case "CT": {
      // fn (r): exemption falls $1,000 per $1,000 of AGI over $30k ($48k joint).
      exemption = Math.max(0, exemption - 1_000 * steps(agi - (joint ? 48_000 : 30_000), 1_000));
      break;
    }
    case "IL": {
      if (agi > (joint ? 500_000 : 250_000)) exemption = 0; // fn (v)
      break;
    }
    case "ME": {
      // 36 M.R.S. 5124-C: std deduction phases out over $75k ($150k joint) above $102,250 ($204,550).
      std = phaseOut(std, agi, joint ? 204_550 : 102_250, joint ? 150_000 : 75_000);
      exemption = phaseOut(exemption, agi, joint ? 409_150 : 341_000, 125_000);
      break;
    }
    case "MA": {
      // Deduction for Social Security and Medicare contributions, up to $2,000 per person.
      otherDeductions += ctx.ficaByPerson.reduce((a, f) => a + Math.min(2_000, f), 0);
      break;
    }
    case "MN": {
      // fn (cc): std deduction reduced by 3% of AGI over $244,400 (+10% over $337,800), max 80%.
      const cut = 0.03 * clamp0(Math.min(agi, 337_800) - 244_400) + 0.1 * clamp0(agi - 337_800);
      std = std - Math.min(cut, 0.8 * std);
      break;
    }
    case "MD": {
      // fn (aa): exemption steps down between $100k-$150k ($150k-$200k joint).
      const base = joint ? 150_000 : 100_000;
      const frac = agi <= base ? 1 : agi <= base + 25_000 ? 0.5 : agi <= base + 50_000 ? 0.25 : 0;
      exemption *= frac;
      break;
    }
    case "MO": {
      // fn (b): partial deduction of federal income tax, by AGI tier; capped.
      const pct = agi <= 25_000 ? 0.35 : agi <= 50_000 ? 0.25 : agi <= 100_000 ? 0.15 : agi <= 125_000 ? 0.05 : 0;
      otherDeductions += Math.min(joint ? 10_000 : 5_000, pct * ctx.federalIncomeTax);
      break;
    }
    case "OH": {
      // fn (dd): per-person exemption tiers by AGI.
      const per = agi <= 40_000 ? 2_400 : agi <= 80_000 ? 2_150 : agi < 500_000 ? 1_900 : 0;
      exemption = per * (joint ? 2 : 1);
      break;
    }
    case "OR": {
      if (agi > (joint ? 200_000 : 100_000)) credit = 0; // fn (ee)
      // fn (b): federal tax subtraction, capped and phased out. Cap/phase-out are approximations.
      const cap = phaseOut(joint ? 8_500 : 8_500, agi, joint ? 250_000 : 125_000, joint ? 40_000 : 20_000);
      otherDeductions += Math.min(cap, ctx.federalIncomeTax);
      break;
    }
    case "RI": {
      const f = phaseOut(1, agi, 261_000, 290_800 - 261_000); // fn (ff)
      std *= f;
      exemption *= f;
      break;
    }
    case "SC": {
      // Act 110 (2026): SC Income Adjusted Deduction replaces federal std deduction.
      const [amt, start, width] =
        ctx.status === "joint" ? [30_000, 80_000, 110_000]
        : ctx.status === "headOfHousehold" ? [22_500, 60_000, 82_500]
        : [15_000, 40_000, 55_000];
      std = phaseOut(amt, agi, start, width);
      break;
    }
    case "UT": {
      // fn (gg): nonrefundable credit = 6% of federal std deduction, phased out at 1.3% of AGI over threshold.
      const fedStd = joint ? 32_200 : 16_100;
      credit = clamp0(0.06 * fedStd - 0.013 * clamp0(agi - (joint ? 37_252 : 18_626)));
      break;
    }
    case "WI": {
      // fn (ii): sliding-scale std deduction, linear to zero.
      std = joint ? phaseOut(std, agi, 29_039, 159_690 - 29_039) : phaseOut(std, agi, 20_119, 136_453 - 20_119);
      break;
    }
  }

  const taxableIncome = clamp0(agi - std - exemption - otherDeductions);
  let tax = applySchedule(sched, taxableIncome);

  // ---- Post-schedule adjustments -------------------------------------------
  switch (spec.special) {
    case "AR": {
      // Lower-income table for net income <= $94,700 (2025 table rates; brackets approximate).
      if (taxableIncome <= 94_700) {
        tax = applySchedule([[0, 0], [5_500, 0.02], [10_900, 0.03], [15_600, 0.034], [25_700, 0.039]], taxableIncome);
      }
      break;
    }
    case "CT": {
      // fn (p): 2% band phase-out, then benefit recapture.
      tax += 0.025 * Math.min(joint ? 20_000 : 10_000, (joint ? 2_000 : 1_000) * steps(agi - (joint ? 100_500 : 56_500), 5_000));
      if (joint) {
        tax += Math.min(500, 50 * steps(agi - 210_000, 10_000));
        tax += Math.min(6_300, Math.min(5_400, 180 * steps(agi - 400_000, 10_000)) + 100 * steps(agi - 1_000_000, 10_000));
      } else {
        tax += Math.min(250, 25 * steps(agi - 105_000, 5_000));
        tax += Math.min(3_150, Math.min(2_700, 90 * steps(agi - 200_000, 5_000)) + 50 * steps(agi - 500_000, 5_000));
      }
      if (agi < (joint ? 130_000 : 65_000)) {
        warnings.push("Connecticut personal tax credit (1-75% by income) not modeled; tax may be slightly overstated.");
      }
      break;
    }
    case "NY":
      tax = nyRecapture(sched, taxableIncome, agi);
      break;
    case "OH":
      if (taxableIncome <= 26_050) tax = 0;
      break;
    case "VT":
      if (agi > 150_000) tax = Math.max(tax, 0.03 * agi); // fn (hh)
      break;
  }

  tax = clamp0(tax - credit) - (spec.refundableCreditPerPerson ?? 0) * persons;
  return { taxableIncome, tax, payrollTax, warnings };
}

/**
 * New York "tax benefit recapture" (Tax Law 601(d-1)). Above AGI $107,650 the benefit of
 * the lower brackets is phased out in $50,000 AGI steps, so high earners pay their top
 * bracket rate on all taxable income.
 */
export function nyRecapture(sched: Schedule, ti: number, agi: number): number {
  const regular = applySchedule(sched, ti);
  if (agi <= 107_650) return regular;
  if (agi > 25_000_000) return ti * sched[sched.length - 1][1];

  const f = bandIndex(sched, 107_650);
  const k = Math.max(bandIndex(sched, ti), f);
  const phase = (x: number) => Math.min(1, Math.max(0, x / 50_000));
  // Full benefit of all bands below band j's lower bound.
  const benefit = (j: number) => sched[j][1] * sched[j][0] - applySchedule(sched, sched[j][0]);

  if (k === f) {
    return regular + (sched[f][1] * ti - regular) * phase(agi - 107_650);
  }
  const base = benefit(k - 1);
  const incremental = benefit(k) - base;
  return regular + base + incremental * phase(agi - sched[k][0]);
}
