# eqe-poc - Devin AI for QE (3-week PoC MVP)

"Quality Engineering at Scale": Devin reads a Jira initiative, analyses one epic (Stage 1), designs test cases (Stage 2) and
automates approved cases with Playwright against a bundled synthetic app (Stage 3). Each stage stops at a timed human gate.
Stages 4-5 are shown as coming soon.

## Quick start
```bash
cd eqe-poc
npm ci
npx playwright install chromium
npm start            # http://localhost:3000  (demo-booking app at /demo-booking/)
```
Optional live dummy Jira: export `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`. Without them the app uses the committed
snapshot in `jira-export/` (copied from branch `demo/jira-export`); the header always shows which mode is active.

## Using it
1. **Run**: enter your name and role, pick initiative `AQPI-1` and epic `AQPI-2 Search & Availability`, start.
2. **Overview & gates**: *Start timed review*, read the Stage 1 tab, approve scope -> Stage 2 design runs.
3. **Stage 2 cases**: mark every case (accepted / incorrect / hallucinated / duplicate), then approve on Overview.
4. **Generate specs and run 5 times**: up to 3 accepted cases become Playwright specs and run 5 times against demo-booking.
5. **Stage 3 automation**: review specs, data mapping and flake table; approve the code.
6. **By Jira item**, **Compare** (golden set) and **Evidence & artifacts** show traceability, golden comparison and the files.

## Artifacts (per run, `data/runs/RUN-n/artifacts/`)
`AQPI-1-analysis-and-progress.html`, `Stage-1-Requirement-and-details.xlsx`, `gap-register.xlsx`,
`Stage-2-Test-Scenarios-and-Test-cases.xlsx` (incl. Zephyr import sheet), `design-scaffolds/*.spec.ts`, `coverage-matrix.xlsx`,
`golden-comparison.json`, `generated-specs/*.spec.ts`, `test-data-mapping.json`, `flake-report.html`, `evidence-pack.html`.

## Metrics
All PoC criteria are computed from run data (verdicts, timed gates, Playwright JSON reports) - see `src/metrics.js` and
`_WORKFLOW.md`. A metric shows PENDING until its data exists.

## Known limits
- `golden-set/AQPI-2.golden.json` is a **draft seeded by Devin, pending QE-lead sign-off**. Replace it with the team's
  human-authored cases (file or Compare tab) before using the golden comparison as evidence.
- `_WORKFLOW.md` is provisional (the original was not available).
- No authentication: reviewer name and role are self-declared and recorded in the governance trail. Run it only on a
  trusted network or behind the preview login; add SSO before using gate approvals as audit evidence.
- Analysis and design are deterministic rules over the Jira text and the framework's UI map (`framework/ui-map.js`), not an LLM call.

## Layout
`src/` server + pipeline (jira, stage1-3, golden, metrics, artifacts) | `public/` UI | `demo-booking/` synthetic app |
`framework/` Page Objects, UI map, playbook | `jira-export/` snapshot | `golden-set/` | `test/` | `skills/`
