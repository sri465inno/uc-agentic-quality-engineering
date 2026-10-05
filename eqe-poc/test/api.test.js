'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/server');

const dataDir = fs.mkdtempSync(path.join(__dirname, '..', 'data', 'test-'));
let server; let base; let ctx;
const j = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const lead = { actor: 'Test Lead', role: 'QE lead' };

test.before(async () => {
  ctx = createApp({ dataDir });
  await new Promise((res) => { server = ctx.app.listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}`;
  ctx.pipeline.baseURL = `${base}/demo-booking/`;
});
test.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('full run through the three gates with a 5-run dry run', { timeout: 240000 }, async () => {
  assert.equal((await j('POST', '/api/runs', { epics: ['AQPI-2', 'AQPI-6'] })).status, 409, 'Gate 1 epic limit');
  let r = await j('POST', '/api/runs', { initiative: 'AQPI-1', epics: ['AQPI-2'] });
  assert.equal(r.status, 201);
  const id = r.body.id;
  assert.equal((await j('POST', `/api/runs/${id}/gates/scope/decision`, { ...lead, decision: 'approved' })).status, 409, 'timer must be started');
  await j('POST', `/api/runs/${id}/gates/scope/start`, lead);
  r = await j('POST', `/api/runs/${id}/gates/scope/decision`, { ...lead, decision: 'approved' });
  assert.equal(r.body.status, 'awaiting-case-review');
  await j('POST', `/api/runs/${id}/gates/cases/start`, lead);
  assert.equal((await j('POST', `/api/runs/${id}/gates/cases/decision`, { ...lead, decision: 'approved' })).status, 409, 'all cases need verdicts');
  assert.equal((await j('POST', `/api/runs/${id}/stage3`, {})).status, 409, 'stage 3 locked');
  for (const c of r.body.stage2.cases) r = await j('POST', `/api/runs/${id}/cases/${c.id}/verdict`, { actor: lead.actor, verdict: 'accepted' });
  r = await j('POST', `/api/runs/${id}/gates/cases/decision`, { ...lead, decision: 'approved' });
  assert.equal(r.body.metrics.uc1.checks.acCoverage, true);
  assert.equal(r.body.metrics.uc1.qeLeadApproved, true);
  r = await j('POST', `/api/runs/${id}/stage3`, { actor: 'Bot' });
  assert.equal(r.status, 202);
  assert.equal(r.body.stage3.caseIds.length, 3, 'Gate 2 starts at 3 cases');
  while (r.body.stage3.status === 'running') { await new Promise((s) => setTimeout(s, 1500)); r = await j('GET', `/api/runs/${id}`); }
  assert.equal(r.body.stage3.status, 'complete');
  assert.equal(r.body.stage3.runs.length, 5);
  assert.equal(r.body.metrics.uc2.flakeRate, 0);
  await j('POST', `/api/runs/${id}/gates/code/start`, { actor: 'Rev', role: 'Automation reviewer' });
  r = await j('POST', `/api/runs/${id}/gates/code/decision`, { actor: 'Rev', role: 'Automation reviewer', decision: 'approved' });
  assert.equal(r.body.status, 'complete');
  const names = r.body.artifacts.map((a) => a.name);
  for (const f of ['AQPI-1-analysis-and-progress.html', 'Stage-1-Requirement-and-details.xlsx', 'Stage-2-Test-Scenarios-and-Test-cases.xlsx', 'coverage-matrix.xlsx', 'gap-register.xlsx', 'flake-report.html', 'evidence-pack.html']) assert.ok(names.includes(f), f);
  const res = await fetch(`${base}/runs/${id}/artifacts/..%2F..%2Frun.json`);
  assert.notEqual(res.status, 200);
  assert.equal((await j('GET', '/api/meta')).body.scaling.uc1.maxEpics, 6, 'passing run unlocks Gate 1 scaling');
});
