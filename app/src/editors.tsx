import { type ReactNode, useState } from "react";
import { describeSchedule } from "../../src/format/index";
import type { Scenario } from "../../src/offer/types";
import {
  DateField, DefaultTick, EditorHead, fieldId, hintId, inputMetric, Issues, issuesAt, NumberField, RangeField, ResetFields, useLedger,
} from "./fields";
import { HELP, helpKey } from "./help";
import { type AppOffer, getPath, type GrantDraft, type PromotionDraft, type RefresherDraft, type ScheduleDraft } from "./model";
import { DEFAULT_PRESET, PRESET_IDS, presetOf, PRESETS, type PresetId } from "./presets";
import { Trace } from "./Tickmarks";
import { Help } from "./ui";

// The row editors (docs/ui-design.md §3.3, W3): each opens beneath its row, spanning the ledger, for one
// offer: promotions, the bonus by year, RSU grants with their vesting, and refreshers. Every field keeps
// its help, its default's D tickmark and its problems, as in the rows.

export const newPromotion = (): PromotionDraft => ({ on: null, stepUp: null, scenarios: null });
export const newGrant = (): GrantDraft => ({ label: "", value: null, grantDate: null, vestStart: null, schedule: { tranches: null, vestDates: null } });
export const newRefreshers = (): RefresherDraft => ({ value: null, firstAfterMonths: null, everyMonths: null, schedule: { tranches: null, vestDates: null } });

/** A field inside an editor: its label and help beside it, its problems under it, lit up when a derivation uses it. */
function EditorField({ o, k, path, children }: { o: AppOffer; k: string; path: string; children: ReactNode }) {
  const h = HELP[k];
  return (
    <div className="editor-field">
      <div className="editor-field-label">
        <span className="editor-col-name">{h.label}</span>
        <Help hint={h.hint} hintId={hintId(k)} section={h.section} extra={<ResetFields o={o} fields={[[`${o.letter}`, path]]} />}>{h.help}</Help>
      </div>
      <Trace id={inputMetric(o.letter, path)} className="editor-field-value">
        {children}
        <Issues letter={o.letter} path={path} exclude={path.endsWith(".schedule") ? `${path}.vestDates` : undefined} />
      </Trace>
    </div>
  );
}

const remove = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);

// ---- promotions ------------------------------------------------------------------------------

const SCENARIOS: Scenario[] = ["bear", "base", "bull"];

export function PromotionsEditor({ o }: { o: AppOffer }) {
  const api = useLedger();
  const list = o.draft.salary.promotions;
  return (
    <div className="editor-table">
      <div className="editor-grid promotions">
        <EditorHead k="salary.promotions.on" />
        <EditorHead k="salary.promotions.stepUp" />
        <EditorHead k="salary.promotions.scenarios" o={o} rows={list.map((_, i): [string, string] => [`promotion ${i + 1}`, `salary.promotions.${i}.scenarios`])} />
        <span />
        {list.map((p, i) => {
          const path = `salary.promotions.${i}`;
          const scenarios = p.scenarios ?? SCENARIOS;
          return (
            <Trace key={i} id={inputMetric(o.letter, path)} className="editor-grid-row">
              <DateField o={o} path={`${path}.on`} label={`promotion ${i + 1} date`} />
              <NumberField o={o} path={`${path}.stepUp`} kind="percent" label={`promotion ${i + 1} step-up`} />
              <span className="field scenarios" role="group" aria-label={`Promotion ${i + 1} counts in`}>
                {SCENARIOS.map((sc) => (
                  <label key={sc} className="sub check">
                    <input type="checkbox" checked={scenarios.includes(sc)} data-help="salary.promotions.scenarios" aria-describedby={hintId("salary.promotions.scenarios")}
                      onChange={(e) => api.set(o, { [`${path}.scenarios`]: e.target.checked ? SCENARIOS.filter((x) => x === sc || scenarios.includes(x))
                        : scenarios.filter((x) => x !== sc) })} />
                    <span>{sc}</span>
                  </label>
                ))}
                <DefaultTick o={o} path={`${path}.scenarios`} label="a promotion in every scenario" />
              </span>
              <button type="button" className="link remove-row" aria-label={`Remove promotion ${i + 1}`}
                onClick={() => api.set(o, { "salary.promotions": remove(list, i) })}>Remove</button>
              <span className="editor-row-issues"><Issues letter={o.letter} path={path} /></span>
            </Trace>
          );
        })}
      </div>
      <button type="button" className="link add-row" onClick={() => api.set(o, { "salary.promotions": [...list, newPromotion()] })}>
        + Add a promotion</button>
      {!list.length && <p className="sub">No promotions: salary changes only with merit raises.</p>}
    </div>
  );
}

// ---- bonus by year ------------------------------------------------------------------------------

export function BonusYearsEditor({ o }: { o: AppOffer }) {
  const api = useLedger();
  const list = o.draft.bonus.amounts;
  return (
    <div className="editor-table">
      <EditorHead k="bonus.amounts" />
      <div className="editor-grid years">
        {list.map((_, i) => (
          <Trace key={i} id={inputMetric(o.letter, `bonus.amounts.${i}`)} className="editor-grid-row">
            <span className="year-label">Year {i + 1}{i === list.length - 1 ? ", and after" : ""}</span>
            <RangeField o={o} path={`bonus.amounts.${i}`} kind="money" label={`bonus, year ${i + 1}`} />
            <button type="button" className="link remove-row" aria-label={`Remove year ${i + 1}`}
              onClick={() => api.set(o, { "bonus.amounts": remove(list, i) })}>Remove</button>
            <span className="editor-row-issues"><Issues letter={o.letter} path={`bonus.amounts.${i}`} /></span>
          </Trace>
        ))}
      </div>
      <Issues letter={o.letter} path="bonus.amounts" exact />
      <button type="button" className="link add-row" onClick={() => api.set(o, { "bonus.amounts": [...list, null] })}>+ Add a year</button>
      <p className="sub">The last year's amount repeats for every year after it. Each is prorated by the days you work in its bonus year.</p>
    </div>
  );
}

// ---- RSU grants and refreshers ---------------------------------------------------------------------

export function GrantsEditor({ o }: { o: AppOffer }) {
  const api = useLedger();
  const list = o.draft.equity.grants;
  return (
    <div className="editor-blocks">
      {list.map((g, i) => {
        const path = `equity.grants.${i}`;
        return (
          <fieldset key={i} className="editor-block">
            <legend>Grant {i + 1}{g.label ? `: ${g.label}` : ""}</legend>
            <EditorField o={o} k="equity.grants.label" path={`${path}.label`}>
              <input id={fieldId(o.letter, `${path}.label`)} aria-label={`Offer ${o.letter} grant ${i + 1} name`} placeholder="New-hire RSUs" value={g.label}
                data-help="equity.grants.label" aria-describedby={hintId("equity.grants.label")} onChange={(e) => api.set(o, { [`${path}.label`]: e.target.value })} />
            </EditorField>
            <EditorField o={o} k="equity.grants.value" path={`${path}.value`}>
              <NumberField o={o} path={`${path}.value`} kind="money" label={`grant ${i + 1} value at grant`} />
            </EditorField>
            <EditorField o={o} k="equity.grants.grantDate" path={`${path}.grantDate`}>
              <DateField o={o} path={`${path}.grantDate`} label={`grant ${i + 1} grant date`} fallback={o.draft.startDate} />
            </EditorField>
            <EditorField o={o} k="equity.grants.vestStart" path={`${path}.vestStart`}>
              <DateField o={o} path={`${path}.vestStart`} label={`grant ${i + 1} vesting start`} fallback={o.draft.startDate} />
            </EditorField>
            <EditorField o={o} k="equity.grants.schedule" path={`${path}.schedule`}>
              <ScheduleField o={o} path={`${path}.schedule`} what={`grant ${i + 1}`} />
            </EditorField>
            <EditorField o={o} k="equity.grants.schedule.vestDates" path={`${path}.schedule.vestDates`}>
              <VestDatesField o={o} path={`${path}.schedule.vestDates`} what={`grant ${i + 1}`} />
            </EditorField>
            <button type="button" className="link remove-row" onClick={() => api.set(o, { "equity.grants": remove(list, i) })}>Remove this grant</button>
          </fieldset>
        );
      })}
      <button type="button" className="link add-row" onClick={() => api.set(o, { "equity.grants": [...list, newGrant()] })}>
        + Add {list.length ? "another" : "a"} grant</button>
    </div>
  );
}

export function RefreshersEditor({ o }: { o: AppOffer }) {
  const api = useLedger();
  const r = o.draft.equity.refreshers;
  if (!r) {
    return (
      <div className="editor-blocks">
        <p className="sub">None counted. Add them if your offer or recruiter gives a refresher policy.</p>
        <button type="button" className="link add-row" onClick={() => api.set(o, { "equity.refreshers": newRefreshers() })}>+ Add refreshers</button>
      </div>
    );
  }
  return (
    <div className="editor-blocks">
      <fieldset className="editor-block">
        <legend>Refreshers</legend>
        <EditorField o={o} k="equity.refreshers.value" path="equity.refreshers.value">
          <RangeField o={o} path="equity.refreshers.value" kind="money" label="refresher value" />
        </EditorField>
        <EditorField o={o} k="equity.refreshers.firstAfterMonths" path="equity.refreshers.firstAfterMonths">
          <NumberField o={o} path="equity.refreshers.firstAfterMonths" kind="number" unit="months" label="first refresher, months after your start" />
        </EditorField>
        <EditorField o={o} k="equity.refreshers.everyMonths" path="equity.refreshers.everyMonths">
          <NumberField o={o} path="equity.refreshers.everyMonths" kind="number" unit="months" label="months between refreshers" />
        </EditorField>
        <EditorField o={o} k="equity.refreshers.schedule" path="equity.refreshers.schedule">
          <ScheduleField o={o} path="equity.refreshers.schedule" what="each refresher" />
        </EditorField>
        <EditorField o={o} k="equity.refreshers.schedule.vestDates" path="equity.refreshers.schedule.vestDates">
          <VestDatesField o={o} path="equity.refreshers.schedule.vestDates" what="refreshers" />
        </EditorField>
        <button type="button" className="link remove-row" onClick={() => api.set(o, { "equity.refreshers": null })}>Remove refreshers</button>
      </fieldset>
    </div>
  );
}

const pctText = (f: number) => `${+(f * 100).toFixed(2)}%`;

/**
 * A vesting schedule: a preset (named by describeSchedule, so the label can't drift from the tranches),
 * or your own tranches by month. Your own are footed, and a schedule a hair off 100% offers to fix its
 * last row (33.33 / 33.33 / 33.33 -> make the last 33.34).
 */
function ScheduleField({ o, path, what }: { o: AppOffer; path: string; what: string }) {
  const api = useLedger();
  const s = getPath(o.draft, path) as ScheduleDraft;
  const tranches = s.tranches ?? PRESETS[DEFAULT_PRESET].tranches;
  const complete = tranches.every((t) => t.month !== null && t.fraction !== null);
  const preset: PresetId | null = s.tranches === null ? DEFAULT_PRESET : complete ? presetOf(tranches as Array<{ month: number; fraction: number }>) : null;
  const [own, setOwn] = useState(preset === null);
  const choice = own || preset === null ? "own" : preset;
  const k = helpKey(path);
  return (
    <div className="vesting">
      <span className="field">
        <select id={fieldId(o.letter, path)} aria-label={`Offer ${o.letter} ${what} vesting`} data-help={k} aria-describedby={hintId(k)} value={choice}
          aria-invalid={issuesAt(api, o.letter, path).some((i) => !i.path.includes("vestDates")) || undefined}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "own") {
              setOwn(true);
              api.set(o, { [`${path}.tranches`]: tranches.map((t) => ({ ...t })) });
            } else {
              setOwn(false);
              api.set(o, { [`${path}.tranches`]: PRESETS[id as PresetId].tranches.map((t) => ({ ...t })) });
            }
          }}>
          {PRESET_IDS.map((id) => <option key={id} value={id}>{describeSchedule(PRESETS[id])}</option>)}
          <option value="own">Your own tranches</option>
        </select>
        <DefaultTick o={o} path={path} label={`the default vesting for ${what}`} />
      </span>
      {choice === "own" ? <OwnTranches o={o} path={path} /> : <TrancheStrip tranches={tranches as Array<{ month: number; fraction: number }>} />}
    </div>
  );
}

/** A preset's tranches, read only: month and percent, footed. */
function TrancheStrip({ tranches }: { tranches: Array<{ month: number; fraction: number }> }) {
  return (
    <div className="tranche-strip">
      <div className="tranche-scroll">
        <table>
          <tbody>
            <tr><th scope="row">Month</th>{tranches.map((t) => <td key={t.month}>{t.month}</td>)}</tr>
            <tr><th scope="row">Vests</th>{tranches.map((t) => <td key={t.month}>{pctText(t.fraction)}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="tranche-total">{tranches.length} tranches, adding up to <span className="foot">{pctText(tranches.reduce((a, t) => a + t.fraction, 0))}
        <span className="tick" aria-hidden="true">^</span></span></p>
    </div>
  );
}

/** Your own tranches: a row each, footed, with the rounding fix when they're a hair off 100%. */
function OwnTranches({ o, path }: { o: AppOffer; path: string }) {
  const api = useLedger();
  const list = (getPath(o.draft, `${path}.tranches`) as Array<{ month: number | null; fraction: number | null }> | null) ?? [];
  const sum = list.reduce((a, t) => a + (t.fraction ?? 0), 0);
  const last = list.length - 1;
  const others = sum - (list[last]?.fraction ?? 0);
  const fixable = last >= 0 && Math.abs(sum - 1) > 1e-9 && Math.abs(sum - 1) < 0.001 && 1 - others > 0;
  const k = helpKey(path);
  return (
    <div className="own-tranches">
      <div className="editor-grid tranches">
        <EditorHead k={`${k}.tranches.month`} />
        <EditorHead k={`${k}.tranches.fraction`} />
        <span />
        {list.map((_, j) => (
          <Trace key={j} id={inputMetric(o.letter, `${path}.tranches.${j}`)} className="editor-grid-row">
            <NumberField o={o} path={`${path}.tranches.${j}.month`} kind="number" label={`tranche ${j + 1}, month`} />
            <NumberField o={o} path={`${path}.tranches.${j}.fraction`} kind="percent" label={`tranche ${j + 1}, percent vesting`} />
            <button type="button" className="link remove-row" aria-label={`Remove tranche ${j + 1}`}
              onClick={() => api.set(o, { [`${path}.tranches`]: remove(list, j) })}>Remove</button>
          </Trace>
        ))}
        <span className="foot-label">Adds up to</span>
        <span className="foot">{pctText(sum)}<span className="tick" aria-hidden="true">^</span></span>
        <span />
      </div>
      {fixable && (
        <button type="button" className="link" onClick={() => api.set(o, { [`${path}.tranches.${last}.fraction`]: 1 - others })}>
          Make the last row {pctText(1 - others)}</button>
      )}
      <button type="button" className="link add-row" onClick={() => api.set(o, { [`${path}.tranches`]: [...list, { month: null, fraction: null }] })}>
        + Add a tranche</button>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A company vest calendar: none (the schedule's own dates, the default), or months and a day. */
function VestDatesField({ o, path, what }: { o: AppOffer; path: string; what: string }) {
  const api = useLedger();
  const v = getPath(o.draft, path) as ScheduleDraft["vestDates"];
  const k = helpKey(path);
  const common = { "data-help": k, "aria-describedby": hintId(k) };
  return (
    <div className="vest-dates">
      <span className="field">
        <select id={fieldId(o.letter, path)} aria-label={`Offer ${o.letter} ${what} company vest dates`} {...common} value={v ? "company" : "none"}
          onChange={(e) => api.set(o, { [path]: e.target.value === "none" ? null : { months: [], day: null } })}>
          <option value="none">None: on the schedule's dates</option>
          <option value="company">On company vest dates</option>
        </select>
        <DefaultTick o={o} path={path} label={`no company vest dates for ${what}`} />
      </span>
      {v && (
        <>
          <span className="months" role="group" aria-label={`Offer ${o.letter} ${what} vest months`}>
            {MONTHS.map((m, i) => (
              <label key={m} className="sub check">
                <input type="checkbox" checked={v.months.includes(i + 1)} {...common}
                  onChange={(e) => api.set(o, { [`${path}.months`]: e.target.checked ? [...v.months, i + 1].sort((a, b) => a - b) : v.months.filter((x) => x !== i + 1) })} />
                <span>{m}</span>
              </label>
            ))}
          </span>
          <label className="sub">Day
            <select aria-label={`Offer ${o.letter} ${what} vest day`} {...common} value={v.day ?? ""}
              onChange={(e) => api.set(o, { [`${path}.day`]: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
          {!v.months.length && <span className="sub">Pick the months your firm vests in.</span>}
        </>
      )}
    </div>
  );
}
