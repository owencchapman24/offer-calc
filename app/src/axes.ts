import { type RefObject, useLayoutEffect, useState } from "react";
import { usePrinting } from "./ui";

// Axis ticks and widths for the hand-built charts (L-1, L-2, L-4). A module of its own so the schedules that load
// on first use can share it without importing another schedule.

/**
 * A chart's width: its box's, followed as it resizes. Laid out for print (ui.tsx, Printing), it's measured again at once, in a
 * layout effect, so the browser's own print, which can't wait for the resize observer, draws it at the print width too.
 */
export function useChartWidth(box: RefObject<HTMLDivElement | null>, initial: number): number {
  const [width, setWidth] = useState(initial);
  const printing = usePrinting();
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  useLayoutEffect(() => {
    if (box.current?.clientWidth) setWidth(Math.max(320, Math.round(box.current.clientWidth)));
  }, [box, printing]);
  return width;
}

/** "Nice" axis ticks from 0: 1, 2, 2.5 or 5 times a power of ten, at most 6 of them. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/**
 * A value axis's ticks for what a chart draws: from 0 when nothing is below it (niceTicks); otherwise over the whole range, 0
 * among the ticks, so a year after rent below zero, or a day whose clawback outweighs the pay, is drawn under a zero line, not
 * clipped or pinned to the axis (audit C17).
 */
export function valueTicks(values: readonly number[]): number[] {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  if (!(lo < 0)) return niceTicks(hi);
  // Steps of 0.25 or less aren't exact in binary: the tick at 0 is 0, not 1e-17.
  return rangeTicks(lo, hi).map((t) => (Math.abs(t) < 1e-9 ? 0 : t));
}

/** Axis ticks over a range that needn't start at 0: 1, 2, 2.5 or 5 times a power of ten, about five of them. */
export function rangeTicks(lo: number, hi: number): number[] {
  if (!(hi > lo)) {
    const pad = Math.max(Math.abs(hi) * 0.1, 1);
    [lo, hi] = [lo - pad, hi + pad];
  }
  const raw = (hi - lo) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw)!;
  const first = Math.floor(lo / step) * step;
  return Array.from({ length: Math.round((Math.ceil(hi / step) * step - first) / step) + 1 }, (_, i) => first + i * step);
}
