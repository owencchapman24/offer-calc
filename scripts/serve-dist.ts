// Serves the production build (dist/) the way Vercel does, compressed and with vercel.json's headers (the CSP
// included), for the Playwright tests: `tsx scripts/serve-dist.ts [port]`. Run `npm run build` first.
import { existsSync } from "node:fs";
import { serveDist } from "./lib/serve";

if (!existsSync("dist/index.html")) {
  console.error("No production build in dist/: run `npm run build` first.");
  process.exit(1);
}
const port = Number(process.argv[2] ?? 4180);
const { url } = await serveDist("dist", "vercel.json", port);
console.log(`Serving dist/ at ${url}`);
