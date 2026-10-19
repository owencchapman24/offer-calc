import { cityByCode } from "../../src/col/cities";
import type { Basis, OfferInput } from "../../src/offer/types";
import {
  all, type AppHousehold, type AppOffer, blankDraft, blankOffer, completeSample, DEFAULT_HOUSEHOLD, fromOfferInput, type Letter, LETTERS,
  type OfferDraft, sampleOffers, setPath, withTimeOff,
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
  /** A-7, the work (L-6 until stop 5B): whether its tables are open (closed by default). `letter`: L-6's offer, no longer read. */
  work?: { open: boolean; letter?: Letter };
  /** The breakdown's parts, A-2 to A-6: each one's detail ("Show …"), shown or not, for every offer. */
  parts?: Partial<Record<"a2" | "a3" | "a4" | "a5" | "a6", boolean>>;
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
/**
 * What was saved before it was set aside (one at a time, the latest): a saved value this version couldn't read, or the one
 * "Start again" (the recovery screen) replaced. The Data page offers it as a download; "Delete all data" deletes it too.
 */
export const BACKUP_KEY = "offer-calc:backup";
/** The schema this version saves. A saved value with a higher one is a newer version's: never read as ours, never saved over. */
export const SCHEMA = 3;

export function initialSession(today: string): Session {
  // The first visit: sample A on its own, a breakdown (docs/v2-plan.md, item 5, B5); "See a sample comparison" loads all three.
  return { schemaVersion: 3, household: DEFAULT_HOUSEHOLD, offers: sampleOffers(today).slice(0, 1), ui: { basis: "colAdjustedTotal", theme: "system" } };
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
  | { type: "ui"; patch: Partial<Pick<UiState, "byYear" | "bridge" | "mode" | "section" | "editor" | "offerTab" | "work" | "ticks" | "parts">> }
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
    // One offer is enough (docs/v2-plan.md, item 5): the last one stays.
    case "removeOffer": return s.offers.length > 1 ? { ...s, offers: s.offers.filter((o) => o.id !== a.id) } : s;
    case "loadSamples": return { ...s, household: DEFAULT_HOUSEHOLD, offers: sampleOffers(a.today) };
    // "Start with my offer": one blank offer, A; a second is a click away when there's one to compare.
    case "startBlank": return { ...s, household: DEFAULT_HOUSEHOLD, offers: [blankOffer("A")], ui: { ...s.ui, offerTab: "A" } };
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

export interface Loaded {
  session: Session;
  /** What's saved is from a newer version of the app (this schema): it's left as it is, and the samples show meanwhile. */
  newer: number | null;
}

export function loadSession(store: KeyValueStore | undefined, today: string): Loaded {
  let raw: string | null = null;
  try {
    raw = store?.getItem(STORAGE_KEY) ?? null;
  } catch { /* blocked: start fresh */ }
  if (raw) {
    const newer = newerSchema(raw);
    if (newer !== null) return { session: initialSession(today), newer };
    try {
      const s = migrate(JSON.parse(raw));
      if (s) return { session: s, newer: null };
    } catch { /* unreadable */ }
    // Unreadable: kept aside, since the next save replaces it.
    setAside(store, raw, "unreadable", today);
  }
  return { session: initialSession(today), newer: null };
}

/** The schema of a saved value from a newer version of the app; null for ours, an older one's, or anything unreadable. */
export function newerSchema(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const v = (JSON.parse(raw) as { schemaVersion?: unknown } | null)?.schemaVersion;
    return typeof v === "number" && v > SCHEMA ? v : null;
  } catch {
    return null;
  }
}

/** A saved value set aside: when, why, and the value as it was stored. */
export interface Backup { on: string; why: "unreadable" | "startedAgain"; saved: string }

export function setAside(store: KeyValueStore | undefined, saved: string, why: Backup["why"], today: string): boolean {
  try {
    store?.setItem(BACKUP_KEY, JSON.stringify({ on: today, why, saved } satisfies Backup));
    return !!store;
  } catch {
    return false;
  }
}

export function readBackup(store: KeyValueStore | undefined): Backup | null {
  try {
    const b = JSON.parse(store?.getItem(BACKUP_KEY) ?? "null") as Partial<Backup> | null;
    return b && typeof b.saved === "string" && typeof b.on === "string" ? { on: b.on, why: b.why === "startedAgain" ? b.why : "unreadable", saved: b.saved } : null;
  } catch {
    return null;
  }
}

/**
 * A saved value as a file to download: an export (the Data page imports it) when it has offers and About you, whatever its
 * schema, so a newer version can import its own; the text as it was otherwise.
 */
export function savedFile(saved: string, today: string, now = new Date()): { fileName: string; text: string } {
  try {
    const x = JSON.parse(saved) as Partial<Session> | null;
    if (x && typeof x === "object" && Array.isArray(x.offers) && x.household) {
      const file = { format: "offer-calc", schemaVersion: x.schemaVersion, exportedAt: now.toISOString(), household: x.household, offers: x.offers,
        ...(x.ui && typeof x.ui === "object" ? { ui: x.ui } : {}) };
      return { fileName: `offer-calc-saved-${today}.json`, text: `${JSON.stringify(file, null, 2)}
` };
    }
  } catch { /* not JSON: as it was */ }
  return { fileName: `offer-calc-saved-${today}.txt`, text: saved };
}

/** Deletes what this browser holds for the app, the set-aside copy too. True when done (or nothing was stored). */
export function clearSession(store: KeyValueStore | undefined): boolean {
  try {
    store?.removeItem?.(STORAGE_KEY);
    store?.removeItem?.(BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Saved; or not: storage is unavailable (the app keeps state in memory only), or it holds a newer version's save. */
export type SaveStatus = "saved" | "unavailable" | "newer";

/**
 * Saves, unless what's saved is a newer version's (a rollback, or a tab still on an older build): saving over it would lose
 * offers this version can't even read.
 */
export function saveSession(store: KeyValueStore | undefined, s: Session): SaveStatus {
  try {
    if (!store) return "unavailable";
    if (newerSchema(store.getItem(STORAGE_KEY)) !== null) return "newer";
    store.setItem(STORAGE_KEY, JSON.stringify(s));
    return "saved";
  } catch {
    return "unavailable";
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
  if (x.schemaVersion === 3) return { ...(x as Session), household: migrateHousehold(x.household), offers: drafts(uniqueIds((x as Session).offers)) };
  if (x.schemaVersion === 2) {
    return { ...(x as V2Session), schemaVersion: 3, household: migrateHousehold(x.household), offers: drafts(uniqueIds((x as V2Session).offers)) };
  }
  if (x.schemaVersion === 1) {
    return { ...(x as V1Session), schemaVersion: 3, household: migrateHousehold(x.household), offers: drafts(uniqueIds((x as V1Session).offers.map(migrateOffer))) };
  }
  return null;
}

/** Each offer's draft in today's shape: days off arrived on 2026-10-19, in place of weeks a year (`withTimeOff`). */
const drafts = (offers: AppOffer[]): AppOffer[] => offers.map((o) => ({ ...o, draft: withTimeOff(o.draft) }));

/**
 * Offers are edited and removed by id: two with one id would change together (an import could once save them; it's
 * refused now). A repeated id gets a mark added until it's unique.
 */
function uniqueIds(offers: AppOffer[]): AppOffer[] {
  const seen = new Set<string>();
  return offers.map((o) => {
    let id = o.id;
    while (seen.has(id)) id += "'";
    seen.add(id);
    return id === o.id ? o : { ...o, id };
  });
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
