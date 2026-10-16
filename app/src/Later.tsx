import { useRef } from "react";
import type { ByYearProps } from "./ByYear";
import type { BreakevenProps } from "./Breakeven";
import type { LeavingProps } from "./Leaving";
import type { TheWorkProps } from "./TheWork";
import { lazyModule, useLazyModule, useLoadNear } from "./lazy";
import type { WorkContext } from "./metrics";
import type { Stale } from "./ui";

// The schedules under the two columns, L-1 to L-6 (docs/ui-design.md §4, §10). Each loads as you scroll toward it, so a
// quick visit that never gets there doesn't download it, and the main chunk stays in budget (`npm run check-bundle`). They
// import figures.tsx, not Tickmarks.tsx: see figures.tsx for why.

/**
 * The offers' breakdowns (docs/v2-plan.md, item 5): A-1, the "On its own" row and the one-offer bar. Loaded once the page has painted, beside
 * the worker, whose first answer it can't render before anyway (App.tsx).
 */
export const breakdownModule = lazyModule(() => import("./Breakdown"));
/** The lead schedule's verdict (LeadVerdict.tsx): requested as the lead first shows, beside the worker. */
export const verdictModule = lazyModule(() => import("./LeadVerdict"));
const byYearSchedule = lazyModule(() => import("./ByYear"));
const riskSchedule = lazyModule(() => import("./Risk"));
const breakevenSchedule = lazyModule(() => import("./Breakeven"));
const leavingSchedule = lazyModule(() => import("./Leaving"));
const warningsSchedule = lazyModule(() => import("./Warnings"));
const workSchedule = lazyModule(() => import("./TheWork"));

/** Every schedule's code, for the Print button: what Ctrl+P can't wait for. */
export const loadLater = () =>
  Promise.all([breakdownModule, verdictModule, byYearSchedule, riskSchedule, breakevenSchedule, leavingSchedule, warningsSchedule, workSchedule].map((m) => m.load()));

/** L-1 and the bridge, once their code has loaded. */
export function ByYearSlot(props: ByYearProps) {
  const m = useLazyModule(byYearSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(byYearSchedule, ref, m !== null);
  return m ? <m.ByYear {...props} /> : <div ref={ref} className="later l1-slot" />;
}

/**
 * "See how we get there" (the first-use note): the bridge, loading L-1's code first if it isn't here yet, then scrolled to,
 * with focus on its heading once it has rendered.
 */
export async function showBridge() {
  await byYearSchedule.load();
  for (let i = 0; i < 120 && !document.getElementById("bridge-title"); i++) await new Promise((r) => requestAnimationFrame(r));
  document.getElementById("bridge")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("bridge-title")?.focus({ preventScroll: true });
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

/** L-5, once its code has loaded. Its place keeps the id the lead's pointer scrolls to. */
export function WarningsSlot({ ctx, sample, status }: { ctx: WorkContext; sample: boolean; status: Stale }) {
  const m = useLazyModule(warningsSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(warningsSchedule, ref, m !== null);
  return m ? <m.Warnings ctx={ctx} sample={sample} status={status} /> : <div ref={ref} id="l5" className="later" />;
}

/** L-6, once its code has loaded. Collapsed by default: its payments are worked out only once it's opened. */
export function TheWorkSlot(props: TheWorkProps) {
  const m = useLazyModule(workSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(workSchedule, ref, m !== null);
  return m ? <m.TheWork {...props} /> : <div ref={ref} id="l6" className="later" />;
}
