import { useRef } from "react";
import type { ByYearProps } from "./ByYear";
import type { BreakevenProps } from "./Breakeven";
import type { LeavingProps } from "./Leaving";
import { lazyModule, useLazyModule, useLoadNear } from "./lazy";
import type { WorkContext } from "./metrics";
import type { Stale } from "./ui";

// The schedules under the two columns (docs/ui-design.md §4, §10): an offer's breakdown, A-2 to A-7, and the comparison's L-1 to
// L-4. Each loads as you scroll toward it, so a quick visit that never gets there doesn't download it, and the main chunk stays in
// budget (`npm run check-bundle`). They import figures.tsx, not Tickmarks.tsx: see figures.tsx for why. L-5 and L-6 retired at stop
// 5B: each offer's warnings and its tables are in its breakdown (A-6, A-7).

/**
 * The offers' breakdowns (docs/v2-plan.md, item 5): A-1, the "On its own" row and the one-offer bar. Loaded once the page has painted, beside
 * the worker, whose first answer it can't render before anyway (App.tsx).
 */
export const breakdownModule = lazyModule(() => import("./Breakdown"));
/** The lead schedule's verdict (LeadVerdict.tsx): requested as the lead first shows, beside the worker. */
export const verdictModule = lazyModule(() => import("./LeadVerdict"));
/** An offer's breakdown, A-2 to A-7 (BreakdownParts.tsx): its loader is in the breakdowns' chunk, which places it (Breakdown.tsx). */
export const loadParts = async () => (await breakdownModule.load()).partsModule.load();
const byYearSchedule = lazyModule(() => import("./ByYear"));
const riskSchedule = lazyModule(() => import("./Risk"));
const breakevenSchedule = lazyModule(() => import("./Breakeven"));
const leavingSchedule = lazyModule(() => import("./Leaving"));

/** Every schedule's code, for the Print button: what Ctrl+P can't wait for. */
export const loadLater = () =>
  Promise.all([loadParts(), ...[verdictModule, byYearSchedule, riskSchedule, breakevenSchedule, leavingSchedule].map((m) => m.load())]);

/** L-1 and the bridge, once their code has loaded. */
export function ByYearSlot(props: ByYearProps) {
  const m = useLazyModule(byYearSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(byYearSchedule, ref, m !== null);
  return m ? <m.ByYear {...props} /> : <div ref={ref} className="later l1-slot" />;
}

/**
 * "See how we get there" (the first-use note): the leader's bridge, in its breakdown's A-2 (docs/v2-plan.md, item 5, B7). The page
 * shows that offer's breakdown with A-2's bridge open (`show`); this loads A-2's code if it isn't here yet, then scrolls to the
 * bridge, with focus on its heading once it has rendered.
 */
export async function showBridge(letter: string, show: () => void) {
  show();
  await loadParts();
  const id = `bridge-${letter}-title`;
  for (let i = 0; i < 120 && !document.getElementById(id); i++) await new Promise((r) => requestAnimationFrame(r));
  document.getElementById(`bridge-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById(id)?.focus({ preventScroll: true });
}

/** L-2, once its code has loaded. */
export function RiskSlot({ ctx, sample, status }: { ctx: WorkContext; sample: boolean; status: Stale }) {
  const m = useLazyModule(riskSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(riskSchedule, ref, m !== null);
  return m ? <m.Risk ctx={ctx} sample={sample} status={status} /> : <div ref={ref} className="later" />;
}

/** L-3, once its code has loaded. */
export function BreakevenSlot(props: BreakevenProps) {
  const m = useLazyModule(breakevenSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(breakevenSchedule, ref, m !== null);
  return m ? <m.Breakeven {...props} /> : <div ref={ref} className="later" />;
}

/** L-4, once its code has loaded. */
export function LeavingSlot(props: LeavingProps) {
  const m = useLazyModule(leavingSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(leavingSchedule, ref, m !== null);
  return m ? <m.Leaving {...props} /> : <div ref={ref} className="later" />;
}

