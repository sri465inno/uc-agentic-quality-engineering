---
name: stage-1-cognitive-analysis
description: Turn one Jira initiative/epic (dummy export or dummy live Jira) into a Stage-1 BRD pack — requirements, acceptance criteria, business rules, risks, traceability and gaps. Follows _WORKFLOW.md.
---
# Stage 1 — Cognitive Analysis

1. Load the epic and its child stories (`node scripts/jira.js <EPIC>`). The mode is the dummy live Jira when `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` are set, otherwise the committed export snapshot. Record the mode.
2. For every story, list each acceptance criterion as `<STORY>-AC<n>` and each business rule as `<STORY>-BR<n>`, using the **verbatim** Jira text.
3. Assess risk (High/Medium/Low) per requirement and give a one-line reason.
4. Log every ambiguity, missing value or untestable item in the gap register with a G-code from _WORKFLOW.md §5. Don't invent values.
5. Write `design/<INITIATIVE>/<EPIC>/stage-1.json`, then run `npm run build:artifacts` to generate the tracker HTML and `Stage - 1 Requirement & details.xlsx`.
6. Stop at the HITL gate. The QE lead validates scope, and the decision is recorded in `evidence/governance-trail.md`.
