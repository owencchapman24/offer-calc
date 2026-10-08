import type { RentEstimate } from "../../src/col/rent";
import type {
  Assumption, CostOfLivingInfo, EmploymentYearResult, HorizonSweep, Household, ISODate, OfferInput, OfferWarning, WindowTotals,
} from "../../src/offer/types";

// Messages between the main thread and the engine worker. Types and one key helper only: importing
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
  gen: number;
  /** Null until at least two offers are complete: then only rent estimates are computed. */
  compare: CompareRequest | null;
  /** Places (with the residence state) whose rent estimate the inputs show. */
  rents: Array<{ area: string; state: string }>;
}

/** One offer's base-scenario projection over your stay's window: what Show the work, L-1 and the bridge explain. */
export interface OfferDetail {
  window: WindowTotals;
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
  /** Each stay's month-end discount factors (they sum to its row's annuityFactor), by stay length. */
  annuity: Record<number, AnnuityTerm[]>;
}

export type EngineResponse = { gen: number; rents: Record<string, RentEstimate>; ms: number } & (
  | { ok: true; sweep: HorizonSweep | null; detail: StayDetail | null }
  | { ok: false; error: string }
);

export const rentKey = (area: string, state: string) => `${area}|${state}`;
