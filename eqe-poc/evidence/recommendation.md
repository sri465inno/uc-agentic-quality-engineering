# Proceed / refine / stop recommendation (Devin, end of Week 1)

**Recommendation: REFINE, then PROCEED** — the pipeline works end to end on synthetic data, but the human-measured
success criteria have not been measured yet, so a "proceed" decision would be premature.

| Criterion | Target | Status | Evidence |
|---|---|---|---|
| UC1 AC coverage | ≥ 80 % | met (11/11 story ACs) | `artifacts/AQPI-1/AQPI-2/metrics.json` |
| UC1 hallucination | ≤ 10 % | automated grounding check met (0/49); golden-set check **pending** | `golden-set/` |
| UC1 review time | < 20 min/epic | **pending** — QE lead to time the Stage-2 review | governance trail |
| UC1 approval to scale | QE lead | **pending** | gate UC1-GATE1 |
| UC2 test-data mapping | ≥ 85 % | met (5/5) | `evidence/uc2/automation-metrics.json` |
| UC2 review time | < 25 min/spec | **pending** — reviewer to time code review | governance trail |
| UC2 flake | < 5 % over 5 runs | met (0/15) | `evidence/uc2/flake-report.md` |
| UC2 approval to scale | human | **pending** | gate UC2-GATE-SCALE |

What has to happen to move to PROCEED:
1. QE lead authors the AQPI-2 golden set and runs `npm run compare:golden`.
2. Reviewers record timed decisions for the five gates in the UI.
3. Confirm or replace the draft `_WORKFLOW.md`.

Stop signals to watch: golden recall below ~70 %, review times above target, or reviewers rejecting cases for invented
requirements despite the grounding check.

Caveats: the synthetic app was built for this PoC, so automation success on it does not prove the approach on the client
UI; all Jira data is a sandbox export.
