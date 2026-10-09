import { expect, test } from "@playwright/test";
import { openCompare, settled } from "./lib/app";

// What the scan can't see (docs/ui-slices-4-8-plan.md, slice 7, "known before the scan"): what a screen reader hears, and
// where focus goes. Each was a problem before slice 7; these keep them fixed.

test("the verdict is announced as one sentence once the inputs rest, not read whole on every recompute", async ({ page }) => {
  await openCompare(page);
  await expect(page.locator(".lead [aria-live]")).toHaveCount(0);
  const live = page.locator("#verdict-live");
  await expect(live).toHaveAttribute("role", "status");
  // The first verdict is on the page as it loads: nothing is announced.
  await expect(live).toHaveText("");
  await page.locator("#in-B-salary-annual").fill("400000");
  await expect(live).toHaveText(/^B leaves you about \$[\d,]+ a month more than [AC], after rent, at U\.S\. prices\.$/, { timeout: 10_000 });
  // A change that leaves the verdict as it is says nothing new.
  const said = await live.textContent();
  await page.getByLabel("Offer A name").fill("Bank");
  await page.waitForTimeout(1_500);
  await expect(live).toHaveText(said!);
});

test("L-1's chart reads a year at a time, as a slider; its tooltip stays silent", async ({ page }) => {
  await openCompare(page);
  const chart = page.getByRole("slider", { name: /each employment year$/ });
  await chart.focus();
  await expect(chart).toHaveAttribute("aria-valuetext", /^Year 1: A [\d,]+, B [\d,]+, C [\d,]+$/);
  await page.keyboard.press("ArrowRight");
  await expect(chart).toHaveAttribute("aria-valuetext", /^Year 2: A /);
  await page.keyboard.press("End");
  await expect(chart).toHaveAttribute("aria-valuenow", "4");
  const tip = page.locator(".chart-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute("aria-hidden", "true");
  await expect(tip).not.toHaveAttribute("role", /./);
});

test("the theme switch is a radio group: arrow keys move and choose", async ({ page }) => {
  await openCompare(page);
  const system = page.getByRole("radio", { name: "System" });
  await expect(system).toBeChecked();
  await system.focus();
  await page.keyboard.press("ArrowRight");
  const light = page.getByRole("radio", { name: "Light" });
  await expect(light).toBeChecked();
  await expect(light).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // One tab stop for the group: Shift+Tab leaves it.
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)).not.toBe("radio");
});

test("picking a city in the ledger keeps focus there, on Change", async ({ page }) => {
  await openCompare(page);
  const change = page.getByRole("button", { name: "Change offer A city" });
  await change.click();
  const search = page.getByRole("combobox", { name: "Offer A city" });
  await expect(search).toBeFocused();
  await search.fill("Boston-Cambridge-Newton, MA-NH");
  await expect(change).toBeFocused();
  await expect(page.locator("#in-A-costOfLiving-area").locator("..")).toContainText("Boston-Cambridge-Newton");
  // Escape leaves the search, back on Change.
  await change.click();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(change).toBeFocused();
  await settled(page);
});

test("Prices in returns focus to Change after a pick too", async ({ page }) => {
  await openCompare(page);
  const change = page.getByRole("button", { name: /^Change the prices figures are in/ });
  await change.click();
  await page.locator("#about-prices").fill("Charlotte-Concord-Gastonia, NC-SC");
  await expect(page.getByRole("button", { name: /^Change the prices figures are in, now Charlotte/ })).toBeFocused();
});
