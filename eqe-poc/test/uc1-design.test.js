'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { jiraMode, loadEpic } = require('../src/jira');
const { analyseEpic, grounding, compareGolden, requirementIndex } = require('../src/design');

test('Jira: export snapshot unless all three dummy-Jira variables are set', async () => {
  assert.equal(jiraMode({}).mode, 'export-snapshot');
  assert.equal(jiraMode({ JIRA_BASE_URL: 'https://example.invalid', JIRA_EMAIL: 'a@example.invalid' }).mode, 'export-snapshot');
  const j = await loadEpic('AQPI-2', {});
  assert.deepEqual(j.stories.map((s) => s.key), ['AQPI-3', 'AQPI-4', 'AQPI-5']);
  assert.ok(j.stories[0].acceptanceCriteria.some((a) => a.id === 'AQPI-3-AC1' && /search request is created/.test(a.text)));
});

test('UC1 metrics are computed from Jira + stage-2.json, and pending items stay pending', async () => {
  const a = await analyseEpic('AQPI-2', { env: {} });
  const m = Object.fromEntries(a.thresholds.map((t) => [t.metric, t]));
  assert.equal(a.stage2.cases.length >= 12 && a.stage2.cases.length <= 15, true);
  assert.equal(m['AC coverage'].value, a.coverage.ac.pct);
  assert.ok(m['AC coverage'].value >= 80);
  assert.equal(m['Review time per epic'].value, null, 'review time is entered by a human');
  assert.equal(m['Review time per epic'].met, null);
  assert.equal(a.golden.status, 'pending-golden-set');
  assert.equal(m['QE-lead approval to scale'].met, null);
  for (const c of a.stage2.cases) assert.ok(c.traces.length, `${c.id} has traceability`);
});

test('grounding flags quotes not found in Jira and IDs that do not exist', async () => {
  const j = await loadEpic('AQPI-2', {});
  const idx = requirementIndex(j);
  const stage2 = { cases: [
    { id: 'X1', type: 'positive', traces: [{ id: 'AQPI-3-AC1', quote: 'matching available hotels are returned' }], steps: [{ expected: 'x', proves: ['AQPI-3-AC1'] }] },
    { id: 'X2', type: 'positive', traces: [{ id: 'AQPI-3-AC1', quote: 'loyalty points are awarded' }], steps: [] },
    { id: 'X3', type: 'negative', traces: [{ id: 'AQPI-99-AC1', quote: 'anything' }], steps: [] },
  ] };
  const g = grounding(stage2, idx);
  assert.deepEqual(g.ungrounded.map((x) => `${x.case}:${x.kind}`), ['X2:trace', 'X3:trace', 'X3:negative-request']);
});

test('golden comparison matches by trace overlap once a human set exists', async () => {
  const j = await loadEpic('AQPI-2', {});
  const idx = requirementIndex(j);
  const stage2 = { cases: [{ id: 'D1', traces: [{ id: 'AQPI-3-AC1' }] }, { id: 'D2', traces: [{ id: 'AQPI-4-AC1' }] }] };
  const golden = { authoredBy: 'unit-test fixture', cases: [{ id: 'G1', title: 't', traces: ['AQPI-3-AC1'] }, { id: 'G2', title: 't', traces: ['AQPI-5-AC1'] }] };
  const r = compareGolden(golden, stage2, idx);
  assert.equal(r.recall, 50);
  assert.deepEqual(r.devinOnly, ['D2']);
  assert.deepEqual(r.missedRequirements, ['AQPI-5-AC1']);
});
