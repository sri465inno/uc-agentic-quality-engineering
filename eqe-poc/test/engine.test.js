'use strict';
const test = require('node:test');
const assert = require('node:assert');
const jira = require('../src/jira');
const { analyse } = require('../src/stage1');
const { design } = require('../src/stage2');
const { loadGolden, compare } = require('../src/golden');
const metrics = require('../src/metrics');
const { validate } = require('../demo-booking/server');

const SNAPSHOT_ENV = {};

test('snapshot mode is the default; live only with all three Jira variables', () => {
  assert.equal(jira.mode(SNAPSHOT_ENV).kind, 'snapshot');
  assert.equal(jira.mode({ JIRA_BASE_URL: 'https://x.atlassian.net', JIRA_EMAIL: 'a@b' }).kind, 'snapshot');
  assert.equal(jira.mode({ JIRA_BASE_URL: 'https://x.atlassian.net', JIRA_EMAIL: 'a@b', JIRA_API_TOKEN: 't' }).kind, 'live');
});

test('Stage 1 analyses AQPI-2 from the AQPI-1 export', async () => {
  const data = await jira.loadInitiative('AQPI-1', { env: SNAPSHOT_ENV });
  assert.ok(data.epics.length >= 1);
  const s1 = analyse(data, ['AQPI-2']);
  assert.equal(s1.summary.epics, 1);
  assert.deepEqual(s1.epics[0].stories.map((s) => s.key), ['AQPI-3', 'AQPI-4', 'AQPI-5']);
  assert.equal(s1.summary.acceptanceCriteria, 11);
  assert.ok(s1.gaps.some((g) => g.category === 'Outside UI lens'));
  assert.throws(() => analyse(data, []), /at least one epic/);
});

test('Stage 2 is happy-path by default and covers every UI acceptance criterion', async () => {
  const s1 = analyse(await jira.loadInitiative('AQPI-1', { env: SNAPSHOT_ENV }), ['AQPI-2']);
  const s2 = design(s1);
  const acs = s1.requirements.filter((r) => r.kind === 'AC' && r.lens === 'UI');
  for (const ac of acs) assert.ok(s2.cases.some((c) => c.req === ac.id), `${ac.id} has a case`);
  assert.ok(s2.cases.every((c) => c.source === 'AC'));
  const withNeg = design(s1, { includeNegatives: true });
  assert.ok(withNeg.cases.length >= s2.cases.length);
  for (const c of s2.cases) assert.ok(c.steps.length && c.steps.every((s) => s.action && s.expected));
});

test('golden comparison matches by requirement and reports misses', async () => {
  const s1 = analyse(await jira.loadInitiative('AQPI-1', { env: SNAPSHOT_ENV }), ['AQPI-2']);
  const s2 = design(s1);
  const golden = loadGolden('AQPI-2');
  assert.equal(golden.provenance.status, 'draft-pending-qe-lead-signoff');
  const r = compare(s2.cases, golden.cases);
  assert.equal(r.goldenCount, golden.cases.length);
  assert.ok(r.recall > 0.5);
  assert.ok(r.missed.some((m) => m.req === 'AQPI-3-BR2'), 'business-rule golden case is not generated on happy path');
  assert.equal(compare([], golden.cases).recall, 0);
});

test('metrics stay pending until the data exists', () => {
  assert.equal(metrics.uc1({ stage1: null }).ready, false);
  const run = { epics: ['E'], gates: { cases: { status: 'pending' } }, stage1: { requirements: [{ id: 'A', kind: 'AC' }, { id: 'B', kind: 'AC' }] }, stage2: { cases: [{ id: 'c1', req: 'A' }, { id: 'c2', req: 'B' }], verdicts: { c1: { verdict: 'accepted' } } } };
  const m = metrics.uc1(run);
  assert.equal(m.acCoverage, 1);
  assert.equal(m.hallucinationRate, null);
  run.stage2.verdicts.c2 = { verdict: 'hallucinated' };
  const m2 = metrics.uc1(run);
  assert.equal(m2.acCoverage, 0.5);
  assert.equal(m2.hallucinationRate, 0.5);
  assert.equal(m2.checks.acCoverage, false);
});

test('flake rate needs 5 runs and flags mixed outcomes', () => {
  const t = (s) => ({ tests: [{ id: 'a', status: 'passed' }, { id: 'b', status: s }] });
  const base = { gates: {}, stage3: { cases: [{ id: 'a', dataNeeds: ['validSearch'] }, { id: 'b', dataNeeds: ['nope'] }], playbookKeys: ['validSearch'], runs: [t('passed'), t('failed'), t('passed'), t('passed')] } };
  assert.equal(metrics.uc2(base).flakeRate, null);
  base.stage3.runs.push(t('passed'));
  const m = metrics.uc2(base);
  assert.equal(m.flakeRate, 0.5);
  assert.equal(m.dataMapped, 0.5);
});

test('demo-booking server-side validation is authoritative', () => {
  const d = (n) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  assert.deepEqual(validate({ destination: 'Paris', checkIn: d(30), checkOut: d(33), rooms: 1, adults: 2 }), {});
  assert.match(validate({ destination: 'Paris', checkIn: d(-1), checkOut: d(3), rooms: 1, adults: 2 }).checkIn, /past/);
  assert.match(validate({ destination: 'Paris', checkIn: d(5), checkOut: d(40), rooms: 1, adults: 2 }).checkOut, /30 nights/);
  assert.match(validate({ destination: 'Paris', checkIn: d(5), checkOut: d(6), rooms: 1, adults: 5 }).adults, /4 adults/);
});

test('flake rate stays pending when a selected spec is missing from any run', () => {
  const full = { tests: [{ id: 'a', status: 'passed' }, { id: 'b', status: 'passed' }] };
  const partial = { n: 3, tests: [{ id: 'a', status: 'passed' }] };
  const run = { gates: {}, stage3: { caseIds: ['a', 'b'], cases: [{ id: 'a', dataNeeds: [] }, { id: 'b', dataNeeds: [] }], playbookKeys: [], runs: [full, full, partial, full, full] } };
  const m = metrics.uc2(run);
  assert.equal(m.flakeRate, null);
  assert.deepEqual(m.missing, [{ run: 3, id: 'b' }]);
  assert.equal(m.checks.flakeRate, null);
});

test('store reserves unique run IDs and restart returns interrupted automation to ready', () => {
  const fs = require('fs'); const path = require('path');
  const { Store } = require('../src/store');
  const { Pipeline } = require('../src/pipeline');
  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(__dirname, '..', 'data', 'unit-'));
  try {
    const store = new Store(dir);
    const ids = [store.nextId(), store.nextId(), store.nextId()];
    assert.deepEqual(ids, ['RUN-1', 'RUN-2', 'RUN-3']);
    store.save({ id: 'RUN-1', status: 'automating', trail: [], stage3: { status: 'running', runs: [{}] } });
    new Pipeline({ store, baseURL: 'http://x/' });
    const r = store.get('RUN-1');
    assert.equal(r.stage3.status, 'interrupted');
    assert.equal(r.status, 'ready-for-automation');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
