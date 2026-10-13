---
id: testing-eqe
name: EQE testing - enterprise end-to-end business flows
description: Steers the agents to test each business flow end to end across the services, as the user experiences it.
testingType: eqe
appliesTo: [requirements, testcases, testdata, scripts, execution, defects, report]
delivers:
  testcases: [journeys]
  execution: [evidence]
---

Write each case as a business flow the guest performs across the services: search, open the hotel, pick a room and
rate, add extras, review the cart, pay, receive the confirmation and, from release 2.0, cancel. The name says what the
guest gets ("Guest books a flexible room in Paris and receives the confirmation e-mail"), not what one endpoint returns.

Every journey checks what the guest is told at each step: the price, the reservation status and the confirmation
number, exactly as the system returns them. Add the enterprise quality checks the inputs state (privacy, security,
observability, resilience).

Keep the evidence of every step (a screenshot where there is a screen, otherwise each request and response). A defect
names the business flow and the step that broke; the report says which business flows are ready to release.

Single-rule boundary checks belong to DQE testing (domain functional).
