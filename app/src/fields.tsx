import { createContext, type ReactNode, useContext } from "react";
import { formatIssue } from "../../src/format/issues";
import type { OfferIssue } from "../../src/offer/validate";
import type { OfferWarning } from "../../src/offer/types";
import { defaultFor, isDefault } from "./defaults";
import { HELP, helpKey } from "./help";
import type { AppOffer, Letter } from "./model";
import type { MetricId } from "./metrics";
import { TickButton, Trace } from "./Tickmarks";
import { Help } from "./ui";

// The ledger's building blocks, as quick mode needs them (docs/ui-design.md §3.3-3.6): a row per field with its help, a cell
// per offer, defaults with a D tickmark, problems shown under the field that caused them, the
// "+ range" control, and the row editor that opens beneath a row, spanning the ledger.

export interface LedgerApi {
  offers: AppOffer[];
  /** Sets draft fields by path. */
  set(o: AppOffer, values: Record<string, unknown>): void;
  /** The validator's problems for each offer. */
  issues: Partial<Record<Letter, OfferIssue[]>>;
  /** The engine's warnings for each offer (your stay, base case): shown at the field they're about. */
  warnings?: Partial<Record<Letter, OfferWarning[]>>;
  /** The open row editor. */
  editor: { row: string; letter: Letter } | null;
  openEditor(row: string, letter: Letter | null): void;
}

const Ledger = createContext<LedgerApi | null>(null);
export const LedgerProvider = Ledger.Provider;
export function useLedger(): LedgerApi {
  const api = useContext(Ledger);
  if (!api) throw new Error("Ledger fields need a LedgerProvider.");
  return api;
}

/** The DOM id of an offer's field: what "Edit it" focuses. */
export const fieldId = (letter: Letter, path: string) => `in-${letter}-${path.replace(/\./g, "-")}`;
/** The DOM id of a row's hint, for aria-describedby. */
export const hintId = (key: string) => `hint-${key.replace(/\./g, "-")}`;
/** An input's figure id: derivations light it up, and its tickmark opens its own. */
export const inputMetric = (letter: Letter, path: string) => `in.${letter}.${path}` as MetricId;

/** A problem's path is the field's, or inside it ("salary.raise.bear" is in "salary.raise"). */
const within = (path: string, field: string) => path === field || path.startsWith(`${field}.`);

export function issuesAt(api: LedgerApi, letter: Letter, path: string): OfferIssue[] {
  return (api.issues[letter] ?? []).filter((i) => within(i.path, path));
}

const SCENARIO_WORD: Record<string, string> = { bear: "Bear case", bull: "Bull case", low: "Low use", medium: "Medium use", high: "High use" };

/** The problems at a field (and inside it), in plain English, saying which case or tranche when it's one of several. */
export function Issues({ letter, path, exclude, exact }: {
  letter: Letter; path: string; /** Paths shown elsewhere (in an editor). */ exclude?: string; /** Only problems at the path itself. */ exact?: boolean;
}) {
  const api = useLedger();
  const list = issuesAt(api, letter, path).filter((i) => (!exclude || !within(i.path, exclude)) && (!exact || i.path === path));
  if (!list.length) return null;
  return (
    // The alert wraps the list (a list with role="alert" would stop being a list).
    <div role="alert">
      <ul className="field-errors">
        {list.map((i) => {
          const last = i.path.split(".").pop()!;
          const tranche = i.path.match(/tranches\.(\d+)/);
          const where = [tranche ? `Tranche ${Number(tranche[1]) + 1}` : "", SCENARIO_WORD[last] ?? ""].filter(Boolean).join(", ");
          return <li key={`${i.path}|${i.code}`}>{where ? `${where}: ` : ""}{formatIssue(i)}</li>;
        })}
      </ul>
    </div>
  );
}

/** A row's label and its help: the hint, the ⓘ, "How this is used →" and, for a default, "Reset to default". */
export function RowLabel({ k, label }: { k: string; label?: string }) {
  const h = HELP[k];
  const d = defaultFor(k);
  const api = useLedger();
  const changed = d ? api.offers.filter((o) => !isDefault(o.draft, k)) : [];
  return (
    <div className="row-label">
      <span className="row-name">{label ?? h.label}</span>
      <Help hint={h.hint} hintId={hintId(k)} section={h.section} extra={changed.length > 0 && d ? (
        <p className="reset">
          Reset to the default ({d.shown(changed[0].draft)}):{" "}
          {changed.map((o, i) => (
            <span key={o.id}>{i ? " · " : ""}<button type="button" className="link" onClick={() => api.set(o, { [k]: null, ...d.alsoClear })}>
              {o.letter}</button></span>
          ))}
        </p>
      ) : null}>{h.help}</Help>
    </div>
  );
}

/** A row of the ledger: its label and help, and one cell per offer, each lit up when a derivation uses it. */
export function FieldRow({ k, label, children, issues = "all", className = "" }: {
  k: string; label?: string; children: (o: AppOffer) => ReactNode;
  /** "editor": problems inside the row's editor are shown there; the cell says how many. */ issues?: "all" | "editor"; className?: string;
}) {
  const api = useLedger();
  return (
    <div className={`row ${className}`.trim()}>
      <RowLabel k={k} label={label} />
      {api.offers.map((o) => {
        const inside = issuesAt(api, o.letter, k);
        return (
          <Trace key={o.id} id={inputMetric(o.letter, k)} className="cell">
            {children(o)}
            {issues === "all" ? <Issues letter={o.letter} path={k} /> : inside.length > 0 && (
              <p className="field-error" role="alert">{inside.length === 1 ? "1 problem" : `${inside.length} problems`}: open it to fix.</p>
            )}
          </Trace>
        );
      })}
    </div>
  );
}

/** A default's D tickmark: it opens why it's the default. */
export function DefaultTick({ o, path, label }: { o: AppOffer; path: string; label: string }) {
  return isDefault(o.draft, path) ? <TickButton id={inputMetric(o.letter, path)} label={label} /> : null;
}
