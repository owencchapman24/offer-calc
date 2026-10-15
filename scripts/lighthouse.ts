// Lighthouse on the production build, mobile profile: a warm-up run (discarded), then five. Fails if the median
// Largest Contentful Paint is over 2.5 s, the median layout shift over 0.02 or the median blocking time over 200 ms, or if
// a run shows no verdict; reports the time to the first answer (scripts/lib/lighthouse.ts). Run after `npm run build`:
// `npm run lighthouse`. CI runs it.
//   npm run lighthouse -- <url>   audits a deployed page instead (say, https://offer-calc.vercel.app/)
// It needs Chrome, or CHROME_PATH set to a Chromium browser. On Windows without Chrome it uses Edge.
// The median run's report is written to .lighthouse/report.html.
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { CLS_BUDGET, LCP_BUDGET_MS, RUNS, TBT_BUDGET_MS, toRun, verdict, WARMUP_RUNS, type Run } from "./lib/lighthouse";
import { serveDist } from "./lib/serve";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const chromePath = process.env.CHROME_PATH
  ?? (process.platform === "win32" && !existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe") && existsSync(EDGE) ? EDGE : undefined);

const target = process.argv[2];
const local = target ? undefined : await serveDist("dist", "vercel.json");
const url = target ?? local!.url;
// A fixed port: Edge doesn't report a dynamic one where chrome-launcher looks for it.
const chrome = await launch({
  chromePath,
  port: await freePort(),
  chromeFlags: ["--headless=new", ...(process.env.CI ? ["--no-sandbox"] : [])],
});

const runs: Run[] = [];
const reports: string[] = [];
try {
  for (let i = -WARMUP_RUNS; i < RUNS; i++) {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "html",
      onlyCategories: ["performance"],
      formFactor: "mobile",
      throttlingMethod: "simulate",
      logLevel: "error",
    });
    if (!result) throw new Error("Lighthouse returned nothing.");
    const run = toRun(result.lhr);
    const numbers = `performance ${run.score}, FCP ${s(run.fcpMs)}, LCP ${s(run.lcpMs)}, TBT ${Math.round(run.tbtMs)} ms, CLS ${run.cls.toFixed(3)}; `
      + `observed: LCP ${opt(run.observedLcpMs)}, first answer ${opt(run.firstAnswerMs)}`;
    // The warm-up warms the browser and the server: it's shown, not counted.
    if (i < 0) {
      console.log(`Warm-up (discarded): ${numbers}`);
      continue;
    }
    runs.push(run);
    reports.push(String(result.report));
    console.log(`Run ${i + 1}: ${numbers}`);
  }
} finally {
  await closeBrowser(chrome.port);
  await chrome.kill();
  local?.server.close();
}

const v = verdict(runs);
const m = v.median!;
mkdirSync(".lighthouse", { recursive: true });
writeFileSync(".lighthouse/report.html", reports[runs.indexOf(m)]);
const line = `${target ?? "Production build"}, mobile, after a warm-up, medians of ${RUNS} runs: LCP ${s(v.lcpMs!)} `
  + `(budget ${s(LCP_BUDGET_MS)}), CLS ${v.cls!.toFixed(3)} (budget ${CLS_BUDGET}), TBT ${Math.round(v.tbtMs!)} ms (budget ${TBT_BUDGET_MS} ms), `
  + `performance ${v.score}. LCP element: ${m.lcpElement ?? "unknown"}. Observed (unthrottled): LCP ${opt(v.observedLcpMs)}, `
  + `the first answer ${opt(v.firstAnswerMs)} (reported, not budgeted). Report (the median LCP's run): .lighthouse/report.html`;
if (!v.ok) {
  console.error(`Lighthouse check failed. ${line}\n${v.problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Lighthouse check: ${line}`);

// Edge relaunches itself, so the process chrome-launcher started isn't the browser and kill() misses
// it. Closing the browser over the DevTools protocol first ends it wherever it runs.
async function closeBrowser(port: number) {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl: string };
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(webSocketDebuggerUrl);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      ws.onclose = ws.onerror = () => resolve();
      setTimeout(resolve, 5000);
    });
  } catch {
    // Already gone.
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

function s(ms: number) { return `${(ms / 1000).toFixed(2)} s`; }
function opt(ms: number | undefined) { return ms === undefined ? "none" : s(ms); }
