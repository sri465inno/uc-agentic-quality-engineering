# Requirements Quality Standard

Applied to the Jira story/epic (not to the code). Violations are reported as requirement gaps (`GAP-n`) with a suggested fix for the product owner.

## Rules
- [RQ-01] Each story has explicit acceptance criteria, ideally in Given/When/Then form.
- [RQ-02] Each acceptance criterion is testable: it states an observable outcome, not a vague quality ("fast", "user-friendly", "secure").
- [RQ-03] Error, empty, and invalid-input scenarios are described for every user input or integration.
- [RQ-04] Roles and permissions are stated: who can perform the action and what happens for unauthorized users.
- [RQ-05] Relevant NFRs are quantified (response time, volume, availability, data retention, accessibility level) when the change affects them.
- [RQ-06] Data rules are explicit: formats, limits, currencies, time zones, and PII/compliance handling.
- [RQ-07] Dependencies on other systems, stories, or teams are linked in Jira.
- [RQ-08] Acceptance criteria do not conflict with each other, the parent epic, or linked stories.
- [RQ-09] For epics: child stories together cover the epic's stated scope; uncovered scope is called out.
