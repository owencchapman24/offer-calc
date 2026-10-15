import type { EnactedAmounts } from "./index";
import { FEDERAL_2027 } from "./federal2027";

/**
 * Federal amounts published for years after 2026 (EnactedAmounts), by year, oldest first: the list a data refresh adds to, one
 * file per year (federal2027.ts). paramsForYear projects each amount from its latest entry here.
 *
 * Tests run on a frozen copy of this module (test/frozen-enacted.ts, swapped in by vitest.config.ts), so a refresh moves no
 * figure a test pins. The exception is test/law.test.ts, which runs on this module and pins what it lists: it fails at a
 * refresh, by design, until it's updated with the published amounts.
 */
export const ENACTED: ReadonlyArray<readonly [year: number, amounts: EnactedAmounts]> = [[2027, FEDERAL_2027]];
