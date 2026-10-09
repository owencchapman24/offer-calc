// The methodology's sections (docs/ui-design.md §8). Every figure's Show the work names one, so the
// list lives here, apart from the page's prose, which is loaded only when you open it.

export const SECTIONS = {
  "M-1": "The pipeline",
  "M-2": "Pay",
  "M-3": "Equity",
  "M-4": "Tax",
  "M-5": "Benefits and hours",
  "M-5.1": "401(k)",
  "M-5.2": "Health",
  "M-5.3": "Perks",
  "M-5.4": "Hours and per hour",
  "M-5.5": "Pay per extra hour",
  "M-6": "Cost of living",
  "M-6.1": "Prices",
  "M-6.2": "Rent",
  "M-6.3": "After rent, at U.S. prices",
  "M-6.4": "What it leaves out",
  "M-7": "Time",
  "M-7.1": "Present value",
  "M-7.2": "Per month",
  "M-7.3": "The stay and the window",
  "M-7.4": "What it would take",
  "M-8": "Scenarios",
  "M-9": "Leaving early",
  "M-10": "Known gaps",
  "M-11": "Data and sources",
  "M-12": "Your assumptions",
  "M-13": "Tickmarks",
} as const;

export type SectionId = keyof typeof SECTIONS;

/** A section's title. M-6.3's names the prices picked under Prices in: "After rent, at Charlotte prices". */
export const sectionTitle = (id: SectionId, place = "U.S."): string => (id === "M-6.3" ? `After rent, at ${place} prices` : SECTIONS[id]);
