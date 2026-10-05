# UC2 runbook — approved cases → Playwright (demo-booking)

**Status: awaiting reviewer signature.** Devin prepared this runbook; it is "signed" only when the table at the end is
completed by the named people (and the matching `UC2-CODE-REVIEW` / `UC2-GATE-SCALE` entries exist in
`evidence/governance-trail.json`).

## 1. Preconditions
1. Cases are approved at gate `UC1-STAGE2-APPROVAL` (Stage-2 workbook, `design/AQPI-1/AQPI-2/stage-2.json`).
2. Every data reference in the case exists in `test-data/demo-booking.playbook.json`.
3. Node ≥ 20, `npm install`, `npx playwright install chromium`.

## 2. Automate a case (Stage 3 skill)
1. Read the case steps, traces and data keys.
2. Reuse `pages/demo-booking/*` methods; add a Page Object method only when no existing one fits (G5/G7).
3. Create `tests/demo-booking/<CASE>.spec.ts` with `// @case <CASE>  @traces <IDs>` and one `test.step` per expected result.
4. Data comes only from `searchData('<key>')` / `playbook('<key>')`.

## 3. Verify
```bash
npm run lint        # syntax, secret scan, no raw locators in specs, @case/@traces present
npm run typecheck
npm run test:e2e    # dry run; fix locators in Page Objects, never in specs
npm run flake       # 5 consecutive runs; must be < 5 % failed executions
npm run build:artifacts && npm run metrics
```

## 4. Review and approve (human)
1. Reviewer reads the spec(s), Page Object diff and `evidence/uc2/flake-report.md`, timing the review.
2. Reviewer records the decision in the UI (`#/eqe?tab=trail`) for `UC2-CODE-REVIEW` with review minutes.
3. Scaling past 3 cases needs an `approved` `UC2-GATE-SCALE` entry.

## 5. Troubleshooting
| Symptom | Action |
|---|---|
| Locator timeout | Check the accessible name in the Playwright error snapshot; update the Page Object locator. (Week-1 v1 used `getByLabel(exact)` and the label text includes the `*` marker; fixed by `getByRole(name)`.) |
| Port 4300 busy | `EQE_APP_PORT=4310 npm run test:e2e` |
| Date-dependent failure | Playbook uses offsets from today; never hard-code dates. |

## Signatures
| Role | Name | Decision | Review minutes | Date |
|---|---|---|---|---|
| Code reviewer (UC2-CODE-REVIEW) | | | | |
| QE lead (UC2-GATE-SCALE) | | | | |
