# _WORKFLOW.md (PROVISIONAL)

> The PoC prompt refers to a `_WORKFLOW.md` that was not available in any repository Devin could reach.
> This provisional file restates the rules from the prompt so the MVP has a single written workflow.
> **Replace it with the real `_WORKFLOW.md`** and adjust `framework/ui-map.js` / `src/stage*.js` if rules differ.

## Scope
- Stages 1-3 only: Cognitive Analysis, Intelligent Design, Self-Adaptive Automation. Stages 4-5 are shown as "coming soon".
- Synthetic data only: the bundled `demo-booking` app and the AQPI Jira export. Never a real client app, Jira or data.

## Inputs
- Jira initiative (default `AQPI-1`) with linked epics and child stories.
- Snapshot mode by default (`jira-export/`). Live dummy Jira only when `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` are set.

## Stage 1 - Cognitive Analysis
- Extract acceptance criteria, business rules and logging requirements per story.
- Classify each requirement: UI lens (key UI elements) vs Non-UI; reusable framework component or not.
- Raise gaps for ambiguous wording, Non-UI requirements and framework gaps; record risks and dependencies.
- **Gate (scope):** QE lead approves the analysed scope (timed).

## Stage 2 - Intelligent Design
- Happy path by default: one case per acceptance criterion behaviour; negative cases from business rules only on request.
- Zephyr-ready steps (action, data, expected); guest journeys; non-executable `*.spec.ts` scaffolds.
- Compare with the human-authored golden set (12-15 cases per epic).
- **Gate (cases):** every case gets a verdict (accepted / incorrect / hallucinated / duplicate); QE lead approves (timed).

## Stage 3 - Self-Adaptive Automation
- Only accepted, automatable cases. Specs reuse `pages/demo-booking` Page Objects (G5-G7: reuse before create; no raw selectors in specs).
- Locator order: `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS.
- Test data from `test-data/playbook.json` only.
- 5 dry runs; flake = a test that both passes and fails across the runs.
- **Gate (code):** automation reviewer approves the code (timed).

## Success criteria and scaling
| | Criterion | Threshold |
|---|---|---|
| UC1 | AC coverage | >= 80% |
| UC1 | Hallucination rate | <= 10% |
| UC1 | Review time per epic | < 20 min |
| UC1 | QE lead approval | required |
| UC2 | Test data mapped | >= 85% |
| UC2 | Review time per spec | < 25 min |
| UC2 | Flake rate over 5 runs | < 5% |

- Gate 1: 1 epic until a run passes UC1, then up to 6 epics.
- Gate 2: 3 cases until a run passes UC2, then more.
