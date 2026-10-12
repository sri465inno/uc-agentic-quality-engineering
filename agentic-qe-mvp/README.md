# Agentic QE Platform - MVP

A standalone MVP of the Agentic QE Platform. The platform chains **seven agents** (requirements, test design, test data, automation, execution, defects, reporting). The requirements agent normalises every input into one common requirement set, each requirement carrying its business rule, exact values and source quotes, so a BA, PO or QE reviews the functionality in one place and is built to take many input types (Jira, Confluence/BRDs, API contracts, existing test suites, defect history, designs...). This MVP implements exactly **three inputs** - a Jira initiative, a Jira epic and a codebase - and demonstrates two flows on one complex capability:

**Demo capability: travel-advisor commission for Aurora Hotels**, calculated from a reservation that carries **1000 attributes** (20 groups x 50, 11 of them commission drivers: status, nights, revenue parts, channel, IATA, loyalty payment, rate plan, room count).

1. **Flow 1 - Baseline cycle.** `COM-1` initiative + `COM-10` epic (story `COM-11`) + codebase branch `demo/commission-engine` -> deterministic 3-way normalisation (Jira-only / code-only / conflicts; GDS uplift is 2% in Jira but 1.5% in code) -> human review -> seven agents -> real Playwright run. The 1.0 engine has a genuine defect: a stay of exactly 7 nights gets no long-stay bonus (code checks `> 7`, the rule says "7 or more"), so that case fails and is raised as a defect.
2. **Flow 2 - Incremental cycle.** Pick the approved baseline, add the `COM-20` epic + codebase branch `demo/commission-engine-v2` -> delta `10 unchanged · 1 enhanced · 3 new` (cap USD 500 -> USD 750; new: group flat 8% for 10+ rooms, package commission on 70% of the price, corporate flat 5%) -> only enhanced + new are designed (the cap assertion becomes `toBe(750)`) -> human merge approval -> re-execution -> Cycle 2 report + cycle comparison.

## Run

```bash
npm install
npx playwright install chromium   # headless browser for the UI specs
npm start                         # http://localhost:3000  (PORT, DATA_DIR env vars optional)
npm test                          # acceptance tests (node --test)
npm run lint                      # node --check on every JS file
```

Node 20+.

## What is real and what is recorded

| Thing | Status |
| --- | --- |
| Jira initiative / epics | Jira REST API v3 JSON published on branch `demo/jira-export` of `sri465inno/uc-agentic-quality-engineering` (`jira/*.json`): the hotel backlog `AQPI-1` to `AQPI-36`, exported from the AQPI space on `tcs-team-ou6drgfr.atlassian.net`, plus the older synthetic `COM-*` test issues. The Run page reads this export from GitHub by default (`Jira export on GitHub`); a recorded copy is in `fixtures/jira` for offline runs (`recorded fixture`). Live Jira calls happen only when `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` are all set (`live Jira call`). |
| Codebase | The Aurora commission engine on branches `demo/commission-engine` (1.0) and `demo/commission-engine-v2` (2.0) of the same repo. `github` mode does a shallow `git clone` of the branch (plus a diff against the baseline branch for v2); `sample` mode reads the recorded snapshot in `fixtures/github/<branch>` (GitHub REST API shapes), made by `npm run record-github`. Both are labelled. |
| Normalisation, delta, coverage, pass/fail, defects | Computed in code (`src/normalise.js`, `src/delta.js`, `src/coverage.js`, `src/execution.js`, `src/defects.js`) and covered by tests. |
| Execution | Real: generated specs are written to `data/runs/<cycle>/` and run by the Playwright CLI (headless) against a bundled copy of the engine for the cycle's branch (`samples/commission-engine/{baseline,v2}`, started by `sut/server.js`); the JSON report is parsed. Each spec builds a full 1000-attribute reservation from the engine's own `/api/data-dictionary` and overrides only the drivers under test. |
| Seeded defect | `samples/commission-engine/*/src/commission.js` applies the long-stay bonus only for `nights > 7`, so the exactly-7-nights case genuinely fails in both cycles (defect `still open` in Cycle 2). |
| Attribute coverage | The report shows which of the commission-driving attributes are varied by at least one test case, and with what real result. |
| AI in the agents | Optional; see "AI across the agents" below. Without a model key every agent runs rule-based (the app says `AI: off`) and the report narrative comes from a template (demo mode). |

## AI across the agents

AI suggests, code checks, people approve. Set one provider (`src/ai.js`); with none set, or with `AI_DISABLED=1`, the platform runs rule-based and every result below is unchanged.

| Variable | Default | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` | `claude-sonnet-4-5`, `https://api.anthropic.com` | used first when set |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | `gpt-4o`, `https://api.openai.com/v1` | any OpenAI-compatible endpoint (Azure OpenAI, vLLM, ...) |
| `AI_TIMEOUT_MS`, `AI_CONCURRENCY` | `90000`, `4` | per call; parallel calls |
| `AI_DISABLED` | unset | `1` forces rule-based mode |
| `AI_CASSETTE` | unset | JSON file of model replies keyed by prompt hash: recorded while a model is set, replayed when none is, so a demo repeats exactly |

| Step | What the model adds (labelled AI-suggested) | What code still decides |
| --- | --- | --- |
| Normalise | Pairs a Jira-only and a code-only statement of the same story that state the same rule in different words (e.g. AQPI-15 cart expiry) | Story scope, confidence >= 0.6, ids; values compared in code, so different values stay a conflict |
| Review agent | Ambiguous, untestable or incomplete statements, with suggested wording | Advisory only; the human approves |
| 1 Requirements | Plain-language title, summary, Given/When/Then | Rejected if it states a number the sources do not |
| 2 Test design | Extra negative, edge, exploratory, integration scenarios | Kept manual and traced to the requirement; duplicates dropped |
| 3 Test data | Fictitious guest personas | Every value checked against the data dictionary; e-mails only on example.com/org/net |
| 4 Automation | Draft Playwright specs for manual cases, from the API contract of the codebase | Must compile, assert, avoid require/process/eval and call only endpoints the controllers declare (`src/contracts.js`); runs only after a QE accepts it, and its failures need QE confirmation before they block a release or reach Jira |
| 5 Execution | Failure triage (product defect, test issue, environment) | Pass/fail, evidence and counts come only from the Playwright run |
| 6 Defects | Summary, steps to reproduce, likely cause, impact | Raised only from real failures; expected/actual/severity from the run |
| 7 Reporting | Narrative, risks, recommendation | Every figure computed in code; a draft with an unknown number falls back to the template |

Each cycle stores its AI call log on `cycle.ai` (agent, purpose, model, prompt hash, ok, accepted, rejected; never the key). It is shown under Artifacts and Report, and exported to the report's `AI activity` sheet. `test/ai.test.js` runs both flows against a stand-in model.

## Adaptive platform: what it learns

Switched off by default for now: start the server with `AQE_LEARNING=on` to turn it on. When off, no memory is read or written, cycles carry no `learned` section, the feedback endpoint returns 404, and the report has no `Adapted this cycle` section or sheet. The Learning page and the Test Lab are not in the menu (the Test Lab API, `/api/lab`, is unchanged).

`src/learning.js` keeps a memory across cycles in `data/learning.json` (cleared by "Reset the demo"). It is exposed as `GET /api/learning`, and when on every cycle shows an **Adapted this cycle** panel, also in the cycle report and its `Adapted this cycle` Excel sheet.

| It remembers | From | The next cycle |
| --- | --- | --- |
| How a reviewer settled a conflict, and excluded statements | Human review | Pre-fills the same choice; the reviewer still approves |
| Rows rejected at the merge gate, rejected AI cases and scripts | Merge gate, Reject buttons | Does not offer the same suggestion again; the AI is told what was rejected |
| Accepted AI cases and scripts | Accept buttons | An accepted script is re-checked against the API contract and runs for the same case |
| Defects, their story, requirement and code area | Defect agent, retests | Test cases of that requirement run at High priority (`risk: defect-history`); the AI is asked for more negative and boundary cases |
| "Not a defect" and "Confirm" | Defect buttons | The same failure needs QE confirmation before it blocks the release or is raised in Jira |

Feedback: `POST /api/cycles/:id/feedback` with `{ target: requirement|testcase|script|defect, id, verdict: accept|reject|confirm|not-a-defect, note, by }`. `test/learning.test.js` covers the learning loop with AI off and on.

## Testing types: EQE and DQE

Pick one per cycle on the Run page (`testingType: eqe | functional`, where `functional` is DQE, domain functional; default `functional` for the API). Each track has its own sign-off owner: the EQE lead for enterprise assurance, the DQE lead for domain certification. A Flow 2 cycle inherits the type of its baseline. The type drives every agent, the skills, the hand-over and the reports.

| | EQE (enterprise end-to-end business flows) | DQE (domain functional: rules) |
| --- | --- | --- |
| Test design | Business journeys across the services (search, select, offers, cart, checkout, confirmation), screens, enterprise quality checks the inputs state | Every business rule with its exact value, boundaries and negative cases, through the service API |
| Suites | `journey`, `ui`, `nfr`, `load` | `api` |
| Hand-over | `journeys` | `ruleChecks` |
| Evidence | Each step's request and response (screenshots where a screen exists) | Each request and response |

## Gaps: Jira stories the code does not implement

The requirements agent reads the Jira story keys the codebase mentions (`@story AQPI-n` tags). A Jira story with acceptance criteria but no code mentioning it is a **gap** (`src/gaps.js`), one finding per story, Minor. Release 1.0 (`demo/hotel-booking-platform`) leaves out AQPI-8, AQPI-13 and AQPI-22; release 2.0 implements them. Code-only statements and different values are not gaps (they stay "code only" and "conflict").

At human review the gap stories are pre-ticked to exclude. Approving raises one Minor, non-blocking gap defect per excluded story and keeps the story in the baseline as skipped. "Reject requirement set" (needs a reviewer name) raises the gap defects and stops the cycle with no baseline. Flow 2 picks the skipped stories up again; when their tests pass, the gap defect is closed as fixed and retested.

## Cycle, Reporting and Traceability pages

- **Cycle page:** inputs considered, the process workflow and, once gap analysis is done, the gap summary. Artifacts open from the workflow tiles.
- **Reporting:** a cycle summary (testing type, inputs, counts, pass rate, defects, gaps, go/no-go), then the detailed report: 1 cycle outcome and exit criteria (met / not met / open, with the track's sign-off owner), 2 execution evidence with an evidence check that recounts each report figure from the stored cycle, 3 business-flow readiness by epic, 4 defects and risks. The QE lead report, full cycle report and downloads are still there.
- **Traceability** (`#/traceability?cycle=CYC-n&by=journey|requirement|testcase|script|defect`): requirement, Jira story, test case, test data, automation script, result and defect for one cycle, built from `src/traceability.js`. EQE cycles add a business-journey view with the capabilities (epics) each journey crosses.

## Layout

- `src/platform.js` - the seven agents, platform input types vs the three MVP inputs, demo scenario
- `src/connectors` - Jira (live Jira, GitHub-hosted export, or fixture) and codebase (git clone of a GitHub branch, or recorded snapshot)
- `src/extract.js`, `src/text.js` - statement extraction and value parsing
- `src/normalise.js`, `src/delta.js` - deterministic comparison engines
- `src/agents` - requirements (with their business rules), test design and Playwright script generation
- `src/execution.js`, `src/defects.js`, `src/coverage.js` - real execution and its consequences
- `src/pipeline.js` - fixed-order cycle orchestration with review and merge gates
- `src/report.js`, `src/compare.js`, `src/excel.js` - report, comparison, xlsx exports
- `src/store.js` - JSON persistence under `data/` (survives restarts)
- `public/` - plain HTML/CSS/JS UI; `samples/commission-engine` - the sample codebase (source of the demo branches) and system under test; `scripts/` - generators for the data dictionary, Jira export and recorded GitHub snapshots; `test/` - acceptance tests

## Skills

`skills/*.md` are markdown skill files with YAML front matter (`id`, `name`, `description`, `appliesTo`, `delivers`), loaded at startup by `src/skills.js`. Adding a file adds a skill; no code change is needed.

- A skill's body is handed only to the agents listed in `appliesTo` (`normalise`, `delta`, `requirements`, `testcases`, `scripts`, `execution`, `defects`, `report`). Skills written for the former `rules` agent load as `requirements`.
- After a phase runs, `src/handover.js` reads what it actually produced from the persisted cycle and checks it against every active skill's `delivers[phase]`. A missing or empty artefact makes the hand-over `incomplete`, and the phase card and cycle report show it. A comparison on a baseline cycle is reported as `n/a`, not as delivered.
- Skills are selected per run on the Run page, and all are on by default. The selected skills (text and hash) are stored on the cycle.
- The test case Excel column order comes from the report-targeted skill that declares one (`test-case-authoring.md`).
