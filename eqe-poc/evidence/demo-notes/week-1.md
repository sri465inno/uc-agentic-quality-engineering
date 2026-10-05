# Week 1 demo notes (prepared by Devin — 2026-10-05)

## What to show (≈15 min)
1. **UI** `#/eqe` — five-stage bar (1–3 active, 4–5 coming soon), UC1/UC2 metric tables (screenshot `01-eqe-run.png`).
2. **By Jira item** `AQPI-3` — verbatim AC/BR → cases → specs → gaps (`02-eqe-by-jira-item.png`).
3. **Artifacts** — `AQPI-1-analysis-and-progress.html`, Stage-1 and Stage-2 workbooks, 15 design scaffolds, coverage matrix, gap register.
4. **demo-booking** — valid Lisbon search, validation errors, zero results (Reykjavik), outage + retry (Atlantis).
5. **UC2** — `npm run test:e2e` live; five-run flake report.
6. **Governance** — record a gate decision; show that review time and approval metrics stay *pending* until a person enters them.

## Facts (computed, see `evidence/metrics.json`)
- UC1 `AQPI-2`: 15 cases, 5 scenarios, 3 guest journeys; story AC coverage 11/11; automated grounding check 0/49 ungrounded claims; 11 gaps logged.
- UC2: 3 specs, 2 Page Objects, 5/5 data references mapped, 0 raw locators, 0/15 failed executions over 5 runs.

## Refine loop observed this week
- UC2 v1 failed all 3 specs at the first dry run: `getByLabel('Destination', { exact: true })` did not match because the
  label text includes the required `*`. Fixed in the Page Object only (`getByRole('textbox', { name })`); specs unchanged.

## Not done / needs people
- Golden set (12–15 cases) for `AQPI-2` — QE lead to author in `golden-set/AQPI-2.golden.json`.
- Review-time measurements and gate decisions (UC1-STAGE1-SCOPE, UC1-STAGE2-APPROVAL, UC1-GATE1, UC2-CODE-REVIEW, UC2-GATE-SCALE).
- `_WORKFLOW.md` is a draft written from the PoC brief; replace with the authoritative version if one exists.
- Product Owner answers for open gaps (GAP-01, -02, -07, -08, -09).

## Week 2 plan (only after UC1-GATE1 / UC2-GATE-SCALE approvals)
- UC1: scale to 4–6 epics from `initiative.json` `candidateEpicsAfterGate1`.
- UC2: automate the remaining approved AQPI-2 cases (negatives, accessibility, technical failure, double submit).
