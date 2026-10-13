import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openCompare, openWork, printed, printWithButton, settled, stubPrint, verdictText } from "./lib/app";

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

/** A downloaded CSV: its name, and its lines without the byte-order mark. */
async function csvOf(page: Page, button: string) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: button }).click();
  const d = await download;
  const text = readFileSync(await d.path(), "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  return { name: d.suggestedFilename(), lines: text.slice(1).split("\r\n") };
}
const shownText = async (page: Page, sel: string) => (await page.locator(`${sel} .fig-value`).first().textContent())!;

test("CSV: a table downloads with the figures shown, as plain numbers, flagged as samples", async ({ page }) => {
  await openCompare(page);
  await page.locator(".by-year").getByRole("button", { name: "Table view" }).click();
  const l1 = await csvOf(page, "Download CSV: L-1, by year");
  expect(l1.name).toMatch(/^offer-calc-\d{4}-\d{2}-\d{2}-L-1-by-year-sample\.csv$/);
  expect(l1.lines[0]).toBe('"Includes sample offers: illustrative inputs, not market data."');
  // A's year 1, as the table shows it, without its thousands separator, and its tickmark beside it.
  const a1 = await shownText(page, '#l1-table [data-metric="ey.A.1"]');
  expect(l1.lines.find((x) => x.startsWith("Year 1,"))).toMatch(new RegExp(`^Year 1,${a1.replace(/,/g, "")},✓,`));
  await expect(page.getByRole("status").filter({ hasText: l1.name })).toHaveCount(1);

  await openWork(page, "C");
  const pay = await csvOf(page, "Download CSV: L-6.C, every payment");
  expect(pay.name).toMatch(/-L-6-C-every-payment-sample\.csv$/);
  expect(pay.lines[3]).toBe("Employment year,Kind,Payment,Paid on,How it was worked out,Pay ($),Pay tickmark,Tax ($),Tax tickmark");
  // The first payment, to the cent, as listed.
  const gross = await shownText(page, '.l6-payments [data-metric="l6p.C.0.gross"]');
  expect(pay.lines[4]).toContain(`,${gross.replace(/,/g, "")},✓,`);
});

test("Print: a summary or the full workpaper; the button loads every schedule and works it out, then prints; Ctrl+P lays out what's loaded",
  async ({ page }) => {
  await stubPrint(page);
  await openCompare(page);
  // The browser's own print: what's loaded is laid out for print at once (L-1's table view), before it prints.
  expect(await page.evaluate(() => { window.dispatchEvent(new Event("beforeprint")); return !!document.getElementById("l1-table"); })).toBe(true);
  await expect(page.locator("html")).toHaveClass(/printing/);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("html")).not.toHaveClass(/printing/);
  await expect(page.locator("#l1-table")).toHaveCount(0);
  expect(await printed(page)).toBe(0);

  // Print… offers a summary (chosen) or the full workpaper; Escape goes back to the button.
  await page.getByRole("button", { name: "Print…" }).click();
  await expect(page.getByRole("radio", { name: /^Summary/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Summary/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#print-choice")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print…" })).toBeFocused();

  // The summary: L-2 to L-6 loaded and worked out first (none of them was), every offer's L-6 open but its list of every payment.
  await expect(page.locator("#l6-title")).toHaveCount(0);
  await printWithButton(page);
  for (const id of ["l1", "l2", "l3", "l4", "l5", "l6"]) await expect(page.locator(`#${id}-title`)).toBeAttached();
  for (const s of [".ties", ".leaving", ".the-work"]) await expect(page.locator(s)).toHaveAttribute("data-ready", "1");
  await expect(page.locator(".l6-offer")).toHaveCount(3);
  await expect(page.locator("table.l6-tax")).toHaveCount(3);
  await expect(page.locator(".l6-payments")).toHaveCount(0);
  await expect(page.locator(".l6-elsewhere")).toHaveCount(3);
  await expect(page.locator("#l1-table, #l2-table")).toHaveCount(2);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  // The full workpaper: every payment too.
  await printWithButton(page, "full", 2);
  await expect(page.locator(".l6-payments")).toHaveCount(3);
  await expect(page.locator(".l6-elsewhere")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  // On paper: every schedule's legend, no buttons but the figures, B's lines dashed and C's dotted, the footer's sample flag.
  await expect(page.locator(".schedule .legend")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Print…" })).toBeHidden();
  await expect(page.locator(".segmented").first()).toBeHidden();
  const dash = (letter: string) => page.locator(`.by-year .series.offer-${letter} .series-line`).evaluate((el) => getComputedStyle(el).strokeDasharray);
  expect([await dash("A"), await dash("B"), await dash("C")]).toEqual(["none", "7px, 4px", "2px, 3px"]);
  await expect(page.locator(".colophon")).toContainText("Includes sample offers: illustrative inputs, not market data.");
  await expect(page.locator(".colophon")).toContainText("BEA Regional Price Parities");
  // Done printing: back to the screen.
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".l6-offer")).toHaveCount(0);
});

/** What the clipboard holds: each flavor's text. */
const clipboard = (page: Page) => page.evaluate(async () => {
  const out: Record<string, string> = {};
  for (const item of await navigator.clipboard.read()) for (const type of item.types) out[type] = await (await item.getType(type)).text();
  return out;
});
const SAMPLE_LINE = "Includes sample offers: illustrative inputs, not market data.";

test("Copy as document: one click puts the comparison on the clipboard, as HTML and plain text, its code loaded only then", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const chunks: string[] = [];
  page.on("request", (r) => { if (/\/assets\/copyDoc-/.test(r.url())) chunks.push(r.url()); });
  await openCompare(page);
  expect(chunks).toEqual([]);
  // The hero as the page shows it, without its tickmark: "$500 a month".
  const hero = (await verdictText(page)).hero[0].replace("✓", "").trim();
  await page.getByRole("button", { name: "Copy as document" }).click();
  await expect(page.locator(".print-bar")).toContainText("Copied: paste it into a document or an email.", { timeout: 30_000 });
  expect(chunks).toHaveLength(1);
  const got = await clipboard(page);
  expect(Object.keys(got).sort()).toEqual(["text/html", "text/plain"]);
  for (const flavor of [got["text/html"], got["text/plain"]]) {
    expect(flavor).toContain(`C leaves you about ${hero} more than A, after rent, at U.S. prices.`);
    expect(flavor).toContain(SAMPLE_LINE);
    expect(flavor).toContain("If your last day were");
    expect(flavor).toContain("To tie C's");
  }
  expect(got["text/html"]).toMatch(/<table style="/);
  expect(got["text/plain"]).toMatch(/^THREE JOB OFFERS COMPARED/);
});

test("Copy as document: where the browser won't write from a promise, Copy now copies the ready document", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // A browser without ClipboardItem: the first click gets the document ready, the second copies it through a copy event.
  await page.addInitScript(() => { delete (window as unknown as { ClipboardItem?: unknown }).ClipboardItem; });
  await openCompare(page);
  await page.getByRole("button", { name: "Copy as document" }).click();
  await page.getByRole("button", { name: "Copy now" }).click({ timeout: 30_000 });
  await expect(page.locator(".print-bar")).toContainText("Copied: paste it into a document or an email.");
  const got = await clipboard(page);
  expect(got["text/plain"]).toMatch(/^THREE JOB OFFERS COMPARED/);
  expect(got["text/html"]).toContain("Three job offers compared");
});

test("Copy as document waits, and says why, while the inputs have a problem", async ({ page }) => {
  await openCompare(page);
  const button = page.getByRole("button", { name: "Copy as document" });
  await expect(button).not.toHaveAttribute("aria-disabled");
  // A start date before 2026: a problem the comparison waits on.
  const start = page.locator("#in-A-startDate");
  const was = await start.inputValue();
  await start.fill("2025-06-01");
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(button).toHaveAccessibleDescription("Fix the problems listed under the verdict to copy the comparison.");
  // Still focusable and clickable (aria-disabled), so it can say why; a click does nothing.
  await button.click({ force: true });
  await expect(page.locator(".print-bar")).not.toContainText("Getting the document ready");
  await start.fill(was);
  await expect(button).not.toHaveAttribute("aria-disabled");
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
