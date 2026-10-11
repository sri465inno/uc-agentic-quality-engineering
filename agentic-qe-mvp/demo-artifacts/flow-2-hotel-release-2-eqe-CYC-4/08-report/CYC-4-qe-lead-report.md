# QE lead report - Hotel booking release 2.0 (AQPI-32 + AQPI-23) · EQE

CYC-4 · incremental cycle

> **Recommendation: Conditional go.** No release-blocking defects, but there are open items to accept or close.

| Type of testing | Requirements | Test cases | Automated | Pass rate | Defects | Requirements verified |
|---|---|---|---|---|---|---|
| EQE testing | 138 | 13 | 8 | 100% | 3 | 5.1% |

## 1. Summary
- Incremental cycle for Guest hotel booking from search to confirmation (AQPI-1) on build demo/hotel-booking-platform-v2, 2026-10-11 16:44 UTC.
- Type of testing: EQE testing. The guest's business flows across the six services (search, hotel details, offers, cart, payment, reservation, confirmation and cancellation e-mails), plus the privacy, security, observability and resilience checks (AQPI-28 to AQPI-31).
- We took 2 inputs (Jira epic AQPI-32, AQPI-23, Codebase sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform-v2 (fe1ce44)) and produced 138 requirements, 13 test cases and 7 automated scripts.
- We ran 8 automated tests for real: 8 passed, 0 failed (pass rate 100%). 5 manual tests still to be run by hand.
- 3 defects open from real failures (3 implemented in code, not yet verified by a test of this testing type), 0 release-blocking: DEF-001 AQPI-8 4.2 Sort and filter hotel results: asked for in Jira but not implemented in the code (Jira: not raised in Jira); DEF-002 AQPI-13 5.3 Explain and control personalization: asked for in Jira but not implemented in the code (Jira: not raised in Jira); DEF-003 AQPI-22 7.4 Show booking outcome: asked for in Jira but not implemented in the code (Jira: not raised in Jira).
- Against the baseline: 20 unchanged · 3 enhanced · 20 new. 13 of 13 test cases were reused unchanged; only new and changed items were redesigned.

## 2. Inputs taken
| Input | Reference | What we took from it | Source |
|---|---|---|---|
| Jira epic | AQPI-32, AQPI-23 | 2 epics: [Epic 8] Release 2.0 – Booking Rule Changes and Free Cancellation; [Epic 6] Confirmation and Notifications; stories AQPI-33, AQPI-34, AQPI-35, AQPI-36, AQPI-24, AQPI-25, AQPI-26, AQPI-37; 33 statements | Jira export on GitHub |
| Codebase | sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform-v2 (fe1ce44) | AQPI-1 Intelligent Hotel Shopping and Reservation Experience: reactive Spring Boot microservices; 13 statements | pulled from GitHub |

## 3. How we ran the cycle
1. Read 56 statements from the inputs and lined them up into 43 requirement groups: 9 agreed by every source, 30 only in Jira, 4 only in the code, 0 in conflict.
2. The review agent read the inputs first and suggested 27 addition(s), 15 missing piece(s) and 0 conflict(s) for the reviewer (1 high severity). It approved nothing.
3. Priya Shah reviewed and approved the requirement set on 2026-10-11 16:44 UTC.
4. Compared every statement with baseline BL-1 v1: 20 unchanged · 3 enhanced · 20 new. Changed: REQ-112 "A cart expires 30 minutes after it is created and never creates a reservation itself." → "A cart expires 20 minutes after it is created and never creates a reservation itself."; REQ-114 "A confirmation can be resent at most 3 times per booking in 24 hours." → "A confirmation can be resent at most 5 times per booking in 24 hours."; REQ-116 "A stay can be at most 30 nights; Paris (PAR) allows at most 21 nights." → "A stay can be at most 30 nights; Paris (PAR) allows at most 14 nights.".
5. EQE testing steered the design: Keeps the journeys already in the baseline, re-designs the ones whose flow changed, adds journeys for new flows, then runs the business flows on the new build. Result: 13 case(s) in this run (13 reused, 0 re-designed, 0 new).
6. The requirements agent wrote 138 requirements, each with its business rule, exact values and source quotes (72 automatable, 66 manual); the agents then designed 13 test cases (8 functional, 5 non-functional) and generated 7 Playwright scripts.
7. Sam Lee approved the merge into the baseline on 2026-10-11 16:44 UTC.
8. Executed the automated suite with Playwright 1.63.0 (headless Chromium, JSON reporter) against Hotel booking platform release 2.0, six Spring Boot services built from branch demo/hotel-booking-platform-v2; defects were raised only for tests that actually failed.

## 4. Artifacts produced
| Artifact | Count | Notes | Folder |
|---|---|---|---|
| Inputs and provenance | 2 | what was taken from each source, and where from | [01-inputs/](01-inputs/) |
| Review agent suggestions | 42 | 27 added · 15 missing · 0 conflicts (advisory) | [01-inputs/review-agent.json](01-inputs/review-agent.json) |
| Normalised requirement set | 43 | 9 agreed · 30 Jira-only · 4 code-only · 0 conflicts | [01-inputs/normalisation.json](01-inputs/normalisation.json) |
| Delta against baseline | 43 | 20 unchanged · 3 enhanced · 20 new | [01-inputs/delta-classification.json](01-inputs/delta-classification.json) |
| Requirement set (with business rules) | 138 | 95 carried over · 20 unchanged · 3 enhanced · 20 new · 138 business rules with exact values and source quotes (72 automatable · 66 manual) | [02-requirements/](02-requirements/) |
| Test cases (Excel, Zephyr Scale format) | 13 | 8 automated · 5 not automated | [03-test-cases/](03-test-cases/) |
| Test data (one data set per test case) | 13 | 13 conform to Hotel booking attributes v1.0 (21 attributes) · 0 negative tests | [04-test-data/](04-test-data/) |
| Automation scripts (Playwright) | 7 | 7 carried over | [05-automation-scripts/](05-automation-scripts/) |
| Merge approval | 1 | approved by Sam Lee | [09-merge-approval/](09-merge-approval/) |
| Execution results and evidence | 8 | 8 passed · 0 failed · 5 manual | [06-execution/](06-execution/) |
| Traceability matrix | 13 | 7 of 16 Jira items covered · 2 verified · 0 failing | [08-report/traceability.json](08-report/traceability.json) |
| Defects | 3 | DEF-001 Minor implemented in code, not yet verified by a test of this testing type · DEF-002 Minor implemented in code, not yet verified by a test of this testing type · DEF-003 Minor implemented in code, not yet verified by a test of this testing type | [07-defects/](07-defects/) |
| Cycle report (HTML, Excel) | 1 | full detail behind this summary | [08-report/](08-report/) |

## 5. Risks and open items
- EQE testing: The hotel services have no browser screen, so the journeys run through the service APIs; screen checks such as keyboard and focus order stay manual.
- 126 requirements had no case in this eqe testing run (REQ-003, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-018, REQ-019, REQ-020, REQ-021, REQ-022, REQ-024, REQ-025, REQ-026, REQ-027, REQ-028, REQ-029, REQ-030, REQ-031, REQ-032, REQ-033, REQ-034, REQ-035, REQ-036, REQ-037, REQ-038, REQ-039, REQ-040, REQ-041, REQ-042, REQ-043, REQ-044, REQ-045, REQ-046, REQ-048, REQ-049, REQ-050, REQ-051, REQ-052, REQ-053, REQ-054, REQ-055, REQ-056, REQ-057, REQ-058, REQ-059, REQ-060, REQ-061, REQ-062, REQ-063, REQ-064, REQ-065, REQ-066, REQ-067, REQ-068, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-081, REQ-083, REQ-084, REQ-085, REQ-086, REQ-087, REQ-088, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-101, REQ-102, REQ-103, REQ-105, REQ-106, REQ-107, REQ-109, REQ-110, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-134, REQ-135, REQ-136, REQ-137, REQ-138); a wider run is needed before release.
- DEF-001 (Minor): requirement not implemented yet (gap); no test was run against it. Expected Code implements AQPI-8 (4 acceptance criteria), got No code in demo/hotel-booking-platform mentions AQPI-8. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-8; Jira: not raised in Jira.
- DEF-002 (Minor): requirement not implemented yet (gap); no test was run against it. Expected Code implements AQPI-13 (3 acceptance criteria), got No code in demo/hotel-booking-platform mentions AQPI-13. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-13; Jira: not raised in Jira.
- DEF-003 (Minor): requirement not implemented yet (gap); no test was run against it. Expected Code implements AQPI-22 (3 acceptance criteria), got No code in demo/hotel-booking-platform mentions AQPI-22. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-22; Jira: not raised in Jira.
- 5 test cases cannot be automated and were not executed: TC-N-001 Verify: Validation messages are accessible to assistive technology; TC-N-002 Verify: Templates support required locale and accessibility standards; TC-N-003 Verify: Metrics and alerts exist for agreed critical failures and latency; TC-N-004 Verify: Keyboard navigation, focus order, labels, instructions, status messaging, and error handling are accessible; TC-N-005 Verify: Search, pricing, cart, checkout, reservation, and email dependencies have agreed performance targets. Needs a manual run before sign-off.
- 131 requirements not yet verified by a passing test: REQ-003 (not covered); REQ-008 (not covered); REQ-009 (not covered); REQ-010 (not covered); REQ-011 (not covered); REQ-012 (not covered); REQ-013 (not covered); REQ-014 (not covered); REQ-015 (not covered); REQ-016 (not covered); REQ-017 (not covered); REQ-018 (not covered); REQ-019 (not covered); REQ-020 (not covered); REQ-021 (not covered); REQ-022 (not covered); REQ-023 (designed only (manual)); REQ-024 (not covered); REQ-025 (not covered); REQ-026 (not covered); REQ-027 (not covered); REQ-028 (not covered); REQ-029 (not covered); REQ-030 (not covered); REQ-031 (not covered); REQ-032 (not covered); REQ-033 (not covered); REQ-034 (not covered); REQ-035 (not covered); REQ-036 (not covered); REQ-037 (not covered); REQ-038 (not covered); REQ-039 (not covered); REQ-040 (not covered); REQ-041 (not covered); REQ-042 (not covered); REQ-043 (not covered); REQ-044 (not covered); REQ-045 (not covered); REQ-046 (not covered); REQ-048 (not covered); REQ-049 (not covered); REQ-050 (not covered); REQ-051 (not covered); REQ-052 (not covered); REQ-053 (not covered); REQ-054 (not covered); REQ-055 (not covered); REQ-056 (not covered); REQ-057 (not covered); REQ-058 (not covered); REQ-059 (not covered); REQ-060 (not covered); REQ-061 (not covered); REQ-062 (not covered); REQ-063 (not covered); REQ-064 (not covered); REQ-065 (not covered); REQ-066 (not covered); REQ-067 (not covered); REQ-068 (not covered); REQ-069 (not covered); REQ-070 (not covered); REQ-071 (not covered); REQ-072 (not covered); REQ-073 (not covered); REQ-074 (not covered); REQ-075 (not covered); REQ-076 (not covered); REQ-077 (not covered); REQ-078 (not covered); REQ-079 (not covered); REQ-080 (not covered); REQ-081 (not covered); REQ-082 (designed only (manual)); REQ-083 (not covered); REQ-084 (not covered); REQ-085 (not covered); REQ-086 (not covered); REQ-087 (not covered); REQ-088 (not covered); REQ-089 (not covered); REQ-090 (not covered); REQ-091 (not covered); REQ-092 (not covered); REQ-093 (not covered); REQ-094 (not covered); REQ-095 (not covered); REQ-096 (not covered); REQ-097 (not covered); REQ-098 (not covered); REQ-099 (not covered); REQ-100 (designed only (manual)); REQ-101 (not covered); REQ-102 (not covered); REQ-103 (not covered); REQ-104 (designed only (manual)); REQ-105 (not covered); REQ-106 (not covered); REQ-107 (not covered); REQ-108 (designed only (manual)); REQ-109 (not covered); REQ-110 (not covered); REQ-111 (not covered); REQ-112 (not covered); REQ-113 (not covered); REQ-114 (not covered); REQ-115 (not covered); REQ-116 (not covered); REQ-117 (not covered); REQ-118 (not covered); REQ-119 (not covered); REQ-120 (not covered); REQ-121 (not covered); REQ-122 (not covered); REQ-123 (not covered); REQ-124 (not covered); REQ-125 (not covered); REQ-126 (not covered); REQ-127 (not covered); REQ-128 (not covered); REQ-129 (not covered); REQ-130 (not covered); REQ-131 (not covered); REQ-132 (not covered); REQ-133 (not covered); REQ-134 (not covered); REQ-135 (not covered); REQ-136 (not covered); REQ-137 (not covered); REQ-138 (not covered).
- 34 requirement groups come from a single source only; the product owner should confirm them.
- At least one agent did not hand over every artifact its skills require; see Skills and hand-overs.

_6 of 15 booking-driving attributes (out of 21 booking attributes) are varied by at least one test._

## 6. Recommendation and next steps
**Conditional go.** No release-blocking defects, but there are open items to accept or close.

- Accept or fix DEF-001 (Minor).
- Accept or fix DEF-002 (Minor).
- Accept or fix DEF-003 (Minor).
- Cover or accept 131 requirements not yet verified by a passing test.
- Run TC-N-001, TC-N-002, TC-N-003, TC-N-004, TC-N-005 manually and record the result.
- Keep the updated baseline as the reference for the next release.

## Traceability by story
| Jira item | Level | Summary | Requirements | Test cases | Passed | Failed | Defects | Status |
|---|---|---|---|---|---|---|---|---|
| AQPI-32 | epic | [Epic 8] Release 2.0 – Booking Rule Changes and Free Cancellation | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-33 | story | 10.1 Shorten the cart hold to 20 minutes | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-34 | story | 10.2 Limit Paris stays to 14 nights | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-35 | story | 10.3 Allow up to 5 confirmation resends | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-36 | story | 10.4 Cancel a reservation free of charge | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-23 | epic | [Epic 6] Confirmation and Notifications | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-24 | story | 8.1 Generate confirmation message | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-25 | story | 8.2 Send and track confirmation email | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-26 | story | 8.3 Resend confirmation safely | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-37 | story | 8.4 Send a cancellation e-mail | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-4 | story | 3.2 Validate occupancy and stay criteria | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-12 | story | 5.2 Display ancillary offers | 1 | 1 | 1 | 0 | - | verified |
| AQPI-29 | story | 9.2 Provide end-to-end observability | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-30 | story | 9.3 Meet accessibility requirements | 1 | 1 | 0 | 0 | - | designed, not executed |
| AQPI-31 | story | 9.4 Meet performance and reliability objectives | 1 | 1 | 0 | 0 | - | designed, not executed |

## 7. Sign-off
| Gate | Decision | By | When | Detail |
|---|---|---|---|---|
| Requirement set review | approved | Priya Shah | 2026-10-11 16:44 UTC | 43 requirements approved; 0 excluded; 0 conflict(s) resolved |
| Merge into baseline | approved | Sam Lee | 2026-10-11 16:44 UTC | 23 requirements, 0 test cases, 0 scripts merged: BL-1 v1 -> v2 |

_Agentic QE Platform (QE lead report, computed from the cycle) · generated 2026-10-11 16:44 UTC. Every figure comes from the persisted cycle; nothing is estimated._
