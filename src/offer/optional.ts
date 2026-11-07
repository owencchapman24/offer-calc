import type * as Commission from "./commission";
import type * as Espp from "./espp";
import type { OfferInput } from "./types";

// The engine's optional modules: code that only an offer with that feature runs, an ESPP's (4i) and commission's (4h). The
// engine never imports them itself, so the app's worker can load each the first time an offer has one, and the first answer
// waits on less (CLAUDE.md, Bundles). Scripts and tests get them all up front (index.ts). An offer whose module isn't loaded
// throws: it's never projected without it.

export interface OptionalModules {
  commission: typeof Commission;
  espp: typeof Espp;
}
export type OptionalName = keyof OptionalModules;

const loaded: Partial<OptionalModules> = {};

/** Makes a module available to the engine. */
export function provide<K extends OptionalName>(name: K, module: OptionalModules[K]): void {
  loaded[name] = module;
}

/** A module the engine needs for this offer: it must have been provided. */
export function optional<K extends OptionalName>(name: K): OptionalModules[K] {
  const m = loaded[name];
  if (!m) throw new Error(`The engine's ${name} module isn't loaded.`);
  return m;
}

/** The optional modules these offers need, provided or not. */
export function needs(offers: OfferInput[]): OptionalName[] {
  const out: OptionalName[] = [];
  if (offers.some((o) => o.commission)) out.push("commission");
  if (offers.some((o) => o.espp)) out.push("espp");
  return out;
}

/** Whether a module has been provided. */
export const isProvided = (name: OptionalName) => loaded[name] !== undefined;
