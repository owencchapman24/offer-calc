import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openCompare, openWork, settled, verdictText } from "./lib/app";

// The smoke tests (docs/ui-design.md §10): the app works end to end on the production build. A salary edit updates the
// verdict; an export, imported back, gives the same results.

/** An offer's value in the rank list, as a number. */
const rankValue = async (page: Page, letter: string) =>
  Number((await page.locator(`.lead .ranks li.offer-${letter} .rank-value .fig-value`).textContent())!.replace(/[^\d.]/g, ""));

test("a salary edit updates the verdict", async ({ page }) => {
  await openCompare(page);
  const before = await verdictText(page);
  const b = await rankValue(page, "B");
  // B, the samples' last place, gets a salary that puts it first.
  await page.locator("#in-B-salary-annual").fill("400000");
  await expect(page.locator(".lead.is-updating")).toHaveCount(0);
  await expect.poll(() => rankValue(page, "B")).toBeGreaterThan(b);
  await settled(page);
  const after = await verdictText(page);
  expect(after.hero).not.toEqual(before.hero);
  expect(after.ranks[0]).toMatch(/^B/);
  await expect(page.locator(".lead .verdict-lede").first()).toHaveText(/^B leaves you about/);
});

test("L-6 asks the worker for its payments only once it's opened, and its totals tie to the rank list", async ({ page }) => {
  // What the page asks the engine worker for: each message's lane.
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
      const w = window as unknown as { lanes?: string[] };
      (w.lanes ??= []).push((message as { lane?: string } | null)?.lane ?? "compare");
      return (post as (...args: unknown[]) => void).call(this, message, ...rest);
    };
  });
  const lanes = () => page.evaluate(() => (window as unknown as { lanes?: string[] }).lanes ?? []);
  await openCompare(page);
  // L-6 loads as you scroll toward it, closed: nothing asked for yet.
  const title = page.locator("#l6-title");
  for (let i = 0; i < 80 && !(await title.count()); i++) await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
  await expect(page.locator(".l6-toggle")).toHaveAttribute("aria-expanded", "false");
  await settled(page);
  expect(await lanes()).not.toContain("work");
  await openWork(page, "A");
  expect(await lanes()).toContain("work");
  // Its present value on the verdict's basis is the rank list's figure, and its stay is L-1's.
  const shown = (sel: string) => page.locator(`${sel} .fig-value`).first().textContent();
  expect(await shown('[data-metric="l6s.A.colAdjustedTotal.pv"]')).toBe(await shown(".lead .ranks li.offer-A .rank-value"));
});

test("export, then import: the same results", async ({ page }) => {
  await openCompare(page);
  const before = await verdictText(page);

  await page.getByRole("link", { name: "Data" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download offer-calc-/ }).click();
  const file = readFileSync(await (await download).path(), "utf8");
  expect(JSON.parse(file)).toMatchObject({ format: "offer-calc", schemaVersion: 3 });

  // Change the inputs, so the import has something to restore.
  await page.getByRole("link", { name: "Compare" }).click();
  await settled(page);
  await page.locator("#in-C-salary-annual").fill("50000");
  await expect.poll(() => verdictText(page)).not.toEqual(before);
  await settled(page);

  await page.getByRole("link", { name: "Data" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "offer-calc-export.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await expect(page.locator(".import-review")).toBeVisible();
  await expect(page.locator(".import-review")).toContainText("Its inputs check out");
  await page.getByRole("button", { name: "Replace everything" }).click();
  // Focus lands on the confirmation, which links back to the comparison.
  await expect(page.getByRole("status").filter({ hasText: "Imported 3 offers" })).toBeFocused();
  await page.getByRole("link", { name: "See the comparison" }).click();
  await settled(page);
  expect(await verdictText(page)).toEqual(before);

  // And exported again, it's the same file (but for when it was exported).
  await page.getByRole("link", { name: "Data" }).click();
  const again = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download offer-calc-/ }).click();
  const second = JSON.parse(readFileSync(await (await again).path(), "utf8"));
  expect({ ...second, exportedAt: null }).toEqual({ ...JSON.parse(file), exportedAt: null });
});
