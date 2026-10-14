import { defineConfig } from "@playwright/test";

// Merges the shards' blob reports (CI's e2e job: `npx playwright merge-reports --config e2e/merge.config.ts <dir>`) into
// the reports a whole run writes locally: Playwright's HTML report and the accessibility report (.a11y/report.md), whose
// scans arrive as the tests' attachments.
export default defineConfig({
  testDir: ".",
  reporter: [
    ["list"],
    ["html", { outputFolder: "../.playwright/report", open: "never" }],
    ["./lib/reporter.ts", { out: ".a11y" }],
  ],
});
