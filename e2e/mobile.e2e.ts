import { expect, type Page, test } from "@playwright/test";
import { focusCovered, openCompare, settled, twoFrames } from "./lib/app";

// Phones and tablets (docs/ui-design.md §3.2, slice 7 stop B): the phone's offer tabs, and the sticky verdict bar, at the
// bottom on a phone and at the top on a tablet, which never hides the focused element (WCAG 2.4.11). Run in the config's
// "phone" and "tablet" projects; each test says which it's for.

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

/**
 * Presses Tab (or Shift+Tab) `n` times; after each, nothing showing may cover the focused element. Returns how many
 * times the bar was showing, so a test knows it was put to the test.
 */
async function tabThrough(page: Page, n: number, key = "Tab") {
  let shown = 0;
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await twoFrames(page);
    const covered = await focusCovered(page);
    expect(covered, `after ${i + 1} × ${key}`).toBeNull();
    if (await page.locator(".verdict-bar").isVisible()) shown++;
  }
  return shown;
}

/** Accessible names as Chromium computes them: a visually hidden span adds a space before the punctuation after it. */
const name = (s: string) => new RegExp(`^${s.replace(/[.+$()]/g, "\\$&").replace(/([,.])/g, " ?$1")}$`);

test.describe("phone", () => {
  test.beforeEach(({ page }) => test.skip(!isPhone(page), "phones only"));

  test("offer tabs: one offer at a time; arrow keys, Home and End choose; + adds an offer; × removes one", async ({ page }) => {
    await openCompare(page);
    const tabs = page.getByRole("tablist", { name: "Offers" }).getByRole("tab");
    await expect(tabs).toHaveCount(3);
    const tab = (l: string) => page.locator(`#offer-tab-${l}`);
    await expect(tab("A")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "offer-tab-A");
    await expect(page.locator("#in-A-salary-annual")).toBeVisible();
    await expect(page.locator("#in-B-salary-annual")).toBeHidden();

    await tab("A").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab("B")).toBeFocused();
    await expect(tab("B")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#in-B-salary-annual")).toBeVisible();
    await expect(page.locator("#in-A-salary-annual")).toBeHidden();
    await page.keyboard.press("End");
    await expect(tab("C")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tab("A")).toBeFocused(); // it wraps
    await page.keyboard.press("Home");
    await expect(tab("A")).toHaveAttribute("aria-selected", "true");
    // Only the chosen tab is a Tab stop: Tab goes on into the offer.
    await expect(tab("B")).toHaveAttribute("tabindex", "-1");

    // Three offers: no +. Remove C, and focus goes to the tab shown.
    await expect(page.getByRole("button", { name: "Add an offer" })).toHaveCount(0);
    await tab("C").click();
    await page.getByRole("button", { name: "Remove offer C" }).click();
    await expect(tabs).toHaveCount(2);
    await expect(tab("A")).toBeFocused();
    await expect(tab("A")).toHaveAttribute("aria-selected", "true");

    // + adds C, shows it and focuses its tab, which says it needs a fix (a blank offer can't be compared yet).
    await page.getByRole("button", { name: "Add an offer" }).click();
    await expect(tab("C")).toBeFocused();
    await expect(tab("C")).toHaveAttribute("aria-selected", "true");
    await expect(tab("C")).toHaveAccessibleName(name("C Offer C, needs a fix"));
    await expect(page.locator("#in-C-salary-annual")).toBeVisible();
    await expect(page.locator("#in-C-salary-annual")).toHaveValue("");
  });

  test("Edit it shows the offer's tab, then focuses its field", async ({ page }) => {
    await openCompare(page);
    await page.locator("#offer-tab-B").click();
    // The rent note's derivation edits A's rent.
    await page.locator('[data-metric="rentnote.A"]').click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit it" }).click();
    await expect(page.locator("#offer-tab-A")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#in-A-costOfLiving-monthlyRent")).toBeFocused();
    expect(await focusCovered(page)).toBeNull();
  });

  test("the verdict bar sits at the bottom, goes to the lead, and hides while the keyboard is up", async ({ page }) => {
    await openCompare(page);
    const bar = page.locator(".verdict-bar.is-bottom");
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(page.viewportSize()!.height, 0);
    const go = bar.getByRole("button");
    await expect(go).toHaveAccessibleName(/^[ABC] leads by \+\$[\d,]+ a month · stay 4 yrs ?\. Go to the lead schedule$/);

    // Typing in a field raises the keyboard: the bar steps aside, and comes back after.
    await page.locator("#in-A-salary-annual").focus();
    await expect(bar).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(bar).toBeVisible();

    await go.click();
    await expect(page.locator("#lead-title")).toBeFocused();
    await expect(page.locator(".lead .verdict")).toBeInViewport();
  });

  test("tabbing down the page and back up, the bar never covers what has focus (WCAG 2.4.11)", async ({ page }) => {
    await openCompare(page);
    // Down past About you into the ledger (fields you type in hide the bar; the rest don't), then back up.
    expect(await tabThrough(page, 45)).toBeGreaterThan(10);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    expect(await tabThrough(page, 30, "Shift+Tab")).toBeGreaterThan(5);
  });
});

test.describe("tablet", () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), "tablets only"));

  test("the verdict bar sits under About you, sticks to the top, and goes to the lead", async ({ page }) => {
    await openCompare(page);
    await expect(page.getByRole("tablist")).toHaveCount(0); // every offer shows
    const bar = page.locator(".verdict-bar.is-top");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/^[ABC] leaves you about \$[\d,]+ a month more than [ABC], after rent, at U\.S\. prices · stay 4 years/);
    const about = (await page.locator(".about").boundingBox())!;
    expect((await bar.boundingBox())!.y).toBeGreaterThan(about.y + about.height - 1);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBe(0);
    await bar.getByRole("button").click();
    await expect(page.locator("#lead-title")).toBeFocused();
    // The lead's heading lands below the bar.
    const head = (await page.locator("#lead-title").boundingBox())!;
    expect(head.y).toBeGreaterThanOrEqual((await bar.boundingBox())!.height);
    await settled(page);
  });

  test("tabbing down the page and back up, the bar never covers what has focus (WCAG 2.4.11)", async ({ page }) => {
    await openCompare(page);
    // A tablet holds the first screen's worth without scrolling: on down through the ledger into the lead, then back up,
    // where the bar, stuck at the top, is what could cover a field scrolled into view from above. (Past the end, focus
    // leaves the page and comes back at the top.)
    expect(await tabThrough(page, 70)).toBe(70);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    expect(await tabThrough(page, 50, "Shift+Tab")).toBe(50);
  });
});
