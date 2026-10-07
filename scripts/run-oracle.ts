// Runs scripts/oracle.py with the project's .venv Python if it exists, else python3/python on PATH.
// Lets `npm run oracle` work without activating the venv (Windows venvs ship no python3.exe).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
const run = spawnSync(python, [join(root, "scripts", "oracle.py"), ...process.argv.slice(2)], { stdio: "inherit" });
if (run.error) console.error(run.error.message);
process.exit(run.status ?? 1);
