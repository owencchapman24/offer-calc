import { cityByCode } from "../../src/col/cities";

// "Prices in" (docs/ui-design.md §5, item 6; slice 8): the place whose prices every after-rent figure is
// stated in. The U.S. average by default; any city in the list instead, whose own price factor is then 1.
// Every label that names the prices ("after rent, at Charlotte prices", "Charlotte $") comes from here.

/** BEA's U.S. row: the default. */
export const US_PRICES = "00000";

export interface PriceWords {
  code: string;
  us: boolean;
  /** Before "prices": "U.S." or "Charlotte". */
  place: string;
  /** The place in full: "the U.S. average" or "Charlotte-Concord-Gastonia, NC-SC". */
  name: string;
  /** "after rent, at Charlotte prices" */
  phrase: string;
  /** A column's units: "U.S.-avg $" or "Charlotte $". */
  unit: string;
  /** "U.S.-average dollars" or "Charlotte dollars". */
  dollars: string;
  /** After "priced as in": "an average U.S. city" or "Charlotte". */
  city: string;
  /** After "5.8% above": "the U.S. average" or "Charlotte's". */
  average: string;
}

/** The words for a "Prices in" choice. An unknown code reads as the U.S. average (the import check keeps them out). */
export function priceWords(code: string | undefined): PriceWords {
  const c = code && code !== US_PRICES ? cityByCode(code) : undefined;
  if (!c) {
    return { code: US_PRICES, us: true, place: "U.S.", name: "the U.S. average", phrase: "after rent, at U.S. prices", unit: "U.S.-avg $",
      dollars: "U.S.-average dollars", city: "an average U.S. city", average: "the U.S. average" };
  }
  const place = shortCity(c.name);
  return { code: c.code, us: false, place, name: c.name, phrase: `after rent, at ${place} prices`, unit: `${place} $`, dollars: `${place} dollars`,
    city: place, average: `${place}'s` };
}

/** Single principal cities whose own name has a hyphen; other metro titles join several cities with one. */
const HYPHENATED = new Set(["Winston-Salem"]);

/**
 * A place's short name, from a BEA or city-list name: the metro's first principal city ("New York-Newark-Jersey
 * City, NY-NJ" -> "New York", "Scranton--Wilkes-Barre, PA" -> "Scranton", "Winston-Salem, NC" -> "Winston-Salem"), or
 * "nonmetro Maine" for a state's area outside metros ("Maine, outside metro areas", "Maine (Nonmetropolitan Portion)").
 * Census titles separate cities with "--" when one of them has a hyphen in its own name.
 */
export function shortCity(name: string): string {
  const outside = name.match(/^(.+?)(?:, outside metro areas| \(Nonmetropolitan Portion\))$/);
  if (outside) return `nonmetro ${outside[1]}`;
  const first = name.split(",")[0].replace(/ \(?Metropolitan Statistical Area\)?$/, "").trim();
  const city = first.includes("--") ? first.split("--")[0] : HYPHENATED.has(first) ? first : first.split("-")[0];
  return city.split("/")[0].trim();
}
