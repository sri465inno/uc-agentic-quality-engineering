# UC2 environment plan (Week 1 readiness — gate UC2-WEEK1-READINESS)

| Item | PoC decision |
|---|---|
| Stage-equivalent environment | `apps/demo-booking` started by Playwright `webServer` on `127.0.0.1:4300` (`EQE_APP_PORT` to override). Local only, never exposed. |
| Dependencies | Availability/Property services are simulated (Atlantis = outage → 503, Reykjavik = zero inventory). GAP-10. |
| Configuration | `apps/demo-booking/config/validation.json`: 4 rooms, 3 adults and 2 children per room, 30 nights, Venice 7 nights (synthetic, GAP-01/02). |
| Framework snapshot | Playwright `@playwright/test` 1.63.0, Chromium, TypeScript strict (`tsc --noEmit`), `retries: 0`. |
| Page Objects | `pages/demo-booking/SearchPage.ts`, `ResultsPage.ts`. Locator order role > label > text > testid > css. Specs contain no raw locators (lint enforces G6). |
| Test data | `test-data/demo-booking.playbook.json` → `test-data/playbook.ts`. Synthetic only, dates relative to today, no PII. |
| Access boundary | Local synthetic app only. No client URLs, no credentials, no production or customer data. |
| Evidence | JSON report per run, traces/screenshots on failure, `npm run flake` → `evidence/uc2/flake-report.{json,md}`. |
| Out of scope | CI orchestration, scheduling, cross-browser grids, defect filing (Stage 4); dashboards/Power BI (Stage 5). |

Readiness sign-off (human):

| Role | Name | Decision | Date |
|---|---|---|---|
| QE lead | | | |
| Environment owner | | | |
