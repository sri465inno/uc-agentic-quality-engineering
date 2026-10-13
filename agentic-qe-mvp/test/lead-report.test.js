'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bothFlows } = require('./helpers');
const { buildLeadReport, renderLeadMarkdown } = require('../src/lead-report');

let F;
test.before(async () => { F = await bothFlows(); });

test('QE lead report: baseline lists inputs taken, artifacts produced, the real defect and a no-go recommendation', () => {
  const L = buildLeadReport(F.c1);
  assert.deepEqual(L.inputs.map((i) => i.ref).slice(0, 2), ['COM-1', 'COM-10']);
  assert.equal(L.inputs.length, 3);
  assert.equal(L.recommendation.decision, 'No-go');
  assert.match(L.recommendation.reason, /DEF-001/);
  assert.ok(L.recommendation.conditions.some((x) => /Fix DEF-001 and re-run TC-/.test(x)));
  const names = L.artifacts.map((x) => x.name);
  for (const n of ['Requirement set (with business rules)', 'Test cases (Excel, Zephyr Scale format)', 'Automation scripts (Playwright)', 'Execution results and evidence', 'Defects', 'Cycle report (HTML, Excel)']) assert.ok(names.includes(n), n);
  assert.equal(L.artifacts.find((x) => x.name === 'Test cases (Excel, Zephyr Scale format)').count, F.c1.artifacts.testCases.length);
  assert.ok(L.approach.some((s) => /GDS channel uplift/.test(s) && /1\.5%/.test(s)), 'the settled conflict is written up');
  assert.ok(L.risks.some((s) => /not executed/.test(s)), 'manual cases are called out');
  assert.deepEqual(L.signoff.map((x) => x.gate), ['Requirement set review']);
  const md = renderLeadMarkdown(L);
  for (const h of ['## 1. Summary', '## 2. Inputs taken', '## 3. How we ran the cycle', '## 4. Artifacts produced', '## 5. Risks and open items', '## 6. Recommendation and next steps', '## 7. Sign-off']) assert.ok(md.includes(h), h);
});

test('QE lead report: incremental reports the delta, reuse, the enhanced value and the merge sign-off', () => {
  const L = buildLeadReport(F.c2);
  assert.equal(L.inputs.length, 2);
  assert.ok(L.summary.some((s) => /unchanged/.test(s) && /reused unchanged/.test(s)));
  assert.ok(L.approach.some((s) => /USD 500/.test(s) && /USD 750/.test(s)), 'superseded and new cap are both shown');
  assert.ok(!L.approach.some((s) => /settling/.test(s)), 'baseline conflicts are not re-reported as settled in this cycle');
  assert.ok(L.artifacts.some((x) => x.name === 'Delta against baseline'));
  assert.deepEqual(L.signoff.map((x) => x.gate), ['Requirement set review', 'Merge into baseline']);
});

test('QE lead report is only available once the cycle has a report', () => {
  assert.equal(buildLeadReport({ ...F.c1, report: null }), null);
});

test('QE lead report: exit criteria, an evidence check that recounts every figure, and the track sign-off owner', () => {
  const L = buildLeadReport(F.c1);
  assert.equal(L.signoffOwner.owner, 'DQE lead');
  assert.match(L.signoffOwner.accountability, /Domain certification/);
  const status = Object.fromEntries(L.exitCriteria.map((x) => [x.criterion, x.status]));
  assert.equal(status['Requirement set approved by a named reviewer'], 'met');
  assert.equal(status['No open release-blocking defect'], 'not met', 'DEF-001 blocks the release');
  assert.equal(status['Every failed test case has a defect'], 'met');
  assert.ok(L.exitCriteria.every((x) => ['met', 'not met', 'open'].includes(x.status) && x.detail));
  assert.ok(L.evidenceCheck.length >= 6);
  assert.ok(L.evidenceCheck.every((x) => x.status === 'reconciled'), JSON.stringify(L.evidenceCheck.filter((x) => x.status !== 'reconciled')));
  const tampered = buildLeadReport({ ...F.c1, report: { ...F.c1.report, scripts: { ...F.c1.report.scripts, total: F.c1.report.scripts.total + 1 } } });
  assert.equal(tampered.evidenceCheck.find((x) => x.figure === 'Automation scripts').status, 'mismatch');
  const md = renderLeadMarkdown(L);
  for (const h of ['## 8. Exit criteria', '## 9. Evidence check', 'DQE sign-off owner: DQE lead']) assert.ok(md.includes(h), h);
});
