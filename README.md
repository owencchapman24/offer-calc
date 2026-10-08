# Offer Calc

Compare job offers on what they're actually worth: after federal, state, local and payroll
taxes, adjusted for cost of living, year by year.

## Status
- **Tax engine:** complete on enacted 2026 law and validated against
  [PolicyEngine-US](https://github.com/PolicyEngine/policyengine-us), with projected later
  years (federal indexing, the OBBBA SALT schedule including its 2030 reversion).
- **Offer model:** pay, equity, leave dates, scenarios, 401(k), health, cost of living and
  HUD rent estimates (`docs/offer-model.md`).
- **UI:** slice 1, quick mode and the lead schedule (`docs/ui-design.md`).
- **More:** `CLAUDE.md`.

## Setup
```bash
npm install
npm test            # unit tests (engine and app)
npm run typecheck
npm run dev         # the app at http://localhost:5173
npm run build       # static build in dist/ (deployed on Vercel; see vercel.json)
```

### Optional: validate against PolicyEngine
Needs Python 3.10+. Install PolicyEngine into a virtual environment named `.venv`.
`npm run oracle` uses `.venv` automatically, so you don't need to activate it. Without a
`.venv`, it falls back to `python3`, then `python`, on your PATH. A run takes a few minutes
and writes `oracle_report.json`.

macOS / Linux:
```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run oracle
```

Windows (PowerShell):
```powershell
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
npm run oracle
```

## Example
```ts
import { computeTaxes, paramsForYear } from "./src/tax";
computeTaxes({ year: 2026, filingStatus: "single", wages: 110_000, state: "NY",
  locality: { kind: "nyc" }, pretax401k: 6_000, section125: 1_440 });

// Later years are projections, and you choose the inflation assumption:
computeTaxes({ year: 2030, filingStatus: "single", wages: 125_000, state: "NY" },
  paramsForYear(2030, { inflation: 0.025 }));
```

Estimates only; not tax advice.
