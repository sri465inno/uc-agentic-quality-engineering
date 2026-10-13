'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { unavailableReason } = require('../sut/hotel');
const { tmpDir, BASELINE_INPUTS } = require('./helpers');

async function withServer(fn) {
  const ctx = createApp({ dataDir: tmpDir('lab'), env: {} });
  const server = ctx.app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (p, body) => { const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  try { await fn({ ...ctx, base, post }); } finally { server.close(); }
}

const V2 = 'demo/hotel-booking-platform-v2';

test('Test Lab: a plain-English hotel test becomes the full booking, the expected result comes from the release rules', async () => {
  await withServer(async ({ base, post }) => {
    const lab = await (await fetch(`${base}/api/lab`)).json();
    assert.deepEqual(lab.demos.map((d) => d.id), ['happy', 'defect']);
    assert.doesNotMatch(JSON.stringify(lab), /commission|engine/i);
    const defect = lab.demos.find((d) => d.id === 'defect');
    const { status, body } = await post('/api/lab/data', { text: defect.text });
    assert.equal(status, 200);
    assert.equal(body.attributeCount, 21);
    assert.equal(body.drivers.find((d) => d.name === 'search.destination').value, 'PAR');
    assert.equal(body.drivers.find((d) => d.name === 'stay.nights').value, 15);
    assert.equal(body.testCase.build, V2);
    assert.equal(body.testCase.expected.status, 400);
    assert.equal(body.byRules.release, '2.0');
    assert.match(body.byRules.rule, /Paris \(PAR\) allows at most 14 nights/);
    assert.equal(body.reading.find((x) => x.field === 'nights').from, 'your test');
    assert.equal(body.reading.find((x) => x.field === 'build').from, 'latest (release 2.0)');
    for (const text of lab.examples) assert.equal((await post('/api/lab/data', { text })).status, 200, text);
    assert.equal((await post('/api/lab/data', { text: 'A fifteen-night stay in Paris.' })).body.testCase.given['stay.nights'], 15);
    const r1 = (await post('/api/lab/data', { text: 'A 21-night stay in Paris on release 1.0.' })).body;
    assert.equal(r1.testCase.build, 'demo/hotel-booking-platform');
    assert.equal(r1.testCase.expected.status, 200);
    const late = (await post('/api/lab/data', { text: 'A flexible booking cancelled 1 day before check-in.' })).body;
    assert.equal(late.testCase.expected.code, 'FREE_CANCELLATION_CLOSED');
    assert.equal((await post('/api/lab/data', { text: 'The 6th confirmation resend.' })).body.testCase.expected.status, 429);
  });
});

test('Test Lab: sentences that cannot become a hotel test get plain-language reasons', async () => {
  await withServer(async ({ post }) => {
    const says = async (text, re) => {
      const r = await post('/api/lab/data', { text });
      assert.equal(r.status, 400, text);
      assert.ok(r.body.details.some((d) => re.test(d.message)), `${text}: ${JSON.stringify(r.body)}`);
      return r.body;
    };
    await says('', /Describe the booking/);
    await says('hello world', /Describe the booking the test is about/);
    const b = await says('A 15-night stay in Paris should be accepted.', /by the release 2.0 rules Paris \(PAR\) allows at most 14 nights, so a 15-night stay in Paris is rejected/);
    assert.equal(b.error, 'Your expected result does not match the specs');
    await says('A stay in Paris for a few nights.', /can't tell how many nights/);
    await says('A 0-night stay in Paris.', /at least 1 night/);
    await says('A stay of -3 nights in Paris.', /cannot be negative/);
    await says('A 15-night stay in Rome.', /only has New York, London and Paris/);
    await says('A 5-night stay in Paris and London.', /more than one destination/);
    await says('Cancel a booking on release 1.0.', /free cancellation is new in release 2.0/);
    await says('A flexible booking cancelled 30 hours before check-in.', /multiples of 24 hours/);
    await says('A new cart should expire after 30 minutes.', /by the release 2.0 rules a cart expires 20 minutes/);
  });
});

test('Test Lab: happy path and the Paris stay limit both pass on release 2.0 (the limit is fixed there)', { skip: unavailableReason(process.env, V2) || false }, async () => {
  await withServer(async ({ base, post }) => {
    const { demos } = await (await fetch(`${base}/api/lab`)).json();
    const happy = await post('/api/lab/run', { text: demos[0].text });
    assert.equal(happy.status, 200);
    assert.equal(happy.body.status, 'passed');
    assert.equal(happy.body.actual, 'HTTP 200 with search results');
    assert.equal(happy.body.defect, null);
    assert.match(happy.body.execution.tool, /^Playwright/);
    assert.match(happy.body.execution.sut.name, /release 2\.0/);
    const defect = await post('/api/lab/run', { text: demos[1].text });
    assert.equal(defect.body.status, 'passed');
    assert.equal(defect.body.expected, 'HTTP 400 VALIDATION_FAILED (stay.tooLong)');
    assert.equal(defect.body.defect, null);
    assert.match(defect.body.script.code, /expect\(s\.status\)\.toBe\(400\)/);
  });
});

test('approvals say what is missing: reviewer, each open conflict, and review before merge', async () => {
  await withServer(async ({ post }) => {
    const c = (await post('/api/cycles', { type: 'baseline', inputs: BASELINE_INPUTS })).body;
    const r = await post(`/api/cycles/${c.id}/review`, {});
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Unresolved conflicts/);
    assert.ok(r.body.details.some((d) => d.field === 'reviewer'));
    const conflict = c.normalisation.groups.find((g) => g.bucket === 'conflict');
    assert.ok(r.body.details.some((d) => d.group === conflict.id && d.message.includes('jira says 2 %') && d.message.includes('code says 1.5 %')));
    const m = await post(`/api/cycles/${c.id}/merge`, { decision: 'approve', approver: 'Sam' });
    assert.equal(m.status, 409);
    assert.match(m.body.error, /Approve the requirement set first/);
    assert.deepEqual(m.body.details, [{ gate: 'review' }]);
  });
});
