import { expect, type Page } from "@playwright/test";

// Driving the app in the tests: the states the scan visits, and when the page has settled into one. Every test starts
// in a fresh browser context, so the sample offers load, as on a first visit.

/** The ledger's sections in detailed mode (app/src/help.ts, LEDGER_SECTIONS). */
export const SECTIONS = ["pay", "bonus", "cash", "equity", "retirement", "health", "perks", "hours", "where"] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * Every row editor (app/src/Detailed.tsx), with an offer whose samples fill it. The vesting steps open when an
 * offer's 401(k) vesting turns to graded steps.
 */
export const EDITORS: Array<{ section: Section; row: string; letter: "A" | "B" | "C"; title: string }> = [
  { section: "pay", row: "salary.promotions", letter: "A", title: "Promotions" },
  { section: "bonus", row: "bonus.amounts", letter: "A", title: "Bonus by year" },
  { section: "cash", row: "cashAwards", letter: "A", title: "Sign-on and other cash" },
  { section: "equity", row: "equity.grants", letter: "C", title: "RSU grants" },
  { section: "equity", row: "equity.refreshers", letter: "C", title: "Refreshers" },
  { section: "retirement", row: "retirement.match", letter: "B", title: "401(k) match" },
  { section: "retirement", row: "retirement.vesting.steps", letter: "A", title: "Vesting steps" },
];

const dashed = (path: string) => path.replace(/\./g, "-");

/** The comparison page has settled for the current inputs: the verdict shows, and the page is quiet. */
export async function settled(page: Page) {
  await expect(page.locator(".lead .verdict")).toBeVisible({ timeout: 30_000 });
  await quiet(page);
}

/**
 * The page is quiet, so a scan never catches it mid-change (a schedule dims for a moment while it's worked out). Any page;
 * the scan waits for it before each run, since anything that scrolls (a click scrolls its target into view) can bring a
 * schedule on screen and set it working:
 * - the lead and the fast-lane schedules aren't updating;
 * - no schedule near the screen is still waiting for its code (they load within a screen of it);
 * - L-3 and L-4, worked out only while on screen, have caught up: one that's dimmed is brought on screen until it's ready,
 *   then the page goes back to where it was;
 * - and it all holds for a moment.
 */
export async function quiet(page: Page) {
  const busy = page.locator(".lead.is-updating, .lead[aria-busy='true'], .by-year[aria-busy='true'], .risk[aria-busy='true'], .warnings[aria-busy='true'], "
    + ".the-work[aria-busy='true'], .own[aria-busy='true'], .breakdown[aria-busy='true']");
  const loading = () => page.evaluate(() => [...document.querySelectorAll(".later")]
    .some((el) => { const r = el.getBoundingClientRect(); return r.top < 2 * window.innerHeight && r.bottom > -window.innerHeight; }));
  for (let still = 0, tries = 0; still < 2; tries++) {
    if (tries > 60) throw new Error("The page didn't settle.");
    await expect(busy).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(loading, { timeout: 30_000 }).toBe(false);
    await nearbyWorkedOut(page);
    const y = await page.evaluate(() => window.scrollY);
    for (const schedule of [".ties", ".leaving"]) {
      // Loaded but never worked out, off screen: anything that scrolls mid-scan (axe's own checks can) would set it working, and
      // it dims once its first half is in. Work it out first (seen in CI on a tablet, 2026-10-12).
      const idle = page.locator(`${schedule}[data-ready='0']:not(.is-updating)`);
      if (await idle.count()) {
        await idle.scrollIntoViewIfNeeded();
        await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
        await nearbyWorkedOut(page);
        await page.evaluate((top) => window.scrollTo(0, top), y);
      }
      const dimmed = page.locator(`${schedule}.is-updating`);
      if (!(await dimmed.count())) continue;
      await dimmed.scrollIntoViewIfNeeded();
      await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
      // Scrolled here, the other may have come near the screen and started too: it would dim later, off screen, mid-scan.
      await nearbyWorkedOut(page);
      await page.evaluate((top) => window.scrollTo(0, top), y);
    }
    still = (await page.locator(".is-updating").count()) === 0 && !(await loading()) ? still + 1 : 0;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * L-3 and L-4 work out their numbers once they come near the screen (useOnScreen's margin: half a screen), and dim only once
 * they have figures from earlier inputs: one near the screen that hasn't any yet is working on them. Waits for those.
 */
async function nearbyWorkedOut(page: Page) {
  const working = await page.evaluate(() => [".ties", ".leaving"].filter((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || el.dataset.ready !== "0") return false;
    const r = el.getBoundingClientRect();
    return r.bottom > -0.5 * window.innerHeight && r.top < 1.5 * window.innerHeight;
  }));
  for (const schedule of working) await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
}

/** The comparison page on a first visit, worked out. */
export async function openCompare(page: Page) {
  await page.goto("/#/");
  await settled(page);
}

/** With one offer: its bottom line (A-1) shows, worked out, and the page is quiet. */
export async function ownSettled(page: Page) {
  await expect(page.locator("#own .own-body")).toBeVisible({ timeout: 30_000 });
  await quiet(page);
}

/** Removes an offer with its ×; on a phone, its tab first. */
export async function removeOffer(page: Page, letter: string) {
  await selectOffer(page, letter);
  await page.getByRole("button", { name: `Remove offer ${letter}` }).click();
}

/** One offer on its own: the first visit's sample A, with B and C removed, its bottom line pinned and worked out. */
export async function openAlone(page: Page) {
  await openCompare(page);
  await removeOffer(page, "C");
  await removeOffer(page, "B");
  await ownSettled(page);
}

/** "+ Add an offer to compare": the button under the ledger, or on a phone the tabs' +. */
export async function addOffer(page: Page) {
  const tabAdd = page.locator(".tab-add");
  if (await tabAdd.isVisible()) await tabAdd.click();
  else await page.getByRole("button", { name: "+ Add an offer to compare (up to 3)" }).click();
}

/** A blank offer's quick fields: a salary, a city (from the list) and a start date a year out. */
export async function fillOffer(page: Page, letter: string, salary: string, city: string) {
  await selectOffer(page, letter);
  await page.locator(`#in-${letter}-salary-annual`).fill(salary);
  await page.getByRole("combobox", { name: `Offer ${letter} city` }).fill(city);
  const next = new Date().getFullYear() + 1;
  await page.locator(`#in-${letter}-startDate`).fill(`${next}-07-01`);
}

/**
 * Saved sessions for the recovery tests: one this version reads but can't show (an offer whose draft is empty: it threw on
 * every page before there was a recovery screen), and one a newer version saved (schema 4).
 */
const household = { filingStatus: "single", stayYears: 4, otherWagesThisYear: 0, pricesIn: "00000" };
export const SAVED = {
  broken: JSON.stringify({ schemaVersion: 3, household, offers: [{ id: "mine", letter: "A", sample: null, draft: {} }], ui: { basis: "cash", theme: "system" } }),
  newer: JSON.stringify({ schemaVersion: 4, household, offers: [{ id: "mine", letter: "A", sample: null, draft: { label: "From the future" } }], ui: {} }),
};

/** Opens the app with a saved session in this browser, as a returning visitor's (once: a reload keeps what the app does with it). */
export async function openWithSaved(page: Page, saved: string) {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("offer-calc:v1", v);
  }, saved);
  await page.goto("/#/");
}

/** Scrolls down until a schedule that loads as you near it (L-1 to L-6) is on the page, and shows it. */
async function scrollTo(page: Page, id: string) {
  const title = page.locator(`#${id}-title`);
  for (let i = 0; i < 60 && !(await title.count()); i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
    await page.waitForTimeout(100);
  }
  await expect(title).toBeVisible();
}

/** L-1 and the bridge: they load as you scroll toward them, so on a phone they're further down than the first screen. */
export async function showByYear(page: Page) {
  await scrollTo(page, "l1");
  await settled(page);
}

/**
 * L-1 to L-5 load as you scroll toward them, and L-3 and L-4 work out their numbers while they're on screen: scroll down to
 * each in turn, and wait for those two to be ready.
 */
export async function loadSchedules(page: Page) {
  for (const id of ["l1", "l2", "l3", "l4", "l5"]) await scrollTo(page, id);
  for (const schedule of [".ties", ".leaving"]) {
    await page.locator(schedule).scrollIntoViewIfNeeded();
    await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  }
  await settled(page);
}

/**
 * L-6, The work: scrolled to (it loads as you near it), its tables opened, on an offer's tables, with its payments and tax
 * years worked out.
 */
export async function openWork(page: Page, letter = "A") {
  // The schedules above first, worked out: L-4's panel filling in moves L-6 down, and a click mid-move lands elsewhere.
  await loadSchedules(page);
  const title = page.locator("#l6-title");
  for (let i = 0; i < 80 && !(await title.count()); i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
    await page.waitForTimeout(100);
  }
  await title.scrollIntoViewIfNeeded();
  const toggle = page.locator(".l6-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const pick = page.locator("#l6-body .segmented button", { hasText: letter });
  await expect(async () => {
    if ((await pick.getAttribute("aria-pressed")) !== "true") await pick.click();
    await expect(pick).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator(".the-work")).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  await expect(page.locator(".l6-payments")).toBeVisible();
  await settled(page);
}

/** Detailed mode with one section open. */
export async function openSection(page: Page, section: Section) {
  const head = page.locator(`#section-head-${section}`);
  if (!(await head.count())) await page.getByRole("button", { name: "Detailed", exact: true }).click();
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".loading-row")).toHaveCount(0);
  await settled(page);
}

/** On a phone, the offer's tab (the ledger shows one offer at a time); elsewhere every offer shows already. */
export async function selectOffer(page: Page, letter: string) {
  const tab = page.locator(`#offer-tab-${letter}`);
  if (await tab.isVisible()) await tab.click();
}

/** A row editor, open beneath its row. */
export async function openEditor(page: Page, e: (typeof EDITORS)[number]) {
  await openSection(page, e.section);
  await selectOffer(page, e.letter);
  if (e.row === "retirement.vesting.steps") await page.locator(`#in-${e.letter}-retirement-vesting`).selectOption("graded");
  else await page.locator(`#in-${e.letter}-${dashed(e.row)}`).click();
  await expect(page.locator(`#editor-${dashed(e.row)}`)).toBeVisible();
  await settled(page);
}

/** Show the work for a figure, with its derivation loaded. */
export async function showTheWork(page: Page, metric: string) {
  await page.locator(`[data-metric="${metric}"], [data-tick="${metric}"]`).first().click();
  await expect(page.locator(".work .work-lines")).toBeVisible();
}

/**
 * The browser's print, stubbed before the page loads: it counts the calls (`printed`) instead of opening a dialog, and doesn't
 * fire afterprint, so the page stays laid out for print for the test to look at.
 */
export const stubPrint = (page: Page) => page.addInitScript(() => {
  window.print = () => {
    const w = window as unknown as { printed?: number };
    w.printed = (w.printed ?? 0) + 1;
  };
});
export const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0);

/**
 * Print… pressed, a summary (the default) or the full workpaper chosen, Print pressed, and the page printed: every schedule loaded
 * and worked out first. `times`: the prints so far, this one included.
 */
export async function printWithButton(page: Page, scope: "summary" | "full" = "summary", times = 1) {
  await page.getByRole("button", { name: "Print…" }).click();
  const choice = page.locator("#print-choice");
  await expect(choice.getByRole("radio", { name: /^Summary/ })).toBeVisible();
  if (scope === "full") await choice.getByRole("radio", { name: /^Full workpaper/ }).check();
  await choice.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => printed(page), { timeout: 60_000 }).toBe(times);
}

/** Two frames: the page's own reaction to focus (a scroll that keeps it clear of a sticky bar) has run. */
export const twoFrames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * What covers the focused element, if anything does (WCAG 2.4.11): a sticky verdict bar that's showing, overlapping the
 * element's box. Null when nothing does.
 */
export function focusCovered(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    for (const bar of document.querySelectorAll<HTMLElement>(".verdict-bar")) {
      if (bar.contains(el) || getComputedStyle(bar).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const overlap = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (overlap > 0 && r.width > 0) return `${el.id || el.getAttribute("aria-label") || el.outerHTML.slice(0, 80)}: ${Math.round(overlap)}px under the bar`;
    }
    return null;
  });
}

/** The lead's results, as text: the hero, the rank list, the if-you-stay row and the pipeline's steps. */
export function verdictText(page: Page) {
  return page.evaluate(() => {
    const text = (sel: string) => [...document.querySelectorAll(sel)].map((e) => e.textContent?.replace(/\s+/g, " ").trim() ?? "");
    return { hero: text(".lead .hero"), ranks: text(".lead .ranks li"), stays: text(".lead .stays-cell"), steps: text(".lead .step-lead") };
  });
}
