// Prints a year-by-year table for two sample offers so results can be eyeballed before a UI exists.
// Usage: npm run offers. The sample inputs are illustrative, not market data.
import { projectScenario, VESTING_PRESETS, type Household, type OfferInput, type ScenarioResult } from "../src/offer/index";

const household: Household = { filingStatus: "single" };
const inflation = 0.025;

const offers: OfferInput[] = [
  {
    label: "A. NYC investment banking analyst",
    residence: { state: "NY", locality: { kind: "nyc" } },
    employerState: "NY",
    startDate: "2026-07-13",
    salary: { annual: 110_000 },
    bonus: { basis: "percentOfSalary", amount: { bear: 0.5, base: 0.7, bull: 0.9 }, payOn: { month: 1, day: 31 } },
    cashAwards: [{ label: "Sign-on", amount: 10_000, paidOn: { daysAfterStart: 30 } }],
  },
  {
    label: "B. Charlotte corporate finance analyst",
    residence: { state: "NC" },
    employerState: "NC",
    startDate: "2026-07-13",
    salary: { annual: 80_000 },
    bonus: {
      basis: "percentOfSalary", amount: { bear: 0.05, base: 0.1, bull: 0.12 },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
    },
    cashAwards: [{ label: "Sign-on", amount: 5_000, paidOn: { daysAfterStart: 30 } }],
  },
  {
    label: "C. Seattle public tech company, finance",
    residence: { state: "WA" },
    employerState: "WA",
    startDate: "2026-07-13",
    salary: { annual: 105_000 },
    bonus: {
      basis: "percentOfSalary", amount: { bear: 0.1, base: 0.15, bull: 0.2 },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
    },
    cashAwards: [{ label: "Sign-on", amount: 10_000, paidOn: { daysAfterStart: 30 } }],
    equity: {
      grants: [{
        kind: "rsu", label: "New-hire RSUs", value: 120_000,
        schedule: { ...VESTING_PRESETS.backLoaded, vestDates: { months: [2, 5, 8, 11], day: 15 } },
      }],
      refreshers: {
        value: { bear: 10_000, base: 25_000, bull: 40_000 }, firstAfterMonths: 12, everyMonths: 12,
        schedule: { ...VESTING_PRESETS.standard, vestDates: { months: [2, 5, 8, 11], day: 15 } },
      },
    },
  },
];

const $ = (x: number) => Math.round(x).toLocaleString("en-US");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
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
    ? `${b.amount.bear * 100}/${b.amount.base * 100}/${b.amount.bull * 100}% of salary earned (bear/base/bull)`
    : `$${$(b.amount.base)}`;
  const where = o.residence.locality?.kind === "nyc" ? `${o.residence.state} (NYC)` : o.residence.state;
  const grants = o.equity?.grants ?? [];
  const rsu = grants.length
    ? `; RSUs ${grants.map((g) => `$${$(g.value)} vesting ${g.schedule.tranches.map((t) => `${+(t.fraction * 100).toFixed(2)}%@${t.month}mo`).join(", ")}`).join(" + ")}`
    : "; no RSUs";
  return `   Lives in ${where}, employer in ${o.employerState}, starts ${o.startDate}. Salary $${$(o.salary.annual)}; `
    + `bonus ${bonus}; sign-on $${$(o.cashAwards?.[0]?.amount ?? 0)}${rsu}.`;
}

function offerTables(r: ScenarioResult): string {
  const ey = table(
    ["Year", "Dates", "Salary", "Bonus", "Sign-on", "RSU", "Gross", "Tax", "Net", "Tax rate", "Quoted TC"],
    r.employmentYears.map((y) => [
      String(y.year), `${y.start} to ${lastDay(y.end)}`, $(y.gross.salary), $(y.gross.bonus), $(y.gross.cash),
      $(y.gross.rsu), $(y.gross.total), $(y.tax), $(y.net), pct(y.tax / y.gross.total), $(y.quotedTC),
    ]),
    2,
  );
  const cy = table(
    ["Tax year", "Offer gross", "Offer tax", "Rate", "Law"],
    r.calendarYears.map((c) => [
      String(c.year), $(c.offerGross.total), $(c.offerTax), pct(c.offerTaxRate), c.projectedLaw ? "projected" : "enacted 2026",
    ]),
  );
  const last = r.calendarYears[r.calendarYears.length - 1].year;
  return `Employment years (base scenario):\n${ey}\n\nCalendar tax years (base scenario):\n${cy}\n`
    + `   ${last} runs past employment year ${r.employmentYears.length}; it's taxed on the full year so its rate is right.`;
}

const base = offers.map((o) => projectScenario(o, household, { inflation }));
const out: string[] = [
  "Offer comparison: slices 1-2 (salary, bonus, sign-on, RSUs; no raises or leave date yet)",
  `Household: single, no other wages. Tax law after 2026 projected at ${inflation * 100}% inflation.`,
  "Sample inputs are illustrative, not market data.",
];
offers.forEach((o, i) => {
  out.push("", o.label, describe(o), "", offerTables(base[i]));
  for (const w of base[i].warnings) out.push(`   ! ${w}`);
});

const short = (o: OfferInput) => o.label.slice(0, 1);
const sum = (r: ScenarioResult) => r.employmentYears.reduce((s, y) => s + y.net, 0);
const sideRows = base[0].employmentYears.map((y, i) => [String(y.year), ...base.map((r) => $(r.employmentYears[i].net))]);
sideRows.push(["Total", ...base.map((r) => $(sum(r)))]);
out.push("", "Side by side, net after tax (base scenario):",
  table(["Year", ...offers.map((o) => `${short(o)} net`)], sideRows));

const scenarios = (["bear", "base", "bull"] as const);
const totals = offers.map((o) => scenarios.map((s) => sum(projectScenario(o, household, { inflation, scenario: s }))));
out.push("", "5-year net by scenario:",
  table(["Offer", ...scenarios], offers.map((o, i) => [short(o), ...totals[i].map($)])));

console.log(out.join("\n"));
