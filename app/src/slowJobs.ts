import { cliffs, nextCliff } from "../../src/offer/cliffs";
import { addMonths, fromDays, toDays } from "../../src/offer/dates";
import { keptIfLeaving, leaveDaySweep } from "../../src/offer/project";
import type { Cliff, ISODate, LeaveDayRow } from "../../src/offer/types";
import type { CursorRequest, LeaveCurve, LeavePanel, LeaveRequest, SlowResponse } from "./protocol";

// The slow lane's jobs (docs/ui-design.md §3.4, §4.5): generators that the worker's runner (jobs.ts)
// steps a chunk at a time, about 8 ms each, so an edit never waits behind them and a newer request
// replaces an older one between chunks. Each posts its own result. Worker only: they import the engine.

const CHUNK_MS = 8;

/** A prorated clawback's monthly step: L-4 draws them as one segment and skips them for the next cliff. */
export const proratedStep = (c: Cliff) => c.detail.kind === "clawbackStep" && c.detail.prorated;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The last days L-4 samples for one offer, before `end`: its start, each month's end, and the day before
 * and the day of each cliff off a month's end, so every step lands on its own date.
 */
export function sweepDays(startDate: ISODate, cliffList: Cliff[], end: ISODate): ISODate[] {
  const start = toDays(startDate);
  const stop = toDays(end);
  const monthEnds = new Set<number>();
  for (let m = 1; addMonths(start, m) - 1 < stop; m++) monthEnds.add(addMonths(start, m) - 1);
  const days = new Set<number>([start, ...monthEnds]);
  for (const c of cliffList) {
    const d = toDays(c.date);
    if (d >= stop || monthEnds.has(d)) continue;
    days.add(d);
    if (d - 1 >= start) days.add(d - 1);
  }
  return [...days].filter((d) => d < stop).sort((a, b) => a - b).map(fromDays);
}

/** L-4's curves: each offer's cliffs, then what it keeps for every sampled last day. */
export function* leaveJob(req: LeaveRequest, post: (r: SlowResponse) => void, now = () => performance.now()): Generator<void> {
  const t0 = now();
  try {
    const options = { inflation: req.inflation };
    const stop = toDays(req.end);
    const curves: LeaveCurve[] = [];
    for (const o of req.offers) {
      if (toDays(o.startDate) >= stop) {
        curves.push({ cliffs: [], points: [] });
        continue;
      }
      const years = Math.ceil((stop - toDays(o.startDate)) / 365.25) + 1;
      const list = cliffs(o, req.household, { ...options, years }).filter((c) => toDays(c.date) < stop);
      yield;
      const days = sweepDays(o.startDate, list, req.end);
      const points: LeaveDayRow[] = [];
      let i = 0;
      while (i < days.length) {
        const t = now();
        do points.push(...leaveDaySweep(o, req.household, [days[i++]], options));
        while (i < days.length && now() - t < CHUNK_MS);
        yield;
      }
      curves.push({ cliffs: list, points });
    }
    post({ lane: "leave", gen: req.gen, ok: true, curves, ms: now() - t0 });
  } catch (e) {
    post({ lane: "leave", gen: req.gen, ok: false, error: message(e), ms: now() - t0 });
  }
}

/** L-4's panel: each offer if `leaveDate` is your last day, a chunk per offer. */
export function* cursorJob(req: CursorRequest, post: (r: SlowResponse) => void, now = () => performance.now()): Generator<void> {
  const t0 = now();
  try {
    const options = { inflation: req.inflation };
    const day = toDays(req.leaveDate);
    const panels: Array<LeavePanel | null> = [];
    for (const o of req.offers) {
      if (day < toDays(o.startDate)) {
        panels.push(null);
        continue;
      }
      panels.push(panelFor(req, o, day, options));
      yield;
    }
    post({ lane: "cursor", gen: req.gen, ok: true, panels, ms: now() - t0 });
  } catch (e) {
    post({ lane: "cursor", gen: req.gen, ok: false, error: message(e), ms: now() - t0 });
  }
}

function panelFor(req: CursorRequest, o: CursorRequest["offers"][number], day: number, options: { inflation: number }): LeavePanel {
  const k = keptIfLeaving(o, req.household, day, options);
  const r = k.result;
  const gross = (clawback: boolean) => r.events.filter((e) => (e.component === "clawback") === clawback).reduce((s, e) => s + e.gross, 0);
  const sum = (kinds: string[]) => r.benefitEvents.filter((b) => kinds.includes(b.kind)).reduce((s, b) => s + b.amount, 0);
  const paid = gross(false);
  const repaid = -gross(true);
  const premiums = sum(["premium"]);
  return {
    leaveDate: req.leaveDate,
    paid,
    repaid,
    // Every event's tax, a clawback's own (negative) share being its relief, taken as the remainder of the engine's kept
    // figure so the panel foots exactly: the events round gross, tax and after-tax to the cent separately (cents apart).
    tax: paid - repaid - premiums - k.afterTaxCompKept,
    premiums,
    clawbackOwed: k.clawbackOwed,
    clawbacks: r.leave!.clawbacks,
    afterTaxCompKept: k.afterTaxCompKept,
    totalRewardsKept: k.totalRewardsKept,
    benefits: { perks: sum(["section127", "commuter"]), employerHsa: sum(["employerHsa"]), outOfPocket: sum(["outOfPocket"]) },
    retirementVested: k.retirementVested,
    retirementForfeited: r.leave!.retirementForfeited,
    unvestedRsuForfeited: r.leave!.unvestedRsuForfeited,
    next: nextCliff(o, req.household, req.leaveDate, options, { skip: proratedStep }).next,
    warnings: r.warnings.filter((w) => w.code === "bonusForfeited" || w.code === "clawbackFica"),
  };
}
