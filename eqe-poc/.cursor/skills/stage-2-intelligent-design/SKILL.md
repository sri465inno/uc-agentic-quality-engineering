---
name: stage-2-intelligent-design
description: Turn an approved Stage-1 analysis into E2E scenarios, Zephyr-ready test cases (steps, data, expected results) and guest journeys, plus one *.spec.ts design scaffold per case. Follows _WORKFLOW.md.
---
# Stage 2 — Intelligent Design

1. Start only from an approved `stage-1.json`.
2. Group the ACs into scenarios and guest journeys. Apply the key-element-only E2E lens.
3. Use the happy-path default (G3). Design negative cases only when a source asks for them, and cite that source in `negativeRequestedBy`.
4. Every case must trace to AC/BR IDs. Every expected result names the ID it proves.
5. Test data refers to playbook keys (`test-data/<app>.playbook.json`), not literals.
6. Write `stage-2.json`, then run `npm run build:artifacts`. That generates `Stage - 2 Test Scenarios & Test cases.xlsx`, `scaffolds/*.spec.ts`, the coverage matrix and the metrics.
7. Run `npm run compare:golden` against the human golden set.
8. Stop at the HITL gate: the QE lead approves the cases.
