"""
Oracle check: run PolicyEngine-US over the same grid as scripts/grid.ts and report
per-state differences. Usage:
  npx tsx scripts/grid.ts > grid_ts.json && python3 scripts/oracle.py grid_ts.json
"""
import json, sys, warnings
warnings.filterwarnings("ignore")
from policyengine_us import Simulation

YEAR = 2026
STATE_NAMES = {"DC": "DC"}

def situation(state, status, in_nyc=False):
    people = {"you": {"age": {YEAR: 30}}}
    members = ["you"]
    if status == "joint":
        people["spouse"] = {"age": {YEAR: 30}, "employment_income": {YEAR: 0}}
        members.append("spouse")
    hh = {"members": members, "state_name": {YEAR: state}}
    if in_nyc: hh["in_nyc"] = {YEAR: True}
    return {
        "people": people,
        "tax_units": {"tu": {"members": members}},
        "families": {"f": {"members": members}},
        "spm_units": {"s": {"members": members}},
        "marital_units": {"m": {"members": members}},
        "households": {"h": hh},
        "axes": [[{"name": "employment_income", "min": 40_000, "max": 320_000, "count": 15, "period": YEAR}]],
    }

def run(state, status, in_nyc=False):
    sim = Simulation(situation=situation(state, status, in_nyc))
    vals = {}
    for var in ["income_tax", "state_income_tax", "employee_social_security_tax", "employee_medicare_tax", "additional_medicare_tax", "employee_state_payroll_tax"]:
        vals[var] = sim.calculate(var, YEAR).tolist()
    if in_nyc: vals["nyc_income_tax"] = sim.calculate("nyc_income_tax", YEAR).tolist()
    # axes vary the first person; tax-unit arrays have one entry per axis point
    n = 15
    def per_unit(arr):  # person-level arrays have 2 entries per point for joint
        return arr if len(arr) == n else arr[::len(arr)//n]
    return {k: per_unit(v) for k, v in vals.items()}

ts = json.load(open(sys.argv[1]))
index = {(r["state"], r["filingStatus"], r["wages"]): r for r in ts}
incomes = [40_000 + i * 20_000 for i in range(15)]
states = sorted({r["state"] for r in ts if r["state"] != "NYC"})

report = {}
fed_report = {}
pay_report = {}
fica_max = 0.0
for st in states:
    for status in ["single", "joint"]:
        pe = run(st, status)
        diffs, fdiffs, pdiffs = [], [], []
        for i, w in enumerate(incomes):
            mine = index[(st, status, w)]
            fica_pe = pe["employee_social_security_tax"][i] + pe["employee_medicare_tax"][i] + pe["additional_medicare_tax"][i]
            fica_max = max(fica_max, abs(mine["fica"] - fica_pe))
            diffs.append(round(mine["st"] - pe["state_income_tax"][i], 2))
            fdiffs.append(round(mine["fed"] - pe["income_tax"][i], 2))
            pdiffs.append(round(mine["pay"] - pe["employee_state_payroll_tax"][i], 2))
        report[(st, status)] = diffs
        fed_report[(st, status)] = fdiffs
        pay_report[(st, status)] = pdiffs
    sys.stderr.write(st + " ")

# NYC local
pe = run("NY", "single", in_nyc=True); pej = run("NY", "joint", in_nyc=True)
nyc = {"single": [round(index[("NYC","single",w)]["local"] - pe["nyc_income_tax"][i], 2) for i, w in enumerate(incomes)],
       "joint": [round(index[("NYC","joint",w)]["local"] - pej["nyc_income_tax"][i], 2) for i, w in enumerate(incomes)]}
nyc_fed = {"single": [round(index[("NYC","single",w)]["fed"] - pe["income_tax"][i], 2) for i, w in enumerate(incomes)],
           "joint": [round(index[("NYC","joint",w)]["fed"] - pej["income_tax"][i], 2) for i, w in enumerate(incomes)]}

out = {"incomes": incomes, "fica_max_abs_diff": fica_max,
       "state": {f"{k[0]}|{k[1]}": v for k, v in report.items()},
       "federal": {f"{k[0]}|{k[1]}": v for k, v in fed_report.items()},
       "state_payroll": {f"{k[0]}|{k[1]}": v for k, v in pay_report.items()},
       "nyc": nyc, "nyc_federal": nyc_fed}
json.dump(out, open("oracle_report.json", "w"), indent=1)
print("\nFICA max abs diff:", round(fica_max, 2))
def show(title, rep, thresh=1):
    print(f"\n== {title}: rows with max|diff| >= ${thresh} (ours - PolicyEngine) at 40k..320k")
    n = 0
    for (st, status), d in sorted(rep.items(), key=lambda kv: -max(abs(x) for x in kv[1])):
        m = max(abs(x) for x in d)
        if m >= thresh:
            n += 1; print(f"{st:4}{status:7}{m:7.0f}  {[int(x) for x in d]}")
    print(f"   ({n} of {len(rep)} state/status combos)")
show("FEDERAL", fed_report)
show("STATE PAYROLL", pay_report)
show("STATE INCOME TAX", report)
print("\nNYC local single", [int(x) for x in nyc["single"]]); print("NYC local joint ", [int(x) for x in nyc["joint"]])
print("NYC fed   single", [int(x) for x in nyc_fed["single"]]); print("NYC fed   joint ", [int(x) for x in nyc_fed["joint"]])
