# QE lead report - Hotel booking baseline · Functional

CYC-2 · baseline cycle

> **Recommendation: No-go.** 1 release-blocking defect open (DEF-007).

| Type of testing | Requirements | Test cases | Automated | Pass rate | Defects | Requirements verified |
|---|---|---|---|---|---|---|
| Functional testing | 118 | 121 | 65 | 95.4% | 6 | 39.8% |

## 1. Summary
- Baseline cycle for Guest hotel booking from search to confirmation (AQPI-1) on build demo/hotel-booking-platform, 2026-10-11 17:06 UTC.
- Type of testing: Functional testing. Every domain rule and its boundaries, checked through the service API.
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
3. Priya Shah reviewed and approved the requirement set on 2026-10-11 17:06 UTC.
4. Functional testing steered the design: Designs a functional test case for every domain rule, both sides of every boundary, and runs them all. Result: 121 case(s) in this run (0 reused, 0 re-designed, 121 new).
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
- 12 requirements had no case in this functional testing run (REQ-001, REQ-002, REQ-004, REQ-005, REQ-006, REQ-007, REQ-023, REQ-047, REQ-082, REQ-100, REQ-104, REQ-108); a wider run is needed before release.
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
**No-go.** 1 release-blocking defect open (DEF-007).

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
| Gate | Decision | By | When | Detail |
|---|---|---|---|---|
| Requirement set review | approved | Priya Shah | 2026-10-11 17:06 UTC | 118 requirements approved; 10 excluded (gaps AQPI-8, AQPI-13, AQPI-22); 0 conflict(s) resolved |

_Agentic QE Platform (QE lead report, computed from the cycle) · generated 2026-10-11 17:07 UTC. Every figure comes from the persisted cycle; nothing is estimated._

## Appendix A: test results (real Playwright run)
| Key | Test | Result | ms |
|---|---|---|---|
| TC-F-001 | The payment summary shows taxes, mandatory fees and the total before booking | passed | 543 |
| TC-F-002 | Verify: Required business and technical events are logged using approved identifiers and masking rules | not-run | 0 |
| TC-F-003 | Verify: All child user stories meet their acceptance criteria and the Definition of Done | not-run | 0 |
| TC-F-004 | Verify: Negative and error paths for each story are tested and evidenced | not-run | 0 |
| TC-F-005 | Verify: Required logging is in place and verified free of sensitive data | not-run | 0 |
| TC-F-006 | Verify: The Product Owner has accepted the capability end to end | not-run | 0 |
| TC-F-007 | A valid search returns available hotels for the destination | passed | 207 |
| TC-F-008 | The results page returns the criteria the guest submitted | passed | 57 |
| TC-F-009 | A check-in date in the past is rejected | passed | 47 |
| TC-F-010 | A check-out on the check-in day is rejected | passed | 33 |
| TC-F-011 | A search without a destination is rejected | passed | 31 |
| TC-N-001 | When every hotel is sold out the guest is told and offered other dates, guests or destination | passed | 46 |
| TC-F-012 | Verify: Check-in must precede check-out | not-run | 0 |
| TC-F-013 | Verify: Occupancy must comply with configured room limits | not-run | 0 |
| TC-F-014 | Verify: Maximum stay length must be configurable | not-run | 0 |
| TC-F-015 | The search form marks destination, dates, rooms and adults as required | passed | 22 |
| TC-F-016 | Two rooms for one adult return a message on the adults field | passed | 18 |
| TC-F-017 | Verify: Server validation is authoritative when client and server results differ | not-run | 0 |
| TC-F-018 | Verify: Validation rules must be configurable where market or property rules vary | not-run | 0 |
| TC-F-019 | When every hotel is sold out the guest is told and offered other dates, guests or destination | passed | 36 |
| TC-F-020 | Verify: Technical failures display a non-technical message and retry option | not-run | 0 |
| TC-F-021 | Submitting the same search twice in one session returns the same search | passed | 36 |
| TC-N-002 | Every result has a name, location, image, availability and, when bookable, a starting price in a currency | passed | 23 |
| TC-F-022 | Every bookable result states what its price includes | passed | 30 |
| TC-F-023 | A sold-out hotel is listed as SOLD_OUT without a price | passed | 26 |
| TC-F-024 | Results can be read two at a time | passed | 41 |
| TC-F-025 | The starting price equals the cheapest rate on the hotel page | passed | 32 |
| TC-F-026 | The hotel page shows description, images, address, amenities, rooms with prices and policies | passed | 22 |
| TC-F-027 | Verify: The guest can select a valid room and rate plan | not-run | 0 |
| TC-F-028 | Verify: If inventory changes, the guest is informed before continuing | not-run | 0 |
| TC-F-029 | Every rate plan states its cancellation terms and payment rule | passed | 24 |
| TC-F-030 | Verify: The service considers available context such as stay dates, season, destination, hotel, room, party composition, declared interests, and consented profile attributes | not-run | 0 |
| TC-F-031 | Spa access is not offered at a hotel without a spa | passed | 131 |
| TC-F-032 | Every recommended extra carries at least one reason code | passed | 17 |
| TC-F-033 | Verify: When personalization data is unavailable, safe contextual defaults may be returned | not-run | 0 |
| TC-F-034 | Verify: Sensitive traits must not be inferred or used | not-run | 0 |
| TC-F-035 | Verify: Personalization must honor consent and data-retention rules | not-run | 0 |
| TC-F-036 | Verify: Business rules and model versions must be auditable | not-run | 0 |
| TC-F-037 | Each offer shows name, description, price and currency and is labelled an optional extra | passed | 17 |
| TC-F-038 | The guest can record add, skip and dismiss on an offer | passed | 26 |
| TC-F-039 | Each offer shows name, description, price and currency and is labelled an optional extra | passed | 17 |
| TC-F-040 | The cart holds the selected hotel, room, rate, dates, occupancy and price components | passed | 22 |
| TC-F-041 | Verify: Inventory and price are revalidated when required | not-run | 0 |
| TC-F-042 | Verify: The cart has a defined expiration and displays relevant timeout behavior | not-run | 0 |
| TC-F-043 | Verify: A cart must not itself create a reservation | not-run | 0 |
| TC-F-044 | Verify: Price-change handling must require guest acknowledgement when material | not-run | 0 |
| TC-F-045 | Verify: The guest can add an available ancillary | not-run | 0 |
| TC-F-046 | Breakfast can go to 2 but not above its limit of 4 | passed | 90 |
| TC-F-047 | Removing breakfast returns the total to the room-only amount | passed | 32 |
| TC-F-048 | Verify: Ineligible or sold-out products cannot be retained silently | not-run | 0 |
| TC-F-049 | The cart itemises room, taxes, fees, extras and discounts and they add up to the total | passed | 28 |
| TC-F-050 | Verify: Currency is consistently displayed | not-run | 0 |
| TC-F-051 | Verify: Material changes are highlighted and require acknowledgement | not-run | 0 |
| TC-F-052 | Verify: The guest can return to edit supported selections | not-run | 0 |
| TC-F-053 | Verify: The final payable total must be revalidated before reservation submission | not-run | 0 |
| TC-F-054 | Checkout lists name, e-mail, payment and privacy notice as required and phone as optional | passed | 35 |
| TC-N-003 | An invalid e-mail address is rejected on the e-mail field | passed | 37 |
| TC-F-055 | Booking without accepting the privacy notice is refused | passed | 23 |
| TC-F-056 | Verify: Data is transmitted securely and is not exposed in client logs | not-run | 0 |
| TC-F-057 | Verify: Data minimization applies | not-run | 0 |
| TC-F-058 | Support staff see a masked e-mail and other callers are refused | passed | 227 |
| TC-F-059 | A pay-at-hotel rate shows nothing to pay now and the total due at the hotel | passed | 39 |
| TC-F-060 | A prepaid rate shows the full total to pay now | passed | 33 |
| TC-F-061 | Verify: Payment data is handled through approved secure components | not-run | 0 |
| TC-F-062 | A declined card returns a decline without a booking | passed | 35 |
| TC-F-063 | A lost payment response leaves the booking pending and tells the guest not to resubmit | passed | 55 |
| TC-F-064 | A payment provider failure returns a failure without a booking | passed | 31 |
| TC-F-065 | A raw card number is refused and never echoed back | passed | 21 |
| TC-F-066 | Verify: Payment requirements depend on rate conditions | not-run | 0 |
| TC-F-067 | Verify: Retry behavior must avoid duplicate authorization | not-run | 0 |
| TC-F-068 | A successful booking creates one reservation with a confirmation number | passed | 44 |
| TC-F-069 | Resubmitting with the same key returns the original reservation | passed | 47 |
| TC-F-070 | After a booking and a decline the reconciliation report is consistent | passed | 62 |
| TC-F-071 | Verify: Partial failures trigger defined recovery or manual-review handling | not-run | 0 |
| TC-F-072 | Verify: Reservation submission must use an idempotency mechanism | not-run | 0 |
| TC-F-073 | Verify: The source of truth for confirmation status must be defined | not-run | 0 |
| TC-F-074 | The confirmation e-mail matches the booking and contains no payment token | passed | 49 |
| TC-F-075 | The confirmation e-mail matches the booking and contains no payment token | passed | 52 |
| TC-F-076 | Verify: Only necessary personal data may be included | not-run | 0 |
| TC-F-077 | The confirmation e-mail matches the booking and contains no payment token | passed | 44 |
| TC-F-078 | Verify: A successful reservation creates one confirmation-email request | not-run | 0 |
| TC-F-079 | When the e-mail cannot be sent the booking stays confirmed | passed | 113 |
| TC-F-080 | Verify: Permitted retries avoid duplicate or excessive messages | not-run | 0 |
| TC-F-081 | Verify: Operational users can distinguish queued, sent, delivered, bounced, and failed states when supported by the provider | not-run | 0 |
| TC-F-082 | Verify: Email addresses must be masked outside authorized operational views | not-run | 0 |
| TC-F-083 | A resend with the wrong last name gets the same answer as a correct one | passed | 60 |
| TC-F-084 | Verify: Rate limits and abuse controls apply | not-run | 0 |
| TC-F-085 | Verify: The resend creates a new message event without creating a new reservation | not-run | 0 |
| TC-F-086 | Verify: Sensitive data is classified and mapped to approved storage and processing locations | not-run | 0 |
| TC-F-087 | Verify: Data is encrypted in transit and at rest where required | not-run | 0 |
| TC-F-088 | Verify: Logs and analytics exclude or mask prohibited fields | not-run | 0 |
| TC-F-089 | Support staff see a masked e-mail and other callers are refused | passed | 44 |
| TC-F-090 | Verify: Retention and deletion follow approved policy | not-run | 0 |
| TC-F-091 | A correlation ID sent by the client is returned by search, cart and reservation | passed | 49 |
| TC-F-092 | Verify: Business events and technical logs are distinguishable | not-run | 0 |
| TC-F-093 | Verify: Logging degradation does not expose sensitive payloads or silently block booking unless explicitly required | not-run | 0 |
| TC-F-094 | Verify: Event schemas must be versioned | not-run | 0 |
| TC-F-095 | Verify: Production log access must be controlled and retained according to policy | not-run | 0 |
| TC-F-096 | Verify: Visual information is not conveyed by color alone | not-run | 0 |
| TC-F-097 | Verify: Dynamic updates are announced appropriately | not-run | 0 |
| TC-N-004 | The confirmation e-mail has a language, a heading, a captioned table with scoped headers and a text part | passed | 41 |
| TC-F-098 | Verify: Timeout, retry, circuit-breaker, and fallback behavior are documented | not-run | 0 |
| TC-F-099 | Verify: Load, resilience, and recovery tests cover critical journeys | not-run | 0 |
| TC-F-100 | Verify: Reservation integrity is prioritized over non-critical personalization and analytics | not-run | 0 |
| TC-F-101 | A new cart expires 30 minutes after creation and reserves nothing | passed | 20 |
| TC-F-102 | A price rise above 1% blocks booking until the guest acknowledges it | passed | 89 |
| TC-F-103 | A price change within 1% does not need acknowledgement | failed | 25 |
| TC-F-104 | The 4th resend within 24 hours is refused | passed | 96 |
| TC-F-105 | A reservation without an Idempotency-Key is refused | passed | 26 |
| TC-F-106 | A key shorter than 8 characters is refused | failed | 44 |
| TC-F-107 | Reusing a key for a different cart is refused | passed | 84 |
| TC-F-108 | A 30-night stay is accepted | passed | 32 |
| TC-F-109 | A 31-night stay is rejected | passed | 24 |
| TC-F-110 | A 21-night stay in Paris is accepted | passed | 27 |
| TC-F-111 | A 22-night stay in Paris is rejected | passed | 21 |
| TC-F-112 | 4 adults in one room are accepted | passed | 28 |
| TC-F-113 | 5 adults in one room are rejected | passed | 18 |
| TC-F-114 | 4 children in one room are rejected | passed | 22 |
| TC-F-115 | 9 rooms in one search are rejected | failed | 23 |
| TC-F-116 | A check-in 500 days ahead is accepted | passed | 56 |
| TC-F-117 | A check-in 501 days ahead is rejected | passed | 26 |

## Appendix B: requirements
| ID | Requirement | Status |
|---|---|---|
| REQ-001 | A guest can complete the complete search-to-confirmation flow using valid inputs. | new |
| REQ-002 | Only bookable inventory and valid rates are presented as available. | new |
| REQ-003 | Total price is disclosed before confirmation, including mandatory taxes and fees. | new |
| REQ-004 | Ancillary offers do not block booking when declined or unavailable. | new |
| REQ-005 | The platform prevents or safely handles duplicate reservation submissions. | new |
| REQ-006 | A successful reservation produces a durable confirmation identifier. | new |
| REQ-007 | Confirmation is displayed on screen and an email request is generated. | new |
| REQ-008 | Required business and technical events are logged using approved identifiers and masking rules. | new |
| REQ-009 | All child user stories meet their acceptance criteria and the Definition of Done. | new |
| REQ-010 | Negative and error paths for each story are tested and evidenced. | new |
| REQ-011 | Required logging is in place and verified free of sensitive data. | new |
| REQ-012 | The Product Owner has accepted the capability end to end. | new |
| REQ-013 | Given valid search criteria, when the guest submits the search, then a search request is created and matching available hotels are returned. | new |
| REQ-014 | The submitted criteria remain visible and editable on the results page. | new |
| REQ-015 | Past check-in dates, check-out dates not after check-in, and missing mandatory fields are rejected with actionable messages. | new |
| REQ-016 | A no-availability result explains that no matching inventory was found and allows criteria changes. | new |
| REQ-017 | Check-in must precede check-out. | new |
| REQ-018 | Occupancy must comply with configured room limits. | new |
| REQ-019 | Maximum stay length must be configurable. | new |
| REQ-020 | Required fields are clearly identified. | new |
| REQ-021 | Invalid combinations return field-level messages. | new |
| REQ-022 | Server validation is authoritative when client and server results differ. | new |
| REQ-023 | Validation messages are accessible to assistive technology. | new |
| REQ-024 | Validation rules must be configurable where market or property rules vary. | new |
| REQ-025 | Zero results provide options to alter dates, occupancy, destination, or filters. | new |
| REQ-026 | Technical failures display a non-technical message and retry option. | new |
| REQ-027 | Repeated submission does not create inconsistent sessions. | new |
| REQ-028 | Each result shows hotel name, location, representative image, starting price, currency, and availability indicator. | new |
| REQ-029 | Mandatory fees or pricing qualifications are clearly disclosed. | new |
| REQ-030 | Unavailable hotels are not presented as immediately bookable. | new |
| REQ-031 | Results support pagination or progressive loading. | new |
| REQ-032 | Displayed starting price must correspond to a valid rate returned for the search criteria. | new |
| REQ-033 | Hotel description, images, location, amenities, room options, pricing, major policies, and relevant restrictions are displayed. | new |
| REQ-034 | The guest can select a valid room and rate plan. | new |
| REQ-035 | If inventory changes, the guest is informed before continuing. | new |
| REQ-036 | Rate conditions and cancellation terms must be shown before selection. | new |
| REQ-037 | The service considers available context such as stay dates, season, destination, hotel, room, party composition, declared interests, and consented profile attributes. | new |
| REQ-038 | Unavailable or ineligible products are excluded. | new |
| REQ-039 | The service returns a reason code for each recommended item. | new |
| REQ-040 | When personalization data is unavailable, safe contextual defaults may be returned. | new |
| REQ-041 | Sensitive traits must not be inferred or used. | new |
| REQ-042 | Personalization must honor consent and data-retention rules. | new |
| REQ-043 | Business rules and model versions must be auditable. | new |
| REQ-044 | Each offer shows name, description, price, currency, applicability, and any restrictions. | new |
| REQ-045 | The guest can add, skip, or dismiss an offer. | new |
| REQ-046 | Offers are clearly distinguished from mandatory fees. | new |
| REQ-047 | Failure to load offers does not block room booking. | new |
| REQ-048 | The cart contains hotel, room, rate plan, stay dates, occupancy, quantity, currency, and price components. | new |
| REQ-049 | Inventory and price are revalidated when required. | new |
| REQ-050 | The cart has a defined expiration and displays relevant timeout behavior. | new |
| REQ-051 | A cart must not itself create a reservation. | new |
| REQ-052 | Price-change handling must require guest acknowledgement when material. | new |
| REQ-053 | The guest can add an available ancillary. | new |
| REQ-054 | Supported quantities can be changed within product limits. | new |
| REQ-055 | Removal updates totals immediately. | new |
| REQ-056 | Ineligible or sold-out products cannot be retained silently. | new |
| REQ-057 | Room charges, taxes, mandatory fees, optional products, discounts, and total are itemized. | new |
| REQ-058 | Currency is consistently displayed. | new |
| REQ-059 | Material changes are highlighted and require acknowledgement. | new |
| REQ-060 | The guest can return to edit supported selections. | new |
| REQ-061 | The final payable total must be revalidated before reservation submission. | new |
| REQ-062 | Required and optional fields are clearly distinguished. | new |
| REQ-063 | Inputs are validated and error messages are accessible. | new |
| REQ-064 | The guest receives applicable privacy notice and consent controls. | new |
| REQ-065 | Data is transmitted securely and is not exposed in client logs. | new |
| REQ-066 | Data minimization applies. | new |
| REQ-067 | Sensitive values must be masked in support tools and excluded from analytics logs. | new |
| REQ-068 | The guest sees the final payable or guarantee amount before authorization. | new |
| REQ-069 | Payment data is handled through approved secure components. | new |
| REQ-070 | Authorization success, decline, timeout, and technical failure are handled distinctly. | new |
| REQ-071 | The product does not store prohibited card data in application logs. | new |
| REQ-072 | Payment requirements depend on rate conditions. | new |
| REQ-073 | Retry behavior must avoid duplicate authorization. | new |
| REQ-074 | A successful request creates one reservation and returns a confirmation identifier. | new |
| REQ-075 | Repeated submissions with the same idempotency key do not create duplicate reservations. | new |
| REQ-076 | Inventory, price, payment, and reservation outcomes remain reconcilable. | new |
| REQ-077 | Partial failures trigger defined recovery or manual-review handling. | new |
| REQ-078 | Reservation submission must use an idempotency mechanism. | new |
| REQ-079 | The source of truth for confirmation status must be defined. | new |
| REQ-080 | The message contains guest-safe confirmation details, hotel information, stay dates, booked items, pricing summary, and applicable policy information. | new |
| REQ-081 | The message content matches the confirmed reservation state. | new |
| REQ-082 | Templates support required locale and accessibility standards. | new |
| REQ-083 | Only necessary personal data may be included. | new |
| REQ-084 | Sensitive payment details must not appear. | new |
| REQ-085 | A successful reservation creates one confirmation-email request. | new |
| REQ-086 | Send failure does not reverse a valid reservation. | new |
| REQ-087 | Permitted retries avoid duplicate or excessive messages. | new |
| REQ-088 | Operational users can distinguish queued, sent, delivered, bounced, and failed states when supported by the provider. | new |
| REQ-089 | Email addresses must be masked outside authorized operational views. | new |
| REQ-090 | The request verifies sufficient reservation information without exposing data. | new |
| REQ-091 | Rate limits and abuse controls apply. | new |
| REQ-092 | The resend creates a new message event without creating a new reservation. | new |
| REQ-093 | Sensitive data is classified and mapped to approved storage and processing locations. | new |
| REQ-094 | Data is encrypted in transit and at rest where required. | new |
| REQ-095 | Logs and analytics exclude or mask prohibited fields. | new |
| REQ-096 | Access to operational data is role-based and auditable. | new |
| REQ-097 | Retention and deletion follow approved policy. | new |
| REQ-098 | Events use a correlation ID across supported services. | new |
| REQ-099 | Business events and technical logs are distinguishable. | new |
| REQ-100 | Metrics and alerts exist for agreed critical failures and latency. | new |
| REQ-101 | Logging degradation does not expose sensitive payloads or silently block booking unless explicitly required. | new |
| REQ-102 | Event schemas must be versioned. | new |
| REQ-103 | Production log access must be controlled and retained according to policy. | new |
| REQ-104 | Keyboard navigation, focus order, labels, instructions, status messaging, and error handling are accessible. | new |
| REQ-105 | Visual information is not conveyed by color alone. | new |
| REQ-106 | Dynamic updates are announced appropriately. | new |
| REQ-107 | Email templates are readable and structurally accessible. | new |
| REQ-108 | Search, pricing, cart, checkout, reservation, and email dependencies have agreed performance targets. | new |
| REQ-109 | Timeout, retry, circuit-breaker, and fallback behavior are documented. | new |
| REQ-110 | Load, resilience, and recovery tests cover critical journeys. | new |
| REQ-111 | Reservation integrity is prioritized over non-critical personalization and analytics. | new |
| REQ-112 | A cart expires 30 minutes after it is created and never creates a reservation itself. | new |
| REQ-113 | A price change of more than 1% must be acknowledged by the guest before checkout. | new |
| REQ-114 | A confirmation can be resent at most 3 times per booking in 24 hours. | new |
| REQ-115 | Every reservation request needs an Idempotency-Key of 8 to 64 characters; a replay within 24 hours returns the original outcome. | new |
| REQ-116 | A stay can be at most 30 nights; Paris (PAR) allows at most 21 nights. | new |
| REQ-117 | Each room holds at most 4 adults and 3 children, and one search books 1 to 8 rooms. | new |
| REQ-118 | Check-in can be at most 500 days ahead. | new |
