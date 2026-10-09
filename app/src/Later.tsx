import { useRef } from "react";
import type { LeavingProps } from "./Leaving";
import { lazyModule, useLazyModule, useLoadNear } from "./lazy";
import type { WorkContext } from "./metrics";
import type { Stale } from "./ui";

// The schedules after L-1 (docs/ui-design.md §4, §10). Each loads as you scroll toward it, so a quick
// visit that never gets there doesn't download it, and the main chunk stays in budget
// (`npm run check-bundle`). They import figures.tsx, not Tickmarks.tsx: see figures.tsx for why.

const riskSchedule = lazyModule(() => import("./Risk"));
const leavingSchedule = lazyModule(() => import("./Leaving"));
const warningsSchedule = lazyModule(() => import("./Warnings"));

/** L-2, once its code has loaded. */
export function RiskSlot({ ctx, sample, status }: { ctx: WorkContext; sample: boolean; status: Stale }) {
  const m = useLazyModule(riskSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(riskSchedule, ref, m !== null);
  return m ? <m.Risk ctx={ctx} sample={sample} status={status} /> : <div ref={ref} className="later" />;
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
