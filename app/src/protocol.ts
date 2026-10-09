import type { RentEstimate } from "../../src/col/rent";
import type {
  Assumption, BreakevenResult, ClawbackResult, Cliff, CostOfLivingInfo, EmploymentYearResult, HorizonSweep, Household, ISODate, LeaveDayRow,
  NextCliffResult, OfferInput, OfferWarning, RentFlipResult, ValueBasis, WindowTotals, WithholdingYear,
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
  /** Gross and tax by employment year and calendar year: how a year's tax splits across tax years. */
  split: Array<{ ey: number; year: number; gross: number; tax: number }>;
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

// ---- the slow lane (jobs.ts): L-4's leave sweep and its panel at the cursor, and breakeven (L-3 and the
// close-call line) ------------------------------------------------------------------------------------

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

export type SlowRequest = LeaveRequest | CursorRequest | BreakevenRequest;
export type SlowLane = SlowRequest["lane"];
export type SlowResponse = { gen: number; /** From the request's arrival to the result: the wait included. */ ms: number } & (
  | { lane: "leave"; ok: true; curves: LeaveCurve[] }
  | { lane: "cursor"; ok: true; panels: Array<LeavePanel | null> }
  | { lane: "flip" | "breakeven"; ok: true; ties: Ties }
  | { lane: SlowLane; ok: false; error: string }
);
