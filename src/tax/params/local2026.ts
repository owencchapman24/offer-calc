import type { Schedule } from "../types";

/** NYC resident income tax. Source: NYC tax rates via NYS IT-201 instructions; matches PolicyEngine-US. */
export const NYC_2026: Record<"single" | "joint", Schedule> = {
  single: [[0, 0.03078], [12_000, 0.03762], [25_000, 0.03819], [50_000, 0.03876]],
  joint: [[0, 0.03078], [21_600, 0.03762], [45_000, 0.03819], [90_000, 0.03876]],
};

/**
 * Philadelphia Wage Tax, 2026. Rate changes mid-year (pay dates from Jul 1, 2026),
 * so we blend the two halves assuming pay is earned evenly.
 * Source: City of Philadelphia Department of Revenue, "Wage Tax (employers)", phila.gov (checked 2026-10-14):
 * residents 3.74% from Jul 1, 2025 and 3.735% from Jul 1, 2026; nonresidents 3.43% and 3.425%.
 */
export const PHILLY_2026 = {
  resident: (0.0374 + 0.03735) / 2,
  nonresident: (0.0343 + 0.03425) / 2,
};
