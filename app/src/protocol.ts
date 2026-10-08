import type { RentEstimate } from "../../src/col/rent";
import type { HorizonSweep, Household, OfferInput } from "../../src/offer/types";

// Messages between the main thread and the engine worker. Types and one key helper only: importing
// a value from engine.worker.ts would pull the engine and its data tables into the main bundle.

export interface CompareRequest {
  offers: OfferInput[];
  household: Household;
  /** Stay lengths in years; each is a comparison window from the earliest start. */
  stays: number[];
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

export type EngineResponse = { gen: number; rents: Record<string, RentEstimate>; ms: number } & (
  | { ok: true; sweep: HorizonSweep | null }
  | { ok: false; error: string }
);

export const rentKey = (area: string, state: string) => `${area}|${state}`;
