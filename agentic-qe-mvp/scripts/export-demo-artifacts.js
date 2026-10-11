'use strict';
/* Runs the hotel booking Flow 1 cycles (release 1.0: EQE and Functional, the three gap stories excluded), then the Flow 2
   increment (release 2.0: Epic 8 AQPI-32 + revised Epic 6 AQPI-23) on each baseline, end to end, and writes every artifact to a folder for demos.
   Usage: node scripts/export-demo-artifacts.js [outDir]   (default: demo-artifacts/) */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/server');
const { renderReportHtml } = require('../src/report');
const { compareCycles, renderCompareHtml } = require('../src/compare');
const { testCasesWorkbook, reportWorkbook, compareWorkbook } = require('../src/excel');
const { buildLeadReport, renderLeadPage, renderLeadMarkdown } = require('../src/lead-report');
const { dataSetFile } = require('../src/agents/testdata');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'demo-artifacts'));
const REVIEWER = 'Priya Shah';
const APPROVER = 'Sam Lee';
const HOTEL_INPUTS = { initiative: { mode: 'github', key: 'AQPI-1' }, epic: { mode: 'github', key: 'AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27' }, codebase: { mode: 'github', branch: 'demo/hotel-booking-platform' } };
const HOTEL_TESTING_TYPES = [['eqe', 'EQE'], ['functional', 'Functional']];
const INCREMENT_INPUTS = { epic: { mode: 'github', key: 'AQPI-32, AQPI-23', snapshot: 'release-2.0' }, codebase: { mode: 'github', branch: 'demo/hotel-booking-platform-v2' } };

const json = (f, v) => write(f, `${JSON.stringify(v, null, 2)}\n`);
function write(f, body) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); }
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

const SOURCE_LABEL = { agreed: 'Jira + code', 'jira-only': 'Jira only', 'code-only': 'Code only', conflict: 'Conflict settled by reviewer' };
const sourceOf = (r) => {
  if (r.bucket === 'conflict') return 'conflict';
  const s = new Set((r.origins || []).map((o) => o.source));
  return s.has('jira') && s.has('code') ? 'agreed' : s.has('jira') ? 'jira-only' : s.has('code') ? 'code-only' : r.bucket;
};
const ruleValues = (p) => Object.entries(p || {}).map(([k, v]) => `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');

/** The reviewer-facing requirement set: one section per Jira story, each requirement with its business rule and sources. */
function requirementSetMarkdown(c) {
  const rules = new Map(c.artifacts.rules.map((r) => [r.requirementId, r]));
  const level = new Map();
  for (const i of c.inputs.filter((x) => x.slot === 'epic')) {
    for (const h of i.hierarchy || []) { level.set(h.key, 1); for (const ch of h.children || []) level.set(ch.key, 2); }
  }
  for (const x of c.baselineJiraItems || []) if (!level.has(x.key)) level.set(x.key, x.level === 'story' ? 2 : 1);
  const byStory = new Map();
  for (const r of c.artifacts.requirements) {
    const keys = r.jiraKeys || [];
    const k = [...keys].sort((x, y) => (level.get(y) || 0) - (level.get(x) || 0))[0] || '(not tied to a Jira story)';
    byStory.set(k, [...(byStory.get(k) || []), r]);
  }
  const lines = [`# Requirement set: ${c.name} (${c.id})`, '',
    `${c.artifacts.requirements.length} requirements, each with its business rule, exact values and where it is stated. Reviewed by ${(c.review && c.review.reviewer) || 'not reviewed yet'}.`, ''];
  for (const [k, reqs] of [...byStory].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))) {
    lines.push(`## ${k}`, '', mdTable(['ID', 'Requirement', 'Business rule', 'Exact values', 'Test approach', 'Source', 'Where stated', 'Status'], reqs.map((r) => {
      const b = rules.get(r.id);
      return [r.id, r.text, b ? `${b.id} ${b.kind}` : '-', b && b.executable ? ruleValues(b.parameters) : '-', b ? (b.executable ? 'automatable' : 'manual') : '-',
        SOURCE_LABEL[sourceOf(r)] || r.bucket, r.origins.map((o) => `${o.ref}${o.line ? `:${o.line}` : ''}`).join('; '), r.status];
    })), '');
  }
  return lines.join('\n');
}

async function exportCycle(pipeline, store, c, dir) {
  const a = c.artifacts;
  const run = store.runDir(c.id);
  json(path.join(dir, '01-inputs', 'inputs.json'), c.inputs);
  json(path.join(dir, '01-inputs', 'normalisation.json'), c.normalisation);
  if (c.reviewAgent) json(path.join(dir, '01-inputs', 'review-agent.json'), c.reviewAgent);
  if (c.delta) json(path.join(dir, '01-inputs', 'delta-classification.json'), c.delta);
  json(path.join(dir, '02-requirements', 'requirements.json'), a.requirements);
  json(path.join(dir, '02-requirements', 'business-rules.json'), a.rules);
  write(path.join(dir, '02-requirements', 'requirement-set.md'), requirementSetMarkdown(c));
  json(path.join(dir, '03-test-cases', 'test-cases.json'), a.testCases);
  write(path.join(dir, '03-test-cases', `${c.id}-test-cases.xlsx`), await testCasesWorkbook(c));
  const { dictionary } = pipeline.dictionaryOf(c);
  json(path.join(dir, '04-test-data', 'test-data-summary.json'), { ...a.testDataSummary, sets: a.testData });
  for (const d of a.testData) json(path.join(dir, '04-test-data', `${d.testCaseKey}.json`), dataSetFile(d, dictionary));
  for (const s of a.scripts) write(path.join(dir, '05-automation-scripts', s.file), s.code);
  json(path.join(dir, '06-execution', 'results.json'), a.execution);
  for (const f of ['playwright-report.json', 'playwright-output.txt']) fs.copyFileSync(path.join(run, f), path.join(dir, '06-execution', f));
  fs.cpSync(path.join(run, 'evidence'), path.join(dir, '06-execution', 'evidence'), { recursive: true });
  json(path.join(dir, '07-defects', 'defects.json'), a.defects);
  write(path.join(dir, '08-report', `${c.id}-cycle-report.html`), renderReportHtml(c.report));
  write(path.join(dir, '08-report', `${c.id}-cycle-report.xlsx`), await reportWorkbook(c.report, c));
  json(path.join(dir, '08-report', `${c.id}-cycle-report.json`), c.report);
  if (c.report.traceability) json(path.join(dir, '08-report', 'traceability.json'), c.report.traceability);
  if (c.mergeProposal) json(path.join(dir, '09-merge-approval', 'merge-proposal.json'), { proposal: c.mergeProposal, approvals: c.approvals });

  const lead = buildLeadReport(c);
  write(path.join(dir, '08-report', `${c.id}-qe-lead-report.html`), renderLeadPage(lead));
  write(path.join(dir, '08-report', `${c.id}-qe-lead-report.md`), renderLeadMarkdown(lead));
  const ex = a.execution.summary;
  const md = [renderLeadMarkdown(lead),
    '## Appendix A: test results (real Playwright run)', mdTable(['Key', 'Test', 'Result', 'ms'], a.execution.results.map((r) => [r.key, r.name, r.status, r.duration ?? ''])), '',
    '## Appendix B: requirements', mdTable(['ID', 'Requirement', 'Status'], a.requirements.map((r) => [r.id, r.text, r.status])), '',
  ].join('\n');
  write(path.join(dir, 'README.md'), md);
  return ex;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-demo-'));
  const { pipeline, store } = createApp({ dataDir, env: {} });

  const hotel = [];
  for (const [testingType, label] of HOTEL_TESTING_TYPES) {
    let h = await pipeline.startCycle({ type: 'baseline', name: `Hotel booking baseline · ${label}`, inputs: HOTEL_INPUTS, reviewer: REVIEWER, testingType });
    await pipeline.review(h.id, { reviewer: REVIEWER, excluded: h.gaps.findings.flatMap((g) => g.groupIds) }).done;
    h = store.getCycle(h.id);
    if (h.status !== 'completed') throw new Error(`${h.id} ended as ${h.status}`);
    hotel.push(h);
  }

  const c1 = hotel.find((h) => h.testingType === 'functional');
  let c2 = await pipeline.startCycle({ type: 'incremental', name: 'Hotel booking release 2.0 (AQPI-32 + AQPI-23)', baselineId: c1.baselineId, inputs: INCREMENT_INPUTS, reviewer: REVIEWER });
  await pipeline.review(c2.id, { reviewer: REVIEWER }).done;
  await pipeline.decideMerge(c2.id, { decision: 'approve', approver: APPROVER }).done;
  c2 = store.getCycle(c2.id);
  if (c2.status !== 'completed') throw new Error(`${c2.id} ended as ${c2.status}`);
  const ce = hotel.find((h) => h.testingType === 'eqe');
  let c2e = await pipeline.startCycle({ type: 'incremental', name: 'Hotel booking release 2.0 (AQPI-32 + AQPI-23) · EQE', baselineId: ce.baselineId, inputs: INCREMENT_INPUTS, reviewer: REVIEWER });
  await pipeline.review(c2e.id, { reviewer: REVIEWER }).done;
  await pipeline.decideMerge(c2e.id, { decision: 'approve', approver: APPROVER }).done;
  c2e = store.getCycle(c2e.id);
  if (c2e.status !== 'completed') throw new Error(`${c2e.id} ended as ${c2e.status}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  const eh = [];
  for (const h of hotel) eh.push(await exportCycle(pipeline, store, h, path.join(OUT, `flow-1-hotel-${h.testingType}-${h.id}`)));
  const e2 = await exportCycle(pipeline, store, c2, path.join(OUT, `flow-2-hotel-release-2-functional-${c2.id}`));
  const e2e = await exportCycle(pipeline, store, c2e, path.join(OUT, `flow-2-hotel-release-2-eqe-${c2e.id}`));
  const cmp = compareCycles(c1, c2);
  write(path.join(OUT, 'comparison', `compare-${c1.id}-vs-${c2.id}.html`), renderCompareHtml(cmp));
  write(path.join(OUT, 'comparison', `compare-${c1.id}-vs-${c2.id}.xlsx`), await compareWorkbook(cmp));
  json(path.join(OUT, 'comparison', `compare-${c1.id}-vs-${c2.id}.json`), cmp);

  const storyOf = (d) => (d.jira && d.jira.linkedTo) || (d.jiraKeys || [])[0] || '-';
  const fixedIn = new Map((c2.artifacts.resolvedDefects || []).map((d) => [d.id, d]));
  const openIn = new Set(c2.artifacts.defects.map((d) => d.id));
  const lifecycle = [
    ...c1.artifacts.defects.map((d) => [d.id, storyOf(d), d.title, 'new',
      fixedIn.has(d.id) ? `fixed, retested (${d.type === 'gap' ? `${fixedIn.get(d.id).retest.cases.length} test(s) of ${d.story}` : d.testCaseKey} passed), certified closed` : openIn.has(d.id) ? (c2.artifacts.defects.find((x) => x.id === d.id).movement || 'still open') : 'not re-run']),
    ...c2.artifacts.defects.filter((d) => d.movement === 'new').map((d) => [d.id, storyOf(d), d.title, '-', 'new']),
  ];
  const row = (c, e) => [c.id, `${c.type} · ${c.testingType}`, c.artifacts.requirements.length, c.artifacts.testCases.length, c.artifacts.scripts.length, `${e.passed}/${e.executed}`, `${e.passRate}%`, c.artifacts.defects.length];
  write(path.join(OUT, 'README.md'), [
    '# Agentic QE Platform - demo artifacts', '',
    `Generated ${new Date().toISOString()} by \`node scripts/export-demo-artifacts.js\`. Every cycle was run end to end; the Playwright results are real runs against the system under test.`, '',
    '## Flow 1: hotel booking platform (AQPI)', '',
    'Inputs: the AQPI-1 initiative, its 7 epics and 23 stories (Jira REST v3 export of the AQPI space on GitHub branch `demo/jira-export`) and the Java 21 Spring Boot WebFlux codebase on branch `demo/hotel-booking-platform`. The cases ran against the six real hotel services (search, hotel, offer, cart, reservation, notification) started from their built jars on free local ports. Cases the platform cannot automate against these APIs (for example browser accessibility and measured load targets) are reported as manual, not run. Release 1.0 has three real defects: a 9-room search is accepted (AQPI-4), a 0.5% price change already asks for acknowledgement (AQPI-17) and a 7-character Idempotency-Key is accepted (AQPI-21).', '',
    mdTable(['Cycle', 'Mode · testing', 'Requirements', 'Test cases', 'Scripts', 'Passed', 'Pass rate', 'Defects'], hotel.map((h, i) => row(h, eh[i]))), '',
    '## Flow 2: hotel booking release 2.0 (AQPI-32 + AQPI-23)', '',
    `Inputs: Epic 8 AQPI-32 "Release 2.0" with stories AQPI-33 to AQPI-36, Epic 6 AQPI-23 "Confirmation and Notifications" as revised for release 2.0 (AQPI-24 and AQPI-25 changed, AQPI-26 unchanged, AQPI-37 new; Jira export snapshot \`release-2.0\`) and the release 2.0 codebase on branch \`demo/hotel-booking-platform-v2\`, added on top of the functional baseline ${c1.id}. Changed: cart hold 30 -> 20 minutes, Paris stay 21 -> 14 nights, resends 3 -> 5, ops e-mail retries 2 -> 3, the confirmation of a refundable booking states its free-cancellation deadline. New: free cancellation up to 48 hours before check-in and a cancellation e-mail. The merge was approved before execution; the cases ran against the six release 2.0 services. Release 2.0 fixes the 9-room search defect (AQPI-4), which Flow 2 retests and certifies closed; the other two Flow 1 defects stay open. New defects in the release 2.0 requirements: a 15-night Paris stay is accepted (AQPI-34) and a 4th ops e-mail retry is accepted (AQPI-25).`, '',
    mdTable(['Cycle', 'Mode · testing', 'Requirements', 'Test cases', 'Scripts', 'Passed', 'Pass rate', 'Defects'], [row(c2e, e2e), row(c2, e2)]), '',
    `## Defect lifecycle: ${c1.id} (release 1.0) -> ${c2.id} (release 2.0)`, '',
    'Every defect comes from a test that really failed. Flow 2 re-runs the Flow 1 test behind each open defect against the release 2.0 build: a pass closes the defect as fixed, retested and certified; a fail keeps it open under the same ID.', '',
    mdTable(['Defect', 'Story', 'Title', c1.id, c2.id], lifecycle), '',
    'Each cycle folder\'s README is its QE lead report: inputs taken, how the cycle was run, artifacts produced, risks, a go/no-go recommendation and sign-off.', '',
    '## Folder layout (per cycle)',
    '- `01-inputs/` inputs with provenance, normalisation (agreed / single-source / conflicts) and, for Flow 2, the delta classification',
    '- `02-requirements/` the common requirement set from the requirements agent: `requirement-set.md` story by story for BA, PO and QE review, `requirements.json` (each requirement with its business rule) and `business-rules.json` (exact values and source quotes)',
    '- `03-test-cases/` test cases (JSON and Zephyr Scale Excel export)',
    '- `04-test-data/` one data set per test case, generated by the test data agent from the data dictionary and checked against it',
    '- `05-automation-scripts/` generated Playwright specs (each loads its case\'s data set)',
    '- `06-execution/` real Playwright JSON report, console output, mapped results and per-test evidence',
    '- `07-defects/` defects raised from real failures only',
    '- `08-report/` QE lead report (HTML, Markdown) and full cycle report (HTML, Excel, JSON)',
    '- `09-merge-approval/` (Flow 2) merge proposal and approvals', '',
    `\`comparison/\` holds the hotel release 1.0 (${c1.id}) vs release 2.0 (${c2.id}) comparison (HTML, Excel, JSON).`,
    'Open the `.html` files in a browser (download them or clone the repo; GitHub shows HTML as source).', '',
  ].join('\n'));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
