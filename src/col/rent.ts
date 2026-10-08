import fmrData from "./fmr.json";
import { NATIONAL, rppArea } from "./index";

// Rent estimates for an offer's area when you haven't entered your rent: HUD's Fair Market Rent for
// the metro first, BEA's housing price level as the fallback (areas without FMRs: state nonmetro
// portions). Both are labeled estimates in the UI.

export interface FmrArea { name: string; cbsa: string; states: string[]; pop: number; fmr: number[] }

export interface FmrData {
  source: string;
  url: string;
  fiscalYear: number;
  effective: string;
  published: string | null;
  fetchedOn: string;
  definition: string;
  bedrooms: string[];
  areas: Record<string, FmrArea>;
}

/** HUD Fair Market Rents, metro areas, baked into fmr.json by `npm run fetch-fmr`. */
export const FMR = fmrData as unknown as FmrData;

/**
 * Median gross rent, United States, 2024 ACS 1-year estimate (table B25064, B25064_001E): $1,487,
 * margin of error +/-3. Checked against data.census.gov (ACSDT1Y2024.B25064, 2026-10-08). All unit
 * sizes, utilities included. The anchor for BEA-derived estimates when you give no rent of your own.
 */
export const US_MEDIAN_GROSS_RENT = 1_487;

/** Bedrooms for an FMR: 0 is a studio. */
export type Bedrooms = 0 | 1 | 2 | 3 | 4;

/**
 * The HUD FMR area for a BEA metro (GeoFIPS = CBSA code). Big metros span several FMR areas (New York
 * has seven); we take the one holding most of the metro's 2024 population, among those in your
 * residence state when any are. Undefined for areas HUD doesn't cover by metro (state nonmetro portions).
 */
export function fmrArea(beaCode: string, residenceState?: string): (FmrArea & { code: string }) | undefined {
  const inMetro = Object.entries(FMR.areas).filter(([, a]) => a.cbsa === beaCode);
  const inState = inMetro.filter(([, a]) => residenceState !== undefined && a.states.includes(residenceState));
  const pool = inState.length > 0 ? inState : inMetro;
  if (pool.length === 0) return undefined;
  const [code, area] = pool.reduce((best, x) => (x[1].pop > best[1].pop ? x : best));
  return { code, ...area };
}

export type RentEstimate =
  | { monthlyRent: number; source: "fmr"; hudArea: string; hudAreaName: string; bedrooms: Bedrooms; fiscalYear: number }
  /** anchorRent in anchorArea, times the area's housing (rents) RPP / the anchor area's. */
  | { monthlyRent: number; source: "derived"; anchorRent: number; anchorArea: string; housingRatio: number };

/**
 * Rent for an area when you haven't entered yours. HUD's FMR (1 bedroom by default) when the metro has
 * one; otherwise an anchor rent scaled by the housing RPPs. The anchor is the rent you give for a
 * reference location, or the U.S. median gross rent.
 */
export function estimateRent(
  beaCode: string, residenceState: string | undefined,
  opts: { bedrooms?: Bedrooms; anchorRent?: number; anchorArea?: string } = {},
): RentEstimate {
  const bedrooms = opts.bedrooms ?? 1;
  const hud = fmrArea(beaCode, residenceState);
  if (hud) {
    return { monthlyRent: hud.fmr[bedrooms], source: "fmr", hudArea: hud.code, hudAreaName: hud.name, bedrooms,
      fiscalYear: FMR.fiscalYear };
  }
  const anchorArea = opts.anchorRent !== undefined ? opts.anchorArea ?? NATIONAL : NATIONAL;
  const anchorRent = opts.anchorRent ?? US_MEDIAN_GROSS_RENT;
  const housingRatio = rppArea(beaCode).housing / rppArea(anchorArea).housing;
  return { monthlyRent: anchorRent * housingRatio, source: "derived", anchorRent, anchorArea, housingRatio };
}
