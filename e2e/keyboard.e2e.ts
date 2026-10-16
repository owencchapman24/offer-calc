import { expect, test } from "@playwright/test";
import { addOffer, fillOffer, loadSchedules, openCompare, openSection, ownSettled, settled, showByYear } from "./lib/app";

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
  await expect(live).toHaveText(/^B leaves you about U\.S\.-avg \$[\d,]+ a month more than [AC] over your stay, after rent, at U\.S\. prices\.$/,
    { timeout: 10_000 });
  // A change that leaves the verdict as it is says nothing new.
  const said = await live.textContent();
  await page.getByLabel("Offer A name").fill("Bank");
  await page.waitForTimeout(1_500);
  await expect(live).toHaveText(said!);
});

test("L-1's chart reads a year at a time, as a slider; its tooltip stays silent", async ({ page }) => {
  await openCompare(page);
  await showByYear(page);
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

test("hiding tickmarks: the marks go; each figure stays a button, with its name, a dotted underline and its arrow-key place; saved", async ({ page }) => {
  await openCompare(page);
  const hero = page.locator('[data-metric="hero"]');
  const name = (await hero.getAttribute("aria-label"))!;
  expect(name).toMatch(/^How U\.S\.-avg \$[\d,]+ a month over your stay was worked out \(recomputed\)$/);
  // The setting is a radio group in the footer, beside the theme's.
  const hide = page.getByRole("radio", { name: "Hide tickmarks" });
  await page.getByRole("radio", { name: "Show tickmarks" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(hide).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-ticks", "hidden");
  await expect(hero.locator(".tick")).toBeHidden();
  expect(await hero.locator(".fig-value").evaluate((el) => `${getComputedStyle(el).textDecorationLine} ${getComputedStyle(el).textDecorationStyle}`))
    .toBe("underline dotted");
  await expect(page.getByRole("button", { name })).toBeVisible();
  // The inputs' D and E stay: a default always says so.
  await expect(page.locator(".about .tick-lone .tick").first()).toBeVisible();
  // Still the schedule's figures in the arrow keys' order, and still opening their work.
  await hero.focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement?.classList.contains("fig"))).toBe(true);
  await page.keyboard.press("ArrowLeft");
  await expect(hero).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".work .work-lines")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lead .legend")).toContainText("Tickmarks are hidden: each figure keeps a dotted underline and still opens its work.");
  // Saved in this browser (half a second after the last change): still hidden after a reload; the legend's button shows them again.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("offer-calc:v1") ?? "{}").ui?.ticks)).toBe("hidden");
  await page.reload();
  await settled(page);
  await expect(page.locator("html")).toHaveAttribute("data-ticks", "hidden");
  await page.locator(".lead .legend").getByRole("button", { name: "Show tickmarks" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ticks", /./);
  await expect(hero.locator(".tick")).toBeVisible();
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

test("a row editor's button says whose editor it opens, and focus comes back to it", async ({ page }) => {
  await openCompare(page);
  await openSection(page, "pay");
  // On screen it's "Edit" in A's column; a screen reader hears whose.
  const edit = page.getByRole("button", { name: "Edit A's promotions" });
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Add B's promotions" })).toBeVisible();
  await edit.click();
  await expect(page.getByRole("button", { name: "Close A's promotions" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("group", { name: "Offer A: Promotions" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Edit A's promotions" })).toBeFocused();
});

test("L-4's slider says the date and what each offer keeps, as its panel shows", async ({ page }) => {
  await openCompare(page);
  await loadSchedules(page);
  const slider = page.getByRole("slider", { name: "Last day" });
  /** The panel's date and each offer's "keep" figure, as the slider should say them. */
  const panel = async () => {
    const date = (await page.locator(".leave-panel .extra-title").textContent())!.replace(/^If your last day is /, "").replace(/,? the last day of your stay$/, "");
    const kept = await page.locator('.leave-panel [data-metric^="kept."] .fig-value').allTextContents();
    return `${date}. A keeps ${kept[0]}, B ${kept[1]}, C ${kept[2]}.`;
  };
  await slider.focus();
  await expect(slider).toHaveAttribute("aria-valuetext", await panel());
  // A month later: once the panel has the new date, the slider says its figures (one announcement, complete).
  const before = await slider.getAttribute("aria-valuetext");
  await page.keyboard.press("ArrowRight");
  await expect(slider).not.toHaveAttribute("aria-valuetext", before!);
  await expect(page.locator(".leaving")).toHaveAttribute("data-ready", "1");
  await expect(slider).toHaveAttribute("aria-valuetext", /^[A-Z][a-z]{2} \d{1,2}, \d{4}\. A keeps \$[\d,]+, B \$[\d,]+, C \$[\d,]+\.$/);
  await expect(slider).toHaveAttribute("aria-valuetext", await panel());
});

// The offer breakdown (docs/v2-plan.md, item 5, "Accessibility"): the offer switch is a tab list; focus goes where it should as
// offers come and go; the live region says one offer's bottom line, then the verdict once a comparison appears.

test("the breakdowns' offer switch is a tab list: arrow keys, Home and End choose; one tab stop; the heading names the offer", async ({ page }) => {
  await openCompare(page);
  const tab = (l: string) => page.locator(`#own-tab-${l}`);
  await tab("A").focus();
  await expect(page.locator("#breakdown-title")).toHaveText("A · NYC bank, on its own");
  await page.keyboard.press("ArrowRight");
  await expect(tab("B")).toBeFocused();
  await expect(tab("B")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#breakdown-title")).toHaveText("B · Charlotte corp, on its own");
  await expect(page.locator("#own-panel")).toHaveAttribute("aria-labelledby", "own-tab-B");
  await page.keyboard.press("End");
  await expect(tab("C")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab("A")).toBeFocused(); // it wraps
  await page.keyboard.press("Home");
  await expect(tab("A")).toHaveAttribute("aria-selected", "true");
  await expect(tab("B")).toHaveAttribute("tabindex", "-1");
  // "Its breakdown" in the ledger's On its own row opens that offer's tab.
  await page.getByRole("button", { name: "C's breakdown" }).click();
  await expect(tab("C")).toBeFocused();
  await expect(tab("C")).toHaveAttribute("aria-selected", "true");
  // And "Skip to the comparison" goes on to L-1's heading.
  await page.getByRole("button", { name: "Skip to the comparison" }).click();
  await expect(page.locator("#l1-title")).toBeFocused();
  await settled(page);
});

test("down to one offer, focus goes to its bottom line and it's said once; a second offer leaves focus be, and the verdict is said once", async ({ page }) => {
  await openCompare(page);
  const live = page.locator("#verdict-live");
  await page.getByRole("button", { name: "Remove offer C" }).click();
  await expect(page.locator("#offers-title")).toBeFocused();
  await page.getByRole("button", { name: "Remove offer B" }).click();
  await expect(page.locator("#own-title")).toBeFocused();
  await ownSettled(page);
  await expect(live).toHaveText(/^A leaves you about New York \$[\d,]+ a month over your stay, after rent: New York \$[\d,]+ to spend and New York \$[\d,]+ saved, in today's dollars\.$/,
    { timeout: 10_000 });
  const add = page.getByRole("button", { name: "+ Add an offer to compare (up to 3)" });
  await addOffer(page);
  await expect(add).toBeFocused(); // adding an offer doesn't move focus
  await expect(page.locator("#own-title")).toBeVisible(); // A's breakdown stays pinned while B is blank
  await fillOffer(page, "B", "300000", "Charlotte-Concord-Gastonia, NC-SC");
  await settled(page);
  await expect(live).toHaveText(/^[AB] leaves you about U\.S\.-avg \$[\d,]+ a month more than [AB] over your stay, after rent, at U\.S\. prices\.$/,
    { timeout: 10_000 });
});
