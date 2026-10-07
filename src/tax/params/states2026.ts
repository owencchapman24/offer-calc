import type { Schedule } from "../types";

/**
 * State individual income tax parameters, tax year 2026.
 *
 * Primary source: Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026"
 * (data as of Feb 11, 2026). Footnote letters below refer to that table.
 * Overrides for laws enacted after that date are marked OVERRIDE with their own source.
 *
 * Conventions:
 *  - Schedules are [lowerBound, rate]; a 0% first band encodes "rate starts above X".
 *  - Unless `base` says otherwise, state AGI = federal AGI (wages minus 401(k),
 *    cafeteria-plan and commuter deductions).
 *  - Special rules (phase-outs, recapture, federal-tax deductions) live in state.ts,
 *    keyed by the `special` flag.
 */
export interface StateSpec {
  name: string;
  /** "none" = no tax on wage income. */
  kind: "none" | "income";
  single?: Schedule;
  joint?: Schedule;
  /** [single, joint] */
  stdDeduction?: readonly [number, number];
  /**
   * The standard deduction is the federal one for the same tax year by statute, so projected
   * years follow federal indexing (`stdDeduction` documents the 2026 amount). Set only where
   * verified, with a source. Every other state amount is held at 2026 law in projected years.
   */
  stdDeductionIsFederal?: boolean;
  /** Personal exemption as a deduction from income. [single, joint] */
  exemption?: readonly [number, number];
  /** Personal exemption structured as a tax credit. [single, joint] */
  exemptionCredit?: readonly [number, number];
  /** PA (and Philadelphia) do not exclude 401(k) deferrals from taxable compensation. */
  taxes401kDeferrals?: boolean;
  /** Employee-paid state payroll taxes on wages (SDI, paid leave, LTC, transit). */
  payroll?: PayrollComponent[];
  /**
   * If the filer itemizes federally, this state uses federal itemized deductions
   * (minus the state/local income tax inside SALT) instead of its standard deduction.
   * Covers states starting from federal taxable income (TF fn (o)) and states that
   * require matching the federal itemize election (VA, DC). Verified against PolicyEngine.
   */
  itemizedWhenFederalItemizes?: boolean;
  /** Refundable credit per person (e.g. Idaho grocery credit). */
  refundableCreditPerPerson?: number;
  special?: string;
  /** Shown to users when they pick this state. */
  notes?: string[];
}

/** Source for payroll components: PolicyEngine-US 2.30.3 parameters, cross-checked by sampling. */
export interface PayrollComponent {
  label: string;
  rate: number;
  /** Annual wage cap. "ssWageBase" = the Social Security wage base for the tax year. */
  wageCap?: number | "ssWageBase";
  /** Fixed annual amount (e.g. NY SDI $0.60/week). */
  flat?: number;
}

const NONE = (name: string, notes?: string[]): StateSpec => ({ name, kind: "none", notes });

export const STATES_2026: Record<string, StateSpec> = {
  AL: {
    name: "Alabama", kind: "income",
    single: [[0, 0.02], [500, 0.04], [3_000, 0.05]],
    joint: [[0, 0.02], [1_000, 0.04], [6_000, 0.05]],
    stdDeduction: [3_000, 8_500], exemption: [1_500, 3_000],
    special: "AL", // fn (b) federal income tax deductible; fn (c) std deduction phase-down
  },
  AK: NONE("Alaska", ["Alaska's Permanent Fund Dividend (taxable federally) is not modeled."]),
  AZ: {
    name: "Arizona", kind: "income",
    single: [[0, 0.025]], joint: [[0, 0.025]],
    stdDeduction: [15_750, 31_500],
    notes: ["Arizona's 2026 standard deduction depends on its federal conformity date; using PolicyEngine's $15,750 (Tax Foundation's Feb. table showed $8,350)."],
  },
  AR: {
    name: "Arkansas", kind: "income",
    // OVERRIDE: AR Act 1 of 2026 (1st Extraordinary Session); A.C.A. 26-51-201 (via PolicyEngine-US).
    single: [[0, 0.02], [4_700, 0.037]], joint: [[0, 0.02], [4_700, 0.037]],
    stdDeduction: [2_520, 5_040], exemptionCredit: [29, 58],
    special: "AR", // separate table for net income <= $94,700
  },
  CA: {
    name: "California", kind: "income",
    // OVERRIDE: 2026 inflation-indexed brackets/deduction/credit (Cal. RTC 17041, 17054; via PolicyEngine-US).
    // Top bands include the 1% mental health services tax above $1M.
    single: [[0, 0.01], [11_330, 0.02], [26_859, 0.04], [42_391, 0.06], [58_846, 0.08],
      [74_372, 0.093], [379_898, 0.103], [455_873, 0.113], [759_790, 0.123], [1_000_000, 0.133]],
    joint: [[0, 0.01], [22_660, 0.02], [53_718, 0.04], [84_783, 0.06], [117_692, 0.08],
      [148_744, 0.093], [759_796, 0.103], [911_747, 0.113], [1_000_000, 0.123], [1_519_581, 0.133]],
    stdDeduction: [5_835, 11_671], exemptionCredit: [156, 313],
    payroll: [{ label: "CA State Disability Insurance", rate: 0.013 }],
    special: "CA",
  },
  CO: {
    name: "Colorado", kind: "income",
    single: [[0, 0.044]], joint: [[0, 0.044]],
    stdDeduction: [16_100, 32_200], // fn (o): starts from federal taxable income
    // Federal link: C.R.S. 39-22-104(1) taxes federal taxable income; 39-22-103(5.3) IRC
    // "as amended ... for the taxable year" (rolling).
    stdDeductionIsFederal: true,
    itemizedWhenFederalItemizes: true,
    payroll: [{ label: "CO FAMLI", rate: 0.0044, wageCap: "ssWageBase" }],
    special: "CO",
    notes: ["Colorado's TABOR sales-tax refund varies by year and is not modeled."],
  },
  CT: {
    name: "Connecticut", kind: "income",
    single: [[0, 0.02], [10_000, 0.045], [50_000, 0.055], [100_000, 0.06], [200_000, 0.065], [250_000, 0.069], [500_000, 0.0699]],
    joint: [[0, 0.02], [20_000, 0.045], [100_000, 0.055], [200_000, 0.06], [400_000, 0.065], [500_000, 0.069], [1_000_000, 0.0699]],
    exemption: [15_000, 24_000],
    payroll: [{ label: "CT Paid Leave", rate: 0.005, wageCap: "ssWageBase" }],
    special: "CT", // fns (p), (q), (r): exemption phase-out, 2% phase-out, benefit recapture
  },
  DE: {
    name: "Delaware", kind: "income",
    single: [[0, 0], [2_000, 0.022], [5_000, 0.039], [10_000, 0.048], [20_000, 0.052], [25_000, 0.0555], [60_000, 0.066]],
    joint: [[0, 0], [2_000, 0.022], [5_000, 0.039], [10_000, 0.048], [20_000, 0.052], [25_000, 0.0555], [60_000, 0.066]],
    stdDeduction: [3_250, 6_500], exemptionCredit: [110, 220],
    payroll: [{ label: "DE Paid Leave", rate: 0.004, wageCap: "ssWageBase" }],
  },
  FL: NONE("Florida"),
  GA: {
    name: "Georgia", kind: "income",
    // OVERRIDE: GA HB 463 (2025-26 session), O.C.G.A. 48-7-20 / 48-7-27 (via PolicyEngine-US).
    single: [[0, 0.0499]], joint: [[0, 0.0499]],
    stdDeduction: [15_000, 30_000],
  },
  HI: {
    name: "Hawaii", kind: "income",
    single: [[0, 0.014], [9_600, 0.032], [14_400, 0.055], [19_200, 0.064], [24_000, 0.068], [36_000, 0.072],
      [48_000, 0.076], [125_000, 0.079], [175_000, 0.0825], [225_000, 0.09], [275_000, 0.1], [325_000, 0.11]],
    joint: [[0, 0.014], [19_200, 0.032], [28_800, 0.055], [38_400, 0.064], [48_000, 0.068], [72_000, 0.072],
      [96_000, 0.076], [250_000, 0.079], [350_000, 0.0825], [450_000, 0.09], [550_000, 0.1], [650_000, 0.11]],
    // OVERRIDE: 2026 std deduction per Act 46 (SLH 2024) schedule (via PolicyEngine-US).
    stdDeduction: [8_000, 16_000], exemption: [1_144, 2_288],
  },
  ID: {
    name: "Idaho", kind: "income",
    single: [[0, 0], [4_811, 0.053]], joint: [[0, 0], [9_622, 0.053]],
    // Not federal-linked for projections: Idaho Code 63-3004 adopts the IRC as of Jan 1 of
    // each year via an annual conformity bill (static), so later amounts aren't automatic.
    stdDeduction: [16_100, 32_200], itemizedWhenFederalItemizes: true,
    refundableCreditPerPerson: 155, // Idaho grocery credit
  },
  IL: {
    name: "Illinois", kind: "income",
    single: [[0, 0.0495]], joint: [[0, 0.0495]],
    exemption: [2_925, 5_850],
    special: "IL", // fn (v): no exemption above AGI $250k / $500k
  },
  IN: {
    name: "Indiana", kind: "income",
    single: [[0, 0.0295]], joint: [[0, 0.0295]],
    exemption: [1_000, 2_000],
    notes: ["Indiana counties levy their own income tax. Add it as a flat local rate."],
  },
  IA: {
    name: "Iowa", kind: "income",
    single: [[0, 0.038]], joint: [[0, 0.038]],
    stdDeduction: [16_100, 32_200], exemptionCredit: [40, 80], itemizedWhenFederalItemizes: true,
    // Federal link: Iowa Code 422.7 starts from federal taxable income; 422.3(5)(b) IRC
    // "as amended" for tax years from 2020 (rolling).
    stdDeductionIsFederal: true,
  },
  KS: {
    name: "Kansas", kind: "income",
    single: [[0, 0.052], [23_000, 0.0558]], joint: [[0, 0.052], [46_000, 0.0558]],
    stdDeduction: [3_605, 8_240], exemption: [9_160, 18_320],
  },
  KY: {
    name: "Kentucky", kind: "income",
    single: [[0, 0.035]], joint: [[0, 0.035]],
    stdDeduction: [3_360, 3_360], // fn (z): not doubled for joint filers
    notes: ["Many Kentucky cities and counties levy occupational taxes. Add as a flat local rate."],
  },
  LA: {
    name: "Louisiana", kind: "income",
    single: [[0, 0.03]], joint: [[0, 0.03]],
    stdDeduction: [12_875, 25_750],
  },
  ME: {
    name: "Maine", kind: "income",
    single: [[0, 0.058], [27_399, 0.0675], [64_849, 0.0715]],
    joint: [[0, 0.058], [54_849, 0.0675], [129_749, 0.0715]],
    // OVERRIDE: 2026 std deduction per P.L. 2025 c. 650 (via PolicyEngine-US); phase-out per 36 M.R.S. 5124-C.
    stdDeduction: [15_700, 31_400], exemption: [5_300, 10_600],
    payroll: [{ label: "ME Paid Family & Medical Leave", rate: 0.005, wageCap: "ssWageBase" }],
    special: "ME",
  },
  MD: {
    name: "Maryland", kind: "income",
    single: [[0, 0.02], [1_000, 0.03], [2_000, 0.04], [3_000, 0.0475], [100_000, 0.05], [125_000, 0.0525],
      [150_000, 0.055], [250_000, 0.0575], [500_000, 0.0625], [1_000_000, 0.065]],
    joint: [[0, 0.02], [1_000, 0.03], [2_000, 0.04], [3_000, 0.0475], [150_000, 0.05], [175_000, 0.0525],
      [225_000, 0.055], [300_000, 0.0575], [600_000, 0.0625], [1_200_000, 0.065]],
    stdDeduction: [3_350, 6_700], exemption: [3_200, 6_400],
    special: "MD", // fn (aa): exemption phase-out
    notes: ["Every Maryland county also levies a local income tax (roughly 2.25-3.3%). Add your county's rate as a flat local tax."],
  },
  MA: {
    name: "Massachusetts", kind: "income",
    single: [[0, 0.05], [1_083_150, 0.09]], joint: [[0, 0.05], [1_083_150, 0.09]],
    exemption: [4_400, 8_800],
    payroll: [{ label: "MA Paid Family & Medical Leave", rate: 0.0046, wageCap: "ssWageBase" }], // TF fn (rr)
    special: "MA", // deduction for Social Security/Medicare contributions, up to $2,000 per person
  },
  MI: {
    name: "Michigan", kind: "income",
    single: [[0, 0.0425]], joint: [[0, 0.0425]],
    exemption: [5_900, 11_800],
    notes: ["Detroit and about 20 other Michigan cities levy a city income tax. Add as a flat local rate."],
  },
  MN: {
    name: "Minnesota", kind: "income",
    single: [[0, 0.0535], [33_310, 0.068], [109_430, 0.0785], [203_150, 0.0985]],
    joint: [[0, 0.0535], [48_700, 0.068], [193_480, 0.0785], [337_930, 0.0985]],
    stdDeduction: [15_300, 30_600],
    payroll: [{ label: "MN Paid Leave", rate: 0.0044, wageCap: 185_000 }],
    special: "MN", // fn (cc): std deduction reduction above AGI $244,400
  },
  MS: {
    name: "Mississippi", kind: "income",
    single: [[0, 0], [10_000, 0.04]], joint: [[0, 0], [10_000, 0.04]],
    stdDeduction: [2_300, 4_600], exemption: [6_000, 12_000],
  },
  MO: {
    name: "Missouri", kind: "income",
    single: [[0, 0], [1_348, 0.02], [2_696, 0.025], [4_044, 0.03], [5_392, 0.035], [6_740, 0.04], [8_088, 0.045], [9_436, 0.047]],
    joint: [[0, 0], [1_348, 0.02], [2_696, 0.025], [4_044, 0.03], [5_392, 0.035], [6_740, 0.04], [8_088, 0.045], [9_436, 0.047]],
    stdDeduction: [16_100, 32_200],
    // Federal link: RSMo 143.131.2 "The Missouri standard deduction shall be the allowable
    // federal standard deduction"; 143.091 IRC as effective "for the taxable year" (rolling).
    stdDeductionIsFederal: true,
    special: "MO", // fn (b): partial federal income tax deduction
    notes: ["Kansas City and St. Louis levy a 1% earnings tax. Add as a flat local rate."],
  },
  MT: {
    name: "Montana", kind: "income",
    single: [[0, 0.047], [47_500, 0.0565]], joint: [[0, 0.047], [95_000, 0.0565]],
    stdDeduction: [16_100, 32_200], itemizedWhenFederalItemizes: true,
    // Federal link: MCA 15-30-2101 taxes federal taxable income (from 2024); IRC "as amended" (rolling).
    stdDeductionIsFederal: true,
  },
  NE: {
    name: "Nebraska", kind: "income",
    single: [[0, 0.0246], [4_130, 0.0351], [24_760, 0.0455]],
    joint: [[0, 0.0246], [8_250, 0.0351], [49_530, 0.0455]],
    stdDeduction: [8_850, 17_700], exemptionCredit: [176, 352],
  },
  NV: NONE("Nevada"),
  NH: NONE("New Hampshire"),
  NJ: {
    name: "New Jersey", kind: "income",
    single: [[0, 0.014], [20_000, 0.0175], [35_000, 0.035], [40_000, 0.0553], [75_000, 0.0637], [500_000, 0.0897], [1_000_000, 0.1075]],
    joint: [[0, 0.014], [20_000, 0.0175], [50_000, 0.0245], [70_000, 0.035], [80_000, 0.0553], [150_000, 0.0637], [500_000, 0.0897], [1_000_000, 0.1075]],
    exemption: [1_000, 2_000],
    payroll: [{ label: "NJ SDI + Family Leave Insurance", rate: 0.0042, wageCap: 171_100 }],
  },
  NM: {
    name: "New Mexico", kind: "income",
    single: [[0, 0.015], [5_500, 0.032], [16_500, 0.043], [33_500, 0.047], [66_500, 0.049], [210_000, 0.059]],
    joint: [[0, 0.015], [8_000, 0.032], [25_000, 0.043], [50_000, 0.047], [100_000, 0.049], [315_000, 0.059]],
    stdDeduction: [16_100, 32_200], itemizedWhenFederalItemizes: true,
    // Federal link: NMSA 7-2-2(N)(1), the standard deduction "allowed the taxpayer for the
    // taxpayer's taxable year by Section 63" (text as shown in 2026 HB 93, which failed).
    stdDeductionIsFederal: true,
  },
  NY: {
    name: "New York", kind: "income",
    single: [[0, 0.039], [8_500, 0.044], [11_700, 0.0515], [13_900, 0.054], [80_650, 0.059], [215_400, 0.0685],
      [1_077_550, 0.0965], [5_000_000, 0.103], [25_000_000, 0.109]],
    joint: [[0, 0.039], [17_150, 0.044], [23_600, 0.0515], [27_900, 0.054], [161_550, 0.059], [323_200, 0.0685],
      [2_155_350, 0.0965], [5_000_000, 0.103], [25_000_000, 0.109]],
    stdDeduction: [8_000, 16_050],
    payroll: [
      { label: "NY Paid Family Leave", rate: 0.00432, wageCap: 95_350 },
      { label: "NY Disability Insurance", rate: 0, flat: 31.2 },
    ],
    special: "NY", // fn (i): tax benefit recapture above AGI $107,650
  },
  NC: {
    name: "North Carolina", kind: "income",
    single: [[0, 0.0399]], joint: [[0, 0.0399]],
    stdDeduction: [12_750, 25_500],
  },
  ND: {
    name: "North Dakota", kind: "income",
    single: [[0, 0], [48_475, 0.0195], [244_825, 0.025]],
    joint: [[0, 0], [80_975, 0.0195], [298_075, 0.025]],
    stdDeduction: [16_100, 32_200], itemizedWhenFederalItemizes: true,
    // Federal link: NDCC 57-38-30.3 taxes federal taxable income; 57-38-01 IRC "as amended" (rolling).
    stdDeductionIsFederal: true,
  },
  OH: {
    name: "Ohio", kind: "income",
    // OVERRIDE: HB 96 schedule as modeled by PolicyEngine-US: ~$332 base + 2.75% above $26,050;
    // zero tax at or below $26,050 is applied in state.ts.
    single: [[0, 0.01274], [26_050, 0.0275]], joint: [[0, 0.01274], [26_050, 0.0275]],
    exemption: [2_400, 4_800],
    special: "OH", // fn (dd): exemption tiers by AGI
    notes: ["Most Ohio cities levy a municipal income tax (often 2-2.5%). Add as a flat local rate."],
  },
  OK: {
    name: "Oklahoma", kind: "income",
    single: [[0, 0], [3_750, 0.025], [4_900, 0.035], [7_200, 0.045]],
    joint: [[0, 0], [7_500, 0.025], [9_800, 0.035], [14_400, 0.045]],
    stdDeduction: [6_350, 12_700], exemption: [1_000, 2_000],
  },
  OR: {
    name: "Oregon", kind: "income",
    single: [[0, 0.0475], [4_550, 0.0675], [11_400, 0.0875], [125_000, 0.099]],
    joint: [[0, 0.0475], [9_100, 0.0675], [22_800, 0.0875], [250_000, 0.099]],
    stdDeduction: [2_910, 5_820], exemptionCredit: [256, 512],
    payroll: [
      { label: "OR Paid Leave", rate: 0.006, wageCap: "ssWageBase" },
      { label: "OR statewide transit tax", rate: 0.001 },
    ],
    special: "OR", // fn (b) federal tax subtraction; fn (ee) credit disallowed above AGI $100k/$200k
  },
  PA: {
    name: "Pennsylvania", kind: "income",
    single: [[0, 0.0307]], joint: [[0, 0.0307]],
    taxes401kDeferrals: true,
    payroll: [{ label: "PA unemployment (employee share)", rate: 0.0007 }],
    notes: ["Most Pennsylvania municipalities levy a local earned income tax (often ~1%). Philadelphia is modeled separately."],
  },
  RI: {
    name: "Rhode Island", kind: "income",
    single: [[0, 0.0375], [82_050, 0.0475], [186_450, 0.0599]],
    joint: [[0, 0.0375], [82_050, 0.0475], [186_450, 0.0599]],
    stdDeduction: [11_200, 22_400], exemption: [5_250, 10_500],
    payroll: [{ label: "RI Temporary Disability Insurance", rate: 0.011, wageCap: 100_000 }],
    special: "RI", // fn (ff): deduction/exemption phase-out $261k-$290.8k
  },
  SC: {
    // OVERRIDE. Source: SC Act 110 of 2026 (H.4216), signed Mar 30, 2026;
    // SCDOR Information Letter #26-20 (Aug 31, 2026). Starts from federal AGI,
    // replaces federal std deduction with the SCIAD; 1.99% to $30k, 5.21% above.
    name: "South Carolina", kind: "income",
    single: [[0, 0.0199], [30_000, 0.0521]], joint: [[0, 0.0199], [30_000, 0.0521]],
    special: "SC",
  },
  SD: NONE("South Dakota"),
  TN: NONE("Tennessee"),
  TX: NONE("Texas"),
  UT: {
    name: "Utah", kind: "income",
    // OVERRIDE: UT SB 60 (2026), 59-10-104 (via PolicyEngine-US).
    single: [[0, 0.0445]], joint: [[0, 0.0445]],
    special: "UT", // fn (gg): taxpayer credit = 6% of federal std deduction, phased out
  },
  VT: {
    name: "Vermont", kind: "income",
    single: [[0, 0.0335], [49_400, 0.066], [119_700, 0.076], [249_700, 0.0875]],
    joint: [[0, 0.0335], [82_500, 0.066], [199_450, 0.076], [304_000, 0.0875]],
    stdDeduction: [7_650, 15_300], exemption: [5_300, 10_600],
    payroll: [{ label: "VT Child Care Contribution", rate: 0.0011 }],
    special: "VT", // fn (hh): minimum tax of 3% of federal AGI above $150k
  },
  VA: {
    name: "Virginia", kind: "income",
    single: [[0, 0.02], [3_000, 0.03], [5_000, 0.05], [17_000, 0.0575]],
    joint: [[0, 0.02], [3_000, 0.03], [5_000, 0.05], [17_000, 0.0575]],
    stdDeduction: [8_750, 17_500], exemption: [930, 1_860],
    itemizedWhenFederalItemizes: true, // must match federal itemize election
  },
  WA: {
    ...NONE("Washington"),
    payroll: [
      { label: "WA Cares (long-term care)", rate: 0.0058 }, // TF fn (ss)
      { label: "WA Paid Family & Medical Leave", rate: 0.0080716, wageCap: "ssWageBase" },
    ],
  },
  WV: {
    name: "West Virginia", kind: "income",
    // OVERRIDE: 2026 rates per WV Code 11-21-4j (via PolicyEngine-US).
    single: [[0, 0.0211], [10_000, 0.0281], [25_000, 0.0316], [40_000, 0.0422], [60_000, 0.0458]],
    joint: [[0, 0.0211], [10_000, 0.0281], [25_000, 0.0316], [40_000, 0.0422], [60_000, 0.0458]],
    exemption: [2_000, 4_000],
  },
  WI: {
    name: "Wisconsin", kind: "income",
    single: [[0, 0.035], [15_110, 0.044], [51_950, 0.053], [332_720, 0.0765]],
    joint: [[0, 0.035], [20_150, 0.044], [69_260, 0.053], [443_630, 0.0765]],
    stdDeduction: [13_960, 25_840], exemption: [700, 1_400],
    special: "WI", // fn (ii): sliding-scale standard deduction
  },
  WY: NONE("Wyoming"),
  DC: {
    name: "District of Columbia", kind: "income",
    single: [[0, 0.04], [10_000, 0.06], [40_000, 0.065], [60_000, 0.085], [250_000, 0.0925], [500_000, 0.0975], [1_000_000, 0.1075]],
    joint: [[0, 0.04], [10_000, 0.06], [40_000, 0.065], [60_000, 0.085], [250_000, 0.0925], [500_000, 0.0975], [1_000_000, 0.1075]],
    // OVERRIDE: DC decoupled from the OBBBA deduction increase (2025 D-40 booklet, via PolicyEngine-US).
    stdDeduction: [15_300, 30_650],
    itemizedWhenFederalItemizes: true, // must match federal itemize election
  },
};
