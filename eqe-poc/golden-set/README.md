# Golden set (human-authored)

The golden set is the benchmark for UC1. It is 12–15 cases per epic, **written by a QE engineer from Jira
alone**. Devin doesn't author it, and nothing in the golden set may be copied from Devin's output.

1. Copy `TEMPLATE.golden.json` to `<EPIC>.golden.json` (for example `AQPI-2.golden.json`).
2. Fill in `cases`. Each `traces` entry uses the requirement IDs printed by `npm run jira -- <EPIC>` (`<STORY>-AC<n>`, `<STORY>-BR<n>`).
3. Run `npm run compare:golden`. This writes `artifacts/<INITIATIVE>/golden-comparison-<EPIC>.json` and refreshes the metrics.

How cases are matched: each golden case is paired with the Devin case whose traced requirements overlap it most (Jaccard ≥ 0.5).
The comparison reports recall (golden cases matched), Devin-only cases (review them as possible hallucinations) and
requirements the golden set covers but Devin missed.
