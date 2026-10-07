import type { LocalParams } from "./params";
import { applySchedule, clamp0 } from "./schedule";
import type { FilingStatus, Locality } from "./types";

export interface LocalContext {
  status: FilingStatus;
  federalAGI: number;
  /** Gross wages minus cafeteria-plan/commuter deductions; 401(k) deferrals are NOT excluded locally in PA. */
  localWageBase: number;
  stateTaxableIncome: number;
  stateCode: string;
}

export function localTax(
  p: LocalParams, loc: Locality | undefined, ctx: LocalContext,
): { tax: number; warnings: string[] } {
  const warnings: string[] = [];
  if (!loc || loc.kind === "none") return { tax: 0, warnings };

  switch (loc.kind) {
    case "nyc": {
      if (ctx.stateCode !== "NY") warnings.push("NYC tax applies to NYC residents only; check your state selection.");
      const key = ctx.status === "joint" ? "joint" : "single";
      const ti = ctx.stateTaxableIncome;
      let tax = applySchedule(p.nyc[key], ti);
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
      return { tax: ctx.localWageBase * (loc.resident ? p.philadelphia.resident : p.philadelphia.nonresident), warnings };
    }
    case "flat": {
      const base = loc.base === "wages" ? ctx.localWageBase : ctx.stateTaxableIncome;
      return { tax: base * loc.rate, warnings: [`${loc.label}: user-supplied flat rate of ${(loc.rate * 100).toFixed(2)}%.`] };
    }
  }
}
