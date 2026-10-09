import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { scan } from "./lib/axe";
import { EDITORS, loadSchedules, openCompare, openEditor, openSection, SECTIONS, settled, showTheWork } from "./lib/app";

// The automated accessibility scan (docs/ui-slices-4-8-plan.md, slice 7): every state below, in each of the config's
// four projects (desktop and phone widths, light and dark). Any WCAG A/AA violation fails, unless
// test/a11y-exceptions.json accepts it with a reason. The report is written to .a11y/report.md.

test.describe("compare", () => {
  test("quick mode", async ({ page }) => {
    await openCompare(page);
    await scan(page, "quick mode");
  });

  test("the schedules, L-1 to L-5", async ({ page }) => {
    await openCompare(page);
    await loadSchedules(page);
    await scan(page, "L-1 to L-5");
    // L-4 on your stay's last day: the panel reconciles leaving then with the stay.
    await page.getByRole("button", { name: /^Your stay's last day/ }).click();
    await expect(page.locator(".leave-recon").first()).toBeVisible();
    await expect(page.locator(".leaving")).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
    await scan(page, "L-4 on your stay's last day");
  });

  test("L-1's table view", async ({ page }) => {
    await openCompare(page);
    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page.locator("#l1-table")).toBeVisible();
    await scan(page, "L-1's table view");
  });

  test("Show the work", async ({ page }) => {
    await openCompare(page);
    await showTheWork(page, "hero");
    await scan(page, "Show the work: the verdict");
    // Drilling into a figure it uses: its own derivation, with the way back.
    await page.locator(".work .fig").first().click();
    await expect(page.locator(".work .work-back")).toBeVisible();
    await scan(page, "Show the work: drilled down");
    await page.keyboard.press("Escape");
    await expect(page.locator(".work")).toHaveCount(0);
    // An input's default, with "Edit it".
    await showTheWork(page, "about.filing");
    await scan(page, "Show the work: a default");
  });
});

test.describe("detailed mode", () => {
  for (const section of SECTIONS) {
    test(`section: ${section}`, async ({ page }) => {
      await openCompare(page);
      await openSection(page, section);
      await scan(page, `detailed: ${section}`);
    });
  }
  for (const e of EDITORS) {
    test(`row editor: ${e.title}`, async ({ page }) => {
      await openCompare(page);
      await openEditor(page, e);
      await scan(page, `editor: ${e.title}`);
    });
  }
});

test("methodology", async ({ page }) => {
  await page.goto("/#/method");
  await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
  // Its live numbers come with the comparison.
  await expect(page.locator(".method-assumptions").first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await scan(page, "methodology");
});

test("the Data page: export, the import review, problems, delete", async ({ page }) => {
  await openCompare(page);
  await page.getByRole("link", { name: "Data" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your data" })).toBeVisible();
  await scan(page, "Data page");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download offer-calc-/ }).click();
  const file = readFileSync(await (await download).path(), "utf8");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "offer-calc-export.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await expect(page.locator(".import-review")).toBeVisible();
  await scan(page, "Data page: the import review");

  // An import whose inputs have problems: the review lists them.
  const bad = JSON.parse(file);
  bad.offers[0].draft.salary.annual = -5;
  bad.offers[1].draft.startDate = null;
  await input.setInputFiles({ name: "offer-calc-problems.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator(".import-review .stale")).toBeVisible();
  await scan(page, "Data page: an import with problems");

  // A file that isn't an export.
  await input.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"format":"something else"}') });
  await expect(page.locator(".data-page .stale[role='alert']")).toBeVisible();
  await scan(page, "Data page: a file it can't import");

  await page.getByRole("button", { name: "Delete all data…" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await scan(page, "Data page: delete, confirming");
  await page.getByRole("button", { name: "Cancel" }).click();
  // Back on the comparison, the results are as they were.
  await page.getByRole("link", { name: "Compare" }).click();
  await settled(page);
});
