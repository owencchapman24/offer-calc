import { expect, test } from "./lib/fixtures";
import { loadSchedules, openCompare, openParts, settled } from "./lib/app";

// Audit T6: how fast an edit's figures arrive, and whether anything on screen moves while you only scroll. The other browser tests wait
// out whatever the page takes (quiet(), up to 30 s a step), so an engine ten times slower passed them all; Lighthouse measures the
// first load only. These hold the budgets CLAUDE.md states, with room for CI's slower runners, and record what they measured.

/** The budgets, in ms: the lead after an edit (its 200 ms wait included), L-3's and L-4's jobs, and A-7's payments once opened. */
const BUDGET = { lead: 3_000, slowJob: 4_000, payments: 5_000 };

test("an edit's figures arrive within budget: the lead, L-3 and L-4, and A-7's payments (audit T6)", async ({ page }) => {
  test.setTimeout(120_000);
  await openCompare(page);
  await loadSchedules(page);
  const rank = page.locator(".lead .ranks li.offer-B .rank-value .fig-value");
  const before = await rank.textContent();
  await page.locator("#in-B-salary-annual").scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await page.locator("#in-B-salary-annual").fill("95000");
  await expect.poll(() => rank.textContent(), { timeout: BUDGET.lead * 3 }).not.toBe(before);
  await expect(page.locator(".lead.is-updating")).toHaveCount(0);
  const lead = Date.now() - t0;
  await settled(page);
  // L-3 and L-4 work out on screen: each records how long its job took (data-fill-ms, the worker's SlowState.ms).
  const jobs: Record<string, number> = {};
  for (const schedule of [".ties", ".leaving"]) {
    await page.locator(schedule).scrollIntoViewIfNeeded();
    await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
    jobs[schedule] = Number(await page.locator(schedule).getAttribute("data-fill-ms"));
  }
  // A-7's payments: from Show the tables to worked out, its code already loaded with A's breakdown.
  await openParts(page, "A");
  const work = page.locator('section[aria-labelledby="A-7-title"]');
  await work.scrollIntoViewIfNeeded();
  const t1 = Date.now();
  await work.locator(".l6-toggle").click();
  await expect(work).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  await expect(work.locator(".l6-payments")).toBeVisible();
  const payments = Date.now() - t1;
  const measured = `lead ${lead} ms, L-3 ${jobs[".ties"]} ms, L-4 ${jobs[".leaving"]} ms, A-7 ${payments} ms`;
  test.info().annotations.push({ type: "budget", description: measured });
  console.log(`Budget: ${measured}`);
  expect(lead, "the lead, after an edit").toBeLessThan(BUDGET.lead);
  expect(jobs[".ties"], "L-3's job").toBeLessThan(BUDGET.slowJob);
  expect(jobs[".leaving"], "L-4's job").toBeLessThan(BUDGET.slowJob);
  expect(payments, "A-7's payments, opened").toBeLessThan(BUDGET.payments);
});

test("scrolling down the page moves nothing already on screen (audit T6)", async ({ page }) => {
  test.setTimeout(120_000);
  await openCompare(page);
  // Shifts not caused by a click or a key (hadRecentInput): scrolling isn't input, so a schedule filling in above what you're
  // reading, and pushing it down, counts.
  await page.evaluate(() => {
    const w = window as unknown as { shifts: Array<{ value: number; nodes: string[] }> };
    w.shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node }> }>) {
        if (!e.hadRecentInput) w.shifts.push({ value: e.value, nodes: (e.sources ?? []).map((s) => (s.node instanceof Element ? `${s.node.tagName}.${s.node.className}` : String(s.node?.nodeName))) });
      }
    }).observe({ type: "layout-shift" });
  });
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height + 2_000; y += 600) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
  }
  await settled(page);
  const shifts = await page.evaluate(() => (window as unknown as { shifts: Array<{ value: number; nodes: string[] }> }).shifts);
  const total = shifts.reduce((s, x) => s + x.value, 0);
  test.info().annotations.push({ type: "layout shift", description: `${total.toFixed(4)} over ${shifts.length} shifts: ${JSON.stringify(shifts.slice(0, 8))}` });
  console.log(`Layout shift while scrolling: ${total.toFixed(4)} over ${shifts.length} shifts`);
  expect(total, JSON.stringify(shifts.slice(0, 8))).toBeLessThan(0.05);
});
