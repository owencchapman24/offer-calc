import { expect, type Page, test } from "@playwright/test";
import { focusCovered, openAlone, openCompare, settled, twoFrames } from "./lib/app";

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
    // The ledger's tabs (the breakdowns' switch further down is "Offers, one at a time").
    const tabs = page.getByRole("tablist", { name: "Offers", exact: true }).getByRole("tab");
    await expect(tabs).toHaveCount(3);
    const tab = (l: string) => page.locator(`#offer-tab-${l}`);
    await expect(tab("A")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#offer-panel")).toHaveAttribute("aria-labelledby", "offer-tab-A");
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
    await expect(go).toHaveAccessibleName(/^[ABC] leads by U\.S\.-avg \+\$[\d,]+ a month · stay 4 yrs ?\. Go to the lead schedule$/);

    // Typing in a field raises the keyboard: the bar steps aside, and comes back after.
    await page.locator("#in-A-salary-annual").focus();
    await expect(bar).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(bar).toBeVisible();

    await go.click();
    await expect(page.locator("#lead-title")).toBeFocused();
    await expect(page.locator(".lead .verdict")).toBeInViewport();
  });

  test("the bar comes back after the screen changes size (a rotation), and pinch-zoom isn't taken for the keyboard", async ({ page }) => {
    await openCompare(page);
    const bar = page.locator(".verdict-bar.is-bottom");
    await page.setViewportSize({ width: 390, height: 300 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect(bar).toBeVisible();
    // Pinch-zoom to 2x: the visual viewport is half the height, at twice the scale. The bar stays.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(2);
    await page.waitForTimeout(300);
    await expect(bar).not.toHaveClass(/is-hidden/);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  });

  test("tabbing down the page and back up, the bar never covers what has focus (WCAG 2.4.11)", async ({ page }) => {
    await openCompare(page);
    // Down past About you into the ledger (fields you type in hide the bar; the rest don't), then back up.
    expect(await tabThrough(page, 45)).toBeGreaterThan(10);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    expect(await tabThrough(page, 30, "Shift+Tab")).toBeGreaterThan(5);
  });

  test("See how we get there brings the leader's bridge, in its A-2, though the breakdown loads only as you scroll toward it", async ({ page }) => {
    await openCompare(page);
    // On a phone, the breakdowns are screens below the first-use note: A-2's code isn't loaded yet.
    await expect(page.locator("#C-2-title")).toHaveCount(0);
    await page.getByRole("button", { name: "See how we get there" }).click();
    // C leads, so it's C's breakdown, open on its bridge for year 1; the ledger's tab is C's too.
    await expect(page.locator("#bridge-C-title")).toBeFocused();
    await expect(page.locator("#bridge-C-title")).toBeInViewport();
    await expect(page.locator("#own-tab-C")).toHaveAttribute("aria-selected", "true");
    await settled(page);
  });
});

test.describe("tablet", () => {
  test.beforeEach(({ page }) => test.skip(isPhone(page), "tablets only"));

  test("the verdict bar sits under About you, sticks to the top, and goes to the lead", async ({ page }) => {
    await openCompare(page);
    await expect(page.getByRole("tablist", { name: "Offers", exact: true })).toHaveCount(0); // every offer shows
    const bar = page.locator(".verdict-bar.is-top");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/^[ABC] leaves you about \$[\d,]+ a month more than [ABC] over your stay, after rent, in U\.S\.-average dollars · stay 4 years/);
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

// One offer (docs/v2-plan.md, item 5): the bar shows its bottom line with its dollars, and goes to it.
test("with one offer, the bar shows its bottom line with its dollars, and goes to A-1", async ({ page }) => {
  await openAlone(page);
  const place = isPhone(page) ? "bottom" : "top";
  const bar = page.locator(`.verdict-bar.is-${place}`);
  await expect(bar).toHaveCount(1);
  await expect(page.locator(".verdict-bar")).toHaveCount(1); // the comparison's bar has gone
  await expect(bar).toContainText(isPhone(page) ? /^A New York \$[\d,]+ a month · stay 4 yrs/ : /^A New York \$[\d,]+ a month over your stay, after rent · stay 4 years/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await bar.getByRole("button").click();
  await expect(page.locator("#own-title")).toBeFocused();
  await twoFrames(page);
  expect(await focusCovered(page)).toBeNull();
});

// The first visit (docs/v2-plan.md, item 5, condition 2): sample A on its own, and both ways on side by side, in view without scrolling.
test("the first visit: Start with my offer and See a sample comparison, both in view without scrolling", async ({ page }) => {
  await openAlone(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const name of ["Start with my offer", "See a sample comparison"]) await expect(page.getByRole("button", { name })).toBeInViewport({ ratio: 1 });
  const [a, b] = await Promise.all(["Start with my offer", "See a sample comparison"].map((name) => page.getByRole("button", { name }).boundingBox()));
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(a!.height); // side by side
});
