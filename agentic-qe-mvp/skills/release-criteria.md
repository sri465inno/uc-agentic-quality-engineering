---
id: release-criteria
name: Release criteria (Go / Conditional go / No-go)
description: The parameters the cycle report applies to recommend Go, Conditional go or No-go. Edit this file, or upload a replacement, to change them without a code change.
appliesTo: [report]
delivers:
  report: [releaseDecision]
thresholds:
  blockingSeverity: [Critical]
  minPassRate: 95
noGo:
  - requirement-set-not-approved
  - blocking-defect
  - pass-rate-below-minimum
  - automated-case-not-run
  - failed-case-without-defect
  - evidence-mismatch
  - journey-failed
  - story-not-traced
conditional:
  - open-gap-defect
  - open-defect-below-blocking
noted:
  - manual-case-not-run
  - requirement-not-verified-by-this-track
---

The reporting agent recommends a release decision from these parameters; the EQE or DQE lead signs off outside
the platform.

- **No-go** when any parameter listed under `noGo` is triggered.
- **Conditional go** when none of those is triggered but a parameter under `conditional` is.
- **Go** otherwise. Parameters under `noted` are shown in the report but do not change the decision.
- A parameter that is not listed is not applied. Move a parameter between the lists to change how it counts.

Parameters (each one is computed from the stored cycle evidence):

| Parameter | Triggered when |
|---|---|
| requirement-set-not-approved | The requirement set has no approval by a named reviewer |
| blocking-defect | An open defect has a severity in `blockingSeverity`, or is marked release-blocking |
| pass-rate-below-minimum | The automated pass rate is below `minPassRate` per cent |
| automated-case-not-run | An automated test case in this run has no result |
| failed-case-without-defect | A failed test case has no defect |
| evidence-mismatch | A report figure does not match the stored evidence |
| journey-failed | EQE only: a business journey did not pass |
| story-not-traced | DQE only: a Jira story in scope has no test case and no gap defect |
| open-gap-defect | A defect raised for a Jira story missing from the code is still open |
| open-defect-below-blocking | Any other open defect below the blocking severity |
| manual-case-not-run | Manual test cases in this run have no recorded result |
| requirement-not-verified-by-this-track | A requirement has no passing test of this testing type (the other track may verify it) |

To use different criteria for one track, upload a copy with `testingType: eqe` or `testingType: functional` (DQE);
that copy replaces this one for cycles of that track.
