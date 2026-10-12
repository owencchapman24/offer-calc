// The Print button (docs/ui-design.md §9.5): the page laid out for print, every schedule's code loaded and every figure
// worked out, then the browser's print. Ctrl+P prints only what's loaded: `beforeprint` can't wait for a chunk or the worker.
// Loaded on the first click.

/** How long to wait for the schedules before printing what's there: inputs with a problem, say, leave L-3 and L-4 waiting. */
const PATIENCE_MS = 12_000;

/** Every schedule is on the page, with its figures for the current inputs. */
function ready(): boolean {
  const page = document.querySelector(".page");
  if (!page) return true;
  // A schedule waiting for its code or its results; one being worked out (the lead, L-3, L-4, L-6's payments).
  return !page.querySelector(".later, [aria-busy='true'], .is-updating");
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lays the page out for print (`begin`), loads every schedule (`load`), waits until they've all worked out their figures and
 * held still for a moment, then prints. The page goes back to its screen layout when the browser says it's done (afterprint).
 */
export async function printPage(begin: () => void, load: () => Promise<unknown>): Promise<void> {
  begin();
  await load();
  const until = Date.now() + PATIENCE_MS;
  for (let still = 0; still < 3 && Date.now() < until;) {
    await sleep(150);
    still = ready() ? still + 1 : 0;
  }
  await document.fonts.ready;
  // The charts take the print width as the layout settles: two frames for their resize observers.
  await frame();
  await frame();
  window.print();
}
