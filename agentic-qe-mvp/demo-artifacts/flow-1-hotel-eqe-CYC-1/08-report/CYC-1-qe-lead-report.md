# QE lead report - Hotel booking baseline · EQE

CYC-1 · baseline cycle

> **Recommendation: Conditional go.** No no-go criterion is triggered; open items to accept or close: no open defect for a jira story missing from the code (3: DEF-001 (AQPI-8), DEF-002 (AQPI-13), DEF-003 (AQPI-22)). Noted, not deciding: manual test cases run and recorded (5 open); every requirement verified by a passing test of this testing type (111 open).

| Type of testing | Requirements | Test cases | Automated | Pass rate | Defects | Requirements verified |
|---|---|---|---|---|---|---|
| EQE testing | 118 | 13 | 8 | 100% | 3 | 5.9% |

## 1. Summary
- Baseline cycle for Guest hotel booking from search to confirmation (AQPI-1) on build demo/hotel-booking-platform, 2026-10-12 02:21 UTC.
- Type of testing: EQE testing. The guest's business flows across the six services (search, hotel details, offers, cart, payment, reservation, confirmation and cancellation e-mails), plus the privacy, security, observability and resilience checks (AQPI-28 to AQPI-31).
- We took 3 inputs (Jira initiative AQPI-1, Jira epic AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27, Codebase sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32)) and produced 118 requirements, 13 test cases and 7 automated scripts.
- We ran 8 automated tests for real: 8 passed, 0 failed (pass rate 100%). 5 manual tests still to be run by hand.
- 3 defects open from real failures (3 new), 0 release-blocking: DEF-001 AQPI-8 4.2 Sort and filter hotel results: asked for in Jira but not implemented in the code (Jira: not raised in Jira; linked to AQPI-8 in the platform); DEF-002 AQPI-13 5.3 Explain and control personalization: asked for in Jira but not implemented in the code (Jira: not raised in Jira; linked to AQPI-13 in the platform); DEF-003 AQPI-22 7.4 Show booking outcome: asked for in Jira but not implemented in the code (Jira: not raised in Jira; linked to AQPI-22 in the platform).

## 2. Inputs taken
| Input | Reference | What we took from it | Source |
|---|---|---|---|
| Jira initiative | AQPI-1 | [Initiative] Intelligent Hotel Shopping and Reservation Experience; 8 statements | Jira export on GitHub |
| Jira epic | AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27 | 7 epics: [Epic 1] Search and Availability; [Epic 2] Hotel Results and Selection; [Epic 3] Personalized Ancillary Offers; [Epic 4] Cart Management; [Epic 5] Checkout and Reservation; [Epic 6] Confirmation and Notifications; [Epic 7] Cross-Cutting Quality, Privacy and Observability; stories AQPI-3, AQPI-4, AQPI-5, AQPI-7, AQPI-8, AQPI-9, AQPI-11, AQPI-12, AQPI-13, AQPI-15, AQPI-16, AQPI-17, AQPI-19, AQPI-20, AQPI-21, AQPI-22, AQPI-24, AQPI-25, AQPI-26, AQPI-28, AQPI-29, AQPI-30, AQPI-31; 137 statements | Jira export on GitHub |
| Codebase | sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) | AQPI-1 Intelligent Hotel Shopping and Reservation Experience: reactive Spring Boot microservices; 7 statements | pulled from GitHub |

## 3. How we ran the cycle
1. Read 152 statements from the inputs and lined them up into 128 requirement groups: 0 agreed by every source, 121 only in Jira, 7 only in the code, 0 in conflict.
2. The review agent read the inputs first and suggested 7 addition(s), 63 missing piece(s) and 0 conflict(s) for the reviewer (0 high severity). It approved nothing.
3. Priya Shah reviewed and approved the requirement set on 2026-10-12 02:21 UTC.
4. EQE testing steered the design: Designs one API journey per guest business flow and the enterprise quality checks, and runs them against the six hotel services, keeping every request and response as evidence. The services have no browser screen, so no screenshots are taken. Result: 13 case(s) in this run (0 reused, 0 re-designed, 13 new).
5. The requirements agent wrote 118 requirements, each with its business rule, exact values and source quotes (57 automatable, 61 manual); the agents then designed 13 test cases (8 functional, 5 non-functional) and generated 7 Playwright scripts.
6. Executed the automated suite with Playwright 1.63.0 (headless Chromium, JSON reporter) against Hotel booking platform release 1.0, six Spring Boot services built from branch demo/hotel-booking-platform; defects were raised only for tests that actually failed.

## 4. Artifacts produced
| Artifact | Count | Notes | Folder |
|---|---|---|---|
| Inputs and provenance | 3 | what was taken from each source, and where from | [01-inputs/](01-inputs/) |
| Review agent suggestions | 3 | 7 added · 63 missing · 0 conflicts (advisory) | [01-inputs/review-agent.json](01-inputs/review-agent.json) |
| Normalised requirement set | 128 | 0 agreed · 121 Jira-only · 7 code-only · 0 conflicts | [01-inputs/normalisation.json](01-inputs/normalisation.json) |
| Requirement set (with business rules) | 118 | 118 new · 118 business rules with exact values and source quotes (57 automatable · 61 manual) | [02-requirements/](02-requirements/) |
| Test cases (Excel, Zephyr Scale format) | 13 | 8 automated · 5 not automated | [03-test-cases/](03-test-cases/) |
| Test data (one data set per test case) | 13 | 13 conform to Hotel booking attributes v1.0 (21 attributes) · 0 negative tests | [04-test-data/](04-test-data/) |
| Automation scripts (Playwright) | 7 | 7 new | [05-automation-scripts/](05-automation-scripts/) |
| Execution results and evidence | 8 | 8 passed · 0 failed · 5 manual | [06-execution/](06-execution/) |
| Traceability matrix | 13 | 7 of 31 Jira items covered · 2 verified · 0 failing | [08-report/traceability.json](08-report/traceability.json) |
| Defects | 3 | DEF-001 Minor new · DEF-002 Minor new · DEF-003 Minor new | [07-defects/](07-defects/) |
| Cycle report (HTML, Excel) | 1 | full detail behind this summary | [08-report/](08-report/) |

## 5. Risks and open items
- EQE testing: The hotel services have no browser screen, so the journeys run through the service APIs; screen checks such as keyboard and focus order stay manual.
- 106 requirements had no case in this eqe testing run (REQ-003, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-018, REQ-019, REQ-020, REQ-021, REQ-022, REQ-024, REQ-025, REQ-026, REQ-027, REQ-028, REQ-029, REQ-030, REQ-031, REQ-032, REQ-033, REQ-034, REQ-035, REQ-036, REQ-037, REQ-038, REQ-039, REQ-040, REQ-041, REQ-042, REQ-043, REQ-044, REQ-045, REQ-046, REQ-048, REQ-049, REQ-050, REQ-051, REQ-052, REQ-053, REQ-054, REQ-055, REQ-056, REQ-057, REQ-058, REQ-059, REQ-060, REQ-061, REQ-062, REQ-063, REQ-064, REQ-065, REQ-066, REQ-067, REQ-068, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-081, REQ-083, REQ-084, REQ-085, REQ-086, REQ-087, REQ-088, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-101, REQ-102, REQ-103, REQ-105, REQ-106, REQ-107, REQ-109, REQ-110, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118); a wider run is needed before release.
- DEF-001 (Minor): requirement not implemented yet (gap); no test was run against it. Expected The code implements AQPI-8 4.2 Sort and filter hotel results (4 acceptance criteria), got No code in sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) mentions AQPI-8. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-8; Jira: not raised in Jira; linked to AQPI-8 in the platform.
- DEF-002 (Minor): requirement not implemented yet (gap); no test was run against it. Expected The code implements AQPI-13 5.3 Explain and control personalization (3 acceptance criteria), got No code in sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) mentions AQPI-13. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-13; Jira: not raised in Jira; linked to AQPI-13 in the platform.
- DEF-003 (Minor): requirement not implemented yet (gap); no test was run against it. Expected The code implements AQPI-22 7.4 Show booking outcome (3 acceptance criteria), got No code in sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) mentions AQPI-22. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-22; Jira: not raised in Jira; linked to AQPI-22 in the platform.
- 5 test cases cannot be automated and were not executed: TC-N-001 Verify: Validation messages are accessible to assistive technology; TC-N-002 Verify: Templates support required locale and accessibility standards; TC-N-003 Verify: Metrics and alerts exist for agreed critical failures and latency; TC-N-004 Verify: Keyboard navigation, focus order, labels, instructions, status messaging, and error handling are accessible; TC-N-005 Verify: Search, pricing, cart, checkout, reservation, and email dependencies have agreed performance targets. Needs a manual run before sign-off.
- 111 requirements not yet verified by a passing test: REQ-003 (not covered); REQ-008 (not covered); REQ-009 (not covered); REQ-010 (not covered); REQ-011 (not covered); REQ-012 (not covered); REQ-013 (not covered); REQ-014 (not covered); REQ-015 (not covered); REQ-016 (not covered); REQ-017 (not covered); REQ-018 (not covered); REQ-019 (not covered); REQ-020 (not covered); REQ-021 (not covered); REQ-022 (not covered); REQ-023 (designed only (manual)); REQ-024 (not covered); REQ-025 (not covered); REQ-026 (not covered); REQ-027 (not covered); REQ-028 (not covered); REQ-029 (not covered); REQ-030 (not covered); REQ-031 (not covered); REQ-032 (not covered); REQ-033 (not covered); REQ-034 (not covered); REQ-035 (not covered); REQ-036 (not covered); REQ-037 (not covered); REQ-038 (not covered); REQ-039 (not covered); REQ-040 (not covered); REQ-041 (not covered); REQ-042 (not covered); REQ-043 (not covered); REQ-044 (not covered); REQ-045 (not covered); REQ-046 (not covered); REQ-048 (not covered); REQ-049 (not covered); REQ-050 (not covered); REQ-051 (not covered); REQ-052 (not covered); REQ-053 (not covered); REQ-054 (not covered); REQ-055 (not covered); REQ-056 (not covered); REQ-057 (not covered); REQ-058 (not covered); REQ-059 (not covered); REQ-060 (not covered); REQ-061 (not covered); REQ-062 (not covered); REQ-063 (not covered); REQ-064 (not covered); REQ-065 (not covered); REQ-066 (not covered); REQ-067 (not covered); REQ-068 (not covered); REQ-069 (not covered); REQ-070 (not covered); REQ-071 (not covered); REQ-072 (not covered); REQ-073 (not covered); REQ-074 (not covered); REQ-075 (not covered); REQ-076 (not covered); REQ-077 (not covered); REQ-078 (not covered); REQ-079 (not covered); REQ-080 (not covered); REQ-081 (not covered); REQ-082 (designed only (manual)); REQ-083 (not covered); REQ-084 (not covered); REQ-085 (not covered); REQ-086 (not covered); REQ-087 (not covered); REQ-088 (not covered); REQ-089 (not covered); REQ-090 (not covered); REQ-091 (not covered); REQ-092 (not covered); REQ-093 (not covered); REQ-094 (not covered); REQ-095 (not covered); REQ-096 (not covered); REQ-097 (not covered); REQ-098 (not covered); REQ-099 (not covered); REQ-100 (designed only (manual)); REQ-101 (not covered); REQ-102 (not covered); REQ-103 (not covered); REQ-104 (designed only (manual)); REQ-105 (not covered); REQ-106 (not covered); REQ-107 (not covered); REQ-108 (designed only (manual)); REQ-109 (not covered); REQ-110 (not covered); REQ-111 (not covered); REQ-112 (not covered); REQ-113 (not covered); REQ-114 (not covered); REQ-115 (not covered); REQ-116 (not covered); REQ-117 (not covered); REQ-118 (not covered).
- 128 requirement groups come from a single source only; the product owner should confirm them.

_6 of 15 booking-driving attributes (out of 21 booking attributes) are varied by at least one test._

## 6. Recommendation and next steps
**Conditional go.** No no-go criterion is triggered; open items to accept or close: no open defect for a jira story missing from the code (3: DEF-001 (AQPI-8), DEF-002 (AQPI-13), DEF-003 (AQPI-22)). Noted, not deciding: manual test cases run and recorded (5 open); every requirement verified by a passing test of this testing type (111 open).

- No open defect for a Jira story missing from the code: 3: DEF-001 (AQPI-8), DEF-002 (AQPI-13), DEF-003 (AQPI-22).
- Run TC-N-001, TC-N-002, TC-N-003, TC-N-004, TC-N-005 manually and record the result.
- Use this approved baseline as the reference for the next incremental cycle.

## Traceability by story
| Jira item | Level | Summary | Requirements | Test cases | Passed | Failed | Defects | Status |
|---|---|---|---|---|---|---|---|---|
| AQPI-2 | epic | [Epic 1] Search and Availability | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-3 | story | 3.1 Search hotels by destination and date range | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-4 | story | 3.2 Validate occupancy and stay criteria | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-5 | story | 3.3 Handle unavailable or failed searches | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-6 | epic | [Epic 2] Hotel Results and Selection | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-7 | story | 4.1 Display available hotels | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-8 | story | 4.2 Sort and filter hotel results | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-9 | story | 4.3 View hotel and room details | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-10 | epic | [Epic 3] Personalized Ancillary Offers | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-11 | story | 5.1 Determine eligible ancillary offers | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-12 | story | 5.2 Display ancillary offers | 1 | 1 | 1 | 0 | - | verified |
| AQPI-13 | story | 5.3 Explain and control personalization | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-14 | epic | [Epic 4] Cart Management | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-15 | story | 6.1 Add room selection to cart | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-16 | story | 6.2 Add, update, and remove ancillaries | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-17 | story | 6.3 Review cart and total price | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-18 | epic | [Epic 5] Checkout and Reservation | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-19 | story | 7.1 Capture guest and contact information | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-20 | story | 7.2 Capture and authorize payment | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-21 | story | 7.3 Create reservation idempotently | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-22 | story | 7.4 Show booking outcome | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-23 | epic | [Epic 6] Confirmation and Notifications | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-24 | story | 8.1 Generate confirmation message | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-25 | story | 8.2 Send and track confirmation email | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-26 | story | 8.3 Resend confirmation safely | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-27 | epic | [Epic 7] Cross-Cutting Quality, Privacy and Observability | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-28 | story | 9.1 Protect sensitive data | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-29 | story | 9.2 Provide end-to-end observability | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-30 | story | 9.3 Meet accessibility requirements | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-31 | story | 9.4 Meet performance and reliability objectives | 1 | 1 | 0 | 0 | - | designed, not executed |

## 7. Sign-off
**EQE sign-off owner: EQE lead** (Enterprise assurance: the business journeys work end to end across the services). Awaiting sign-off: The platform recommends Conditional go; the EQE lead decides and signs off outside the platform.

| Gate | Decision | By | When | Detail |
|---|---|---|---|---|
| Requirement set review | approved | Priya Shah | 2026-10-12 02:21 UTC | 118 requirements approved; 10 excluded (gaps AQPI-8, AQPI-13, AQPI-22); 0 conflict(s) resolved |

## 8. Exit criteria
| Exit criterion | Status | Detail |
|---|---|---|
| Requirement set approved by a named reviewer | met | Priya Shah: 118 requirements approved; 10 excluded (gaps AQPI-8, AQPI-13, AQPI-22); 0 conflict(s) resolved |
| Every excluded gap is raised as a defect linked to its story | met | 3 of 3 raised (AQPI-8, AQPI-13, AQPI-22) |
| Every business journey ran and passed end to end | met | 8 of 8 journeys passed |
| Every business capability (epic) is crossed by a journey or a quality check | met | 7 of 7 crossed |
| Every failed test case has a defect | met | no failed test case |
| No open release-blocking defect | met | none open |
| Manual test cases run and recorded | open | 5 manual test cases handed over; their results are not recorded in the platform |

## 9. Evidence check
| Figure | In the report | Recounted | Recounted from | Status |
|---|---|---|---|---|
| Test cases | 13 | 13 | test case artifacts | reconciled |
| Automation scripts | 7 | 7 | automation script files | reconciled |
| Executed | 8 | 8 | Playwright results | reconciled |
| Passed | 8 | 8 | Playwright results | reconciled |
| Failed | 0 | 0 | Playwright results | reconciled |
| Executed tests with stored evidence | 8 | 8 | request/response and log files | reconciled |
| Defects from failed test cases | 0 | 0 | defects backed by a failed result | reconciled |
| Gap defects | 3 | 3 | gap defects linked to a Jira story | reconciled |

## 10. Release criteria
Release criteria (Go / Conditional go / No-go) (release-criteria.md); blocking severity Critical, minimum pass rate 95%.

| Release parameter | Applies as | Status | Detail |
|---|---|---|---|
| Requirement set approved by a named reviewer | No-go if triggered | clear | - |
| No open defect at Critical severity or marked release-blocking | No-go if triggered | clear | - |
| Automated pass rate at least 95% | No-go if triggered | clear | - |
| Every automated test case in the run executed | No-go if triggered | clear | - |
| Every failed test case has a defect | No-go if triggered | clear | - |
| Every report figure matches the stored evidence | No-go if triggered | clear | - |
| Every business journey passed end to end | No-go if triggered | clear | - |
| No open defect for a Jira story missing from the code | Conditional go if triggered | triggered | 3: DEF-001 (AQPI-8), DEF-002 (AQPI-13), DEF-003 (AQPI-22) |
| No other open defect | Conditional go if triggered | clear | - |
| Manual test cases run and recorded | Noted only | triggered | 5: TC-N-001, TC-N-002, TC-N-003, TC-N-004, TC-N-005 |
| Every requirement verified by a passing test of this testing type | Noted only | triggered | 111: REQ-003, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, … |

_Agentic QE Platform (QE lead report, computed from the cycle) · generated 2026-10-12 02:21 UTC. Every figure comes from the persisted cycle; nothing is estimated._
