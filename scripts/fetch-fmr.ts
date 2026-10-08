// Fetches HUD Fair Market Rents and bakes the metro areas into src/col/fmr.json (the app never
// fetches at runtime). Usage: npm run fetch-fmr [-- <fiscal year>], default 2027. HUD publishes the
// next fiscal year's FMRs each August or September, effective October 1: re-run then.
//
// Source: HUD USER, Fair Market Rents, county-level file FY{yy}_FMRs.xlsx: one row per county (New
// England: per town) with its HUD FMR area and the area's FMRs for 0-4 bedrooms. FMRs are the 40th
// percentile of gross rents (rent plus utilities) for standard-quality units rented by recent movers
// (24 CFR 888.113). We keep metro areas only, grouped by HUD area, with the CBSA code from the area
// code (METRO<cbsa>...), the states they cover and their 2024 population.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSheet, unzip } from "./lib/zip";

const fiscalYear = Number(process.argv[2] ?? 2027);
if (!Number.isInteger(fiscalYear) || fiscalYear < 2025) throw new Error("Pass a fiscal year, e.g. 2027.");
const yy = String(fiscalYear).slice(2);
const URL_FMR = `https://www.huduser.gov/portal/datasets/fmr/fmr${fiscalYear}/FY${yy}_FMRs.xlsx`;
const OUT = fileURLToPath(new URL("../src/col/fmr.json", import.meta.url));
// HUD USER answers clients without a browser User-Agent with an empty 202 page.
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" };
const COLUMNS = ["stusps", "hud_area_code", "hud_area_name", "metro", "pop2024", "fmr_0", "fmr_1", "fmr_2", "fmr_3", "fmr_4"];

const res = await fetch(URL_FMR, { headers: HEADERS });
if (!res.ok || !(res.headers.get("content-type") ?? "").includes("spreadsheetml")) {
  throw new Error(`HUD returned ${res.status} ${res.headers.get("content-type")} for ${URL_FMR}.`);
}
// The download is data, not code: it goes to its own temp directory and is only parsed.
const dir = mkdtempSync(join(tmpdir(), "fmr-"));
const file = join(dir, `FY${yy}_FMRs.xlsx`);
writeFileSync(file, Buffer.from(await res.arrayBuffer()));
const workbook = unzip(readFileSync(file));
rmSync(dir, { recursive: true, force: true });

// Field descriptions (sheet 2) say which fiscal year the FMR columns are for; check it.
const fields = readSheet(workbook, 2);
const fmrField = fields.find((r) => r[0] === "fmr_1")?.[1] ?? "";
if (!fmrField.includes(`FY ${fiscalYear}`)) throw new Error(`Expected FY ${fiscalYear} FMRs, found "${fmrField}".`);

const [header, ...rows] = readSheet(workbook, 1);
const col = Object.fromEntries(COLUMNS.map((c) => {
  const i = header.indexOf(c);
  if (i < 0) throw new Error(`HUD file has no "${c}" column: ${header.join(", ")}`);
  return [c, i];
}));

interface Area { name: string; cbsa: string; states: string[]; pop: number; fmr: number[] }
const areas: Record<string, Area> = {};
for (const r of rows) {
  const code = r[col.hud_area_code];
  if (r[col.metro] !== "1" || !code?.startsWith("METRO")) continue;
  const fmr = [0, 1, 2, 3, 4].map((b) => Number(r[col[`fmr_${b}`]]));
  if (fmr.some((x) => !(x > 0))) throw new Error(`Bad FMRs for ${code}: ${fmr.join(", ")}`);
  const a = areas[code] ??= { name: r[col.hud_area_name], cbsa: code.slice(5, 10), states: [], pop: 0, fmr };
  if (a.fmr.join() !== fmr.join()) throw new Error(`FMRs differ within ${code}: ${a.fmr} vs ${fmr}`);
  if (!a.states.includes(r[col.stusps])) a.states.push(r[col.stusps]);
  a.pop += Number(r[col.pop2024]) || 0;
}
const count = Object.keys(areas).length;
if (count < 400) throw new Error(`Only ${count} metro FMR areas: the file layout may have changed.`);

const lastModified = res.headers.get("last-modified");
const meta = {
  source: "HUD USER, Fair Market Rents, county-level file",
  url: URL_FMR,
  fiscalYear,
  effective: `${fiscalYear - 1}-10-01`,
  published: lastModified ? new Date(lastModified).toISOString().slice(0, 10) : null,
  fetchedOn: new Date().toISOString().slice(0, 10),
  definition: "40th percentile of gross rents (rent plus utilities) for standard-quality units rented by recent movers (24 CFR 888.113).",
  bedrooms: ["studio", "1 bedroom", "2 bedrooms", "3 bedrooms", "4 bedrooms"],
};
// One area per line keeps the file small and HUD's yearly updates readable as diffs.
const lines = Object.entries(areas).sort(([a], [b]) => a.localeCompare(b))
  .map(([code, area]) => `  ${JSON.stringify(code)}: ${JSON.stringify(area)}`);
writeFileSync(OUT, `${JSON.stringify(meta, null, 1).slice(0, -2)},\n "areas": {\n${lines.join(",\n")}\n }\n}\n`);
console.log(`Wrote ${count} metro FMR areas (FY${fiscalYear}) to ${OUT}`);
