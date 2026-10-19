import { addDefaults } from "./defaults";

// Detailed mode's defaults that nothing on the main thread reads before detailed mode or the derivations load: the days off and
// the vacation policy (docs/v2-plan.md, 4a). Detailed.tsx and derive.ts import this module, which adds them to the registry
// (defaults.ts), as helpText.ts adds detailed mode's help to help.ts. A test checks each against the engine (defaults.test.ts).

addDefaults({
  "timeOff.vacation": {
    value: 11, shown: () => "11 days",
    reason: "BLS's average for private-industry workers with paid vacation, after a year's service (National Compensation Survey, March 2026).",
  },
  "timeOff.holidays": { value: 8, shown: () => "8 days", reason: "BLS's average number of paid holidays in private industry (2025)." },
  "timeOff.sick": { value: 0, shown: () => "None", reason: "How many sick days you'd take is personal, so none count until you enter them." },
  "timeOff.policy": { value: "days", shown: () => "Days a year", reason: "Most offers give a number of vacation days a year. Pick Unlimited if yours sets none." },
  "timeOff.gives": {
    shown: (d) => `The days you'd take (${d.timeOff.vacation ?? 11})`,
    reason: "Unless the offer gives more days than you'd take, nothing banks, so nothing is paid when you leave.",
  },
  "timeOff.cap": { value: null, shown: () => "No cap", reason: "Many policies cap the days you can bank: enter yours if it does. It matters only if days bank." },
  "timeOff.payout": {
    value: "state", shown: () => "Where the state requires it",
    reason: "Ten states require unused vacation to be paid when you leave; elsewhere it's the employer's policy, so it counts only if you say it does.",
  },
});
