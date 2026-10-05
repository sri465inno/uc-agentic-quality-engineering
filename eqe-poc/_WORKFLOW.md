# _WORKFLOW.md — EQE 5-stage QE lifecycle (DRAFT)

> **Status: DRAFT — pending QE-lead approval.**
> The PoC brief names `_WORKFLOW.md` in the EQE source repo as the source of truth. That file wasn't
> available to this PoC, so this draft restates the rules quoted in the brief. If the original file
> turns up, replace this one with it; where the two differ, the original wins.

## 1. Lifecycle

| # | Stage | Input | Output | Human gate (HITL) |
|---|-------|-------|--------|-------------------|
| 1 | Cognitive Analysis | Jira initiative + linked epics/stories (+ approved Confluence) | BRD pack: requirements, ACs, rules, risks, traceability (`Stage - 1 Requirement & details.xlsx`, `<INITIATIVE-ID>-analysis-and-progress.html`) | QE lead validates scope |
| 2 | Intelligent Design | Approved Stage-1 analysis | E2E scenarios, cases, steps, expected results, guest journeys; Jira/Zephyr-ready (`Stage - 2 Test Scenarios & Test cases.xlsx`, one `*.spec.ts` design scaffold per case) | QE lead approves cases |
| 3 | Self-Adaptive Automation | Approved cases + framework | Runnable Playwright TypeScript reusing Page Objects; dry run; refine | Human reviews code + run |
| 4 | Orchestrated Execution | — | **COMING SOON — out of PoC scope** | — |
| 5 | Insight Reporting | — | **COMING SOON — out of PoC scope** | — |

A stage starts only after the human gate before it is approved and recorded in `evidence/governance-trail.md`.

## 2. Design rules

- **Key-element-only E2E lens.** A case asserts only what the guest can see and act on (page outcome, key fields,
  messages). It does not assert logs, internal services or styling.
- **Happy-path default (G3).** Negative and edge cases are only designed when the initiative, epic or a human asks
  for them. Each such case must cite the request.
- **Traceability.** Every case cites at least one acceptance-criterion ID (`<STORY>-AC<n>`) or business-rule ID
  (`<STORY>-BR<n>`). Each cited ID carries the verbatim Jira text it relies on (grounding).
- **No invention.** A requirement, value or behaviour that isn't in an approved source goes to the gap register,
  not into a case.
- **Zephyr-ready.** Cases carry: Key, Name, Objective, Precondition, Priority, Labels, Component, Coverage (issue
  keys), Test Script (Step / Test Data / Expected Result).

## 3. Automation rules

- **Locator preference:** `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS/XPath (last resort, with
  a comment explaining why).
- **Reuse over regenerate (G5–G7).** Use an existing Page Object/locator if there is one (G5). Captured locators
  are refactored into `pages/<app>/` Page Objects. Specs never hold raw locators (G6). Shared flows live in Page
  Object methods, not copied into specs (G7).
- **Test data** comes only from the test-data playbook (`test-data/<app>.playbook.json`), never inline literals.
  Only synthetic data is allowed.
- **Dry run** against the Stage-equivalent environment before human review. A refine loop follows the review.
- **Stability:** flake rate under 5% over 5 consecutive runs before scale-up.

## 4. Artifact layout

```
design/<INITIATIVE>/<EPIC>/stage-1.json      Devin-authored analysis (source of Stage-1 artifacts)
design/<INITIATIVE>/<EPIC>/stage-2.json      Devin-authored test design
design/<INITIATIVE>/initiative.json           epics in scope (scaling gated by UC1-GATE1)
artifacts/<INITIATIVE>/                      generated: tracker HTML, Stage-1/2 xlsx, scaffolds/, coverage matrix, gap register, metrics
golden-set/<EPIC>.golden.json                human-authored golden cases (12–15)
pages/<app>/                                 Page Objects
tests/<app>/                                 Stage-3 Playwright specs
test-data/<app>.playbook.json                synthetic test-data playbook
evidence/                                    governance trail, runbook, environment plan, flake report, demo notes
```

## 5. Gap log (G1–G20)

G1–G20 are the gap categories used in the gap register. Wording for G3 and G5–G7 comes from the brief. The rest
are working definitions **pending confirmation against the original `_WORKFLOW.md`**.

| ID | Gap |
|----|-----|
| G1 | Acceptance criterion not testable as written (ambiguous / no observable outcome) |
| G2 | Missing concrete value (limit, threshold, configuration) |
| G3 | Negative/edge path not requested — happy-path default applied |
| G4 | Behaviour not observable through the UI (logging, audit, back-end only) |
| G5 | Reusable component exists and must be used instead of generating new code |
| G6 | Captured locator must be refactored into a Page Object |
| G7 | Duplicated flow must be extracted into a shared Page Object method |
| G8 | Requires Stage 4/5 capability (execution orchestration, reporting) — out of scope |
| G9 | Process/acceptance item (Definition of Done, PO sign-off), not a test |
| G10 | Accessibility check needs tooling beyond key-element assertions |
| G11 | Non-functional (performance/reliability) — needs a dedicated test type |
| G12 | Dependency not available in the Stage-equivalent environment |
| G13 | Test data not available in the test-data playbook |
| G14 | Conflicting statements between sources |
| G15 | Configuration value owned by market/property — needs confirmation |
| G16 | Security/privacy check outside the UI lens |
| G17 | Duplicate case candidate |
| G18 | Missing negative case where one was requested |
| G19 | Traceability link missing in source (story without ACs) |
| G20 | Human decision required before design can proceed |
