import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { DATA_YEARS } from "../../src/col/cities";
import { formatAssumption } from "../../src/format/index";
import type { ValueBasis } from "../../src/offer/types";
import { CASES, changeText, riskView } from "./cases";
import { cashLever, changeText as tieChangeText } from "./breakevenModel";
import { shownYears } from "./footing";
import { forfeits, leaveTerms } from "./leaveModel";
import { ASSUMPTIONS, type Letter, toOfferInput } from "./model";
import { basisPhrase, pricesOf, shortCity, type WorkContext } from "./metrics";
import { bridge } from "./byYearModel";
import { SECTIONS, type SectionId, sectionTitle } from "./sections";
import { cents, dayBefore, dollars, figure, longDate, percent } from "./text";
import { TICKS, type TickKind } from "./ui";

// The methodology (docs/ui-design.md §8): how every number is worked out, in plain language, with
// your own numbers where they help. Loaded only when opened (#/method). Every tickmark's popover links
// to a section here (#/method/M-7.2).

export const sectionAnchor = (id: SectionId) => `m-${id.slice(2).replace(".", "-")}`;
const ENGINE_VERSION = "0.1.0";

export default function Methodology({ ctx, section, sample }: { ctx: WorkContext; section: SectionId | null; sample: boolean }) {
  const top = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = section ? document.getElementById(sectionAnchor(section)) : null;
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, 0);
      top.current?.focus({ preventScroll: true });
    }
  }, [section]);

  const toc = (Object.keys(SECTIONS) as SectionId[]);
  const p = pricesOf(ctx);
  return (
    <Place.Provider value={p.place}>
    <div className="method">
      <nav className="method-toc" aria-label="Methodology contents">
        <p className="strip-title">Contents</p>
        <ol>
          {toc.map((id) => (
            <li key={id} className={id.includes(".") ? "toc-sub" : ""}>
              <a href={`#/method/${id}`} aria-current={section === id ? "location" : undefined}>
                <span className="toc-ref">{id.includes(".") ? id.slice(2) : id}</span> {sectionTitle(id, p.place)}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <article className="method-body">
        <header className="method-head">
          <h1 ref={top} tabIndex={-1}>Methodology</h1>
          <p>
            How every figure is worked out, with your numbers where they help. We compare money, time and prices; which job fits
            your career is yours to judge. Nothing here is financial advice. <a href="#/">Back to the comparison</a>
          </p>
          <p className="method-version">
            Engine {ENGINE_VERSION} · tax law 2026, later years projected · prices: BEA Regional Price Parities {DATA_YEARS.rpp} ·
            rents: HUD Fair Market Rents FY{DATA_YEARS.fmr}
          </p>
        </header>

        <Section id="M-1">
          <p>
            Every comparison runs one pipeline, left to right. Each step is a basis you can pick in the lead schedule, and each
            shows its own winner:
          </p>
          <ol className="pipeline-list">
            <li><strong>Gross pay</strong>: salary, bonuses, cash awards such as a sign-on, and RSUs as they vest.</li>
            <li><strong>After tax</strong>: gross pay minus federal, Social Security and Medicare, state and local tax, and your health
              premiums (<Ref id="M-4" />).</li>
            <li><strong>+ Benefits (total rewards)</strong>: plus the employer 401(k) money you'd keep, perks and employer HSA money,
              minus the health costs you'd pay out of pocket (<Ref id="M-5" />).</li>
            <li><strong>− Rent &amp; prices ({p.phrase})</strong>: minus rent, with what's left to spend priced as in
              {" "}{p.city}, plus what you save at face value (<Ref id="M-6.3" />). This is the default verdict.</li>
            <li><strong>Per hour</strong>: the step-3 total, as paid, divided by the hours you'd work (<Ref id="M-5.4" />).</li>
          </ol>
          <p>
            Every payment and vest is a dated event. Tax is worked out per calendar year, the way the law works; the events are
            then grouped into employment years (year 1 is your first 12 months) for L-1 and the bridge, and summed over your stay
            for the verdict. All three views come from the same events, so they reconcile: the bridge's year-1 total is the
            chart's year 1, and the years add up to your stay. L-6, The work, lists them all: each year line by line, every
            payment with its formula and tax, and each calendar year's tax with and without the offer.
          </p>
          <PipelineExample ctx={ctx} sample={sample} />
        </Section>

        <Section id="M-2">
          <p>
            <strong>Salary</strong> accrues by calendar month: each month earns 1/12 of the yearly rate, and a partial month earns
            its share by days worked. So a July start earns about half its salary in its first calendar year, and a full employment
            year is exactly the yearly rate. Raises and promotions, entered under Pay in detailed mode, change the rate on their
            dates.
          </p>
          <p>
            <strong>Bonuses</strong> are paid once a year for the work before it. A target given as a percent applies to the salary
            earned in the bonus year; a dollar target is prorated by days worked. The first bonus is therefore a stub, paid for
            the months since your start date. Unless you change it, a bonus is paid each March 15 for the prior calendar year,
            the most common pattern, and you must still work there on the pay date to receive it.
          </p>
          <p>
            <strong>Cash awards</strong>, such as a sign-on or relocation payment, count on the day they're paid. If you leave
            early, a clawback may take some back (<Ref id="M-9" />).
          </p>
          <p>
            The bridge in L-1 starts from what an <strong>offer letter</strong> quotes for a year: the salary at the year's start,
            the target bonus on it, cash awards paid in the year and new-hire RSUs due in it at grant value. Each line under it
            is a reason what's paid differs: a stub first bonus, RSUs that vest on the company's dates, a raise during the year.
          </p>
        </Section>

        <Section id="M-3">
          <p>
            <strong>RSUs</strong> are counted as pay on the day they vest, at their value that day, and taxed as wages. We assume
            you sell at vest, so a later rise or fall in the share price isn't counted. A tranche's value is its share of the grant
            times the price growth from the grant date (0% unless you enter a range). A vesting schedule can be any list of months
            and fractions; if the company vests on fixed dates (say, February, May, August and November 15), each tranche moves to
            the next of those dates, sometimes into the next employment year. Refresher grants, when entered, stack on top.
          </p>
          <p>
            Options and private-company equity (including double-trigger RSUs) aren't modeled yet and count as $0.
          </p>
        </Section>

        <Section id="M-4">
          <p>
            <strong>Cash basis, by calendar year.</strong> Each payment is taxed in the calendar year it's paid: a 2027 bonus paid
            in March 2028 is 2028 income. For each calendar year we compute your household's tax twice, with the offer and without
            it (your other wages that year count in both), and the difference is the offer's tax. It's spread over that year's
            payments in proportion to their size, so every payment carries its year's average rate. That's why a July start's
            first months are taxed lightly: half a year of pay sits in the low brackets.
          </p>
          <p>
            <strong>What's included:</strong> federal income tax (2026 brackets and standard deduction, or itemizing when that's
            lower, with state and local tax capped at the 2026 SALT limit); Social Security (6.2% up to the wage base) and Medicare
            (1.45%, plus 0.9% above $200,000 single); state income tax for all 50 states and DC, and state payroll taxes such as
            California's SDI; New York City's income tax and Philadelphia's wage tax, for residents (you say whether you'd live inside
            the city). Your 401(k) deferrals and health premiums come out before income tax; Philadelphia's wage tax is on pay
            before your 401(k).
          </p>
          <p>
            <strong>Later years.</strong> Tax law after 2026 isn't known yet, so it's projected: federal brackets, deductions and
            limits rise with the inflation assumption ({percent(ASSUMPTIONS.inflation)} a year), and the SALT cap follows its
            statutory schedule (101% a year through 2029, $10,000 from 2030). Where the IRS has already published a later year's
            amount, it's used as published and projected on from there: so far, the 2027 HSA limits ($4,500 self-only, $9,000
            family; Rev. Proc. 2026-24) and the 2027 Social Security wage base ($192,300; the Social Security Administration, October
            14, 2026). State law is held at 2026 rules, except California, which indexes by statute, and amounts tied to federal
            ones.
          </p>
          <p>
            <strong>What you owe, not what's withheld.</strong> Totals are the tax you owe. Employers withhold bonuses and RSU vests
            at a flat 22%, often less than you owe, so a balance can come due in April; a later update will flag it.
          </p>
          <h3 className="method-sub">Validated against PolicyEngine-US</h3>
          <p>
            The tax engine is checked against PolicyEngine-US (version 2.30.3, an open-source microsimulation model) for 2026 law,
            on a grid of wages from $40,000 to $320,000 in $20,000 steps, for every state and DC, single and married filing
            jointly. The last run was on October 8, 2026.
          </p>
          <table className="method-table">
            <thead><tr><th scope="col">Tax</th><th scope="col">Result</th></tr></thead>
            <tbody>
              <tr><th scope="row">Social Security and Medicare</th><td>Exact at every grid point</td></tr>
              <tr><th scope="row">State payroll taxes</th><td>Exact (within $0.01)</td></tr>
              <tr><th scope="row">New York City</th><td>Within $0.48</td></tr>
              <tr><th scope="row">Federal income tax, single, $60k–$200k</th><td>50 of 51 within $5. Alaska is $120–$350 lower: PolicyEngine
                counts the Permanent Fund Dividend as income; we don't.</td></tr>
              <tr><th scope="row">State income tax, single, $60k–$200k</th><td>42 of 51 within $5 and 44 within $6 (Nebraska −$5.67,
                Wisconsin −$5.59). The other seven differ by more than $10: Arkansas and Connecticut (low-income credits and tables
                reach higher incomes than we model), Vermont (2025 bracket widths), Colorado (a sales-tax refund we don't model),
                North Dakota and Oregon (small indexing gaps), and Missouri (one intentional difference, below).</td></tr>
            </tbody>
          </table>
          <p><strong>Intentional differences</strong>, where we think our reading is right:</p>
          <ul>
            <li>For the SALT deduction we use the state and local tax you owe; PolicyEngine uses estimated withholding. This
              explains most federal gaps for people who itemize in New York, Connecticut and DC.</li>
            <li>We itemize whenever that minimizes federal, state and local tax together, so the choice can flip at slightly
              different incomes.</li>
            <li>Missouri's deduction for federal tax puts income of exactly $100,000 in the 15% tier, as the statute reads
              (RSMo 143.171.2); PolicyEngine applies 5%.</li>
          </ul>
        </Section>

        <Section id="M-5">
          <p>
            Total rewards adds what the job gives you beyond cash, and takes out what its health plan costs you beyond premiums.
            Quick mode doesn't ask for these; detailed mode does, and the sample offers include them. A 401(k) or a health plan
            you haven't entered isn't counted, and you can say an offer has none. When one is counted for some offers but not
            others, the lead schedule says so, since leaving it out flatters one side.
          </p>
        </Section>
        <Section id="M-5.1">
          <p>
            Your own 401(k) deferrals are a percent of pay, capped each calendar year at the federal limit ($24,500 in 2026).
            Pre-tax deferrals lower income tax but not Social Security and Medicare. They stay your money, so they count at face
            value; growth and the tax you'd pay on withdrawal aren't modeled. The employer's match follows each paycheck's
            deferral rate with no year-end true-up, so maxing out early loses match. Employer money counts only once it's vested:
            a 3-year cliff counts nothing if you stay two years.
          </p>
        </Section>
        <Section id="M-5.2">
          <p>
            Premiums and your HSA contributions are taken pre-tax. Health costs beyond premiums are your expected out-of-pocket
            spending (your own estimate at the health use you pick in About you, medium unless you change it, capped at the plan's
            out-of-pocket maximum), minus any HSA money from the employer. They're held flat each year. A premium or out-of-pocket
            estimate left blank isn't counted: we don't guess what a plan you haven't seen costs.
          </p>
        </Section>
        <Section id="M-5.3">
          <p>
            Tax-free perks, such as education assistance (up to $5,250 a year) and commuter benefits (up to $340 a month), count
            at face value.
          </p>
        </Section>
        <Section id="M-5.4">
          <p>
            Hours are weekly hours times weeks a year (50 unless entered), prorated for a partial year and counted only inside
            your stay. Per hour is the step-3 total, as paid, divided by those hours. It isn't discounted, and it's a lens rather
            than the verdict: hours are the softest input, and people trade hours for experience on purpose.
          </p>
        </Section>
        <Section id="M-5.5">
          <p>
            When two offers' hours differ by at least 2 a week (100 hours a year), the lead schedule says what the extra hours
            pay: the gap in the selected basis, as paid, divided by the gap in hours worked. If the offer with more hours also pays
            more, that's a dollar figure per extra hour. If it pays less, the line says "more hours for less pay" with the yearly
            gap, then names the first step of the pipeline where the extra hours do pay, against that offer's average per hour on
            the same step.
          </p>
        </Section>

        <Section id="M-6">
          <p>
            A dollar goes further in some cities than others. We never adjust gross pay for that; we adjust what's left to spend.
          </p>
        </Section>
        <Section id="M-6.1">
          <p>
            Prices come from the Bureau of Economic Analysis's Regional Price Parities ({DATA_YEARS.rpp}, released February 19,
            2026), which give each metro area's price level against the U.S. average (all items = 100). Rent is counted separately,
            at what you'd pay, so we use prices other than rent: (all items − 0.16 × housing rents) ÷ 0.84, where 16% is housing
            rents' share of BEA's price weights. Spending money is restated by {p.place} non-housing prices ÷ the city's: <PriceExample ctx={ctx} />
          </p>
          <p>
            Prices in, under About you, picks the place whose prices the after-rent figures are in: the U.S. average by default, or a
            city you know, such as where you live now, so the figures read in dollars you recognize. That place's own price factor is
            1. Switching it scales every offer's spending money by the same ratio, the new place's non-housing prices ÷ the old
            one's, while what you save counts at face value either way. So every total moves, and since savings don't scale, the
            gaps between offers can move a little too. Prices are now in {p.name}.
          </p>
        </Section>
        <Section id="M-6.2">
          <p>
            Rent is the rent you enter for each offer. Left blank, it's HUD's Fair Market Rent for a 1-bedroom (FY{DATA_YEARS.fmr},
            effective October 1, 2026): the 40th percentile of what recent movers pay, utilities included, for the HUD area holding
            most of the metro's people. Where HUD has no figure, we scale the U.S. median gross rent ($1,487, Census ACS 2024) by
            the area's housing prices. Estimates are metro-wide and often below city-center rents, so they carry an E tickmark and
            ask for your actual rent.
          </p>
          <p>
            The rent you enter is the first lease year's. The lease starts on your start date and rises at each anniversary by the
            rent growth under Where you'd live (the inflation assumption, {percent(ASSUMPTIONS.inflation)}, unless you change it),
            and it's paid only while you work there.
          </p>
        </Section>
        <Section id="M-6.3">
          <p>
            "{p.phrase[0].toUpperCase() + p.phrase.slice(1)}" is spending money after rent, priced as in {p.city}, plus what you
            save. Spending money is local; saved money isn't:
          </p>
          <p className="formula">
            (take-home − planned savings − rent − out-of-pocket health costs) × {p.place} ÷ city non-housing prices
            <br />+ planned savings + your 401(k) and HSA + vested employer 401(k) + employer HSA + perks
          </p>
          <p>
            It ties to total rewards: total rewards − rent + ({p.place} ÷ city prices − 1) × (spending − out-of-pocket). At a price
            factor of 1 (an offer {p.us ? "in a city priced at the U.S. average" : `in ${p.place}`}) with no rent, it equals total rewards. It's
            much lower than a salary on purpose: it's what's left after tax and rent. The place is yours to pick (<Ref id="M-6.1" />).
          </p>
          <YearOne ctx={ctx} sample={sample} />
        </Section>
        <Section id="M-6.4">
          <ul>
            <li>Prices are BEA's 2024 levels, held for every year; only rent grows.</li>
            <li>One national weight for rent, though BEA weights each region differently.</li>
            <li>Price levels are metro-wide: the New York metro averages Manhattan with its suburbs.</li>
            <li>Commuter perks count at face value, though they buy local transit.</li>
          </ul>
        </Section>

        <Section id="M-7">
          <p>
            A dollar next year is worth less than a dollar today: you could invest today's dollar, and prices rise. Present value
            puts every payment, whenever it's paid, into today's dollars.
          </p>
        </Section>
        <Section id="M-7.1">
          <p>
            Each payment's after-tax cash is discounted from its date to today at {percent(ASSUMPTIONS.discountRate)} a year
            (about 2.4% after {percent(ASSUMPTIONS.inflation)} inflation): $1 paid in a year is worth ${(1 / (1 + ASSUMPTIONS.discountRate)).toFixed(4)} today,
            and $1 in four years about ${(1.05 ** -4).toFixed(2)}. So a bonus paid in your fourth year counts for less than the same
            sign-on paid in your first month. Tax is discounted with the payment it comes from. L-1 and the bridge show dollars as
            paid each year; the verdict and the rank list are present values.
          </p>
        </Section>
        <Section id="M-7.2">
          <p>
            A figure a month is easier to feel than a present-value total. The monthly figure is the level amount, paid at the
            end of each month of your stay, that's worth the same today as the present-value gap. Here's the verdict's own
            arithmetic:
          </p>
          <PerMonth ctx={ctx} sample={sample} />
        </Section>
        <Section id="M-7.3">
          <p>
            Every offer is compared over the same stretch: from the earliest start date for the number of years you expect to
            stay. An offer that starts later has less pay inside it, which is the real cost of starting later: exactly the days it
            starts later, since its pay, benefits and rent count for each of its own days in the stretch, its last partial month
            included. Money paid before an offer's start date, such as relocation paid before day one, counts from the start date
            (it's taxed in the year it's paid). Pay after the stay isn't counted. The stay's last calendar year is still taxed as though you kept earning through December, as at a
            next job, so a short stay doesn't get an artificially low tax rate. Leaving at the end of the stay doesn't trigger
            clawbacks here; leaving early is <Ref id="M-9" />. The row under the verdict shows the winner for stays of 2 to 5 years.
          </p>
          <p>Today, the valuation date, is your device's date when the page loads.</p>
        </Section>
        <Section id="M-7.4">
          <p>
            L-3 asks what one change would tie an offer behind the winner: its starting salary, its first cash award (or, with none, a
            sign-on paid 30 days after the start, with no clawback), and on the after-rent basis its rent. Each changes one input and
            leaves the rest as entered. It's the base case, in present value over your stay, on the verdict's basis. Per hour can't be
            tied by one number, so on that basis L-3 ties the total per hour divides.
          </p>
          <p>
            The window is the rank list's: from the earliest start of every offer, for your stay (<Ref id="M-7.3" />). So the target is
            the winner's figure in the rank list, to the cent. Two offers compared over their own window would start later whenever a
            third offer starts first, and miss it.
          </p>
          <p>
            Salary and cash awards are found by search (bisection), to the cent. A dollar of salary adds less than a dollar to the
            total: tax takes part of it, later pay is discounted, and what scales with salary moves with it. Raises, promotions, a
            percent-of-salary bonus and the 401(k) match scale with it; a bonus entered in dollars or by year doesn't, and neither do
            RSUs, cash awards or perks. L-3 says which apply to each offer. A cash award is paid once and taxed that year, so it ties
            dollar for dollar less that tax, discounted to its date.
          </p>
          <p>
            Rent is worked out directly, since the after-rent total is linear in rent (<Ref id="M-6.3" />): each $1 of rent is $1 less to
            spend there, worth that city's price factor at {p.place} prices. Rent's present-value factor is what $1 a month of first-year
            rent is worth over the months you'd work there in your stay, rising at each lease anniversary.
          </p>
          <p className="formula">
            rent that ties = rent now − (winner's total − the offer's total) ÷ ({p.place} ÷ city non-housing prices × rent's present-value
            factor)
          </p>
          <p>
            The lead schedule uses the same figure, worked out from your stay's projections on every edit: when you've entered an
            offer's rent and the rent that would flip the verdict lies between it and the estimate (HUD's Fair Market Rent, <Ref id="M-6.2" />),
            it says so under the verdict ("This depends on rent: at HUD's estimate for New York ($2,729), A wins"). Each such rent is
            taken on its own, with the other offers' rents as entered.
          </p>
          <p>
            Rent is the softest input, and often an estimate, so this says how much the verdict leans on it. The winner's cushion runs
            the other way, against the runner-up: how far its starting salary could fall, whether it would still lead without its
            sign-on, and the rent at which its lead would go. When the verdict's lead is under 3% of the winner's value, a close call
            (<Ref id="M-7.2" />), the lead schedule says how much more starting salary the runner-up would need to tie. These are what
            it would take to tie, not advice on what to ask for.
          </p>
          <WhatItWouldTake ctx={ctx} sample={sample} />
        </Section>

        <Section id="M-8">
          <p>
            Uncertain inputs (bonus, raises, share price, refreshers, promotions) can have a bear, base and bull value. The three
            are joint scenarios: the bear case sets every uncertain input to its bear value at once, a coherent bad story rather
            than the worst case. The verdict uses the base case. L-2, If things go badly, shows all three for your stay: which offer
            holds up best, who wins each, and which of your inputs differ in the bear case. An offer without a range shows one value
            and says so, rather than looking safe.
          </p>
          <Scenarios ctx={ctx} sample={sample} />
        </Section>

        <Section id="M-9">
          <p>
            A leave date is your last day of work. It stops salary; bonuses not yet paid are forfeited; RSUs that haven't vested are
            forfeited; unvested employer 401(k) money is lost. Sign-ons and other awards may be clawed back: in full or prorated by
            months worked, inside a window from your start date, and repaid gross by default.
          </p>
          <p>
            A forfeited bonus is counted as what you'd earned toward it by your last day: the bonus for the days (or the salary) worked
            in its period so far, beside what it pays if you stay through the payout. Leaving twelve days into a year forfeits twelve
            days' worth, not the whole bonus; a period with no days worked isn't counted at all. A first period that began before your
            start counts from your start, as its payout does. An offer that pays bonuses prorated to your last day (Bonus › must be
            employed on the pay date: no) pays the earned part instead of forfeiting it.
          </p>
          <p>
            A repayment in the same calendar year reverses the wages, so its tax comes back exactly. A repayment in a later year over
            $3,000 gets the federal IRC 1341 credit; Social Security and Medicare on it usually aren't refunded, and state relief
            isn't modeled. Layoffs, severance and waived clawbacks aren't modeled: the leave date is a voluntary exit.
          </p>
          <p>
            L-4, Leaving early, shows what you keep for any last day, as paid: each offer's curve by calendar date, so offers that
            start on different days line up, with a step on the day of each payment, vest or clawback step. A prorated clawback's
            monthly steps are drawn as one segment. For the last day you pick it shows what you keep, repay and leave behind, and the
            next cliff (a payment, a vest, a full clawback's end, 401(k) money vesting; not a prorated clawback's monthly step) with
            what staying until it is worth. On your stay's last day it squares leaving then with the stay: the stay taxes its last
            year as though pay continued through December (<Ref id="M-7.3" />), so leaving that day keeps a little more after tax.
          </p>
          <LeavingEarly ctx={ctx} sample={sample} />
        </Section>

        <Section id="M-10">
          <p>Where the numbers are simplified or incomplete, in rough order of how much they matter:</p>
          <h3 className="method-sub">Taxes</h3>
          <ul>
            <li>Where you'd live is where you're taxed, for the whole year. Moving mid-year, working in a different state, and
              New York's rule that can tax remote workers for a New York employer aren't computed (the last one gets a warning).</li>
            <li>Maryland county, Ohio city and Pennsylvania local wage taxes aren't included unless entered.</li>
            <li>No dependents or credits such as the child tax credit or EITC, and no alternative minimum tax. Head of household
              uses single filers' state rules.</li>
            <li>State law after 2026 is held at 2026 rules except California's indexing; states that index by law may be
              overstated by about $15–20 a year at first, growing over time. Scheduled state rate cuts aren't applied.</li>
            <li>Small state gaps: Vermont's brackets (up to about $150), Oregon and North Dakota indexing, low-income credits in
              Connecticut, Arkansas, Maine, New Mexico, Hawaii and Minnesota, Colorado's sales-tax refund, Alaska's dividend.</li>
            <li>California and New Jersey tax HSA contributions; we don't.</li>
            <li>After 2027, the last year published, the Social Security wage base grows with inflation here, though it really tracks
              wages.</li>
          </ul>
          <h3 className="method-sub">Where you'd live and work</h3>
          <ul>
            <li>You're taxed as a resident of where you'd live, for the whole year. Tax a city levies on people who work there but live
              elsewhere, such as Philadelphia's wage tax on nonresidents (3.425%), isn't counted.</li>
          </ul>
          <h3 className="method-sub">Pay and benefits</h3>
          <ul>
            <li>RSUs are assumed sold at vest; options and private-company equity count as $0.</li>
            <li>Totals are tax owed; withholding (what's taken from each paycheck) is estimated for federal income tax only.</li>
            <li>The 401(k) has no catch-up contributions, growth or tax on withdrawal.</li>
            <li>Health costs are held flat; the HSA limit isn't prorated for a partial year.</li>
            <li>Your spouse's wages (filing jointly) are the same for every offer, growing with inflation from the year you enter.</li>
          </ul>
          <h3 className="method-sub">Cost of living and leaving</h3>
          <ul>
            <li>Prices stay at 2024 levels; rent grows at one rate per offer.</li>
            <li>Rent estimates are metro-wide 40th-percentile rents; ZIP-level estimates are planned.</li>
            <li>Layoffs, severance and waived clawbacks aren't modeled.</li>
          </ul>
        </Section>

        <Section id="M-11">
          <table className="method-table sources">
            <thead><tr><th scope="col">Source</th><th scope="col">What it gives</th><th scope="col">Vintage</th></tr></thead>
            <tbody>
              <tr><th scope="row">IRS Rev. Proc. 2025-32</th><td>Federal brackets, standard deductions and inflation adjustments, including
                the One Big Beautiful Bill Act's changes (Pub. L. 119-21); the commuter limit</td><td>Tax year 2026</td></tr>
              <tr><th scope="row">IRC 164(b)(7), as added by Pub. L. 119-21 §70120</th><td>The SALT cap: $40,400 in 2026, phased down above
                $505,000, $10,000 from 2030</td><td>Statute</td></tr>
              <tr><th scope="row">IRS Notice 2025-67; Rev. Proc. 2025-19</th><td>401(k) deferral limit ($24,500); HSA limits</td><td>2026</td></tr>
              <tr><th scope="row">IRS Rev. Proc. 2026-24</th><td>HSA limits ($4,500 self-only, $9,000 family)</td><td>2027</td></tr>
              <tr><th scope="row">SSA 2026 and 2027 COLA fact sheets; IRC 3101(b)(2)</th><td>Social Security wage base ($184,500; $192,300
                in 2027) and rates; Additional Medicare Tax</td><td>2026, 2027</td></tr>
              <tr><th scope="row">Tax Foundation, State Individual Income Tax Rates and Brackets, 2026</th><td>State brackets, deductions and
                exemptions; state payroll taxes</td><td>Data as of Feb 11, 2026</td></tr>
              <tr><th scope="row">State laws enacted after that table</th><td>
                <ul className="overrides">
                  <li>Arkansas: Act 1 of 2026 (1st Extraordinary Session), A.C.A. 26-51-201</li>
                  <li>California: 2026 indexed brackets, deduction and credit, Cal. Rev. &amp; Tax. Code 17041, 17054</li>
                  <li>Georgia: HB 463 (2025–26), O.C.G.A. 48-7-20 and 48-7-27</li>
                  <li>Hawaii: 2026 standard deduction under Act 46 (SLH 2024)</li>
                  <li>Maine: 2026 standard deduction under P.L. 2025 c. 650; phase-out under 36 M.R.S. 5124-C</li>
                  <li>Ohio: HB 96 schedule</li>
                  <li>South Carolina: Act 110 of 2026 (H.4216); SCDOR Information Letter #26-20</li>
                  <li>Utah: SB 60 (2026), Utah Code 59-10-104</li>
                  <li>West Virginia: W. Va. Code 11-21-4j</li>
                  <li>District of Columbia: decoupled from the federal deduction increase (2025 D-40 instructions)</li>
                </ul>
                Most were read as modeled in PolicyEngine-US.</td><td>2026</td></tr>
              <tr><th scope="row">NYS IT-201 instructions; City of Philadelphia Department of Revenue, Wage Tax rates</th><td>New York City and Philadelphia
                resident tax</td><td>2026</td></tr>
              <tr><th scope="row">BEA Regional Price Parities (MARPP, PARPP, SARPP)</th><td>Price levels for every metro area, state and
                state nonmetro area</td><td>{DATA_YEARS.rpp}, released Feb 19, 2026</td></tr>
              <tr><th scope="row">BEA, Survey of Current Business, March 2022</th><td>Housing rents' 16% share of the price weights</td><td>2022</td></tr>
              <tr><th scope="row">HUD Fair Market Rents</th><td>Rent estimates: 40th-percentile gross rent for recent movers
                (24 CFR 888.113)</td><td>FY{DATA_YEARS.fmr}, published Aug 26, 2026, effective Oct 1, 2026</td></tr>
              <tr><th scope="row">Census ACS 1-year, table B25064</th><td>U.S. median gross rent, $1,487 (±$3): the anchor where HUD has
                no figure</td><td>2024</td></tr>
              <tr><th scope="row">IRS Pub. 15 and 15-T</th><td>Supplemental withholding (22%, 37% over $1 million) and the percentage method</td><td>2026</td></tr>
              <tr><th scope="row">PolicyEngine-US</th><td>Validation of the tax engine (<Ref id="M-4" />)</td><td>Version 2.30.3</td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="M-12">
          <Assumptions ctx={ctx} sample={sample} />
        </Section>

        <Section id="M-13">
          <p>
            Every figure carries an audit tickmark, as on an auditor's workpaper. Click (or tap) any figure or its mark to see
            how it was worked out: the derivation with your values, each part with its own mark so you can keep tracing, and the
            figures it uses highlighted on the page. On a keyboard, Tab reaches each schedule and the arrow keys move between its
            figures; Enter opens one and Escape closes it.
          </p>
          <p>
            For a cleaner read, "Hide tickmarks" at the foot of the page hides the marks: each figure keeps a dotted underline and still
            opens its work. The inputs' D and E stay, since a default or an estimate always says so. A table's CSV has each figure's mark
            in a column beside it, and the marks print, with each schedule's legend.
          </p>
          <table className="method-table ticks">
            <tbody>
              {([
                ["recomputed", "Recomputed from other figures; opens the arithmetic."],
                ["footed", "The total of the lines above it."],
                ["crossFooted", "Ties to the same figure on another schedule: L-6's stay to L-1's, its present value to the rank list."],
                ["traced", "Something you entered, a sample input, or published data (IRS, BEA, HUD, Census)."],
                ["default", "A default you haven't changed, with the reason for it."],
                ["estimate", "Estimated, not entered: a rent you can replace with yours."],
              ] as Array<[TickKind, string]>).map(([k, text]) => (
                <tr key={k}><th scope="row"><span className="tick">{TICKS[k].mark}</span> {TICKS[k].name}</th><td>{text}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 className="method-sub">Rounding: every column adds up as shown</h3>
          <p>
            Figures are shown to the dollar, and payments to the cent. A figure is rounded once, where it's worked out: a
            year's salary is its payments, each to the cent, added and then rounded; its tax likewise. A total is the figures
            above it as shown, added, so every column on a schedule adds up as you see it, and a figure shown in two places is the
            same figure. A year's total can differ by a dollar or two from the unrounded figure rounded once (109,462 where the
            arithmetic before rounding has 109,462.63). In a calendar year's tax with the offer, the total is the tax without it
            plus the offer's tax, and the federal income tax, the largest line, takes the rounding, as on a rounded schedule; its
            work shows the unrounded figure. Present values aren't sums of the years (each payment is discounted from its date),
            so they're worked out before rounding, and L-6 ties each to the rank list; in a present value's own work, one line takes
            the rounding (the tax, the largest benefit, or the money saved at face value), so its column adds up too.
          </p>
          <p>
            Every Show the work works out exactly as displayed: each "=" is the arithmetic of the figures above it, as shown,
            rounded as the result is shown. A gap between two totals is the totals as shown, subtracted; "a month" is that gap ÷ the
            annuity factor as shown, rounded once, in the verdict, the stays row, L-2 and the copied document alike. The rent that
            ties an offer (L-3) is worked from the figures shown in the same way. Where a division needs more decimals to work out
            (hours, an index, a rate), they're shown.
          </p>
        </Section>
      </article>
    </div>
    </Place.Provider>
  );
}

/** The place picked under Prices in: M-6.3's title names it. */
const Place = createContext("U.S.");

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const place = useContext(Place);
  const sub = id.includes(".");
  const Heading = sub ? "h3" : "h2";
  return (
    <section id={sectionAnchor(id)} className={`method-section${sub ? " is-sub" : ""}`} aria-labelledby={`${sectionAnchor(id)}-h`}>
      <Heading id={`${sectionAnchor(id)}-h`} tabIndex={-1}><span className="ref">{id}</span> {sectionTitle(id, place)}</Heading>
      {children}
    </section>
  );
}

/**
 * M-6.1's example: the first of your offers priced apart from the place picked, or New York against the U.S. average before
 * there's a comparison.
 */
function PriceExample({ ctx }: { ctx: WorkContext }) {
  const p = pricesOf(ctx);
  const goods = p.us ? "U.S.-average goods" : `${p.place} goods`;
  const info = ctx.results?.detail?.offers.map((o) => o.costOfLiving).find((c) => c && c.area.code !== c.reference.code);
  if (!info) {
    return p.us ? <>New York's are about 5.8% above the U.S. average, so a dollar spent there buys about $0.945 of U.S.-average goods.</>
      : <>a city whose prices are 5% above {p.average} restates each dollar spent there as about $0.952 of {goods}.</>;
  }
  const above = 1 / info.nonHousingFactor - 1;
  return (
    <>{shortCity(info.area.name)}'s are about {(Math.abs(above) * 100).toFixed(1)}% {above >= 0 ? "above" : "below"} {p.average}, so a dollar spent
      there buys about ${info.nonHousingFactor.toFixed(3)} of {goods}.</>
  );
}

const Ref = ({ id }: { id: SectionId }) => <a href={`#/method/${id}`}>{id}</a>;

const Illustrative = ({ sample }: { sample: boolean }) => (sample ? <span className="stamp">Example (illustrative)</span> : null);

function Live({ children }: { children: ReactNode }) {
  return <div className="method-live">{children}</div>;
}

/** M-1: one offer's year 1, from the letter to after rent. */
function PipelineExample({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  if (!r?.detail || r.detail.years !== r.view.row.years) return null;
  const letter = r.letters[0];
  try {
    const b = bridge(ctx, letter, 1);
    const at = (line: string) => b.rows.find((x) => x.line === line)?.value;
    const steps: Array<[string, number | undefined]> = [
      ["the offer letter", at("letter")], ["paid in year 1", at("paid")], ["after tax", at("afterTax")],
      ["total rewards", at("totalRewards")], [pricesOf(ctx).phrase, at("total")],
    ];
    return (
      <Live>
        <p className="live-head">Your numbers: {letter}, year 1 <Illustrative sample={sample} /></p>
        <p>{steps.filter(([, v]) => v !== undefined).map(([k, v]) => `${k} ${dollars(v!)}`).join(" → ")}.
          The bridge under L-1 shows every line. <a href="#/">See it on the comparison</a></p>
      </Live>
    );
  } catch {
    return null;
  }
}

/** M-6.3: each offer's year 1 after rent, at the prices picked. */
function YearOne({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  if (!r?.detail) return null;
  // As shown in L-1, the bridge and L-6 (footing.ts).
  const rows = r.letters.flatMap((l, i) => {
    const y = shownYears(r.detail!.offers[i])[0];
    return y?.col ? [[l, y.col.total] as [Letter, number]] : [];
  });
  if (!rows.length) return null;
  return (
    <Live>
      <p className="live-head">Your numbers, year 1, {pricesOf(ctx).phrase} <Illustrative sample={sample} /></p>
      <p>{rows.map(([l, v]) => `${l} ${figure(v)}`).join(" · ")}</p>
    </Live>
  );
}

/** M-7.2: the verdict's per-month figure, worked with its own numbers. */
function PerMonth({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  if (!r) return <p className="method-note">Fill in two offers to see this worked with your numbers.</p>;
  const basis: ValueBasis = r.view.basis === "perHour" ? "colAdjustedTotal" : r.view.basis;
  const row = r.view.row;
  const lead = row.leads[basis];
  const values = row.values[basis];
  if (!lead || !values || lead.perMonth === undefined) return null;
  const W = r.letters[lead.winner];
  const R = r.letters[lead.runnerUp];
  const months = 12 * row.years;
  const gap = values[lead.winner] - values[lead.runnerUp];
  const terms = r.detail?.annuity[row.years];
  return (
    <Live>
      <p className="live-head">The verdict, {basisPhrase(pricesOf(ctx))[basis]}, stay {row.years} years <Illustrative sample={sample} /></p>
      <table className="method-table work-like">
        <tbody>
          <tr><th scope="row">{W}'s {row.years}-year total, present value</th><td>{figure(values[lead.winner])}</td></tr>
          <tr><th scope="row">− {R}'s</th><td>{figure(values[lead.runnerUp])}</td></tr>
          <tr className="rule-single"><th scope="row">= Present-value gap</th><td>{figure(gap)}</td></tr>
          <tr><th scope="row">÷ Annuity factor: {months} month-ends at {percent(r.sweep.discountRate)} a year</th><td>{row.annuityFactor.toFixed(4)}</td></tr>
          <tr className="rule-double"><th scope="row">= A month, for {months} months</th><td>{dollars(lead.perMonth)}</td></tr>
        </tbody>
      </table>
      <p>
        Why not {dollars(gap)} ÷ {months} = {dollars(gap / months)}? Because later dollars are worth less today: a payment at the
        end of month {months} counts for about ${terms?.length ? terms[terms.length - 1].factor.toFixed(2) : (1.05 ** -row.years).toFixed(2)} on
        the dollar. So the level amount worth {dollars(gap)} today has to be larger, {dollars(lead.perMonth)} a month.
      </p>
      <p>
        The annuity factor is what $1 at the end of each month of the stay
        {terms?.length ? ` (${longDate(terms[0].date)} to ${longDate(terms[terms.length - 1].date)})` : ""} is worth today,{" "}
        {longDate(r.sweep.valuationDate)}: each is discounted by (1 + {percent(r.sweep.discountRate)})^−(days from today ÷ 365.25), and the {months} values
        are added up. If every offer were paid evenly each month, the monthly figure would be exactly the difference in their
        monthly pay; with uneven pay (a sign-on now, bigger bonuses later) it's the even amount worth the same today.
      </p>
      <p className="method-note">
        Stay {row.years} years: {longDate(row.window.start)} – {longDate(dayBefore(row.window.end))}. Discount rate{" "}
        {percent(r.sweep.discountRate)} a year.
      </p>
    </Live>
  );
}

/** M-8: each offer's bear, base and bull cases over your stay, and what differs in the bear case. */
function Scenarios({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  if (!r?.detail || r.detail.years !== r.view.row.years) return <p className="method-note">Fill in two offers to see this with your numbers.</p>;
  let v: ReturnType<typeof riskView>;
  try {
    v = riskView(ctx);
  } catch {
    return null;
  }
  const head = `${basisPhrase(pricesOf(ctx))[r.view.basis]}, ${v.years}-year ${v.perHour ? "per hour worked, nominal" : "total, present value"}`;
  if (!v.anyRange) {
    return (
      <Live>
        <p className="live-head">Your numbers, {head} <Illustrative sample={sample} /></p>
        <p>No ranges are entered, so each offer's bear, base and bull cases are the same. Add one in detailed mode (+ range) and L-2 shows them.</p>
      </Live>
    );
  }
  const fmt = (x: number) => (v.perHour ? cents(x) : figure(x));
  const rows = [...v.rows].sort((a, b) => a.letter.localeCompare(b.letter));
  return (
    <Live>
      <p className="live-head">Your numbers, {head} <Illustrative sample={sample} /></p>
      <table className="method-table">
        <thead><tr><th scope="col">Offer</th>{CASES.map((c) => <th key={c} scope="col">{c[0].toUpperCase() + c.slice(1)}</th>)}<th scope="col">In the bear case</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.letter}>
              <th scope="row">{x.letter}</th>
              {CASES.map((c) => <td key={c} className="num">{fmt(x.values[c])}</td>)}
              <td>{x.changes.length ? x.changes.map(changeText).join("; ") : x.ranged ? "nothing within your stay" : "no ranges entered"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{v.holdsUp} holds up best: it has the highest bear case. <a href="#/">See L-2 on the comparison</a></p>
    </Live>
  );
}

/** M-9: what leaving early would cost under your offers' terms, and L-4's panel when it has worked one out. */
function LeavingEarly({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  if (!r?.detail || r.detail.years !== r.view.row.years) return <p className="method-note">Fill in two offers to see this with your numbers.</p>;
  const leave = r.leave;
  return (
    <Live>
      <p className="live-head">Your offers, if you left early <Illustrative sample={sample} /></p>
      <ul className="method-list">
        {r.letters.map((letter, i) => {
          const app = ctx.offers.find((o) => o.letter === letter);
          const input = app ? toOfferInput(app) : null;
          const o = input && "offer" in input ? input.offer : null;
          const d = r.detail!.offers[i];
          if (!o) return null;
          const facts = leaveTerms(o, d);
          const p = leave?.panels[i];
          const lost = p ? forfeits(p.warnings, o.startDate).reduce((sum, f) => sum + f.earned, 0) : 0;
          return (
            <li key={letter}>
              <strong>{letter}</strong>: {facts.length ? `${facts.join("; ")}.` : "nothing is lost by leaving early beyond the pay itself."}
              {p && (
                <> At the last day picked in L-4, {longDate(p.leaveDate)}, it keeps {dollars(p.afterTaxCompKept)} after tax
                  {p.clawbackOwed >= 0.5 ? `, repays ${dollars(p.clawbackOwed)}` : ""}{lost >= 0.5 ? ` and forfeits ${dollars(lost)} earned toward bonuses` : ""}.</>
              )}
            </li>
          );
        })}
      </ul>
      <p>{leave ? "" : "L-4 works out what you'd keep for any last day. "}<a href="#/">See L-4 on the comparison</a></p>
    </Live>
  );
}

/** M-7.4: L-3's numbers, once it has worked them out. */
function WhatItWouldTake({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  const t = r?.ties?.l3;
  if (!r || !t || t.rows.length < 2) {
    return <p className="method-note">L-3 works these out on the comparison, once it's on screen. <a href="#/">See the comparison</a></p>;
  }
  const offerOf = (i: number) => {
    const app = ctx.offers.find((o) => o.letter === r.letters[i]);
    const input = app ? toOfferInput(app) : null;
    return input && "offer" in input ? input.offer : null;
  };
  const W = r.letters[t.rows[0].against];
  const cushion = t.rows[t.rows.length - 1];
  return (
    <Live>
      <p className="live-head">Your offers, to tie {W}, {basisPhrase(pricesOf(ctx))[t.basis]} <Illustrative sample={sample} /></p>
      <ul className="method-list">
        {t.rows.slice(0, -1).map((row) => {
          const o = offerOf(row.offer);
          const L = r.letters[row.offer];
          if (!o) return null;
          const parts = [
            row.salary.outcome === "tie" ? `a starting salary of ${dollars(row.salary.to)} (${tieChangeText(row.salary)})` : null,
            row.cash?.outcome === "tie" ? `${cashLever(o).added ? "a new sign-on" : cashLever(o).name} of ${dollars(row.cash.to)}` : null,
            row.rent?.outcome === "tie" ? `rent under ${dollars(row.rent.to)} a month` : row.rent?.outcome === "rentFree" ? "no rent would do it" : null,
          ].filter(Boolean) as string[];
          return <li key={L}><strong>{L}</strong>: {parts.join("; or ")}.</li>;
        })}
        <li>
          <strong>{W}</strong>, against {r.letters[cushion.against]}:{" "}
          {cushion.salary.outcome === "tie" ? `its salary could fall to ${dollars(cushion.salary.to)}` : "it leads even at a $0 salary"}
          {cushion.cash ? (cushion.cash.outcome === "tie" ? `; it needs ${dollars(cushion.cash.to)} of its ${cashLever(offerOf(cushion.offer)!).label}`
            : "; it leads without its sign-on") : ""}
          {cushion.rent?.outcome === "tie" ? `; its lead goes above ${dollars(cushion.rent.to)} a month of rent` : ""}.
        </li>
      </ul>
      <p><a href="#/">See L-3 on the comparison</a></p>
    </Live>
  );
}


/** M-12: each offer's live assumptions, in words. */
function Assumptions({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  return (
    <>
      <p>
        Everywhere: inflation {percent(ASSUMPTIONS.inflation)} a year (tax law and rent growth, never pay); discount rate{" "}
        {percent(ASSUMPTIONS.discountRate)}; present values as of today, {longDate(ctx.today)}; health usage {ctx.household.healthUsage ?? "medium"};
        no savings beyond the 401(k); prices in {pricesOf(ctx).dollars}; base case.
      </p>
      {!r?.detail ? <p className="method-note">Fill in two offers to see each one's assumptions.</p> : r.letters.map((l, i) => {
        const offer = ctx.offers.find((o) => o.letter === l);
        return (
          <div key={l} className="method-assumptions">
            <h4><span className={`who offer-${l}`}>{l}</span>{offer?.draft.label ? ` · ${offer.draft.label}` : ""}{" "}
              {offer?.sample && sample ? <span className="stamp">Sample</span> : null}</h4>
            <ul>{r.detail!.offers[i].assumptions.map((a, k) => <li key={k}>{formatAssumption(a)}</li>)}</ul>
          </div>
        );
      })}
    </>
  );
}
