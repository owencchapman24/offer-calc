// The engine (src/tax, src/offer, src/col) returns numbers and codes; src/format turns them into
// text. This fails if formatting creeps back into the engine. Run by `npm test`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ENGINE = ["src/tax", "src/offer", "src/col"];
const FORBIDDEN: Array<[RegExp, string]> = [
  [/toLocaleString\(/, "number formatting (toLocaleString)"],
  [/\bIntl\./, "Intl formatting"],
  [/from "\.\.\/(\.\.\/)?format/, "an import from src/format"],
];

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
});

const problems: string[] = [];
for (const file of ENGINE.flatMap(files)) {
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return; // comments may mention these
    for (const [re, what] of FORBIDDEN) if (re.test(line)) problems.push(`${file}:${i + 1}: ${what}`);
  });
}
if (problems.length) {
  console.error(`Engine formatting check failed: format in src/format, not the engine.\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Engine formatting check: ${ENGINE.flatMap(files).length} files clean.`);
