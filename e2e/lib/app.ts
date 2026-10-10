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
  const busy = page.locator(".lead.is-updating, .lead[aria-busy='true'], .by-year[aria-busy='true'], .risk[aria-busy='true'], .warnings[aria-busy='true']");
  const loading = () => page.evaluate(() => [...document.querySelectorAll(".later")]
    .some((el) => { const r = el.getBoundingClientRect(); return r.top < 2 * window.innerHeight && r.bottom > -window.innerHeight; }));
  for (let still = 0, tries = 0; still < 2; tries++) {
    if (tries > 60) throw new Error("The page didn't settle.");
    await expect(busy).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(loading, { timeout: 30_000 }).toBe(false);
    const y = await page.evaluate(() => window.scrollY);
    for (const schedule of [".ties", ".leaving"]) {
      const dimmed = page.locator(`${schedule}.is-updating`);
      if (!(await dimmed.count())) continue;
      await dimmed.scrollIntoViewIfNeeded();
      await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
      await page.evaluate((top) => window.scrollTo(0, top), y);
    }
    still = (await page.locator(".is-updating").count()) === 0 && !(await loading()) ? still + 1 : 0;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The comparison page on a first visit, worked out. */
export async function openCompare(page: Page) {
  await page.goto("/#/");
  await settled(page);
}

/**
 * L-2 to L-5 load as you scroll toward them, and L-3 and L-4 work out their numbers while they're on screen: scroll down to
 * each in turn, and wait for those two to be ready.
 */
export async function loadSchedules(page: Page) {
  for (const id of ["l2", "l3", "l4", "l5"]) {
    const title = page.locator(`#${id}-title`);
    for (let i = 0; i < 60 && !(await title.count()); i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
      await page.waitForTimeout(100);
    }
    await expect(title).toBeVisible();
  }
  for (const schedule of [".ties", ".leaving"]) {
    await page.locator(schedule).scrollIntoViewIfNeeded();
    await expect(page.locator(schedule)).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  }
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
