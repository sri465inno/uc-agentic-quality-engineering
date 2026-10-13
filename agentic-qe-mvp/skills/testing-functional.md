---
id: testing-functional
name: DQE testing (domain functional)
description: Steers the design agents to cover every business rule and its boundaries through the service API.
testingType: functional
appliesTo: [testcases, scripts, execution]
delivers:
  testcases: [functional]
  scripts: [specs]
  execution: [results]
---

Design at least one functional case per business rule. When a rule has a threshold (nights, rooms, amount), design
one case exactly on the threshold and one just below it.

Every case asserts an exact amount or status returned by the service API. Screens and response times are out of
scope for functional testing and are left to EQE runs (enterprise end-to-end business flows).

On an incremental run, keep every functional case already in the baseline, re-design only the cases whose rule or a
rule it depends on changed, and add cases for new rules. Run the whole functional pack on the new build.
