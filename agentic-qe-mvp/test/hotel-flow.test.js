'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/server');
const { loadCodebaseFixture } = require('../src/connectors/codebase');
const { issueRole, statementsFromIssue, statementsFromCodebase } = require('../src/extract');
const { FLOWS } = require('../scripts/make-demo-inputs');
const { domainOf } = require('../src/agents/domains');
const { getTestingType } = require('../src/testing-types');
const { buildLeadReport } = require('../src/lead-report');
const { compareCycles } = require('../src/compare');
const { computeTraceability } = require('../src/traceability');
const { unavailableReason } = require('../sut/hotel');
const { tmpDir, HOTEL_V2_INPUTS } = require('./helpers');

const HOTEL = 'demo/hotel-booking-platform';
const HOTEL_V2 = 'demo/hotel-booking-platform-v2';
const EPICS = 'AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27';
const HOTEL_INPUTS = { initiative: { mode: 'jira', key: 'AQPI-1' }, epic: { mode: 'jira', key: EPICS }, codebase: { mode: 'sample', branch: HOTEL } };
const jira = (key) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'jira', `${key}.json`), 'utf8'));

test('AQPI issues keep their initiative, epic and story roles, and stories yield their acceptance criteria', () => {
  assert.equal(issueRole(jira('AQPI-1')), 'initiative');
  for (const k of EPICS.split(', ')) assert.equal(issueRole(jira(k)), 'epic', k);
  assert.equal(issueRole(jira('AQPI-21')), 'story');
  const st = statementsFromIssue(jira('AQPI-21'), { baseUrl: 'https://jira.example', input: 'epic' });
  assert.ok(st.length >= 4);
  assert.ok(st.every((s) => s.origin.kind === 'jira-story' && s.origin.ref === 'AQPI-21'));
  assert.ok(st.some((s) => /idempotency key/i.test(s.text)));
});

test('the hotel codebase fixture carries its Maven build, booking data dictionary and @rule statements', () => {
  const cb = loadCodebaseFixture(HOTEL);
  assert.equal(cb.build.tool, 'maven');
  assert.equal(cb.build.java, '21');
  assert.ok(cb.files.some((f) => f.path === 'TRACEABILITY.md'));
  assert.match(cb.dataModel.file, /booking-attributes\.json$/);
  assert.ok(statementsFromCodebase(cb).length >= 5);
});

test('Flow 1 loads AQPI-1, all seven epics with their 23 stories and the hotel codebase as one hotel cycle', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('hotel'), env: {} });
  const c = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS });
  assert.equal(c.sutBuild, HOTEL);
  assert.equal(domainOf(c).id, 'hotel');
  const epic = c.inputs.find((i) => i.slot === 'epic');
  assert.equal(epic.ref, EPICS);
  assert.equal(epic.children.length, 23);
  assert.match(pipeline.dictionaryOf(c).source, /booking-attributes\.json$/);
});

test('the downloaded hotel files paste into the same Jira statements and the same hotel build as the pull', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('hotel-paste'), env: {} });
  const flow = FLOWS.find((f) => f.dir === 'flow-1-hotel-booking');
  const file = (slot) => ({ mode: 'paste', text: fs.readFileSync(path.join(__dirname, '..', 'demo-inputs', flow.dir, flow.files.find((f) => f[1] === slot)[0]), 'utf8') });
  const pasted = await pipeline.startCycle({ type: 'baseline', inputs: { initiative: file('initiative'), epic: file('epic'), codebase: { ...file('codebase'), branch: HOTEL } } });
  const pulled = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS });
  assert.equal(pasted.sutBuild, HOTEL);
  const jiraCount = (c) => c.inputs.filter((i) => i.slot !== 'codebase').map((i) => i.statementCount);
  assert.deepEqual(jiraCount(pasted), jiraCount(pulled));
  assert.match(pipeline.dictionaryOf(pasted).source, /build demo\/hotel-booking-platform/);
});

test('without the built hotel jars the execution phase fails with the reason; nothing is reported as passed', async () => {
  const prev = process.env.HOTEL_PLATFORM_DIR;
  process.env.HOTEL_PLATFORM_DIR = tmpDir('no-jars');
  try {
    const { pipeline, store } = createApp({ dataDir: tmpDir('hotel-nojar'), env: {} });
    const c = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS, testingType: 'functional' });
    await pipeline.review(c.id, { reviewer: 'Priya Shah' }).done;
    const done = store.getCycle(c.id);
    assert.equal(done.status, 'failed');
    const exec = done.phases.find((p) => p.name === 'execution');
    assert.equal(exec.status, 'failed');
    assert.match(exec.error || exec.message || JSON.stringify(exec), /not built/);
    assert.ok(!done.artifacts.execution?.summary?.passed);
  } finally {
    if (prev === undefined) delete process.env.HOTEL_PLATFORM_DIR; else process.env.HOTEL_PLATFORM_DIR = prev;
  }
});

test('meta lists only the hotel booking example: release 1.0 for Flow 1 and release 2.0 (AQPI-32) for Flow 2', async () => {
  const ctx = createApp({ dataDir: tmpDir('meta'), env: {} });
  const server = ctx.app.listen(0);
  try {
    const meta = await (await fetch(`http://127.0.0.1:${server.address().port}/api/meta`)).json();
    assert.equal(meta.platform.examples.length, 1);
    const [hotel] = meta.platform.examples;
    assert.deepEqual([hotel.id, hotel.flow, hotel.modes], ['hotel', 1, ['baseline', 'incremental']]);
    assert.deepEqual(hotel.samples, { initiative: 'AQPI-1', epic: EPICS, incrementalEpic: 'AQPI-32, AQPI-23', incrementalSnapshot: 'release-2.0', baselineBranch: HOTEL, incrementalBranch: HOTEL_V2 });
    assert.deepEqual(hotel.testingTypes, ['eqe', 'functional']);
    assert.deepEqual(meta.samples, hotel.samples);
    assert.doesNotMatch(JSON.stringify(meta), /commission|COM-\d/i);
  } finally { server.close(); }
});

test('Flow 2 reads AQPI-32, the revised AQPI-23 and their stories against the release 2.0 codebase and its own data dictionary', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('hotel-v2'), env: {} });
  const c1 = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS });
  const v2 = loadCodebaseFixture(HOTEL_V2);
  assert.equal(v2.compare.baseBranch, HOTEL);
  assert.equal(domainOf(HOTEL_V2).id, 'hotel');
  assert.deepEqual(jira('AQPI-32.children').issues.map((i) => i.key).sort(), ['AQPI-33', 'AQPI-34', 'AQPI-35', 'AQPI-36']);
  assert.deepEqual(jira('release-2.0/AQPI-23.children').issues.map((i) => i.key).sort(), ['AQPI-24', 'AQPI-25', 'AQPI-26', 'AQPI-37']);
  assert.deepEqual(jira('AQPI-23.children').issues.map((i) => i.key).sort(), ['AQPI-24', 'AQPI-25', 'AQPI-26']);
  const dict = pipeline.dictionaryOf({ id: 'CYC-V2', sutBuild: HOTEL_V2 });
  assert.match(dict.source, /build demo\/hotel-booking-platform-v2/);
  assert.match(dict.dictionary.attributes.find((a) => a.name === 'stay.nights').description, /PAR allows at most 14/);
  assert.equal(c1.sutBuild, HOTEL);
});

const jarsMissing = unavailableReason(process.env, HOTEL) || unavailableReason(process.env, HOTEL_V2);
test('Flow 2: release 2.0 adds to the hotel baseline, waits for merge approval, certifies the fixed Flow 1 defect and finds two new ones', { skip: jarsMissing || false }, async () => {
  const { pipeline, store } = createApp({ dataDir: tmpDir('hotel-r2'), env: {} });
  const reviewer = 'Priya Shah';
  let c1 = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS, reviewer });
  assert.deepEqual(c1.gaps.findings.map((g) => g.story), ['AQPI-8', 'AQPI-13', 'AQPI-22']);
  await pipeline.review(c1.id, { reviewer, excluded: c1.gaps.findings.flatMap((g) => g.groupIds) }).done;
  c1 = store.getCycle(c1.id);
  assert.equal(c1.status, 'completed');
  const real = (list) => list.filter((d) => d.type !== 'gap');
  const byStory = (list) => real(list).map((d) => [d.jira.linkedTo, d.movement]).sort();
  assert.deepEqual(c1.artifacts.defects.filter((d) => d.type === 'gap').map((d) => [d.story, d.severity, d.blocksRelease]), [['AQPI-8', 'Minor', false], ['AQPI-13', 'Minor', false], ['AQPI-22', 'Minor', false]]);
  for (const d of c1.artifacts.defects.filter((x) => x.type === 'gap')) {
    assert.ok(d.epic && d.epic.key && d.acceptanceCriteria.length && d.raisedBy && d.raisedAt && d.codeChecked && d.recommendation, `${d.id} carries story, epic, criteria, reviewer, code and recommendation`);
    assert.equal(d.jira.linkedTo, d.story, `${d.id} is linked to its Jira story`);
    assert.ok(d.jira.payload.fields.labels.includes('gap'));
  }
  assert.ok(c1.reviewAgent.findings.every((f) => f.category === 'gap'), 'on the hotel inputs the reviewer only decides the code gaps');
  assert.deepEqual(byStory(c1.artifacts.defects), [['AQPI-17', 'new'], ['AQPI-21', 'new'], ['AQPI-4', 'new']]);
  const c2 = await pipeline.startCycle({ type: 'incremental', baselineId: c1.baselineId, inputs: HOTEL_V2_INPUTS, reviewer });
  assert.equal(c2.sutBuild, HOTEL_V2);
  await pipeline.review(c2.id, { reviewer }).done;
  const designed = store.getCycle(c2.id);
  assert.equal(designed.status, 'awaiting-merge');
  assert.equal(designed.artifacts.execution, undefined);
  assert.deepEqual([...new Set(designed.artifacts.testCases.map((t) => t.status))].sort(), ['carried over', 'new', 're-designed']);
  await pipeline.decideMerge(c2.id, { decision: 'approve', approver: 'Sam Lee' }).done;
  const done = store.getCycle(c2.id);
  assert.equal(done.status, 'completed');
  assert.match(done.artifacts.execution.sut.name, /release 2\.0.*demo\/hotel-booking-platform-v2/);
  const epic = done.inputs.find((i) => i.slot === 'epic');
  assert.deepEqual(epic.hierarchy.map((h) => h.key), ['AQPI-32', 'AQPI-23']);
  assert.ok(epic.hierarchy[1].children.some((c) => c.key === 'AQPI-37'));
  const epic6 = ['The confirmation of a flexible booking states free cancellation until 48 hours before check-in',
    'A cancelled booking gets one cancellation e-mail, even when cancelled twice',
    'When the cancellation e-mail cannot be sent the booking stays cancelled'];
  for (const name of epic6) assert.equal(done.artifacts.execution.results.find((r) => r.name === name)?.status, 'passed', name);
  const failed = done.artifacts.execution.results.filter((r) => r.status === 'failed');
  assert.deepEqual(failed.map((r) => r.name), []);
  for (const name of ['A 15-night stay in Paris is rejected', 'A key shorter than 8 characters is refused',
    'A price change within 1% does not need acknowledgement', 'Operations can retry a failed confirmation e-mail 3 times; retry 4 is refused']) {
    assert.equal(done.artifacts.execution.results.find((r) => r.name === name)?.status, 'passed', name);
  }
  assert.deepEqual(real(done.artifacts.defects), []);
  const flow1 = new Map(real(c1.artifacts.defects).map((d) => [d.jira.linkedTo, d]));
  const fixed = real(done.artifacts.resolvedDefects);
  assert.deepEqual(fixed.map((d) => d.jira.linkedTo).sort(), ['AQPI-17', 'AQPI-21', 'AQPI-4']);
  for (const d of fixed) {
    assert.deepEqual([d.id, d.status, d.movement, d.retest.result, d.resolvedInCycle], [flow1.get(d.jira.linkedTo).id, 'Closed', 'fixed and retested', 'passed', done.id]);
    assert.equal(done.artifacts.execution.results.find((r) => r.key === d.testCaseKey)?.status, 'passed');
    assert.match(d.certification, /certified closed/);
  }
  assert.deepEqual(done.artifacts.resolvedDefects.filter((d) => d.type === 'gap').map((d) => [d.story, d.status, d.movement]), [['AQPI-8', 'Closed', 'fixed and retested'], ['AQPI-13', 'Closed', 'fixed and retested'], ['AQPI-22', 'Closed', 'fixed and retested']]);
  const byKey = new Map(computeTraceability(done).stories.map((x) => [x.key, x]));
  for (const k of ['AQPI-4', 'AQPI-17', 'AQPI-21']) assert.deepEqual([byKey.get(k).scope, byKey.get(k).status], ['baseline', 'verified'], k);
  assert.deepEqual([byKey.get('AQPI-34').scope, byKey.get('AQPI-34').status], ['this cycle', 'verified']);
  const cmp = compareCycles(c1, done);
  assert.doesNotMatch(JSON.stringify(cmp), /commission/i);
  assert.deepEqual([cmp.defects.new.length, cmp.defects.stillOpen.length], [0, 0]);
  assert.deepEqual([...cmp.defects.resolved].sort(), [...c1.artifacts.defects.map((d) => d.id)].sort());
  assert.equal(buildLeadReport(done).recommendation.decision, 'Go');
  assert.equal(buildLeadReport(c1).recommendation.decision, 'No-go');
});

test('hotel cycles describe the hotel journeys and capability, commission cycles keep their wording', () => {
  const eqe = getTestingType('eqe', domainOf(HOTEL).id);
  assert.match(eqe.focus, /business flows.*search.*confirmation/);
  assert.doesNotMatch(`${eqe.focus} ${eqe.baseline} ${Object.values(eqe.agents).join(' ')}`, /advisor|statement|screenshot of each/);
  assert.match(getTestingType('eqe').focus, /Enterprise end-to-end business flows/);
  assert.match(domainOf(HOTEL).capability, /hotel booking/i);
  assert.match(domainOf('demo/commission-engine').capability, /commission/);
});
