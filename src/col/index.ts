import data from "./rpp.json";

// BEA Regional Price Parities, baked into rpp.json by `npm run fetch-rpp` (no runtime fetching).
// Index scale: U.S. all items = 100; components are price levels on the same scale, so areas are
// always compared through ratios to a reference row.

export type RppKind = "national" | "nationalNonmetro" | "msa" | "state" | "stateMetro" | "stateNonmetro";

export interface RppArea {
  name: string;
  kind: RppKind;
  allItems: number;
  goods: number;
  /** Services: housing (rents). */
  housing: number;
  utilities: number;
  otherServices: number;
}

export interface RppData {
  source: string;
  files: string[];
  vintage: string;
  dataYear: number;
  fetchedOn: string;
  nonHousing: { formula: string; housingWeight: number; source: string; crossCheck: string };
  areas: Record<string, RppArea>;
}

export const RPP = data as unknown as RppData;

/** The U.S. row: the default reference location. */
export const NATIONAL = "00000";

/**
 * Non-housing price level: all items with housing (rents) backed out at BEA's PCE-based
 * housing weight (16%, BEA Survey of Current Business, March 2022).
 */
export function nonHousingRpp(a: RppArea): number {
  const w = RPP.nonHousing.housingWeight;
  return (a.allItems - w * a.housing) / (1 - w);
}

/** The area for a BEA GeoFIPS code, e.g. "35620" (New York metro) or "37999" (NC nonmetro). */
export function rppArea(code: string): RppArea & { code: string } {
  const a = RPP.areas[code];
  if (!a) throw new Error(`Unknown BEA RPP area "${code}". Use findRppAreas() to look one up.`);
  return { code, ...a };
}

/** Areas whose name contains `query` (case-insensitive), e.g. findRppAreas("charlotte"). */
export function findRppAreas(query: string): Array<{ code: string; name: string; kind: RppKind }> {
  const q = query.toLowerCase();
  return Object.entries(RPP.areas)
    .filter(([, a]) => a.name.toLowerCase().includes(q))
    .map(([code, a]) => ({ code, name: a.name, kind: a.kind }));
}

const STATE_CODES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
  Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

/** States an area lies in, from BEA's name: "NY-NJ" for the New York metro, the state for a state portion. */
export function areaStates(code: string): string[] {
  const a = rppArea(code);
  if (a.kind === "msa") return a.name.match(/, ([A-Z]{2}(?:-[A-Z]{2})*) \(?Metropolitan Statistical Area\)?$/)?.[1].split("-") ?? [];
  const st = STATE_CODES[a.name.replace(/ \((?:Non)?[Mm]etropolitan Portion\)$/, "")];
  return st ? [st] : [];
}

/** Places a job could be: every metro area, and each state's area outside metros. */
export function cityOptions(): Array<{ code: string; name: string; states: string[] }> {
  return Object.entries(RPP.areas)
    .filter(([, a]) => (a.kind === "msa" || a.kind === "stateNonmetro") && a.allItems > 0 && a.housing > 0)
    .map(([code, a]) => ({
      code,
      name: a.kind === "msa"
        ? a.name.replace(/ \(?Metropolitan Statistical Area\)?$/, "")
        : `${a.name.replace(/ \(Nonmetropolitan Portion\)$/, "")}, outside metro areas`,
      states: areaStates(code),
    }))
    .filter((o) => o.states.length > 0)
    .sort((x, y) => x.name.localeCompare(y.name));
}
