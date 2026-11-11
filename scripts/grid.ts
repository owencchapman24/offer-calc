// Dumps engine output over an income grid for every state, for oracle comparison (scripts/oracle.py). The loop is in
// scripts/lib/grid.ts, which test/grid.test.ts shares to check the same rows against the committed baseline.
import { oracleGrid } from "./lib/grid";

console.log(JSON.stringify(oracleGrid()));
