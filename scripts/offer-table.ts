// Prints a year-by-year table for sample offers so results can be eyeballed before a UI exists.
// Usage: npm run offers. The sample inputs are illustrative, not market data.
import {
  breakeven, compareOffers, describeSchedule, leaveDateSweep, VESTING_PRESETS,
  type ByScenario, type Household, type OfferInput, type ScenarioResult,
} from "../src/offer/index";

const household: Household = { filingStatus: "single" };
const inflation = 0.025;
const all = (v: number): ByScenario => ({ bear: v, base: v, bull: v });
const range = (base: number): ByScenario => ({ bear: base * 0.8, base, bull: base * 1.2 });

const offers: OfferInput[] = [
  {
    label: "A. NYC investment banking analyst",
    residence: { state: "NY", locality: { kind: "nyc" } },
    employerState: "NY",
    startDate: "2026-07-13",
    salary: {
      annual: 110_000,
      promotions: [{ on: "2029-07-13", stepUp: 0.35, scenarios: ["base", "bull"] }], // associate at month 36
    },
    bonus: {
      basis: "byEmploymentYear", amounts: [70_000, 85_000, 100_000, 115_000, 130_000].map(range),
      payOn: { month: 1, day: 31 },
    },
    cashAwards: [{ label: "Sign-on", amount: 10_000, paidOn: { daysAfterStart: 30 }, clawback: { months: 12, kind: "full" } }],
  },
  {
    label: "B. Charlotte corporate finance analyst",
    residence: { state: "NC" },
    employerState: "NC",
    startDate: "2026-07-13",
    salary: { annual: 80_000, raise: all(0.03) },
    bonus: {
      basis: "percentOfSalary", amount: { bear: 0.05, base: 0.1, bull: 0.12 },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
    },
    cashAwards: [{ label: "Sign-on", amount: 5_000, paidOn: { daysAfterStart: 30 }, clawback: { months: 12, kind: "prorated" } }],
  },
  {
    label: "C. Seattle public tech company, finance",
    residence: { state: "WA" },
    employerState: "WA",
    startDate: "2026-07-13",
    salary: { annual: 105_000, raise: all(0.03), raiseOn: "jan1" },
    bonus: {
      basis: "percentOfSalary", amount: { bear: 0.1, base: 0.15, bull: 0.2 },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
    },
    cashAwards: [{ label: "Sign-on", amount: 10_000, paidOn: { daysAfterStart: 30 }, clawback: { months: 12, kind: "prorated" } }],
    equity: {
      grants: [{
        kind: "rsu", label: "New-hire RSUs", value: 120_000,
        schedule: { ...VESTING_PRESETS.backLoadedSemiannualAfterCliff, vestDates: { months: [2, 5, 8, 11], day: 15 } },
      }],
      refreshers: {
        value: { bear: 10_000, base: 25_000, bull: 40_000 }, firstAfterMonths: 12, everyMonths: 12,
        schedule: { ...VESTING_PRESETS.evenQuarterlyAfterCliff, vestDates: { months: [2, 5, 8, 11], day: 15 } },
      },
    },
  },
];

const $ = (x: number) => Math.round(x).toLocaleString("en-US");
const k = (x: number) => `$${+(x / 1000).toFixed(1)}k`;
const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;
const lastDay = (exclusiveEnd: string) =>
  new Date(Date.parse(`${exclusiveEnd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

function table(head: string[], rows: string[][], leftCols = 1): string {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r: string[]) => r.map((c, i) => (i < leftCols ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  return [fmt(head), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(fmt)].join("\n");
}

function describe(o: OfferInput): string {
  const b = o.bonus!;
  const bonus = b.basis === "percentOfSalary"
    ? `${pct(b.amount.bear)}/${pct(b.amount.base)}/${pct(b.amount.bull)} of salary earned (bear/base/bull)`
    : b.basis === "fixed" ? `$${$(b.amount.base)} a year`
      : `${b.amounts.map((a) => k(a.base)).join("/")} by employment year (base; bear -20%, bull +20%)`;
  const s = o.salary;
  const raises = s.raise ? `, ${pct(s.raise.base)} raises ${s.raiseOn === "jan1" ? "each Jan 1" : "each anniversary"}` : "";
  const promos = (s.promotions ?? []).map((p) => `, +${pct(p.stepUp)} promotion ${p.on}${p.scenarios ? ` (${p.scenarios.join(", ")})` : ""}`).join("");
  const where = o.residence.locality?.kind === "nyc" ? `${o.residence.state} (NYC)` : o.residence.state;
  const grants = o.equity?.grants ?? [];
  const r = o.equity?.refreshers;
  const rsu = grants.length
    ? `;\n   RSUs ${grants.map((g) => `$${$(g.value)} (${describeSchedule(g.schedule)})`).join(" + ")}`
      + (r ? `;\n   refreshers $${$(r.value.bear)}/$${$(r.value.base)}/$${$(r.value.bull)} a year (${describeSchedule(r.schedule)})` : "")
    : "; no RSUs";
  const signOn = o.cashAwards?.[0];
  const claw = signOn?.clawback
    ? (signOn.clawback.kind === "full" ? `, repaid in full if you leave within ${signOn.clawback.months} months`
      : `, prorated clawback over ${signOn.clawback.months} months`)
    : "";
  return `   Lives in ${where}, employer in ${o.employerState}, starts ${o.startDate}. Salary $${$(s.annual)}${raises}${promos};\n`
    + `   bonus ${bonus}; sign-on $${$(signOn?.amount ?? 0)}${claw}${rsu}.`;
}

function offerTable(r: ScenarioResult): string {
  return table(
    ["Year", "Dates", "Salary", "Bonus", "Sign-on", "RSU", "Gross", "Tax", "Net", "Tax rate", "Quoted TC"],
    r.employmentYears.map((y) => [
      String(y.year), `${y.start} to ${lastDay(y.end)}`, $(y.gross.salary), $(y.gross.bonus), $(y.gross.cash),
      $(y.gross.rsu), $(y.gross.total), $(y.tax), $(y.net), pct(y.tax / y.gross.total), $(y.quotedTC),
    ]),
    2,
  );
}

// PV as of the shared window's start: these sample offers start in July 2026, before today, and a
// valuation date after the start would compound early pay forward. The UI will pass today.
const valuationDate = "2026-07-13";
const comparison = compareOffers(offers, household, { inflation, valuationDate, horizonYears: 5 });
const base = comparison.projections.map((p) => p.scenarios.base);

const out: string[] = [
  "Offer comparison: slices 1-4 (salary with raises and promotions, bonus, sign-on, RSUs, leave date, PV)",
  `Household: single, no other wages. Tax law after 2026 projected at ${inflation * 100}% inflation.`,
  "Sample inputs are illustrative, not market data.",
];
offers.forEach((o, i) => {
  out.push("", o.label, describe(o), "", "Employment years (base scenario):", offerTable(base[i]));
  for (const w of comparison.projections[i].warnings) out.push(`   ! ${w}`);
});

const short = (o: OfferInput) => o.label.slice(0, 1);
const sideRows = base[0].employmentYears.map((y, i) => [String(y.year), ...base.map((r) => $(r.employmentYears[i].net))]);
sideRows.push(["Total", ...base.map((r) => $(r.employmentYears.reduce((s, y) => s + y.net, 0)))]);
out.push("", "Side by side, net after tax by employment year (base scenario):",
  table(["Year", ...offers.map((o) => `${short(o)} net`)], sideRows));

const scenarios = ["bear", "base", "bull"] as const;
out.push("",
  `Net after tax over the shared window ${comparison.window.start} to ${lastDay(comparison.window.end)}: nominal and `
    + `present value at ${comparison.discountRate * 100}% as of ${valuationDate}.`,
  table(["Offer", ...scenarios.flatMap((s) => [`${s} nominal`, `${s} PV`])],
    comparison.projections.map((p, i) => [short(offers[i]), ...scenarios.flatMap((s) => {
      const w = p.scenarios[s].window;
      return [$(w.nominal.net), $(w.presentValue!.net)];
    })])));

out.push("", "Breakeven: starting salary B or C would need to tie A in base-scenario PV over the window "
  + "(raises and percent-of-salary bonuses scale with it):");
for (const other of [offers[1], offers[2]]) {
  const r = breakeven(offers[0], other, "salary", household, { inflation, valuationDate, horizonYears: 5 });
  out.push(`   ${short(other)}: $${$(r.from)} -> $${$(r.to)} (+$${$(r.increase)}, +${pct(r.increase / r.from)}); target PV $${$(r.targetPV)}`);
}

const sweepMonths = [3, 6, 9, 11, 12, 13, 18, 24, 36, 48];
const sweeps = offers.map((o) => leaveDateSweep(o, household, sweepMonths, { inflation }));
const withEquity = offers.map((o) => (o.equity?.grants.length ?? 0) > 0);
const sweepHead = ["Months", "Last day", ...offers.flatMap((o, i) =>
  [`${short(o)} kept`, `${short(o)} repays`, ...(withEquity[i] ? [`${short(o)} unvested`] : [])])];
const sweepRows = sweepMonths.map((m, j) => [String(m), sweeps[0][j].leaveDate, ...sweeps.flatMap((s, i) => [
  $(s[j].netKept), s[j].clawbackOwed ? $(s[j].clawbackOwed) : "-", ...(withEquity[i] ? [$(s[j].unvestedRsuForfeited)] : []),
])]);
out.push("", "If you leave after N months (base scenario): net kept after tax and clawbacks, nominal.",
  "Last day = start + N months - 1 day. Repays = sign-on clawback owed. Unvested = RSUs forfeited, at grant value.",
  table(sweepHead, sweepRows, 2));

console.log(out.join("\n"));
