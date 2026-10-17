import type { Basis } from "../../src/offer/types";
import { CASES, dropText, riskView } from "./cases";
import { basisPhrase, type MetricId, metricKind, ownOf, pricesOf, res, type WorkContext } from "./metrics";
import { bridge, byYear } from "./byYearModel";
import { A2_LABEL, benefitsOf, centsText, hundredOf, payRows, rateText as shareText, taxYearsOf } from "./partsModel";
import type { Letter } from "./model";
import { cents, dayBefore, figure, longDate } from "./text";
import { TICKS, type TickKind } from "./ui";
import {
  KIND_NAME, moneyText, paymentFormula, paymentLabel, paymentYears, rateText, rowText, sameStay, sectionName, stayRows, type TaxCol, taxTables, toCent,
  yearTable,
} from "./workpaper";

// CSV export of each table (docs/ui-design.md §4.8, §10): L-1's and L-2's table views, and every table in an offer's breakdown: A-2's
// $100 and its bridge, A-3's pay by year, A-5's benefits by year, A-6's tax by calendar year, and A-7's four tables.
// Each is built from the same view model as the table on screen, and each figure is the figure shown, written as a plain number:
// its display text with the thousands separators, currency signs and parentheses taken out ("(41,724)" is -41724, "$21.85"
// is 21.85, "27.2735%" is 27.2735), units in the column headers. Beside each figure, a column with its tickmark (metricKind).
// Line 1 says so when any offer is a sample, and the file name ends -sample, as the JSON export's does. Text cells are guarded
// against a spreadsheet running them as formulas: offer labels and award names are free text. Loaded on the first download.

export type L6Part = "years" | "stay" | "payments" | "tax";
/** A-2 to A-6's tables: A-2's $100 and its bridge (for a year), A-3's pay, A-5's benefits and A-6's tax by calendar year. */
export type PartTable = "a2" | "bridge" | "a3" | "a5" | "a6";
/** A table to export: L-1's table view (each year or the running total), L-2's, or one of an offer's breakdown tables. */
export type CsvTable = { kind: "l1"; running: boolean } | { kind: "l2" } | { kind: "a7"; letter: Letter; part: L6Part }
  | { kind: "part"; letter: Letter; part: PartTable; n?: number };

/** A cell: text, a number (as written; a figure carries its id, for the tests), or empty. */
export type Cell = string | { num: string; id?: MetricId } | null;

export const SAMPLE_LINE = "Includes sample offers: illustrative inputs, not market data.";
const LEGEND = `Tickmarks: ${(Object.keys(TICKS) as TickKind[]).map((k) => `${TICKS[k].mark} ${TICKS[k].name.toLowerCase()}`).join("; ")}. Methodology M-13.`;

/** A figure's display text as a plain number: "1,234" -> 1234, "(41,724)" -> -41724, "−$5.20" -> -5.20, "27.27%" -> 27.27. */
export function plain(shown: string): string {
  const t = shown.trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/^[−-]/, "-").replace(/^\+/, "").replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`Not a figure: ${shown}`);
  return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t;
}

/** A text cell that a spreadsheet would read as a formula ("=", "+", "-", "@", a tab or a carriage return first) gets a leading '. */
export const guard = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const cellText = (c: Cell) => (c === null ? "" : typeof c === "string" ? quote(guard(c)) : c.num);

/** Rows of cells as CSV (RFC 4180: commas, CRLF, quotes where needed). */
export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cellText).join(",")).join("\r\n") + "\r\n";

export interface Built { slug: string; title: string; header: string[]; rows: Cell[][] }

/** The file for a table: its name and its text (with a UTF-8 byte-order mark, so a spreadsheet reads ✓ and – right). */
export function csvFile(ctx: WorkContext, table: CsvTable): { fileName: string; text: string } {
  const sample = ctx.offers.some((o) => o.sample !== null);
  const b = build(ctx, table);
  const lines: Cell[][] = [
    ...(sample ? [[SAMPLE_LINE]] : []),
    [b.title],
    [scope(ctx, table)],
    b.header,
    ...b.rows,
    [],
    [LEGEND],
  ];
  return { fileName: `offer-calc-${ctx.today}-${b.slug}${sample ? "-sample" : ""}.csv`, text: `\uFEFF${toCsv(lines)}` };
}

/** Builds the file and hands it to the browser to save. Returns its name. */
export function downloadCsv(ctx: WorkContext, table: CsvTable): string {
  const { fileName, text } = csvFile(ctx, table);
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return fileName;
}

/** A table's rows, before they're written: its file's name part, title, header and rows. */
export function build(ctx: WorkContext, t: CsvTable): Built {
  switch (t.kind) {
    case "l1": return l1(ctx, t.running);
    case "l2": return l2(ctx);
    case "a7": return L6[t.part](ctx, t.letter);
    case "part": return PARTS[t.part](ctx, t.letter, t.n ?? 1);
  }
}

/**
 * "Base case · stay 4 years (Jul 13, 2026 – Jul 12, 2030) · Offer Calc, exported Oct 12, 2026": the comparison's window, or for an
 * offer's A-7 its own stay.
 */
function scope(ctx: WorkContext, t: CsvTable): string {
  const own = t.kind === "a7" || t.kind === "part";
  const w = own ? { ...ownOf(ctx, t.letter).window, years: ownOf(ctx, t.letter).years } : { ...res(ctx).view.row.window, years: res(ctx).view.row.years };
  return `Base case · ${own ? "its stay" : "stay"} ${w.years} ${w.years === 1 ? "year" : "years"} (${longDate(w.start)} – ${longDate(dayBefore(w.end))})`
    + ` · Offer Calc, exported ${longDate(ctx.today)}`;
}

/** A figure: its number as shown, and its tickmark. */
const fig = (ctx: WorkContext, id: MetricId, shown: string): Cell[] => [{ num: plain(shown), id }, TICKS[metricKind(id, ctx)].mark];
const num = (x: number): Cell => ({ num: String(x) });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const label = (ctx: WorkContext, l: Letter) => ctx.offers.find((o) => o.letter === l)?.draft.label ?? "";
/** "Offers: A NYC bank; B Charlotte corp; C Seattle tech" */
const offersLine = (ctx: WorkContext, letters: Letter[]) => `Offers: ${letters.map((l) => `${l}${label(ctx, l) ? ` ${label(ctx, l)}` : ""}`).join("; ")}`;

// ---- L-1, by year: the table view ------------------------------------------------------------------------

/** L-1's units, as its chart and table say them: after rent, in the dollars of the prices picked. */
const l1Units = (basis: Basis, ctx: WorkContext, running: boolean) => {
  const after = basis === "colAdjustedTotal" || (basis === "perHour" && res(ctx).sweep.perHourOf === "colAdjustedTotal");
  const u = `${after ? pricesOf(ctx).unit : "$"}${basis === "perHour" ? " an hour" : ""}, as paid`;
  return running ? u.replace("as paid", "running total, as paid") : u;
};

function l1(ctx: WorkContext, running: boolean): Built {
  const r = res(ctx);
  const basis = r.view.basis;
  const perHour = basis === "perHour";
  const run = running && !perHour;
  const offers = r.letters.map((l) => byYear(ctx, l));
  const units = l1Units(basis, ctx, run);
  const fmt = (v: number) => (perHour ? cents(v) : figure(v));
  const rows: Cell[][] = Array.from({ length: r.view.row.years }, (_, i) => i + 1).map((n) => [
    `Year ${n}`,
    ...offers.flatMap((o): Cell[] => {
      const k = o.years.findIndex((y) => y.n === n);
      if (k < 0) return [null, null];
      const v = run ? o.years.slice(0, k + 1).reduce((s, y) => s + y.value, 0) : o.years[k].value;
      return fig(ctx, run ? `run.${o.letter}.${n}` : `ey.${o.letter}.${n}`, fmt(v));
    }),
  ]);
  rows.push(perHour
    ? ["Your stay", ...offers.flatMap((o) => fig(ctx, `ph.${o.letter}`, cents(r.view.ranks.find((x) => x.letter === o.letter)!.value)))]
    : ["Your stay, as paid", ...offers.flatMap((o) => fig(ctx, `eysum.${o.letter}`, figure(o.window ?? 0)))]);
  const phrase = basisPhrase(pricesOf(ctx))[basis];
  return {
    slug: `L-1-by-year${run ? "-running-total" : ""}`,
    title: `L-1 · By year · ${cap(phrase)}, each employment year${run ? ", running total" : ""}. ${offersLine(ctx, r.letters)}`,
    header: ["Year", ...offers.flatMap((o) => [`${o.letter} (${units})`, `${o.letter} tickmark`])],
    rows,
  };
}

// ---- L-2, if things go badly: the table view -------------------------------------------------------------

function l2(ctx: WorkContext): Built {
  const v = riskView(ctx);
  if (!v.anyRange) throw new Error("No ranges entered, so L-2 has no table.");
  const r = res(ctx);
  const after = r.view.basis === "colAdjustedTotal" || (v.perHour && r.sweep.perHourOf === "colAdjustedTotal");
  const units = `${after ? pricesOf(ctx).unit : "$"}${v.perHour ? " an hour over your stay, nominal" : `, ${v.years}-year total, present value`}`;
  const fmt = (x: number) => (v.perHour ? cents(x) : figure(x));
  const word = { bear: "Bear", base: "Base", bull: "Bull" } as const;
  const phrase = v.perHour ? "per hour worked" : basisPhrase(pricesOf(ctx))[r.view.basis];
  return {
    slug: "L-2-if-things-go-badly",
    title: `L-2 · If things go badly · ${cap(phrase)}, each offer in the bear, base and bull cases. ${offersLine(ctx, r.letters)}`,
    header: ["Offer", ...CASES.flatMap((s) => [`${word[s]} (${units})`, `${word[s]} tickmark`]), "Bear vs base, over your stay (%)", "Bear vs base tickmark"],
    rows: [...v.rows].sort((a, b) => a.letter.localeCompare(b.letter)).map((row) => [
      row.letter,
      ...CASES.flatMap((s) => fig(ctx, `risk.${row.letter}.${s}`, fmt(row.values[s]))),
      ...fig(ctx, `drop.${row.letter}`, dropText(row)),
    ]),
  };
}

// ---- A-7, the work: an offer's four tables, over its own stay -----------------------------------------------------

const ref = (ctx: WorkContext, letter: Letter, what: string) => `${letter}-7${label(ctx, letter) ? ` · ${label(ctx, letter)}` : ""} · ${what}`;
const PART_SLUG: Record<L6Part, string> = { years: "employment-years", stay: "its-stay", payments: "every-payment", tax: "tax-by-year" };
const slug = (letter: Letter, part: L6Part) => `${letter}-7-${PART_SLUG[part]}`;

const L6: Record<L6Part, (ctx: WorkContext, letter: Letter) => Built> = {
  years(ctx, letter) {
    const t = yearTable(ctx, letter);
    // A row whose figures aren't the header's "$, as paid" says its own unit: hours, per hour, or the prices picked where its label
    // doesn't name them already (money saved, at face value, counts in them too).
    const p = pricesOf(ctx);
    const unit = (row: (typeof t.rows)[number]) => (row.unit === "hours" ? " (hours)"
      : row.unit === "perHour" ? ` (${row.line === "totalHour" ? p.unit : "$"} an hour)` : row.line === "face" ? ` (${p.unit})` : "");
    return {
      slug: slug(letter, "years"),
      title: ref(ctx, letter, "Employment years, line by line, as paid, not discounted"),
      header: ["Line", "Section", "Label", "Note", ...t.years.flatMap((y) => [`Year ${y.n} ($, as paid)`, `Year ${y.n} tickmark`]),
        `Years 1–${t.n} ($, as paid)`, `Years 1–${t.n} tickmark`],
      rows: t.rows.map((row) => [
        num(row.no), sectionName(t, row.section), `${row.label}${unit(row)}`, row.gloss ?? "",
        ...row.values.flatMap((v, i) => fig(ctx, `l6y.${letter}.${row.line}.${i + 1}`, rowText(row, v))),
        ...fig(ctx, `l6y.${letter}.${row.line}.sum`, rowText(row, row.sum)),
      ]),
    };
  },

  stay(ctx, letter) {
    const rows = stayRows(ctx, letter);
    const n = ownOf(ctx, letter).years;
    const after = rows.some((x) => x.after);
    // Its present value is the rank list's where the comparison projects it over the same stay.
    const pv = sameStay(ctx, letter);
    return {
      slug: slug(letter, "stay"),
      title: ref(ctx, letter, pv ? "Its stay on each basis, as paid and in present value; tied to the lead schedule and L-1" : "Its stay on each basis, as paid"),
      header: ["Basis", `Years 1–${n} ($, as paid)`, `Years 1–${n} tickmark`,
        ...(after ? ["Past its stay's last day ($)", "Past its stay's last day tickmark"] : []),
        "Its stay, as paid ($)", "Its stay tickmark", ...(pv ? ["Present value today ($)", "Present value tickmark"] : [])],
      rows: rows.map((x) => [
        x.label,
        ...fig(ctx, `l6y.${letter}.${x.line}.sum`, figure(x.years)),
        ...(after ? (x.after ? fig(ctx, `l6s.${letter}.${x.basis}.after`, moneyText(-x.after)) : [null, null]) : []),
        ...fig(ctx, `l6s.${letter}.${x.basis}.stay`, figure(x.stay)),
        ...(pv ? fig(ctx, `l6s.${letter}.${x.basis}.pv`, figure(x.pv)) : []),
      ]),
    };
  },

  payments(ctx, letter) {
    const rows: Cell[][] = [];
    for (const y of paymentYears(ctx, letter)) {
      const year = y.ey === "after" ? "After its stay" : `Year ${y.ey}`;
      for (const g of y.groups) {
        for (const { i, p } of g.rows) {
          rows.push([year, KIND_NAME[g.component], paymentLabel(p), p.date, paymentFormula(p),
            ...fig(ctx, `l6p.${letter}.${i}.gross`, toCent(p.gross)), ...fig(ctx, `l6p.${letter}.${i}.tax`, toCent(p.tax))]);
        }
        if (g.rows.length > 1) {
          rows.push([year, KIND_NAME[g.component], `${KIND_NAME[g.component]}, ${y.ey === "after" ? "after its stay" : `year ${y.ey}`}: the payments added`, "", "",
            ...fig(ctx, `l6g.${letter}.${y.ey}.${g.component}.gross` as MetricId, toCent(g.gross)),
            ...fig(ctx, `l6g.${letter}.${y.ey}.${g.component}.tax` as MetricId, toCent(g.tax))]);
        }
      }
      rows.push([year, "", `Tax on ${y.ey === "after" ? "these payments" : `year ${y.ey}'s payments`}`, "", "", null, null,
        ...fig(ctx, `l6g.${letter}.${y.ey}.all.tax` as MetricId, toCent(y.tax))]);
    }
    return {
      slug: slug(letter, "payments"),
      title: ref(ctx, letter, "Every payment, by employment year and kind, with its tax, to the cent"),
      header: ["Employment year", "Kind", "Payment", "Paid on", "How it was worked out", "Pay ($)", "Pay tickmark", "Tax ($)", "Tax tickmark"],
      rows,
    };
  },

  tax(ctx, letter) {
    const cols: TaxCol[] = ["with", "without", "offer"];
    const rows: Cell[][] = [];
    for (const t of taxTables(ctx, letter)) {
      for (const row of t.rows) {
        const head: Cell[] = [num(t.year), t.projectedLaw ? "projected from 2026" : "2026 tax law", row.kind === "rate" ? `${row.label} (%)` : row.label, row.gloss ?? ""];
        rows.push(row.kind === "rate"
          ? [...head, null, null, null, null, ...fig(ctx, `l6t.${letter}.${t.year}.rate.offer`, rateText(t.rate, t.digits))]
          : [...head, ...cols.flatMap((c) => fig(ctx, `l6t.${letter}.${t.year}.${row.line}.${c}`, moneyText(row[c]!)))]);
      }
    }
    return {
      slug: slug(letter, "tax"),
      title: ref(ctx, letter, "Tax by calendar year, with the offer, without it, and the offer's share"),
      header: ["Calendar year", "Tax law", "Line", "Note", "With the offer ($)", "With the offer tickmark", "Without it ($)", "Without it tickmark",
        "The offer's share ($)", "The offer's share tickmark"],
      rows,
    };
  },
};

// ---- A-2 to A-6: the breakdown's other tables, over the offer's own stay ------------------------------------------------

const partRef = (ctx: WorkContext, letter: Letter, n: number, what: string) => `${letter}-${n}${label(ctx, letter) ? ` · ${label(ctx, letter)}` : ""} · ${what}`;
/** Each year of the stay, a figure and its tickmark: "Year 1 ($, as paid)", "Year 1 tickmark", … then the years added. */
const yearHeads = (n: number) => [...Array.from({ length: n }, (_, i) => [`Year ${i + 1} ($, as paid)`, `Year ${i + 1} tickmark`]).flat(),
  `Years 1–${n} ($, as paid)`, `Years 1–${n} tickmark`];

const PARTS: Record<PartTable, (ctx: WorkContext, letter: Letter, n: number) => Built> = {
  a2(ctx, letter, n) {
    const h = hundredOf(ownOf(ctx, letter).detail, n);
    if (!h) throw new Error(`${letter} needs a city and pay in year ${n}.`);
    const year = `year-${n}`;
    return {
      slug: `${letter}-2-where-the-money-goes-year-${n}`,
      title: partRef(ctx, letter, 2, `Where each $100 of ${year} pay goes, and its dollars as paid`),
      header: ["Part", `Of each $100 of ${year} pay ($)`, "Of each $100 tickmark", `Year ${n} ($, as paid)`, `Year ${n} tickmark`],
      rows: [
        ...h.parts.map((q): Cell[] => [cap(A2_LABEL[q.part]), ...fig(ctx, `a2.${letter}.${n}.${q.part}Share` as MetricId, centsText(q.cents)),
          ...fig(ctx, `a2.${letter}.${n}.${q.part}`, moneyText(q.dollars))]),
        ["Paid to you", ...fig(ctx, `a2.${letter}.${n}.hundred`, "$100.00"), ...fig(ctx, `br.${letter}.${n}.paid`, figure(h.paid))],
      ],
    };
  },

  bridge(ctx, letter, n) {
    const b = bridge(ctx, letter, n);
    // A line's dollars, as its label on the page says them: after rent, the offer's own city's, then the prices picked.
    const unit = (line: string) => (line === "own" ? `${b.city} $` : line === "total" ? pricesOf(ctx).unit : "$");
    return {
      slug: `${letter}-2-from-the-offer-letter-year-${n}`,
      title: partRef(ctx, letter, 2, `From the offer letter to after rent, year ${n} (${longDate(b.start)} – ${longDate(dayBefore(b.end))}), as paid`),
      header: ["Line", "Note", "Dollars", `Year ${n} (as paid)`, `Year ${n} tickmark`],
      rows: b.rows.map((row): Cell[] => {
        const lead = row.kind === "less" || row.kind === "plus" || row.kind === "change" ? (row.value < 0 ? "less " : "plus ") : "";
        return [`${lead}${row.label}`, row.gloss ?? "", unit(row.line), ...fig(ctx, row.id, moneyText(row.value))];
      }),
    };
  },

  a3(ctx, letter) {
    const t = yearTable(ctx, letter);
    return {
      slug: `${letter}-3-pay-by-year`,
      title: partRef(ctx, letter, 3, "Pay by employment year and kind, as paid"),
      header: ["Line", ...yearHeads(t.n)],
      rows: payRows(t).map((row): Cell[] => [
        row.line === "gross" ? "Pay" : row.label,
        ...row.values.flatMap((v, i) => fig(ctx, `l6y.${letter}.${row.line}.${i + 1}`, moneyText(v))),
        ...fig(ctx, `l6y.${letter}.${row.line}.sum`, moneyText(row.sum)),
      ]),
    };
  },

  a5(ctx, letter) {
    const t = yearTable(ctx, letter);
    const x = benefitsOf(t);
    const rows: Cell[][] = [];
    if (x.creditedSum > 0) {
      rows.push(["Employer 401(k) money credited", "", ...x.credited.flatMap((v, k) => fig(ctx, `a5.${letter}.credited.${k + 1}`, figure(v))),
        ...fig(ctx, `a5.${letter}.credited.sum`, figure(x.creditedSum))]);
    }
    for (const row of x.rows) {
      rows.push([`${row.lead ? `${row.lead} ` : ""}${row.label}`, row.gloss ?? "", ...row.values.flatMap((v, k) => fig(ctx, `l6y.${letter}.${row.line}.${k + 1}`, moneyText(v))),
        ...fig(ctx, `l6y.${letter}.${row.line}.sum`, moneyText(row.sum))]);
    }
    rows.push(["Total rewards less after-tax pay", "", ...x.added.flatMap((v, k) => fig(ctx, `a5.${letter}.added.${k + 1}`, moneyText(v))),
      ...fig(ctx, `a5.${letter}.added.sum`, moneyText(x.addedSum))]);
    return {
      slug: `${letter}-5-benefits-by-year`,
      title: partRef(ctx, letter, 5, "The benefits and health costs by employment year, as paid"),
      header: ["Line", "Note", ...yearHeads(t.n)],
      rows,
    };
  },

  a6(ctx, letter) {
    const b = ownOf(ctx, letter);
    const kinds = [["gross", "Pay"], ["federal", "Federal income tax"], ["fica", "FICA"], ["state", "State tax"], ["local", "Local tax"], ["tax", "Tax"]] as const;
    return {
      slug: `${letter}-6-tax-by-calendar-year`,
      title: partRef(ctx, letter, 6, "Tax by calendar year: each year's pay, its tax by kind, and its rate"),
      header: ["Calendar year", "Tax law", ...kinds.flatMap(([, name]) => [`${name} ($)`, `${name} tickmark`]), "Rate, of that calendar year's pay (%)", "Rate tickmark"],
      rows: taxYearsOf(b.detail, b.window).map((r): Cell[] => [
        num(r.year), r.projectedLaw ? "projected from 2026" : "2026 tax law",
        ...kinds.flatMap(([k]) => fig(ctx, `a6.${letter}.${r.year}.${k}`, figure(r.values[k]))),
        ...fig(ctx, `a6.${letter}.${r.year}.rate`, shareText(r.rate)),
      ]),
    };
  },
};
