import { applySchedule, clamp0 } from "./schedule";
import type { FilingStatus, Locality, Schedule } from "./types";

/** NYC resident income tax. Source: NYC tax rates via NYS IT-201 instructions; matches PolicyEngine-US. */
const NYC: Record<"single" | "joint", Schedule> = {
  single: [[0, 0.03078], [12_000, 0.03762], [25_000, 0.03819], [50_000, 0.03876]],
  joint: [[0, 0.03078], [21_600, 0.03762], [45_000, 0.03819], [90_000, 0.03876]],
};

/**
 * Philadelphia Wage Tax, 2026. Rate changes mid-year (pay dates from Jul 1, 2026),
 * so we blend the two halves assuming pay is earned evenly.
 * Source: City of Philadelphia Dept. of Revenue (via ustax.tools, Aug 2026).
 */
const PHILLY = {
  resident: (0.0374 + 0.03735) / 2,
  nonresident: (0.0343 + 0.03425) / 2,
};

export interface LocalContext {
  status: FilingStatus;
  federalAGI: number;
  /** Gross wages minus cafeteria-plan/commuter deductions; 401(k) deferrals are NOT excluded locally in PA. */
  localWageBase: number;
  stateTaxableIncome: number;
  stateCode: string;
}

export function localTax(loc: Locality | undefined, ctx: LocalContext): { tax: number; warnings: string[] } {
  const warnings: string[] = [];
  if (!loc || loc.kind === "none") return { tax: 0, warnings };

  switch (loc.kind) {
    case "nyc": {
      if (ctx.stateCode !== "NY") warnings.push("NYC tax applies to NYC residents only; check your state selection.");
      const key = ctx.status === "joint" ? "joint" : "single";
      const ti = ctx.stateTaxableIncome;
      let tax = applySchedule(NYC[key], ti);
      // NYC school tax credits (fixed amount + rate-reduction amount), both phase out at higher incomes.
      // Fixed-amount credit eligibility is income-tested on AGI ($250k), not taxable income.
      if (ctx.federalAGI <= 250_000) tax -= key === "joint" ? 125 : 63;
      if (ti <= 500_000) {
        const cut = key === "joint" ? 21_600 : 12_000;
        tax -= ti <= cut ? 0.00171 * ti : (key === "joint" ? 37 : 21) + 0.00228 * (ti - cut);
      }
      return { tax: clamp0(tax), warnings };
    }
    case "philadelphia": {
      if (!loc.resident) {
        warnings.push("Philadelphia nonresident wage tax applies only to days physically worked in the city.");
      }
      return { tax: ctx.localWageBase * (loc.resident ? PHILLY.resident : PHILLY.nonresident), warnings };
    }
    case "flat": {
      const base = loc.base === "wages" ? ctx.localWageBase : ctx.stateTaxableIncome;
      return { tax: base * loc.rate, warnings: [`${loc.label}: user-supplied flat rate of ${(loc.rate * 100).toFixed(2)}%.`] };
    }
  }
}
