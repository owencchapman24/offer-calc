import { cityByCode } from "../../src/col/cities";
import type { Basis, OfferInput } from "../../src/offer/types";
import {
  all, type AppHousehold, type AppOffer, blankDraft, blankOffer, completeSample, DEFAULT_HOUSEHOLD, fromOfferInput, type Letter, LETTERS,
  type OfferDraft, sampleOffers, setPath,
} from "./model";
import { US_PRICES } from "./prices";

// Everything the user has entered, plus UI choices. Serializable: saved in this browser only.

export type Theme = "system" | "light" | "dark";

export type Hint = "ticks" | "afterRent";

/** Whether the figures' tickmarks show. Hidden, every figure keeps a dotted underline and still opens its work. */
export type Ticks = "shown" | "hidden";

/** The ledger's sections in detailed mode (docs/ui-design.md §3.3), one open at a time. */
export type LedgerSection = "pay" | "bonus" | "cash" | "equity" | "retirement" | "health" | "perks" | "hours" | "where";

/** View choices remembered in this browser. The optional ones arrived after slice 1; saved sessions without them still load. */
export interface UiState {
  basis: Basis;
  theme: Theme;
  /** Hints dismissed with "Got it". */
  dismissed?: Partial<Record<Hint, true>>;
  /** L-1: each year or the running total, and whether the table view is open. */
  byYear?: { mode: "each" | "running"; table: boolean };
  /** The bridge's offer and employment year. */
  bridge?: { letter: Letter; year: number };
  /** Quick or detailed inputs. Default quick. */
  mode?: "quick" | "detailed";
  /** The open section in detailed mode; null: all closed. */
  section?: LedgerSection | null;
  /** The row editor open beneath a row: its row and offer. */
  editor?: { row: string; letter: Letter } | null;
  /** On a phone, the offer the ledger shows (its tab). Missing, or an offer that's gone: the first. */
  offerTab?: Letter;
  /** L-6, the work: whether its tables are open (closed by default), and the offer shown (missing, or gone: the first). */
  work?: { open: boolean; letter?: Letter };
  /** Tickmarks shown beside the figures (the default), or hidden for a cleaner read (docs/ui-design.md §9.1). */
  ticks?: Ticks;
}

export interface Session {
  schemaVersion: 3;
  household: AppHousehold;
  offers: AppOffer[];
  ui: UiState;
  /** Counts imports and resets, which replace every offer: results computed before one don't apply after it. */
  revision?: number;
}

export const STORAGE_KEY = "offer-calc:v1";

export function initialSession(today: string): Session {
  return { schemaVersion: 3, household: DEFAULT_HOUSEHOLD, offers: sampleOffers(today), ui: { basis: "colAdjustedTotal", theme: "system" } };
}

export type Action =
  | { type: "household"; patch: Partial<AppHousehold> }
  /** Sets draft fields by path, e.g. { "salary.annual": 120000 }. */
  | { type: "edit"; id: string; set: Record<string, unknown> }
  | { type: "addOffer" }
  | { type: "removeOffer"; id: string }
  | { type: "loadSamples"; today: string }
  | { type: "startBlank" }
  | { type: "basis"; basis: Basis }
  | { type: "theme"; theme: Theme }
  | { type: "dismiss"; hint: Hint }
  | { type: "ui"; patch: Partial<Pick<UiState, "byYear" | "bridge" | "mode" | "section" | "editor" | "offerTab" | "work" | "ticks">> }
  /** An import: replaces every offer and About you, and takes the file's view choices, if any. */
  | { type: "replace"; household: AppHousehold; offers: AppOffer[]; ui?: Partial<UiState> }
  /** "Delete all data": back to the first visit, with the samples. */
  | { type: "reset"; today: string };

export function reducer(s: Session, a: Action): Session {
  switch (a.type) {
    case "household": return { ...s, household: { ...s.household, ...a.patch } };
    case "edit":
      return { ...s, offers: s.offers.map((o) => o.id !== a.id ? o : {
        ...o, draft: Object.entries(a.set).reduce((d, [path, v]) => setPath(d, path, v), o.draft), sample: o.sample === "sample" ? "edited" : o.sample,
      }) };
    case "addOffer": {
      const free = LETTERS.find((l) => !s.offers.some((o) => o.letter === l));
      return free ? { ...s, offers: [...s.offers, blankOffer(free)].sort(byLetter) } : s;
    }
    case "removeOffer": return { ...s, offers: s.offers.filter((o) => o.id !== a.id) };
    case "loadSamples": return { ...s, household: DEFAULT_HOUSEHOLD, offers: sampleOffers(a.today) };
    case "startBlank": return { ...s, household: DEFAULT_HOUSEHOLD, offers: (["A", "B"] as Letter[]).map(blankOffer) };
    case "basis": return { ...s, ui: { ...s.ui, basis: a.basis } };
    case "theme": return { ...s, ui: { ...s.ui, theme: a.theme } };
    case "dismiss": return { ...s, ui: { ...s.ui, dismissed: { ...s.ui.dismissed, [a.hint]: true } } };
    case "ui": return { ...s, ui: { ...s.ui, ...a.patch } };
    case "replace":
      return { ...s, household: a.household, offers: a.offers, ui: { ...s.ui, ...a.ui, section: null, editor: null }, revision: (s.revision ?? 0) + 1 };
    case "reset": return { ...initialSession(a.today), revision: (s.revision ?? 0) + 1 };
  }
}

const byLetter = (x: AppOffer, y: AppOffer) => x.letter.localeCompare(y.letter);

/** Storage that may be missing or blocked (private windows, previews): reads and writes never throw. */
export interface KeyValueStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }

export function loadSession(store: KeyValueStore | undefined, today: string): Session {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) {
      const s = migrate(JSON.parse(raw));
      if (s) return s;
    }
  } catch { /* unreadable or blocked: start fresh */ }
  return initialSession(today);
}

/** Deletes what this browser holds for the app. True when done (or nothing was stored). */
export function clearSession(store: KeyValueStore | undefined): boolean {
  try {
    store?.removeItem?.(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
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

// ---- older saved sessions -------------------------------------------------------------------------

/** Slice 1 and 2's offer: the quick fields, plus a sample's detailed inputs as an engine input. */
export interface V1Offer {
  id: string;
  letter: Letter;
  sample: "sample" | "edited" | null;
  quick: {
    label: string; salary: number | null;
    /** A percent (10 = 10%) or dollars a year; "schedule" kept a sample's bonus by year. */
    bonus: { kind: "percent" | "amount"; value: number | null } | { kind: "schedule" };
    area: string | null; state: string | null; nyc: boolean; startDate: string | null; rent: number | null;
  };
  base?: OfferInput;
}

/** About you before slice 8: no "Prices in" (the U.S. average). */
export type V2Household = Omit<AppHousehold, "pricesIn"> & { pricesIn?: string };
export interface V1Session { schemaVersion: 1; household: V2Household; offers: V1Offer[]; ui: UiState }
/** Slices 3 to 5: offers as drafts, prices always the U.S. average. */
export interface V2Session { schemaVersion: 2; household: V2Household; offers: AppOffer[]; ui: UiState }

/** A saved session in the current shape, migrating older ones; null if it isn't one. */
export function migrate(s: unknown): Session | null {
  const x = s as Partial<Session> | Partial<V2Session> | Partial<V1Session> | null;
  if (!x || !Array.isArray(x.offers) || !x.household || !x.ui) return null;
  if (x.schemaVersion === 3) return { ...(x as Session), household: migrateHousehold(x.household) };
  if (x.schemaVersion === 2) return { ...(x as V2Session), schemaVersion: 3, household: migrateHousehold(x.household) };
  if (x.schemaVersion === 1) {
    return { ...(x as V1Session), schemaVersion: 3, household: migrateHousehold(x.household), offers: (x as V1Session).offers.map(migrateOffer) };
  }
  return null;
}

/**
 * About you, from any schema: "Prices in" arrived with schema 3 (the U.S. average before it). A place no longer in
 * the city list (BEA or the Census can recode a metro) falls back to the U.S. average rather than failing.
 */
export function migrateHousehold(h: V2Household): AppHousehold {
  const p = h.pricesIn;
  return { ...h, pricesIn: p && (p === US_PRICES || cityByCode(p)) ? p : US_PRICES };
}

/**
 * A v1 offer as a draft: the sample's inputs (`base`) become the draft, and the quick fields, which
 * overrode them, are written over it, the same way v1 built the engine's input.
 */
export function migrateOffer(o: V1Offer): AppOffer {
  const q = o.quick;
  let d: OfferDraft = o.base ? fromOfferInput(o.base, q.label) : { ...blankDraft(), label: q.label };
  d = {
    ...d,
    label: q.label,
    residence: { state: q.state, nyc: q.nyc },
    employerState: null,
    startDate: q.startDate,
    salary: { ...d.salary, annual: q.salary },
    costOfLiving: { ...d.costOfLiving, area: q.area, monthlyRent: q.rent },
  };
  const b = q.bonus;
  const base = o.base?.bonus;
  if (b.kind !== "schedule") {
    const basis = b.kind === "percent" ? "percentOfSalary" as const : "fixed" as const;
    const v = b.value === null ? null : b.kind === "percent" ? b.value / 100 : b.value;
    // v1 kept a sample's bear/bull range in proportion to the quick target.
    const amount = v === null ? null : base && base.basis === basis && base.amount.base > 0
      ? { bear: base.amount.bear * (v / base.amount.base), base: v, bull: base.amount.bull * (v / base.amount.base) } : all(v);
    // v1 kept only the payout timing (payOn, cutoff, period) from a sample, or the default.
    d = setPath(d, "bonus", { ...d.bonus, basis: basis === "percentOfSalary" && !o.base ? null : basis, amount, amounts: [], firstPayoutGuaranteed: null, mustBeEmployedOnPayDate: null });
  }
  return { id: o.id, letter: o.letter, sample: o.sample, draft: o.sample ? completeSample(d) : d };
}
