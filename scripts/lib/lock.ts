// The oracle's locked Python environment (requirements-lock.txt, a `pip freeze` of the .venv its baseline was taken with):
// reading a freeze, and what an installed environment has drifted from it. Used by run-oracle.ts, which warns before it runs.

/** A package name as pip compares them (PEP 503): lower case, with runs of "-", "_" and "." as one "-". */
export const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");

/** `name==version` lines of a freeze or a lock, by normalized name. Comments, blank lines and anything else are skipped. */
export function readFreeze(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;]+)$/);
    if (m) out.set(normalize(m[1]), m[2]);
  }
  return out;
}

export interface Drift {
  /** Installed at another version than the lock's: [name, locked, installed]. */
  changed: Array<[string, string, string]>;
  /** Installed but not in the lock: platform-specific (the lock is from Windows), or installed by hand. */
  extra: string[];
}

/**
 * What the installed environment has that the lock doesn't. A package the lock has but isn't installed isn't drift: a
 * constraints file pins only what gets installed, and the lock has Windows-only packages (colorama).
 */
export function drift(lock: Map<string, string>, installed: Map<string, string>): Drift {
  const changed: Drift["changed"] = [];
  const extra: string[] = [];
  for (const [name, version] of [...installed].sort(([a], [b]) => a.localeCompare(b))) {
    const locked = lock.get(name);
    if (locked === undefined) extra.push(name);
    else if (locked !== version) changed.push([name, locked, version]);
  }
  return { changed, extra };
}
