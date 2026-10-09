// The accessibility scan's exceptions (docs/ui-slices-4-8-plan.md, slice 7): test/a11y-exceptions.json lists the
// axe violations we accept, each with the rule, a CSS selector for the elements it covers and the reason it's
// accepted. An entry without a reason fails the check, here and in `npm test` (exceptions.test.ts).

export interface A11yException {
  /** An axe rule id: "color-contrast". */
  rule: string;
  /** The elements it covers: an axe node matches if it, or an ancestor, matches this selector. */
  selector: string;
  /** Why it's accepted, as a sentence. */
  reason: string;
}

/** A reason is a sentence, not a placeholder: at least 20 characters, and not "TODO". */
const MIN_REASON = 20;
const PLACEHOLDER = /^(todo|tbd|fixme|n\/?a|none|-+|\.+)\b/i;

/** The exceptions in a parsed test/a11y-exceptions.json. Throws, listing every bad entry, if any entry is incomplete. */
export function parseExceptions(json: unknown): A11yException[] {
  const list = (json as { exceptions?: unknown } | null)?.exceptions;
  if (!Array.isArray(list)) throw new Error('a11y exceptions: expected { "exceptions": [...] }.');
  const problems: string[] = [];
  list.forEach((e: Partial<Record<keyof A11yException, unknown>> | null, i) => {
    const at = `a11y exceptions, entry ${i + 1}`;
    if (!e || typeof e !== "object") return void problems.push(`${at}: not an object.`);
    for (const k of ["rule", "selector"] as const) {
      if (typeof e[k] !== "string" || !(e[k] as string).trim()) problems.push(`${at}: no ${k}.`);
    }
    const reason = typeof e.reason === "string" ? e.reason.trim() : "";
    if (!reason) problems.push(`${at} (${String(e.rule)}): no reason. Every exception states why it's accepted.`);
    else if (reason.length < MIN_REASON || PLACEHOLDER.test(reason)) {
      problems.push(`${at} (${String(e.rule)}): "${reason}" isn't a reason. Say why it's accepted, in a sentence.`);
    }
  });
  if (problems.length) throw new Error(problems.join("\n"));
  return list as A11yException[];
}
