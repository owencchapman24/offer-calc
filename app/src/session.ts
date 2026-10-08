import type { Basis } from "../../src/offer/types";
import { type AppHousehold, type AppOffer, blankOffer, DEFAULT_HOUSEHOLD, type Letter, LETTERS, type QuickFields, sampleOffers } from "./model";

// Everything the user has entered, plus UI choices. Serializable: saved in this browser only.

export type Theme = "system" | "light" | "dark";

export interface Session {
  schemaVersion: 1;
  household: AppHousehold;
  offers: AppOffer[];
  ui: { basis: Basis; theme: Theme };
}

export const STORAGE_KEY = "offer-calc:v1";

export function initialSession(today: string): Session {
  return { schemaVersion: 1, household: DEFAULT_HOUSEHOLD, offers: sampleOffers(today), ui: { basis: "colAdjustedTotal", theme: "system" } };
}

export type Action =
  | { type: "household"; patch: Partial<AppHousehold> }
  | { type: "offer"; id: string; patch: Partial<QuickFields> }
  | { type: "addOffer" }
  | { type: "removeOffer"; id: string }
  | { type: "loadSamples"; today: string }
  | { type: "startBlank" }
  | { type: "basis"; basis: Basis }
  | { type: "theme"; theme: Theme };

export function reducer(s: Session, a: Action): Session {
  switch (a.type) {
    case "household": return { ...s, household: { ...s.household, ...a.patch } };
    case "offer":
      return { ...s, offers: s.offers.map((o) => o.id !== a.id ? o
        : { ...o, quick: { ...o.quick, ...a.patch }, sample: o.sample === "sample" ? "edited" : o.sample }) };
    case "addOffer": {
      const free = LETTERS.find((l) => !s.offers.some((o) => o.letter === l));
      return free ? { ...s, offers: [...s.offers, blankOffer(free)].sort(byLetter) } : s;
    }
    case "removeOffer": return { ...s, offers: s.offers.filter((o) => o.id !== a.id) };
    case "loadSamples": return { ...s, household: DEFAULT_HOUSEHOLD, offers: sampleOffers(a.today) };
    case "startBlank": return { ...s, household: DEFAULT_HOUSEHOLD, offers: (["A", "B"] as Letter[]).map(blankOffer) };
    case "basis": return { ...s, ui: { ...s.ui, basis: a.basis } };
    case "theme": return { ...s, ui: { ...s.ui, theme: a.theme } };
  }
}

const byLetter = (x: AppOffer, y: AppOffer) => x.letter.localeCompare(y.letter);

/** Storage that may be missing or blocked (private windows, previews): reads and writes never throw. */
export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadSession(store: KeyValueStore | undefined, today: string): Session {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Session;
      if (s?.schemaVersion === 1 && Array.isArray(s.offers) && s.household && s.ui) return s;
    }
  } catch { /* unreadable or blocked: start fresh */ }
  return initialSession(today);
}

/** True when saved; false when storage is unavailable (the app then keeps state in memory only). */
export function saveSession(store: KeyValueStore | undefined, s: Session): boolean {
  try {
    if (!store) return false;
    store.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
