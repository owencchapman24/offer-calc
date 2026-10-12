// Runs scripts/oracle.py with the project's .venv Python if it exists, else python3/python on PATH.
// Lets `npm run oracle` work without activating the venv (Windows venvs ship no python3.exe).
// First it checks the environment against requirements-lock.txt (the .venv the baseline was taken with) and warns if it has
// drifted: a report from another environment may not compare with the baseline. It warns rather than stops.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drift, readFreeze } from "./lib/lock";

const root = fileURLToPath(new URL("..", import.meta.url));
const venvPython = process.platform === "win32"
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python");

// `--version` exiting 0 rules out the Windows Store "python3" stub when Python isn't installed.
const works = (cmd: string) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

const python = existsSync(venvPython) ? venvPython : ["python3", "python"].find(works);
if (!python) {
  console.error("oracle: no Python found. Create .venv (see README) or put python3/python on PATH.");
  process.exit(1);
}
console.error(`oracle: using ${python}`);

const lockFile = join(root, "requirements-lock.txt");
const freeze = spawnSync(python, ["-m", "pip", "freeze"], { encoding: "utf8" });
if (existsSync(lockFile) && freeze.status === 0) {
  const d = drift(readFreeze(readFileSync(lockFile, "utf8")), readFreeze(freeze.stdout));
  if (d.changed.length) {
    console.error("oracle: WARNING: this environment differs from requirements-lock.txt, so its report may not compare with the baseline:");
    for (const [name, locked, installed] of d.changed) console.error(`  ${name}: ${installed} installed, ${locked} locked`);
    console.error(`  To match the lock: ${python} -m pip install -r requirements.txt -c requirements-lock.txt`);
  } else {
    console.error("oracle: environment matches requirements-lock.txt");
  }
  if (d.extra.length) console.error(`oracle: not in the lock (platform-specific, or installed separately): ${d.extra.join(", ")}`);
}
const run = spawnSync(python, [join(root, "scripts", "oracle.py"), ...process.argv.slice(2)], { stdio: "inherit" });
if (run.error) console.error(run.error.message);
process.exit(run.status ?? 1);
