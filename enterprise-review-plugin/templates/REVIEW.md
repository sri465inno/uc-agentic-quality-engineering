# Review guidelines

Devin Review: in addition to general correctness, check this PR against the enterprise standards below. Cite the rule ID in every finding.

- Coding standards: CS-01..CS-07 (doc comments, no hard-coded secrets, explicit error handling, tests for new logic, structured logging without PII, naming, function size).
- Dependencies: only libraries from the approved list, pinned versions, lockfile updated; no banned libraries (log4j 1.x, moment, npm `request`).
- Tech stack: Java 17+/Spring Boot 3, Node 20/TypeScript, Python 3.11+, React 18 + TS, PostgreSQL, Redis, Kafka, Docker/K8s/Terraform.
- NFRs: validated input and parameterized queries, authn/authz on new endpoints, encryption and PII masking, pagination and no N+1, timeouts/backoff, graceful degradation, logs/metrics/traces with correlation IDs, WCAG 2.1 AA for UI.
- Explain each finding in one plain-language sentence (business impact, no jargon) before the technical detail.

Full rule text: enterprise-review-plugin/skills/enterprise-code-review/standards/ in sri465inno/uc-agentic-quality-engineering.
