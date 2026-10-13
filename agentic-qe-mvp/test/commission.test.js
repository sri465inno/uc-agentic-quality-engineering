'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadCodebaseFixture, BRANCHES } = require('../src/connectors/codebase');
const { loadJiraIssue, EXPORT } = require('../src/connectors/jira');
const { loadInputs } = require('../src/inputs');
const { computeAttributeCoverage } = require('../src/coverage');
const { PLATFORM_AGENTS, INPUT_TYPES } = require('../src/platform');
const { PHASES } = require('../src/pipeline');
const { createSutApp, BUILDS } = require('../sut/server');

const ENGINE = path.join(__dirname, '..', 'samples', 'commission-engine');

test('the reservation model has exactly 1000 attributes in every build, and the SUT serves it', async () => {
  for (const dir of Object.values(BUILDS)) {
    const dict = JSON.parse(fs.readFileSync(path.join(ENGINE, dir, 'data-dictionary', 'reservation-attributes.json'), 'utf8'));
    assert.equal(dict.attributes.length, 1000, dir);
    assert.equal(new Set(dict.attributes.map((a) => a.name)).size, 1000, `${dir}: attribute names unique`);
    assert.equal(dict.attributes.filter((a) => a.commissionDriver).length, 11);
  }
  const server = createSutApp({ version: 'demo/commission-engine' }).listen(0);
  try {
    const dict = await (await fetch(`http://127.0.0.1:${server.address().port}/api/data-dictionary`)).json();
    assert.equal(dict.attributes.length, 1000);
  } finally { server.close(); }
});

test('recorded codebase snapshots mirror the GitHub branches and carry the data model summary', () => {
  assert.deepEqual(Object.keys(BRANCHES), ['demo/commission-engine', 'demo/commission-engine-v2', 'demo/hotel-booking-platform', 'demo/hotel-booking-platform-v2']);
  const base = loadCodebaseFixture('demo/commission-engine');
  const v2 = loadCodebaseFixture('demo/commission-engine-v2');
  assert.equal(base.provenance.kind, 'fixture');
  assert.match(base.provenance.label, /no live GitHub call was made/);
  assert.equal(base.dataModel.attributeCount, 1000);
  assert.ok(base.dataModel.drivers.some((d) => d.name === 'stay.nights'));
  assert.equal(v2.compare.baseBranch, 'demo/commission-engine');
  assert.equal(v2.compare.base, base.commit);
  assert.ok(v2.compare.files.some((f) => f.filename === 'src/rules.js' && f.status === 'modified'));
  assert.throws(() => loadCodebaseFixture('main'), /Unknown/i);
});

test('Jira export mode pulls the synthetic REST v3 export from GitHub and never claims a Jira call', async () => {
  const fixture = require('../fixtures/jira/COM-10.json');
  const children = require('../fixtures/jira/COM-10.children.json');
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => (url.includes('children') ? children : fixture) }; };
  const issue = await loadJiraIssue('COM-10', { source: 'github', env: { JIRA_BASE_URL: 'https://x.atlassian.net', JIRA_EMAIL: 'a', JIRA_API_TOKEN: 't' }, fetchImpl });
  assert.equal(issue.provenance.kind, 'github');
  assert.match(issue.provenance.label, /synthetic test issues; no live Jira call was made/);
  assert.ok(calls.length >= 1 && calls.every((u) => u.startsWith(EXPORT.rawBase)), 'only GitHub raw URLs were fetched, not Jira');
  assert.ok(!calls.some((u) => u.includes('atlassian.net')));
});

test('the MVP accepts Jira, codebase and API endpoints inputs; the platform lists more', async () => {
  assert.deepEqual(INPUT_TYPES.filter((t) => t.mvp === 'implemented').map((t) => t.id), ['jira-initiative', 'jira-epic', 'codebase', 'api-contract']);
  assert.ok(INPUT_TYPES.filter((t) => t.mvp === 'platform only').length >= 5);
  const loaded = await loadInputs({ initiative: { mode: 'jira', key: 'COM-1' }, epic: { mode: 'jira', key: 'COM-10' }, codebase: { mode: 'sample', branch: 'demo/commission-engine' }, confluence: { mode: 'paste', text: 'x' } },
    ['initiative', 'epic', 'codebase'], { env: {} });
  assert.deepEqual(loaded.map((i) => i.slot), ['initiative', 'epic', 'codebase']);
  assert.deepEqual(loaded[1].children, ['COM-11']);
});

test('the seven platform agents are exactly the design phases the pipeline runs, in order', () => {
  assert.equal(PLATFORM_AGENTS.length, 7);
  for (const type of ['baseline', 'incremental']) {
    assert.deepEqual(PHASES[type].filter((p) => PLATFORM_AGENTS.some((g) => g.id === p)), PLATFORM_AGENTS.map((g) => g.id), type);
    assert.ok(!PHASES[type].includes('rules'), `${type}: business rules belong to the requirements agent`);
  }
});

test('attribute coverage reports which commission drivers are varied by cases and their real result', () => {
  const dataModel = { name: 'Reservation', file: 'f', attributeCount: 1000, drivers: [{ name: 'stay.nights', description: 'n' }, { name: 'room.roomCount', description: 'r' }, { name: 'advisor.iataNumber', description: 'i' }] };
  const cases = [{ key: 'T1', varies: ['stay.nights'] }, { key: 'T2', varies: ['stay.nights', 'room.roomCount'] }, { key: 'T3', varies: [] }];
  const cov = computeAttributeCoverage(dataModel, cases, [{ key: 'T1', status: 'failed' }, { key: 'T2', status: 'passed' }]);
  assert.equal(cov.attributeCount, 1000);
  assert.equal(cov.exercised, 2);
  assert.equal(cov.percent, 66.7);
  assert.deepEqual(cov.rows.map((r) => [r.attribute, r.cases.join(), r.status]), [
    ['stay.nights', 'T1,T2', 'exercised - failing'], ['room.roomCount', 'T2', 'exercised - passing'], ['advisor.iataNumber', '', 'not exercised']]);
  assert.equal(computeAttributeCoverage(dataModel, cases, []).rows[0].status, 'designed, not executed');
  assert.equal(computeAttributeCoverage(null, cases, []), null);
});
