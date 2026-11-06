import { monthlyPieces } from "./benefits";
import { addMonths, daysInMonth, fromDays, periodStartOf } from "./dates";
import type { RawEvent } from "./streams";
import type { Commission, CommissionDetail, OfferWarning, Scenario } from "./types";

// Commission (docs/v2-plan.md, 4h). It's earned evenly while you're employed, a twelfth of the year's amount each calendar month (a
// partial month by its days, as salary), and each calendar month or quarter is paid `payAfterDays` after its last day, as one
// payment: what the period earned, less the draws paid for it, and for a recoverable draw less the balance carried in, never below
// zero. A draw is paid with salary each month from your start for its months. Guaranteed, it's a floor (the period pays the larger
// of its commission and its draws); recoverable, what commission doesn't cover is a balance that later periods' commission pays
// down, oldest draws first, before they pay anything. Leaving: by default the period you leave in counts its commission to your last
// day and every period is paid on its usual date, after you've gone; under `mustBeEmployedOnPayDate` what isn't paid by your last
// day is forfeited and doesn't earn back the draw. Quotas, accelerators, caps and chargebacks aren't modeled.

export interface CommissionResult {
  /** Draws (each month's piece, accrued like salary) and payouts (each period's, on its pay date): component "commission". */
  events: RawEvent[];
  /** Payouts dated after your last day, for work done by it. */
  toCome: number;
  /** Payouts forfeited under "only if employed on the payout date". */
  forfeited: number;
  /** A recoverable draw's draws not yet earned back once every period to your last day has reconciled, each with its day. */
  outstanding: Array<{ day: number; amount: number }>;
  /** A recoverable draw's balance after the last period ending by `stayEnd` (exclusive). */
  balanceAtStayEnd: number;
}

/**
 * The commission's draws and payouts. `cuts` split the accrual (month starts, anniversaries, the window's edges); `employmentYearOf`
 * gives a piece's employment year (for amounts by year); `until` is the projection's end (a payout on or after it isn't made, though
 * its period still reconciles a recoverable draw's balance).
 */
export function commissionFlows(
  c: Commission, scenario: Scenario, start: number, until: number, leave: number | undefined, cuts: number[],
  employmentYearOf: (day: number) => number, stayEnd: number, warnings: OfferWarning[],
): CommissionResult {
  // A backstop: validateOffer says each of these at its field.
  if (c.period !== "month" && c.period !== "quarter") throw new Error("Commission is paid monthly or quarterly.");
  if (!(Number.isInteger(c.payAfterDays) && c.payAfterDays >= 0 && c.payAfterDays <= 366)) {
    throw new Error("Commission's payout lag must be a whole number of days, 0 to 366.");
  }
  if (c.basis === "byEmploymentYear" && c.amounts.length === 0) throw new Error("Commission by employment year needs a year's amount.");
  const annualFor = (n: number) => (c.basis === "fixed" ? c.amount : c.amounts[Math.min(n, c.amounts.length) - 1])[scenario];
  const draw = c.draw;
  if (draw && !(draw.monthly >= 0)) throw new Error("A draw can't be negative.");
  if (draw?.months !== undefined && !(Number.isInteger(draw.months) && draw.months >= 1)) throw new Error("A draw's months must be whole, 1 or more.");
  const recoverable = !!draw?.recoverable;
  const workEnd = leave !== undefined ? Math.min(until, leave + 1) : until;
  const mustBeEmployed = c.mustBeEmployedOnPayDate ?? false;

  // Draws: paid with salary, month by month, from your start for the draw's months.
  const events: RawEvent[] = [];
  const draws: RawEvent[] = [];
  if (draw && draw.monthly > 0) {
    const drawEnd = Math.min(workEnd, draw.months !== undefined ? addMonths(start, draw.months) : Infinity);
    for (const { a, b, share } of monthlyPieces(start, drawEnd, cuts)) {
      draws.push({ day: b - 1, component: "commission", gross: draw.monthly * share, accruedFrom: a,
        detail: { kind: "commissionDraw", from: fromDays(a), to: fromDays(b - 1), monthly: draw.monthly, days: b - a,
          daysInMonth: daysInMonth(a), recoverable } });
    }
    events.push(...draws);
  }

  const months = c.period === "quarter" ? 3 : 1;
  let toCome = 0;
  let forfeited = 0;
  let balanceAtStayEnd = 0;
  // A recoverable draw's outstanding draws, oldest first: a shortfall adds the period's own draws at the end, commission over a
  // period's draws pays down from the front.
  const queue: Array<{ day: number; amount: number }> = [];
  const balance = () => queue.reduce((s, q) => s + q.amount, 0);
  for (let from = periodStartOf(start, months); from < workEnd;) {
    const to = addMonths(from, months);
    const payDay = to - 1 + c.payAfterDays;
    // A payout on or after the projection's end isn't made, but its period still reconciles the draw's balance.
    const beyond = payDay >= until;
    const a = Math.max(from, start);
    const b = Math.min(to, workEnd);
    // The period's commission, month piece by month piece, in runs of one monthly rate.
    const pieces: CommissionDetail["pieces"] = [];
    let earned = 0;
    for (const p of monthlyPieces(a, b, cuts)) {
      const n = employmentYearOf(p.a);
      const monthly = annualFor(n) / 12;
      earned += monthly * p.share;
      const last = pieces[pieces.length - 1];
      const ey = c.basis === "byEmploymentYear" ? n : undefined;
      if (last && last.monthly === monthly && last.employmentYear === ey) last.months += p.share;
      else pieces.push({ monthly, months: p.share, ...(ey !== undefined ? { employmentYear: ey } : {}) });
    }
    const periodDraws = draws.filter((d) => d.accruedFrom! >= a && d.accruedFrom! < b);
    const drawn = periodDraws.reduce((s, d) => s + d.gross, 0);
    const balanceIn = recoverable ? balance() : 0;
    const lost = leave !== undefined && payDay > leave && mustBeEmployed;
    let paid: number;
    if (!recoverable) {
      paid = Math.max(0, earned - drawn);
    } else if (lost) {
      // Not earned under the plan's rule, so the period's draws join what's owed.
      paid = Math.max(0, earned - drawn - balanceIn);
      if (drawn > 0) queue.push({ day: periodDraws[periodDraws.length - 1].day, amount: drawn });
    } else {
      paid = Math.max(0, earned - drawn - balanceIn);
      if (drawn > earned) queue.push({ day: periodDraws[periodDraws.length - 1].day, amount: drawn - earned });
      let excess = Math.max(0, earned - drawn);
      while (excess > 0 && queue.length) {
        const take = Math.min(excess, queue[0].amount);
        queue[0].amount -= take;
        excess -= take;
        if (queue[0].amount <= 1e-9) queue.shift();
      }
    }
    const detail: CommissionDetail = {
      kind: "commission", period: c.period, periodFrom: fromDays(from), periodTo: fromDays(to - 1), earnedFrom: fromDays(a),
      earnedTo: fromDays(b - 1), pieces, earned, drawn, balanceIn, balanceOut: recoverable ? balance() : 0,
      ...(recoverable ? { recoverable } : {}), proratedToLeave: leave !== undefined && b === leave + 1 && b < to,
    };
    if (beyond) {
      // Nothing paid inside the projection.
    } else if (lost) {
      forfeited += paid;
      if (paid > 0.005) {
        warnings.push({ code: "commissionForfeited", params: { leaveDate: fromDays(leave!), periodFrom: detail.periodFrom,
          periodTo: detail.periodTo, payDate: fromDays(payDay), forfeited: Math.round(paid * 100) / 100, detail } });
      }
    } else if (paid > 0.005) {
      events.push({ day: payDay, component: "commission", gross: paid, detail });
      if (leave !== undefined && payDay > leave) toCome += paid;
    }
    if (to <= stayEnd) balanceAtStayEnd = recoverable ? balance() : 0;
    from = to;
  }
  return { events, toCome, forfeited, outstanding: queue.filter((q) => q.amount > 0.005), balanceAtStayEnd };
}
