# QE lead report - Hotel booking baseline · DQE

CYC-2 · baseline cycle

> **Recommendation: No-go.** No-go criteria not met: No open defect at Critical severity or marked release-blocking (1: DEF-007 Critical (AQPI-17)).

| Type of testing | Requirements | Test cases | Automated | Pass rate | Defects | Requirements verified |
|---|---|---|---|---|---|---|
| DQE testing | 118 | 121 | 65 | 95.4% | 6 | 39.8% |

## 1. Summary
- Baseline cycle for Guest hotel booking from search to confirmation (AQPI-1) on build demo/hotel-booking-platform, 2026-10-12 02:21 UTC.
- Type of testing: DQE testing. Every domain rule and its boundaries, checked through the service API.
- We took 3 inputs (Jira initiative AQPI-1, Jira epic AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27, Codebase sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32)) and produced 118 requirements, 121 test cases and 50 automated scripts.
- We ran 65 automated tests for real: 62 passed, 3 failed (pass rate 95.4%). 56 manual tests still to be run by hand.
- 6 defects open from real failures (6 new), 1 release-blocking: DEF-004 AQPI-8 4.2 Sort and filter hotel results: asked for in Jira but not implemented in the code (Jira: not raised in Jira; linked to AQPI-8 in the platform); DEF-005 AQPI-13 5.3 Explain and control personalization: asked for in Jira but not implemented in the code (Jira: not raised in Jira; linked to AQPI-13 in the platform); DEF-006 AQPI-22 7.4 Show booking outcome: asked for in Jira but not implemented in the code (Jira: not raised in Jira; linked to AQPI-22 in the platform); DEF-007 A price change within 1% does not need acknowledgement: returns true instead of false (Jira: not raised in Jira; linked to AQPI-17 in the platform); DEF-008 A key shorter than 8 characters is refused: returns 201 instead of 400 (Jira: not raised in Jira; linked to AQPI-21 in the platform); DEF-009 9 rooms in one search are rejected: returns 200 instead of 400 (Jira: not raised in Jira; linked to AQPI-4 in the platform).

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
4. DQE testing steered the design: Designs a functional test case for every domain rule, both sides of every boundary, and runs them all. Result: 121 case(s) in this run (0 reused, 0 re-designed, 121 new).
5. The requirements agent wrote 118 requirements, each with its business rule, exact values and source quotes (57 automatable, 61 manual); the agents then designed 121 test cases (117 functional, 4 non-functional) and generated 50 Playwright scripts.
6. Executed the automated suite with Playwright 1.63.0 (headless Chromium, JSON reporter) against Hotel booking platform release 1.0, six Spring Boot services built from branch demo/hotel-booking-platform; defects were raised only for tests that actually failed.

## 4. Artifacts produced
| Artifact | Count | Notes | Folder |
|---|---|---|---|
| Inputs and provenance | 3 | what was taken from each source, and where from | [01-inputs/](01-inputs/) |
| Review agent suggestions | 3 | 7 added · 63 missing · 0 conflicts (advisory) | [01-inputs/review-agent.json](01-inputs/review-agent.json) |
| Normalised requirement set | 128 | 0 agreed · 121 Jira-only · 7 code-only · 0 conflicts | [01-inputs/normalisation.json](01-inputs/normalisation.json) |
| Requirement set (with business rules) | 118 | 118 new · 118 business rules with exact values and source quotes (57 automatable · 61 manual) | [02-requirements/](02-requirements/) |
| Test cases (Excel, Zephyr Scale format) | 121 | 65 automated · 56 not automated | [03-test-cases/](03-test-cases/) |
| Test data (one data set per test case) | 121 | 113 conform to Hotel booking attributes v1.0 (21 attributes) · 8 negative tests | [04-test-data/](04-test-data/) |
| Automation scripts (Playwright) | 50 | 50 new | [05-automation-scripts/](05-automation-scripts/) |
| Execution results and evidence | 65 | 62 passed · 3 failed · 56 manual | [06-execution/](06-execution/) |
| Traceability matrix | 121 | 28 of 31 Jira items covered · 17 verified · 3 failing | [08-report/traceability.json](08-report/traceability.json) |
| Defects | 6 | DEF-004 Minor new · DEF-005 Minor new · DEF-006 Minor new · DEF-007 Critical new · DEF-008 Medium new · DEF-009 Medium new | [07-defects/](07-defects/) |
| Cycle report (HTML, Excel) | 1 | full detail behind this summary | [08-report/](08-report/) |

## 5. Risks and open items
- 12 requirements had no case in this dqe testing run (REQ-001, REQ-002, REQ-004, REQ-005, REQ-006, REQ-007, REQ-023, REQ-047, REQ-082, REQ-100, REQ-104, REQ-108); a wider run is needed before release.
- DEF-004 (Minor): requirement not implemented yet (gap); no test was run against it. Expected The code implements AQPI-8 4.2 Sort and filter hotel results (4 acceptance criteria), got No code in sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) mentions AQPI-8. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-8; Jira: not raised in Jira; linked to AQPI-8 in the platform.
- DEF-005 (Minor): requirement not implemented yet (gap); no test was run against it. Expected The code implements AQPI-13 5.3 Explain and control personalization (3 acceptance criteria), got No code in sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) mentions AQPI-13. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-13; Jira: not raised in Jira; linked to AQPI-13 in the platform.
- DEF-006 (Minor): requirement not implemented yet (gap); no test was run against it. Expected The code implements AQPI-22 7.4 Show booking outcome (3 acceptance criteria), got No code in sri465inno/uc-agentic-quality-engineering@demo/hotel-booking-platform (b212a32) mentions AQPI-22. Does not block the release: gap excluded by Priya Shah at the requirement review. Story AQPI-22; Jira: not raised in Jira; linked to AQPI-22 in the platform.
- DEF-007 (Critical): a guest is charged or booked wrongly. Expected false, got true. Blocks the release: a guest is charged or booked wrongly (BR-113). Story AQPI-17; Jira: not raised in Jira; linked to AQPI-17 in the platform.
- DEF-008 (Medium): wrong value or status with a workaround. Expected 400, got 201. Does not block the release: wrong value or status with a workaround. Story AQPI-21; Jira: not raised in Jira; linked to AQPI-21 in the platform.
- DEF-009 (Medium): wrong value or status with a workaround. Expected 400, got 200. Does not block the release: wrong value or status with a workaround. Story AQPI-4; Jira: not raised in Jira; linked to AQPI-4 in the platform.
- 56 test cases cannot be automated and were not executed: TC-F-002 Verify: Required business and technical events are logged using approved identifiers and masking rules; TC-F-003 Verify: All child user stories meet their acceptance criteria and the Definition of Done; TC-F-004 Verify: Negative and error paths for each story are tested and evidenced; TC-F-005 Verify: Required logging is in place and verified free of sensitive data; TC-F-006 Verify: The Product Owner has accepted the capability end to end; TC-F-012 Verify: Check-in must precede check-out; TC-F-013 Verify: Occupancy must comply with configured room limits; TC-F-014 Verify: Maximum stay length must be configurable; TC-F-017 Verify: Server validation is authoritative when client and server results differ; TC-F-018 Verify: Validation rules must be configurable where market or property rules vary; TC-F-020 Verify: Technical failures display a non-technical message and retry option; TC-F-027 Verify: The guest can select a valid room and rate plan; TC-F-028 Verify: If inventory changes, the guest is informed before continuing; TC-F-030 Verify: The service considers available context such as stay dates, season, destination, hotel, room, party composition, declared interests, and consented profile attributes; TC-F-033 Verify: When personalization data is unavailable, safe contextual defaults may be returned; TC-F-034 Verify: Sensitive traits must not be inferred or used; TC-F-035 Verify: Personalization must honor consent and data-retention rules; TC-F-036 Verify: Business rules and model versions must be auditable; TC-F-041 Verify: Inventory and price are revalidated when required; TC-F-042 Verify: The cart has a defined expiration and displays relevant timeout behavior; TC-F-043 Verify: A cart must not itself create a reservation; TC-F-044 Verify: Price-change handling must require guest acknowledgement when material; TC-F-045 Verify: The guest can add an available ancillary; TC-F-048 Verify: Ineligible or sold-out products cannot be retained silently; TC-F-050 Verify: Currency is consistently displayed; TC-F-051 Verify: Material changes are highlighted and require acknowledgement; TC-F-052 Verify: The guest can return to edit supported selections; TC-F-053 Verify: The final payable total must be revalidated before reservation submission; TC-F-056 Verify: Data is transmitted securely and is not exposed in client logs; TC-F-057 Verify: Data minimization applies; TC-F-061 Verify: Payment data is handled through approved secure components; TC-F-066 Verify: Payment requirements depend on rate conditions; TC-F-067 Verify: Retry behavior must avoid duplicate authorization; TC-F-071 Verify: Partial failures trigger defined recovery or manual-review handling; TC-F-072 Verify: Reservation submission must use an idempotency mechanism; TC-F-073 Verify: The source of truth for confirmation status must be defined; TC-F-076 Verify: Only necessary personal data may be included; TC-F-078 Verify: A successful reservation creates one confirmation-email request; TC-F-080 Verify: Permitted retries avoid duplicate or excessive messages; TC-F-081 Verify: Operational users can distinguish queued, sent, delivered, bounced, and failed states when supported by the provider; TC-F-082 Verify: Email addresses must be masked outside authorized operational views; TC-F-084 Verify: Rate limits and abuse controls apply; TC-F-085 Verify: The resend creates a new message event without creating a new reservation; TC-F-086 Verify: Sensitive data is classified and mapped to approved storage and processing locations; TC-F-087 Verify: Data is encrypted in transit and at rest where required; TC-F-088 Verify: Logs and analytics exclude or mask prohibited fields; TC-F-090 Verify: Retention and deletion follow approved policy; TC-F-092 Verify: Business events and technical logs are distinguishable; TC-F-093 Verify: Logging degradation does not expose sensitive payloads or silently block booking unless explicitly required; TC-F-094 Verify: Event schemas must be versioned; TC-F-095 Verify: Production log access must be controlled and retained according to policy; TC-F-096 Verify: Visual information is not conveyed by color alone; TC-F-097 Verify: Dynamic updates are announced appropriately; TC-F-098 Verify: Timeout, retry, circuit-breaker, and fallback behavior are documented; TC-F-099 Verify: Load, resilience, and recovery tests cover critical journeys; TC-F-100 Verify: Reservation integrity is prioritized over non-critical personalization and analytics. Needs a manual run before sign-off.
- 71 requirements not yet verified by a passing test: REQ-001 (not covered); REQ-002 (not covered); REQ-004 (not covered); REQ-005 (not covered); REQ-006 (not covered); REQ-007 (not covered); REQ-008 (designed only (manual)); REQ-009 (designed only (manual)); REQ-010 (designed only (manual)); REQ-011 (designed only (manual)); REQ-012 (designed only (manual)); REQ-017 (designed only (manual)); REQ-018 (designed only (manual)); REQ-019 (designed only (manual)); REQ-022 (designed only (manual)); REQ-023 (not covered); REQ-024 (designed only (manual)); REQ-026 (designed only (manual)); REQ-034 (designed only (manual)); REQ-035 (designed only (manual)); REQ-037 (designed only (manual)); REQ-040 (designed only (manual)); REQ-041 (designed only (manual)); REQ-042 (designed only (manual)); REQ-043 (designed only (manual)); REQ-047 (not covered); REQ-049 (designed only (manual)); REQ-050 (designed only (manual)); REQ-051 (designed only (manual)); REQ-052 (designed only (manual)); REQ-053 (designed only (manual)); REQ-056 (designed only (manual)); REQ-058 (designed only (manual)); REQ-059 (designed only (manual)); REQ-060 (designed only (manual)); REQ-061 (designed only (manual)); REQ-065 (designed only (manual)); REQ-066 (designed only (manual)); REQ-069 (designed only (manual)); REQ-072 (designed only (manual)); REQ-073 (designed only (manual)); REQ-077 (designed only (manual)); REQ-078 (designed only (manual)); REQ-079 (designed only (manual)); REQ-082 (not covered); REQ-083 (designed only (manual)); REQ-085 (designed only (manual)); REQ-087 (designed only (manual)); REQ-088 (designed only (manual)); REQ-089 (designed only (manual)); REQ-091 (designed only (manual)); REQ-092 (designed only (manual)); REQ-093 (designed only (manual)); REQ-094 (designed only (manual)); REQ-095 (designed only (manual)); REQ-097 (designed only (manual)); REQ-099 (designed only (manual)); REQ-100 (not covered); REQ-101 (designed only (manual)); REQ-102 (designed only (manual)); REQ-103 (designed only (manual)); REQ-104 (not covered); REQ-105 (designed only (manual)); REQ-106 (designed only (manual)); REQ-108 (not covered); REQ-109 (designed only (manual)); REQ-110 (designed only (manual)); REQ-111 (designed only (manual)); REQ-113 (executed - failing); REQ-115 (executed - failing); REQ-117 (executed - failing).
- 128 requirement groups come from a single source only; the product owner should confirm them.

_13 of 15 booking-driving attributes (out of 21 booking attributes) are varied by at least one test._

## 6. Recommendation and next steps
**No-go.** No-go criteria not met: No open defect at Critical severity or marked release-blocking (1: DEF-007 Critical (AQPI-17)).

- Fix DEF-007 and re-run TC-F-103; it must pass before release.
- Run TC-F-002, TC-F-003, TC-F-004, TC-F-005, TC-F-006, TC-F-012, TC-F-013, TC-F-014, TC-F-017, TC-F-018, TC-F-020, TC-F-027, TC-F-028, TC-F-030, TC-F-033, TC-F-034, TC-F-035, TC-F-036, TC-F-041, TC-F-042, TC-F-043, TC-F-044, TC-F-045, TC-F-048, TC-F-050, TC-F-051, TC-F-052, TC-F-053, TC-F-056, TC-F-057, TC-F-061, TC-F-066, TC-F-067, TC-F-071, TC-F-072, TC-F-073, TC-F-076, TC-F-078, TC-F-080, TC-F-081, TC-F-082, TC-F-084, TC-F-085, TC-F-086, TC-F-087, TC-F-088, TC-F-090, TC-F-092, TC-F-093, TC-F-094, TC-F-095, TC-F-096, TC-F-097, TC-F-098, TC-F-099, TC-F-100 manually and record the result.
- Use this approved baseline as the reference for the next incremental cycle.

## Traceability by story
| Jira item | Level | Summary | Requirements | Test cases | Passed | Failed | Defects | Status |
|---|---|---|---|---|---|---|---|---|
| AQPI-2 | epic | [Epic 1] Search and Availability | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-3 | story | 3.1 Search hotels by destination and date range | 7 | 9 | 6 | 0 | - | verified |
| AQPI-4 | story | 3.2 Validate occupancy and stay criteria | 7 | 14 | 11 | 1 | DEF-009 | failing |
| AQPI-5 | story | 3.3 Handle unavailable or failed searches | 3 | 3 | 2 | 0 | - | verified |
| AQPI-6 | epic | [Epic 2] Hotel Results and Selection | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-7 | story | 4.1 Display available hotels | 5 | 5 | 5 | 0 | - | verified |
| AQPI-8 | story | 4.2 Sort and filter hotel results | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-9 | story | 4.3 View hotel and room details | 4 | 4 | 2 | 0 | - | verified |
| AQPI-10 | epic | [Epic 3] Personalized Ancillary Offers | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-11 | story | 5.1 Determine eligible ancillary offers | 7 | 7 | 2 | 0 | - | verified |
| AQPI-12 | story | 5.2 Display ancillary offers | 3 | 3 | 3 | 0 | - | verified |
| AQPI-13 | story | 5.3 Explain and control personalization | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-14 | epic | [Epic 4] Cart Management | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-15 | story | 6.1 Add room selection to cart | 6 | 6 | 2 | 0 | - | verified |
| AQPI-16 | story | 6.2 Add, update, and remove ancillaries | 4 | 4 | 2 | 0 | - | verified |
| AQPI-17 | story | 6.3 Review cart and total price | 6 | 7 | 2 | 1 | DEF-007 | failing |
| AQPI-18 | epic | [Epic 5] Checkout and Reservation | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-19 | story | 7.1 Capture guest and contact information | 6 | 6 | 4 | 0 | - | verified |
| AQPI-20 | story | 7.2 Capture and authorize payment | 6 | 9 | 6 | 0 | - | verified |
| AQPI-21 | story | 7.3 Create reservation idempotently | 7 | 9 | 5 | 1 | DEF-008 | failing |
| AQPI-22 | story | 7.4 Show booking outcome | 0 | 0 | 0 | 0 | - | not covered |
| AQPI-23 | epic | [Epic 6] Confirmation and Notifications | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-24 | story | 8.1 Generate confirmation message | 4 | 4 | 3 | 0 | - | verified |
| AQPI-25 | story | 8.2 Send and track confirmation email | 5 | 5 | 1 | 0 | - | verified |
| AQPI-26 | story | 8.3 Resend confirmation safely | 4 | 4 | 2 | 0 | - | verified |
| AQPI-27 | epic | [Epic 7] Cross-Cutting Quality, Privacy and Observability | 4 | 4 | 0 | 0 | - | designed, not executed |
| AQPI-28 | story | 9.1 Protect sensitive data | 5 | 5 | 1 | 0 | - | verified |
| AQPI-29 | story | 9.2 Provide end-to-end observability | 5 | 5 | 1 | 0 | - | verified |
| AQPI-30 | story | 9.3 Meet accessibility requirements | 3 | 3 | 1 | 0 | - | verified |
| AQPI-31 | story | 9.4 Meet performance and reliability objectives | 3 | 3 | 0 | 0 | - | designed, not executed |

## 7. Sign-off
**DQE sign-off owner: DQE lead** (Domain certification: every domain rule holds at its limits). Awaiting sign-off: The platform recommends No-go; the DQE lead decides and signs off outside the platform.

| Gate | Decision | By | When | Detail |
|---|---|---|---|---|
| Requirement set review | approved | Priya Shah | 2026-10-12 02:21 UTC | 118 requirements approved; 10 excluded (gaps AQPI-8, AQPI-13, AQPI-22); 0 conflict(s) resolved |

## 8. Exit criteria
| Exit criterion | Status | Detail |
|---|---|---|
| Requirement set approved by a named reviewer | met | Priya Shah: 118 requirements approved; 10 excluded (gaps AQPI-8, AQPI-13, AQPI-22); 0 conflict(s) resolved |
| Every excluded gap is raised as a defect linked to its story | met | 3 of 3 raised (AQPI-8, AQPI-13, AQPI-22) |
| Every automated domain-rule check ran | met | 65 of 65 ran |
| Every Jira story in scope is traced to a test case or a gap defect | met | 23 of 23 traced |
| Every failed test case has a defect | met | 3 of 3 failed test cases raised |
| No open release-blocking defect | not met | DEF-007 (AQPI-17) |
| Manual test cases run and recorded | open | 56 manual test cases handed over; their results are not recorded in the platform |

## 9. Evidence check
| Figure | In the report | Recounted | Recounted from | Status |
|---|---|---|---|---|
| Test cases | 121 | 121 | test case artifacts | reconciled |
| Automation scripts | 50 | 50 | automation script files | reconciled |
| Executed | 65 | 65 | Playwright results | reconciled |
| Passed | 62 | 62 | Playwright results | reconciled |
| Failed | 3 | 3 | Playwright results | reconciled |
| Executed tests with stored evidence | 65 | 65 | request/response and log files | reconciled |
| Defects from failed test cases | 3 | 3 | defects backed by a failed result | reconciled |
| Gap defects | 3 | 3 | gap defects linked to a Jira story | reconciled |

## 10. Release criteria
Release criteria (Go / Conditional go / No-go) (release-criteria.md); blocking severity Critical, minimum pass rate 95%.

| Release parameter | Applies as | Status | Detail |
|---|---|---|---|
| Requirement set approved by a named reviewer | No-go if triggered | clear | - |
| No open defect at Critical severity or marked release-blocking | No-go if triggered | triggered | 1: DEF-007 Critical (AQPI-17) |
| Automated pass rate at least 95% | No-go if triggered | clear | - |
| Every automated test case in the run executed | No-go if triggered | clear | - |
| Every failed test case has a defect | No-go if triggered | clear | - |
| Every report figure matches the stored evidence | No-go if triggered | clear | - |
| Every Jira story in scope traced to a test case or a gap defect | No-go if triggered | clear | - |
| No open defect for a Jira story missing from the code | Conditional go if triggered | triggered | 3: DEF-004 (AQPI-8), DEF-005 (AQPI-13), DEF-006 (AQPI-22) |
| No other open defect | Conditional go if triggered | triggered | 2: DEF-008 Medium, DEF-009 Medium |
| Manual test cases run and recorded | Noted only | triggered | 56: TC-F-002, TC-F-003, TC-F-004, TC-F-005, TC-F-006, TC-F-012, TC-F-013, TC-F-014, … |
| Every requirement verified by a passing test of this testing type | Noted only | triggered | 71: REQ-001, REQ-002, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, … |

_Agentic QE Platform (QE lead report, computed from the cycle) · generated 2026-10-12 02:22 UTC. Every figure comes from the persisted cycle; nothing is estimated._
