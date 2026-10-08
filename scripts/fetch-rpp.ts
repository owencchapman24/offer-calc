// Fetches BEA Regional Price Parities and bakes them into src/col/rpp.json (the app never
// fetches at runtime). Usage: npm run fetch-rpp
//
// Source: U.S. Bureau of Economic Analysis regional data downloads, RPPs by MSA (MARPP), by
// state metro/nonmetro portion (PARPP) and by state (SARPP). Each zip holds CSVs with line
// codes 1-5: all items, goods, housing (rents), utilities, other services. We keep the latest
// year in the files.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzip } from "./lib/zip";

const FILES = {
  MARPP: "https://apps.bea.gov/regional/zip/MARPP.zip",
  PARPP: "https://apps.bea.gov/regional/zip/PARPP.zip",
  SARPP: "https://apps.bea.gov/regional/zip/SARPP.zip",
} as const;
/** BEA, Survey of Current Business, March 2022: housing rents were 16% of the PCE-based weights (2019). */
const HOUSING_WEIGHT = 0.16;
const COMPONENTS = ["allItems", "goods", "housing", "utilities", "otherServices"] as const;
const OUT = fileURLToPath(new URL("../src/col/rpp.json", import.meta.url));

/** Splits one CSV line on commas outside double quotes; trims spaces and quotes. */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

interface Area { name: string; kind: string; values: Partial<Record<(typeof COMPONENTS)[number], number>> }

function kindOf(table: string, fips: string): string {
  if (fips === "00000") return "national";
  if (fips === "00999") return "nationalNonmetro";
  if (table === "MARPP") return "msa";
  if (table === "SARPP") return "state";
  return fips.endsWith("998") ? "stateMetro" : "stateNonmetro";
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "offer-calc-rpp-"));
  const areas = new Map<string, Area>();
  const notes = new Set<string>();
  let dataYear = 0;
  try {
    for (const [table, url] of Object.entries(FILES)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const zip = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(dir, `${table}.zip`), zip);
      const csvName = [...unzip(zip).keys()].find((n) => n.startsWith(`${table}_`) && n.endsWith(".csv"));
      if (!csvName) throw new Error(`${table}: no ${table}_*.csv in the zip.`);
      const lines = unzip(zip).get(csvName)!.toString("utf8").split(/\r?\n/);
      const header = parseLine(lines[0]);
      const yearCol = header.length - 1;
      dataYear = Math.max(dataYear, Number(header[yearCol]));
      for (const line of lines.slice(1)) {
        const cells = parseLine(line);
        if (/^Last updated/.test(cells[0] ?? "")) notes.add(cells[0]);
        if (!/^\d{5}$/.test(cells[0] ?? "")) continue;
        const code = Number(cells[4]);
        const value = Number(cells[yearCol]);
        if (!(code >= 1 && code <= 5) || !Number.isFinite(value)) continue;
        const fips = cells[0];
        const area = areas.get(fips) ?? { name: cells[1].replace(/\s*\*$/, ""), kind: kindOf(table, fips), values: {} };
        area.values[COMPONENTS[code - 1]] = value;
        areas.set(fips, area);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const complete = [...areas].filter(([, a]) => COMPONENTS.every((c) => a.values[c] !== undefined)).sort(([a], [b]) => a.localeCompare(b));
  const us = areas.get("00000");
  // Only all-items is normalized to 100 for the U.S.; components are price levels on the same
  // scale (2024: goods 99.567, housing 100.629), so comparisons always use ratios to a reference row.
  if (!us || us.values.allItems !== 100 || COMPONENTS.some((c) => us.values[c] === undefined)) {
    throw new Error("Sanity check failed: the U.S. row should exist with all-items = 100.");
  }

  // Cross-check: the fixed weights that best reproduce all-items from the components across areas.
  // BEA aggregates with regional PCE weights, so this only roughly matches; we use the published 16%.
  const fitHousingWeight = estimateHousingWeight(complete.map(([, a]) => a));

  const head = {
    source: "U.S. Bureau of Economic Analysis, Regional Price Parities by MSA (MARPP), by state portion (PARPP) and by state (SARPP)",
    files: Object.values(FILES),
    vintage: [...notes][0] ?? "unknown",
    dataYear,
    fetchedOn: new Date().toISOString().slice(0, 10),
    delineation: "Metropolitan areas per OMB bulletin 23-01 (July 21, 2023)",
    components: { allItems: "line 1", goods: "line 2", housing: "line 3: services, housing (rents)", utilities: "line 4: services, utilities", otherServices: "line 5: services, other" },
    scale: "Index, U.S. all items = 100. Components are price levels on the same scale (the U.S. components aren't exactly 100), so compare areas by ratios to a reference row.",
    nonHousing: {
      formula: `(allItems - ${HOUSING_WEIGHT} x housing) / ${1 - HOUSING_WEIGHT}`,
      housingWeight: HOUSING_WEIGHT,
      source: "BEA, Survey of Current Business, March 2022, 'Revisions to Estimation Methods for Regional Price Parities': housing rents were 16 percent of the PCE-based weights in 2019",
      crossCheck: `Least-squares fixed weights across ${complete.length} areas put housing at ${fitHousingWeight.toFixed(3)}`,
    },
  };
  const body = complete.map(([fips, a]) =>
    `    ${JSON.stringify(fips)}: ${JSON.stringify({ name: a.name, kind: a.kind, ...a.values })}`).join(",\n");
  const json = `${JSON.stringify(head, null, 2).replace(/\n}$/, "")},\n  "areas": {\n${body}\n  }\n}\n`;
  JSON.parse(json); // must round-trip
  writeFileSync(OUT, json);
  console.log(`Wrote ${complete.length} areas (${dataYear} RPPs; ${head.vintage}) to src/col/rpp.json`);
}

/** Constrained least squares (weights sum to 1) of all-items on the four components; returns housing's weight. */
function estimateHousingWeight(list: Area[]): number {
  const rows = list.map((a) => a.values as Record<(typeof COMPONENTS)[number], number>);
  const X = rows.map((v) => [v.goods - v.otherServices, v.housing - v.otherServices, v.utilities - v.otherServices]);
  const y = rows.map((v) => v.allItems - v.otherServices);
  const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((s, x) => s + x[i] * x[j], 0)));
  const b = [0, 1, 2].map((i) => X.reduce((s, x, k) => s + x[i] * y[k], 0));
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  return det(A.map((row, i) => row.map((v, j) => (j === 1 ? b[i] : v)))) / det(A);
}

main().catch((e) => { console.error(e); process.exit(1); });
