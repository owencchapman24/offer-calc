import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { DATA_YEARS } from "../../src/col/cities";
import { formatAssumption } from "../../src/format/index";
import type { Assumption, ValueBasis } from "../../src/offer/types";
import { ownView } from "./breakdownModel";
import { bonusTerms, centsText, hundredOf, A2_LABEL } from "./partsModel";
import type { Breakdown } from "./protocol";
import { CASES, changeText, riskView } from "./cases";
import { cashLever, changeText as tieChangeText } from "./breakevenModel";
import { shownYears } from "./footing";
import { forfeits, leaveTerms } from "./leaveModel";
import { ASSUMPTIONS, type Letter, toOfferInput } from "./model";
import { basisPhrase, pricesOf, shortCity, type WorkContext } from "./metrics";
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
            How every figure is worked out, with your numbers where they help: for each offer on its own, and for offers compared.
            We work out money, time and prices; which job fits your career is yours to judge. Nothing here is financial advice.{" "}
            <a href="#/">Back to your offers</a>
          </p>
          <p className="method-version">
            Engine {ENGINE_VERSION} · tax law 2026, later years projected · prices: BEA Regional Price Parities {DATA_YEARS.rpp} ·
            rents: HUD Fair Market Rents FY{DATA_YEARS.fmr}
          </p>
        </header>

        <Section id="M-1">
          <p>
            Every offer runs one pipeline, left to right, and gets a breakdown of its own: what it would leave you with, worked out
            over your stay from its own start date, whatever other offers you add. Its references are its letter and a part: A-1 is
            offer A's bottom line, A-2 where its money goes, A-3 its pay by year and when it arrives, A-4 the terms that can bite, A-5
            what its benefits are worth, A-6 its tax and warnings, and A-7 the work behind every figure; B-1 is offer B's bottom line.
          </p>
          <ol className="pipeline-list">
            <li><strong>Gross pay</strong>: salary, bonuses, cash awards such as a sign-on, and RSUs as they vest.</li>
            <li><strong>After tax</strong>: gross pay minus federal, Social Security and Medicare, state and local tax, and your health
              premiums (<Ref id="M-4" />).</li>
            <li><strong>+ Benefits (total rewards)</strong>: plus the employer 401(k) money you'd keep, perks and employer HSA money,
              minus the health costs you'd pay out of pocket (<Ref id="M-5" />).</li>
            <li><strong>− Rent (after rent, at the offer's own prices)</strong>: minus rent. What's left is what you'd have where
              you'd live: money to spend there, plus what you save, in that city's dollars. It's total rewards less rent. An offer's
              bottom line is this, a month over your stay in today's dollars (<Ref id="M-7.2" />), split into what's left to spend
              and what's saved.</li>
            <li><strong>Per hour</strong>: the step-4 total, as paid, divided by the hours you'd work (<Ref id="M-5.4" />).</li>
          </ol>
          <h3 className="method-sub">Comparing offers</h3>
          <p>
            A dollar doesn't buy the same things in every city, so offers set side by side are restated at one place's prices:
            {" "}{p.name}, unless you pick a city under Prices in. What's left to spend after rent is priced as in {p.city}; what
            you save counts at face value (<Ref id="M-6.1" />, <Ref id="M-6.3" />). That's the comparison's one extra step, "− Rent
            &amp; prices" in the lead schedule's pipeline, whose steps are each a basis you can pick, each with its own winner;
            "{p.phrase}" is the default verdict. Wherever offers sit together (the verdict, the rank list, the ledger's "On its own"
            row, L-1 to L-4) their figures are in these common dollars, and each says so. An offer's own breakdown stays in its own
            city's dollars, and where it's restated, the step sits beside it: its own city's figure, less (or plus) that city's
            prices, equals its figure in {p.dollars}.
          </p>
          <p>
            Every payment and vest is a dated event. Tax is worked out per calendar year, the way the law works; the events are
            then grouped into employment years (year 1 is your first 12 months) for the breakdown's years (A-2's bridge, A-3) and L-1,
            and summed over a stay for the bottom line and the verdict. All of these come from the same events, so they reconcile:
            the bridge's year-1 total is the chart's year 1, and the years add up to your stay. Each offer's A-7, The work, lists them
            all: each year line by line, every payment with its formula and tax, and each calendar year's tax with and without the
            offer.
          </p>
          <PipelineExample ctx={ctx} sample={sample} />
        </Section>

        <Section id="M-1.1">
          <p>
            A-2 takes a year's pay, as paid, and says where each $100 of it goes: tax (<Ref id="M-4" />), rent (<Ref id="M-6.2" />),
            health costs (your premiums and the out-of-pocket costs you expect, <Ref id="M-5.2" />), saved (your 401(k) and HSA, and
            your planned savings) and what's left to spend. Each part is the year's figure as shown ÷ the year's pay as shown, to the
            cent, and what's left to spend takes the rounding, so the five add to $100.00. Each share names its year: "$27.27 of each
            $100 of year-1 pay". A year where rent and the rest take more than it pays shows what's left to spend below zero, in
            parentheses.
          </p>
          <p>
            The employer's money isn't paid to you, so it's outside the $100: its 401(k) money (and how much of it has vested by the
            end of your stay, <Ref id="M-5.1" />), its HSA money and perks. Under the $100, the bridge goes from the offer letter to
            after rent at the offer's own prices, line by line, and with a comparison on to the prices picked (<Ref id="M-6.3" />).
          </p>
          <Hundred ctx={ctx} sample={sample} />
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
            The bridge, in each offer's A-2, starts from what an <strong>offer letter</strong> quotes for a year: the salary at the year's start,
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
            <strong>An employee stock purchase plan</strong> (ESPP, under IRC 423) puts a percent of each eligible paycheck aside,
            after tax and without interest, and buys company stock with it at the end of each offering: at a discount off the
            purchase day's share price, or with a lookback off the lower of the offering's first day's and the purchase day's (at
            most 15% off, IRC 423(b)(6)). Offerings run back to back from the plan's date, and you join the first that starts on
            or after your start date. A plan can't buy more than $25,000 of stock a year, valued at each offering's first day
            (IRC 423(b)(8)); what's over it comes back in cash at the purchase. Each lot is counted as sold the day it's bought:
            holding shares after purchase is an investment decision and isn't modeled. So its gain, the shares' value less what
            bought them, is pay that day: wages for income tax (W-2 box 1) but not for Social Security, Medicare or the state
            payroll taxes that follow them (IRC 3121(a)(22)), and nothing is withheld on it (IRC 421(b)). The share price moves
            at the growth you enter for RSUs. Money in the plan is yours: it's out of take-home pay and counts at face value until it
            buys shares, a share of each $100 of its own ("in the ESPP"), not saved; if you leave before a purchase, it comes back that
            day, without a gain.
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
            statutory schedule (101% a year through 2029, $10,000 from 2030). Where a later year's amount has already been
            published, it's used as published and projected on from there: so far, the 2027 HSA limits ($4,500 self-only, $9,000
            family; the IRS's Rev. Proc. 2026-24) and the 2027 Social Security wage base ($192,300; the Social Security
            Administration, October 14, 2026). State law is held at 2026 rules, except California, which indexes by statute, and
            amounts tied to federal ones.
          </p>
          <p>
            <strong>The effective tax rate.</strong> A-1 and A-6 state an offer's tax as a share of its pay: the offer's tax over your
            stay (A-1) or a calendar year (A-6), worked out as above, with the offer less without it, ÷ its pay, both as paid. It's an
            average over all its pay, so it's lower than your top rate, the rate on your last dollar: the first dollars are taxed in
            the low brackets, or not at all under the standard deduction. A-6 splits each year's tax by kind (federal income tax,
            Social Security and Medicare, state, local), each the household's with the offer less without it; federal income tax, the
            largest, takes the rounding, so the kinds add to the tax as shown.
          </p>
          <p>
            <strong>What you owe, not what's withheld.</strong> Totals are the tax you owe. Employers withhold bonuses and RSU vests at
            a flat 22%, often less than you owe, so a balance can come due in April: each offer's A-6 says when federal withholding falls
            short by $1,000 or more in a year, and by how much. State, other jobs' and a spouse's withholding aren't estimated.
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
              <tr><th scope="row">Federal income tax, single, $60k–$200k</th><td>50 of 51 within $5. Alaska is $120–$240 lower: PolicyEngine
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
            Hours are weekly hours times the weeks worked, prorated for a partial year and counted only inside your stay. The weeks
            come from the days off you enter, in workdays: 52 − (vacation days you'd take + paid holidays + sick days you'd take) ÷ 5.
            The defaults are BLS's averages for private industry, 11 vacation days after a year's service and 8 paid holidays, and
            no sick days, since how many you'd take is personal: 52 − 19 ÷ 5 = 48.2 weeks. With an unlimited vacation policy, enter
            the days you expect to take. A-5 shows what the starting salary pays a year for those days (days × salary ÷ 260), as
            context: salary already counts it. Per hour is the step-4 total, after rent, as paid, divided by those hours: in an offer's breakdown at its own
            prices, and in the comparison {p.phrase} (<Ref id="M-6.3" />). It isn't discounted, and it's a lens rather than the
            verdict: hours are the softest input, and people trade hours for experience on purpose.
          </p>
        </Section>
        <Section id="M-5.5">
          <p>
            When two offers' hours differ by at least 100 hours a year (about 2 a week), the lead schedule says what the extra hours
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
          <p>
            <strong>At an offer's own prices.</strong> An offer's own breakdown is priced in its own city: a price factor of 1, so the
            identity above is simply total rewards − rent, in that city's dollars. That's what A-1's bottom line and A-2's bridge end
            at: what you'd actually have where you'd live, with nothing converted. Restating it at {p.place} prices is the comparison's
            step, and it's shown beside it, never in its place: A-1's line "in the comparison", and the bridge's price line.
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
            sign-on paid in your first month. Tax is discounted with the payment it comes from. L-1, A-2's bridge and A-3 show dollars
            as paid each year; the verdict, the rank list and A-1's months are present values.
          </p>
        </Section>
        <Section id="M-7.2">
          <p>
            A figure a month is easier to feel than a present-value total. The monthly figure is the level amount, paid at the
            end of each month of a stay, that's worth the same today as a present value: an offer's bottom line over its own stay
            (A-1), or the verdict's gap over the comparison's. It's the present value as shown ÷ the annuity factor as shown,
            rounded once. In a bottom line, the total and what's saved are each worked out so, and what's left to spend is the
            total less what's saved. Here it is with your numbers:
          </p>
          <PerMonth ctx={ctx} sample={sample} />
        </Section>
        <Section id="M-7.3">
          <p>
            An offer's breakdown runs over its own stay: from its own start date, for the number of years you expect to stay. So
            adding, changing or removing another offer never changes it.
          </p>
          <p>
            Offers compared are compared over the same stretch: from the earliest start date for the number of years you expect to
            stay. An offer that starts later has less pay inside it, which is the real cost of starting later: exactly the days it
            starts later, since its pay, benefits and rent count for each of its own days in the stretch, its last partial month
            included. Money paid before an offer's start date, such as relocation paid before day one, counts from the start date
            (it's taxed in the year it's paid). Pay after the stay isn't counted. The stay's last calendar year is still taxed as though you kept earning through December, as at a
            next job, so a short stay doesn't get an artificially low tax rate. Leaving at the end of the stay doesn't trigger
            clawbacks here; leaving early is <Ref id="M-9" />. The row under the verdict shows the winner for stays of 2 to 5 years.
            For an offer that starts on the earliest date, its breakdown and its place in the comparison cover the same stretch; for
            one that starts later, the comparison's stretch holds fewer of its days, so its figures there are smaller by those days.
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
            than the worst case. The verdict uses the base case. Each offer's A-4 states its bear and bull cases a month over your stay,
            and which of its inputs differ in the bear case; L-2, If things go badly, sets the offers side by side: which holds up best,
            and who wins each case. An offer without a range shows one value and says so, rather than looking safe.
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
            <strong>Unused vacation.</strong> Where the offer gives more vacation days than you'd take, the difference banks, accrued
            and used evenly through each year, up to any cap you enter; an unlimited policy banks nothing. Leaving pays what's banked
            at the salary on your last day ÷ 260 (52 weeks of 5 days), as wages with Social Security and Medicare, on that day: where
            the law of the employer's state requires it (California, Colorado, Illinois, Louisiana, Maine, Massachusetts, Montana,
            Nebraska, North Dakota, and Rhode Island after a year's service), or where you say the offer's policy pays it. Elsewhere the
            employer's policy decides, so it isn't counted unless you say. A stay isn't a leave date, so it moves only what you'd
            keep on a last day (A-4, L-4). In Rhode Island the first anniversary is a cliff.
          </p>
          <p>
            <strong>An offer's terms (A-4).</strong> Each offer's A-4 lists, in words, what leaving early or starting late can cost under
            its terms: when its first bonus is paid and whether you must be employed on the payout date, a start on or after a bonus
            cutoff, a guaranteed first payout, each cash award's clawback window, the first RSU vest, the employer 401(k) money's
            vesting, and unused vacation. Then every cliff inside its stay, dated by the first last day that keeps it, with what leaving the day before
            gives up, before tax; and the next cliff from its start (from today, once it has started), with what staying until it is
            worth after tax, as paid: what you'd keep leaving on the cliff's day, less what you'd keep leaving on its start. "If you
            left on" is L-4's panel for that offer, the same last day as L-4's.
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
            <li>Where you'd live is where you're taxed, for the whole year. Moving mid-year and working in a different state aren't
              computed, nor the rules that can tax you for working from home for an employer in another state: New York's, Delaware's
              and Pennsylvania's, and Connecticut's and New Jersey's for residents of states with such a rule. Where one could apply,
              the offer gets a warning.</li>
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
            <li>An ESPP's shares are taken as sold the day they're bought, so there's no holding period or capital gain. Offerings run
              one after another, with no reset when the price falls, no overlapping offerings, no cap on shares an offering and no
              fees; a plan outside section 423 isn't modeled. Its gain is left out of every state payroll tax and Philadelphia's wage
              tax, as from Social Security and Medicare: California's and Delaware's follow that, but Oregon's transit tax, and
              likely Washington's paid leave and long-term care, Rhode Island's disability insurance and Minnesota's paid leave,
              reach it, up to about $14 a $1,000 of gain. Pennsylvania's local earned income tax, if you enter it as a flat rate,
              leaves it out too, though it reaches it.</li>
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
            <li>Unused vacation follows the employer's state's law, taken as where you'd work (a fully remote job's is where you live,
              which isn't asked yet). It banks and is used evenly through the year; a policy that grants the year's days at once, or
              loses them at a year's end, isn't modeled. North Dakota lets an employer withhold it from someone who quits within a
              year with under five days' notice, if it said so at hire, and Maine exempts employers of 10 or fewer: neither is
              applied. An unlimited policy is taken to bank nothing, though in
              California one capped in practice has owed a payout (McPherson v. EF Intercultural Foundation, 2020).</li>
          </ul>
        </Section>

        <Section id="M-11">
          <table className="method-table sources">
            <thead><tr><th scope="col">Source</th><th scope="col">What it gives</th><th scope="col">Vintage</th></tr></thead>
            <tbody>
              <tr><th scope="row">IRS Rev. Proc. 2025-32</th><td>Federal brackets, standard deductions and inflation adjustments, including
                the One Big Beautiful Bill Act's changes (Pub. L. 119-21); the commuter limit</td><td>Tax year 2026</td></tr>
              <tr><th scope="row">BLS, National Compensation Survey: Employee Benefits in the United States, March 2026 (USDL-26-1534)</th>
                <td>The days-off defaults: 11 vacation days after a year's service; 8 paid holidays (2025)</td><td>March 2026</td></tr>
              <tr><th scope="row">State wage payment laws: Cal. Lab. Code §227.3; C.R.S. §8-4-101(14)(a)(III); 820 ILCS 115/5; La. R.S.
                23:631(D); 26 M.R.S. §626; M.G.L. c. 149 §148; Langager v. Crazy Creek Products, 1998 MT 44; Neb. Rev. Stat. §48-1229(6);
                N.D.C.C. §34-14-09.2; R.I. Gen. Laws §28-14-4(b)</th>
                <td>Which states require unused vacation to be paid when you leave</td><td>Read Oct 19, 2026</td></tr>
              <tr><th scope="row">IRC 421, 423 and 3121(a)(22); Treas. Reg. §1.423-2; IRS Pub. 525 and Pub. 15-B</th>
                <td>An ESPP: the discount and lookback, the 27-month offering, the $25,000 limit, the ordinary income on a sale at
                  purchase, and no FICA or withholding on it</td><td>Read Oct 2026</td></tr>
              <tr><th scope="row">NASPP and Deloitte Tax, 2023 Employee Stock Purchase Plan Survey; Fidelity Stock Plan Services, ESPP Data
                Analysis (2025)</th><td>An ESPP's defaults: 15% off (85% of plans), a lookback (83%), 6-month offerings (57%), one purchase
                  an offering</td><td>2023, 2025</td></tr>
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
            Each schedule has a reference, as on a workpaper: an offer's breakdown is its letter and a part (A-1, offer A's bottom
            line, to A-7, its work); the comparison's are L (the lead schedule) and L-1 to L-4; the methodology's are M-1 to M-13. L-5
            and L-6 aren't used any more: since stop 5B each offer's warnings and tables are in its A-6 and A-7. A printed page cites
            them the same way.
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
                ["crossFooted", "Ties to the same figure on another schedule: A-7's stay to L-1's, its present value to the rank list."],
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
            so they're worked out before rounding, and A-7 ties each to the rank list; in a present value's own work, one line takes
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

/** M-1: one offer's year 1, from the letter to after rent at its own prices, then restated at the prices picked. */
function PipelineExample({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const letter = (Object.keys(ctx.own?.breakdowns ?? {}) as Letter[]).sort()[0];
  const b = letter ? ctx.own!.breakdowns[letter] : undefined;
  const y = b ? shownYears(b.detail)[0] : undefined;
  const info = b?.detail.costOfLiving;
  if (!b || !y?.col || !info) return null;
  const place = shortCity(info.area.name);
  const own = y.totalRewards - y.col.rent;
  const p = pricesOf(ctx);
  const step = own - y.col.total;
  const steps: Array<[string, number]> = [
    ["the offer letter", y.quoted.letter], ["paid in year 1", y.gross], ["after tax", y.afterTax], ["total rewards", y.totalRewards],
  ];
  return (
    <Live>
      <p className="live-head">Your numbers: {letter}, year 1, as paid <Illustrative sample={sample} /></p>
      <p>
        {steps.map(([k, v]) => `${k} ${dollars(v)}`).join(" → ")} → after rent, at {place} prices, {dollars(own)} in {place} dollars.
        {info.area.code !== info.reference.code && (
          <> Restated at {p.place} prices for a comparison: {dollars(own)} in {place} dollars {step >= 0 ? "−" : "+"} {dollars(Math.abs(step))} for{" "}
            {place}'s {step >= 0 ? "higher" : "lower"} prices = {dollars(y.col.total)} in {p.dollars}.</>
        )}
      </p>
    </Live>
  );
}

/** M-1.1: the first offer's year 1, each $100 of its pay, as its A-2 shows it. */
function Hundred({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const letter = (Object.keys(ctx.own?.breakdowns ?? {}) as Letter[]).sort()[0];
  const b = letter ? ctx.own!.breakdowns[letter] : undefined;
  const h = b ? hundredOf(b.detail, 1) : null;
  if (!h) return null;
  return (
    <Live>
      <p className="live-head">Your numbers: {letter}-2, year 1 <Illustrative sample={sample} /></p>
      <p>
        Paid in year 1, {dollars(h.paid)}: {h.parts.map((q) => `${A2_LABEL[q.part]} ${figure(q.dollars)} (${centsText(q.cents)})`).join(", ")}, of each $100 of
        year-1 pay; {h.parts.map((q) => centsText(q.cents)).join(" + ")} = $100.00.
      </p>
    </Live>
  );
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

/** M-7.2: the verdict's per-month figure, worked with its own numbers; with one offer, its bottom line's. */
function PerMonth({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  if (!r) return <OwnMonth ctx={ctx} sample={sample} />;
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

/** M-7.2 with one offer: its bottom line a month, from its present value after rent at its own prices. */
function OwnMonth({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const letter = (Object.keys(ctx.own?.breakdowns ?? {}) as Letter[]).sort()[0];
  const b = letter ? ctx.own!.breakdowns[letter] : undefined;
  const o = letter ? ctx.offers.find((x) => x.letter === letter) : undefined;
  const input = o ? toOfferInput(o) : null;
  if (!b || !input || !("offer" in input)) return <p className="method-note">Fill in an offer to see this worked with your numbers.</p>;
  let v: ReturnType<typeof ownView>;
  try {
    v = ownView(letter, b, input.offer, pricesOf(ctx), false);
  } catch {
    return null;
  }
  const last = b.annuity[b.annuity.length - 1];
  return (
    <Live>
      <p className="live-head">{letter}'s bottom line, after rent at {v.place} prices, its {v.years}-year stay <Illustrative sample={sample} /></p>
      <table className="method-table work-like">
        <tbody>
          <tr><th scope="row">{letter}'s total after rent, present value, {v.place} $</th><td>{figure(v.pv.total)}</td></tr>
          <tr><th scope="row">÷ Annuity factor: {v.months} month-ends at {percent(b.discountRate)} a year</th><td>{v.factor.toFixed(4)}</td></tr>
          <tr className="rule-double"><th scope="row">= A month over your stay, {v.place} $</th><td>{dollars(v.month.total)}</td></tr>
        </tbody>
      </table>
      <p>
        Why not {dollars(v.pv.total)} ÷ {v.months} = {dollars(v.pv.total / v.months)}? Because later dollars are worth less today: a
        payment at the end of month {v.months} counts for about ${last ? last.factor.toFixed(2) : "1.00"} on the dollar. Of it,{" "}
        {dollars(v.month.saved)} is saved ({figure(v.pv.saved)} ÷ {v.factor.toFixed(4)}) and {dollars(v.month.spend)} is left to spend.
      </p>
      <p className="method-note">
        Its stay: {longDate(v.start)} – {longDate(v.last)}. Discount rate {percent(b.discountRate)} a year.
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

/** M-9: what leaving early would cost under each offer's terms (its A-4), and L-4's panel when it has worked one out. */
function LeavingEarly({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  const letters = (Object.keys(ctx.own?.breakdowns ?? {}) as Letter[]).sort();
  if (!letters.length) return <p className="method-note">Fill in an offer to see this with your numbers.</p>;
  const leave = r?.leave;
  return (
    <Live>
      <p className="live-head">Your {letters.length === 1 ? "offer" : "offers"}, if you left early <Illustrative sample={sample} /></p>
      <ul className="method-list">
        {letters.map((letter) => {
          const app = ctx.offers.find((o) => o.letter === letter);
          const input = app ? toOfferInput(app) : null;
          const o = input && "offer" in input ? input.offer : null;
          const d = ctx.own!.breakdowns[letter]!.detail;
          if (!o) return null;
          const facts = [...leaveTerms(o, d), ...bonusTerms(o)];
          const p = leave && r?.letters.includes(letter) ? leave.panels[r.letters.indexOf(letter)] : ctx.own?.leave?.panels[letter];
          const lost = p ? forfeits(p.warnings, o.startDate).reduce((sum, f) => sum + f.earned, 0) : 0;
          return (
            <li key={letter}>
              <strong>{letter}</strong>: {facts.length ? `${facts.join("; ")}.` : "nothing is lost by leaving early beyond the pay itself."}
              {p && (
                <> At the last day picked {r ? "in L-4" : "in A-4"}, {longDate(p.leaveDate)}, it keeps {dollars(p.afterTaxCompKept)} after tax
                  {p.clawbackOwed >= 0.5 ? `, repays ${dollars(p.clawbackOwed)}` : ""}{lost >= 0.5 ? ` and forfeits ${dollars(lost)} earned toward bonuses` : ""}.</>
              )}
            </li>
          );
        })}
      </ul>
      <p>{panelsWorked(leave, ctx) ? "" : `${r ? "L-4" : "Each offer's A-4"} works out what you'd keep for any last day. `}<a href="#/">See {r ? "L-4 on the comparison" : "A-4"}</a></p>
    </Live>
  );
}

/** Whether a last day's panel is worked out: L-4's, or with one offer A-4's. */
const panelsWorked = (leave: unknown, ctx: WorkContext) => !!leave || !!ctx.own?.leave;

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


/** M-12: each offer's live assumptions, in words: the comparison's, or each offer's own (its breakdown's) with one offer. */
function Assumptions({ ctx, sample }: { ctx: WorkContext; sample: boolean }) {
  const r = ctx.results;
  const mine: Array<[Letter, Assumption[]]> = r?.detail ? r.letters.map((l, i) => [l, r.detail!.offers[i].assumptions])
    : (Object.entries(ctx.own?.breakdowns ?? {}) as Array<[Letter, Breakdown]>).sort(([a], [b]) => a.localeCompare(b)).map(([l, b]) => [l, b.detail.assumptions]);
  return (
    <>
      <p>
        Everywhere: inflation {percent(ASSUMPTIONS.inflation)} a year (tax law and rent growth, never pay); discount rate{" "}
        {percent(ASSUMPTIONS.discountRate)}; present values as of today, {longDate(ctx.today)}; health usage {ctx.household.healthUsage ?? "medium"};
        no savings beyond the 401(k); prices in {pricesOf(ctx).dollars}; base case.
      </p>
      {!mine.length ? <p className="method-note">Fill in an offer to see its assumptions.</p> : mine.map(([l, assumptions]) => {
        const offer = ctx.offers.find((o) => o.letter === l);
        return (
          <div key={l} className="method-assumptions">
            <h4><span className={`who offer-${l}`}>{l}</span>{offer?.draft.label ? ` · ${offer.draft.label}` : ""}{" "}
              {offer?.sample && sample ? <span className="stamp">Sample</span> : null}</h4>
            <ul>{assumptions.map((a, k) => <li key={k}>{formatAssumption(a)}</li>)}</ul>
          </div>
        );
      })}
    </>
  );
}
