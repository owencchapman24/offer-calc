# User testing

What testers tell us, as it comes in. User testing started on 2026-10-12, with the live site (https://offer-calc.vercel.app) in
front of a few people before deciding what to build next (CLAUDE.md, "Next steps").

**How to add a finding:** one row per finding, newest last. Give the date it was first raised, what testers said or did (in their
words where possible, without names), how many testers raised it independently, and what it led to. When another tester raises a
finding already here, update its count and add the date to its row rather than adding a new row. A finding stays here after it's
acted on: the "What it led to" column says what was built or decided, and where.

| # | First raised | Finding | Testers | What it led to |
|---|---|---|---|---|
| 1 | 2026-10-12 | Testers wanted to paste the comparison into a document of their own, so they could read the numbers, and the logic behind each offer, at their own pace. | 2 (independently) | "Copy as document" (approved with changes and built, 2026-10-12; `docs/copy-as-document-plan.md`): a button beside "Print…" that copies a summary of about 3 pages (the verdict and the pipeline in plain English, the offers, each offer's bridge from the offer letter, what would flip the verdict, leaving early, the assumptions) that pastes into Google Docs, Word and email, tables included. Checked by the project's owner, testing it on 2026-10-12: pasted into Google Docs, it worked. The other testers' reaction to it: not yet recorded. |
