import { useRef } from "react";
import type { BreakevenProps } from "./Breakeven";
import type { LeavingProps } from "./Leaving";
import type { TheWorkProps } from "./TheWork";
import { lazyModule, useLazyModule, useLoadNear } from "./lazy";
import type { WorkContext } from "./metrics";
import type { Stale } from "./ui";

// The schedules after L-1 (docs/ui-design.md §4, §10). Each loads as you scroll toward it, so a quick
// visit that never gets there doesn't download it, and the main chunk stays in budget
// (`npm run check-bundle`). They import figures.tsx, not Tickmarks.tsx: see figures.tsx for why.

const riskSchedule = lazyModule(() => import("./Risk"));
const breakevenSchedule = lazyModule(() => import("./Breakeven"));
const leavingSchedule = lazyModule(() => import("./Leaving"));
const warningsSchedule = lazyModule(() => import("./Warnings"));
const workSchedule = lazyModule(() => import("./TheWork"));

/** Every schedule's code, for the Print button: what Ctrl+P can't wait for. */
export const loadLater = () => Promise.all([riskSchedule, breakevenSchedule, leavingSchedule, warningsSchedule, workSchedule].map((m) => m.load()));

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
