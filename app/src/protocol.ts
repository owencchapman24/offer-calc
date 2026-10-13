import type { RentEstimate } from "../../src/col/rent";
import type {
  Assumption, BreakevenResult, ClawbackResult, Cliff, Component, CostOfLivingInfo, EmploymentYearResult, EventDetail, HorizonSweep, Household,
  ISODate, LeaveDayRow, NextCliffResult, OfferInput, OfferWarning, RentFlipResult, ValueBasis, WindowTotals, WithholdingYear,
} from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";

// Messages between the main thread and the engine worker. Types and two small helpers only: importing
// a value from engine.worker.ts would pull the engine and its data tables into the main bundle.

export interface CompareRequest {
  offers: OfferInput[];
  household: Household;
  /** Stay lengths in years; each is a comparison window from the earliest start. */
  stays: number[];
  /** Your stay: the one whose projections come back in full, for Show the work. */
  stayYears: number;
  valuationDate: string;
  inflation: number;
  discountRate: number;
}

export interface EngineRequest {
  /** The fast lane, every edit (the default). */
  lane?: "compare";
  gen: number;
  /** Null until at least two offers are complete: then only rent estimates are computed. */
  compare: CompareRequest | null;
  /** Every complete offer, to check (validateOffer) before anything is computed. Default: the compared offers. */
  check?: OfferInput[];
  /** Places (with the residence state) whose rent estimate the inputs show. */
  rents: Array<{ area: string; state: string }>;
}

/** One offer's base-scenario projection over your stay's window: what Show the work, L-1 and the bridge explain. */
export interface OfferDetail {
  window: WindowTotals;
  /** The same window in the bear and bull scenarios: L-2's range (docs/ui-design.md §4.4). */
  cases: { bear: WindowTotals; bull: WindowTotals };
  /** Federal withholding vs the offer's federal income tax, each calendar year of your stay, and the years short by $1,000 or more (L-5). */
  withholding: { years: WithholdingYear[]; warnings: OfferWarning[] };
  employmentYears: EmploymentYearResult[];
  costOfLiving?: CostOfLivingInfo;
  assumptions: Assumption[];
  warnings: OfferWarning[];
  /** Each calendar year with pay: the offer's gross and tax, its rate, and the tax by kind (with the offer minus without). */
  taxYears: Array<{ year: number; gross: number; tax: number; rate: number; projectedLaw: boolean;
    parts: { federal: number; fica: number; state: number; local: number } }>;
  /** Gross and tax by employment year and calendar year: how a year's tax splits across tax years. Payments as posted, to the cent, added. */
  split: Array<{ ey: number; year: number; gross: number; tax: number }>;
  /**
   * Each employment year's payments as posted: each to the cent, as the engine rounds it, added exactly, by component, and their tax.
   * L-6 lists the payments; the year figures (footing.ts) round these sums, so a year's lines tie to its payments.
   */
  posted: Array<{ ey: number; salary: number; bonus: number; cash: number; rsu: number; clawback: number; tax: number }>;
  /** Bonus payments: when, how much, for which stretch of work. */
  bonuses: Array<{ ey: number; date: ISODate; gross: number; periodFrom: ISODate; periodTo: ISODate }>;
  /** RSU vests: when, how much, which grant, and the date the schedule named if a company vest date moved it. */
  rsus: Array<{ ey: number; date: ISODate; gross: number; refresher: boolean; tranche: number; tranches: number;
    priceFactor: number; nominalDate?: ISODate }>;
}

export interface AnnuityTerm { date: ISODate; days: number; factor: number }

export interface StayDetail {
  years: number;
  /** In the order of the request's offers. */
  offers: OfferDetail[];
  /** How many warnings change the numbers over your stay (warningKinds.ts): the lead schedule points to L-5 when any do. */
  changes: number;
  /** Each stay's month-end discount factors (they sum to its row's annuityFactor), by stay length. */
  annuity: Record<number, AnnuityTerm[]>;
  /**
   * After rent (every offer has a city): each offer's rent lever over your stay, as in L-3: the first lease year's rent at
   * which it ties `against` (the winner; for the winner, the runner-up). The lead's rent note reads it.
   */
  rentFlips?: Array<{ against: number; flip: RentFlipResult }>;
}

export type EngineResponse = {
  lane: "compare"; gen: number; rents: Record<string, RentEstimate>; ms: number;
  /** The validator's problems for each checked offer, in order: all empty when the comparison ran. */
  issues: OfferIssue[][];
} & (
  | { ok: true; sweep: HorizonSweep | null; detail: StayDetail | null }
  /** error null: the inputs have problems (`issues`), so nothing was computed. */
  | { ok: false; error: string | null }
);

export const rentKey = (area: string, state: string) => `${area}|${state}`;

// ---- the slow lane (jobs.ts): L-4's leave sweep and its panel at the cursor, breakeven (L-3 and the
// close-call line), and L-6's payments and tax years ----------------------------------------------------

/** What every slow job projects: the compared offers, in the comparison's order. */
interface SlowBase { gen: number; offers: OfferInput[]; household: Household; inflation: number }

/** L-4's curves: what each offer keeps for every last day up to `end` (exclusive), and its cliffs. */
export interface LeaveRequest extends SlowBase { lane: "leave"; end: ISODate }
export interface LeaveCurve {
  /** Every cliff from the offer's start to `end`, in date order. */
  cliffs: Cliff[];
  /** The start day, each month's end, and the day before and the day of each cliff off a month's end. */
  points: LeaveDayRow[];
}

/** L-4's panel: each offer if your last day is `leaveDate`. */
export interface CursorRequest extends SlowBase { lane: "cursor"; leaveDate: ISODate }
/** One offer if `leaveDate` is your last day, nominal. Null in the response for an offer that hasn't started by then. */
export interface LeavePanel {
  leaveDate: ISODate;
  /** Pay received (salary, bonuses, cash awards, vested RSUs) and clawbacks repaid, before tax. */
  paid: number;
  repaid: number;
  /** The offer's tax, net of any relief on clawbacks repaid, and your health premiums. */
  tax: number;
  premiums: number;
  /** Clawbacks owed, and each award's terms (owed, tax relief, net cost). */
  clawbackOwed: number;
  clawbacks: ClawbackResult[];
  /** paid - repaid - tax - premiums. */
  afterTaxCompKept: number;
  /** afterTaxCompKept + retirementVested + perks + employer HSA - out-of-pocket. */
  totalRewardsKept: number;
  benefits: { perks: number; employerHsa: number; outOfPocket: number };
  retirementVested: number;
  retirementForfeited: number;
  /** RSUs granted by then but not vested, at grant value. */
  unvestedRsuForfeited: number;
  /** The next cliff after `leaveDate`, past a prorated clawback's monthly steps. */
  next: NextCliffResult["next"];
  /** What leaving that day sets off: a bonus forfeited, FICA on a later-year clawback. */
  warnings: OfferWarning[];
}

/** L-4's panel at a last day for a comparison: L-4 and the document ask alike, so they share the result. */
export const cursorJobFor = (c: CompareRequest, leaveDate: ISODate): Omit<CursorRequest, "gen"> => ({
  lane: "cursor", offers: c.offers, household: c.household, inflation: c.inflation, leaveDate,
});

/**
 * Breakeven over your stay (docs/ui-design.md §4.6, §4.1): base case, present value on `basis`, over the
 * comparison window (the earliest start of every offer, for your stay). "flip": the close-call line's one,
 * the runner-up's starting salary that ties the winner. "breakeven": L-3, every offer behind the winner
 * (its salary, its first cash award, and on the after-rent basis its rent), then the winner's cushion
 * against the runner-up.
 */
export interface BreakevenRequest extends SlowBase {
  lane: "flip" | "breakeven";
  valuationDate: ISODate;
  discountRate: number;
  stayYears: number;
  basis: ValueBasis;
  /** Indexes into `offers`: who leads on `basis`, and who's second. */
  winner: number;
  runnerUp: number;
}
/** What it would take for offer `offer` to tie offer `against` (indexes in the comparison's order). */
export interface TieRow {
  offer: number;
  against: number;
  salary: BreakevenResult;
  /** Its first cash award, or a sign-on paid 30 days after the start (L-3 only). */
  cash?: BreakevenResult;
  /** Its first lease year's rent (L-3, after rent only). */
  rent?: RentFlipResult;
}
export interface Ties { basis: ValueBasis; rows: TieRow[] }

/**
 * A breakeven request for a comparison, a basis and its lead. The lead schedule and L-3 build theirs here
 * alike, so the worker can reuse the close-call line's result in L-3.
 */
export const tieJob = (lane: BreakevenRequest["lane"], c: CompareRequest, basis: ValueBasis, lead: { winner: number; runnerUp: number }):
  Omit<BreakevenRequest, "gen"> => ({
  lane, offers: c.offers, household: c.household, inflation: c.inflation, valuationDate: c.valuationDate, discountRate: c.discountRate,
  stayYears: c.stayYears, basis, winner: lead.winner, runnerUp: lead.runnerUp,
});

// ---- L-6, the work: every payment and each calendar year's tax (docs/ui-design.md §4.8), sent only once L-6 is open ------

/** Your stay's projection, base case, over the comparison window: as the fast lane projects it, so the figures tie. */
export interface WorkRequest extends SlowBase { lane: "work"; valuationDate: ISODate; discountRate: number; stayYears: number }
/** A payment: dated and rounded to the cent as the engine has it, with its share of its calendar year's tax. */
export interface WorkPayment { date: ISODate; component: Component; detail: EventDetail; gross: number; tax: number; calendarYear: number; ey: number }
/** One run of the tax engine for a calendar year (with the offer, or without it): what went in and what came out, unrounded. */
export interface TaxRun {
  wages: number; spouseWages: number; pretax401k: number; section125: number;
  taxableIncome: number; federal: number; ss: number;
  /** Medicare, the additional 0.9% included. */
  medicare: number;
  stateIncome: number; statePayroll: number; local: number; total: number;
}
/** A calendar year's tax: with the offer and without it; the offer's share is the difference, spread over its payments at `offerTaxRate`. */
export interface WorkTaxYear {
  year: number; projectedLaw: boolean; offerGross: number; offerTax: number; offerTaxRate: number; with: TaxRun; without: TaxRun;
}
/**
 * One offer's payments in the calendar years its stay touches, those past its stay's employment years included (they're
 * taxed with its last year), and those years' tax.
 */
export interface WorkOffer { payments: WorkPayment[]; taxYears: WorkTaxYear[] }

/** L-6's request for a comparison: the lead schedule's and L-6's are built alike, so a result can be matched to its inputs. */
export const workJob = (c: CompareRequest): Omit<WorkRequest, "gen"> => ({
  lane: "work", offers: c.offers, household: c.household, inflation: c.inflation, valuationDate: c.valuationDate, discountRate: c.discountRate,
  stayYears: c.stayYears,
});

export type SlowRequest = LeaveRequest | CursorRequest | BreakevenRequest | WorkRequest;
export type SlowLane = SlowRequest["lane"];
export type SlowResponse = { gen: number; /** From the request's arrival to the result: the wait included. */ ms: number } & (
  | { lane: "leave"; ok: true; curves: LeaveCurve[] }
  | { lane: "cursor"; ok: true; panels: Array<LeavePanel | null> }
  | { lane: "flip" | "breakeven"; ok: true; ties: Ties }
  | { lane: "work"; ok: true; work: WorkOffer[] }
  | { lane: SlowLane; ok: false; error: string }
);
