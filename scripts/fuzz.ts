import { spawnSync } from "node:child_process";

// npm run fuzz: the property tests (app/src/properties.test.ts, display.test.ts) on a random seed, with ten times the runs `npm test`
// gives them, shrinking every counterexample. It prints the seed first: FUZZ_SEED=<seed> npm run fuzz replays a failure.

const seed = process.env.FUZZ_SEED ?? String(Math.floor(Math.random() * 2 ** 31));
const runs = process.env.FUZZ_RUNS ?? "10";
console.log(`Property tests: FUZZ_SEED=${seed} FUZZ_RUNS=${runs}`);
const r = spawnSync("npx", ["vitest", "run", "app/src/properties.test.ts", "app/src/display.test.ts"], {
  stdio: "inherit", shell: true, env: { ...process.env, FUZZ_SEED: seed, FUZZ_RUNS: runs, FUZZ_SHRINK: "1" },
});
process.exit(r.status ?? 1);
