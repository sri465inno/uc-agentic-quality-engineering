'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createApp } = require('../src/server');
const { raiseDefects } = require('../src/defects');
const { mapReport } = require('../src/execution');
const { testCasesWorkbook, reportWorkbook, compareWorkbook, TEST_CASE_COLUMNS } = require('../src/excel');
const { compareCycles, renderCompareHtml } = require('../src/compare');
const { renderReportHtml } = require('../src/report');
const { bothFlows, baselineCycle, incrementalDesign, tmpDir } = require('./helpers');

let F;
test.before(async () => { F = await bothFlows(); });

test('baseline execution is real: Playwright JSON results map back to test cases', () => {
  const ex = F.c1.artifacts.execution;
  assert.equal(F.c1.status, 'completed');
  assert.equal(ex.executed, true);
  assert.match(ex.tool, /Playwright/);
  const raw = JSON.parse(fs.readFileSync(path.join(F.store.runDir(F.c1.id), 'playwright-report.json'), 'utf8'));
  const mapped = mapReport(raw, F.c1.artifacts.testCases);
  const automated = F.c1.artifacts.testCases.filter((t) => t.automation === 'Automated');
  assert.equal(ex.summary.executed, automated.length);
  for (const t of automated) {
    const r = ex.results.find((x) => x.key === t.key);
    assert.ok(['passed', 'failed'].includes(r.status), `${t.key} has a real result`);
    assert.equal(r.status, mapped.find((m) => m.key === t.key).status, `${t.key} status comes from the Playwright report`);
    assert.equal(typeof r.duration, 'number');
  }
  for (const t of F.c1.artifacts.testCases.filter((x) => x.automation !== 'Automated')) {
    assert.equal(ex.results.find((x) => x.key === t.key).status, 'not-run');
  }
  const failed = ex.results.filter((r) => r.status === 'failed');
  assert.equal(failed.length, 1, 'exactly the seeded defect fails');
  assert.match(failed[0].name, /exactly 7 nights earns the 1\.5% long-stay bonus/);
  assert.equal(failed[0].error.expected, '92');
  assert.equal(failed[0].error.actual, '80');
  assert.match(failed[0].error.assertion, /expect\(r\.body\.commission\)\.toBe\(92\)/);
  assert.ok(failed[0].evidence.length > 0);
  assert.equal(ex.summary.passed + ex.summary.failed, ex.summary.executed);
});

test('mapReport marks cases missing from the report as not run and never invents a pass', () => {
  const cases = [{ key: 'AQE-T1', automation: 'Automated' }, { key: 'AQE-T2', automation: 'Automated' }];
  const report = { suites: [{ file: 'a.spec.js', specs: [{ title: '[AQE-T1] x', tests: [{ results: [{ status: 'failed', duration: 5, error: { message: 'Expected: 2\nReceived: 3' } }] }] }], suites: [] }] };
  const m = mapReport(report, cases);
  assert.equal(m.find((x) => x.key === 'AQE-T1').status, 'failed');
  assert.equal(m.find((x) => x.key === 'AQE-T2').status, 'not-run');
  assert.match(m.find((x) => x.key === 'AQE-T2').reason, /not present/);
});

test('defects are raised only from real failures, with expected/actual/assertion and links', () => {
  const c = F.c1;
  assert.equal(c.artifacts.defects.length, 1);
  const d = c.artifacts.defects[0];
  const failed = c.artifacts.execution.results.find((r) => r.status === 'failed');
  assert.equal(d.testCaseKey, failed.key);
  assert.equal(d.expected, '92');
  assert.equal(d.actual, '80');
  assert.match(d.assertion, /toBe\(92\)/);
  assert.ok(c.artifacts.requirements.some((r) => r.id === d.requirementId));
  for (const r of c.artifacts.requirements) {
    const rule = c.artifacts.rules.find((x) => x.requirementId === r.id);
    assert.equal(r.businessRule.id, rule.id, `${r.id} carries its business rule`);
    assert.deepEqual(r.businessRule.parameters, rule.parameters);
    assert.equal(r.businessRule.executable, rule.executable);
  }
  assert.ok(!c.phases.some((p) => p.name === 'rules'), 'no separate business rules phase');
  assert.match(c.phases.find((p) => p.name === 'requirements').summary, /each with its business rule: \d+ automatable · \d+ manual/);
  assert.ok(c.artifacts.testCases.some((t) => t.key === d.testCaseKey));
  assert.deepEqual(d.jiraKeys, ['COM-10']);
  assert.throws(() => raiseDefects({ execution: { executed: false, results: [] }, testCases: [], requirements: [], cycle: c }), /real execution/);
  const allPass = { executed: true, results: c.artifacts.execution.results.map((r) => ({ ...r, status: r.status === 'failed' ? 'passed' : r.status })) };
  assert.equal(raiseDefects({ execution: allPass, testCases: c.artifacts.testCases, requirements: c.artifacts.requirements, cycle: c }).defects.length, 0);
});

test('Excel export has the Zephyr Scale columns, one row per test case, and marks new/changed rows', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await testCasesWorkbook(F.c2));
  const ws = wb.getWorksheet('Test Cases');
  const headers = ws.getRow(1).values.slice(1);
  assert.deepEqual(headers.slice(0, 13), ['Key', 'Name', 'Objective', 'Precondition', 'Test Step', 'Test Data', 'Expected Result', 'Priority', 'Type', 'Labels', 'Requirement link', 'Automation status', 'Cycle']);
  assert.equal(headers.length, TEST_CASE_COLUMNS.length);
  assert.equal(ws.rowCount - 1, F.c2.artifacts.testCases.length);
  const rows = [];
  ws.eachRow((r, i) => { if (i > 1) rows.push(Object.fromEntries(headers.map((h, j) => [h, r.getCell(j + 1).value]))); });
  const cap = rows.find((r) => /Commission is capped at/.test(r.Name));
  assert.equal(cap.Change, 'Changed');
  assert.match(cap['Expected Result'], /USD 750\.00/);
  assert.ok(rows.some((r) => r.Change === 'New'));
  assert.ok(rows.some((r) => r.Change === 'Carried over'));
  assert.ok(rows.every((r) => ['Functional', 'Non-functional'].includes(r.Type)));
  for (const t of F.c2.artifacts.testCases) {
    const row = rows.find((r) => r.Key === t.key);
    assert.equal(row['Requirement link'], [...t.sourceRefs, t.requirementId, t.ruleId].join(', '));
  }
  assert.ok(rows.some((r) => /COM-20/.test(r['Requirement link'])));
  assert.ok(rows.every((r) => r.Labels.split(', ').every((l) => ['functional', 'regression', 'automation', 'non-functional'].includes(l))));
  for (const buf of [await reportWorkbook(F.c2.report, F.c2), await compareWorkbook(compareCycles(F.c1, F.c2))]) {
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(buf);
    assert.ok(w.worksheets.length >= 3);
  }
});

test('merge approval is required before the baseline changes; approval bumps the version', () => {
  assert.equal(F.designed.status, 'awaiting-merge');
  assert.equal(F.designed.artifacts.execution, undefined, 'nothing executed before merge approval');
  assert.equal(F.baselineBeforeMerge.version, 1);
  assert.equal(F.baselineBeforeMerge.requirements.length, F.c1.artifacts.requirements.length);
  const mp = F.designed.mergeProposal;
  assert.equal(mp.requirements.length, F.designed.delta.counts.enhanced + F.designed.delta.counts.new);
  const after = F.store.getBaseline(F.c1.baselineId);
  assert.equal(after.version, 2);
  assert.equal(after.requirements.length, F.c2.artifacts.requirements.length);
  assert.ok(after.requirements.find((r) => /capped at USD 750/.test(r.text)));
  assert.equal(F.store.getBaseline(F.c1.baselineId, 1).version, 1, 'v1 snapshot kept');
  assert.ok(F.c2.approvals.some((a) => a.gate === 'Merge into baseline' && a.decision === 'approved' && a.by === 'Sam Lee'));
});

test('rejecting the merge leaves the approved baseline untouched', async () => {
  const dataDir = tmpDir('reject');
  const { pipeline, store } = createApp({ dataDir, env: {} });
  const c1 = await baselineCycle(pipeline, store);
  const before = JSON.stringify(store.getBaseline(c1.baselineId));
  const d = await incrementalDesign(pipeline, store, c1.baselineId);
  assert.equal(JSON.stringify(store.getBaseline(c1.baselineId)), before, 'unchanged while awaiting approval');
  assert.throws(() => pipeline.decideMerge(d.id, { decision: 'approve' }), /Approver/);
  await pipeline.decideMerge(d.id, { decision: 'reject', approver: 'Sam Lee' }).done;
  assert.equal(JSON.stringify(store.getBaseline(c1.baselineId)), before, 'unchanged after rejection');
  const rejected = store.getCycle(d.id);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.artifacts.execution, undefined);
  assert.throws(() => pipeline.decideMerge(d.id, { decision: 'approve', approver: 'x' }), /not awaiting merge/);
});

test('incremental cycle: enhanced value executed for real; defects from real failures; carried over vs re-designed labelled', () => {
  const c2 = F.c2;
  assert.equal(c2.status, 'completed');
  assert.equal(c2.delta.summary, `${c2.delta.counts.unchanged} unchanged · ${c2.delta.counts.enhanced} enhanced · ${c2.delta.counts.new} new`);
  assert.ok(c2.delta.counts.unchanged && c2.delta.counts.enhanced && c2.delta.counts.new);
  assert.equal(c2.delta.summary, '10 unchanged · 1 enhanced · 3 new');
  const cap = c2.artifacts.scripts.find((s) => s.file.includes('commission-cap'));
  assert.match(cap.code, /expect\(r\.body\.commission\)\.toBe\(750\);/);
  const capCase = c2.artifacts.testCases.find((t) => t.scriptFile === cap.file);
  assert.equal(c2.artifacts.execution.results.find((r) => r.key === capCase.key).status, 'passed', 'the USD 750 cap passes on the v2 build');
  for (const file of ['group-flat-rate', 'package-room-component', 'corporate-flat-rate']) {
    const s = c2.artifacts.scripts.find((x) => x.file.includes(file));
    assert.equal(s.status, 'new', file);
    for (const k of s.covers) assert.equal(c2.artifacts.execution.results.find((r) => r.key === k).status, 'passed', `${k} passes on v2`);
  }
  assert.equal(c2.artifacts.execution.sut.build, 'demo/commission-engine-v2');
  const failed = c2.artifacts.execution.results.filter((r) => r.status === 'failed').map((r) => r.key).sort();
  assert.deepEqual(c2.artifacts.defects.map((d) => d.testCaseKey).sort(), failed);
  assert.equal(c2.artifacts.defects[0].movement, 'still open');
  assert.equal(c2.artifacts.defects[0].id, F.c1.artifacts.defects[0].id);
  const statuses = new Set(c2.artifacts.testCases.map((t) => t.status));
  assert.ok(statuses.has('carried over') && statuses.has('re-designed') && statuses.has('new'));
  for (const p of c2.phases.filter((x) => x.handover)) assert.equal(p.handover.status, 'complete', `${p.name} hand-over: missing ${p.handover.missing}`);
  assert.equal(c2.phases.find((p) => p.name === 'report').handover.items.find((i) => i.key === 'comparison').status, 'delivered');
  assert.equal(c2.previousCycleId, F.c1.id);
});

test('cycle report contains provenance, counts by type and phase tag, execution, defects, coverage and approvals', () => {
  const r = F.c1.report;
  assert.equal(r.inputs.length, 3);
  assert.ok(r.inputs.every((i) => i.provenance === 'fixture' && /no live/.test(i.provenanceLabel)));
  assert.equal(r.requirements.total, F.c1.artifacts.requirements.length);
  assert.equal(r.testCases.total, F.c1.artifacts.testCases.length);
  assert.ok(r.testCases.byType.functional > 0);
  assert.ok(r.testCases.byLabel.functional > 0 && r.testCases.byLabel.automation > 0);
  assert.equal(r.execution.executed, true);
  assert.equal(r.execution.summary.failed, 1);
  assert.equal(r.defects.open.length, 1);
  assert.ok(r.coverage.percent.designed > 0);
  assert.equal(r.approvals[0].gate, 'Requirement set review');
  assert.equal(r.approvals[0].by, 'Priya Shah');
  assert.ok(r.approvals[0].at);
  assert.match(r.narrative.draftedBy, /demo mode/);
  const html = renderReportHtml(r);
  assert.match(html, /Agentic QE Platform - MVP/);
  assert.match(html, /recorded|fixture/i);
  assert.match(html, /toBe\(92\)/);
  assert.match(html, /7 platform agents: .*3\. Test data agent/);
  assert.match(html, /1000<\/b> attributes/);
  assert.equal(r.coverage.attributes.attributeCount, 1000);
  assert.ok(r.coverage.attributes.exercised >= 8, 'most commission drivers are varied by some case');
  assert.equal(r.coverage.attributes.rows.find((x) => x.attribute === 'stay.nights').status, 'exercised - failing', 'the seeded 7-night defect shows on its driver');
  assert.equal(r.platform.agents.length, 7);
  assert.deepEqual(r.platform.agents.map((g) => g.status), [...Array(6).fill('done'), 'producing this report']);
  assert.deepEqual(r.platform.inputsImplemented.slice(0, 3), ['Jira initiative (implemented)', 'Jira epic (+ child stories) (implemented)', 'Codebase (GitHub branch) (implemented)']);
  const r2 = F.c2.report;
  assert.match(r2.delta.summary, /unchanged · \d+ enhanced · \d+ new/);
  assert.equal(r2.approvals.length, 2);
  assert.ok(r2.approvals.some((a) => a.gate === 'Merge into baseline'));
  assert.equal(r2.testCases.byStatus['carried over'] > 0, true);
});

test('cycle comparison: requirements, test cases and scripts added/changed/unchanged, pass-rate and defect movement', () => {
  const c = compareCycles(F.c1, F.c2);
  const d = F.c2.delta.counts;
  assert.equal(c.requirements.added.length, d.new);
  assert.equal(c.requirements.changed.length, d.enhanced);
  assert.equal(c.requirements.changedDetail[0].before.includes('USD 500') && c.requirements.changedDetail[0].after.includes('USD 750'), true);
  assert.equal(c.requirements.unchanged.length, F.c1.artifacts.requirements.length - d.enhanced);
  assert.equal(c.testCases.changed.length, F.c2.artifacts.testCases.filter((t) => t.status === 're-designed').length);
  assert.equal(c.testCases.added.length, F.c2.artifacts.testCases.filter((t) => t.status === 'new').length);
  assert.equal(c.scripts.changed.length, 1);
  assert.ok(c.scripts.added.length >= 1);
  assert.equal(c.execution.a.passRate, F.c1.artifacts.execution.summary.passRate);
  assert.equal(c.execution.b.passRate, F.c2.artifacts.execution.summary.passRate);
  assert.equal(c.execution.passRateDelta, Math.round((c.execution.b.passRate - c.execution.a.passRate) * 10) / 10);
  assert.deepEqual(c.defects.stillOpen, [F.c1.artifacts.defects[0].id]);
  assert.match(renderCompareHtml(c), /Cycle comparison/);
});

test('restart persistence: cycles, baselines, artifacts, approvals and reports survive a restart', async () => {
  const fresh = createApp({ dataDir: F.dataDir, env: {} });
  const c1 = fresh.store.getCycle(F.c1.id);
  const c2 = fresh.store.getCycle(F.c2.id);
  assert.deepEqual(c1, F.c1);
  assert.deepEqual(c2, F.c2);
  assert.equal(fresh.store.listCycles().length, 2);
  assert.equal(fresh.store.getBaseline(F.c1.baselineId).version, 2);
  assert.ok(fs.existsSync(path.join(fresh.store.runDir(F.c2.id), 'playwright-report.json')));
  const server = fresh.app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const cycles = await (await fetch(`${base}/api/cycles`)).json();
    assert.deepEqual(cycles.map((c) => c.id), [F.c1.id, F.c2.id]);
    const html = await (await fetch(`${base}/api/cycles/${F.c2.id}/report.html`)).text();
    assert.match(html, /Agentic QE Platform - MVP/);
    const x = await fetch(`${base}/api/cycles/${F.c2.id}/export/testcases.xlsx`);
    assert.equal(x.status, 200);
    assert.match(x.headers.get('content-type'), /spreadsheetml/);
    const cmp = await (await fetch(`${base}/api/compare?a=${F.c1.id}&b=${F.c2.id}`)).json();
    assert.equal(cmp.requirements.changed.length, 1);
  } finally { server.close(); }
  const running = { ...F.c2, id: 'CYC-99', status: 'running' };
  fresh.store.saveCycle(running);
  const again = createApp({ dataDir: F.dataDir, env: {} });
  assert.equal(again.store.getCycle('CYC-99').status, 'interrupted', 'a cycle cut off by a restart is labelled, not reported as finished');
});

test('merge gate: rejecting one row keeps the baseline value for it and merges the rest with stable ids', async () => {
  const { pipeline, store } = createApp({ dataDir: tmpDir('rowreject'), env: {} });
  const c1 = await baselineCycle(pipeline, store);
  const d = await incrementalDesign(pipeline, store, c1.baselineId);
  const sla = d.artifacts.requirements.find((r) => r.status === 'enhanced');
  assert.match(sla.text, /USD 750/);
  const added = d.artifacts.requirements.filter((r) => r.status === 'new').map((r) => r.id);
  assert.ok(d.artifacts.requirements.every((r) => r.businessRule && r.businessRule.status), 'incremental requirements carry their re-designed or carried-over rule');
  assert.throws(() => pipeline.decideMerge(d.id, { decision: 'approve', approver: 'Sam', rejectedRows: ['REQ-999'] }), /Not a row/);
  await pipeline.decideMerge(d.id, { decision: 'approve', approver: 'Sam Lee', rejectedRows: [sla.id] }).done;
  const c2 = store.getCycle(d.id);
  const kept = c2.artifacts.requirements.find((r) => r.id === sla.id);
  assert.equal(kept.text, c1.artifacts.requirements.find((r) => r.id === sla.id).text, 'rejected enhancement keeps the baseline value');
  assert.match(c2.artifacts.scripts.find((s) => s.requirementId === sla.id).code, /expect\(r\.body\.commission\)\.toBe\(500\);/);
  assert.deepEqual(c2.artifacts.requirements.filter((r) => r.status === 'new').map((r) => r.id), added, 'ids unchanged');
  assert.equal(store.getBaseline(c1.baselineId).version, 2);
  assert.match(c2.approvals.find((a) => a.gate === 'Merge into baseline').detail, new RegExp(`rows rejected at the gate: ${sla.id}`));
});

test('test data agent runs between test design and automation, and the specs really load its data sets', () => {
  for (const c of [F.c1, F.c2]) {
    const names = c.phases.map((p) => p.name);
    assert.ok(names.indexOf('testcases') < names.indexOf('testdata') && names.indexOf('testdata') < names.indexOf('scripts'), `${c.id}: testcases -> testdata -> scripts`);
    const a = c.artifacts;
    assert.deepEqual(a.testData.map((d) => d.testCaseKey), a.testCases.map((t) => t.key));
    assert.equal(a.testDataSummary.dictionary.attributeCount, 1000);
    assert.equal(a.testDataSummary.nonConforming, 0, 'every data set conforms to the dictionary or is a deliberate negative test');
    const dir = path.join(F.store.runDir(c.id), 'test-data');
    for (const t of a.testCases.filter((x) => x.automation === 'Automated')) {
      const f = JSON.parse(fs.readFileSync(path.join(dir, `${t.key}.json`), 'utf8'));
      assert.equal(Object.keys(f.reservation).length, 1000);
      for (const d of a.testData.find((x) => x.testCaseKey === t.key).drivers) assert.deepEqual(f.reservation[d.attribute], d.value, `${t.key} ${d.attribute}`);
    }
    assert.ok(a.scripts.every((s) => /dataSet\(testInfo\)/.test(s.code)));
  }
  const statuses = new Set(F.c2.artifacts.testData.map((d) => d.status));
  assert.ok(statuses.has('carried over') && statuses.has('new'), 'the increment carries unchanged data sets and generates new ones');
});
