import { cityByCode } from "../../src/col/cities";
import { type AppHousehold, type AppOffer, type Letter, LETTERS, type OfferDraft } from "./model";
import { US_PRICES } from "./prices";
import { migrateHousehold, migrateOffer, type Session, type UiState, type V1Offer, type V2Household } from "./session";

// JSON export and import (docs/ui-design.md §10; moved into slice 3): one versioned file with
// everything you've entered. Import rejects other formats, migrates older schema versions, and checks
// the file's shape field by field before anything changes; the app then checks every offer's values
// with the engine's validateOffer (in the worker) and shows what would be replaced.

export const FORMAT = "offer-calc";
export const SCHEMA_VERSION = 3;
const SAMPLE_NOTE = "Includes sample offers: illustrative inputs, not market data.";

export interface ExportFile {
  format: typeof FORMAT;
  schemaVersion: number;
  exportedAt: string;
  /** Present while any sample offer is in the file. */
  note?: string;
  household: AppHousehold;
  offers: AppOffer[];
  /** View choices (basis, theme, mode, tickmarks); optional on import. */
  ui?: Partial<UiState>;
}

/** The file to download: offer-calc-YYYY-MM-DD.json, ending -sample while any sample is present. */
export function exportSession(s: Session, today: string, now = new Date()): { fileName: string; text: string } {
  const sample = s.offers.some((o) => o.sample !== null);
  const file: ExportFile = {
    format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), ...(sample ? { note: SAMPLE_NOTE } : {}),
    household: s.household, offers: s.offers, ui: { basis: s.ui.basis, theme: s.ui.theme, mode: s.ui.mode, ticks: s.ui.ticks ?? "shown" },
  };
  return { fileName: `offer-calc-${today}${sample ? "-sample" : ""}.json`, text: `${JSON.stringify(file, null, 2)}\n` };
}

export type ImportResult =
  | { ok: true; household: AppHousehold; offers: AppOffer[]; ui?: Partial<UiState>; migratedFrom?: number; note?: string; exportedAt?: string }
  | { ok: false; problems: string[] };

/** Reads an export: the format, the schema version (older ones migrate) and the shape of every field. Never throws. */
export function readImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["This file isn't JSON, so it isn't an Offer Calc export."] };
  }
  const f = raw as Partial<ExportFile> | null;
  if (!f || typeof f !== "object" || f.format !== FORMAT) {
    return { ok: false, problems: ["This isn't an Offer Calc export: it doesn't say \"format\": \"offer-calc\"."] };
  }
  if (f.schemaVersion !== 1 && f.schemaVersion !== 2 && f.schemaVersion !== 3) {
    return { ok: false, problems: [`This export's schema version (${String(f.schemaVersion)}) is newer than this app knows: 1 to 3.`] };
  }
  const problems: string[] = [];
  const household = checkHousehold(f.household, f.schemaVersion as 1 | 2 | 3, problems);
  if (!Array.isArray(f.offers)) problems.push("offers: missing, or not a list.");
  const list = Array.isArray(f.offers) ? f.offers : [];
  if (Array.isArray(f.offers) && (list.length < 1 || list.length > 3)) problems.push(`offers: ${list.length} offers; the app holds 1 to 3.`);
  const offers: AppOffer[] = [];
  const letters = new Set<string>();
  // Offers are edited and removed by id: two with one id would change together.
  const ids = new Set<string>();
  list.forEach((o, i) => {
    const x = o as Partial<AppOffer> & Partial<V1Offer>;
    const where = `offers.${i}`;
    if (!x || typeof x !== "object") { problems.push(`${where}: not an offer.`); return; }
    if (!LETTERS.includes(x.letter as Letter)) problems.push(`${where}.letter: should be A, B or C.`);
    else if (letters.has(x.letter!)) problems.push(`${where}.letter: ${x.letter} appears twice.`);
    letters.add(x.letter as string);
    if (typeof x.id !== "string") problems.push(`${where}.id: should be text.`);
    else if (ids.has(x.id)) problems.push(`${where}.id: "${x.id}" appears twice; each offer needs its own.`);
    if (typeof x.id === "string") ids.add(x.id);
    if (!(x.sample === null || x.sample === "sample" || x.sample === "edited")) problems.push(`${where}.sample: should be null, "sample" or "edited".`);
    if (f.schemaVersion === 1) {
      const before = problems.length;
      check(x.quick, V1_QUICK, `${where}.quick`, problems);
      if (problems.length === before) {
        try {
          offers.push(migrateOffer(x as V1Offer));
        } catch {
          problems.push(`${where}.base: not an offer this app can read.`);
        }
      }
    } else {
      const before = problems.length;
      check(x.draft, DRAFT, `${where}.draft`, problems);
      if (problems.length === before) offers.push({ id: x.id!, letter: x.letter as Letter, sample: x.sample!, draft: x.draft as OfferDraft });
    }
  });
  if (problems.length || !household) return { ok: false, problems };
  return {
    ok: true, household, offers: offers.sort((a, b) => a.letter.localeCompare(b.letter)), ...(f.ui && typeof f.ui === "object" ? { ui: pickUi(f.ui) } : {}),
    ...(f.schemaVersion !== SCHEMA_VERSION ? { migratedFrom: f.schemaVersion } : {}), ...(typeof f.note === "string" ? { note: f.note } : {}),
    ...(typeof f.exportedAt === "string" ? { exportedAt: f.exportedAt } : {}),
  };
}

/** About you. "Prices in" arrived with schema 3: older files are at the U.S. average. */
function checkHousehold(h: unknown, schema: 1 | 2 | 3, problems: string[]): AppHousehold | null {
  const before = problems.length;
  check(h, HOUSEHOLD, "household", problems);
  if (schema === 3) check((h as Partial<AppHousehold> | null)?.pricesIn, PRICES_IN, "household.pricesIn", problems);
  return problems.length === before ? migrateHousehold(h as V2Household) : null;
}

/** A place in the city list, by its BEA code, or "00000" for the U.S. average. */
const PRICES_IN: Shape = (v, p, ps) => {
  if (typeof v !== "string" || (v !== US_PRICES && !cityByCode(v))) fail(ps, p, `"${US_PRICES}" (the U.S. average) or a BEA area code from the city list`);
};

/** Only the view choices the app knows, each checked; anything else is left as it is. */
function pickUi(u: Partial<UiState>): Partial<UiState> {
  const out: Partial<UiState> = {};
  if (u.basis === "cash" || u.basis === "totalRewards" || u.basis === "colAdjustedTotal" || u.basis === "perHour") out.basis = u.basis;
  if (u.theme === "system" || u.theme === "light" || u.theme === "dark") out.theme = u.theme;
  if (u.mode === "quick" || u.mode === "detailed") out.mode = u.mode;
  if (u.ticks === "shown" || u.ticks === "hidden") out.ticks = u.ticks;
  return out;
}

// ---- the shape of a draft ------------------------------------------------------------------------

/** A check: adds a problem for each field of the wrong type, at its path. */
type Shape = (v: unknown, path: string, problems: string[]) => void;

const check = (v: unknown, shape: Shape, path: string, problems: string[]) => shape(v, path, problems);
const fail = (problems: string[], path: string, what: string) => problems.push(`${path}: should be ${what}.`);
const num: Shape = (v, p, ps) => { if (typeof v !== "number" || !Number.isFinite(v)) fail(ps, p, "a number"); };
const str: Shape = (v, p, ps) => { if (typeof v !== "string") fail(ps, p, "text"); };
const bool: Shape = (v, p, ps) => { if (typeof v !== "boolean") fail(ps, p, "true or false"); };
const date: Shape = (v, p, ps) => { if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(ps, p, "a date like 2027-07-12"); };
const nullable = (s: Shape): Shape => (v, p, ps) => { if (v !== null) s(v, p, ps); };
const oneOf = (...xs: Array<string | number | boolean>): Shape => (v, p, ps) => {
  if (!xs.includes(v as string)) fail(ps, p, `one of ${xs.map((x) => JSON.stringify(x)).join(", ")}`);
};
const arr = (s: Shape): Shape => (v, p, ps) => {
  if (!Array.isArray(v)) return void fail(ps, p, "a list");
  v.forEach((x, i) => s(x, `${p}.${i}`, ps));
};
const obj = (fields: Record<string, Shape>): Shape => (v, p, ps) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return void fail(ps, p, "an object");
  for (const [k, s] of Object.entries(fields)) {
    if (!(k in (v as object))) fail(ps, `${p}.${k}`, "present");
    else s((v as Record<string, unknown>)[k], `${p}.${k}`, ps);
  }
};
const either = (a: Shape, b: Shape, what: string): Shape => (v, p, ps) => {
  const pa: string[] = [];
  const pb: string[] = [];
  a(v, p, pa);
  b(v, p, pb);
  if (pa.length && pb.length) fail(ps, p, what);
};

const scenarios = obj({ bear: num, base: num, bull: num });
const monthDay = obj({ month: num, day: num });
const schedule = obj({
  tranches: nullable(arr(obj({ month: nullable(num), fraction: nullable(num) }))),
  vestDates: nullable(obj({ months: arr(num), day: nullable(num) })),
});
const none = oneOf("none");

const DRAFT: Shape = obj({
  label: str,
  residence: (v, p, ps) => {
    obj({ state: nullable(str), nyc: bool })(v, p, ps);
    // Inside Philadelphia arrived on 2026-10-14: optional, so earlier exports still import.
    const philly = (v as { philadelphia?: unknown } | null)?.philadelphia;
    if (v && typeof v === "object" && philly !== undefined) bool(philly, `${p}.philadelphia`, ps);
  },
  employerState: nullable(str),
  startDate: nullable(date),
  salary: obj({
    annual: nullable(num), raise: nullable(scenarios), raiseOn: nullable(oneOf("anniversary", "jan1")),
    promotions: arr(obj({ on: nullable(date), stepUp: nullable(num), scenarios: nullable(arr(oneOf("bear", "base", "bull"))) })),
  }),
  bonus: obj({
    basis: nullable(oneOf("percentOfSalary", "fixed", "byEmploymentYear")), amount: nullable(scenarios), amounts: arr(nullable(scenarios)),
    payOn: nullable(monthDay), periodStart: nullable(monthDay), cutoff: nullable(monthDay), firstPayoutGuaranteed: nullable(bool),
    mustBeEmployedOnPayDate: nullable(bool),
  }),
  cashAwards: arr(obj({
    label: str, amount: nullable(num), paidOn: nullable(either(date, obj({ daysAfterStart: nullable(num) }), "a date or days after you start")),
    clawback: nullable(obj({
      months: nullable(num), kind: nullable(oneOf("full", "prorated")), per: nullable(oneOf("month", "day")),
      from: nullable(oneOf("start", "payment")), repay: nullable(oneOf("gross", "net")),
    })),
  })),
  equity: obj({
    grants: arr(obj({ label: str, value: nullable(num), grantDate: nullable(date), vestStart: nullable(date), schedule })),
    priceGrowth: nullable(scenarios),
    refreshers: nullable(obj({ value: nullable(scenarios), firstAfterMonths: nullable(num), everyMonths: nullable(num), schedule })),
  }),
  retirement: nullable(either(none, obj({
    contributionPct: nullable(num), type: nullable(oneOf("pretax", "roth")), eligiblePay: nullable(oneOf("salary", "salaryAndBonus")),
    match: arr(obj({ upToPct: nullable(num), rate: nullable(num) })), nonElectivePct: nullable(num),
    vesting: nullable((v, p, ps) => {
      const k = (v as { kind?: unknown })?.kind;
      if (k === "immediate") return;
      if (k === "cliff") return obj({ kind: str, years: nullable(num) })(v, p, ps);
      if (k === "graded") return obj({ kind: str, steps: arr(obj({ years: nullable(num), pct: nullable(num) })) })(v, p, ps);
      fail(ps, p, "immediate, a cliff or graded steps");
    }),
    vestingService: nullable(oneOf("elapsedTime", "planYearHours")),
  }), "\"none\" or a 401(k) plan")),
  health: nullable(either(none, obj({
    premium: nullable(num), outOfPocket: obj({ low: nullable(num), medium: nullable(num), high: nullable(num) }), oopMax: nullable(num),
    employeeHsa: nullable(num), employerHsa: nullable(num), coverage: nullable(oneOf("self", "family")),
  }), "\"none\" or a health plan")),
  perks: obj({ section127: nullable(num), commuterMonthly: nullable(num) }),
  hours: obj({ weekly: nullable(scenarios), weeksPerYear: nullable(num) }),
  costOfLiving: obj({ area: nullable(str), monthlyRent: nullable(num), rentGrowth: nullable(num) }),
});

const HOUSEHOLD: Shape = (v, p, ps) => {
  obj({ filingStatus: oneOf("single", "joint", "headOfHousehold"), stayYears: num, otherWagesThisYear: num })(v, p, ps);
  const h = v as Partial<AppHousehold> | null;
  if (h && typeof h === "object" && h.healthUsage !== undefined) oneOf("low", "medium", "high")(h.healthUsage, `${p}.healthUsage`, ps);
  // Spouse's wages arrived on 2026-10-14: optional, so earlier exports still import.
  if (h && typeof h === "object" && h.spouseWages !== undefined && !(typeof h.spouseWages === "number" && Number.isFinite(h.spouseWages)
    && h.spouseWages >= 0)) fail(ps, `${p}.spouseWages`, "an amount of $0 or more");
  if (h && typeof h.stayYears === "number" && !(Number.isInteger(h.stayYears) && h.stayYears >= 1 && h.stayYears <= 10)) {
    fail(ps, `${p}.stayYears`, "a whole number of years from 1 to 10");
  }
};

const V1_QUICK: Shape = obj({
  label: str, salary: nullable(num), area: nullable(str), state: nullable(str), nyc: bool, startDate: nullable(date), rent: nullable(num),
  bonus: (v, p, ps) => {
    const k = (v as { kind?: unknown })?.kind;
    if (k === "schedule") return;
    obj({ kind: oneOf("percent", "amount"), value: nullable(num) })(v, p, ps);
  },
});
