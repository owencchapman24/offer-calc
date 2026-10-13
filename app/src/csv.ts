import type { Basis } from "../../src/offer/types";
import { CASES, dropText, riskView } from "./cases";
import { basisPhrase, type MetricId, metricKind, pricesOf, res, type WorkContext } from "./metrics";
import { byYear } from "./byYearModel";
import type { Letter } from "./model";
import { cents, dayBefore, figure, longDate } from "./text";
import { TICKS, type TickKind } from "./ui";
import {
  KIND_NAME, moneyText, paymentFormula, paymentLabel, paymentYears, rateText, rowText, sectionName, stayRows, type TaxCol, taxTables, toCent,
  yearTable,
} from "./workpaper";

// CSV export of each table (docs/ui-design.md §4.8, §10): L-1's and L-2's table views, and L-6's four tables for an offer.
// Each is built from the same view model as the table on screen, and each figure is the figure shown, written as a plain number:
// its display text with the thousands separators, currency signs and parentheses taken out ("(41,724)" is -41724, "$21.85"
// is 21.85, "27.2735%" is 27.2735), units in the column headers. Beside each figure, a column with its tickmark (metricKind).
// Line 1 says so when any offer is a sample, and the file name ends -sample, as the JSON export's does. Text cells are guarded
// against a spreadsheet running them as formulas: offer labels and award names are free text. Loaded on the first download.

export type L6Part = "years" | "stay" | "payments" | "tax";
/** A table to export: L-1's table view (each year or the running total), L-2's, or one of L-6's for an offer. */
export type CsvTable = { kind: "l1"; running: boolean } | { kind: "l2" } | { kind: "l6"; letter: Letter; part: L6Part };

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
    [scope(ctx)],
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
    case "l6": return L6[t.part](ctx, t.letter);
  }
}

/** "Base case · stay 4 years (Jul 13, 2026 – Jul 12, 2030) · Offer Calc, exported Oct 12, 2026" */
function scope(ctx: WorkContext): string {
  const row = res(ctx).view.row;
  return `Base case · stay ${row.years} ${row.years === 1 ? "year" : "years"} (${longDate(row.window.start)} – ${longDate(dayBefore(row.window.end))})`
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
  const u = basis === "colAdjustedTotal" ? `${pricesOf(ctx).unit}, as paid` : basis === "perHour" ? "$ an hour, as paid" : "$, as paid";
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
  const units = v.perHour ? "$ an hour, nominal" : `${r.view.basis === "colAdjustedTotal" ? pricesOf(ctx).unit : "$"}, ${v.years}-year total, present value`;
  const fmt = (x: number) => (v.perHour ? cents(x) : figure(x));
  const word = { bear: "Bear", base: "Base", bull: "Bull" } as const;
  const phrase = v.perHour ? "per hour worked" : basisPhrase(pricesOf(ctx))[r.view.basis];
  return {
    slug: "L-2-if-things-go-badly",
    title: `L-2 · If things go badly · ${cap(phrase)}, each offer in the bear, base and bull cases. ${offersLine(ctx, r.letters)}`,
    header: ["Offer", ...CASES.flatMap((s) => [`${word[s]} (${units})`, `${word[s]} tickmark`]), "Bear vs base (%)", "Bear vs base tickmark"],
    rows: [...v.rows].sort((a, b) => a.letter.localeCompare(b.letter)).map((row) => [
      row.letter,
      ...CASES.flatMap((s) => fig(ctx, `risk.${row.letter}.${s}`, fmt(row.values[s]))),
      ...fig(ctx, `drop.${row.letter}`, dropText(row)),
    ]),
  };
}

// ---- L-6, the work: an offer's four tables ---------------------------------------------------------------

const ref = (ctx: WorkContext, letter: Letter, what: string) => `L-6.${letter}${label(ctx, letter) ? ` · ${label(ctx, letter)}` : ""} · ${what}`;
const PART_SLUG: Record<L6Part, string> = { years: "employment-years", stay: "your-stay", payments: "every-payment", tax: "tax-by-year" };
const slug = (letter: Letter, part: L6Part) => `L-6-${letter}-${PART_SLUG[part]}`;

const L6: Record<L6Part, (ctx: WorkContext, letter: Letter) => Built> = {
  years(ctx, letter) {
    const t = yearTable(ctx, letter);
    const unit = (u: "dollars" | "hours" | "perHour") => (u === "hours" ? " (hours)" : u === "perHour" ? " ($ an hour)" : "");
    return {
      slug: slug(letter, "years"),
      title: ref(ctx, letter, "Employment years, line by line, as paid, not discounted"),
      header: ["Line", "Section", "Label", "Note", ...t.years.flatMap((y) => [`Year ${y.n} ($, as paid)`, `Year ${y.n} tickmark`]),
        `Years 1–${t.n} ($, as paid)`, `Years 1–${t.n} tickmark`],
      rows: t.rows.map((row) => [
        num(row.no), sectionName(t, row.section), `${row.label}${unit(row.unit)}`, row.gloss ?? "",
        ...row.values.flatMap((v, i) => fig(ctx, `l6y.${letter}.${row.line}.${i + 1}`, rowText(row, v))),
        ...fig(ctx, `l6y.${letter}.${row.line}.sum`, rowText(row, row.sum)),
      ]),
    };
  },

  stay(ctx, letter) {
    const rows = stayRows(ctx, letter);
    const n = res(ctx).view.row.years;
    const after = rows.some((x) => x.after);
    return {
      slug: slug(letter, "stay"),
      title: ref(ctx, letter, "Your stay on each basis, as paid and in present value; tied to the lead schedule and L-1"),
      header: ["Basis", `Years 1–${n} ($, as paid)`, `Years 1–${n} tickmark`,
        ...(after ? ["Past your stay's last day ($)", "Past your stay's last day tickmark"] : []),
        "Your stay, as paid ($)", "Your stay tickmark", "Present value today ($)", "Present value tickmark"],
      rows: rows.map((x) => [
        x.label,
        ...fig(ctx, `l6y.${letter}.${x.line}.sum`, figure(x.years)),
        ...(after ? (x.after ? fig(ctx, `l6s.${letter}.${x.basis}.after`, moneyText(-x.after)) : [null, null]) : []),
        ...fig(ctx, `l6s.${letter}.${x.basis}.stay`, figure(x.stay)),
        ...fig(ctx, `l6s.${letter}.${x.basis}.pv`, figure(x.pv)),
      ]),
    };
  },

  payments(ctx, letter) {
    const rows: Cell[][] = [];
    for (const y of paymentYears(ctx, letter)) {
      const year = y.ey === "after" ? "After your stay" : `Year ${y.ey}`;
      for (const g of y.groups) {
        for (const { i, p } of g.rows) {
          rows.push([year, KIND_NAME[g.component], paymentLabel(p), p.date, paymentFormula(p),
            ...fig(ctx, `l6p.${letter}.${i}.gross`, toCent(p.gross)), ...fig(ctx, `l6p.${letter}.${i}.tax`, toCent(p.tax))]);
        }
        if (g.rows.length > 1) {
          rows.push([year, KIND_NAME[g.component], `${KIND_NAME[g.component]}, ${y.ey === "after" ? "after your stay" : `year ${y.ey}`}: the payments added`, "", "",
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
