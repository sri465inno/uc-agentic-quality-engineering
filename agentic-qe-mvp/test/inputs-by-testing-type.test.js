'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { loadApiFixture } = require('../src/connectors/api');
const { tmpDir, HOTEL_EPICS } = require('./helpers');

const JIRA = { initiative: { mode: 'jira', key: 'AQPI-1' }, epic: { mode: 'jira', key: HOTEL_EPICS } };
const TECH = { codebase: { mode: 'sample', branch: 'demo/hotel-booking-platform' }, api: { mode: 'sample', branch: 'demo/hotel-api-contract' } };

test('the API endpoints input has one OpenAPI document per hotel service, its data dictionary and provenance', () => {
  const v1 = loadApiFixture('demo/hotel-api-contract');
  const v2 = loadApiFixture('demo/hotel-api-contract-v2');
  assert.deepEqual(v1.services.map((s) => s.name || s).sort(), ['cart-service', 'hotel-service', 'notification-service', 'offer-service', 'reservation-service', 'search-service']);
  assert.equal(v1.endpoints.length, 47);
  assert.equal(v1.endpoints.filter((e) => !e.internal).length, 38);
  assert.equal(v2.endpoints.length, 52);
  assert.equal(v1.build, 'demo/hotel-booking-platform');
  assert.equal(v2.build, 'demo/hotel-booking-platform-v2');
  assert.equal(v1.dictionary.name, 'Hotel booking attributes');
  assert.match(v1.provenance.ref, /demo\/hotel-api-contract/);
});

test('EQE reads only the Jira inputs: no codebase, no API endpoints and no Jira-vs-code gap check', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('eqe-inputs'), env: {} });
  const c = await pipeline.startCycle({ type: 'baseline', inputs: { ...JIRA, ...TECH }, reviewer: 'QE', testingType: 'eqe' });
  assert.deepEqual(c.inputs.map((i) => i.slot), ['initiative', 'epic']);
  assert.equal(c.gaps.applicable, false);
  assert.deepEqual(c.gaps.findings, []);
  assert.equal(c.sutBuild, 'demo/hotel-booking-platform');
  assert.equal(c.dataDictionary, null);
  assert.ok(c.normalisation.statements.every((s) => s.source === 'jira'));
});

test('EQE takes the build under test from the Jira project, and ignores a codebase or API endpoints given alone', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('eqe-build'), env: {} });
  const c = await pipeline.startCycle({ type: 'baseline', inputs: JIRA, reviewer: 'QE', testingType: 'eqe' });
  assert.equal(c.sutBuild, 'demo/hotel-booking-platform');
  await assert.rejects(pipeline.startCycle({ type: 'baseline', inputs: TECH, reviewer: 'QE', testingType: 'eqe' }), /at least one input/);
});

test('DQE reads Jira, the codebase and the API endpoints, and keeps the Jira-vs-code gaps', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('dqe-inputs'), env: {} });
  const c = await pipeline.startCycle({ type: 'baseline', inputs: { ...JIRA, ...TECH }, reviewer: 'QE', testingType: 'functional' });
  assert.deepEqual(c.inputs.map((i) => i.slot), ['initiative', 'epic', 'codebase', 'api']);
  assert.equal(c.gaps.applicable, true);
  assert.deepEqual(c.gaps.findings.map((g) => g.story), ['AQPI-8', 'AQPI-13', 'AQPI-22']);
  assert.equal(c.dataDictionary.input, 'API endpoints');
  assert.equal(pipeline.contractOf(c).length, 47);
});
