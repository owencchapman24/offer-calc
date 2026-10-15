import { spawnSync } from "node:child_process";

// npm run fuzz: the property tests (app/src/properties.test.ts, display.test.ts) on a random seed, with ten times the runs `npm test`
// gives them, shrinking every counterexample. It prints the seed first: FUZZ_SEED=<seed> npm run fuzz replays a failure.

const seed = process.env.FUZZ_SEED ?? String(Math.floor(Math.random() * 2 ** 31));
const runs = process.env.FUZZ_RUNS ?? "10";
console.log(`Property tests: FUZZ_SEED=${seed} FUZZ_RUNS=${runs}`);
// Ten times the runs takes ten times as long: a property under half a second in `npm test` takes 2-2.5 s here alone, and more
// beside display.test.ts's pages, so vitest's 5 s default timed one out with no counterexample (FUZZ_SEED=1196270253, 5.27 s,
// 2026-10-15). A case that never finishes still fails, at 10 minutes.
const r = spawnSync("npx", ["vitest", "run", "--testTimeout=600000", "app/src/properties.test.ts", "app/src/display.test.ts"], {
  stdio: "inherit", shell: true, env: { ...process.env, FUZZ_SEED: seed, FUZZ_RUNS: runs, FUZZ_SHRINK: "1" },
});
process.exit(r.status ?? 1);
