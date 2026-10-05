---
name: stage-3-self-adaptive-automation
description: Turn approved Stage-2 cases into runnable Playwright TypeScript that reuses pages/<app>/ Page Objects and playbook data, then dry-run, refine and run the 5-run flake check. Follows _WORKFLOW.md.
---
# Stage 3 — Self-Adaptive Automation

1. Start only from cases marked approved in the governance trail.
2. Reuse first (G5). Look in `pages/<app>/` for an existing Page Object or method before writing a new one. Any newly captured locator goes into a Page Object (G6). Specs must not contain raw locators.
3. Locator preference: role > label > text > testid > css/xpath.
4. Data comes from `test-data/<app>.playbook.json` only.
5. Dry-run with `npm run test:e2e` against the bundled `demo-booking` app. Fix, then run again.
6. Run the stability check with `npm run flake` (5 consecutive runs). It writes `evidence/uc2/flake-report.*`.
7. Stop at the HITL gate: a human approves the code and the run before scale-up.
