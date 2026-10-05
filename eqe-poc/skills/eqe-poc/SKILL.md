---
name: eqe-poc
description: Run and extend the Devin AI for QE PoC (eqe-poc) - Stage 1-3 pipeline over the AQPI Jira export and the demo-booking app.
---
# eqe-poc

## Run
```bash
cd eqe-poc && npm ci && npx playwright install chromium && npm start   # http://localhost:3000
```
Live dummy Jira: set `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` before `npm start`.

## Verify
- `npm run lint` and `npm test` (includes a full API run with 5 Playwright dry runs).
- `BASE=http://127.0.0.1:3000 node scripts/smoke.js` against a running server.

## Extend
- New UI behaviour: add a Page Object method under `framework/pages/demo-booking/`, then a concept in `framework/ui-map.js`
  (triggers = phrases from Jira text, steps with `code` that only call Page Objects, `data` = playbook keys).
- New test data: `framework/test-data/playbook.json`.
- Golden set: `golden-set/<EPIC>.golden.json` or paste on the Compare tab (marked human-authored with the author name).
