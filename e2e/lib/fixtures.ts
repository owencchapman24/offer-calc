import { test as base } from "@playwright/test";

// The browser tests' clock (audit T9). The app moves the samples forward by whole years to start on or after today, and works
// out present values from today, so on the real date the samples' configuration changes each July 14 and each New Year, and a
// test could pass one day and fail the next. Every test runs on PINNED_DATE instead (the page's Date; timers run as usual), unless
// it opts out with `test.use({ pinClock: false })`: one test runs on the real date, so a date-dependent bug still shows.

/** The day the browser tests run on: noon, so no time zone moves it to another day. */
export const PINNED_DATE = new Date("2026-11-23T12:00:00");

export const test = base.extend<{ pinClock: boolean; pinnedClock: void }>({
  pinClock: [true, { option: true }],
  pinnedClock: [async ({ page, pinClock }, use) => {
    if (pinClock) await page.clock.setFixedTime(PINNED_DATE);
    await use();
  }, { auto: true }],
});

export { expect } from "@playwright/test";
