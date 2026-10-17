import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { scan } from "./lib/axe";
import {
  addOffer, EDITORS, fillOffer, loadSchedules, openAlone, openCompare, openEditor, openSection, openWithSaved, openWork, ownSettled, printWithButton,
  quiet, SAVED, SECTIONS, selectOffer, settled, showByYear, showParts, showTheWork, stubPrint,
} from "./lib/app";

// The automated accessibility scan (docs/ui-slices-4-8-plan.md, slice 7): every state below, in each of the config's
// four projects (desktop and phone widths, light and dark). Any WCAG A/AA violation fails, unless
// test/a11y-exceptions.json accepts it with a reason. The report is written to .a11y/report.md.

test.describe("compare", () => {
  test("quick mode", async ({ page }) => {
    await openCompare(page);
    await scan(page, "quick mode");
    // Filing jointly, About you asks for the spouse's wages.
    await page.locator("#about-filing").selectOption("joint");
    await page.locator("#about-spouse").fill("70000");
    await settled(page);
    await scan(page, "About you, filing jointly");
  });

  test("the schedules, L-1 to L-4", async ({ page }) => {
    await openCompare(page);
    await loadSchedules(page);
    await scan(page, "L-1 to L-4");
    // L-4 on your stay's last day: the panel reconciles leaving then with the stay.
    await page.getByRole("button", { name: /^Your stay's last day/ }).click();
    await expect(page.locator(".leave-recon").first()).toBeVisible();
    await expect(page.locator(".leaving")).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
    await scan(page, "L-4 on your stay's last day");
  });

  // An offer's A-7 open is the longest part there is (some 500 figures in its tables): each state its own test, with room for a
  // slow runner.
  test("A-7, A's tables", async ({ page }) => {
    test.setTimeout(180_000);
    await openCompare(page);
    await openWork(page, "A");
    await scan(page, "A-7: A's tables");
  });

  test("C-7, C's tables, and a payment's tax worked out", async ({ page }) => {
    test.setTimeout(180_000);
    await openCompare(page);
    // C has RSUs and refreshers: the most lines and payments.
    await openWork(page, "C");
    await scan(page, "C-7: C's tables");
    // Show the work from a payment's tax: its rate, from the year's tax table.
    await page.locator('section[aria-labelledby="C-7-title"] .l6-payments [data-metric$=".tax"]').first().click();
    await expect(page.locator(".work .work-lines")).toBeVisible();
    await scan(page, "C-7: a payment's tax, its work");
  });

  test("each offer's breakdown, A-2 to A-6, every part's detail open", async ({ page }) => {
    test.setTimeout(180_000);
    await openCompare(page);
    for (const letter of ["A", "B", "C"]) {
      await showParts(page, letter);
      await scan(page, `the breakdowns: ${letter}-2 to ${letter}-6, open`);
    }
    // Show the work for a share of the $100, and for A-4's next cliff.
    await page.locator('[data-metric="a2.C.1.taxShare"]').first().click();
    await expect(page.locator(".work .work-lines")).toBeVisible();
    await scan(page, "C-2: a share of the $100, its work");
  });

  test("L-1's table view", async ({ page }) => {
    await openCompare(page);
    await showByYear(page);
    await page.locator(".by-year").getByRole("button", { name: "Table view" }).click();
    await expect(page.locator("#l1-table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download CSV: L-1, by year" })).toBeVisible();
    await scan(page, "L-1's table view");
  });

  test("L-2's table view, with its CSV", async ({ page }) => {
    await openCompare(page);
    await loadSchedules(page);
    await page.locator(".risk").getByRole("button", { name: "Table view" }).click();
    await expect(page.locator("#l2-table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download CSV: L-2, if things go badly" })).toBeVisible();
    await scan(page, "L-2's table view");
  });

  test("the Print button's choice", async ({ page }) => {
    await openCompare(page);
    await page.getByRole("button", { name: "Print…" }).click();
    await expect(page.locator("#print-choice")).toBeVisible();
    await scan(page, "Print: a summary or the full workpaper");
  });

  test("Copy as document: its choice, copied, and waiting on a problem", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openCompare(page);
    const button = page.getByRole("button", { name: "Copy as document" });
    // With two or more offers: which document (stop 5C).
    await button.click();
    await expect(page.locator("#copy-choice")).toBeVisible();
    await scan(page, "Copy as document: the choice");
    await page.locator("#copy-choice").getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.locator(".print-bar")).toContainText("Copied", { timeout: 30_000 });
    await scan(page, "Copy as document: copied");
    // A problem in the inputs: the button waits, and says why.
    await page.locator("#in-A-startDate").fill("2025-06-01");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await scan(page, "Copy as document: waiting on a problem");
  });

  test("tickmarks hidden", async ({ page }) => {
    await openCompare(page);
    // The setting is at the foot of the page: going there brings L-2 to L-4 on screen. Load and work them out first, so the scan
    // never catches L-3 or L-4 dimmed while they're worked out (on a phone or tablet, the scan's unstuck bar moves them).
    await loadSchedules(page);
    await page.locator("label", { hasText: "Hide tickmarks" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-ticks", "hidden");
    await page.locator(".by-year").getByRole("button", { name: "Table view" }).click();
    await expect(page.locator("#l1-table")).toBeVisible();
    await scan(page, "tickmarks hidden");
    // Show the work with the marks hidden: the derivation's own marks go too.
    await page.locator('[data-metric="hero"]').click();
    await expect(page.locator(".work .work-lines")).toBeVisible();
    await scan(page, "tickmarks hidden: Show the work");
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

// The offer breakdown (docs/v2-plan.md, item 5, stop 5A): one offer, its bottom line pinned; a blank one, saying what's missing;
// each offer's breakdown behind the tab list; the comparison appearing when a second offer is complete. "compare" in the name: the
// tablet projects scan it too.
test.describe("compare: one offer, and the breakdowns", () => {
  test("one offer: its bottom line pinned, in quick and detailed mode", async ({ page }) => {
    // A first visit: sample A on its own (focus moving to A-1 when offers are removed down to one is keyboard.e2e.ts').
    await openAlone(page);
    await scan(page, "one offer: A-1 pinned");
    await page.getByRole("button", { name: "Detailed", exact: true }).click();
    const head = page.locator("#section-head-pay");
    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".loading-row")).toHaveCount(0);
    await ownSettled(page);
    await scan(page, "one offer: detailed, Pay open");
    // Show the work for its bottom line.
    await page.locator('[data-metric="own.A.total"]').first().click();
    await expect(page.locator(".work .work-lines")).toBeVisible();
    await scan(page, "one offer: A-1's month, its work");
  });

  test("one offer: its breakdown copied", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openAlone(page);
    await page.getByRole("button", { name: "Copy as document" }).click();
    await expect(page.locator(".print-bar")).toContainText("Copied", { timeout: 30_000 });
    await scan(page, "one offer: Copy as document, copied");
  });

  test("one offer: A-2 to A-7 under the columns, every part's detail open", async ({ page }) => {
    test.setTimeout(180_000);
    await openAlone(page);
    await showParts(page, "A");
    await scan(page, "one offer: A-2 to A-6, open");
    await openWork(page, "A");
    await scan(page, "one offer: A-7's tables");
  });

  test("one blank offer: what's missing, then the comparison appearing", async ({ page }) => {
    await openCompare(page);
    await page.getByRole("button", { name: "Start with my offer" }).click();
    await expect(page.locator("#own .own-missing")).toHaveText("Add a salary, a city and a start date to see A on its own.");
    await quiet(page);
    await scan(page, "one blank offer: what's missing");
    await fillOffer(page, "A", "95000", "Boston-Cambridge-Newton, MA-NH");
    await ownSettled(page);
    await scan(page, "your offer on its own");
    await addOffer(page);
    await expect(page.locator("#in-B-salary-annual")).toBeVisible();
    await quiet(page);
    await scan(page, "a second offer, blank");
    await fillOffer(page, "B", "88000", "Charlotte-Concord-Gastonia, NC-SC");
    await settled(page);
    await expect(page.locator("#breakdown")).toBeAttached();
    await scan(page, "the comparison, appeared");
  });

  test("the breakdowns, one offer at a time, and the On its own row", async ({ page }) => {
    await openCompare(page);
    await expect(page.locator('[data-metric="alone.A"]').first()).toBeAttached();
    const section = page.locator("#breakdown");
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator(".own-body")).toBeVisible();
    await quiet(page);
    await scan(page, "the breakdowns: A");
    for (const letter of ["B", "C"]) {
      await page.locator(`#own-tab-${letter}`).click();
      await expect(page.locator(`#own-tab-${letter}`)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#own-title .ref")).toHaveText(`${letter}-1`);
      await quiet(page);
      await scan(page, `the breakdowns: ${letter}`);
    }
  });
});

test.describe("phones and tablets", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) >= 1180, "phones and tablets only"));

  test("the verdict bar", async ({ page }) => {
    await openCompare(page);
    // Half way down, where it sticks (at the top on a tablet, the bottom on a phone); the scan sees it in its place.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await expect(page.locator(".verdict-bar")).toBeVisible();
    // Half way down, L-3 and L-4 come on screen and start working: wait for them.
    await settled(page);
    await scan(page, "the verdict bar");
  });

  test("the phone's offer tabs", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 760, "phones only");
    await openCompare(page);
    await selectOffer(page, "C");
    await expect(page.locator("#in-C-salary-annual")).toBeVisible();
    await scan(page, "phone: offer C's tab");
    // Two offers and +, then a third added: blank, so its tab says it needs a fix.
    await page.getByRole("button", { name: "Remove offer C" }).click();
    await scan(page, "phone: two offers, and +");
    await page.getByRole("button", { name: "Add an offer" }).click();
    await expect(page.locator("#in-C-salary-annual")).toBeVisible();
    await scan(page, "phone: an offer added");
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

// Print (docs/ui-design.md §9.5): the page as the Print button lays it out, in print media. On paper the width is the page's,
// not the screen's, so the desktop projects cover it (light and dark: a dark screen prints light).
test.describe("print", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) < 1180, "printed from a desktop"));

  test("print: the summary, then the full workpaper", async ({ page }) => {
    test.setTimeout(240_000);
    await stubPrint(page);
    await openCompare(page);
    await printWithButton(page);
    await expect(page.locator(".l6-elsewhere")).toHaveCount(3);
    await page.emulateMedia({ media: "print" });
    await scan(page, "print: the summary");
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await printWithButton(page, "full", 2);
    await expect(page.locator(".l6-payments")).toHaveCount(3);
    await page.emulateMedia({ media: "print" });
    await scan(page, "print: the full workpaper");
  });
});

test.describe("recovery", () => {
  test("the recovery screen", async ({ page }) => {
    await openWithSaved(page, SAVED.broken);
    await expect(page.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await scan(page, "recovery: a saved session it can't show");
  });

  test("a newer version's save", async ({ page }) => {
    await openWithSaved(page, SAVED.newer);
    await expect(page.locator(".newer-save")).toBeVisible();
    // Meanwhile, a first visit: sample A on its own.
    await ownSettled(page);
    await scan(page, "recovery: a newer version's save");
  });
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
  await page.getByRole("link", { name: "Offers" }).click();
  await settled(page);
});
