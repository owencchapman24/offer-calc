import type { AppOffer, Letter, OfferDraft } from "./model";

// Comparability (docs/slice-3-plan.md, decision 5): a cost or benefit counted for some offers but not
// others tilts the comparison, so the lead schedule says so, naming who and what. A category is
// counted when it's entered (an explicit $0 counts: the offer has none). Offer terms that are simply
// absent, such as no RSUs or no sign-on, aren't asymmetries: that offer is just smaller.

export type Category = "premium" | "outOfPocket" | "employer401k" | "employerHsa" | "perks" | "hours";

export interface Asymmetry {
  category: Category;
  /** Offers that have it, and offers that don't, by letter. */
  counted: Letter[];
  missing: Letter[];
}

/** Whether each category is entered for an offer. */
const COUNTED: Record<Category, (d: OfferDraft) => boolean> = {
  premium: (d) => d.health?.premium != null,
  outOfPocket: (d) => !!d.health && (d.health.outOfPocket.low != null || d.health.outOfPocket.medium != null || d.health.outOfPocket.high != null),
  employer401k: (d) => d.retirement !== null,
  employerHsa: (d) => d.health?.employerHsa != null,
  perks: (d) => d.perks.section127 !== null || d.perks.commuterMonthly !== null,
  hours: (d) => d.hours.weekly !== null,
};

/** Costs: leaving one out flatters the offer without it. Benefits flatter the offers that have them. */
const COST: Record<Category, boolean> = { premium: true, outOfPocket: true, employer401k: false, employerHsa: false, perks: false, hours: false };

const CATEGORIES = Object.keys(COUNTED) as Category[];

/** Each category counted for some of these offers but not all of them. */
export function asymmetries(offers: AppOffer[]): Asymmetry[] {
  return CATEGORIES.flatMap((category) => {
    const counted = offers.filter((o) => COUNTED[category](o.draft)).map((o) => o.letter);
    const missing = offers.filter((o) => !COUNTED[category](o.draft)).map((o) => o.letter);
    return counted.length && missing.length ? [{ category, counted, missing }] : [];
  });
}

const list = (ls: Letter[], word: "and" | "or") => (ls.length <= 1 ? ls.join("") : `${ls.slice(0, -1).join(", ")} ${word} ${ls[ls.length - 1]}`);

/**
 * In words: "Health premiums are counted for A but not for B. If B has a health plan, add it: otherwise
 * the comparison favors B."
 */
export function asymmetryText(a: Asymmetry): string {
  const yes = list(a.counted, "and");
  const no = list(a.missing, "or");
  const them = list(a.missing, "and");
  const one = a.missing.length === 1;
  const favors = COST[a.category] ? them : yes;
  const otherwise = `otherwise the comparison favors ${favors}.`;
  switch (a.category) {
    case "premium":
      return `Health premiums are counted for ${yes} but not for ${no}. If ${them} ${one ? "has" : "have"} a health plan, add it: ${otherwise}`;
    case "outOfPocket":
      return `Out-of-pocket health costs are counted for ${yes} but not for ${no}. If ${them} ${one ? "has" : "have"} a health plan, add its costs: ${otherwise}`;
    case "employer401k":
      return `A 401(k) is counted for ${yes} but not for ${no}. If ${them} ${one ? "offers" : "offer"} one, add it with its match: ${otherwise}`;
    case "employerHsa":
      return `Employer HSA money is counted for ${yes} but not for ${no}. If ${one ? `${them}'s plan puts` : "their plans put"} money in an HSA, `
        + `add it: ${otherwise}`;
    case "perks":
      return `Perks are counted for ${yes} but not for ${no}. If ${them} ${one ? "offers" : "offer"} education or commuter benefits, add them: ${otherwise}`;
    case "hours":
      return `Weekly hours are entered for ${yes} but not for ${no}, so nothing is compared per hour. Add ${one ? `${them}'s` : "their"} hours to compare `
        + "per hour.";
  }
}
