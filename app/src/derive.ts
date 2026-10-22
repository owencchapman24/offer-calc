import type { ByScenario, CashTotals, Component, RppUsed, Scenario, ValueBasis, WindowTotals, Basis } from "../../src/offer/types";
import { defaultFor, isDefault } from "./defaults";
import "./detailedDefaults"; // the defaults only detailed mode and the derivations read
import { HOUSING_WEIGHT, indexText, shownIndexes, type ShownYear, shownStay } from "./footing";

export { indexText } from "./footing";
import { HELP, helpKey } from "./help";
import {
  alsoCounted, type AppOffer, ASSUMPTIONS, bonusBasis, type CashAwardDraft, type ClawbackDraft, getPath, hasRange, CITY_TAX, cityTax, type Letter, type OfferDraft, type ScheduleDraft,
  timeOffInput, toOfferInput,
} from "./model";
import { daysOff, weeksWorked } from "../../src/offer/timeOff";
import {
  type A2Line, type A2Part, type A6Line, aboutIsDefault, type AboutField, basisPhrase, type BridgeLine, cityName, type Derivation, detailOf, type EditTarget, indexOf,
  type InputRef, join, type L6Line, type LeaveContext, metricKind, type MetricId, offerByLetter, ownOf as breakdownOf, type OwnLine, pathOf, pricesOf, type PvPart,
  rentEstimate, rentNotes, res,
  rowFor, shortCity, type TaxLine, type WorkContext, type WorkLine,
} from "./metrics";
import { ownView, type OwnView, shareText, taxRateText } from "./breakdownModel";
import {
  A2_LABEL, arrivalShown, arrivalsOf, centsText, cliffCost, cliffName, esppPutIn, hundredOf, paidTimeOff, rateText as partsRate, taxYearsOf,
} from "./partsModel";
import { bridge, byYear, ownShownYear, shownYearOf, workedFrom, yearValue } from "./byYearModel";
import type { OfferDetail, TaxRun } from "./protocol";
import {
  BASIS_LINE as L6_BASIS_LINE, exactPay, FOOTS, lineNo, paymentAt, paymentLabel, paymentYears, rateText, sameStay, stayRows, type TaxCol, taxTable, toCent,
  yearCell, yearName, yearTable,
} from "./workpaper";
import { monthOf, shownGap } from "./verdict";
import { type CaseChange, caseChanges, caseValue, changeText, dropAmount, leadText, riskView } from "./cases";
import { cashLever, inSentence, rentTie, scalesText } from "./breakevenModel";
import type { Ties, TieRow } from "./protocol";
import { bonusWorked, cliffsText, cliffText, periodText, reconcile } from "./leaveModel";
import { withholdingParts } from "./warningAt";
import { paidBecause } from "./timeOffWords";
import type { SectionId } from "./sections";
import {
  bonusText, cashAwardsText, employerStateText, esppText, healthText, matchText, perksText, rangeText, refreshersText, rentGrowthText,
  retirementText, scheduleText, vestingText,
} from "./summary";
import { cents, dayBefore, dollars, figure, longDate, percent, signed } from "./text";
import type { TickKind } from "./ui";

// Show the work's derivations (docs/ui-design.md §8): each figure's arithmetic with your values, its
// methodology section, and the figures it uses and ties to. Loaded the first time a tickmark is
// opened (Tickmarks.tsx), so a visit that never opens one doesn't download it. Pure: no React.

type L = Letter;

type Work = Omit<Derivation, "kind" | "section">;

/**
 * A label inside a sentence: its first letter lowered, unless it starts an abbreviation ("NY income tax", "HSA"), and the
 * rest as it is ("after rent, at U.S. prices", "new-hire RSUs, tranche 1 of 7", "salary, August 2027").
 */
/** An ESPP's inputs: its terms, and the share price's growth that prices its purchases. */
const ESPP_INPUTS = ["espp.contributionPct", "espp.eligiblePay", "espp.discount", "espp.lookback", "espp.offeringMonths", "espp.purchasesPerOffering",
  "espp.offeringsStart", "espp.eligibleFrom", "equity.priceGrowth"];
/** The inputs per hour comes from: weekly hours, and the days off that set the weeks worked. */
const HOURS_INPUTS = ["hours.weekly", "timeOff.vacation", "timeOff.holidays", "timeOff.sick"];
/** Weeks worked a year from an offer's days off, 52 − days ÷ 5, as the engine works them out (timeOff.ts). */
const weeksOf = (d: OfferDraft) => weeksWorked({ timeOff: timeOffInput(d.timeOff) });
/** The weeks as shown: to four decimals at most, so weekly hours × weeks foots. */
const weeksShown = (d: OfferDraft) => `${+weeksOf(d).toFixed(4)}`;
/** "52 − (11 vacation days + 8 holidays + 0 sick days) ÷ 5": where the weeks come from. */
function daysOffNote(d: OfferDraft): string {
  const x = daysOff(timeOffInput(d.timeOff));
  return `52 − (${x.vacation} vacation days + ${x.holidays} holidays + ${x.sick} sick days) ÷ 5`;
}

const lowerFirst = <T extends string | undefined>(s: T): T =>
  (s && !(s.length > 1 && /[A-Z]/.test(s[1])) ? `${s[0].toLowerCase()}${s.slice(1)}` : s) as T;

// ---- names ---------------------------------------------------------------------------------------

const TOTAL_NAME: Record<Exclude<ValueBasis, "colAdjustedTotal">, string> = { cash: "after-tax pay", totalRewards: "total rewards" };
/** A total's name: "after-tax pay", "total rewards", "after rent, at Charlotte prices". */
const totalName = (ctx: WorkContext, b: ValueBasis) => (b === "colAdjustedTotal" ? pricesOf(ctx).phrase : TOTAL_NAME[b]);
/**
 * A basis inside a sentence: "after tax", "after rent, at U.S. prices"; per hour says what it divides, so a title names its
 * dollars (condition 1): "per hour worked, after rent, at U.S. prices".
 */
const phrase = (ctx: WorkContext, b: Basis) => (b === "perHour" && (ctx.results?.sweep.perHourOf ?? "colAdjustedTotal") === "colAdjustedTotal"
  ? `per hour worked, ${pricesOf(ctx).phrase}` : basisPhrase(pricesOf(ctx))[b]);
const SECTION_OF: Record<ValueBasis, SectionId> = { cash: "M-4", totalRewards: "M-5", colAdjustedTotal: "M-6.3" };
/** Inputs without help of their own (the read-only rows, "also"): their methodology section, by the path's head. */
const INPUT_SECTION: Record<string, SectionId> = {
  salary: "M-2", startDate: "M-7.3", bonus: "M-2", cashAwards: "M-2", equity: "M-3", retirement: "M-5.1", health: "M-5.2", perks: "M-5.3",
  hours: "M-5.4", costOfLiving: "M-6.2", residence: "M-4", employerState: "M-4", also: "M-5",
};
const inputSection = (path: string): SectionId => HELP[helpKey(path)]?.section ?? INPUT_SECTION[path.split(".")[0]] ?? "M-1";
const ABOUT_SECTION: Record<AboutField, SectionId> = {
  filing: "M-4", stay: "M-7.3", wages: "M-4", spouse: "M-4", healthUsage: "M-5.2", prices: "M-6.1",
};
const BRIDGE_SECTION: Record<BridgeLine, SectionId> = {
  letter: "M-2", salary: "M-2", bonus: "M-2", cash: "M-2", rsu: "M-3", espp: "M-3", clawback: "M-9", paid: "M-1", tax: "M-4", premiums: "M-5.2",
  afterTax: "M-1", retirement: "M-5.1", perks: "M-5.3", hsa: "M-5.2", oop: "M-5.2", totalRewards: "M-1", rent: "M-6.2", prices: "M-6.1",
  total: "M-6.3", spend: "M-6.3", saved: "M-6.3", own: "M-6.3", inEspp: "M-3",
};
const BRIDGE_NAME: Record<BridgeLine, string> = {
  letter: "offer letter", salary: "salary line", bonus: "bonus line", cash: "cash awards line", rsu: "RSU line", espp: "ESPP line", clawback: "clawback",
  paid: "paid-in-the-year subtotal", tax: "tax", premiums: "premiums", afterTax: "after-tax pay", retirement: "employer 401(k)",
  perks: "perks", hsa: "employer HSA", oop: "out-of-pocket costs", totalRewards: "total rewards", rent: "rent", prices: "price line",
  own: "after rent at its own prices", total: "total after rent", spend: "spending a month", saved: "saving a month", inEspp: "ESPP money a month",
};
const READ_ONLY_NAME: Record<string, string> = {
  also: "other inputs", cashAwards: "cash awards", retirement: "401(k)", health: "health plan", perks: "perks", employerState: "employer state",
  "costOfLiving.rentGrowth": "rent growth", "hours.weekly": "weekly hours",
};
const inputName = (path: string) => READ_ONLY_NAME[path] ?? lowerFirst(HELP[helpKey(path)]?.label) ?? path;
const ABOUT_NAME: Record<AboutField, string> = {
  filing: "your filing status", stay: "your stay", wages: "your other wages", spouse: "your spouse's wages", healthUsage: "your health use",
  prices: "the prices setting",
};
const PART: Record<PvPart, { label: string; gloss: string }> = {
  gross: { label: "Gross pay", gloss: "salary, bonuses, cash awards and RSU vests paid in your stay" },
  tax: { label: "Tax", gloss: "federal, Social Security and Medicare, state and local: the offer's share of household tax each calendar year" },
  premiums: { label: "Health premiums", gloss: "your share, paid pre-tax" },
  takeHome: { label: "Take-home pay", gloss: "after-tax pay minus your own 401(k) and HSA contributions" },
  retirement: { label: "Vested employer 401(k)", gloss: "the match and other employer money you'd keep at the end of your stay" },
  perks: { label: "Perks", gloss: "tax-free benefits, at face value" },
  healthExtra: { label: "Health costs beyond premiums", gloss: "expected out-of-pocket spending minus the employer's HSA money" },
  savings: { label: "Planned savings", gloss: "your savings rate times take-home pay" },
  rent: { label: "Rent", gloss: "paid while you work there, rising at each lease anniversary" },
  faceValue: { label: "Saved, at face value", gloss: "money you don't spend locally: your 401(k) and HSA, the vested match, employer HSA, perks, planned savings" },
};
const stepName = (b: Basis) => ({ cash: "After tax", totalRewards: "+ Benefits", colAdjustedTotal: "− Rent & prices", perHour: "Per hour" })[b];

const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const windowText = (row: { window: { start: string; end: string } }) =>
  `${longDate(row.window.start)} – ${longDate(dayBefore(row.window.end))}`;
const rate2 = (x: number) => `${(x * 100).toFixed(2)}%`;
/** The methodology section a figure's tickmark leads to. */
export function metricSection(id: MetricId, ctx: WorkContext): SectionId {
  const [head, a, b, c] = id.split(".");
  const basis = ctx.results?.view.basis;
  switch (head) {
    case "hero": case "stay": return basis === "perHour" ? "M-5.4" : "M-7.2";
    case "step": return a === "perHour" ? "M-5.4" : "M-7.2";
    case "pv": return SECTION_OF[b as ValueBasis];
    case "ph": case "avg": return "M-5.4";
    case "af": return "M-7.2";
    case "part": return "M-7.1";
    case "rpp": return "M-6.1";
    case "extra": return "M-5.5";
    case "ey": return !basis || basis === "perHour" ? "M-5.4" : SECTION_OF[basis];
    case "run": case "eysum": return "M-1";
    case "br": return BRIDGE_SECTION[c as BridgeLine];
    case "in": return inputSection(pathOf(id));
    case "about": return ABOUT_SECTION[a as AboutField];
    case "risk": case "drop": case "win": return "M-8";
    case "kept": case "repay": case "forfeit": case "forgone": case "next": case "nextown": case "vac": case "refund": return "M-9";
    case "stayafter": case "recon": return "M-7.3";
    case "wh": return "M-4";
    case "flip": case "tie": case "rentnote": return "M-7.4";
    case "l6y": return L6_SECTION[b as L6Line];
    case "l6s": return c === "pv" ? "M-7.1" : "M-7.3";
    case "l6p": return id.endsWith(".tax") ? "M-4" : COMPONENT_SECTION[ctx.own?.work?.[a as L]?.payments[Number(b)]?.component ?? "salary"];
    case "l6g": return id.endsWith(".tax") ? "M-4" : COMPONENT_SECTION[c as Component];
    case "l6t": return "M-4";
    case "own": return OWN_SECTION[b as OwnLine];
    case "alone": return "M-6.1";
    case "a2": return A2_SECTION[c as A2Line];
    case "when": {
      if (b === "salary") return "M-2";
      const own = ctx.own?.breakdowns[a as L];
      return own && arrivalsOf(own.detail, own.years)[Number(b)]?.kind === "rsu" ? "M-3" : "M-2";
    }
    case "cliff": case "nextup": return "M-9";
    case "a5": return b === "pto" ? "M-5.4" : b === "esppIn" ? "M-3" : "M-5";
    case "a6": return "M-4";
  }
  throw new Error(`Unknown figure: ${id}`);
}

/** Builds a figure's derivation with the current values. Throws if the figure isn't on the page. */
export function derive(id: MetricId, ctx: WorkContext): Derivation {
  const [head, a, b, c] = id.split(".");
  const kind = metricKind(id, ctx);
  const section = metricSection(id, ctx);
  return { kind, section, ...build() };

  function build(): Work {
    switch (head) {
      case "hero": { const r = res(ctx); return marginWork(ctx, r.view.row.years, r.view.basis, id); }
      case "stay": return marginWork(ctx, Number(a), res(ctx).view.basis, id);
      case "step": return marginWork(ctx, res(ctx).view.row.years, a as Basis, id);
      case "pv": {
        // The rank list's figure: its breakdown's A-7 shows it too, under its stay's totals, where the comparison projects it over the same
        // stay; where it starts later, the comparison counts less of it (B3), and the work says by how much.
        const w = pvWork(ctx, a as L, b as ValueBasis);
        return sameStay(ctx, a as L) ? { ...w, ties: [...w.ties, `l6s.${a as L}.${b as ValueBasis}.pv`] } : { ...w, notes: [...w.notes, ...stepNote(ctx, a as L, b as ValueBasis)] };
      }
      case "ph": return perHourWork(ctx, a as L);
      case "avg": return averageWork(ctx, a as L, b as ValueBasis);
      case "af": return annuityWork(ctx, Number(a));
      case "part": return partWork(ctx, a as L, b as PvPart);
      case "rpp": return rppWork(ctx, a as L, b as "ref" | "area");
      case "extra": return extraWork(ctx, a[0] as L, a[1] as L, b as "hours" | ValueBasis);
      case "ey": return yearWork(ctx, a as L, Number(b));
      case "run": return runningWork(ctx, a as L, Number(b));
      case "eysum": return yearsSumWork(ctx, a as L);
      case "br": return bridgeWork(ctx, a as L, Number(b), c as BridgeLine);
      case "in": return inputWork(ctx, a as L, pathOf(id));
      case "about": return aboutWork(ctx, a as AboutField);
      case "risk": return caseWork(ctx, a as L, b as Scenario);
      case "drop": return dropWork(ctx, a as L);
      case "win": return caseLeadWork(ctx, a as Scenario);
      case "kept": return keptWork(ctx, a as L);
      case "repay": return repayWork(ctx, a as L);
      case "forfeit": return forfeitWork(ctx, a as L, b as "rsu" | "k401");
      case "forgone": return forgoneWork(ctx, a as L, Number(b));
      case "vac": return vacationWork(ctx, a as L);
      case "refund": return esppRefundWork(ctx, a as L);
      case "next": return nextWork(ctx, a as L);
      case "nextown": return nextOwnWork(ctx, a as L);
      case "stayafter": return stayAfterWork(ctx, a as L);
      case "recon": return reconWork(ctx, a as L);
      case "wh": return withholdingWork(ctx, a as L, Number(b));
      case "flip": return flipWork(ctx);
      case "tie": return a === "target" ? tieTargetWork(ctx) : tieWork(ctx, a as L, b as "salary" | "cash" | "rent");
      case "rentnote": return rentNoteWork(ctx, a as L);
      case "l6y": return l6YearWork(ctx, a as L, b as L6Line, c === "sum" ? "sum" : Number(c));
      case "l6s": return l6StayWork(ctx, a as L, b as ValueBasis, c as "after" | "stay" | "pv");
      case "l6p": return l6PaymentWork(ctx, a as L, Number(b), c as "gross" | "tax");
      case "l6g": return l6GroupWork(ctx, a as L, b === "after" ? "after" : Number(b), c as Component | "all", id.split(".")[4] as "gross" | "tax");
      case "l6t": return l6TaxWork(ctx, a as L, Number(b), c as TaxLine, id.split(".")[4] as TaxCol);
      case "own": return ownWork(ctx, a as L, b as OwnLine);
      case "alone": return aloneWork(ctx, a as L);
      case "a2": return hundredWork(ctx, a as L, Number(b), c as A2Line);
      case "when": return arrivalWork(ctx, a as L, b === "salary" ? "salary" : Number(b));
      case "cliff": return cliffWork(ctx, a as L, Number(b));
      case "nextup": return nextUpWork(ctx, a as L);
      case "a5": return b === "pto" ? paidTimeOffWork(ctx, a as L) : b === "esppIn" ? esppInWork(ctx, a as L) : benefitsWork(ctx, a as L, b as "credited" | "added" | "month", c === "sum" ? "sum" : Number(c));
      case "a6": return taxYearWork(ctx, a as L, Number(b), c as A6Line);
    }
    throw new Error(`Unknown figure: ${id}`);
  }
}

/**
 * Where an offer starts after the comparison's first day, the comparison counts less of it than its breakdown does (docs/v2-plan.md,
 * item 5, "When starts differ"): its own stay, less what falls after the comparison's window ends, is its figure here.
 */
function stepNote(ctx: WorkContext, letter: L, basis: ValueBasis): string[] {
  const b = ctx.own?.breakdowns[letter];
  const r = ctx.results;
  if (!b || !r) return [];
  const w = b.detail.window;
  const own = basis === "cash" ? w.presentValue?.afterTaxComp : basis === "totalRewards" ? w.totalRewards.presentValue : w.costOfLiving?.presentValue?.total;
  const here = r.view.row.values[basis]?.[indexOf(ctx, letter)];
  if (own === undefined || here === undefined) return [];
  return [`${letter} on its own (A-1, ${longDate(b.window.start)} – ${longDate(dayBefore(b.window.end))}): ${figure(own)}, less ${figure(Math.round(own) - Math.round(here))} `
    + `that falls after the comparison's window ends (${longDate(dayBefore(r.view.row.window.end))}), = ${figure(here)} in the comparison.`];
}

/** What a figure is called in a sentence: "C's 4-year total", "the 4-year stay column". */
export function figureName(id: MetricId, ctx: WorkContext): string {
  const [head, a, b, c] = id.split(".");
  switch (head) {
    case "hero": return "the verdict";
    case "stay": return `the ${a}-year stay column`;
    case "step": return `the “${stepName(a as Basis)}” step`;
    case "pv": return `${a}'s ${ctx.results?.view.row.years ?? ""}-year total`;
    case "ph": return `${a}'s per hour`;
    case "avg": return `${a}'s average per hour`;
    case "af": return "the annuity factor";
    case "part": return `${a}'s ${lowerFirst(PART[b as PvPart].label)}`;
    case "rpp": return b === "ref" ? `the ${pricesOf(ctx).place} price index` : `${a}'s price index`;
    case "extra": return "the extra-hours line";
    case "ey": return `${a}'s year ${b} in L-1`;
    case "run": return `${a}'s running total through year ${b}`;
    case "eysum": return `${a}'s total in L-1`;
    case "br": return `the bridge's ${BRIDGE_NAME[c as BridgeLine]}`;
    case "in": return `${a}'s ${inputName(pathOf(id))}`;
    case "about": return ABOUT_NAME[a as AboutField];
    case "risk": return `${a}'s ${b} case`;
    case "drop": return `${a}'s drop to the bear case`;
    case "win": return `the ${a}-case lead`;
    case "kept": return `${a}'s pay kept`;
    case "repay": return `${a}'s clawback`;
    case "forfeit": return `${a}'s unvested ${b === "rsu" ? "RSUs" : "401(k) money"}`;
    case "forgone": return `${a}'s forfeited bonus`;
    case "vac": return `${a}'s unused vacation paid out`;
    case "refund": return `${a}'s ESPP money given back`;
    case "next": return `${a}'s value of staying`;
    case "nextown": return `${a}'s next cliff`;
    case "stayafter": return `${a}'s stay after tax`;
    case "recon": return `${a}'s difference from the stay`;
    case "wh": return `${a}'s ${b} withholding`;
    case "flip": return "the close-call line";
    case "tie": return a === "target" ? "L-3's target" : `${a}'s ${b === "cash" ? "cash award" : b === "salary" ? "starting salary" : b} to tie`;
    case "rentnote": return `${a}'s rent estimate in the rent note`;
    case "l6y": return l6Name(ctx, a as L, b as L6Line, c);
    case "l6s": return `${a}-7, ${c === "pv" ? "present value" : c === "stay" ? "its stay as paid" : "past its stay"}, ${totalName(ctx, b as ValueBasis)}`;
    case "l6p": return `${a}-7, payment ${Number(b) + 1}${c === "tax" ? "'s tax" : ""}`;
    case "l6g": return `${a}-7, ${b === "after" ? "after its stay" : `year ${b}`}, ${c === "all" ? "its tax" : `its ${COMPONENT_NAME[c as Component]} ${id.endsWith(".tax") ? "tax" : "payments"}`}`;
    case "l6t": return `${a}-7, ${b}, ${c}`;
    case "own": return `${a}'s ${OWN_NAME[b as OwnLine]}`;
    case "alone": return `${a}'s bottom line on its own`;
    case "a2": return `${a}-2's ${c === "hundred" ? "$100" : c.endsWith("Share") ? `${A2_LABEL[c.replace("Share", "") as A2Part]} share` : c === "credited" ? "employer 401(k) money" : A2_LABEL[c as A2Part]}, year ${b}`;
    case "when": return b === "salary" ? `${a}-3's salary a month` : `${a}-3's payment ${Number(b) + 1}`;
    case "cliff": return `${a}-4's cliff ${Number(b) + 1}`;
    case "nextup": return `${a}-4's next cliff`;
    case "a5": return b === "pto" ? `${a}-5's paid time off` : b === "esppIn" ? `${a}-5's ESPP money, over its stay` : `${a}-5's ${b === "credited" ? "employer 401(k) money" : b === "month" ? "benefits a month" : "benefits"}${c === "sum" ? ", over its stay" : `, year ${c}`}`;
    case "a6": return `${a}-6's ${b} ${c}`;
  }
  return id;
}

/**
 * The popover's one line about highlighting: "Uses and ties to the highlighted figures: C's and A's
 * 4-year totals, the 4-year stay column and the “− Rent & prices” step." Only figures on the page
 * (`onPage`) are named.
 */
export function highlightedSentence(d: Derivation, ctx: WorkContext, onPage: (id: MetricId) => boolean = () => true): string {
  const uses = d.uses.filter(onPage);
  const ties = d.ties.filter(onPage);
  if (!uses.length && !ties.length) return "";
  // "C's 4-year total" and "A's 4-year total" read as "C's and A's 4-year totals".
  const names: string[] = [];
  const groups = new Map<string, string[]>();
  for (const id of [...uses, ...ties]) {
    const name = figureName(id, ctx);
    const m = name.match(/^([ABC])'s (.+)$/);
    if (!m) { if (!names.includes(name)) names.push(name); continue; }
    const key = `§${m[2]}`;
    if (!groups.has(key)) { groups.set(key, []); names.push(key); }
    if (!groups.get(key)!.includes(m[1])) groups.get(key)!.push(m[1]);
  }
  const words = names.map((n) => {
    if (!n.startsWith("§")) return n;
    const letters = groups.get(n)!;
    const what = n.slice(1);
    return letters.length === 1 ? `${letters[0]}'s ${what}` : `${join(letters.map((l) => `${l}'s`))} ${what.endsWith("total") ? `${what}s` : what}`;
  });
  const verb = uses.length && ties.length ? "Uses and ties to" : uses.length ? "Uses" : "Ties to";
  return `${verb} the highlighted figures: ${join(words)}.`;
}

// ---- shared ------------------------------------------------------------------------------------

/** Two offers' inputs, as one "From your inputs". */
const joinInputs = (a: { inputs: InputRef[]; uses: MetricId[] }, b: { inputs: InputRef[]; uses: MetricId[] }) =>
  ({ inputs: [...a.inputs, ...b.inputs], uses: [...a.uses, ...b.uses] });

/** The ids that show the same number as (stay, basis): the hero, its stay cell and its pipeline step. */
function sameFigure(ctx: WorkContext, n: number, basis: Basis): MetricId[] {
  const v = res(ctx).view;
  return [
    ...(n === v.row.years && basis === v.basis ? ["hero" as const] : []),
    ...(basis === v.basis ? [`stay.${n}` as const] : []),
    ...(n === v.row.years ? [`step.${basis}` as const] : []),
  ];
}

/** An offer's two BEA indexes as shown, and its city's name. */
const indexes = (d: OfferDetail) => ({ ...shownIndexes(d), city: shortCity(d.costOfLiving!.area.name) });

/** "× U.S. non-housing prices ÷ New York's", as two lines, each traced to BEA. */
function priceLines(ctx: WorkContext, d: OfferDetail, letter: L): WorkLine[] {
  const x = indexes(d);
  return [
    { op: "×", label: `${pricesOf(ctx).place} non-housing prices (BEA)`, value: x.ref, ref: `rpp.${letter}.ref` },
    { op: "÷", label: `${x.city} non-housing prices (BEA)`, value: x.area, ref: `rpp.${letter}.area` },
  ];
}

// ---- the lead: per month and per hour ------------------------------------------------------------

function marginWork(ctx: WorkContext, n: number, basis: Basis, self: MetricId): Work {
  const r = res(ctx);
  const row = rowFor(ctx, n);
  const lead = row.leads[basis];
  const values = row.values[basis];
  if (!lead || !values) throw new Error("This basis isn't available for these offers.");
  const W = r.letters[lead.winner];
  const R = r.letters[lead.runnerUp];
  const yours = n === r.view.row.years;
  const ties = sameFigure(ctx, n, basis).filter((t) => t !== self);
  const scope = `Base case · stay ${years(n)} (${windowText(row)})`;
  if (basis === "perHour") {
    const of = r.sweep.perHourOf === "colAdjustedTotal" ? pricesOf(ctx).phrase : "in total rewards";
    return {
      title: `${W} over ${R} · ${phrase(ctx, "perHour")}`, scope: `${scope} · nominal`,
      lines: [
        { label: `${W}: per hour worked`, value: cents(values[lead.winner]), ...(yours ? { ref: `ph.${W}` as MetricId } : {}) },
        { op: "−", label: `${R}: per hour worked`, value: cents(values[lead.runnerUp]), ...(yours ? { ref: `ph.${R}` as MetricId } : {}) },
        { op: "=", label: "More per hour worked", value: cents(lead.margin), rule: "double" },
      ],
      notes: [
        `Per hour isn't discounted: it's each offer's ${n}-year total ${of}, as paid, divided by the hours worked in the window.`,
        "Hours are the softest input, so per hour is a lens, not the verdict: the other steps don't depend on them.",
      ],
      ties, uses: yours ? [`ph.${W}`, `ph.${R}`] : [],
    };
  }
  const months = 12 * n;
  // The gap between the totals as shown, ÷ the factor as shown: the month every schedule states (verdict.ts, monthOf).
  const gap = shownGap(values[lead.winner], values[lead.runnerUp]);
  const factor = row.annuityFactor;
  const perMonth = monthOf(gap, factor);
  const rate = percent(r.sweep.discountRate);
  const terms = r.detail?.annuity[n];
  const span = terms?.length ? ` (${longDate(terms[0].date)} to ${longDate(terms[terms.length - 1].date)})` : "";
  const refFor = (letter: L): Partial<WorkLine> => (yours ? { ref: `pv.${letter}.${basis as ValueBasis}` } : {});
  return {
    title: `${W} over ${R} · ${phrase(ctx, basis)}`, scope: `${scope} · today's dollars`,
    lines: [
      { label: `${W}: ${n}-year total, present value`, value: figure(values[lead.winner]), ...refFor(W) },
      { op: "−", label: `${R}: the same for ${R}`, value: figure(values[lead.runnerUp]), ...refFor(R) },
      { op: "=", label: "Present-value gap", value: figure(gap), rule: "single" },
      { op: "÷", label: `Annuity factor: ${months} month-ends at ${rate} a year`, value: factor.toFixed(4), ref: `af.${n}` },
      { op: "=", label: `A month, for ${months} months`, value: dollars(perMonth), rule: "double" },
    ],
    // The reader's question first (why not just divide?), then what the factor is.
    notes: [
      factor < months - 0.005
        ? `Not ${dollars(gap)} ÷ ${months} = ${dollars(gap / months)}: later dollars are worth less today, so it takes ${dollars(perMonth)} `
          + `a month, every month for ${months} months, to be worth ${dollars(gap)} today.`
        : `Here the factor is ${factor.toFixed(4)}, about the number of months, so the monthly figure is close to ${dollars(gap)} ÷ ${months}.`,
      `The annuity factor is what $1 paid on the last day of each month of the stay${span} is worth today, ${longDate(r.sweep.valuationDate)}: `
        + `each month's dollar is discounted at ${rate} a year for the time until it's paid, and the ${months} values are added up.`,
    ],
    ties, uses: yours ? [`pv.${W}.${basis as ValueBasis}`, `pv.${R}.${basis as ValueBasis}`] : [],
  };
}

function annuityWork(ctx: WorkContext, n: number): Work {
  const r = res(ctx);
  const row = rowFor(ctx, n);
  const terms = r.detail?.annuity[n];
  if (!terms) throw new Error("Still working this out…");
  const rate = percent(r.sweep.discountRate);
  const line = (t: (typeof terms)[number], op?: WorkLine["op"]): WorkLine =>
    ({ ...(op ? { op } : {}), label: longDate(t.date), note: `${figure(t.days)} days from today`, value: t.factor.toFixed(4) });
  const shown = terms.length <= 6 ? terms.map((t, i) => line(t, i ? "+" : undefined))
    : [line(terms[0]), line(terms[1], "+"), line(terms[2], "+"),
      // The middle months are shown as one line: the rest of the total, so the column foots as displayed.
      { op: "+" as const, label: `… ${terms.length - 5} more month-ends`, value: (Number(row.annuityFactor.toFixed(4))
        - [0, 1, 2, terms.length - 2, terms.length - 1].reduce((s, k) => s + Number(terms[k].factor.toFixed(4)), 0)).toFixed(4) },
      line(terms[terms.length - 2], "+"), line(terms[terms.length - 1], "+")];
  return {
    title: `Annuity factor · stay ${years(n)} at ${rate}`, scope: `${terms.length} month-ends, ${windowText(row)}`,
    lines: [...shown, { op: "=", label: "Annuity factor", value: row.annuityFactor.toFixed(4), rule: "double" }],
    notes: [
      `Each month-end's factor is (1 + ${rate})^−(days from today ÷ 365.25): what $1 paid that day is worth today, ${longDate(r.sweep.valuationDate)}.`,
      "Dividing a present-value gap by the sum gives the level amount, paid at each month's end, that's worth the gap today. "
        + "Every payment and vest in the comparison is discounted the same way.",
    ],
    ties: [], uses: [],
  };
}

// ---- an offer's totals ---------------------------------------------------------------------------

/**
 * An offer's present-value totals as shown, line by line (pvWork), and each part as its own work shows it (partWork). Each part
 * is rounded once and each total is the engine's (the rank list's figure: a present value isn't worked from the years), so one
 * line in each column takes the rounding, as on a rounded schedule: the tax, in after-tax pay; the largest benefit, in total
 * rewards; the money saved at face value, after rent. Spending at the prices picked is spending as shown × the two BEA indexes as
 * shown. So every column adds up as displayed (audit C12, C14).
 */
function shownPv(w: WindowTotals, d: OfferDetail) {
  const R = (x: number) => Math.round(x) + 0;
  const pv = w.presentValue!;
  const ben = w.benefits.presentValue!;
  const gross = R(pv.gross);
  const premiums = R(pv.premiums);
  const afterTax = R(pv.afterTaxComp);
  const cash = { gross, tax: gross - premiums - afterTax, premiums, afterTax };
  // Total rewards: what's added to after-tax pay, signed (health costs beyond the premiums come off).
  const raw = { retirement: ben.retirement, perks: ben.perks, healthExtra: pv.premiums - ben.healthNet };
  const keys = ["retirement", "perks", "healthExtra"] as const;
  const taker = keys.reduce((a, k) => (Math.abs(raw[k]) > Math.abs(raw[a]) ? k : a), "retirement" as (typeof keys)[number]);
  const totalRewards = R(w.totalRewards.presentValue!);
  const adds = { retirement: R(raw.retirement), perks: R(raw.perks), healthExtra: R(raw.healthExtra) };
  adds[taker] = totalRewards - afterTax - keys.filter((k) => k !== taker).reduce((t, k) => t + adds[k], 0);
  const col = w.costOfLiving?.presentValue;
  let after: { takeHome: number; savings: number; rent: number; spending: number; sameRef: number; oopLocal: number; oopRef: number; face: number;
    total: number } | null = null;
  if (col && d.costOfLiving) {
    const x = shownIndexes(d);
    const at = (v: number) => R((v * x.refValue) / x.areaValue);
    const takeHome = R(pv.takeHome);
    const savings = R(col.savings);
    const rent = R(col.rent);
    const spending = takeHome - savings - rent;
    const oopLocal = R(col.outOfPocketReference / d.costOfLiving.nonHousingFactor);
    const total = R(col.total);
    const sameRef = at(spending);
    const oopRef = at(oopLocal);
    after = { takeHome, savings, rent, spending, sameRef, oopLocal, oopRef, face: total - sameRef + oopRef, total };
  }
  return { cash, rewards: { ...adds, taker, total: totalRewards }, after };
}

/** A part as it's shown in its total's column (shownPv), and the engine's figure, which it can differ from by the rounding it takes. */
function shownPart(ctx: WorkContext, letter: L, part: PvPart): { shown: number; engine: number } {
  const d = detailOf(ctx, letter);
  const s = shownPv(d.window, d);
  const engine = partValues(d.window, part)[1];
  switch (part) {
    case "gross": case "tax": case "premiums": return { shown: s.cash[part], engine };
    case "retirement": case "perks": return { shown: s.rewards[part], engine };
    case "healthExtra": return { shown: -s.rewards.healthExtra, engine };
    case "takeHome": case "savings": case "rent": return { shown: s.after?.[part] ?? Math.round(engine), engine };
    case "faceValue": return { shown: s.after?.face ?? Math.round(engine), engine };
  }
}

/**
 * An offer's total over your stay, present value, line by line. In the base case each part opens its own
 * work; in the bear or bull case (L-2) the parts are that scenario's, and a note says which inputs differ.
 */
function pvWork(ctx: WorkContext, letter: L, basis: ValueBasis, scenario: Scenario = "base"): Work {
  const r = res(ctx);
  const d = detailOf(ctx, letter);
  const base = scenario === "base";
  const w = base ? d.window : d.cases[scenario];
  const n = r.view.row.years;
  const pv = w.presentValue!;
  const ben = w.benefits.presentValue!;
  const scope = `${CASE_NAME[scenario]} · stay ${years(n)} (${windowText(r.view.row)}) · present value as of ${longDate(r.sweep.valuationDate)}`;
  const title = `${letter} · ${n}-year ${totalName(ctx, basis)}${base ? "" : `, ${scenario} case`}`;
  const discountNote = `Present value: each payment is discounted from its date to today at ${percent(r.sweep.discountRate)} a year, so later pay counts for less.`;
  /** A part opens its own work in the base case only: the parts' derivations are the base case's. */
  const link = (id: MetricId) => (base ? { ref: id } : {});
  const other = base ? null : caseNotes(ctx, letter, scenario);
  const inputs = (paths: string[]) => other?.inputs ?? fromInputs(ctx, letter, paths);
  const shown = shownPv(w, d);
  const rounding = "Each figure is rounded once and the total is the engine's, so one line takes the rounding, as on a rounded schedule: "
    + "here, ";
  if (basis === "cash") {
    const c = shown.cash;
    return {
      title, scope,
      lines: [
        { label: PART.gross.label, value: figure(c.gross), ...link(`part.${letter}.gross`) },
        { op: "−", label: PART.tax.label, value: figure(c.tax), ...link(`part.${letter}.tax`) },
        ...(c.premiums ? [{ op: "−" as const, label: PART.premiums.label, value: figure(c.premiums), ...link(`part.${letter}.premiums`) }] : []),
        { op: "=", label: "After-tax pay", value: figure(c.afterTax), rule: "double" },
      ],
      notes: [...(other?.notes ?? []), discountNote, `As paid, without discounting: ${dollars(w.nominal.afterTaxComp)}.`,
        ...(c.tax !== Math.round(pv.tax) ? [`${rounding}the tax (the engine's ${cents(pv.tax)}).`] : [])],
      ties: [], ...inputs(["salary.annual", bonusPath(ctx, letter), "startDate", "costOfLiving.area"]),
    };
  }
  if (basis === "totalRewards") {
    const t = shown.rewards;
    const adds: WorkLine[] = [
      ...(t.retirement ? [{ op: t.retirement > 0 ? "+" as const : "−" as const, label: PART.retirement.label, value: figure(Math.abs(t.retirement)),
        ...link(`part.${letter}.retirement`) }] : []),
      ...(t.perks ? [{ op: t.perks > 0 ? "+" as const : "−" as const, label: PART.perks.label, value: figure(Math.abs(t.perks)),
        ...link(`part.${letter}.perks`) }] : []),
      ...(t.healthExtra ? [{ op: t.healthExtra < 0 ? "−" as const : "+" as const, label: PART.healthExtra.label,
        value: figure(Math.abs(t.healthExtra)), ...link(`part.${letter}.healthExtra`) }] : []),
    ];
    const engine = { retirement: ben.retirement, perks: ben.perks, healthExtra: pv.premiums - ben.healthNet }[t.taker];
    return {
      title, scope,
      lines: [
        { label: "After-tax pay", value: figure(shown.cash.afterTax), ...link(`pv.${letter}.cash`) },
        ...adds,
        { op: "=", label: "Total rewards", value: figure(t.total), rule: "double" },
      ],
      notes: [
        ...(other?.notes ?? []),
        adds.length ? "Total rewards adds the benefits that are worth money to you and takes out health costs beyond the premiums."
          : `Nothing to add: offer ${letter} has no 401(k), perks or health costs entered.`,
        discountNote,
        ...(t[t.taker] !== Math.round(engine) ? [`${rounding}${lowerFirst(PART[t.taker].label)} (the engine's ${cents(Math.abs(engine))}).`] : []),
      ],
      ties: [], ...inputs(["retirement", "health", "perks.section127", "perks.commuterMonthly"]),
    };
  }
  const col = w.costOfLiving?.presentValue;
  const info = d.costOfLiving;
  if (!col || !info) throw new Error(`Offer ${letter} needs a city for this basis.`);
  const x = indexes(d);
  const f = info.nonHousingFactor;
  const a = shown.after!;
  const check = w.totalRewards.presentValue! - col.rent + (f - 1) * (col.nonHousingLocal - col.outOfPocketReference / f);
  const p = pricesOf(ctx);
  return {
    title, scope: `${scope} · ${p.dollars}`,
    lines: [
      { label: PART.takeHome.label, value: figure(a.takeHome), ...link(`part.${letter}.takeHome`) },
      ...(a.savings ? [{ op: "−" as const, label: PART.savings.label, value: figure(a.savings), ...link(`part.${letter}.savings`) }] : []),
      { op: "−", label: PART.rent.label, value: figure(a.rent), ...link(`part.${letter}.rent`) },
      { op: "=", label: `Spending money after rent, at ${x.city} prices`, value: figure(a.spending), rule: "single" },
      ...priceLines(ctx, d, letter),
      { op: "=", label: `The same spending, at ${p.place} prices`, value: figure(a.sameRef), rule: "single" },
      ...(a.oopRef ? [{ op: "−" as const, label: `Out-of-pocket health costs, at ${p.place} prices`, value: figure(a.oopRef),
        note: `${figure(a.oopLocal)} × ${x.ref} ÷ ${x.area}` }] : []),
      { op: "+", label: PART.faceValue.label, value: figure(a.face), ...link(`part.${letter}.faceValue`) },
      { op: "=", label: p.phrase[0].toUpperCase() + p.phrase.slice(1), value: figure(a.total), rule: "double" },
    ],
    notes: [
      ...(other?.notes ?? []),
      `Spending money is local; saved money isn't. What's left to spend after rent is priced as in ${p.city}; what you save counts at face value.`,
      `It ties to total rewards: ${figure(w.totalRewards.presentValue!)} − rent ${figure(col.rent)} + (${x.ref} ÷ ${x.area} − 1) × `
        + `(spending ${figure(col.nonHousingLocal)} − out-of-pocket ${figure(col.outOfPocketReference / f)}) = ${figure(check)}.`,
      discountNote,
      ...(a.face !== Math.round(col.faceValue) ? [`${rounding}the money saved at face value (the engine's ${cents(col.faceValue)}).`] : []),
    ],
    ties: [], ...(other
      ? { inputs: other.inputs.inputs, uses: [...other.inputs.uses, `in.${letter}.costOfLiving.monthlyRent`, `in.${letter}.costOfLiving.area`] }
      : { uses: [`in.${letter}.costOfLiving.monthlyRent`, `in.${letter}.costOfLiving.area`] }),
  };
}

function perHourWork(ctx: WorkContext, letter: L, scenario: Scenario = "base"): Work {
  const r = res(ctx);
  const row = r.view.row;
  const i = indexOf(ctx, letter);
  if (!row.hours || !row.values.perHour) throw new Error("Per hour needs hours for every offer.");
  const of = r.sweep.perHourOf;
  const hours = offerByLetter(ctx, letter)?.draft.hours;
  // The base case is the horizon sweep's row; a bear or bull case is that scenario's window (L-2).
  const w = scenario === "base" ? null : detailOf(ctx, letter).cases[scenario];
  const total = w ? (of === "colAdjustedTotal" ? w.costOfLiving!.nominal.total : w.totalRewards.nominal) : row.nominal[of]![i];
  const worked = w ? w.hours ?? 0 : row.hours[i];
  const value = w ? w.perHour?.[of] ?? 0 : row.values.perHour[i];
  const weekly = hours?.weekly ? hours.weekly[scenario] : null;
  const other = w ? caseNotes(ctx, letter, scenario) : null;
  // Total and hours at the decimals at which they divide out to the figure shown.
  const q = quotient(total, worked, value, 100);
  return {
    title: `${letter} · ${phrase(ctx, "perHour")}${w ? `, ${scenario} case` : ""}`,
    scope: `${CASE_NAME[scenario]} · stay ${years(row.years)} (${windowText(row)}) · nominal`,
    lines: [
      { label: `${row.years}-year total ${phrase(ctx, of)}, as paid`, value: q.num },
      { op: "÷", label: "Hours worked in the window", value: q.den, ...(weekly !== null ? {
        note: `${weekly} a week × ${weeksShown(offerByLetter(ctx, letter)!.draft)} weeks a year` } : {}) },
      { op: "=", label: "Per hour worked", value: cents(value), rule: "double" },
    ],
    notes: [...(other?.notes ?? []),
      "Per hour isn't discounted: dollars as paid over the stay, divided by the hours worked in it. A later start means fewer hours in the window."],
    ties: [], ...(other?.inputs ?? fromInputs(ctx, letter, HOURS_INPUTS)),
  };
}

// ---- L-2: if things go badly ---------------------------------------------------------------------

const CASE_NAME: Record<Scenario, string> = { bear: "Bear case", base: "Base case", bull: "Bull case" };
/** The input each kind of change comes from: what "From your inputs" opens. */
function changePath(ctx: WorkContext, letter: L, kind: CaseChange["kind"]): string {
  switch (kind) {
    case "bonus": case "bonusByYear": return bonusPath(ctx, letter);
    case "raise": return "salary.raise";
    case "promotion": return "salary.promotions";
    case "priceGrowth": return "equity.priceGrowth";
    case "refreshers": return "equity.refreshers";
    case "hours": return "hours.weekly";
  }
}
const caseFigure = (basis: Basis, v: number) => (basis === "perHour" ? cents(v) : figure(v));

/** A scenario's note, and the inputs that differ from the base case in it, each opening its own work. */
function caseNotes(ctx: WorkContext, letter: L, scenario: Scenario): { notes: string[]; inputs: { inputs: InputRef[]; uses: MetricId[] } } {
  const r = res(ctx);
  const o = offerByLetter(ctx, letter);
  const input = o ? toOfferInput(o) : null;
  const changes = input && "offer" in input ? caseChanges(input.offer, scenario, r.view.row.window.end, r.view.basis === "perHour") : [];
  const notes = changes.length
    ? [`The ${scenario} case sets every uncertain input to its ${scenario} value at once. For ${letter}: ${changes.map(changeText).join("; ")}.`]
    : [`Nothing entered for ${letter} changes within your stay in the ${scenario} case, so it equals the base case.`];
  return { notes, inputs: fromInputs(ctx, letter, [...new Set(changes.map((c) => changePath(ctx, letter, c.kind)))]) };
}

/** L-2: an offer's value in a scenario. The base case is the rank list's figure; bear and bull are worked out like it. */
function caseWork(ctx: WorkContext, letter: L, scenario: Scenario): Work {
  const r = res(ctx);
  const basis = r.view.basis;
  if (scenario !== "base") return basis === "perHour" ? perHourWork(ctx, letter, scenario) : pvWork(ctx, letter, basis, scenario);
  const n = r.view.row.years;
  const twin: MetricId = basis === "perHour" ? `ph.${letter}` : `pv.${letter}.${basis}`;
  return {
    title: `${letter} · base case · ${phrase(ctx, basis)}`,
    scope: `Base case · stay ${years(n)} (${windowText(r.view.row)}) · ${basis === "perHour" ? "nominal" : "today's dollars"}`,
    lines: [{
      label: basis === "perHour" ? `${letter}: per hour worked, in the rank list` : `${letter}: ${n}-year total, in the rank list`,
      value: caseFigure(basis, caseValue(ctx, letter, "base")), ref: twin,
    }],
    notes: ["The base case is the one the verdict uses, so this is the same figure as the rank list's, and it opens the same work."],
    ties: [twin], uses: [],
  };
}

/** L-2: how far an offer falls from its base case to its bear case, a month (or an hour). */
function dropWork(ctx: WorkContext, letter: L): Work {
  const r = res(ctx);
  const v = riskView(ctx);
  const x = v.rows.find((row) => row.letter === letter);
  if (!x) throw new Error(`Offer ${letter} isn't in the comparison yet.`);
  const basis = r.view.basis;
  const n = v.years;
  const months = 12 * n;
  return {
    title: `${letter} · from the base case to the bear case · ${phrase(ctx, basis)}`,
    scope: `Stay ${years(n)} (${windowText(r.view.row)}) · ${v.perHour ? "nominal" : "today's dollars"}`,
    lines: [
      { label: `${letter}: base case`, value: caseFigure(basis, x.values.base), ref: `risk.${letter}.base` },
      { op: "−", label: `${letter}: bear case`, value: caseFigure(basis, x.values.bear), ref: `risk.${letter}.bear` },
      ...(v.perHour
        ? [{ op: "=" as const, label: "Less per hour worked in the bear case", value: cents(x.drop), rule: "double" as const }]
        : [
          { op: "=" as const, label: "Present-value drop", value: figure(shownGap(x.values.base, x.values.bear)), rule: "single" as const },
          { op: "÷" as const, label: `Annuity factor: ${months} month-ends at ${percent(r.sweep.discountRate)} a year`, value: v.factor.toFixed(4),
            ref: `af.${n}` as MetricId },
          { op: "=" as const, label: `A month, for ${months} months`, value: dropAmount(v, x), rule: "double" as const },
        ]),
    ],
    notes: [`That's ${Math.round(x.share * 100)}% of ${letter}'s base case.`, ...caseNotes(ctx, letter, "bear").notes],
    ties: [], uses: [`risk.${letter}.base`, `risk.${letter}.bear`],
  };
}

/** L-2: who leads in a scenario, and by how much a month (or an hour). The base case is the verdict. */
function caseLeadWork(ctx: WorkContext, scenario: Scenario): Work {
  const r = res(ctx);
  const v = riskView(ctx);
  const basis = r.view.basis;
  const { winner: W, runnerUp: R, margin } = v.leads[scenario];
  const value = (l: L) => v.rows.find((x) => x.letter === l)!.values[scenario];
  const n = v.years;
  const months = 12 * n;
  return {
    title: `${W} over ${R} · ${scenario} case · ${phrase(ctx, basis)}`,
    scope: `${CASE_NAME[scenario]} · stay ${years(n)} (${windowText(r.view.row)}) · ${v.perHour ? "nominal" : "today's dollars"}`,
    lines: [
      { label: `${W}: ${scenario} case`, value: caseFigure(basis, value(W)), ref: `risk.${W}.${scenario}` },
      { op: "−", label: `${R}: ${scenario} case`, value: caseFigure(basis, value(R)), ref: `risk.${R}.${scenario}` },
      ...(v.perHour
        ? [{ op: "=" as const, label: "More per hour worked", value: cents(margin), rule: "double" as const }]
        : [
          { op: "=" as const, label: "Present-value gap", value: figure(shownGap(value(W), value(R))), rule: "single" as const },
          { op: "÷" as const, label: `Annuity factor: ${months} month-ends at ${percent(r.sweep.discountRate)} a year`, value: v.factor.toFixed(4),
            ref: `af.${n}` as MetricId },
          { op: "=" as const, label: `A month, for ${months} months`, value: leadText(v, v.leads[scenario]), rule: "double" as const },
        ]),
    ],
    notes: scenario === "base"
      ? ["The base case is the verdict's, so this is the verdict's lead."]
      : [`Each offer's ${scenario} case sets every uncertain input to its ${scenario} value at once; ${W} leads ${R} there.`],
    ties: scenario === "base" ? sameFigure(ctx, n, basis) : [], uses: [`risk.${W}.${scenario}`, `risk.${R}.${scenario}`],
  };
}

// ---- L-3 and the close-call line: what it would take -------------------------------------------------

/** The breakevens on screen: L-3's, or the close-call line's. */
function tiesOf(ctx: WorkContext, which: "flip" | "l3"): Ties {
  const t = res(ctx).ties?.[which];
  if (!t) throw new Error("Still working this out…");
  return t;
}

/** A row of breakevens, its two offers, and whether it's the winner's cushion (the last of L-3's rows). */
function tieContext(ctx: WorkContext, t: Ties, row: TieRow) {
  const r = res(ctx);
  const me = r.letters[row.offer];
  const other = r.letters[row.against];
  const o = me ? offerByLetter(ctx, me) : undefined;
  const input = o ? toOfferInput(o) : null;
  if (!me || !other || !input || !("offer" in input)) throw new Error("These offers have changed: still working this out…");
  const cushion = t.rows.length > 1 && t.rows[t.rows.length - 1] === row;
  // The rank list's totals are on the page only on the basis the verdict uses.
  const onPage = t.basis === r.view.basis;
  const n = r.view.row.years;
  return {
    me, other, offer: input.offer, cushion, n, words: basisPhrase(pricesOf(ctx)),
    title: cushion ? `${me}'s cushion over ${other} · ${phrase(ctx, t.basis)}` : `${me} to tie ${other} · ${phrase(ctx, t.basis)}`,
    scope: `Base case · stay ${years(n)} (${windowText(r.view.row)}) · today's dollars`,
    pv: (l: L): Partial<WorkLine> => (onPage ? { ref: `pv.${l}.${t.basis}` } : {}),
    uses: onPage ? [`pv.${other}.${t.basis}` as MetricId, `pv.${me}.${t.basis}` as MetricId] : [],
  };
}
type TieContext = ReturnType<typeof tieContext>;

/**
 * The target, the offer's own total, and the gap between them, as displayed: the larger first, so the gap is what's left when the
 * smaller is taken from it (the winner's cushion reads its own total less the target: its lead).
 */
function gapLines(x: TieContext, basis: ValueBasis, r: { targetPV: number; aheadBy: number }): WorkLine[] {
  const own = r.targetPV + r.aheadBy;
  const gap = shownGap(r.targetPV, own);
  const target: WorkLine = { label: `${x.other}: ${x.n}-year total ${x.words[basis]}, the target`, value: figure(r.targetPV), ...x.pv(x.other) };
  const mine: WorkLine = { label: `${x.me}: the same, as entered`, value: figure(own), ...x.pv(x.me) };
  const [first, second] = gap >= 0 ? [target, mine]
    : [{ ...mine, label: `${x.me}: ${x.n}-year total ${x.words[basis]}, as entered` }, { ...target, label: `${x.other}: the same, the target` }];
  return [
    first, { ...second, op: "−" },
    { op: "=", label: x.cushion ? `${x.me}'s lead` : "The gap to close", value: figure(Math.abs(gap)), rule: "single" },
  ];
}

const searched = (x: TieContext, what: string, to: number, target: number) =>
  `Found by search (bisection), to the cent: with ${what} at ${cents(to)} and everything else as entered, ${x.me}'s ${x.n}-year total meets `
  + `${x.other}'s ${figure(target)}, to within a few cents.`;
const sameWindow = (x: TieContext) =>
  `Over your stay, from the earliest start of every offer: the rank list's window, so the target is ${x.other}'s figure there.`;

/** A starting salary that ties: L-3's, the winner's cushion, or the close-call line's. */
function salaryWork(ctx: WorkContext, t: Ties, row: TieRow, extra: string[] = []): Work {
  const x = tieContext(ctx, t, row);
  const r = row.salary;
  const lines = gapLines(x, t.basis, r);
  const inputs = fromInputs(ctx, x.me, ["salary.annual"]);
  if (r.outcome !== "tie") {
    return {
      title: x.title, scope: x.scope, lines,
      notes: [`Even at a $0 starting salary, ${x.me}'s total stays above ${x.other}'s, so no salary ties: what keeps ${x.me} ahead is paid apart `
        + "from salary.", sameWindow(x)],
      ties: [], ...inputs, uses: [...x.uses, ...inputs.uses],
    };
  }
  return {
    title: x.title, scope: x.scope,
    lines: [
      ...lines,
      { label: `${x.me}'s starting salary, as entered`, value: dollars(r.from), ref: `in.${x.me}.salary.annual` },
      // The change is the difference of the two figures as shown, so it's what's added to or taken off the one to reach the other.
      { op: r.increase >= 0 ? "+" : "−", label: x.cushion ? `What ${x.other} catching up takes off it` : "The increase that closes the gap",
        value: dollars(Math.abs(Math.round(r.to) - Math.round(r.from))) },
      { op: "=", label: x.cushion ? `Starting salary at which ${x.other} ties` : "Starting salary that ties", value: dollars(r.to), rule: "double" },
    ],
    notes: [
      ...extra,
      searched(x, "the starting salary", r.to, r.targetPV),
      `A dollar of salary adds less than a dollar to the total: tax takes part of it, and later years' pay is discounted to today. ${scalesText(x.me, x.offer, t.basis)}`,
      sameWindow(x),
    ],
    ties: [], ...inputs, uses: [...x.uses, ...inputs.uses],
  };
}

/** The close-call line: the runner-up's starting salary that ties the verdict. */
function flipWork(ctx: WorkContext): Work {
  const t = tiesOf(ctx, "flip");
  const lead = res(ctx).view.lead;
  return salaryWork(ctx, t, t.rows[0],
    lead ? [`The lead is under 3% of ${lead.winnerLetter}'s value, a close call: this is the change to ${lead.runnerUpLetter}'s offer that would tie it.`] : []);
}

/** L-3: the winner's total, which every offer behind it ties to. It's the rank list's figure. */
function tieTargetWork(ctx: WorkContext): Work {
  const t = tiesOf(ctx, "l3");
  const r = res(ctx);
  const row = t.rows[0];
  if (!row) throw new Error("Still working this out…");
  const W = r.letters[row.against];
  const twin: MetricId = `pv.${W}.${t.basis}`;
  const onPage = t.basis === r.view.basis;
  return {
    title: `${W} · L-3's target · ${phrase(ctx, t.basis)}`, scope: `Base case · stay ${years(r.view.row.years)} (${windowText(r.view.row)}) · today's dollars`,
    lines: [{ label: `${W}: ${r.view.row.years}-year total ${phrase(ctx, t.basis)}`, value: figure(row.salary.targetPV), ...(onPage ? { ref: twin } : {}) }],
    notes: [
      `Every line in L-3 ties to this figure: each offer behind ${W}, with one input changed, comes within a cent of it.`,
      "It's the rank list's figure: the same window (the earliest start of every offer, for your stay), base case, valued today. A breakeven over "
        + "only two offers' own window would miss a third offer's earlier start.",
    ],
    ties: onPage ? [twin] : [], uses: [],
  };
}

function tieWork(ctx: WorkContext, letter: L, lever: "salary" | "cash" | "rent"): Work {
  const t = tiesOf(ctx, "l3");
  const i = indexOf(ctx, letter);
  const row = t.rows.find((x) => x.offer === i);
  if (!row) throw new Error("Still working this out…");
  if (lever === "salary") return salaryWork(ctx, t, row);
  return lever === "cash" ? cashWork(ctx, t, row) : rentWork(ctx, t, row);
}

/** L-3: the first cash award (or a sign-on) that ties, or the winner's at which the runner-up ties. */
function cashWork(ctx: WorkContext, t: Ties, row: TieRow): Work {
  const x = tieContext(ctx, t, row);
  const r = row.cash;
  if (!r) throw new Error("Still working this out…");
  const lever = cashLever(x.offer);
  const name = lever.label[0].toUpperCase() + lever.label.slice(1);
  const lines = gapLines(x, t.basis, r);
  const inputs = lever.added ? { inputs: [], uses: [] } : fromInputs(ctx, x.me, ["cashAwards.0.amount"]);
  if (r.outcome !== "tie") {
    return {
      title: x.title, scope: x.scope, lines,
      notes: [`With no ${inSentence(lever.label)} at all, ${x.me}'s total stays above ${x.other}'s, so no amount ties: ${x.me} doesn't need it to lead.`,
        sameWindow(x)],
      ties: [], ...inputs, uses: [...x.uses, ...inputs.uses],
    };
  }
  return {
    title: x.title, scope: x.scope,
    lines: [
      ...lines,
      lever.added ? { label: `No cash award: ${lever.name}`, value: "$0" }
        : { label: `${lever.name}, as entered`, value: dollars(r.from), ref: `in.${x.me}.cashAwards.0.amount` as MetricId },
      { op: r.increase >= 0 ? "+" : "−", label: x.cushion ? `What ${x.other} catching up takes off it` : "The increase that closes the gap",
        value: dollars(Math.abs(Math.round(r.to) - Math.round(r.from))) },
      { op: "=", label: x.cushion ? `${name} at which ${x.other} ties` : `${name} that ties`, value: dollars(r.to), rule: "double" },
    ],
    notes: [
      ...(lever.added ? [`${x.me} has no cash award, so this adds one: a sign-on paid 30 days after the start, with no clawback.`] : []),
      searched(x, `the ${inSentence(lever.label)}`, r.to, r.targetPV),
      "A cash award is paid once, on its date, and taxed that year with the rest of your pay, so it ties dollar for dollar less that tax, "
        + "discounted to today. Salary moves more: it's paid every year, and what scales with it moves too.",
      sameWindow(x),
    ],
    ties: [], ...inputs, uses: [...x.uses, ...inputs.uses],
  };
}

/** L-3's rent lever: closed form, since the total is linear in rent (the engine's rentFlip). */
function rentWork(ctx: WorkContext, t: Ties, row: TieRow): Work {
  const x = tieContext(ctx, t, row);
  const f = row.rent;
  if (!f || f.outcome === "noRent") throw new Error(`${x.me} pays no rent inside your stay.`);
  const d = detailOf(ctx, x.me);
  const ix = indexes(d);
  const info = ix.info;
  const rt = rentTie(f, ix);
  const inputs = fromInputs(ctx, x.me, ["costOfLiving.monthlyRent"]);
  const estimated = info.rentSource !== "input";
  const lines: WorkLine[] = [
    ...gapLines(x, "colAdjustedTotal", f),
    { op: "×", label: `${ix.city} non-housing prices (BEA)`, value: ix.area, ref: `rpp.${x.me}.area` },
    { op: "÷", label: `${pricesOf(ctx).place} non-housing prices (BEA)`, value: ix.ref, ref: `rpp.${x.me}.ref` },
    { op: "=", label: `The same in ${ix.city} dollars`, value: figure(rt.local), rule: "single" },
    { op: "÷", label: "Rent's present-value factor", value: rt.factor.toFixed(4),
      note: `$1 a month of first-year rent, each month you'd work there in your stay, rising ${percent(info.rentGrowth)} at each lease anniversary` },
    { op: "=", label: x.cushion ? "More rent a month it can carry" : "Less rent a month, first lease year", value: dollars(rt.change), rule: "single" },
  ];
  const notes = [
    `Closed form, since the total is linear in rent: each $1 of ${ix.city} rent is $1 less to spend there, worth ${f.nonHousingFactor.toFixed(4)} at `
      + `${pricesOf(ctx).place} prices. So the gap, restated in ${ix.city} dollars, is divided by what $1 a month of rent is worth over your stay.`,
    `First lease year: the lease starts on ${x.me}'s start date, and rent rises ${percent(info.rentGrowth)} at each anniversary `
      + `(${info.rentGrowthSource === "input" ? "as entered" : "inflation, the default"}).`,
    ...(estimated ? [`${x.me}'s rent is an estimate (HUD Fair Market Rent): enter yours to see how far it is from this line.`] : []),
  ];
  const how = estimated ? "estimated" : "as entered";
  const rentLines: WorkLine[] = [
    { label: `${x.me}'s rent a month, ${how}`, value: dollars(rt.from) },
    { op: rt.up ? "+" : "−", label: x.cushion ? "More rent it can carry" : "Less rent", value: dollars(rt.change) },
  ];
  if (f.outcome === "rentFree" || rt.to < 0) {
    return {
      title: x.title, scope: x.scope,
      lines: [...lines, ...rentLines, { op: "=", label: "Rent that ties", value: "below $0", rule: "double" }],
      notes: [`Even rent-free, ${x.me} trails ${x.other}: the rent that would tie is below zero.`, ...notes],
      ties: [], ...inputs, uses: [...x.uses, ...inputs.uses],
    };
  }
  return {
    title: x.title, scope: x.scope,
    lines: [...lines, ...rentLines,
      { op: "=", label: x.cushion ? `Rent at which ${x.other} ties` : "Rent that ties", value: dollars(rt.to), rule: "double" }],
    notes, ties: [], ...inputs, uses: [...x.uses, ...inputs.uses],
  };
}

/** How the note names an estimate: "HUD's estimate for New York", or for an area without an FMR, "the estimate for nonmetro Maine". */
export const estimateName = (n: { estimate: { source: "fmr" | "derived" }; city: string }) =>
  `${n.estimate.source === "fmr" ? "HUD's estimate" : "the estimate"} for ${n.city}`;

/**
 * The lead's rent note: L-3's rent lever for the offer (closed form, from your stay's projections), then its estimate on
 * the other side of it. At the estimate, the other offer would lead by the distance between them, at the offer's price
 * factor and rent's present-value factor.
 */
function rentNoteWork(ctx: WorkContext, letter: L): Work {
  const note = rentNotes(ctx).find((n) => n.letter === letter);
  if (!note) throw new Error("The verdict no longer depends on this rent.");
  const r = res(ctx);
  const row = r.view.row;
  const f = note.flip;
  const d = detailOf(ctx, letter);
  const ix = indexes(d);
  const p = pricesOf(ctx);
  const winner = letter !== note.wins; // the winner's own rent: its lead goes above the rent that ties
  const own = f.targetPV + f.aheadBy;
  const t = rentTie(f, ix);
  const est = note.estimate;
  const estimate = Math.round(est.monthlyRent);
  const apart = Math.abs(estimate - t.to);
  // At the estimate, the other side leads by the rent's distance from the tie, through the same two factors.
  const leadPV = apart * f.nonHousingFactor * f.rentFactor;
  const name = estimateName(note);
  const estLabel = est.source === "fmr"
    ? `HUD's Fair Market Rent for ${note.city}, ${est.bedrooms === 0 ? "a studio" : `${est.bedrooms} bedroom${est.bedrooms === 1 ? "" : "s"}`} (FY${est.fiscalYear})`
    : `The estimate for ${note.city}: BEA housing prices × the U.S. median rent`;
  const inputs = fromInputs(ctx, letter, ["costOfLiving.monthlyRent"]);
  const totals: WorkLine[] = [
    { label: `${note.against}: ${row.years}-year total ${p.phrase}`, value: figure(f.targetPV), ref: `pv.${note.against}.colAdjustedTotal` },
    { label: `${letter}: the same, at your rent`, value: figure(own), ref: `pv.${letter}.colAdjustedTotal` },
  ];
  const tieRef = r.ties?.l3?.rows.some((x) => r.letters[x.offer] === letter && x.rent?.outcome === "tie") && r.ties.l3.basis === "colAdjustedTotal"
    ? { ref: `tie.${letter}.rent` as MetricId } : {};
  const tieLine: WorkLine = { label: `The rent that ties ${note.against}`, value: dollars(t.to), ...tieRef };
  const estLine: WorkLine = { label: estLabel, value: dollars(estimate), tick: "estimate" };
  return {
    title: `${letter} at ${name} · ${p.phrase}`,
    scope: `Base case · stay ${years(row.years)} (${windowText(row)}) · today's dollars`,
    lines: [
      // The larger first: the winner's own total, less the other's, is its lead.
      ...(winner
        ? [{ ...totals[1], label: `${letter}: ${row.years}-year total ${p.phrase}, at your rent` }, { ...totals[0], label: `${note.against}: the same`, op: "−" as const }]
        : [totals[0], { ...totals[1], op: "−" as const }]),
      { op: "=", label: winner ? `${letter}'s lead` : "The gap to close", value: figure(t.gap), rule: "single" },
      { op: "×", label: `${ix.city} non-housing prices (BEA)`, value: ix.area, ref: `rpp.${letter}.area` },
      { op: "÷", label: `${p.place} non-housing prices (BEA)`, value: ix.ref, ref: `rpp.${letter}.ref` },
      { op: "=", label: `The same in ${ix.city} dollars`, value: figure(t.local), rule: "single" },
      { op: "÷", label: "Rent's present-value factor", value: t.factor.toFixed(4),
        note: `$1 a month of first-year rent, each month you'd work there in your stay, rising ${percent(d.costOfLiving!.rentGrowth)} at each lease anniversary` },
      { op: "=", label: winner ? "More rent a month it can carry" : "Less rent a month, first lease year", value: dollars(t.change), rule: "single" },
      { label: "Your rent a month", value: dollars(t.from) },
      { op: t.up ? "+" : "−", label: winner ? "More rent it can carry" : "Less rent", value: dollars(t.change) },
      { ...tieLine, op: "=", rule: "single" },
      // The larger first again: the estimate is over the rent that ties, or under it.
      ...(estimate >= t.to ? [estLine, { ...tieLine, op: "−" as const }] : [tieLine, { ...estLine, op: "−" as const }]),
      { op: "=", label: `${estimate >= t.to ? "Over" : "Under"} the rent that ties by`, value: dollars(apart), rule: "double" },
    ],
    notes: [
      `${name[0].toUpperCase()}${name.slice(1)} is ${winner ? "over" : "under"} the rent that ties, and your ${dollars(f.from)} is ${winner ? "under" : "over"} `
        + `it: with your rent ${r.letters[row.leads.colAdjustedTotal!.winner]} wins; at the estimate ${note.wins} would, by about `
        + `${dollars(leadPV / row.annuityFactor)} a month (${figure(leadPV)} in present value: ${dollars(apart)} × ${f.nonHousingFactor.toFixed(4)} × `
        + `${f.rentFactor.toFixed(4)}). Only ${letter}'s rent changes; the other offers keep theirs.`,
      "This is L-3's rent lever, worked out from the same projections as the rank list: closed form, since the total is linear in rent. "
        + `Rent is the softest input, and ${est.source === "fmr" ? "HUD's figure is a metro-wide 40th percentile" : "the estimate is metro-wide"}, so the verdict `
        + "turns on which is nearer what you'd pay.",
    ],
    ties: [], ...inputs, uses: [`pv.${note.against}.colAdjustedTotal`, `pv.${letter}.colAdjustedTotal`, ...inputs.uses],
    edit: { letter, path: "costOfLiving.monthlyRent" },
  };
}

// ---- L-4: leaving early -------------------------------------------------------------------------------

/** An offer's L-4 panel at the last day picked. */
function panelOf(ctx: WorkContext, letter: L) {
  // L-4's, with a comparison (A-4 reads the same job, so a figure in both is one figure); A-4's, with one offer.
  const r = ctx.results;
  const own = ctx.own?.leave;
  const leave: LeaveContext | undefined = r?.leave && r.letters.includes(letter) ? r.leave
    : own ? { basis: own.basis, stayEnd: dayBefore(breakdownOf(ctx, letter).window.end), panels: [] } : undefined;
  const panel = r?.leave && r.letters.includes(letter) ? r.leave.panels[indexOf(ctx, letter)] : own?.panels[letter];
  if (!leave || panel === undefined) throw new Error("Still working this out…");
  if (!panel) throw new Error(`Offer ${letter} hasn't started by then.`);
  return { leave, panel, scope: `If your last day is ${longDate(panel.leaveDate)} · as paid, not discounted` };
}

/** L-4: what you keep, after tax (or in total rewards). */
function keptWork(ctx: WorkContext, letter: L): Work {
  const { leave, panel: p, scope } = panelOf(ctx, letter);
  const repaid = p.repaid >= 0.5;
  const premiums = p.premiums >= 0.5;
  // The column foots as displayed: the tax line is what the other rounded figures leave.
  const R = Math.round;
  const vacation = p.vacation.paid >= 0.5 ? p.vacation.paid : 0;
  const tax = R(p.paid - vacation) + R(vacation) - (repaid ? R(p.repaid) : 0) - (premiums ? R(p.premiums) : 0) - R(p.afterTaxCompKept);
  const afterTax: WorkLine[] = [
    { label: "Pay received", note: "salary to your last day, bonuses and cash awards paid by then, RSUs vested by then", value: figure(p.paid - vacation) },
    ...(vacation ? [{ op: "+" as const, label: "Unused vacation paid out", value: figure(vacation), ref: `vac.${letter}` as MetricId }] : []),
    ...(repaid ? [{ op: "−" as const, label: "Clawbacks repaid", value: figure(p.repaid), ref: `repay.${letter}` as MetricId }] : []),
    { op: "−", label: repaid ? "Tax, less the relief on what's repaid" : "Tax on it", value: figure(tax) },
    ...(premiums ? [{ op: "−" as const, label: "Health premiums", value: figure(p.premiums) }] : []),
  ];
  const notes = [
    "Leaving is your last day of work, a voluntary exit. Pay stops that day; a bonus not yet paid is forfeited if you must be employed on its "
      + "payout date (the panel says what you'd earned toward it); unvested RSUs and employer 401(k) money stay behind.",
    "The tax is the offer's share of each calendar year's household tax, on the pay actually received.",
  ];
  if (leave.basis === "cash") {
    return { title: `${letter} · after-tax pay kept`, scope, lines: [...afterTax, { op: "=", label: "After-tax pay kept", value: figure(p.afterTaxCompKept), rule: "double" }],
      notes, ties: [], uses: repaid ? [`repay.${letter}`] : [] };
  }
  const b = p.benefits;
  return {
    title: `${letter} · total rewards kept`, scope,
    lines: [
      { label: "After-tax pay kept", value: figure(p.afterTaxCompKept), note: "pay received, less clawbacks, tax and premiums" },
      ...(p.retirementVested >= 0.5 ? [{ op: "+" as const, label: "Employer 401(k), vested by then", value: figure(p.retirementVested) }] : []),
      ...(b.perks >= 0.5 ? [{ op: "+" as const, label: "Perks", value: figure(b.perks) }] : []),
      ...(b.employerHsa >= 0.5 ? [{ op: "+" as const, label: "Employer HSA money", value: figure(b.employerHsa) }] : []),
      ...(b.outOfPocket >= 0.5 ? [{ op: "−" as const, label: "Expected out-of-pocket health costs", value: figure(b.outOfPocket) }] : []),
      { op: "=", label: "Total rewards kept", value: figure(p.totalRewardsKept), rule: "double" },
    ],
    notes, ties: [], uses: [],
  };
}

const RELIEF: Record<"sameYearReversal" | "irc1341Credit" | "noRelief", string> = {
  sameYearReversal: "repaid in the year it was paid, so the wages are reversed and their tax comes back",
  irc1341Credit: "repaid in a later year: over $3,000, the federal IRC 1341 credit returns the federal tax on it; Social Security, Medicare and state tax don't come back",
  noRelief: "repaid in a later year, $3,000 or less: no tax relief",
};

/** L-4: clawbacks owed on the last day picked. */
function repayWork(ctx: WorkContext, letter: L): Work {
  const { panel: p, scope } = panelOf(ctx, letter);
  const owed = p.clawbacks.filter((c) => c.owed > 0);
  if (!owed.length) throw new Error(`Nothing to repay for ${letter} on that day.`);
  const relief = owed.reduce((s, c) => s + c.taxRelief, 0);
  // The total is L-4's figure, rounded once; each clawback is rounded on its own, and the largest takes the rounding, as on a
  // rounded schedule, so the lines add up to it as displayed. Two clawbacks that both round up would otherwise come to a dollar
  // more than the total (FUZZ_SEED=1701905633: 929 + 34,286 under a total of 35,214).
  const total = Math.round(p.clawbackOwed) + 0;
  const shown = owed.map((c) => Math.round(c.owed) + 0);
  const taker = owed.reduce((a, c, i) => (c.owed > owed[a].owed ? i : a), 0);
  shown[taker] = total - shown.reduce((s, v, i) => (i === taker ? s : s + v), 0);
  const tookRounding = shown[taker] !== Math.round(owed[taker].owed);
  return {
    title: `${letter} · clawbacks if you leave`, scope,
    lines: [
      ...owed.map((c, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `${c.award}: ${percent(c.fraction)} of it`,
        note: c.basis === "net" ? "repaid net of tax" : "repaid gross, as paid", value: figure(shown[i]) })),
      ...(owed.length > 1 ? [{ op: "=" as const, label: "Repaid", value: figure(total), rule: "single" as const }] : []),
      { op: "−", label: "Tax relief", value: figure(relief) },
      { op: "=", label: "What repaying costs you", value: figure(total - Math.round(relief)), rule: "double" },
    ],
    notes: [
      ...(tookRounding ? [`Each clawback is rounded once and the total is L-4's, so the largest, ${owed[taker].award}, takes the rounding, `
        + `as on a rounded schedule (its own figure is ${cents(owed[taker].owed)}).`] : []),
      ...owed.map((c) => `${c.award}: ${RELIEF[c.treatment]}.`),
      "A prorated clawback falls as each month of its window is completed; a full one stays whole until the window ends.",
    ],
    ties: [], ...fromInputs(ctx, letter, ["cashAwards"]),
  };
}

/** L-4: what's left behind. */
function forfeitWork(ctx: WorkContext, letter: L, which: "rsu" | "k401"): Work {
  const { panel: p, scope } = panelOf(ctx, letter);
  if (which === "rsu") {
    return {
      title: `${letter} · RSUs not vested`, scope,
      lines: [{ label: "RSUs granted by then but not vested, at grant value", value: figure(p.unvestedRsuForfeited), tick: "recomputed" }],
      notes: ["At grant value: the dollar value when granted, before any share-price growth. Unvested RSUs stay behind when you go."],
      ties: [], ...fromInputs(ctx, letter, equityPaths(ctx, letter)),
    };
  }
  return {
    title: `${letter} · employer 401(k) not vested`, scope,
    lines: [{ label: "Employer 401(k) money credited but not vested", value: figure(p.retirementForfeited), tick: "recomputed" }],
    notes: ["The plan's vesting schedule decides what you keep; what isn't vested on your last day goes back to the plan."],
    ties: [], ...fromInputs(ctx, letter, ["retirement.vesting", "retirement.vestingService"]),
  };
}

/** L-4 and A-4: unused vacation paid on the last day picked: the days banked by then, at the salary that day ÷ 260 (4a). */
function vacationWork(ctx: WorkContext, letter: L): Work {
  const { panel: p, scope } = panelOf(ctx, letter);
  const v = p.vacation;
  if (!(v.paid >= 0.5) || v.annual === null || !v.rule) throw new Error(`No unused vacation is paid to ${letter} on that day.`);
  return {
    title: `${letter} · unused vacation paid out`, scope,
    lines: [
      { label: "Salary on your last day, a year", value: Number.isInteger(v.annual) ? figure(v.annual) : cents(v.annual) },
      { op: "×", label: "Vacation days banked by then", value: `${+v.banked.toFixed(6)}`,
        note: "the days it gives a year less the days you'd take, accrued and used evenly, up to any cap" },
      { op: "÷", label: "Workdays a year, 52 × 5", value: "260" },
      { op: "=", label: "Unused vacation paid out, before tax", value: figure(v.paid), rule: "double" },
    ],
    notes: [paidBecause(v.rule), "It's wages, paid with your last pay as a supplemental payment: its tax is in the tax line of what you keep."],
    ties: [], ...fromInputs(ctx, letter, ["timeOff.gives", "timeOff.vacation", "timeOff.cap", "timeOff.payout", "employerState"]),
  };
}

/** L-4 and A-4: ESPP money put toward a purchase after the last day, given back that day (4i). */
function esppRefundWork(ctx: WorkContext, letter: L): Work {
  const { panel: p, scope } = panelOf(ctx, letter);
  if (!(p.esppRefund >= 0.5)) throw new Error(`No ESPP money comes back to ${letter} on that day.`);
  return {
    title: `${letter} · ESPP money given back`, scope,
    lines: [{ label: "Put toward the next ESPP purchase by your last day", value: figure(p.esppRefund) }],
    notes: ["Leave before a purchase and what you've put toward it comes back that day, in cash, without the purchase's gain. It's your own pay, "
      + "already taxed and in what you keep, so it adds nothing to it."],
    ties: [], ...fromInputs(ctx, letter, ["espp.contributionPct", "espp.offeringMonths", "espp.offeringsStart"]),
  };
}

/** L-4: a bonus that leaving forfeits: what was earned toward it by the last day, and what it pays if you stay. */
function forgoneWork(ctx: WorkContext, letter: L, index: number): Work {
  const { panel: p, scope } = panelOf(ctx, letter);
  const w = p.warnings.flatMap((x) => (x.code === "bonusForfeited" ? [x.params] : []))[index];
  if (!w) throw new Error(`No forfeited bonus ${index + 1} for ${letter} on that day.`);
  const period = periodText(w.periodFrom, w.periodTo);
  const d = w.detail;
  // The salary at the decimals at which it times the rate shown comes to the figure shown; the days as a fraction, exactly. The
  // figure is what they work out to, rounded once (the panel shows the same).
  const earned = bonusWorked(d);
  const rateShown = Number((d.basis === "percentOfSalary" ? d.rate * 100 : 0).toFixed(2)) / 100;
  const lines: WorkLine[] = d.basis === "percentOfSalary"
    ? [{ label: "Salary earned in the period by your last day",
      value: enough(d.salaryEarned, 0, (x) => Math.round(x * rateShown) === Math.round(earned)).text },
      { op: "×", label: "Bonus rate", value: percent(d.rate) },
      { op: "=", label: "Earned toward the bonus", value: figure(earned), rule: "double" }]
    : [{ label: d.basis === "byEmploymentYear" ? `Bonus for employment year ${d.employmentYear}` : "Bonus for the year",
      value: enough(d.amount, 0, (x) => Math.round((x * d.daysEmployed) / d.periodDays) === Math.round(earned)).text },
      { op: "×", label: "Days worked by your last day, of the period's", value: `${d.daysEmployed}/${d.periodDays}` },
      { op: "=", label: "Earned toward the bonus", value: figure(earned), rule: "double" }];
  const full = w.fullDetail.basis === "percentOfSalary"
    ? `${percent(w.fullDetail.rate)} of the ${dollars(w.fullDetail.salaryEarned)} salary for the period`
    : `${dollars(w.fullDetail.amount)} × ${figure(w.fullDetail.daysEmployed)} / ${figure(w.fullDetail.periodDays)} days`;
  return {
    title: `${letter} · the ${period} bonus, earned by ${longDate(p.leaveDate)}`, scope,
    lines,
    notes: [
      `If you stayed through its payout on ${longDate(w.payDate)} it would pay ${dollars(bonusWorked(w.fullDetail))}: ${full}`
        + `${w.periodFrom < (compareStart(ctx, letter) ?? w.periodFrom) ? ", counting from your start" : ""}.`,
      "It's forfeited because the offer pays bonuses only to those employed on the payout date (Bonus › must be employed on the pay date). "
        + "An offer that pays it prorated to your last day would pay the earned part.",
    ],
    ties: [], ...fromInputs(ctx, letter, [bonusPath(ctx, letter), "bonus.payOn", "bonus.mustBeEmployedOnPayDate"]),
  };
}

/** An offer's start date, as entered. */
const compareStart = (ctx: WorkContext, letter: L) => offerByLetter(ctx, letter)?.draft.startDate ?? null;

/** L-4: what staying until the next cliff is worth, and how much of it is the cliff itself. */
function nextWork(ctx: WorkContext, letter: L): Work {
  const { leave, panel: p, scope } = panelOf(ctx, letter);
  const n = p.next;
  if (!n) throw new Error(`Nothing else pays, vests or steps down for ${letter} within the projection.`);
  const cash = leave.basis === "cash";
  // Rounded first, so the column foots as displayed (the panel shows the same rounded figures).
  const now = Math.round(cash ? p.afterTaxCompKept : p.totalRewardsKept);
  const value = Math.round(cash ? n.valueOfStaying.afterTaxComp : n.valueOfStaying.totalRewards);
  const own = Math.round(n.cliffValue);
  const what = cash ? "after-tax pay" : "total rewards";
  return {
    title: `${letter} · staying until ${longDate(n.date)}`, scope,
    lines: [
      { label: `Kept if your last day is ${longDate(n.date)}`, value: figure(now + value) },
      { op: "−", label: `Kept if it's ${longDate(p.leaveDate)}`, value: figure(now), ref: `kept.${letter}` },
      { op: "=", label: `Worth staying for, in ${what}`, value: figure(value), rule: "single" },
      { label: "of which the cliff itself", value: figure(own), ref: `nextown.${letter}` },
      { label: `and pay for the ${figure(n.daysAway)} more days`, value: signed(value - own) },
    ],
    notes: [`The next cliff is ${cliffsText(n.cliffs)}, ${figure(n.daysAway)} days after your last day. A prorated clawback's `
      + "monthly steps on the way count in what staying is worth; they aren't counted as the next cliff."],
    ties: [], uses: [`kept.${letter}`, `nextown.${letter}`],
  };
}

/** L-4: the next cliff's own part: payments after tax, the clawback no longer owed, 401(k) money that vests. */
function nextOwnWork(ctx: WorkContext, letter: L): Work {
  const { panel: p, scope } = panelOf(ctx, letter);
  const n = p.next;
  if (!n) throw new Error(`Nothing else pays, vests or steps down for ${letter} within the projection.`);
  // Before tax, as each cliff is shown, less the tax: what the shown figures leave (audit C20: the tax line was missing).
  const before = n.cliffs.reduce((t, c) => t + Math.round(c.amount), 0);
  const tax = before - Math.round(n.cliffValue);
  return {
    title: `${letter} · the cliff on ${longDate(n.date)}`, scope,
    lines: [
      ...n.cliffs.map((c, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: cliffText(c), note: "before tax", value: figure(c.amount) })),
      ...(n.cliffs.length > 1 ? [{ op: "=" as const, label: "Before tax", value: figure(before), rule: "single" as const }] : []),
      ...(tax ? [{ op: tax > 0 ? "−" as const : "+" as const, label: tax > 0 ? "Tax, at that year's average rate on the offer" : "Tax relief",
        value: figure(Math.abs(tax)) }] : []),
      { op: "=", label: "Its own part, after tax", value: figure(n.cliffValue), rule: "double" },
    ],
    notes: ["A payment counts after tax at that year's average rate on the offer, in the projection where you stay until the cliff, like every "
      + "payment. A clawback that ends counts what you'd no longer repay, net of tax relief; 401(k) money counts as it vests."],
    ties: [], uses: [],
  };
}

/** L-4: your stay after tax, as paid: what L-1 counts on the after-tax basis. */
function stayAfterWork(ctx: WorkContext, letter: L): Work {
  const r = res(ctx);
  const n = shownStay(detailOf(ctx, letter), r.view.row.years).stay;
  return {
    title: `${letter} · your stay after tax, as paid`, scope: `Base case · stay ${years(r.view.row.years)} (${windowText(r.view.row)}) · not discounted`,
    lines: [
      { label: "Pay in your stay", value: figure(n.gross) },
      { op: "−", label: "Tax", note: "its last calendar year as though pay continued through December", value: figure(n.tax) },
      ...(n.premiums ? [{ op: "−" as const, label: "Health premiums", value: figure(n.premiums) }] : []),
      { op: "=", label: "After-tax pay, as paid", value: figure(n.cash), rule: "double" },
    ],
    notes: [
      "The stay is a stretch of time to compare offers over, not a leave date: its last calendar year is taxed as though you kept earning at "
        + "the same rate through December, as at a similar next job, so a short last year isn't taxed at an artificially low rate.",
      "L-1 shows this on the after-tax basis (its table's “Your stay, as paid”), and its breakdown's A-7 year by year.",
    ],
    ties: [...(r.view.basis === "cash" ? [`eysum.${letter}` as const] : []), `l6s.${letter}.cash.stay`], uses: [],
  };
}

/** L-4: leaving on your stay's last day vs the stay as L-1 counts it, after tax. */
function reconWork(ctx: WorkContext, letter: L): Work {
  const { leave, panel: p } = panelOf(ctx, letter);
  if (p.leaveDate !== leave.stayEnd) throw new Error("Move the last day to the end of your stay to see this.");
  const d = detailOf(ctx, letter);
  const r = reconcile(p, d.window, shownStay(d, res(ctx).view.row.years).stay);
  const R = Math.round;
  const diff = R(r.kept) - R(r.stay);
  const shown = (x: number) => Math.abs(x) >= 0.5;
  // The tax line is the remainder of the displayed figures, so the column foots as displayed.
  const tax = diff - (shown(r.pay) ? R(r.pay) : 0) - (shown(r.premiums) ? R(r.premiums) : 0) + (shown(r.clawback) ? R(r.clawback) : 0);
  return {
    title: `${letter} · leaving on ${longDate(p.leaveDate)} vs your stay`, scope: `Your stay's last day · after tax, as paid`,
    lines: [
      { label: "Kept if you leave that day", value: figure(r.kept), ref: `kept.${letter}` },
      { op: "−", label: "Your stay, as L-1 counts it", value: figure(r.stay), ref: `stayafter.${letter}` },
      { op: "=", label: "Difference", value: signed(diff), rule: "single" },
      { label: `Tax the stay counts in ${r.year} that leaving doesn't`, value: signed(tax) },
      ...(shown(r.pay) ? [{ op: "+" as const, label: "Pay after you leave, which the stay doesn't count", value: signed(r.pay) }] : []),
      ...(shown(r.premiums) ? [{ op: "+" as const, label: "Premiums the stay counts that leaving doesn't", value: signed(r.premiums) }] : []),
      ...(shown(r.clawback) ? [{ op: "−" as const, label: "Clawbacks repaid (their tax relief is in the tax line)", value: figure(r.clawback),
        ref: `repay.${letter}` as MetricId }] : []),
      { op: "=", label: "Difference", value: signed(diff), rule: "double" },
    ],
    notes: [
      `Both stop pay on ${longDate(p.leaveDate)}. The stay taxes ${r.year} as though pay continued through December, at a similar next job; `
        + `leaving taxes only what was paid in ${r.year}, at the lower rate a part year brings.`,
    ],
    ties: [], uses: [`kept.${letter}`, `stayafter.${letter}`],
  };
}

// ---- A-6: withholding (L-5 until stop 5B) ----------------------------------------------------------------------

/** A-6: federal tax a year's withholding falls short of: due the next April. */
function withholdingWork(ctx: WorkContext, letter: L, year: number): Work {
  const y = breakdownOf(ctx, letter).detail.withholding.years.find((x) => x.year === year);
  if (!y) throw new Error(`No ${year} withholding for ${letter} in your stay.`);
  const p = withholdingParts(y);
  const status = { single: "single", joint: "married filing jointly", headOfHousehold: "head of household" }[ctx.household.filingStatus];
  const espp = breakdownOf(ctx, letter).detail.espps.some((x) => Number(x.date.slice(0, 4)) === year);
  return {
    title: `${letter} · federal withholding on ${year} pay`, scope: `Base case · ${year} · federal income tax only`,
    lines: [
      { label: `Federal income tax on the offer's ${year} pay`, note: "household tax with the offer, less without it", value: figure(p.tax) },
      { op: "−", label: "Withheld from salary", note: `the IRS percentage method, a ${status} Form W-4 with nothing else on it`, value: figure(p.regular) },
      { op: "−", label: "Withheld from bonuses, RSU vests and cash awards", note: "22% (37% on supplemental pay over $1 million)",
        value: figure(p.supplemental) },
      { op: "=", label: p.short >= 0 ? `Owed when you file, April ${year + 1}` : `Refunded when you file, April ${year + 1}`, value: figure(Math.abs(p.short)),
        rule: "double" },
    ],
    notes: [
      "Totals elsewhere count the tax you owe, not what's withheld: this is about cash timing. Bonuses and RSU vests are withheld at the flat "
        + "supplemental rate, often below your real rate on them, so the difference comes due in April.",
      ...(espp ? ["An ESPP purchase's gain isn't withheld at all: no withholding is required on it (IRC 421(b)), so its tax is all in what's owed."] : []),
      "Raising your withholding on Form W-4, or paying estimated tax, spreads it out. State withholding, other jobs' withholding and the "
        + "estimated-tax safe harbors aren't estimated here.",
    ],
    ties: [], ...fromInputs(ctx, letter, ["salary.annual", bonusPath(ctx, letter)]),
  };
}

function averageWork(ctx: WorkContext, letter: L, basis: ValueBasis): Work {
  const row = res(ctx).view.row;
  const i = indexOf(ctx, letter);
  if (!row.hours || !row.nominal[basis]) throw new Error("Needs hours for every offer.");
  return {
    title: `${letter} · per hour worked, ${phrase(ctx, basis)}`, scope: `Base case · stay ${years(row.years)} · nominal`,
    lines: (() => {
      const avg = row.nominal[basis]![i] / row.hours![i];
      const q = quotient(row.nominal[basis]![i], row.hours![i], avg, 100);
      return [
        { label: `${row.years}-year total ${phrase(ctx, basis)}, as paid`, value: q.num },
        { op: "÷", label: "Hours worked in the window", value: q.den },
        { op: "=", label: "Per hour worked, on average", value: cents(avg), rule: "double" },
      ] as WorkLine[];
    })(),
    notes: ["The average over every hour worked, to set against what the extra hours pay."],
    ties: [], ...fromInputs(ctx, letter, HOURS_INPUTS),
  };
}

function partWork(ctx: WorkContext, letter: L, part: PvPart): Work {
  const r = res(ctx);
  const w = detailOf(ctx, letter).window;
  const [nominal] = partValues(w, part);
  const { shown, engine } = shownPart(ctx, letter, part);
  const p = PART[part];
  return {
    title: `${letter} · ${lowerFirst(p.label)} over your stay`, scope: `Base case · stay ${years(r.view.row.years)} (${windowText(r.view.row)})`,
    lines: [
      { label: "As paid (nominal)", value: figure(nominal) },
      { label: `Present value today, at ${percent(r.sweep.discountRate)} a year`, value: figure(shown), rule: "single" },
    ],
    notes: [
      `${p.label}: ${p.gloss}.`,
      ...(shown !== Math.round(engine) ? [`Shown so its total adds up as displayed: it takes the rounding there (the engine's ${cents(engine)}).`] : []),
      nominal ? `Each amount is discounted from its date to today, ${longDate(r.sweep.valuationDate)}: `
        + `$1 paid a year from now is worth $${(1 / (1 + r.sweep.discountRate)).toFixed(4)} today.` : "None entered for this offer.",
    ],
    ties: [], uses: part === "rent" ? [`in.${letter}.costOfLiving.monthlyRent`] : part === "gross" ? [`in.${letter}.salary.annual`, `in.${letter}.bonus.amount`] : [],
  };
}

function partValues(w: WindowTotals, part: PvPart): [number, number] {
  const cash = (k: keyof CashTotals): [number, number] => [w.nominal[k], w.presentValue![k]];
  const col = (k: "savings" | "rent" | "faceValue"): [number, number] =>
    [w.costOfLiving?.nominal[k] ?? 0, w.costOfLiving?.presentValue?.[k] ?? 0];
  switch (part) {
    case "gross": case "tax": case "premiums": case "takeHome": return cash(part);
    case "retirement": case "perks": return [w.benefits.nominal[part], w.benefits.presentValue![part]];
    case "healthExtra": return [w.benefits.nominal.healthNet - w.nominal.premiums, w.benefits.presentValue!.healthNet - w.presentValue!.premiums];
    case "savings": case "rent": case "faceValue": return col(part);
  }
}

/** A BEA index: the prices picked ("Prices in", `ref`) or an offer's city's (`area`). Each step is shown exactly, so it foots. */
function rppWork(ctx: WorkContext, letter: L, which: "ref" | "area"): Work {
  const d = detailOf(ctx, letter);
  const info = d.costOfLiving;
  if (!info) throw new Error(`Offer ${letter} needs a city.`);
  const p: RppUsed = which === "ref" ? info.reference : info.area;
  const x = indexes(d);
  const name = p.code === "00000" ? "United States" : p.name;
  // 0.16 x an index with 3 decimals has at most 5, and so does all items less it: exact, shown without trailing zeros.
  const housing = HOUSING_WEIGHT * p.housing;
  return {
    title: `${name} · non-housing prices`, scope: `BEA Regional Price Parities, ${info.rppVintage.dataYear} · U.S. all items = 100`,
    lines: [
      { label: "All items", value: p.allItems.toFixed(3), tick: "traced" },
      { op: "−", label: "0.16 × housing rents", value: indexText(housing, 5), note: `housing rents ${p.housing.toFixed(3)}`, tick: "traced" },
      { op: "=", label: "Everything but rent, weighted", value: indexText(p.allItems - housing, 5), rule: "single" },
      { op: "÷", label: "Its weight", value: "0.84" },
      { op: "=", label: "Non-housing prices", value: which === "ref" ? x.ref : x.area, rule: "double" },
    ],
    notes: [
      `Traced to BEA's Regional Price Parities: all items and housing rents are BEA's published indexes for ${name}, `
        + `${info.rppVintage.dataYear}. ${info.rppVintage.release}`,
      "Rent is counted separately, at what you'd pay, so only prices other than rent restate your spending. 16% is housing rents' share of BEA's price weights.",
      ...(x.digits > 3 ? [`Shown to ${x.digits} decimals, where 3 wouldn't multiply out to the dollars in ${letter}'s derivations.`] : []),
      ...(which === "ref" ? [pricesOf(ctx).us ? "The U.S. average is the default under Prices in (About you)."
        : `${shortCity(p.name)} is the place picked under Prices in (About you): its own price factor is 1.`] : []),
    ],
    ties: [], uses: which === "area" ? [`in.${letter}.costOfLiving.area`] : ["about.prices"],
  };
}

// ---- pay per extra hour --------------------------------------------------------------------------

function extraWork(ctx: WorkContext, more: L, fewer: L, focus: "hours" | ValueBasis): Work {
  const row = res(ctx).view.row;
  const m = indexOf(ctx, more);
  const f = indexOf(ctx, fewer);
  const pair = row.extraHours.find((x) => x.more === m && x.fewer === f);
  if (!pair || !row.hours) throw new Error("These offers' hours don't differ enough to compare.");
  const n = row.years;
  // Hours and dollars at the decimals at which every line works out as shown: the extra hours a year, and what each pays.
  const v = focus === "hours" ? null : row.nominal[focus]!;
  const rate = focus === "hours" ? undefined : pair.perExtraHour[focus];
  let hm = 0, hf = 0, j = 0, vm = 0, vf = 0, k = 0;
  search: for (j = 0; j <= 4; j++) {
    hm = Number(row.hours[m].toFixed(j));
    hf = Number(row.hours[f].toFixed(j));
    if (Math.round((hm - hf) / n) !== Math.round(pair.hoursPerYear)) continue;
    if (!v) break;
    for (k = 0; k <= 2; k++) {
      vm = Number(v[m].toFixed(k));
      vf = Number(v[f].toFixed(k));
      if (rate !== undefined ? Math.round(((vm - vf) / (hm - hf)) * 100) === Math.round(rate * 100)
        : Math.round((vm - vf) / n) === Math.round(pair.gapPerYear[focus as ValueBasis]!)) break search;
    }
  }
  if (j > 4) { j = 4; hm = row.hours[m]; hf = row.hours[f]; }
  if (v && k > 2) { k = 2; vm = v[m]; vf = v[f]; }
  const lines: WorkLine[] = [
    { label: `${more}: hours worked in your stay`, value: decimals(hm, j) },
    { op: "−", label: `${fewer}: hours worked`, value: decimals(hf, j) },
    { op: "=", label: "Extra hours", value: decimals(hm - hf, j), rule: "single" },
    { op: "÷", label: `${n} ${n === 1 ? "year" : "years"}`, value: String(n) },
    { op: "=", label: "Extra hours a year", value: figure(pair.hoursPerYear), rule: "double" },
  ];
  const notes = ["Nominal, like per hour: dollars as paid over your stay, not present values."];
  if (focus !== "hours" && v) {
    const gap = vm - vf;
    lines.push(
      { label: `${more}: ${n}-year total ${phrase(ctx, focus)}, as paid`, value: decimals(vm, k), rule: "single" },
      { op: "−", label: `${fewer}: the same`, value: decimals(vf, k) },
      { op: "=", label: gap >= 0 ? `${more} pays more` : `${more} pays less`, value: decimals(gap, k), rule: "single" },
      ...(rate !== undefined
        ? [{ op: "÷" as const, label: "Extra hours", value: decimals(hm - hf, j) },
          { op: "=" as const, label: "Each extra hour pays", value: cents(rate), rule: "double" as const }]
        : [{ op: "÷" as const, label: `${n} ${n === 1 ? "year" : "years"}`, value: String(n) },
          { op: "=" as const, label: "A year", value: signed(pair.gapPerYear[focus]!), rule: "double" as const }]),
    );
    notes.push(rate !== undefined
      ? `Compare it with ${more}'s average per hour on the same basis: if the extra hours pay less than the average, they're cheaper hours.`
      : `${more} asks more hours and pays less ${phrase(ctx, focus)}, so there's no per-hour figure: the extra hours cost you money on this basis.`);
  }
  return {
    title: `${more}'s extra hours, against ${fewer}${focus === "hours" ? "" : ` · ${phrase(ctx, focus)}`}`,
    scope: `Base case · stay ${years(n)} (${windowText(row)}) · nominal`,
    lines, notes, ties: [], ...joinInputs(fromInputs(ctx, more, ["hours.weekly"]), fromInputs(ctx, fewer, ["hours.weekly"])),
  };
}

// ---- L-1: by year ------------------------------------------------------------------------------

const BASIS_TOTAL_LINE: Record<ValueBasis, BridgeLine> = { cash: "afterTax", totalRewards: "totalRewards", colAdjustedTotal: "total" };

function yearWork(ctx: WorkContext, letter: L, n: number): Work {
  const r = res(ctx);
  const y = shownYearOf(ctx, letter, n);
  const basis = r.view.basis;
  const scope = `Base case · year ${n} (${longDate(y.start)} – ${longDate(dayBefore(y.end))}) · dollars as paid that year`;
  const br = (line: BridgeLine) => `br.${letter}.${n}.${line}` as MetricId;
  // L-1's year is the comparison's projection, so its lines are too. A later-starting offer is projected again over the comparison's
  // window, which cuts its pay into other pieces: a figure on a half dollar can round apart from its breakdown's (A-2's bridge), so a
  // line opens A-2's figure only where the two read the same.
  const b = bridge(ctx, letter, n, "comparison");
  const own = bridge(ctx, letter, n);
  const row = (line: BridgeLine) => b.rows.find((x) => x.line === line);
  const lineFor = (line: BridgeLine, op?: WorkLine["op"]): WorkLine[] => {
    const x = row(line);
    const same = own.rows.find((r) => r.line === line && Math.round(r.value) === Math.round(x?.value ?? NaN));
    return x ? [{ ...(op ? { op } : {}), label: x.label[0].toUpperCase() + x.label.slice(1), value: figure(Math.abs(x.value)),
      ...(same ? { ref: br(line) } : {}) }] : [];
  };
  const signedLine = (line: BridgeLine): WorkLine[] => {
    const x = row(line);
    return x ? lineFor(line, x.value < 0 ? "−" : "+") : [];
  };
  if (basis === "perHour") {
    const of = r.sweep.perHourOf;
    const total = of === "colAdjustedTotal" ? y.col?.total : y.totalRewards;
    if (total === undefined || !y.hours) throw new Error("Needs hours and a city for this offer.");
    // As the dollar bases' lines: it opens A-2's total, and ties to A-7's per hour, only where they read the same (FUZZ_SEED=1822257924:
    // a later start's year 1 read 50,151 here and 50,152 in A-2).
    const same = own.rows.some((x) => x.line === BASIS_TOTAL_LINE[of] && Math.round(x.value) === Math.round(total));
    return {
      title: `${letter} · year ${n} · ${phrase(ctx, "perHour")}`, scope,
      lines: [
        { label: `Year ${n} ${phrase(ctx, of)}`, value: figure(total), ...(same ? { ref: br(BASIS_TOTAL_LINE[of]) } : {}) },
        { op: "÷", label: "Hours worked in the year", value: figure(y.hours), ref: `l6y.${letter}.hours.${n}` },
        { op: "=", label: "Per hour worked", value: cents(total / y.hours), rule: "double" },
      ],
      notes: ["Each year is in that year's dollars; the verdict's figures are for the whole stay."],
      ties: same ? [`l6y.${letter}.${of === "colAdjustedTotal" ? "totalHour" : "totalRewardsHour"}.${n}`] : [], ...fromInputs(ctx, letter, HOURS_INPUTS),
    };
  }
  const value = yearValue(y, basis, r.sweep.perHourOf)!;
  const lines: WorkLine[] = basis === "cash"
    ? [...lineFor("paid"), ...signedLine("tax"), ...signedLine("premiums")]
    : basis === "totalRewards"
      ? [...lineFor("afterTax"), ...signedLine("retirement"), ...signedLine("perks"), ...signedLine("hsa"), ...signedLine("oop")]
      : [...lineFor("totalRewards"), ...signedLine("rent"), ...signedLine("prices")];
  lines.push({ op: "=", label: totalName(ctx, basis)[0].toUpperCase() + totalName(ctx, basis).slice(1), value: figure(value), rule: "double" });
  return {
    title: `${letter} · year ${n} · ${totalName(ctx, basis)}`, scope,
    lines,
    notes: ["Each year is in that year's dollars, as paid; the verdict discounts every payment to today. Its breakdown's A-2 has the bridge, every "
      + "line, and A-7 every payment behind it."],
    // It ties to its breakdown's year (A-2's bridge, A-7's table) where they read the same.
    ties: own.rows.some((r) => r.line === BASIS_TOTAL_LINE[basis] && Math.round(r.value) === Math.round(value))
      ? [br(BASIS_TOTAL_LINE[basis]), `l6y.${letter}.${L6_BASIS_LINE[basis as ValueBasis]}.${n}`] : [], uses: [],
  };
}

function runningWork(ctx: WorkContext, letter: L, n: number): Work {
  const b = byYear(ctx, letter);
  const upTo = b.years.filter((y) => y.n <= n);
  return {
    title: `${letter} · running total through year ${n}`, scope: `Base case · ${totalName(ctx, res(ctx).view.basis as ValueBasis) ?? ""} · dollars as paid`,
    lines: [
      ...upTo.map((y, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Year ${y.n}`, value: figure(y.value), ref: `ey.${letter}.${y.n}` })),
      { op: "=", label: `Through year ${n}`, value: figure(upTo.reduce((s, y) => s + y.value, 0)), rule: "double" },
    ],
    notes: ["The running total shows when one offer catches up with another. It's as paid, not discounted."],
    ties: [], uses: upTo.map((y) => `ey.${letter}.${y.n}` as MetricId),
  };
}

function yearsSumWork(ctx: WorkContext, letter: L): Work {
  const b = byYear(ctx, letter);
  if (b.sum === null || b.window === null) throw new Error("Per hour doesn't add up across years.");
  const basis = res(ctx).view.basis as ValueBasis;
  const after = b.sum - b.window;
  return {
    title: `${letter} · your stay, year by year`, scope: `Base case · ${totalName(ctx, basis)} · dollars as paid`,
    lines: [
      ...b.years.map((y, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Year ${y.n}`, value: figure(y.value), ref: `ey.${letter}.${y.n}` })),
      { op: "=", label: "The years, added", value: figure(b.sum), rule: after ? "single" : "double" },
      ...(after ? [{ op: "−" as const, label: "After your stay's last day (not counted)", value: signed(after),
        ...(sameStay(ctx, letter) ? { ref: `l6s.${letter}.${basis}.after` as MetricId } : {}) },
        { op: "=" as const, label: "Your stay, as paid", value: figure(b.window), rule: "double" as const }] : []),
    ],
    notes: [
      after ? afterStayNote(ctx, letter) : "The years add up to your stay's total as paid.",
      "The rank list's figure is lower: it discounts each payment to today.",
    ],
    ties: sameStay(ctx, letter) ? [`l6s.${letter}.${basis}.stay`] : [], uses: b.years.map((y) => `ey.${letter}.${y.n}` as MetricId),
  };
}

/** Why an offer's years 1 through its own stay run past its last day: a payment on the anniversary after it. */
function ownAfterStayNote(ctx: WorkContext, letter: L): string {
  const b = breakdownOf(ctx, letter);
  return `A payment on ${longDate(b.window.end)}, the anniversary after its stay's last day, belongs to year ${b.years} but falls after the stay: `
    + "it isn't counted.";
}

/** Why an offer's years 1 through your stay run past its last day. */
function afterStayNote(ctx: WorkContext, letter: L): string {
  const r = res(ctx);
  const d = detailOf(ctx, letter);
  const last = d.employmentYears[r.view.row.years - 1];
  return last && last.end > r.view.row.window.end
    ? `${letter} starts after the earliest offer, so its year ${r.view.row.years} runs past your stay's last day, ${longDate(dayBefore(r.view.row.window.end))}: `
      + "that part isn't counted."
    : `A payment on ${longDate(r.view.row.window.end)}, the anniversary after your stay's last day, belongs to year ${r.view.row.years} but falls after the stay: `
      + "it isn't counted.";
}

// ---- the bridge: offer letter to after rent ------------------------------------------------------

function bridgeWork(ctx: WorkContext, letter: L, n: number, line: BridgeLine): Work {
  const b = bridge(ctx, letter, n);
  const d = breakdownOf(ctx, letter).detail;
  const y = ownShownYear(ctx, letter, n);
  const o = offerByLetter(ctx, letter);
  // After rent, the figures are in the dollars they're at, and the scope says so (condition 1): its own city's to the own-price line
  // and the month under it, the prices picked from the prices line on.
  const money = ["own", "spend", "saved", "inEspp"].includes(line) ? `${b.city} dollars` : ["total", "prices"].includes(line) ? pricesOf(ctx).dollars : "dollars";
  const scope = `Base case · year ${n} (${longDate(b.start)} – ${longDate(dayBefore(b.end))}) · ${money} as paid that year`;
  const title = (what: string) => `${letter} · year ${n} · ${what}`;
  const traced = o?.sample ? "Traced to a sample input (illustrative, not market data)." : "As you entered it.";
  const row = b.rows.find((r) => r.line === line);
  const basis = ctx.results?.view.basis;
  /** The same figure in A-7's table. */
  const l6 = (l: L6Line): MetricId => `l6y.${letter}.${l}.${n}`;
  const tieIf = (bases: Basis[], l: L6Line): MetricId[] =>
    [...(basis && bases.includes(basis) && ctx.results?.letters.includes(letter) ? [`ey.${letter}.${n}` as MetricId] : []), l6(l)];

  // A subtotal foots the lines since the one before it.
  if (row && (row.kind === "subtotal" || row.kind === "total")) {
    const at = b.rows.indexOf(row);
    let from = at - 1;
    while (from > 0 && b.rows[from].kind !== "subtotal" && b.rows[from].kind !== "letter") from--;
    const lines: WorkLine[] = b.rows.slice(from, at).map((r, i): WorkLine => ({
      ...(i ? { op: r.value < 0 ? "−" as const : "+" as const } : {}), label: r.label[0].toUpperCase() + r.label.slice(1),
      value: figure(i ? Math.abs(r.value) : r.value), ref: r.id,
    }));
    lines.push({ op: "=", label: row.label, value: figure(row.value), rule: "double" });
    return {
      title: title(lowerFirst(row.label)), scope, lines,
      notes: [line === "paid" ? "Footed: the offer letter, line by line to what's paid in the year." : "Footed: the lines above it, added."],
      ties: line === "paid" ? [l6("gross")] : line === "afterTax" ? tieIf(["cash"], "afterTax")
        : line === "totalRewards" ? tieIf(["totalRewards"], "totalRewards") : line === "total" ? tieIf(["colAdjustedTotal"], "total") : [],
      uses: [],
    };
  }
  const q = y.quoted;
  switch (line) {
    case "letter":
      return {
        title: title("the offer letter"), scope,
        lines: [
          { label: "Salary at the year's start", value: figure(q.salary), ref: `in.${letter}.salary.annual` },
          ...(q.bonus ? [{ op: "+" as const, label: "Target bonus on it", value: figure(q.bonus), ref: `in.${letter}.bonus.amount` as MetricId }] : []),
          ...(q.cash ? [{ op: "+" as const, label: "Cash awards paid in the year", value: figure(q.cash), ref: `in.${letter}.cashAwards` as MetricId }] : []),
          ...(q.rsu ? [{ op: "+" as const, label: "New-hire RSUs due in the year, at grant value", value: figure(q.rsu),
            ref: `in.${letter}.equity.grants` as MetricId }] : []),
          { op: "=", label: "The offer letter's year", value: figure(q.letter), rule: "double" },
        ],
        notes: ["What an offer letter quotes: no proration, payout timing, company vest dates, share-price growth or refreshers. The lines under it in the bridge are those differences."],
        ties: [], ...fromInputs(ctx, letter, ["salary.annual", bonusPath(ctx, letter), ...(q.cash ? ["cashAwards"] : []), ...(q.rsu ? ["equity.grants"] : [])]),
      };
    case "salary": case "cash":
      return {
        title: title(line === "salary" ? "salary" : "cash awards"), scope,
        lines: [
          { label: `Paid in year ${n}`, value: figure(y[line]), ref: l6(line) },
          { op: "−", label: "In the offer letter", value: figure(q[line]) },
          { op: "=", label: "Difference", value: signed(y[line] - q[line]), rule: "double" },
        ],
        notes: [line === "salary" ? "Salary accrues by calendar month at the rate in effect, so a raise during the year shows here."
          : "Cash awards count in the year they're paid."],
        ties: [], ...fromInputs(ctx, letter, line === "salary" ? ["salary.annual", "salary.raise", "salary.raiseOn", "salary.promotions"] : ["cashAwards"]),
      };
    case "bonus": {
      const paid = d.bonuses.filter((x) => x.ey === n);
      return {
        title: title("bonus"), scope,
        lines: [
          { label: `Bonus paid in year ${n}`, value: figure(y.bonus), ...(paid.length ? { ref: l6("bonus"),
            note: paid.map((p) => `paid ${longDate(p.date)} for ${longDate(workedFrom(d, p.periodFrom))} – ${longDate(p.periodTo)}`).join("; ") } : {}) },
          { op: "−", label: "Target bonus in the offer letter", value: figure(q.bonus), ref: `in.${letter}.bonus.amount` },
          { op: "=", label: "Difference", value: signed(y.bonus - q.bonus), rule: "double" },
        ],
        notes: [
          "Bonuses are paid once a year for the work before it, so the first one covers only the months you've worked, and each year's payout is for the year before.",
        ],
        ties: [], ...fromInputs(ctx, letter, [bonusPath(ctx, letter), "bonus.payOn", "bonus.periodStart",
          ...(o?.draft.bonus.cutoff ? ["bonus.cutoff"] : [])]),
      };
    }
    case "rsu": {
      const vests = d.rsus.filter((v) => v.ey === n);
      const vestText = (v: (typeof vests)[number]) => `${v.refresher ? "a refresher's" : "the new-hire grant's"} tranche ${v.tranche} of ${v.tranches} on `
        + `${longDate(v.date)}${v.nominalDate ? ` (due ${longDate(v.nominalDate)}; it vests on the company's next vest date)` : ""}`
        + `${Math.abs(v.priceFactor - 1) > 1e-9 ? `, × ${v.priceFactor.toFixed(4)} share-price growth` : ""}`;
      return {
        title: title("RSUs"), scope,
        lines: [
          { label: `RSUs vested in year ${n}`, value: figure(y.rsu), ...(vests.length ? { ref: l6("rsu") } : {}) },
          { op: "−", label: "New-hire RSUs due in the letter's year", value: figure(q.rsu), ref: `in.${letter}.equity.grants` },
          { op: "=", label: "Difference", value: signed(y.rsu - q.rsu), rule: "double" },
        ],
        notes: [
          ...(vests.length ? [`Vested in year ${n}: ${join(vests.map(vestText))}.`] : []),
          "RSUs count as pay on the day they vest and are assumed sold then. The letter counts each tranche on its schedule's date at grant value; "
            + "the company vests on its own dates, with share-price growth, and refreshers come on top.",
        ],
        ties: [], ...fromInputs(ctx, letter, equityPaths(ctx, letter)),
      };
    }
    case "espp": {
      const buys = d.espps.filter((p) => p.ey === n);
      return {
        title: title("ESPP gain"), scope,
        lines: [
          { label: `ESPP gain in year ${n}`, value: figure(y.espp), ...(buys.length ? { ref: l6("espp") } : {}) },
          { op: "−", label: "In the offer letter", value: "0" },
          { op: "=", label: "Difference", value: signed(y.espp), rule: "double" },
        ],
        notes: [
          ...(buys.length ? [`Bought ${join(buys.map((p) => longDate(p.date)))}.`] : []),
          "An offer letter doesn't quote an ESPP. Each purchase buys company stock at a discount with money put aside from pay; here it's sold the "
            + "same day, so the gain is pay, taxed as income but not Social Security or Medicare. What you put in is yours already: it's in your pay.",
        ],
        ties: [], ...fromInputs(ctx, letter, ESPP_INPUTS),
      };
    }
    case "clawback":
      return { title: title("clawback"), scope, lines: [{ label: "Repaid", value: figure(-y.clawback), ref: l6("clawback") }],
        notes: ["A sign-on or other award repaid on leaving early."], ties: [], uses: [] };
    case "tax": {
      const split = d.split.filter((s) => s.ey === n).sort((a, z) => a.year - z.year);
      const rates = d.taxYears.filter((t) => split.some((s) => s.year === t.year));
      const st = o?.draft.residence.state ?? "State";
      const city = o ? cityTax(o.draft) : null;
      const local = city ? CITY_TAX[city].line : "local";
      return {
        title: title("tax"), scope,
        lines: [
          ...split.map((s, i): WorkLine => {
            const t = d.taxYears.find((x) => x.year === s.year);
            return { ...(i ? { op: "+" as const } : {}), label: `On ${toCent(s.gross)} paid in ${s.year}`, note: t ? `at ${rate2(t.rate)}` : undefined, value: toCent(s.tax) };
          }),
          { op: "=", label: `Tax in year ${n}, to the dollar`, value: figure(y.tax), rule: "double" },
        ],
        notes: [
          "Each payment is taxed at its calendar year's rate for this offer: household tax with the offer minus without it, divided by the offer's pay that year. "
            + `Each payment's tax is to the cent; ${letter}-7 lists them.`,
          ...rates.map((t) => `${t.year}: ${rate2(t.rate)} of ${figure(t.gross)} = federal income tax ${rate2(t.parts.federal / t.gross)}, `
            + `Social Security and Medicare ${rate2(t.parts.fica / t.gross)}, ${st} ${rate2(t.parts.state / t.gross)}`
            + `${t.parts.local ? `, ${local} ${rate2(t.parts.local / t.gross)}` : ""}${t.projectedLaw ? " (tax law projected from 2026)" : ""}.`),
        ],
        ties: [l6("tax")], ...fromInputs(ctx, letter, ["costOfLiving.area"]),
      };
    }
    case "premiums": case "perks": case "hsa": case "oop": {
      const v = y[line];
      const what = { premiums: "your health premiums", perks: "perks", hsa: "the employer's HSA money", oop: "expected out-of-pocket health costs" }[line];
      return {
        title: title(what), scope, lines: [{ label: what[0].toUpperCase() + what.slice(1), value: figure(v), tick: "traced" }],
        notes: [traced, line === "oop"
          ? `Your own estimate at ${ctx.household.healthUsage ?? "medium"} use, capped at the out-of-pocket maximum; held flat each year.`
          : "Held flat each year."],
        ties: [l6(line)], ...fromInputs(ctx, letter, { premiums: ["health.premium"], perks: ["perks.section127", "perks.commuterMonthly"],
          hsa: ["health.employerHsa"], oop: ["health.outOfPocket", "health.oopMax"] }[line]),
      };
    }
    case "retirement":
      return { ...retirementLines(ctx, letter, y), title: title("employer 401(k)"), scope, ties: [l6("employer")] };
    case "rent":
      return { ...rentLines(ctx, letter, y), title: title("rent"), scope, ties: [l6("rent")] };
    case "prices": {
      const c = y.col!;
      const x = indexes(d);
      const place = pricesOf(ctx).place;
      return {
        title: title(`${x.city} prices`), scope,
        lines: [
          { label: `Spending after rent, at ${x.city} prices`, value: figure(c.local), ref: l6("local") },
          ...priceLines(ctx, d, letter),
          { op: "=", label: `The same, at ${place} prices`, value: figure(c.atRef), rule: "single", ref: l6("atRef") },
          { op: "−", label: `At ${x.city} prices`, value: figure(c.local) },
          { op: "=", label: "Spending, restated", value: signed(c.atRef - c.local), rule: "single" },
          ...(y.oop ? [{ op: "+" as const, label: `Out-of-pocket health costs at ${x.city} prices, less at ${place} prices`,
            note: `${figure(y.oop)} − ${figure(c.oopRef)}`, value: signed(y.oop - c.oopRef) }] : []),
          { op: "=", label: `${x.city} prices`, value: signed(c.atRef - c.local + y.oop - c.oopRef), rule: "double" },
        ],
        notes: ["Only spending money is restated: what's left after tax, your 401(k) and HSA, planned savings and rent, and the health costs that come out of it. "
          + "Money you save counts at face value, and rent is already what you'd pay."],
        ties: [], uses: [`in.${letter}.costOfLiving.area`],
      };
    }
    case "inEspp":
      return {
        title: title("held in the ESPP, a month"), scope,
        lines: [
          { label: `ESPP money held at the end of year ${n}`, value: figure(y.esppHeld), ref: `a2.${letter}.${n}.espp` },
          { op: "÷", label: "Months", value: "12" },
          { op: "=", label: "A month", value: dollars(b.inEspp ?? 0), rule: "double" },
        ],
        notes: ["What's been put into the plan and hasn't yet bought shares or come back: yours, at face value, but not yet to spend."],
        ties: [], uses: [],
      };
    case "spend": case "saved": {
      const c = y.col!;
      const own: MetricId[] = n === 1 ? [`own.${letter}.${line === "spend" ? "y1spend" : "y1saved"}`] : [];
      return line === "spend"
        ? { title: title("spending money a month"), scope,
          lines: [
            { label: `Spending money after rent, at ${b.city} prices, year ${n}`, note: "after rent and health costs", value: figure(c.local - y.oop),
              ref: `a2.${letter}.${n}.spend` },
            { op: "÷", label: "Months", value: "12" },
            { op: "=", label: "A month", value: dollars(b.spend!), rule: "double" },
          ],
          notes: [`What's left each month for everything but rent and health costs, in ${b.city} dollars.`], ties: own, uses: [] }
        : { title: title("saved a month"), scope,
          lines: [
            ...(y.esppHeld
              ? [{ label: `At face value in year ${n}`, value: figure(c.face), ref: l6("face") },
                { op: y.esppHeld < 0 ? "+" as const : "−" as const, label: "ESPP money held", value: figure(Math.abs(y.esppHeld)), ref: `a2.${letter}.${n}.espp` as MetricId },
                { op: "=" as const, label: `Saved in year ${n}`, value: figure(c.face - y.esppHeld), rule: "single" as const }]
              : [{ label: `Saved in year ${n}, at face value`, value: figure(c.face), ref: l6("face") }]),
            { op: "÷", label: "Months", value: "12" },
            { op: "=", label: "A month", value: dollars(b.saved!), rule: "double" },
          ],
          notes: ["Your 401(k) and HSA contributions, the vested match, employer HSA money, perks and planned savings: money not spent locally."
            + `${y.esppHeld ? " ESPP money held at the year's end is at face value too, but it isn't saved: it's on its own line." : ""}`],
          ties: own, uses: [] };
    }
  }
  throw new Error(`No ${line} line in year ${n}.`);
}

/** Employer 401(k) money in a year: credited × the share vested by the end of your stay. */
function retirementLines(ctx: WorkContext, letter: L, y: ShownYear): Omit<Work, "title" | "scope" | "ties"> {
  const ret = breakdownOf(ctx, letter).detail.assumptions.find((a) => a.code === "retirement");
  const share = ret?.code === "retirement" ? ret.params.vestedShare : y.credited ? y.employer / y.credited : 0;
  return {
    lines: [
      { label: "Employer money credited in the year", value: figure(y.credited) },
      { op: "×", label: "Vested by the end of your stay", value: percent(share) },
      { op: "=", label: "Counted", value: figure(y.employer), rule: "double" },
    ],
    notes: [ret?.code === "retirement"
      ? `Employer money is ${percent(ret.params.vestedShare)} vested after ${ret.params.completedYears} completed ${ret.params.completedYears === 1 ? "year" : "years"} by the end of your stay; unvested money is forfeited.`
      : "Only the vested share counts."],
    ...fromInputs(ctx, letter, ["retirement.match", "retirement.nonElectivePct", "retirement.vesting", "retirement.vestingService"]),
  };
}

/** A year's rent: the month's rent × 12, or what's paid for the months worked. */
function rentLines(ctx: WorkContext, letter: L, y: ShownYear): Omit<Work, "title" | "scope" | "ties"> {
  const info = breakdownOf(ctx, letter).detail.costOfLiving!;
  const monthly = info.monthlyRent * (1 + info.rentGrowth) ** (y.n - 1);
  const rent = y.col!.rent;
  // A month's rent with the decimals it needs (whole dollars when it's whole), so twelve of them come to the year's rent as shown;
  // a year whose rent isn't twelve such months (a partial year, or months posted to the cent that don't multiply out) is one line.
  const whole = Math.abs(monthly - Math.round(monthly)) < 1e-9 && Math.round(monthly) * 12 === rent;
  const exact = whole ? null : enoughOr(monthly, 2, (x) => Math.round(x * 12) === rent);
  const full = Math.abs(12 * monthly - rent) < 1 && (whole || exact !== null);
  const month = whole ? dollars(monthly) : `$${exact?.text ?? ""}`;
  return {
    lines: full
      ? [{ label: `Rent a month in year ${y.n}`, value: month, ref: `in.${letter}.costOfLiving.monthlyRent` },
        { op: "×", label: "Months", value: "12" },
        { op: "=", label: `Rent in year ${y.n}`, value: figure(rent), rule: "double" }]
      : [{ label: `Rent paid in year ${y.n}`, value: figure(rent), ref: `in.${letter}.costOfLiving.monthlyRent` }],
    notes: [`The first lease year's rent is ${dollars(info.monthlyRent)} a month, rising ${percent(info.rentGrowth)} at each anniversary of your start date `
      + `(${info.rentGrowthSource === "inflation" ? "the inflation rate" : "as entered"}). It's paid only while you work there.`],
    ...fromInputs(ctx, letter, ["costOfLiving.monthlyRent", "costOfLiving.rentGrowth"]),
  };
}

// ---- A-7: the work (L-6 until stop 5B), each offer over its own stay ------------------------------------------------

const L6_SECTION: Record<L6Line, SectionId> = {
  salary: "M-2", bonus: "M-2", cash: "M-2", rsu: "M-3", espp: "M-3", clawback: "M-9", gross: "M-1", tax: "M-4", premiums: "M-5.2", afterTax: "M-1",
  yours: "M-5.1", esppHeld: "M-3",
  takeHome: "M-1", employer: "M-5.1", oop: "M-5.2", hsa: "M-5.2", perks: "M-5.3", totalRewards: "M-1", hours: "M-5.4", afterTaxHour: "M-5.4",
  totalRewardsHour: "M-5.4", savings: "M-6.3", rent: "M-6.2", local: "M-6.3", atRef: "M-6.1", oopRef: "M-6.1", face: "M-6.3", total: "M-6.3",
  totalHour: "M-5.4",
};
const COMPONENT_SECTION: Record<Component, SectionId> = { salary: "M-2", bonus: "M-2", cash: "M-2", rsu: "M-3", espp: "M-3", clawback: "M-9" };
const COMPONENT_NAME: Record<Component | "all", string> = {
  salary: "salary", bonus: "bonus", cash: "cash award", rsu: "RSU", espp: "ESPP", clawback: "clawback", all: "",
};
/** The line each per-hour line divides. */
const PER_HOUR_OF: Partial<Record<L6Line, L6Line>> = { afterTaxHour: "afterTax", totalRewardsHour: "totalRewards", totalHour: "total" };

/** "A-7, year 1, line 8", "A-7, line 8, the years added". */
function l6Name(ctx: WorkContext, letter: L, line: L6Line, col: string): string {
  let no: number | string = "";
  try {
    no = lineNo(ctx, letter, line);
  } catch { /* named without its number */ }
  return col === "sum" ? `${letter}-7, line ${no}, the years added` : `${letter}-7, year ${col}, line ${no}`;
}

/** A number at the fewest decimals (from `min` to 12) at which `ok` holds of the number as shown. */
function enough(x: number, min: number, ok: (shown: number) => boolean): { value: number; text: string } {
  return enoughOr(x, min, ok) ?? { value: x, text: decimals(x, 12) };
}
/** The same, or null when no number of decimals up to 12 makes `ok` hold. */
function enoughOr(x: number, min: number, ok: (shown: number) => boolean): { value: number; text: string } | null {
  for (let k = min; k <= 12; k++) {
    const shown = Number(x.toFixed(k));
    if (ok(shown)) return { value: shown, text: decimals(shown, k) };
  }
  return null;
}

/**
 * A quotient's two figures, each at the fewest decimals (the numerator 0 to 2, the denominator 0 to 6) at which their quotient,
 * rounded as `result` is shown (`unit` 1 for dollars, 100 for cents), is `result`: so "total ÷ hours = per hour" works out as shown.
 */
function quotient(num: number, den: number, result: number, unit: number): { num: string; den: string; n: number; d: number } {
  const target = Math.round(result * unit);
  for (let j = 0; j <= 6; j++) {
    for (let k = 0; k <= 2; k++) {
      const n = Number(num.toFixed(k));
      const d = Number(den.toFixed(j));
      if (d !== 0 && Math.round((n / d) * unit) === target) return { num: decimals(n, k), den: decimals(d, j), n, d };
    }
  }
  return { num: decimals(num, 2), den: decimals(den, 6), n: num, d: den };
}
const decimals = (x: number, k: number) =>
  `${x < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", { minimumFractionDigits: k, maximumFractionDigits: k }).format(Math.abs(x))}`;
const cent = (x: number) => Math.round(x * 100);

/** A-7's scope, over the offer's own stay. `money`: the dollars its figures are in, after rent ("U.S.-average dollars", "New York dollars"). */
function l6Scope(ctx: WorkContext, letter: L, n?: number, money = "dollars"): string {
  const b = breakdownOf(ctx, letter);
  if (n === undefined) return `Base case · its stay, ${years(b.years)} (${windowText({ window: b.window })}) · ${money} as paid`;
  const y = ownShownYear(ctx, letter, n);
  return `Base case · year ${n} (${longDate(y.start)} – ${longDate(dayBefore(y.end))}) · ${money} as paid that year`;
}

/** A-7's lines after rent, at the prices picked: their figures are in those dollars; `local` is in the offer's own city's. */
const L6_AFTER = new Set<L6Line>(["atRef", "oopRef", "face", "total", "totalHour"]);

/** A-7: a line of an employment year, or of the years added. */
function l6YearWork(ctx: WorkContext, letter: L, line: L6Line, col: number | "sum"): Work {
  const r = ctx.results;
  const t = yearTable(ctx, letter);
  const row = t.rows.find((x) => x.line === line && x.kind !== "carried");
  if (!row) throw new Error(`${letter}-7 has no such line.`);
  const value = yearCell(t, line, col);
  const name = row.label.replace(/, line \d+$/, "");
  const id = (l: L6Line, c: number | "sum"): MetricId => `l6y.${letter}.${l}.${c}`;
  const show = (x: number) => (row.unit === "perHour" ? cents(x) : figure(Math.abs(x)));
  const title = `${letter} · ${col === "sum" ? `years 1–${t.n}` : `year ${col}`} · ${lowerFirst(name)}`;
  const money = L6_AFTER.has(line) ? pricesOf(ctx).dollars : line === "local" && t.prices ? `${t.prices.city} dollars` : "dollars";

  if (col === "sum") {
    const of = PER_HOUR_OF[line];
    if (of) {
      const dollarsRow = t.rows.find((x) => x.line === of)!;
      const hoursRow = t.rows.find((x) => x.line === "hours")!;
      return {
        title, scope: l6Scope(ctx, letter, undefined, money),
        lines: [
          { label: `${dollarsRow.label}, years added`, value: figure(dollarsRow.sum), ref: id(of, "sum") },
          { op: "÷", label: "Hours worked, years added", value: figure(hoursRow.sum), ref: id("hours", "sum") },
          { op: "=", label: "An hour", value: cents(value), rule: "double" },
        ],
        notes: ["Over the years together: their dollars as paid ÷ their hours, not the years' hourly figures averaged."],
        ties: [], uses: [],
      };
    }
    return {
      title, scope: l6Scope(ctx, letter, undefined, money),
      lines: [
        ...row.values.map((v, i): WorkLine => ({ ...(i ? { op: v < 0 && row.unit === "dollars" ? "−" as const : "+" as const } : {}), label: `Year ${i + 1}`,
          value: i ? show(v) : (row.unit === "dollars" ? signed(v) : figure(v)), ref: id(line, i + 1) })),
        { op: "=", label: "The years, added", value: row.unit === "dollars" ? signed(value) : figure(value), rule: "double" },
      ],
      notes: [`Footed across: ${lowerFirst(name)} in each year of your stay, as shown, added.`],
      ties: [], uses: row.values.map((_, i) => id(line, i + 1)),
    };
  }

  const n = col;
  const y = t.years[n - 1];
  const scope = l6Scope(ctx, letter, n, money);
  const parts = FOOTS[line];
  if (parts) {
    const shown = parts.filter((l) => t.rows.some((x) => x.line === l));
    // L-1's year, where it's on the page: the comparison is on that basis and has this offer.
    const basis = r?.letters.includes(letter) ? r.view.basis : undefined;
    const tiesFor: Partial<Record<L6Line, MetricId[]>> = {
      gross: [`br.${letter}.${n}.paid`],
      afterTax: [...(basis === "cash" ? [`ey.${letter}.${n}` as const] : []), `br.${letter}.${n}.afterTax`],
      totalRewards: [...(basis === "totalRewards" ? [`ey.${letter}.${n}` as const] : []), `br.${letter}.${n}.totalRewards`],
      total: [...(basis === "colAdjustedTotal" ? [`ey.${letter}.${n}` as const] : []), `br.${letter}.${n}.total`],
    };
    return {
      title, scope,
      lines: [
        ...shown.map((l, i): WorkLine => {
          const v = yearCell(t, l, n);
          const label = t.rows.find((x) => x.line === l && x.kind !== "carried")!.label;
          return { ...(i ? { op: v < 0 ? "−" as const : "+" as const } : {}), label, value: i ? figure(Math.abs(v)) : signed(v), ref: id(l, n) };
        }),
        { op: "=", label: name, value: signed(value), rule: "double" },
      ],
      notes: [`Footed: the lines above it in year ${n}, as shown, added.${line === "total" ? " At the prices picked, spending is restated and what you save counts at face value." : ""}`],
      ties: tiesFor[line] ?? [], uses: [],
    };
  }
  const work = ctx.own?.work?.[letter];
  switch (line) {
    case "salary": case "bonus": case "cash": case "rsu": case "espp": case "clawback": {
      const posted = y.posted[line];
      const list = work ? work.payments.flatMap((p, i) => (p.ey === n && p.component === line ? [i] : [])) : [];
      const count = list.length;
      // The payments in A-7's list: one is its own figure; several, their subtotal.
      const listed: MetricId | null = count === 1 ? `l6p.${letter}.${list[0]}.gross` : count ? `l6g.${letter}.${n}.${line}.gross` : null;
      return {
        title, scope,
        lines: [
          { label: work ? `The year's ${count === 1 ? `${COMPONENT_NAME[line]} payment` : `${count} ${COMPONENT_NAME[line]} payments, added`}` : `Paid in year ${n}, to the cent`,
            value: toCent(posted), ...(listed ? { ref: listed } : {}) },
          { op: "=", label: "To the dollar", value: signed(value), rule: "double" },
        ],
        notes: [
          `Every payment is to the cent, as ${letter}-7 lists them under year ${n}; the year's line is them added, then rounded once.`,
          ...(line === "salary" ? ["Salary accrues by calendar month at the rate in effect: a month's pay is the annual rate ÷ 12, a part month by its days."] : []),
          ...(line === "bonus" ? ["Bonuses are paid once a year for the work before it, so the first covers only the months you've worked."] : []),
          ...(line === "rsu" ? ["RSUs count as pay on the day they vest and are assumed sold then."] : []),
          ...(line === "espp" ? ["An ESPP purchase's gain is the shares' value that day less what bought them: they're taken as sold at once. It's "
            + "wages for income tax, not for Social Security or Medicare."] : []),
        ],
        ties: listed ? [listed] : [],
        ...fromInputs(ctx, letter, line === "salary" ? ["salary.annual", "salary.raise", "salary.promotions"] : line === "bonus" ? [bonusPath(ctx, letter), "bonus.payOn"]
          : line === "rsu" ? equityPaths(ctx, letter) : line === "espp" ? ESPP_INPUTS : ["cashAwards"]),
      };
    }
    case "tax": {
      const d = breakdownOf(ctx, letter).detail;
      const split = d.split.filter((s) => s.ey === n).sort((a, z) => a.year - z.year);
      return {
        title, scope,
        lines: [
          ...split.map((s, i): WorkLine => {
            const ty = d.taxYears.find((x) => x.year === s.year);
            return { ...(i ? { op: "+" as const } : {}), label: `On ${toCent(s.gross)} paid in ${s.year}`, note: ty ? `at ${rate2(ty.rate)}` : undefined,
              value: toCent(s.tax), ...(work ? { ref: `l6t.${letter}.${s.year}.rate.offer` as MetricId } : {}) };
          }),
          { op: "=", label: "To the dollar", value: figure(-value), rule: "double" },
        ],
        notes: ["Each payment is taxed at its calendar year's rate for this offer: household tax with the offer minus without it, ÷ the offer's pay that year. "
          + `Each payment's tax is to the cent, as ${letter}-7 lists them; the year's tax is them added, then rounded once.`],
        ties: [`br.${letter}.${n}.tax`, ...(work ? [`l6g.${letter}.${n}.all.tax` as MetricId] : [])], ...fromInputs(ctx, letter, ["costOfLiving.area"]),
      };
    }
    case "premiums": case "oop": case "hsa": case "perks": {
      const what = { premiums: "your health premiums", perks: "perks", hsa: "the employer's HSA money", oop: "expected out-of-pocket health costs" }[line];
      return {
        title, scope, lines: [{ label: what[0].toUpperCase() + what.slice(1), value: figure(Math.abs(value)), tick: "traced" }],
        notes: [offerByLetter(ctx, letter)?.sample ? "Traced to a sample input (illustrative, not market data)." : "As you entered it.",
          line === "oop" ? `Your own estimate at ${ctx.household.healthUsage ?? "medium"} use, capped at the out-of-pocket maximum; held flat each year.`
            : "Held flat each year; a part year counts its months."],
        ties: [`br.${letter}.${n}.${line}`], ...fromInputs(ctx, letter, { premiums: ["health.premium"], perks: ["perks.section127", "perks.commuterMonthly"],
          hsa: ["health.employerHsa"], oop: ["health.outOfPocket", "health.oopMax"] }[line]),
      };
    }
    case "yours": {
      const raw = breakdownOf(ctx, letter).detail.employmentYears[n - 1];
      const k401 = raw.retirement.employee;
      const hsa = raw.health.employeeHsa;
      return {
        title, scope,
        lines: [
          { label: "Your 401(k) deferrals", value: toCent(k401) },
          ...(hsa ? [{ op: "+" as const, label: "Your HSA contributions", value: toCent(hsa) }] : []),
          { op: "=", label: "To the dollar", value: figure(-value), rule: "double" },
        ],
        notes: ["Your own contributions come out of pay before income tax (a Roth 401(k)'s after), so they're in your after-tax pay but not your take-home: "
          + "money saved, not spent. Deferrals stop at the 402(g) limit each calendar year."],
        ties: [], ...fromInputs(ctx, letter, ["retirement.contributionPct", "retirement.type", "health.employeeHsa"]),
      };
    }
    case "esppHeld": {
      const raw = breakdownOf(ctx, letter).detail.employmentYears[n - 1].espp;
      return {
        title, scope,
        lines: [
          { label: "Put into the ESPP in the year", value: toCent(raw.putIn) },
          { op: "−", label: "Spent on shares, or come back to you", value: toCent(raw.putIn - raw.held) },
          { op: "=", label: "To the dollar", value: signed(-value), rule: "double" },
        ],
        notes: ["Each paycheck's ESPP money comes out after tax, so it's in your after-tax pay but not your take-home until it buys shares (sold at "
          + "once, so it comes back with the gain) or comes back: the part over the $25,000 limit at a purchase, or all of it if you leave before one. "
          + "Money still in the plan counts at face value after rent, and A-2 shows it as a share of its own, not as saved."],
        ties: [], ...fromInputs(ctx, letter, ["espp.contributionPct", "espp.eligiblePay", "espp.offeringMonths", "espp.offeringsStart"]),
      };
    }
    case "employer":
      return { ...retirementLines(ctx, letter, y), title, scope, ties: [`br.${letter}.${n}.retirement`] };
    case "rent":
      return { ...rentLines(ctx, letter, y), title, scope, ties: [`br.${letter}.${n}.rent`] };
    case "hours": {
      const d = offerByLetter(ctx, letter)!.draft;
      const weekly = d.hours.weekly?.base ?? 0;
      const weeks = weeksOf(d);
      const full = Math.abs(weekly * weeks - value) < 0.005;
      return {
        title, scope,
        lines: [
          { label: "Hours a week", value: figure(weekly), ref: `in.${letter}.hours.weekly` },
          { op: "×", label: "Weeks worked a year", value: weeksShown(d), note: daysOffNote(d) },
          ...(full ? [] : [{ op: "×" as const, label: "Share of the year worked", value: (value / (weekly * weeks)).toFixed(4) }]),
          { op: "=", label: "Hours worked", value: figure(value), rule: "double" },
        ],
        notes: ["Hours are the softest input: per hour is a lens, not the verdict."],
        ties: [], ...fromInputs(ctx, letter, HOURS_INPUTS),
      };
    }
    case "afterTaxHour": case "totalRewardsHour": case "totalHour": {
      const of = PER_HOUR_OF[line]!;
      const of2 = t.rows.find((x) => x.line === of)!;
      const perHourBasis = !!r?.letters.includes(letter) && r.view.basis === "perHour" && ((r.sweep.perHourOf === "colAdjustedTotal" && line === "totalHour")
        || (r.sweep.perHourOf === "totalRewards" && line === "totalRewardsHour"));
      return {
        title, scope,
        lines: [
          { label: of2.label.replace(/, line \d+$/, ""), value: figure(yearCell(t, of, n)), ref: id(of, n) },
          { op: "÷", label: "Hours worked", value: figure(y.hours!), ref: id("hours", n) },
          { op: "=", label: "An hour", value: cents(value), rule: "double" },
        ],
        notes: ["Dollars as paid in the year ÷ the hours worked in it."],
        ties: perHourBasis ? [`ey.${letter}.${n}`] : [], uses: [],
      };
    }
    case "savings":
      return {
        title, scope,
        lines: [
          { label: "Take-home pay", value: figure(y.takeHome), ref: id("takeHome", n) },
          { op: "×", label: "Your savings rate", value: percent(breakdownOf(ctx, letter).detail.costOfLiving!.savingsRate) },
          { op: "=", label: "Planned savings", value: figure(-value), rule: "double" },
        ],
        notes: ["Saved, not spent, so it counts at face value below, not at the prices picked."], ties: [], uses: [],
      };
    case "atRef": case "oopRef": {
      const d = breakdownOf(ctx, letter).detail;
      const x = indexes(d);
      const from = line === "atRef" ? y.col!.local : y.oop;
      return {
        title, scope,
        lines: [
          { label: line === "atRef" ? `Spending after rent, at ${x.city} prices` : "Expected out-of-pocket health costs", value: figure(from),
            ref: id(line === "atRef" ? "local" : "oop", n) },
          ...priceLines(ctx, d, letter),
          // Spending after rent can be below zero (rent over take-home pay): its sign stays (audit C15); out-of-pocket costs are a deduction.
          { op: "=", label: name, value: figure(line === "atRef" ? value : Math.abs(value)), rule: "double" },
        ],
        notes: [line === "atRef"
          ? `Restated at ${pricesOf(ctx).place} prices with BEA's non-housing price indexes: what the same spending buys there. Rent is already what you'd pay.`
          : "Health costs come out of local spending, so they're restated the same way."],
        ties: [], uses: [`in.${letter}.costOfLiving.area`],
      };
    }
    case "face": {
      const c = y.col!;
      const items: Array<[L6Line | null, string, number]> = [
        ["savings", "Planned savings", c.savings], ["yours", "Your 401(k) and HSA", y.yours], ["esppHeld", "ESPP money held", y.esppHeld],
        ["employer", "Employer 401(k), vested", y.employer], ["hsa", "Employer HSA money", y.hsa], ["perks", "Perks", y.perks],
      ];
      const shown = items.filter(([, , v]) => v);
      return {
        title, scope,
        lines: [
          // ESPP money held can be below zero (a year the plan pays out more than it takes in): it's then taken off.
          ...shown.map(([l, label, v], i): WorkLine => ({ ...(i ? { op: v < 0 ? "−" as const : "+" as const } : {}), label,
            value: i ? figure(Math.abs(v)) : signed(v), ...(l && t.rows.some((x) => x.line === l) ? { ref: id(l, n) } : {}) })),
          ...(shown.length ? [] : [{ label: "Nothing saved", value: "0" }]),
          { op: "=", label: "Saved, at face value", value: figure(value), rule: "double" },
        ],
        notes: ["Money not spent where you live counts at face value: it isn't restated at the prices picked."], ties: [], uses: [],
      };
    }
  }
  throw new Error(`No ${line} line in ${letter}-7.`);
}

/** A-7: its stay on a basis: what its years run past it, the stay as paid, and (where it's the rank list's) its present value. */
function l6StayWork(ctx: WorkContext, letter: L, basis: ValueBasis, what: "after" | "stay" | "pv"): Work {
  const r = ctx.results;
  const row = stayRows(ctx, letter).find((x) => x.basis === basis);
  if (!row) throw new Error(`Offer ${letter} needs a city for this basis.`);
  const own = breakdownOf(ctx, letter);
  const n = own.years;
  const scope = l6Scope(ctx, letter);
  if (what === "pv") {
    if (!r || !sameStay(ctx, letter)) throw new Error("Its present value is the rank list's, with a comparison that starts when it does.");
    const twin: MetricId = `pv.${letter}.${basis}`;
    return {
      title: `${letter} · ${n}-year ${totalName(ctx, basis)}, present value`, scope: `Base case · stay ${years(n)} (${windowText(r.view.row)}) · today's dollars`,
      lines: [{ label: `${letter}: ${n}-year total, ${basis === r.view.basis ? "in the rank list" : "present value"}`, value: figure(row.pv), ref: twin }],
      notes: [
        "It isn't the years added: each payment is discounted from its date to today, so later pay counts for less. It opens the same work as the rank list's figure.",
        ...(basis === r.view.basis ? [] : [`The rank list shows ${phrase(ctx, r.view.basis)}; this is the same figure on this basis.`]),
      ],
      ties: [twin], uses: [],
    };
  }
  const s = shownStay(own.detail, n);
  if (what === "after") {
    const d = own.detail;
    const raw = d.employmentYears.slice(0, n);
    const w = d.window;
    const notes = [ownAfterStayNote(ctx, letter)];
    if (basis === "cash") {
      return {
        title: `${letter} · years 1–${n} past your stay's last day · after tax`, scope,
        lines: [
          { label: "Pay", value: figure(s.after.gross) },
          { op: "−", label: "Tax", value: figure(s.after.tax) },
          ...(s.after.premiums ? [{ op: "−" as const, label: "Health premiums", value: figure(s.after.premiums) }] : []),
          { op: "=", label: "After-tax pay past the stay", value: signed(row.after), rule: "double" },
        ],
        notes: [...notes, "Each is the years' figure less the stay's, before rounding, rounded once."], ties: [], uses: [],
      };
    }
    const yearsRaw = basis === "totalRewards" ? raw.reduce((a, y) => a + y.totalRewards, 0) : raw.reduce((a, y) => a + y.costOfLiving!.total, 0);
    const windowRaw = basis === "totalRewards" ? w.totalRewards.nominal : w.costOfLiving!.nominal.total;
    return {
      title: `${letter} · years 1–${n} past your stay's last day · ${totalName(ctx, basis)}`, scope,
      lines: [
        { label: `Years 1–${n}, before rounding`, value: toCent(yearsRaw) },
        { op: "−", label: "Your stay's window, before rounding", value: toCent(windowRaw) },
        { op: "=", label: "Past the stay, to the dollar", value: signed(row.after), rule: "double" },
      ],
      notes, ties: [], uses: [],
    };
  }
  const same = sameStay(ctx, letter);
  const tiesTo: MetricId[] = [...(same && basis === r!.view.basis ? [`eysum.${letter}` as const] : []),
    ...(basis === "cash" && r?.leave ? [`stayafter.${letter}` as const] : [])];
  return {
    title: `${letter} · your stay, as paid · ${totalName(ctx, basis)}`, scope,
    lines: [
      { label: `Years 1–${n}, added`, value: figure(row.years), ref: `l6y.${letter}.${row.line}.sum` },
      ...(row.after ? [{ op: "−" as const, label: "Past your stay's last day (not counted)", value: signed(row.after), ref: `l6s.${letter}.${basis}.after` as MetricId }] : []),
      { op: "=", label: "Your stay, as paid", value: figure(row.stay), rule: "double" },
    ],
    notes: [
      row.after ? ownAfterStayNote(ctx, letter) : `Years 1–${n} are its stay: they add up to it.`,
      same ? `L-1 shows this as “Your stay, as paid” on the ${phrase(ctx, basis)} basis. It's as paid, not discounted: the rank list's present value is lower.`
        : "It's as paid, not discounted: its present value, in A-1, is lower.",
    ],
    ties: tiesTo, uses: [],
  };
}

/** A-7: one payment, as the engine works it out, or its tax. */
function l6PaymentWork(ctx: WorkContext, letter: L, i: number, what: "gross" | "tax"): Work {
  const p = paymentAt(ctx, letter, i);
  const label = paymentLabel(p);
  const scope = `Base case · paid ${longDate(p.date)} · ${p.ey > breakdownOf(ctx, letter).years ? "after its stay, taxed with its year" : `year ${p.ey}`}`;
  if (what === "tax") {
    const t = taxTable(ctx, letter, p.calendarYear);
    const rate = Number((t.rate * 100).toFixed(t.digits)) / 100;
    const exact = exactPay(p);
    // Pay before rounding shows at least three decimals, so it isn't read as the cent figure it rounds to.
    const pay = cent(exact) / 100 === exact
      ? { value: exact, text: toCent(exact) }
      : enough(exact, 3, (x) => cent(x * rate) === cent(p.tax));
    return {
      title: `${letter} · tax on ${lowerFirst(label)}`, scope,
      lines: [
        { label: pay.value === p.gross ? "Pay" : "Pay, before rounding to the cent", value: pay.text, ref: `l6p.${letter}.${i}.gross` },
        { op: "×", label: `The offer's ${p.calendarYear} rate`, value: rateText(t.rate, t.digits), ref: `l6t.${letter}.${p.calendarYear}.rate.offer` },
        { op: "=", label: "Tax", value: toCent(p.tax), rule: "double" },
      ],
      notes: ["Each payment carries its calendar year's rate on the offer: household tax with the offer less without it, ÷ the offer's pay that year. "
        + "Federal, Social Security, Medicare, state and local taxes are all in it."],
      ties: [], uses: [],
    };
  }
  const d = p.detail;
  const lines: WorkLine[] = [];
  let inputs: string[] = [];
  switch (d.kind) {
    case "salary":
      // The annual rate with the decimals it needs (a raise can leave cents), so the month's pay works out to the cent.
      lines.push({ label: "Salary, a year", value: enough(d.annual, 0, (x) => cent((x / 12) * (d.days / d.daysInMonth)) === cent(p.gross)).text },
        { op: "÷", label: "Months", value: "12" });
      if (d.days !== d.daysInMonth) lines.push({ op: "×", label: `Days worked of the month's ${d.daysInMonth}`, value: `${d.days}/${d.daysInMonth}` });
      inputs = ["salary.annual", "salary.raise", "salary.promotions"];
      break;
    case "bonus":
      if (d.basis === "percentOfSalary") {
        const earned = enough(d.salaryEarned, 2, (x) => cent(d.rate * x) === cent(p.gross));
        lines.push({ label: "Salary earned in the period", note: `${longDate(d.periodFrom)} – ${longDate(d.periodTo)}`, value: earned.text },
          { op: "×", label: "Bonus rate", value: percent(d.rate) });
      } else {
        lines.push({ label: d.employmentYear ? `Year ${d.employmentYear}'s bonus` : "Bonus for a full year",
          value: enough(d.amount, 0, (x) => cent((x * d.daysEmployed) / d.periodDays) === cent(p.gross)).text },
          { op: "×", label: `Days worked of the period's ${d.periodDays}`, value: `${d.daysEmployed}/${d.periodDays}` });
      }
      inputs = [bonusPath(ctx, letter), "bonus.payOn", "bonus.periodStart"];
      break;
    case "cash":
      lines.push({ label: d.award, value: toCent(d.amount), tick: "traced" });
      inputs = ["cashAwards"];
      break;
    case "rsu": {
      // Each with the decimals it needs (a third is 33.3333%), so the vest works out to the cent.
      const grant = enough(d.grantValue, 0, (x) => cent(x * d.fraction * d.priceFactor) === cent(p.gross));
      const share = enough(d.fraction * 100, 0, (x) => cent(grant.value * (x / 100) * d.priceFactor) === cent(p.gross));
      lines.push({ label: "Grant value", value: grant.text }, { op: "×", label: `Tranche ${d.tranche} of ${d.tranches}`, value: `${share.text}%` });
      if (Math.abs(d.priceFactor - 1) > 1e-9) {
        const pf = enough(d.priceFactor, 4, (x) => cent(grant.value * (share.value / 100) * x) === cent(p.gross));
        lines.push({ op: "×", label: "Share-price growth since the grant", value: pf.text });
      }
      inputs = equityPaths(ctx, letter);
      break;
    }
    case "clawback":
      lines.push({ label: "Repaid", value: toCent(p.gross) });
      inputs = ["cashAwards"];
      break;
  }
  if (d.kind !== "cash" && d.kind !== "clawback") lines.push({ op: "=", label: "Pay", value: toCent(p.gross), rule: "double" });
  return {
    title: `${letter} · ${lowerFirst(label)}`, scope, lines,
    notes: [
      ...(d.kind === "salary" ? ["A month's salary is the annual rate ÷ 12; a part month earns its share by days. It's dated on the last day it covers."] : []),
      ...(d.kind === "bonus" ? [`Paid ${longDate(p.date)} for the period ${longDate(d.periodFrom)} – ${longDate(d.periodTo)}, counting the days you worked in it.`] : []),
      ...(d.kind === "rsu" && d.nominalDate ? [`Due ${longDate(d.nominalDate)} on its schedule; it vests on the company's next vest date, ${longDate(p.date)}.`] : []),
      ...(d.kind === "rsu" ? ["RSUs count as pay on the day they vest, at the share price then, and are assumed sold."] : []),
      "To the cent, as the engine rounds each payment.",
    ],
    ties: [], ...fromInputs(ctx, letter, inputs),
  };
}

/** A-7: a year's payments of one kind, added; or the year's tax ("all"). */
function l6GroupWork(ctx: WorkContext, letter: L, ey: number | "after", component: Component | "all", what: "gross" | "tax"): Work {
  const y = paymentYears(ctx, letter).find((x) => x.ey === ey);
  if (!y) throw new Error(`No such year in ${letter}-7's payments.`);
  const scope = `Base case · ${yearName(y)}`;
  if (component === "all") {
    return {
      title: `${letter} · ${ey === "after" ? "after your stay" : `year ${ey}`} · tax on its payments`, scope,
      lines: [
        ...y.groups.map((g, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `On its ${COMPONENT_NAME[g.component]} ${g.rows.length === 1 ? "payment" : "payments"}`,
          value: toCent(g.tax), ref: g.rows.length === 1 ? `l6p.${letter}.${g.rows[0].i}.tax` : `l6g.${letter}.${ey}.${g.component}.tax` })),
        { op: "=", label: "Tax on the year's payments", value: toCent(y.tax), rule: "double" },
      ],
      notes: [ey === "after" ? "Paid after your stay, so not counted; listed because they're taxed with its last calendar year."
        : `To the dollar, ${figure(y.tax)}: ${letter}-7's tax line in year ${ey}.`],
      ties: typeof ey === "number" ? [`l6y.${letter}.tax.${ey}`] : [], uses: [],
    };
  }
  const g = y.groups.find((x) => x.component === component);
  if (!g) throw new Error(`No ${COMPONENT_NAME[component]} payments in that year.`);
  const lineNumber = typeof ey === "number" ? (() => { try { return lineNo(ctx, letter, component); } catch { return null; } })() : null;
  return {
    title: `${letter} · ${ey === "after" ? "after your stay" : `year ${ey}`} · ${COMPONENT_NAME[component]} ${what === "tax" ? "tax" : "payments"}`, scope,
    lines: [
      ...g.rows.map(({ i, p }, k): WorkLine => ({ ...(k ? { op: "+" as const } : {}), label: paymentLabel(p), value: toCent(what === "tax" ? p.tax : p.gross),
        ref: `l6p.${letter}.${i}.${what}` })),
      { op: "=", label: what === "tax" ? "Their tax, added" : "Added", value: toCent(what === "tax" ? g.tax : g.gross), rule: "double" },
    ],
    notes: [what === "gross" && lineNumber !== null ? `To the dollar, ${figure(g.gross)}: ${letter}-7's line ${lineNumber} in year ${ey}.`
      : ey === "after" ? "Paid after your stay, so not counted; taxed with its last calendar year." : "Each payment's tax, to the cent, added."],
    ties: what === "gross" && typeof ey === "number" ? [`l6y.${letter}.${component}.${ey}`] : [], uses: [],
  };
}

/** A-7: a calendar year's tax, with the offer, without it, or the offer's share (with less without). */
function l6TaxWork(ctx: WorkContext, letter: L, year: number, line: TaxLine, col: TaxCol): Work {
  const t = taxTable(ctx, letter, year);
  const row = t.rows.find((x) => x.line === line);
  if (!row) throw new Error(`No ${line} line in ${letter}'s ${year} tax.`);
  const id = (l: TaxLine, c: TaxCol): MetricId => `l6t.${letter}.${year}.${l}.${c}`;
  const colName = { with: "with the offer", without: "without it", offer: "the offer's share" }[col];
  const title = `${letter} · ${year} · ${lowerFirst(row.label)}, ${colName}`;
  const scope = `Base case · calendar year ${year}${t.projectedLaw ? " · tax law projected from 2026" : " · 2026 tax law"}`;
  const engineNote = (v: number) => `The tax engine's figure: ${toCent(v)}.`;
  const runOf = (c: "with" | "without") => (c === "with" ? t.t.with : t.t.without);
  const KEY: Partial<Record<TaxLine, keyof TaxRun>> = {
    federal: "federal", ss: "ss", medicare: "medicare", state: "stateIncome", statePayroll: "statePayroll", local: "local", taxable: "taxableIncome",
    pretax401k: "pretax401k", section125: "section125", spouse: "spouseWages", statutory: "statutory",
  };
  if (line === "rate") {
    const offerTax = t.t.with.total - t.t.without.total;
    const pay = offerTax / t.rate;
    const k = (() => {
      for (let k = 2; k <= 12; k++) {
        const a = Number(t.t.with.total.toFixed(k)) - Number(t.t.without.total.toFixed(k));
        if (rateText(Number(a.toFixed(k)) / Number(pay.toFixed(k)), t.digits) === rateText(t.rate, t.digits)) return k;
      }
      return 12;
    })();
    return {
      title: `${letter} · ${year} · the offer's tax rate`, scope,
      lines: [
        // Each formatted from the number checked (toFixed), not the unrounded one: Intl and toFixed can round a half apart (audit C15).
        { label: "Household tax with the offer, before rounding", value: decimals(Number(t.t.with.total.toFixed(k)), k) },
        { op: "−", label: "Without it", value: decimals(Number(t.t.without.total.toFixed(k)), k) },
        { op: "=", label: "The offer's tax", value: decimals(Number(t.t.with.total.toFixed(k)) - Number(t.t.without.total.toFixed(k)), k), rule: "single" },
        { op: "÷", label: "The offer's pay, before rounding each payment", value: decimals(Number(pay.toFixed(k)), k) },
        { op: "=", label: "Its rate", value: rateText(t.rate, t.digits), rule: "double" },
      ],
      notes: [`Every payment in ${year} carries this rate: its tax is its pay before rounding × the rate, to the cent. `
        + `Shown to ${t.digits} decimals, the fewest at which each payment's tax comes out to the cent.`],
      ties: [], uses: [],
    };
  }
  if (col === "offer") {
    if (line === "wages" || line === "total") {
      return {
        title, scope,
        lines: [
          ...t.parts.map((p, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}),
            label: `${line === "wages" ? "Paid" : "Tax on what's paid"} ${p.ey === "after" ? "after your stay" : `in year ${p.ey}`}`,
            value: toCent(line === "wages" ? p.gross : p.tax) })),
          { op: "=", label: "To the dollar", value: figure(row.offer!), rule: "double" },
        ],
        notes: [line === "wages" ? `The offer's payments in ${year}, each to the cent, added, as ${letter}-7 lists them by employment year.`
          : `Its payments' tax in ${year}, added: household tax with the offer less without it, spread over them by pay. It equals the column's lines: with less without.`],
        ties: [], uses: [],
      };
    }
    return {
      title, scope,
      lines: [
        { label: "With the offer", value: figure(row.with!), ref: id(line, "with") },
        { op: "−", label: "Without it", value: figure(row.without!), ref: id(line, "without") },
        { op: "=", label: "The offer's share", value: signed(row.offer!), rule: "double" },
      ],
      notes: ["The offer's tax is household tax with it less without it, line by line."], ties: [], uses: [],
    };
  }
  if (line === "total") {
    if (col === "without") {
      const taxes = t.rows.filter((x) => x.kind === "tax");
      return {
        title, scope,
        lines: [
          ...taxes.map((x, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: x.label, value: figure(x.without!), ref: id(x.line, "without") })),
          { op: "=", label: "Total tax without the offer", value: figure(row.without!), rule: "double" },
        ],
        notes: ["Footed: the lines above it, each rounded, added.", engineNote(t.t.without.total)], ties: [], uses: [],
      };
    }
    const withoutTotal = row.without!;
    return {
      title, scope,
      lines: [
        { label: "Total tax without the offer", value: figure(withoutTotal), ref: id("total", "without") },
        { op: "+", label: "The offer's tax: its payments' tax, added", value: figure(row.offer!), ref: id("total", "offer") },
        { op: "=", label: "Total tax with the offer", value: figure(row.with!), rule: "double" },
      ],
      notes: [engineNote(t.t.with.total), "Shown as the total without the offer plus the offer's tax, each to the dollar, so the three columns agree."],
      ties: [], uses: [],
    };
  }
  if (line === "federal" && col === "with") {
    const others = t.rows.filter((x) => x.kind === "tax" && x.line !== "federal");
    return {
      title, scope,
      lines: [
        { label: "Total tax with the offer", value: figure(t.rows.find((x) => x.line === "total")!.with!), ref: id("total", "with") },
        ...others.map((x): WorkLine => ({ op: "−", label: x.label, value: figure(x.with!), ref: id(x.line, "with") })),
        { op: "=", label: "Federal income tax", value: figure(row.with!), rule: "double" },
      ],
      notes: [engineNote(t.federal), "Shown as the total less the other lines, each rounded, so the column adds up as displayed: "
        + "the largest line takes the rounding, as on a rounded schedule."],
      ties: [], uses: [],
    };
  }
  if (line === "wages") {
    if (col === "without") {
      const first = ctx.wagesYear === year && ctx.household.otherWagesThisYear > 0;
      return {
        title, scope,
        lines: [{ label: first ? "Your wages from another job this year" : "Other wages", value: figure(row.without!), ...(first ? { ref: "about.wages" as MetricId } : {}),
          tick: "traced" }],
        notes: [first ? "From About you: they count in the first year's tax, with and without the offer."
          : `None entered for ${year}: your other wages count only in the year you enter them for (About you).`],
        ties: [], uses: first ? ["about.wages"] : [],
      };
    }
    return {
      title, scope,
      lines: [
        { label: "Other wages", value: figure(row.without!), ref: id("wages", "without") },
        { op: "+", label: "The offer's pay", value: figure(row.offer!), ref: id("wages", "offer") },
        { op: "=", label: "Wages with the offer", value: figure(row.with!), rule: "double" },
      ],
      notes: ["What the tax engine taxes: W-2 pay for the calendar year, the offer's included."], ties: [], uses: [],
    };
  }
  const key = KEY[line]!;
  const v = runOf(col)[key];
  if (line === "spouse") {
    const grown = year - ctx.wagesYear;
    const entered = ctx.household.spouseWages ?? 0;
    return {
      title, scope,
      lines: grown !== 0
        ? [{ label: `Your spouse's wages in ${ctx.wagesYear}`, value: figure(entered), ref: "about.spouse" as MetricId },
          { op: "×", label: grown > 0 ? `Grown ${grown} ${grown === 1 ? "year" : "years"} at 2.5%` : `${-grown} ${grown === -1 ? "year" : "years"} earlier, at 2.5%`,
            value: enough((1 + ASSUMPTIONS.inflation) ** grown, 6, (x) => Math.round(Math.round(entered) * x) === Math.round(v)).text },
          { op: "=", label: `In ${year}`, value: figure(v), rule: "double" }]
        : [{ label: `Your spouse's wages in ${year}`, value: figure(v), ref: "about.spouse" as MetricId }],
      notes: ["From About you: the same with and without the offer, so the offer's tax is what its pay adds on top of theirs."],
      ties: [], uses: ["about.spouse"],
    };
  }
  return {
    title, scope,
    lines: [{ label: row.label, value: figure(col === "with" ? row.with! : row.without!) }],
    notes: [engineNote(v), ...(line === "taxable" ? ["Wages less pre-tax deductions and the standard deduction (or itemized deductions, if larger)."] : []),
      ...(line === "pretax401k" || line === "section125" ? ["Taken out of wages before tax: they lower the tax on the offer's pay."] : []),
      ...(line === "statutory" ? ["An ESPP purchase's gain is wages for income tax (W-2 box 1) but not for Social Security or Medicare (IRC 3121(a)(22)), "
        + "nor for the state payroll taxes or Philadelphia's wage tax, which follow them here. NYC's tax and state income taxes include it."] : [])],
    ties: [], uses: [],
  };
}

// ---- inputs ---------------------------------------------------------------------------------------

/**
 * The inputs a figure is built from, for "From your inputs" and the highlighter: each path as a figure
 * that opens its own work. Quick mode's "Also counted" row lights up too, where the input is hidden.
 */
function fromInputs(ctx: WorkContext, letter: L, paths: string[]): { inputs: InputRef[]; uses: MetricId[] } {
  const o = offerByLetter(ctx, letter);
  if (!o) return { inputs: [], uses: [] };
  const inputs = paths.map((path): InputRef => ({ ref: `in.${letter}.${path}`, label: inputLabel(path), value: inputValue(ctx, o, path) }));
  return { inputs, uses: [...inputs.map((x) => x.ref), `in.${letter}.also`] };
}

const inputLabel = (path: string) => {
  const name = READ_ONLY_NAME[path] ?? HELP[helpKey(path)]?.label ?? path;
  return name[0].toUpperCase() + name.slice(1);
};

/** An input's value as it reads in a sentence: "Mar 15", "3% / 5% / 7%", "$120,000". */
function inputValue(ctx: WorkContext, o: AppOffer, path: string): string {
  const d = o.draft;
  if (path === "costOfLiving.area") return shortCity(cityName(d.costOfLiving.area)) || "—";
  if (path === "costOfLiving.monthlyRent") {
    const rent = d.costOfLiving.monthlyRent ?? rentEstimate(ctx, o)?.monthlyRent;
    return rent === undefined || rent === null ? "—" : `${dollars(rent)} a month`;
  }
  if (path === "also") return alsoCounted(d).join(", ") || "none";
  const def = defaultFor(path);
  if (def && isDefault(d, path)) return def.shown(d);
  const lines = inputLines(d, path);
  if (lines.length === 3 && /bear case$/.test(lines[0].label)) return lines.map((l) => l.value).join(" / ");
  return lines.map((l) => (lines.length > 1 ? `${l.label} ${l.value}` : l.value ?? "")).join("; ");
}

/** The bonus input that sets its amounts: a target, or dollars by year. */
const bonusPath = (ctx: WorkContext, letter: L) =>
  (bonusBasis(offerByLetter(ctx, letter)?.draft.bonus ?? { basis: null } as AppOffer["draft"]["bonus"]) === "byEmploymentYear" ? "bonus.amounts" : "bonus.amount");

/** An offer's RSU inputs: each grant's value and vesting, then share-price growth and refreshers. */
function equityPaths(ctx: WorkContext, letter: L): string[] {
  const e = offerByLetter(ctx, letter)?.draft.equity;
  if (!e) return [];
  return [...e.grants.flatMap((_, i) => [`equity.grants.${i}.value`, `equity.grants.${i}.schedule`]), "equity.priceGrowth",
    ...(e.refreshers ? ["equity.refreshers"] : [])];
}

const SAMPLE_NOTE = "Traced to a sample input (illustrative, not market data).";

function inputWork(ctx: WorkContext, letter: L, path: string): Work {
  const o = offerByLetter(ctx, letter);
  if (!o) throw new Error(`There's no offer ${letter}.`);
  const d = o.draft;
  const traced = o.sample ? SAMPLE_NOTE : "As you entered it.";
  const edit: EditTarget = { letter, path };
  const title = (what: string) => `${letter} · ${what}`;
  const help = HELP[helpKey(path)];
  switch (path) {
    case "costOfLiving.area": {
      const city = cityTax(d);
      const state = d.residence.state;
      const where = `${cityName(d.costOfLiving.area)}${state ? ` · live in ${state}` : ""}${city ? `, inside ${CITY_TAX[city].place}` : ""}`;
      return { title: title("where you'd live"), lines: [{ label: "City", value: where, tick: "traced" }],
        notes: [traced, `Taxed as a full-year resident of ${state ?? "that state"}${city ? ` and ${CITY_TAX[city].place}` : ""}; `
          + "spending is priced with this metro's BEA price level."], ties: [], uses: [], edit };
    }
    case "costOfLiving.monthlyRent": {
      const est = rentEstimate(ctx, o);
      const rent = d.costOfLiving.monthlyRent;
      if (rent !== null || !est) {
        return { title: title("rent"), lines: [{ label: "Rent a month", value: rent === null ? "—" : dollars(rent), tick: "traced" }],
          notes: [traced, "It rises at each lease anniversary while you work there, by the rent growth under Where you'd live (inflation, 2.5% a year, unless you change it)."],
          ties: [], uses: [], edit };
      }
      return {
        title: title("rent, estimated"),
        lines: est.source === "fmr"
          ? [{ label: `HUD FY${est.fiscalYear} Fair Market Rent, 1 bedroom`, value: dollars(est.monthlyRent), note: est.hudAreaName, tick: "traced" }]
          : [{ label: "U.S. median gross rent (ACS 2024)", value: dollars(est.anchorRent), tick: "traced" },
            { op: "×", label: "Housing price ratio (BEA)", value: est.housingRatio.toFixed(4), tick: "traced" },
            { op: "=", label: "Estimated rent a month", value: dollars(est.monthlyRent), rule: "double" }],
        notes: [
          est.source === "fmr"
            ? "HUD's Fair Market Rent is what recent movers pay for a typical 1-bedroom across the metro: the 40th percentile, utilities included."
            : "No HUD Fair Market Rent covers this area, so the estimate scales the U.S. median rent by BEA's housing price level.",
          "Metro-wide estimates are often below city-center rents: edit it to your actual rent.",
        ],
        ties: [], uses: [], edit,
      };
    }
    case "also": {
      const also = alsoCounted(d);
      return also.length
        ? { title: title("inputs quick mode doesn't show"), lines: also.map((x): WorkLine => ({ label: x })),
          notes: [o.sample ? SAMPLE_NOTE : "As you entered them.", "They still count. Detailed mode shows each one, where you can see and edit it."],
          ties: [], uses: [] }
        : { title: title("inputs quick mode doesn't show"), lines: [{ label: "None: only the fields above count for this offer" }],
          notes: ["Detailed mode adds raises, bonus timing, RSUs and hours, and shows the 401(k), health and perks."], ties: [], uses: [] };
    }
  }
  // At its default: the default, and why.
  const def = defaultFor(path);
  if (def && isDefault(d, path)) {
    return {
      title: title(inputName(path)), lines: [{ label: help?.label ?? inputName(path), value: def.shown(d), tick: "default" }],
      notes: [`A default, not something you entered. ${def.reason}`, "Edit it to change it; its help (ⓘ) can reset it to the default."],
      ties: [], uses: [], edit,
    };
  }
  return {
    title: title(inputName(path)), lines: inputLines(d, path),
    notes: [traced, ...(help ? [help.help.split(/(?<=[.])\s/)[0]] : [])], ties: [], uses: [], edit,
  };
}

/** An input's value as derivation lines: one line, or bear / base / bull when it has a range. */
function inputLines(d: OfferDraft, path: string): WorkLine[] {
  const key = helpKey(path);
  const v = getPath(d, path);
  const fmt = formatterFor(d, key);
  const label = HELP[key]?.label ?? inputName(path);
  const line = (l: string, value: string, note?: string): WorkLine => ({ label: l, value, tick: "traced", ...(note ? { note } : {}) });
  if (isRange(v)) {
    return hasRange(v) ? [line(`${label}, bear case`, fmt(v.bear)), line(`${label}, base case`, fmt(v.base)), line(`${label}, bull case`, fmt(v.bull))]
      : [line(label, fmt(v.base))];
  }
  switch (key) {
    case "salary.promotions":
      return d.salary.promotions.length ? d.salary.promotions.map((p, i) => line(`Promotion ${i + 1}`, p.stepUp === null ? "+—" : `+${percent(p.stepUp)}`,
        `on ${p.on ? longDate(p.on) : "—"}${p.scenarios && p.scenarios.length < 3 ? `, ${p.scenarios.join(" and ")} only` : ""}`)) : [line(label, "None")];
    case "equity.grants":
      return d.equity.grants.length ? d.equity.grants.map((g) => line(g.label || "RSU grant", g.value === null ? "—" : dollars(g.value), scheduleText(g.schedule)))
        : [line(label, "None")];
    case "equity.grants.schedule": case "equity.refreshers.schedule":
      return [line(label, scheduleText(v as ScheduleDraft))];
    case "equity.refreshers": return [line(label, refreshersText(d))];
    case "bonus.amounts":
      return d.bonus.amounts.length ? d.bonus.amounts.map((a, i) => line(`Year ${i + 1}${i === d.bonus.amounts.length - 1 ? ", and after" : ""}`,
        a ? rangeText(a, dollars) : "—")) : [line(label, "None")];
    case "bonus.amount": return [line("Target bonus", bonusText(d))];
    case "bonus.basis": return [line(label, { percentOfSalary: "% of salary", fixed: "Dollars a year", byEmploymentYear: "Dollars by employment year" }[bonusBasis(d.bonus)])];
    case "retirement.match": return d.retirement && d.retirement !== "none" ? [line(label, matchText(d.retirement))] : [line(label, "—")];
    case "retirement.vesting": return d.retirement && d.retirement !== "none" ? [line(label, vestingText(d.retirement))] : [line(label, "—")];
    case "health.outOfPocket": {
      const o = v as { low: number | null; medium: number | null; high: number | null } | undefined;
      return o ? (["low", "medium", "high"] as const).map((k) => line(`${label}, ${k} use`, o[k] === null ? "Not counted" : dollars(o[k]!))) : [line(label, "—")];
    }
    case "cashAwards.paidOn": {
      const p = v as CashAwardDraft["paidOn"];
      return [line(label, typeof p === "string" ? longDate(p) : `${p?.daysAfterStart ?? "—"} days after you start`)];
    }
    case "cashAwards.clawback": {
      const c = v as ClawbackDraft | null;
      return [line(label, !c ? "None" : `${(c.kind ?? "prorated") === "full" ? "All of it" : "The unworked share"} if you leave within ${c.months ?? 12} months`)];
    }
    case "salary.raiseOn": return [line(label, v === "jan1" ? "Each January 1" : "Each work anniversary")];
    case "salary.promotions.scenarios": return [line(label, Array.isArray(v) && v.length ? v.join(", ") : "None")];
    case "equity.grants.schedule.vestDates": case "equity.refreshers.schedule.vestDates": {
      const c = v as ScheduleDraft["vestDates"];
      return [line(label, c && c.months.length ? `${c.months.map((m) => MONTH_SHORT[m - 1]).join(", ")} ${c.day ?? "—"}` : "None")];
    }
    case "cashAwards": return [line("Cash awards", cashAwardsText(d))];
    case "retirement": return [line("401(k)", retirementText(d))];
    case "health": return [line("Health plan", healthText(d))];
    case "perks": return [line("Perks", perksText(d))];
    case "espp": return [line("ESPP", esppText(d))];
    case "employerState": return [line("Employer state", employerStateText(d))];
    case "costOfLiving.rentGrowth": return [line("Rent growth", rentGrowthText(d, 0.025))];
    case "hours.weekly": return [line(label, "Not counted")];
  }
  if (v === null || v === undefined) return [line(label, "—")];
  if (typeof v === "boolean") return [line(label, v ? "Yes" : "No")];
  if (typeof v === "string" && CHOICE_WORDS[key]?.[v]) return [line(label, CHOICE_WORDS[key][v])];
  if (typeof v === "string") return [line(label, /^\d{4}-\d{2}-\d{2}$/.test(v) ? longDate(v) : v)];
  if (typeof v === "number") return [line(label, fmt(v))];
  if (typeof v === "object" && "month" in v && "day" in v) {
    const md = v as { month: number; day: number };
    return [line(label, `${MONTH_SHORT[md.month - 1] ?? "—"} ${md.day}`)];
  }
  return [line(label, "Entered")];
}

/** How a choice reads. */
const CHOICE_WORDS: Record<string, Record<string, string>> = {
  "retirement.type": { pretax: "Pre-tax", roth: "Roth" },
  "retirement.eligiblePay": { salary: "Salary", salaryAndBonus: "Salary and bonus" },
  "retirement.vestingService": { elapsedTime: "Years worked", planYearHours: "Plan years with 1,000 hours" },
  "health.coverage": { self: "Self", family: "Family" },
  "espp.eligiblePay": { salary: "Salary", salaryAndBonus: "Salary and bonus" },
  "cashAwards.clawback.kind": { prorated: "The unworked share", full: "All of it" },
  "cashAwards.clawback.per": { month: "Completed months", day: "Days" },
  "cashAwards.clawback.from": { start: "Your start date", payment: "The payment date" },
  "cashAwards.clawback.repay": { gross: "Gross (the full amount)", net: "Net (what you received)" },
};

const DAY_KEYS = new Set(["timeOff.vacation", "timeOff.holidays", "timeOff.sick", "timeOff.gives", "timeOff.cap"]);

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isRange = (v: unknown): v is ByScenario => !!v && typeof v === "object" && "base" in v && "bear" in v;
const PERCENT_KEYS = new Set(["salary.raise", "equity.priceGrowth", "salary.promotions.stepUp", "costOfLiving.rentGrowth",
  "retirement.contributionPct", "retirement.nonElectivePct", "retirement.match.rate", "retirement.match.upToPct", "retirement.vesting.steps.pct",
  "equity.grants.schedule.tranches.fraction", "equity.refreshers.schedule.tranches.fraction", "espp.contributionPct", "espp.discount"]);
const MONTH_KEYS = new Set(["equity.refreshers.firstAfterMonths", "equity.refreshers.everyMonths", "equity.grants.schedule.tranches.month",
  "equity.refreshers.schedule.tranches.month", "espp.offeringMonths"]);

/** How an input's numbers read: a percent, dollars, hours, weeks or months. */
function formatterFor(d: OfferDraft, key: string): (x: number) => string {
  if (PERCENT_KEYS.has(key) || (key === "bonus.amount" && bonusBasis(d.bonus) === "percentOfSalary")) return percent;
  if (key === "hours.weekly") return (x) => `${x} hours a week`;
  if (key === "espp.purchasesPerOffering") return (x) => `${x} ${x === 1 ? "purchase" : "purchases"}`;
  if (DAY_KEYS.has(key)) return (x) => `${x} ${x === 1 ? "day" : "days"}`;
  if (MONTH_KEYS.has(key) || key === "cashAwards.clawback.months") return (x) => `${x} ${x === 1 ? "month" : "months"}`;
  if (key === "retirement.vesting.years" || key === "retirement.vesting.steps.years") return (x) => `${x} ${x === 1 ? "year" : "years"}`;
  return dollars;
}

function aboutWork(ctx: WorkContext, field: AboutField): Work {
  const h = ctx.household;
  const isDefault = aboutIsDefault(h, field);
  const tick: TickKind = isDefault ? "default" : "traced";
  switch (field) {
    case "filing":
      return { title: "Filing status", lines: [{ label: "Files as", value: { single: "Single", joint: "Married, filing jointly", headOfHousehold: "Head of household" }[h.filingStatus], tick }],
        notes: [isDefault ? "The default: most new grads file single." : "As you chose it.", "It sets the tax brackets and the standard deduction for every offer."],
        ties: [], uses: [], edit: { about: "filing" } };
    case "stay":
      return { title: "How long you expect to stay", lines: [{ label: "Stay", value: years(h.stayYears), tick }],
        notes: [isDefault ? "The default: a typical first-job tenure. The row under the verdict shows 2 to 5 years." : "As you chose it.",
          "Every offer is compared over the same stretch, starting on the earliest start date; pay after it isn't counted."],
        ties: [], uses: [], edit: { about: "stay" } };
    case "wages":
      return { title: `Other wages in ${ctx.wagesYear}`, lines: [{ label: "From another job", value: dollars(h.otherWagesThisYear), tick }],
        notes: [isDefault ? "The default: none." : "As you entered it.",
          `Pay from another job in ${ctx.wagesYear} is taxed in the same year, so it raises the new job's first-year tax.`],
        ties: [], uses: [], edit: { about: "wages" } };
    case "spouse":
      return { title: `Your spouse's wages in ${ctx.wagesYear}`, lines: [{ label: "Their wages", value: dollars(h.spouseWages ?? 0), tick }],
        notes: [isDefault ? "The default: none." : "As you entered it; each later year grows with inflation (2.5% a year).",
          "Filing jointly, each offer's pay is taxed on top of your spouse's wages: the offer's tax is the household's tax with it, less without "
          + "it. The same for every offer."],
        ties: [], uses: [], edit: { about: "spouse" } };
    case "healthUsage": {
      const usage = h.healthUsage ?? "medium";
      return { title: "Health use", lines: [{ label: "Out-of-pocket estimate that counts", value: usage[0].toUpperCase() + usage.slice(1), tick }],
        notes: [isDefault ? "The default: the middle of your own three estimates." : "As you chose it.",
          "Every offer's health plan counts your out-of-pocket estimate at this level of use, capped at its maximum."],
        ties: [], uses: [], edit: { about: "healthUsage" } };
    }
    case "prices": {
      const p = pricesOf(ctx);
      return p.us
        ? { title: "Prices in", lines: [{ label: "Dollars", value: "U.S. average", tick }],
          notes: ["The default: every offer's spending money is priced as in an average U.S. city, so offers in different cities compare in the same "
            + "dollars.", "Pick a city you know instead, and every after-rent figure is restated in its dollars."],
          ties: [], uses: [], edit: { about: "prices" } }
        : { title: "Prices in", lines: [{ label: "Dollars", value: p.name, tick }],
          notes: [`As you chose it: every offer's spending money is priced as in ${p.place}, whose own price factor is 1. Spending money in every `
            + `other city is restated by ${p.place}'s non-housing prices ÷ that city's; what you save counts at face value.`,
          "The U.S. average is the default."],
          ties: [], uses: [], edit: { about: "prices" } };
    }
  }
}

// ---- an offer's breakdown: A-1, its bottom line (docs/v2-plan.md, item 5) -------------------------------------

const OWN_SECTION: Record<OwnLine, SectionId> = {
  total: "M-7.2", spend: "M-7.2", saved: "M-7.2", af: "M-7.2", prices: "M-6.1", ref: "M-6.1", y1spend: "M-1", y1saved: "M-1", rate: "M-4",
  hour: "M-5.4", bear: "M-8", drop: "M-8", bull: "M-8",
};
const OWN_NAME: Record<OwnLine, string> = {
  total: "month on its own", spend: "money to spend on its own", saved: "money saved on its own", af: "annuity factor on its own",
  prices: "price step", ref: "month at the prices picked", y1spend: "year-1 money to spend", y1saved: "year-1 money saved",
  rate: "tax rate over its stay", hour: "per hour on its own", bear: "bear case on its own", drop: "drop to the bear case on its own",
  bull: "bull case on its own",
};

/** An offer's breakdown and its A-1 figures, with its input, as the page shows them. */
function ownOf(ctx: WorkContext, letter: L): { v: OwnView; d: OfferDetail; input: ReturnType<typeof toOfferInput>; years: number; terms: { date: string; days: number; factor: number }[]; rate: number } {
  const b = ctx.own?.breakdowns[letter];
  const o = offerByLetter(ctx, letter);
  const input = o ? toOfferInput(o) : null;
  if (!b || !input || !("offer" in input)) throw new Error("Still working this out…");
  return { v: ownView(letter, b, input.offer, pricesOf(ctx), ctx.own!.withRef), d: b.detail, input, years: b.years, terms: b.annuity, rate: b.discountRate };
}

/** "Base case · its own stay, 4 years (Jul 13, 2026 – Jul 12, 2030) · today's New York dollars" */
const ownScope = (v: OwnView, what = `today's ${v.place} dollars`) =>
  `Base case · its own stay, ${years(v.years)} (${longDate(v.start)} – ${longDate(v.last)}) · ${what}`;

function ownWork(ctx: WorkContext, letter: L, line: OwnLine): Work {
  const { v, d, input, terms, rate } = ownOf(ctx, letter);
  const months = v.months;
  const place = v.place;
  const offer = "offer" in input ? input.offer : null;
  const factorLine = (): WorkLine => ({ op: "÷", label: `Annuity factor: ${months} month-ends at ${percent(rate)} a year`, value: v.factor.toFixed(4),
    ref: `own.${letter}.af` });
  const ownStay = `Its own stay: from its own start, ${longDate(v.start)}, for your stay's ${years(v.years)}, whichever other offers you add.`;
  const monthNote = "A month is the level amount, paid at each month's end of its stay, worth the same today as the present value: the present "
    + "value as shown ÷ the factor as shown, rounded once (M-7.2).";
  switch (line) {
    case "total": return {
      title: `${letter}-1 · ${letter} on its own: a month over your stay, in ${place} dollars`, scope: ownScope(v),
      lines: [
        { label: "Total rewards, present value", value: figure(v.pv.totalRewards) },
        { op: "−", label: "Rent, present value", value: figure(v.pv.rent) },
        { op: "=", label: `After rent, at ${place} prices, present value`, value: figure(v.pv.total), rule: "single" },
        factorLine(),
        { op: "=", label: `A month over your stay, ${place} $`, value: dollars(v.month.total), rule: "double" },
      ],
      notes: [
        `At its own prices, the after-rent total is total rewards less rent: what's left to spend is spent in ${place}, so nothing is `
          + `restated. A comparison restates it at the prices you pick, so offers in different cities can sit side by side (M-1).`,
        ownStay, monthNote,
        ...(v.pv.rent !== Math.round((d.window.costOfLiving?.presentValue?.rent ?? 0)) ? [`Each figure is rounded once and the total is the engine's, so the rent takes the rounding (the engine's ${cents(d.window.costOfLiving!.presentValue!.rent)}).`] : []),
      ],
      ties: v.ref ? [`alone.${letter}`] : [], ...fromInputs(ctx, letter, ["salary.annual", bonusPath(ctx, letter), "startDate", "costOfLiving.area", "costOfLiving.monthlyRent"]),
    };
    case "saved": return {
      title: `${letter}-1 · Saved a month over your stay, in ${place} dollars`, scope: ownScope(v),
      lines: [
        { label: "Saved at face value, present value", value: figure(v.pv.saved),
          note: "your 401(k) and HSA, vested employer 401(k), employer HSA, perks, planned savings" },
        factorLine(),
        { op: "=", label: `Saved, a month over your stay, ${place} $`, value: dollars(v.month.saved), rule: "double" },
      ],
      notes: ["Money you save isn't spent where you live, so it counts at face value, at any prices.", monthNote],
      ties: [], uses: [`own.${letter}.total`],
    };
    case "spend": return {
      title: `${letter}-1 · To spend after rent, a month over your stay, in ${place} dollars`, scope: ownScope(v),
      lines: [
        { label: "A month over your stay", value: dollars(v.month.total), ref: `own.${letter}.total` },
        { op: "−", label: "Saved, a month over your stay", value: dollars(v.month.saved), ref: `own.${letter}.saved` },
        { op: "=", label: `To spend after rent, a month over your stay, ${place} $`, value: dollars(v.month.spend), rule: "double" },
      ],
      notes: [
        "What's left to spend after tax, rent and expected out-of-pocket health costs, less what you save.",
        ...(breakdownOf(ctx, letter).detail.window.costOfLiving?.presentValue?.esppHeld !== undefined
          ? ["Its ESPP's money is in it: what the plan holds comes back to you, as shares sold at once or in cash."] : []),
        `It's the total less what's saved, so this line takes the rounding: its own present value, ${figure(v.pv.spend)}, ÷ ${v.factor.toFixed(4)} `
          + `is ${cents(v.pv.spend / v.factor)}.`,
      ],
      ties: [], uses: [`own.${letter}.total`, `own.${letter}.saved`],
    };
    case "af": {
      const line1 = (t: (typeof terms)[number], op?: WorkLine["op"]): WorkLine =>
        ({ ...(op ? { op } : {}), label: longDate(t.date), note: `${figure(t.days)} days from today`, value: t.factor.toFixed(4) });
      const shown = terms.length <= 6 ? terms.map((t, i) => line1(t, i ? "+" : undefined))
        : [line1(terms[0]), line1(terms[1], "+"), line1(terms[2], "+"),
          { op: "+" as const, label: `… ${terms.length - 5} more month-ends`, value: (v.factor
            - [0, 1, 2, terms.length - 2, terms.length - 1].reduce((sum, k) => sum + Number(terms[k].factor.toFixed(4)), 0)).toFixed(4) },
          line1(terms[terms.length - 2], "+"), line1(terms[terms.length - 1], "+")];
      return {
        title: `${letter}-1 · Annuity factor over its own stay, at ${percent(rate)} a year`, scope: `${terms.length} month-ends, ${longDate(v.start)} – ${longDate(v.last)}`,
        lines: [...shown, { op: "=", label: "Annuity factor", value: v.factor.toFixed(4), rule: "double" }],
        notes: [
          `Each month-end's factor is (1 + ${percent(rate)})^−(days from today ÷ 365.25): what $1 paid that day is worth today, ${longDate(ctx.today)}.`,
          ownStay,
        ],
        ties: [], uses: [],
      };
    }
    case "ref": case "prices": {
      const r = v.ref;
      if (!r) throw new Error(`${letter}'s figures are in ${place} dollars, the prices picked.`);
      const p = pricesOf(ctx);
      const x = indexes(d);
      const restated = `Spending money in ${place} is restated by ${p.place} non-housing prices ÷ ${place}'s (${x.ref} ÷ ${x.area}); what's saved counts `
        + "at face value, so only spending moves (M-6.1, M-6.3).";
      if (line === "ref") {
        const rows = ctx.results;
        const same = rows && rows.view.row.window.start === v.start;
        return {
          title: `${letter}-1 · ${letter} on its own, a month over your stay, in ${p.dollars}`, scope: ownScope(v, `today's ${p.dollars}`),
          lines: [
            { label: `${p.phrase[0].toUpperCase()}${p.phrase.slice(1)}, present value`, value: figure(r.pv) },
            factorLine(),
            { op: "=", label: `A month over your stay, ${p.unit}`, value: dollars(r.month), rule: "double" },
          ],
          notes: [restated, monthNote,
            ...(rows ? [same ? `Its stay starts on the comparison's first day, so this present value is ${letter}'s in the rank list.`
              : `The comparison counts every offer from the earliest start, ${longDate(rows.view.row.window.start)}, so the rank list's figure for `
                + `${letter} covers a different stretch (M-7.3).`] : [])],
          ties: [`alone.${letter}`, ...(same && rows.view.basis === "colAdjustedTotal" ? [`pv.${letter}.colAdjustedTotal` as MetricId] : [])],
          uses: [`own.${letter}.total`],
        };
      }
      const up = r.step >= 0;
      return {
        title: `${letter}-1 · ${place} prices: ${place} dollars to ${p.dollars}, a month over your stay`, scope: ownScope(v, `today's dollars`),
        lines: up ? [
          { label: `A month over your stay, ${place} $`, value: dollars(v.month.total), ref: `own.${letter}.total` },
          { op: "−", label: `The same, ${p.unit}`, value: dollars(r.month), ref: `own.${letter}.ref` },
          { op: "=", label: `${place} prices, a month over your stay`, value: dollars(r.step), rule: "double" },
        ] : [
          { label: `A month over your stay, ${p.unit}`, value: dollars(r.month), ref: `own.${letter}.ref` },
          { op: "−", label: `The same, ${place} $`, value: dollars(v.month.total), ref: `own.${letter}.total` },
          { op: "=", label: `${place} prices, a month over your stay`, value: dollars(-r.step), rule: "double" },
        ],
        notes: [restated, up ? `${place} is dearer than ${p.average}, so its dollars buy less there.` : `${place} is cheaper than ${p.average}, so its dollars buy more there.`],
        ties: [], uses: [`own.${letter}.total`, `own.${letter}.ref`],
      };
    }
    case "y1spend": case "y1saved": {
      const y1 = v.year1;
      if (!y1) throw new Error(`Offer ${letter} needs a city for this figure.`);
      const y = y1.y;
      const scope = `Base case · year 1 (${longDate(y.start)} – ${longDate(dayBefore(y.end))}) · ${place} dollars as paid that year`;
      const ops = (xs: WorkLine[]) => xs.map((l, i) => (i === 0 ? { ...l, op: undefined } : l));
      if (line === "y1spend") {
        return {
          title: `${letter}-1 · To spend after rent, a month in year 1, in ${place} dollars`, scope,
          lines: [
            ...ops([
              { label: "Take-home pay", value: figure(y.takeHome),
                note: `after tax, premiums and your own 401(k) and HSA${y.esppHeld ? ", less ESPP money held" : ""}` },
              ...(y.col!.savings ? [{ op: "−" as const, label: "Planned savings", value: figure(y.col!.savings) }] : []),
              { op: "−", label: "Rent", value: figure(y.col!.rent) },
              ...(y.oop ? [{ op: "−" as const, label: "Expected out-of-pocket health costs", value: figure(y.oop) }] : []),
            ]),
            { op: "=", label: "To spend after rent, year 1", value: figure(y1.spend), rule: "single" },
            { op: "÷", label: "Months", value: "12" },
            { op: "=", label: `A month in year 1, ${place} $`, value: dollars(y1.spendMonth), rule: "double" },
          ],
          notes: ["Year 1 as paid: no discounting, and at its own prices, so it's what a first budget there would hold.", v.differs],
          ties: [], uses: [`in.${letter}.costOfLiving.monthlyRent`],
        };
      }
      const parts: WorkLine[] = [
        { label: "Your 401(k) and HSA", value: figure(y.yours) },
        { op: "+", label: "Employer 401(k), vested by the end of your stay", value: figure(y.employer) },
        { op: "+", label: "Employer HSA money", value: figure(y.hsa) },
        { op: "+", label: "Perks, at face value", value: figure(y.perks) },
        { op: "+", label: "Planned savings", value: figure(y.col!.savings) },
      ];
      const kept = parts.filter((l) => l.value !== "0");
      return {
        title: `${letter}-1 · Saved, a month in year 1, in ${place} dollars`, scope,
        lines: [
          ...ops(kept.length ? kept : [parts[0]]),
          { op: "=", label: "Saved, year 1", value: figure(y1.saved), rule: "single" },
          { op: "÷", label: "Months", value: "12" },
          { op: "=", label: `A month in year 1, ${place} $`, value: dollars(y1.savedMonth), rule: "double" },
        ],
        notes: ["Money you save counts at face value, at any prices."],
        ties: [], uses: [],
      };
    }
    case "rate": {
      const t = v.tax;
      if (!t) throw new Error(`Offer ${letter} pays nothing in its stay.`);
      return {
        title: `${letter}-1 · Tax, a share of its pay over your stay`, scope: ownScope(v, "dollars as paid"),
        lines: [
          { label: "Tax over your stay", value: figure(t.tax), note: "federal, Social Security and Medicare, state and local" },
          { op: "÷", label: "Pay over your stay", value: figure(t.gross) },
          { op: "=", label: "Tax, of its pay over your stay", value: taxRateText(t.rate), rule: "double" },
        ],
        notes: [
          "The offer's tax each calendar year is your household's tax with the offer less without it (M-4), so this is what the offer "
            + "adds to your tax, as a share of what it pays. It isn't your top rate: the last dollar of pay is taxed more than the average one.",
          "The years as shown, added, less what they run past your stay's last day (as L-6 adds them).",
        ],
        ties: [], uses: [],
      };
    }
    case "hour": {
      const h = v.hour;
      if (!h) throw new Error("Per hour needs weekly hours.");
      const q = quotient(h.total, h.hours, h.value, 100);
      const own = offerByLetter(ctx, letter)?.draft;
      const hrs = own?.hours;
      return {
        title: `${letter}-1 · Per hour worked over your stay, after tax and rent, in ${place} dollars`, scope: ownScope(v, `${place} dollars as paid`),
        lines: [
          { label: `${years(v.years)} after rent, at ${place} prices, as paid`, value: q.num, note: "total rewards less rent, not discounted" },
          { op: "÷", label: "Hours worked in its stay", value: q.den, ...(hrs?.weekly ? { note: `${hrs.weekly.base} a week × ${weeksShown(own!)} weeks a year` } : {}) },
          { op: "=", label: `Per hour worked over your stay, ${place} $`, value: cents(h.value), rule: "double" },
        ],
        notes: ["Per hour isn't discounted: dollars as paid over the stay, divided by the hours worked in it (M-5.4)."],
        ties: [], ...fromInputs(ctx, letter, HOURS_INPUTS),
      };
    }
    case "bull": {
      const b = v.bull;
      if (!b) throw new Error(`No ranges are entered for ${letter}, so its bull case is its base case.`);
      const w = d.cases.bull;
      const tr = Math.round(w.totalRewards.presentValue!) + 0;
      const changes = offer ? caseChanges(offer, "bull", d.window.end, false) : [];
      return {
        title: `${letter}-4 · The bull case, a month over your stay, in ${place} dollars`, scope: ownScope(v).replace("Base case", "Bull case"),
        lines: [
          { label: "Total rewards, bull case, present value", value: figure(tr) },
          { op: "−", label: "Rent, present value", value: figure(tr - b.pv) },
          { op: "=", label: `After rent, at ${place} prices, bull case`, value: figure(b.pv), rule: "single" },
          factorLine(),
          { op: "=", label: `A month over your stay, bull case, ${place} $`, value: dollars(b.month), rule: "double" },
        ],
        notes: [
          changes.length ? `The bull case sets every uncertain input to its bull value at once. For ${letter}: ${changes.map(changeText).join("; ")}.`
            : `Nothing entered for ${letter} changes within its stay in the bull case, so it equals the base case.`,
          monthNote,
        ],
        ties: [], uses: [],
      };
    }
    case "bear": case "drop": {
      const b = v.bear;
      if (!b) throw new Error(`No ranges are entered for ${letter}, so its bear case is its base case.`);
      if (line === "drop") {
        if (b.drop === null) throw new Error(`${letter}'s bear case isn't under its base case.`);
        const diff = v.month.total - b.month;
        return {
          title: `${letter}-1 · The bear case, under the base case over your stay`, scope: ownScope(v),
          lines: [
            { label: "Base case, a month over your stay", value: dollars(v.month.total), ref: `own.${letter}.total` },
            { op: "−", label: "Bear case, a month over your stay", value: dollars(b.month), ref: `own.${letter}.bear` },
            { op: "=", label: "Less in the bear case", value: dollars(diff), rule: "single" },
            { op: "÷", label: "Base case, a month over your stay", value: dollars(v.month.total) },
            { op: "=", label: "Under the base case, over your stay", value: shareText(b.drop), rule: "double" },
          ],
          notes: [],
          ties: [], uses: [`own.${letter}.total`, `own.${letter}.bear`],
        };
      }
      const w = d.cases.bear;
      const tr = Math.round(w.totalRewards.presentValue!) + 0;
      const changes = offer ? caseChanges(offer, "bear", d.window.end, false) : [];
      return {
        title: `${letter}-1 · The bear case, a month over your stay, in ${place} dollars`, scope: ownScope(v).replace("Base case", "Bear case"),
        lines: [
          { label: "Total rewards, bear case, present value", value: figure(tr) },
          { op: "−", label: "Rent, present value", value: figure(tr - b.pv) },
          { op: "=", label: `After rent, at ${place} prices, bear case`, value: figure(b.pv), rule: "single" },
          factorLine(),
          { op: "=", label: `A month over your stay, bear case, ${place} $`, value: dollars(b.month), rule: "double" },
        ],
        notes: [
          changes.length ? `The bear case sets every uncertain input to its bear value at once. For ${letter}: ${changes.map(changeText).join("; ")}.`
            : `Nothing entered for ${letter} changes within its stay in the bear case, so it equals the base case.`,
          monthNote,
        ],
        ties: [], uses: [],
      };
    }
  }
}

/** The ledger's "On its own" row: the bottom line in the common dollars, stepping from the offer's own-city figure (condition 1). */
function aloneWork(ctx: WorkContext, letter: L): Work {
  const { v } = ownOf(ctx, letter);
  const p = pricesOf(ctx);
  const title = `${letter} on its own · a month over its own stay, in ${p.dollars}`;
  if (!v.ref) {
    return {
      title, scope: ownScope(v, `today's ${p.dollars}`),
      lines: [{ label: `${letter}-1: a month over your stay, ${p.unit}`, value: dollars(v.month.total), ref: `own.${letter}.total` }],
      notes: [`${v.place}'s prices are the prices picked (Prices in), so ${letter}'s own dollars are the common ones.`],
      ties: [`own.${letter}.total`], uses: [],
    };
  }
  const r = v.ref;
  return {
    title, scope: ownScope(v, `today's ${p.dollars}`),
    lines: [
      { label: `${letter}-1: a month over your stay, ${v.place} $`, value: dollars(v.month.total), ref: `own.${letter}.total` },
      { op: r.step >= 0 ? "−" : "+", label: `${v.place} prices`, value: dollars(Math.abs(r.step)), ref: `own.${letter}.prices` },
      { op: "=", label: `In the common dollars, ${p.unit}`, value: dollars(r.month), rule: "double", ref: `own.${letter}.ref` },
    ],
    notes: [
      `Where offers sit side by side they're in one place's dollars, ${p.name}'s by default, so a dollar means the same in each. `
        + `${letter}'s breakdown (${letter}-1) is in its own city's dollars, and the step between is ${v.place}'s prices.`,
      "Each offer over its own stay, from its own start: the comparison's window, from the earliest start, can differ (M-7.3).",
    ],
    ties: [`own.${letter}.ref`], uses: [`own.${letter}.total`, `own.${letter}.prices`],
  };
}

// ---- an offer's breakdown, A-2 to A-6 (docs/v2-plan.md, item 5, stop 5B) ---------------------------------------------------------

const A2_SECTION: Record<A2Line, SectionId> = {
  tax: "M-4", rent: "M-6.2", health: "M-5.2", saved: "M-5.1", espp: "M-3", spend: "M-1.1", taxShare: "M-1.1", rentShare: "M-1.1", healthShare: "M-1.1",
  savedShare: "M-1.1", esppShare: "M-1.1", spendShare: "M-1.1", hundred: "M-1.1", credited: "M-5.1",
};

/** "Base case · year 1 (Jul 13, 2026 – Jul 12, 2027) · dollars as paid that year": a year of an offer's own stay. */
function ownYearScope(ctx: WorkContext, letter: L, n: number, what = "dollars as paid that year"): string {
  const y = ownShownYear(ctx, letter, n);
  return `Base case · year ${n} (${longDate(y.start)} – ${longDate(dayBefore(y.end))}) · ${what}`;
}

/** A-2: a part of a year's pay, in dollars or as a share of each $100, the $100, or the employer's 401(k) money on top. */
function hundredWork(ctx: WorkContext, letter: L, n: number, line: A2Line): Work {
  const d = breakdownOf(ctx, letter).detail;
  const h = hundredOf(d, n);
  if (!h) throw new Error(`Year ${n} needs a city and pay.`);
  const y = ownShownYear(ctx, letter, n);
  const scope = ownYearScope(ctx, letter, n);
  const title = (what: string) => `${letter}-2 · year ${n} · ${what}`;
  const part = (p: A2Part) => h.parts.find((x) => x.part === p)!;
  const year = `year-${n}`;
  if (line === "hundred" || line.endsWith("Share")) {
    if (line === "hundred" || line === "spendShare") {
      const others = h.parts.filter((x) => x.part !== "spend");
      const lines: WorkLine[] = line === "hundred"
        ? [...h.parts.map((x, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: A2_LABEL[x.part], value: centsText(x.cents),
          ref: `a2.${letter}.${n}.${x.part}Share` as MetricId })), { op: "=", label: `Of each $100 of ${year} pay`, value: "$100.00", rule: "double" }]
        : [{ label: "Each $100", value: "$100.00" }, ...others.map((x): WorkLine => ({ op: "−", label: A2_LABEL[x.part], value: centsText(x.cents),
          ref: `a2.${letter}.${n}.${x.part}Share` as MetricId })), { op: "=", label: `Left to spend, of each $100 of ${year} pay`, value: centsText(part("spend").cents),
          rule: "double" }];
      return {
        title: title(line === "hundred" ? "each $100" : `left to spend, of each $100 of ${year} pay`), scope, lines,
        notes: ["Each part is the year's figure as shown ÷ its pay as shown, to the cent; the money left to spend takes the rounding, so the parts add "
          + "to $100.00 (M-1.1)."],
        ties: [], uses: [],
      };
    }
    const p = line.replace("Share", "") as Exclude<A2Part, "spend">;
    const q = part(p);
    return {
      title: title(`${A2_LABEL[p]}, of each $100 of ${year} pay`), scope,
      lines: [
        { label: `${A2_LABEL[p][0].toUpperCase()}${A2_LABEL[p].slice(1)} in year ${n}`, value: figure(q.dollars), ref: `a2.${letter}.${n}.${p}` },
        { op: "÷", label: `Paid in year ${n}`, value: figure(h.paid), ref: `br.${letter}.${n}.paid` },
        { op: "×", label: "Each $100", value: "100" },
        { op: "=", label: `Of each $100 of ${year} pay`, value: centsText(q.cents), rule: "double" },
      ],
      notes: ["To the cent: the year's figure as shown ÷ its pay as shown."], ties: [], uses: [],
    };
  }
  if (line === "credited") {
    return {
      title: title("employer 401(k) money credited"), scope,
      lines: [{ label: `Employer 401(k) money credited in year ${n}`, value: figure(h.credited), ref: `a5.${letter}.credited.${n}` }],
      notes: ["Outside the $100: the employer's money, not your pay. How much of it vests by the end of the stay is in the bridge's employer 401(k) line and A-5."],
      ties: [`a5.${letter}.credited.${n}`], ...fromInputs(ctx, letter, ["retirement.match", "retirement.nonElectivePct", "retirement.vesting"]),
    };
  }
  switch (line) {
    case "tax": case "rent":
      return {
        title: title(line), scope,
        lines: [{ label: line === "tax" ? `Tax in year ${n}` : `Rent in year ${n}`, value: figure(part(line).dollars), ref: `br.${letter}.${n}.${line}` }],
        notes: [`The bridge's ${line} line, and ${letter}-7's: the same figure, shown here as a part of the year's pay.`],
        ties: [`br.${letter}.${n}.${line}`, `l6y.${letter}.${line}.${n}`], uses: [],
      };
    case "health":
      return {
        title: title("health costs"), scope,
        lines: [
          { label: "Health premiums", value: figure(y.premiums), ...(y.premiums ? { ref: `br.${letter}.${n}.premiums` as MetricId } : {}) },
          { op: "+", label: "Expected out-of-pocket health costs", value: figure(y.oop), ...(y.oop ? { ref: `br.${letter}.${n}.oop` as MetricId } : {}) },
          { op: "=", label: "Health costs", value: figure(part("health").dollars), rule: "double" },
        ],
        notes: ["What your health plan costs you in the year: your premiums and the out-of-pocket costs you expect at your usage."], ties: [], uses: [],
      };
    case "saved":
      return {
        title: title("saved out of pay"), scope,
        lines: [
          { label: "Your 401(k) and HSA", value: figure(y.yours), ...(y.yours ? { ref: `l6y.${letter}.yours.${n}` as MetricId } : {}) },
          { op: "+", label: "Planned savings", value: figure(y.col!.savings), ...(y.col!.savings ? { ref: `l6y.${letter}.savings.${n}` as MetricId } : {}) },
          { op: "=", label: "Saved", value: figure(part("saved").dollars), rule: "double" },
        ],
        notes: ["What you put away out of your own pay. The employer's 401(k) and HSA money is on top of the $100, not in it."], ties: [], uses: [],
      };
    case "espp":
      return {
        title: title("in the ESPP"), scope,
        lines: [{ label: `ESPP money held at the end of year ${n}`, value: signed(part("espp").dollars), ref: `l6y.${letter}.esppHeld.${n}` }],
        notes: [`Put into the plan in the year, less what bought shares or came back: yours, but not yet to spend or saved. ${letter}-7's line, the same `
          + "figure."],
        ties: [`l6y.${letter}.esppHeld.${n}`], ...fromInputs(ctx, letter, ["espp.contributionPct", "espp.offeringMonths", "espp.offeringsStart"]),
      };
    case "spend": {
      const others = h.parts.filter((x) => x.part !== "spend");
      return {
        title: title("left to spend"), scope: ownYearScope(ctx, letter, n, `${breakdownOf(ctx, letter).detail.costOfLiving ? `${shortCity(breakdownOf(ctx, letter).detail.costOfLiving!.area.name)} dollars` : "dollars"} as paid that year`),
        lines: [
          { label: `Paid in year ${n}`, value: figure(h.paid), ref: `br.${letter}.${n}.paid` },
          ...others.map((x): WorkLine => ({ op: "−", label: A2_LABEL[x.part], value: figure(x.dollars), ref: `a2.${letter}.${n}.${x.part}` as MetricId })),
          { op: "=", label: "Left to spend", value: signed(part("spend").dollars), rule: "double" },
        ],
        notes: [`Spending money after rent and health costs, at ${letter}'s own prices: ÷ 12, the bridge's month to spend in year ${n}${n === 1 ? ", and A-1's" : ""}.`],
        ties: [], uses: [],
      };
    }
  }
  throw new Error(`No ${line} line in ${letter}-2.`);
}

/** A-3: a payment that isn't salary, by date, to the dollar; or salary a month at the start. */
function arrivalWork(ctx: WorkContext, letter: L, which: number | "salary"): Work {
  const b = breakdownOf(ctx, letter);
  if (which === "salary") {
    const o = offerByLetter(ctx, letter);
    const input = o ? toOfferInput(o) : null;
    const annual = input && "offer" in input ? input.offer.salary.annual : 0;
    return {
      title: `${letter}-3 · salary a month, at its starting salary`, scope: `Base case · from ${longDate(b.window.start)} · $, as paid`,
      lines: [
        { label: "Salary, a year", value: figure(annual), ref: `in.${letter}.salary.annual` },
        { op: "÷", label: "Months", value: "12" },
        { op: "=", label: "A month", value: dollars(annual / 12), rule: "double" },
      ],
      notes: ["Salary accrues by calendar month at the rate in effect; a raise or a promotion changes it from its date."],
      ties: [], ...fromInputs(ctx, letter, ["salary.annual"]),
    };
  }
  const a = arrivalsOf(b.detail, b.years)[which];
  if (!a) throw new Error(`No payment ${which + 1} in ${letter}-3.`);
  const work = ctx.own?.work?.[letter];
  const listed = work?.payments.findIndex((p) => p.date === a.date && p.component === a.kind && Math.abs(p.gross - a.gross) < 0.005) ?? -1;
  return {
    title: `${letter}-3 · ${lowerFirst(a.label)}`, scope: `Base case · paid ${longDate(a.date)} · year ${a.ey} · $, as paid`,
    lines: [
      { label: "Paid, to the cent", value: toCent(a.gross), ...(listed >= 0 ? { ref: `l6p.${letter}.${listed}.gross` as MetricId } : {}) },
      { op: "=", label: "To the dollar", value: figure(arrivalShown(a)), rule: "double" },
    ],
    notes: [
      a.kind === "bonus" ? "Bonuses are paid once a year for the work before it, so the first covers only the days you've worked."
        : a.kind === "rsu" ? "RSUs count as pay on the day they vest, at the share price then, and are assumed sold."
        : a.kind === "espp" ? "An ESPP purchase's gain counts as pay on the purchase day: the shares are taken as sold at once."
        : "A cash award counts on the day it's paid.",
      `${letter}-7 lists every payment, with how it was worked out and its tax.`,
    ],
    ties: listed >= 0 ? [`l6p.${letter}.${listed}.gross`] : [], uses: [],
  };
}

/** A-4: a cliff inside the stay: what leaving the day before gives up, before tax. */
function cliffWork(ctx: WorkContext, letter: L, i: number): Work {
  const t = ctx.own?.terms?.[letter];
  const c = t?.cliffs[i];
  if (!c) throw new Error("Still working this out…");
  return {
    title: `${letter}-4 · ${cliffName(c)}`, scope: `Base case · ${longDate(c.date)} · $, before tax`,
    lines: [{ label: c.kind === "clawbackCleared" ? "No longer repaid, before tax" : "Before tax", value: figure(c.amount), tick: "recomputed" }],
    notes: [`${longDate(c.date)} is the first last day that keeps it: ${cliffCost(c)}.`,
      "Worked out from the offer's projection, as L-4 and M-9 date cliffs: a bonus or a vest on its pay date, a clawback's end on the last day of its window."],
    ties: [], uses: [],
  };
}

/** A-4: what staying until the next cliff from the start (or today) is worth, after tax, as paid. */
function nextUpWork(ctx: WorkContext, letter: L): Work {
  const t = ctx.own?.terms?.[letter];
  const n = t?.next;
  if (!t || !n || !t.kept) throw new Error("Still working this out…");
  const at = Math.round(t.kept.at);
  const from = Math.round(t.kept.from);
  return {
    title: `${letter}-4 · staying until ${longDate(n.date)}`, scope: `Base case · from ${longDate(t.from)} · after tax, as paid`,
    lines: [
      { label: `Kept if your last day were ${longDate(n.date)}, after tax`, value: figure(at) },
      { op: "−", label: `Kept if it were ${longDate(t.from)}`, value: figure(from) },
      { op: "=", label: "Staying until it, after tax", value: dollars(at - from), rule: "double" },
    ],
    notes: [`L-4's value of staying, counted from ${t.from === breakdownOf(ctx, letter).window.start ? "its start" : "today"}: pay for the days in between, `
      + "the cliff's payment or vest, and any clawback owed or no longer owed, each after tax."],
    ties: [], uses: [],
  };
}

/** A-5: employer 401(k) money credited; total rewards less after-tax pay, a year, over the stay, and a month. */
/** A-5: what the starting salary pays a year for paid days off: days × salary ÷ 260 (4a). Context: it's in no total. */
function paidTimeOffWork(ctx: WorkContext, letter: L): Work {
  const r = toOfferInput(offerByLetter(ctx, letter)!);
  if (!("offer" in r)) throw new Error(`Offer ${letter} isn't complete.`);
  const { days, annual, value } = paidTimeOff(r.offer);
  const d = daysOff(r.offer.timeOff);
  return {
    title: `${letter}-5 · paid time off, a year`, scope: "Its starting salary · dollars as paid",
    lines: [
      { label: "Starting salary, a year", value: Number.isInteger(annual) ? figure(annual) : cents(annual), ref: `in.${letter}.salary.annual` },
      { op: "×", label: "Paid days off a year", value: `${+days.toFixed(6)}`,
        note: `${d.vacation} vacation days + ${d.holidays} holidays + ${d.sick} sick days` },
      { op: "÷", label: "Workdays a year, 52 × 5", value: "260" },
      { op: "=", label: "Its salary for those days, a year", value: figure(value), rule: "double" },
    ],
    notes: ["Context, not a total: salary already pays for days off, so this adds to nothing. The days off set the weeks per hour divides "
      + "by: 52 − days ÷ 5 (M-5.4)."],
    ties: [], ...fromInputs(ctx, letter, ["salary.annual", "timeOff.vacation", "timeOff.holidays", "timeOff.sick"]),
  };
}

/** A-5: what goes into its ESPP over its stay, each year's as shown, added (4i). Context: it's in after-tax pay, and comes back in shares sold. */
function esppInWork(ctx: WorkContext, letter: L): Work {
  const b = breakdownOf(ctx, letter);
  const p = esppPutIn(b.detail, b.years);
  return {
    title: `${letter}-5 · put into its ESPP over its stay`, scope: l6Scope(ctx, letter),
    lines: [
      ...p.years.map((v, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Year ${i + 1}`, value: figure(v) })),
      { op: "=", label: "Over its stay", value: figure(p.sum), rule: "double" },
    ],
    notes: ["Each eligible paycheck's percent, after tax: it's in your after-tax pay. Each purchase spends it on shares, sold at once, so it comes "
      + "back with the gain; what the $25,000 limit can't buy comes back in cash, and so does all of it if you leave before a purchase."],
    ties: [], ...fromInputs(ctx, letter, ["espp.contributionPct", "espp.eligiblePay", "salary.annual"]),
  };
}

function benefitsWork(ctx: WorkContext, letter: L, what: "credited" | "added" | "month", col: number | "sum"): Work {
  const b = breakdownOf(ctx, letter);
  const t = yearTable(ctx, letter);
  const scope = col === "sum" ? l6Scope(ctx, letter) : ownYearScope(ctx, letter, col);
  const values = t.years.map((y) => (what === "credited" ? y.credited : y.totalRewards - y.afterTax));
  const sum = values.reduce((s, v) => s + v, 0);
  const id = (k: number | "sum"): MetricId => `a5.${letter}.${what === "month" ? "added" : what}.${k}`;
  if (what === "month") {
    const months = 12 * b.years;
    return {
      title: `${letter}-5 · the benefits, a month over its stay`, scope: l6Scope(ctx, letter),
      lines: [
        { label: "Total rewards less after-tax pay, over its stay", value: figure(sum), ref: id("sum") },
        { op: "÷", label: "Months in its stay", value: String(months) },
        { op: "=", label: "A month", value: dollars(sum / months), rule: "double" },
      ],
      notes: ["As paid, not discounted: A-1's months are present values, so they read lower for money paid later."], ties: [], uses: [],
    };
  }
  if (col === "sum") {
    return {
      title: `${letter}-5 · ${what === "credited" ? "employer 401(k) money credited" : "total rewards less after-tax pay"}, years 1–${b.years}`, scope,
      lines: [
        ...values.map((v, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Year ${i + 1}`, value: i ? figure(v) : signed(v), ref: id(i + 1) })),
        { op: "=", label: "The years, added", value: signed(sum), rule: "double" },
      ],
      notes: ["Footed across: each year as shown, added."], ties: [], uses: values.map((_, i) => id(i + 1)),
    };
  }
  const y = t.years[col - 1];
  if (!y) throw new Error(`Year ${col} isn't in its stay.`);
  if (what === "credited") {
    return {
      title: `${letter}-5 · year ${col} · employer 401(k) money credited`, scope,
      lines: [{ label: "Credited in the year: the match on your deferrals and any non-elective money", value: figure(y.credited), tick: "recomputed" }],
      notes: ["The match is worked out per paycheck on your actual deferral rate, with no year-end true-up. Only the part vested by the end of your stay counts in total rewards."],
      ties: [`a2.${letter}.${col}.credited`], ...fromInputs(ctx, letter, ["retirement.contributionPct", "retirement.match", "retirement.nonElectivePct"]),
    };
  }
  return {
    title: `${letter}-5 · year ${col} · total rewards less after-tax pay`, scope,
    lines: [
      { label: "Total rewards", value: figure(y.totalRewards), ref: `l6y.${letter}.totalRewards.${col}` },
      { op: "−", label: "After-tax pay", value: figure(y.afterTax), ref: `l6y.${letter}.afterTax.${col}` },
      { op: "=", label: "What the benefits add", value: signed(y.totalRewards - y.afterTax), rule: "double" },
    ],
    notes: ["The vested employer 401(k) money, employer HSA money and perks, less expected out-of-pocket health costs."], ties: [], uses: [],
  };
}

/** A-6: a calendar year's pay, tax, tax by kind, or rate. */
function taxYearWork(ctx: WorkContext, letter: L, year: number, line: A6Line): Work {
  const b = breakdownOf(ctx, letter);
  const r = taxYearsOf(b.detail, b.window).find((x) => x.year === year);
  if (!r) throw new Error(`No ${year} tax for ${letter} in its stay.`);
  const v = r.values;
  const scope = `Base case · calendar year ${year}${r.projectedLaw ? " · tax law projected from 2026" : " · 2026 tax law"} · $, as paid`;
  const title = (what: string) => `${letter}-6 · ${year} · ${what}`;
  const KIND: Record<"federal" | "fica" | "state" | "local", string> = {
    federal: "federal income tax", fica: "Social Security and Medicare", state: "state income and payroll tax", local: "local income tax",
  };
  switch (line) {
    case "gross":
      return { title: title("the offer's pay"), scope, lines: [{ label: `The offer's pay in ${year}`, value: figure(v.gross), tick: "recomputed" }],
        notes: [`Its payments dated in ${year}, added: ${letter}-7 lists each one.`], ties: [], uses: [] };
    case "tax":
      return {
        title: title("the offer's tax"), scope,
        lines: [
          ...(["federal", "fica", "state", "local"] as const).filter((k) => k === "federal" || v[k]).map((k, i): WorkLine => ({
            ...(i ? { op: "+" as const } : {}), label: KIND[k][0].toUpperCase() + KIND[k].slice(1), value: signed(v[k]), ref: `a6.${letter}.${year}.${k}` })),
          { op: "=", label: "The offer's tax", value: figure(v.tax), rule: "double" },
        ],
        notes: ["Household tax with the offer less without it, by kind (M-4)."], ties: [], uses: [],
      };
    case "federal": {
      const others = (["fica", "state", "local"] as const).filter((k) => v[k]);
      return {
        title: title("federal income tax"), scope,
        lines: [
          { label: "The offer's tax", value: figure(v.tax), ref: `a6.${letter}.${year}.tax` },
          ...others.map((k): WorkLine => ({ op: "−", label: KIND[k][0].toUpperCase() + KIND[k].slice(1), value: figure(v[k]), ref: `a6.${letter}.${year}.${k}` })),
          { op: "=", label: "Federal income tax", value: signed(v.federal), rule: "double" },
        ],
        notes: ["The largest line takes the rounding, so the kinds add to the tax as shown."], ties: [], uses: [],
      };
    }
    case "fica": case "state": case "local":
      return { title: title(KIND[line]), scope, lines: [{ label: `${KIND[line][0].toUpperCase()}${KIND[line].slice(1)}, with the offer less without it`, value: signed(v[line]), tick: "recomputed" }],
        notes: ["The tax engine's figures for the household with the offer and without it, the difference rounded once."], ties: [], uses: [] };
    case "rate":
      return {
        title: title(`the offer's tax, of its ${year} pay`), scope,
        lines: [
          { label: "The offer's tax", value: figure(v.tax), ref: `a6.${letter}.${year}.tax` },
          { op: "÷", label: "Its pay", value: figure(v.gross), ref: `a6.${letter}.${year}.gross` },
          { op: "=", label: `Of its ${year} pay`, value: partsRate(r.rate), rule: "double" },
        ],
        notes: ["Its effective rate: every tax on the offer's pay that year over the pay. It isn't your top rate, which is higher (M-4)."], ties: [], uses: [],
      };
  }
}
