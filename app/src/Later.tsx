import { useRef } from "react";
import { lazyModule, useLazyModule, useLoadNear } from "./lazy";
import type { WorkContext } from "./metrics";

// The schedules after L-1 (docs/ui-design.md §4, §10). Each loads as you scroll toward it, so a quick
// visit that never gets there doesn't download it, and the main chunk stays in budget
// (`npm run check-bundle`). They import figures.tsx, not Tickmarks.tsx: see figures.tsx for why.

const riskSchedule = lazyModule(() => import("./Risk"));

/** L-2, once its code has loaded. */
export function RiskSlot({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const m = useLazyModule(riskSchedule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(riskSchedule, ref, m !== null);
  return m ? <m.Risk ctx={ctx} sample={sample} /> : <div ref={ref} className="later" />;
}
