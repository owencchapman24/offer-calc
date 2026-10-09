import { describe, expect, it } from "vitest";
import { asymmetries, asymmetryText, type Category, CATEGORY_INPUT, enterable } from "./comparability";
import { type AppOffer, blankDraft, sampleOffers } from "./model";
import { context, renderAllInputs, renderPage } from "./testing";

// Step 0.5: a cost or benefit counted for some offers but not others is named under the verdict, and
// no per-hour figure shows unless every offer has hours.

const TODAY = "2026-10-08";
const samples = () => sampleOffers(TODAY);
const edit = (o: AppOffer, f: (d: AppOffer["draft"]) => AppOffer["draft"]): AppOffer => ({ ...o, draft: f(o.draft) });

describe("the comparability warning", () => {
  it("the samples are like for like: a benefit a sample doesn't have is entered as $0", () => {
    expect(asymmetries(samples())).toEqual([]);
  });

  it("names each category counted for some offers but not others, and who it favors", () => {
    const [a, b, c] = samples();
    const cases: Array<[string, AppOffer[], string]> = [
      ["premium", [a, edit(b, (d) => ({ ...d, health: { ...d.health!, premium: null } }))],
        "Health premiums are counted for A but not for B. If B has a health plan, add it: otherwise the comparison favors B."],
      ["outOfPocket", [a, edit(b, (d) => ({ ...d, health: { ...d.health!, outOfPocket: { low: null, medium: null, high: null } } }))],
        "Out-of-pocket health costs are counted for A but not for B. If B has a health plan, add its costs: otherwise the comparison favors B."],
      ["employer401k", [a, edit(b, (d) => ({ ...d, retirement: null })), edit(c, (d) => ({ ...d, retirement: null }))],
        "A 401(k) is counted for A but not for B or C. If B and C offer one, add it with its match: otherwise the comparison favors A."],
      ["employerHsa", [a, edit(b, (d) => ({ ...d, health: { ...d.health!, employerHsa: null } }))],
        "Employer HSA money is counted for A but not for B. If B's plan puts money in an HSA, add it: otherwise the comparison favors A."],
      ["perks", [edit(a, (d) => ({ ...d, perks: { section127: null, commuterMonthly: null } })), c],
        "Perks are counted for C but not for A. If A offers education or commuter benefits, add them: otherwise the comparison favors C."],
      ["hours", [a, edit(b, (d) => ({ ...d, hours: { weekly: null, weeksPerYear: null } }))],
        "Weekly hours are entered for A but not for B, so nothing is compared per hour. Add B's hours to compare per hour."],
    ];
    for (const [category, offers, text] of cases) {
      const found = asymmetries(offers);
      if (!enterable(category as Category)) {
        expect(found, `${category} can't be entered yet, so it isn't named`).toEqual([]);
        continue;
      }
      expect(found.map((x) => x.category), category).toEqual([category]);
      expect(asymmetryText(found[0]), category).toBe(text);
    }
  });

  it("says nothing when no offer has it either", () => {
    const blank = (letter: "A" | "B"): AppOffer => ({ id: letter, letter, sample: null, draft: blankDraft() });
    expect(asymmetries([blank("A"), blank("B")])).toEqual([]);
  });

  it("your own offer beside the samples: each category you can enter is named, and only those", () => {
    const [a, b] = samples();
    const mine: AppOffer = { id: "C", letter: "C", sample: null, draft: { ...blankDraft(), salary: { ...blankDraft().salary, annual: 90_000 } } };
    const all: Category[] = ["premium", "outOfPocket", "employer401k", "employerHsa", "perks", "hours"];
    expect(asymmetries([a, b, mine]).map((x) => `${x.category}: ${x.missing.join("")}`)).toEqual(all.filter(enterable).map((c) => `${c}: C`));
  });

  it("never names a category you can't enter: each one it can name has its input on the page", () => {
    const html = renderAllInputs(context());
    for (const c of Object.keys(CATEGORY_INPUT) as Category[]) {
      expect(enterable(c), c).toBe(html.includes(`data-help="${CATEGORY_INPUT[c]}"`));
    }
  });
});

describe("per hour only when every offer has hours", () => {
  // Two offers, B without hours, on the per-hour basis as chosen: it can't be shown, so the verdict falls back.
  const ctx = context("perHour", (os) => os.filter((o) => o.letter !== "C").map((o) => (o.letter !== "B" ? o
    : edit(o, (d) => ({ ...d, hours: { weekly: null, weeksPerYear: null } })))));
  const html = renderPage(ctx) + renderPage(ctx, { running: true, bridgeOf: "B" });

  it("no per-hour figure for one offer shows alone: not in the rank list, L-1, pay per extra hour or the bridge", () => {
    expect(ctx.results!.view.basis).toBe("cash");
    expect(html).not.toMatch(/data-metric="(ph|avg|extra)\./);
    expect(html).not.toMatch(/an hour/);
    expect(html).not.toMatch(/per hour worked over/i);
  });
  it("the per-hour step is disabled and says whose hours are missing", () => {
    expect(ctx.results!.view.steps.find((s) => s.basis === "perHour")!.unavailable).toBe("Add weekly hours for B.");
    expect(html).toContain("Add weekly hours for B.");
  });
  it("the lead schedule names the hours asymmetry under the verdict", () => {
    expect(html).toContain("Weekly hours are entered for A but not for B, so nothing is compared per hour.");
  });
});
