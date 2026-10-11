'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { PHASES } = require('../src/pipeline');
const { tmpDir, baselineCycle, incrementalDesign, BASELINE_INPUTS } = require('./helpers');

const inRunCases = (c) => c.artifacts.testCases.filter((t) => t.inRun);

test('testing types are exposed in /api/meta, validated and persisted on the cycle', async () => {
  const ctx = createApp({ dataDir: tmpDir('tt-api'), env: {} });
  const server = ctx.app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (body) => { const r = await fetch(`${base}/api/cycles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try {
    const meta = await (await fetch(`${base}/api/meta`)).json();
    assert.deepEqual(meta.testingTypes.map((t) => t.id), ['eqe', 'functional']);
    assert.ok(meta.testingTypes.every((t) => t.dimension));
    assert.ok(meta.testingTypes.every((t) => t.name && t.focus && t.baseline && t.incremental));
    assert.equal(meta.platform.reviewAgent.id, 'review-agent');
    assert.equal(meta.platform.agents.length, 7, 'the review agent is not one of the seven');
    const bad = await post({ type: 'baseline', testingType: 'load-soak', inputs: BASELINE_INPUTS });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /testingType must be one of: eqe, functional/);
    assert.equal((await post({ type: 'baseline', testingTypes: ['eqe', 'functional'], inputs: BASELINE_INPUTS })).status, 400, 'one type of testing per run');
    const ok = await post({ type: 'baseline', testingType: 'eqe', inputs: BASELINE_INPUTS });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.testingType, 'eqe');
    assert.equal(ctx.store.getCycle(ok.body.id).testingType, 'eqe');
    const list = await (await fetch(`${base}/api/cycles`)).json();
    assert.equal(list.find((c) => c.id === ok.body.id).testingType, 'eqe');
    assert.ok(ok.body.skills.some((s) => s.id === 'testing-eqe') && !ok.body.skills.some((s) => s.id === 'testing-functional'), 'the type of testing picks its skill');
  } finally { server.close(); }
});

test('review agent runs before the human review, suggests added / missing / conflicting pieces and approves nothing', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('tt-ra'), env: {} });
  const c = await pipeline.startCycle({ type: 'baseline', testingType: 'functional', inputs: BASELINE_INPUTS });
  assert.deepEqual(PHASES.baseline.slice(0, 4), ['ingest', 'normalise', 'review-agent', 'review']);
  assert.equal(c.phases.find((p) => p.name === 'review-agent').status, 'done');
  assert.equal(c.phases.find((p) => p.name === 'review').status, 'waiting');
  assert.equal(c.status, 'awaiting-review');
  const ra = c.reviewAgent;
  assert.equal(ra.advisory, true);
  const conflict = ra.findings.find((f) => f.category === 'conflict');
  assert.match(conflict.title, /2 %/);
  assert.match(conflict.title, /1\.5 %/);
  assert.deepEqual([...new Set(conflict.sources.map((s) => s.source))].sort(), ['code', 'jira']);
  assert.ok(conflict.sources.every((s) => s.ref));
  assert.ok(ra.findings.some((f) => f.category === 'added' && /no Jira story/.test(f.title) && /404/.test(f.detail)));
  assert.ok(ra.findings.filter((f) => f.category === 'gap').every((f) => f.story && f.severity === 'minor' && f.sources.every((s) => s.source === 'jira')), 'a gap is a Jira story the code lacks, never a code-only rule');
  assert.ok(ra.findings.some((f) => /commission-driving attributes/.test(f.title)));
  assert.equal(ra.counts.conflicts, 1);
  assert.equal(c.normalisation.counts.conflict, 1, 'the review agent does not settle the conflict');
  assert.equal(c.review, undefined);
  assert.throws(() => pipeline.review(c.id, {}), /reviewer/i, 'the human review is still required');
});

test('functional: baseline designs, scripts and runs every functional case; incremental carries, re-designs and adds', async () => {
  const { pipeline, store } = createApp({ dataDir: tmpDir('tt-fn'), env: {} });
  const c1 = await baselineCycle(pipeline, store, { testingType: 'functional' });
  assert.equal(c1.status, 'completed');
  const run = inRunCases(c1);
  assert.ok(run.length >= 10);
  assert.ok(run.every((t) => t.type === 'functional' && t.suite === 'api'));
  assert.ok(!run.some((t) => t.ui || t.type === 'non-functional'), 'no screens or response times in a functional run');
  assert.ok(c1.artifacts.scripts.every((s) => /Type of testing: Functional testing/.test(s.code)));
  const ex = c1.artifacts.execution.summary;
  assert.equal(ex.executed, run.filter((t) => t.automation === 'Automated').length);
  assert.ok(ex.failed >= 1, 'the seeded 7-night defect is found');
  assert.equal(c1.report.testing.id, 'functional');

  const c2 = await incrementalDesign(pipeline, store, c1.baselineId, 'Priya Shah', 'functional');
  assert.equal(c2.status, 'awaiting-merge', 'the merge approval is still required');
  assert.equal(c2.artifacts.execution, undefined);
  const statuses = new Set(c2.artifacts.testCases.map((t) => t.status));
  for (const s of ['carried over', 're-designed', 'new']) assert.ok(statuses.has(s), s);
  const { done } = pipeline.decideMerge(c2.id, { decision: 'approve', approver: 'Sam Lee' });
  await done;
  const c3 = store.getCycle(c2.id);
  assert.equal(c3.status, 'completed');
  assert.ok(c3.artifacts.execution.summary.executed > ex.executed);
});

test('EQE: the run is the business-flow journeys and enterprise checks; Flow 2 keeps the baseline\'s type', async () => {
  const { pipeline, store } = createApp({ dataDir: tmpDir('tt-eqe'), env: {} });
  const c = await baselineCycle(pipeline, store, { testingType: 'eqe' });
  const run = inRunCases(c);
  assert.ok(run.length > 0 && run.length === c.artifacts.testCases.length);
  assert.ok(run.every((t) => ['journey', 'ui', 'nfr', 'load'].includes(t.suite) && t.labels.includes('eqe')));
  assert.ok(!c.artifacts.testCases.some((t) => t.suite === 'api'), 'single-rule checks belong to Functional');
  assert.ok(c.skills.some((s) => s.id === 'testing-eqe'));
  const c2 = await incrementalDesign(pipeline, store, c.baselineId);
  assert.equal(c2.testingType, 'eqe', 'an incremental run keeps the baseline\'s type of testing unless one is chosen');
});
