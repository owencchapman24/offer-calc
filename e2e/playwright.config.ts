import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// Playwright on the production build (dist/, served as Vercel serves it: scripts/serve-dist.ts), `npm run e2e` after
// `npm run build`. Two kinds of test (docs/ui-slices-4-8-plan.md, slice 7):
// - the accessibility scan (a11y.e2e.ts), in four projects: desktop and phone widths, light and dark;
// - the smoke and keyboard tests (smoke.e2e.ts, keyboard.e2e.ts), once, on a desktop.
// Locally it drives the installed Edge, so nothing is downloaded; CI installs Chromium.

const CI = !!process.env.CI;
const PORT = 4180;

type Use = NonNullable<PlaywrightTestConfig["use"]>;
const desktop: Use = { viewport: { width: 1440, height: 1000 } };
const phone: Use = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: ".",
  outputDir: "../.playwright/results",
  fullyParallel: true,
  forbidOnly: CI,
  // A retry covers a slow runner's timing, never a violation: a violation fails every run. The report lists retries.
  retries: CI ? 1 : 0,
  workers: CI ? 3 : undefined,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ...(CI ? [["github"] as const] : []),
    ["html", { outputFolder: "../.playwright/report", open: "never" }],
    ["./lib/reporter.ts", { out: ".a11y" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    ...(CI ? {} : { channel: "msedge" }),
    // Transitions off (the app honors it), so a scan never catches a fade halfway.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx tsx scripts/serve-dist.ts ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 30_000,
  },
  projects: [
    { name: "desktop-light", testMatch: "a11y.e2e.ts", use: { ...desktop, colorScheme: "light" } },
    { name: "desktop-dark", testMatch: "a11y.e2e.ts", use: { ...desktop, colorScheme: "dark" } },
    { name: "phone-light", testMatch: "a11y.e2e.ts", use: { ...phone, colorScheme: "light" } },
    { name: "phone-dark", testMatch: "a11y.e2e.ts", use: { ...phone, colorScheme: "dark" } },
    { name: "smoke", testMatch: ["smoke.e2e.ts", "keyboard.e2e.ts"], use: { ...desktop, colorScheme: "light" } },
  ],
});
