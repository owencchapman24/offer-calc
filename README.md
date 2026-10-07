# Offer Calc

Compare job offers on what they're actually worth: after federal, state, local and payroll
taxes, adjusted for cost of living, year by year.

## Status
Tax engine (2026) complete and validated against [PolicyEngine-US](https://github.com/PolicyEngine/policyengine-us).
Offer model and UI are next — see `CLAUDE.md`.

## Setup
```bash
npm install
npm test            # unit tests
npm run typecheck
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
import { computeTaxes } from "./src/tax";
computeTaxes({ year: 2026, filingStatus: "single", wages: 110_000, state: "NY",
  locality: { kind: "nyc" }, pretax401k: 6_000, section125: 1_440 });
```

Estimates only; not tax advice.
