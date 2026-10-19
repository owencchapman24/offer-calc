import type { OfferWarning } from "../../src/offer/types";

// L-5's kinds for the engine's warnings (docs/ui-design.md §4.7), which of them fall in your stay, and the
// count the lead schedule points with. Leave-date warnings (a bonus forfeited, FICA on a later-year
// clawback) belong to L-4's panel, so they have no kind here. Kept apart from warningAt.ts so the main
// thread takes only this.

/** L-5's kinds: what changes your numbers, what the model leaves out that may cost you, and cash timing. */
export type WarningKind = "changes" | "notModeled" | "cash";

export const WARNING_KIND: Record<OfferWarning["code"], WarningKind | null> = {
  k401Cap: "changes", hsaCap: "changes", section127Cap: "changes", commuterCap: "changes", bonusCutoff: "changes",
  convenienceRule: "notModeled", unlimitedVacation: "notModeled", withholdingShortfall: "cash", bonusForfeited: null, clawbackFica: null,
};

/** A calendar year a warning is about, if it's about one (a limit reached that year, a shortfall on its pay). */
export const yearOf = (w: OfferWarning) => ("year" in w.params ? (w.params as { year: number }).year : null);

/**
 * An offer's warnings L-5 lists, for your stay's calendar years (the projection runs on past the stay), one
 * per kind of warning: the same warning in several years is one, its years listed.
 */
export function stayWarnings(warnings: OfferWarning[], lastYear: number): OfferWarning[][] {
  const groups = new Map<string, OfferWarning[]>();
  for (const w of warnings) {
    const year = yearOf(w);
    if (!WARNING_KIND[w.code] || (year !== null && year > lastYear)) continue;
    const key = year === null ? JSON.stringify(w) : w.code;
    const list = groups.get(key) ?? [];
    if (!list.some((x) => JSON.stringify(x) === JSON.stringify(w))) list.push(w);
    groups.set(key, list);
  }
  return [...groups.values()];
}

/** How many warnings change your numbers over your stay (a warning in several years counts once): the lead points to L-5 when any do. */
export const changingWarnings = (offers: Array<{ warnings: OfferWarning[] }>, lastYear: number) =>
  offers.reduce((n, d) => n + stayWarnings(d.warnings, lastYear).filter((g) => WARNING_KIND[g[0].code] === "changes").length, 0);
