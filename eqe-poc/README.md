# EQE PoC — Devin AI for Quality Engineering (Stages 1–3)

Time-boxed PoC of a governed, traceable QE workflow. **Stages 1–3 only** (Cognitive Analysis, Intelligent Design,
Self-Adaptive Automation). Stage 4 (orchestrated execution) and Stage 5 (insight reporting) are out of scope and
show as "coming soon" in the UI.

Everything runs against **dummy/sandbox data**: the committed Jira export snapshot (`demo/jira-export`, initiative
`AQPI-1`) and the bundled synthetic app `apps/demo-booking`. No client application, production system, real customer
data or real client Jira is used. The workflow rules are in [`_WORKFLOW.md`](_WORKFLOW.md) (**DRAFT — pending QE-lead
approval**) and the Stage skills in [`.cursor/skills/`](.cursor/skills).

| Use case | Input | Output | Week-1 scope |
|---|---|---|---|
| UC1 | Jira initiative/epic | Stage-1 analysis, Stage-2 Zephyr-ready cases, design scaffolds, coverage, gaps | Epic `AQPI-2` (15 cases) |
| UC2 | Approved Stage-2 cases | Playwright TypeScript with Page Objects + playbook data, 5-run flake report | 3 cases (TC-AQPI-2-01, -02, -06) |

## Run it

```bash
cd eqe-poc
npm install && npx playwright install chromium
npm run jira -- AQPI-2        # Stage-1 input: epic, stories, AC/BR IDs (export snapshot unless JIRA_* set)
npm run build:artifacts       # HTML tracker, Stage-1/2 xlsx, scaffolds, coverage matrix, gap register, metrics
npm run test:e2e              # UC2 specs against demo-booking (started automatically on :4300)
npm run flake                 # 5 consecutive runs -> evidence/uc2/flake-report.{json,md}
npm run metrics               # UC1/UC2 thresholds computed from the artifacts
npm run compare:golden        # once golden-set/AQPI-2.golden.json is authored by the QE lead
npm run lint && npm run typecheck && npm test
```

UI: `cd ../agentic-qe-mvp && npm start`, then open `http://localhost:3000/#/eqe` (Run · By Jira item · Compare report ·
Gap register · Governance). Gate decisions are recorded there by people (`POST /api/eqe/approvals`).

Live dummy Jira is used only when `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` are all set (sandbox site only;
never commit them). Otherwise the export snapshot in `agentic-qe-mvp/fixtures/jira` is read.

## Layout

```
_WORKFLOW.md                       draft workflow (gates, lens, locator order, G1–G20 gap categories)
.cursor/skills/stage-{1,2,3}-*/    Stage skills
apps/demo-booking/                 synthetic SUT (server-authoritative validation, config-driven limits)
design/AQPI-1/AQPI-2/              stage-1.json (requirements, risk, gaps), stage-2.json (scenarios, cases, journeys)
golden-set/                        human-authored benchmark (pending) + template
pages/demo-booking/                Page Objects (role/label locators only)
tests/demo-booking/                UC2 Playwright specs (@case / @traces tags)
test-data/                         synthetic test-data playbook (relative dates, no PII)
artifacts/AQPI-1/                  generated UC1 artifacts
evidence/                          governance trail, metrics, flake report, runbook, env plan, demo notes, screenshots
```

## Status

Metrics that need people (golden-set recall, review time, approvals) are reported as **pending** until a QE lead
records them; nothing is typed in. See [`evidence/recommendation.md`](evidence/recommendation.md).
