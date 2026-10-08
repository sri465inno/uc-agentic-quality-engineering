'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/server');
const learning = require('../src/learning');
const { extractContract, checkEndpoints } = require('../src/contracts');
const { AiSession, aiStatus } = require('../src/ai');
const { BASELINE_INPUTS, baselineCycle, tmpDir } = require('./helpers');

const ENV = { ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'mock-model' };
const lastJson = (prompt) => JSON.parse(prompt.trim().split('\n').reverse().find((l) => /^[[{]/.test(l.trim())));
const reply = (model) => async (url, opts) => {
  const body = JSON.parse(opts.body);
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(model(body.messages[0].content)) }] }) };
};
/** Stand-in model: one draft spec that compiles, two extra scenarios per requirement. */
const model = (prompt) => {
  if (/Write the body of one Playwright test/.test(prompt)) return { body: 'const r = await request.get(`${testInfo.project.use.baseURL || ""}/health`);\nexpect(r.status()).toBeLessThan(600);', assumptions: 'health' };
  if (/additional test scenarios/.test(prompt)) return { cases: lastJson(prompt).map((r) => ({ requirementId: r.id, scenario: 'negative', name: `Reject malformed input for ${r.id}`, objective: 'refused', steps: ['Send malformed input'], expected: 'Refused' })) };
  return {};
};
const startAndReview = async (pipeline, store, reviewer = 'Priya Shah') => {
  const c = await pipeline.startCycle({ type: 'baseline', inputs: BASELINE_INPUTS, reviewer });
  const pre = c.learned.review;
  await pipeline.review(c.id, { reviewer, resolutions: Object.fromEntries(pre.resolutions.map((x) => [x.groupId, x.optionId])), excluded: pre.exclusions.map((x) => x.groupId) }).done;
  return { started: c, done: store.getCycle(c.id) };
};

test('the API contract comes from the controllers; specs calling anything else are refused', () => {
  const contract = extractContract(path.join(__dirname, '..', 'fixtures', 'github', 'hotel-booking-platform', 'contents'));
  assert.ok(contract.some((e) => e.service === 'cart-service' && e.method === 'POST' && e.path === '/api/carts'));
  assert.equal(checkEndpoints("const s = await call(request, testInfo, 'reservation-service', 'GET', `/api/checkout/${id}/payment-summary`); expect(s.status).toBe(200);", contract), null);
  assert.match(checkEndpoints("await call(request, testInfo, 'cart-service', 'DELETE', '/api/carts/x/teleport'); expect(1).toBe(1);", contract), /not in the API contract: DELETE cart-service\/api\/carts\/x\/teleport/);
});

test('the platform learns across cycles: reviewer decisions pre-fill, defect history raises priority, "not a defect" needs confirmation', async () => {
  const dataDir = tmpDir('learning');
  const { pipeline, store } = createApp({ dataDir, env: {} });
  const c1 = await baselineCycle(pipeline, store);
  const mem = store.getLearning();
  assert.equal(mem.decisions.length, 1, 'the conflict decision is remembered');
  assert.equal(mem.decisions[0].chosenSignature, '1.5 %');
  assert.ok(fs.existsSync(path.join(dataDir, 'learning.json')));
  const defects = c1.artifacts.defects;
  assert.ok(defects.length >= 1, 'the baseline raises a real defect');
  assert.ok(mem.defects.length >= defects.length);

  const { started, done: c2 } = await startAndReview(pipeline, store);
  assert.equal(started.learned.review.resolutions.length, 1);
  assert.match(started.learned.review.resolutions[0].lesson, new RegExp(`decided in ${c1.id} by Priya Shah: 1.5 %`));
  assert.equal(c2.learned.review.kept, 1);
  const risky = c2.artifacts.testCases.filter((t) => t.risk === 'defect-history');
  assert.ok(risky.length > 0 && risky.every((t) => t.priority === 'High' && t.learned.length));
  const riskReqs = new Set(risky.map((t) => t.requirementId));
  assert.ok(c2.artifacts.requirements.filter((r) => r.text === defects[0].requirementText).every((r) => riskReqs.has(r.id)));
  assert.ok(c2.learned.design.some((l) => l.kind === 'risk'));
  const d2 = c2.artifacts.defects[0];
  assert.ok(d2 && !d2.confirmation, 'a defect from a rule-based test needs no confirmation');

  assert.throws(() => pipeline.feedback(c2.id, { target: 'defect', id: d2.id, verdict: 'nope', by: 'Sam' }), /verdict/);
  assert.throws(() => pipeline.feedback(c2.id, { target: 'defect', id: d2.id, verdict: 'not-a-defect' }), /name is required/);
  const fb = pipeline.feedback(c2.id, { target: 'defect', id: d2.id, verdict: 'not-a-defect', note: 'test expects the old rate', by: 'Sam Lee' });
  assert.equal(fb.learning.counts.notADefect, 1);
  assert.equal(store.getCycle(c2.id).artifacts.defects[0].blocksRelease, false);

  const { done: c3 } = await startAndReview(pipeline, store);
  const name2 = c2.artifacts.testCases.find((t) => t.key === d2.testCaseKey).name;
  const again = c3.artifacts.defects.find((d) => c3.artifacts.testCases.find((t) => t.key === d.testCaseKey).name === name2);
  assert.ok(again, 'the same test fails again in the next cycle');
  assert.equal(again.confirmation.status, 'needed');
  assert.equal(again.blocksRelease, false);
  assert.equal(again.jira.status, 'not raised');
  assert.ok(c3.learned.defects.some((d) => d.id === again.id));

  pipeline.feedback(c3.id, { target: 'defect', id: again.id, verdict: 'confirm', by: 'Sam Lee' });
  const confirmed = store.getCycle(c3.id).artifacts.defects.find((d) => d.id === again.id);
  assert.equal(confirmed.confirmation.status, 'confirmed');
  assert.equal(confirmed.blocksRelease, confirmed.confirmation.blocksReleaseIfConfirmed);

  store.reset();
  assert.equal(store.getLearning().feedback.length, 0, 'reset clears the learning memory');
});

test('with AI on: rejected suggestions are not repeated, an accepted AI script runs in the next cycle and its failures need confirmation', async () => {
  const { pipeline, store } = createApp({ dataDir: tmpDir('learning-ai'), env: ENV, fetchImpl: reply(model) });
  const c1 = await baselineCycle(pipeline, store);
  const aiCase = c1.artifacts.testCases.find((t) => t.origin === 'ai');
  const draft = c1.artifacts.aiScripts[0];
  assert.ok(aiCase && draft && draft.body);
  pipeline.feedback(c1.id, { target: 'testcase', id: aiCase.key, verdict: 'reject', note: 'not useful', by: 'Priya Shah' });
  pipeline.feedback(c1.id, { target: 'script', id: draft.file, verdict: 'accept', by: 'Priya Shah' });
  assert.match(store.getCycle(c1.id).artifacts.aiScripts[0].status, /runs from the next cycle/);
  assert.match(learning.guidance(store.getLearning()), /do not repeat them: testcase "Reject malformed input/);

  const { done: c2 } = await startAndReview(pipeline, store);
  const reqText = c1.artifacts.requirements.find((r) => r.id === aiCase.requirementId).text;
  const req2 = c2.artifacts.requirements.find((r) => r.text === reqText);
  assert.ok(!c2.artifacts.testCases.some((t) => t.requirementId === req2.id && t.name === aiCase.name), 'the rejected suggestion is not offered again');
  assert.ok(c2.learned.suppressed.some((s) => s.requirementId === req2.id));

  const caseName = c1.artifacts.testCases.find((t) => t.key === draft.caseKey).name;
  const promoted = c2.artifacts.testCases.find((t) => t.name === caseName && t.scriptOrigin === 'ai');
  assert.ok(promoted && promoted.automation === 'Automated');
  const spec = c2.artifacts.scripts.find((s) => s.file === promoted.scriptFile);
  assert.equal(spec.origin, 'ai');
  assert.match(spec.code, /accepted by Priya Shah/);
  const result = c2.artifacts.execution.results.find((r) => r.key === promoted.key);
  assert.ok(['passed', 'failed'].includes(result.status), 'the accepted AI script really ran');
  const d = c2.artifacts.defects.find((x) => x.testCaseKey === promoted.key);
  if (d) assert.equal(d.confirmation.status, 'needed');
  assert.ok(c2.learned.design.some((l) => l.kind === 'script'));
});

test('a cassette records model replies by prompt hash and replays them without a model key', async () => {
  const cassette = path.join(tmpDir('cassette'), 'replies.json');
  const live = new AiSession({ env: { ...ENV, AI_CASSETTE: cassette }, fetchImpl: reply(() => ({ answer: 42 })) });
  assert.deepEqual(await live.json('requirements', 'probe', { prompt: 'hello' }), { answer: 42 });
  assert.equal(JSON.parse(fs.readFileSync(cassette, 'utf8')).model, 'mock-model');
  assert.equal(aiStatus({ AI_CASSETTE: cassette }).provider, 'cassette');
  const replay = new AiSession({ env: { AI_CASSETTE: cassette }, fetchImpl: () => { throw new Error('no network'); } });
  assert.deepEqual(await replay.json('requirements', 'probe', { prompt: 'hello' }), { answer: 42 });
  assert.equal(replay.state.calls[0].replayed, true);
  assert.equal(await replay.json('requirements', 'probe', { prompt: 'other' }), null);
  assert.match(replay.state.calls[1].error, /no recorded reply/);
  assert.ok(!fs.readFileSync(cassette, 'utf8').includes('sk-test'), 'the key is never recorded');
});

test('feedback and learning over HTTP: invalid feedback is a 400, accepted feedback shows on the Learning page', async () => {
  const ctx = createApp({ dataDir: tmpDir('learning-http'), env: {} });
  const c = await baselineCycle(ctx.pipeline, ctx.store);
  const server = ctx.app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (body) => fetch(`${base}/api/cycles/${c.id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ target: 'nothing', id: 'x', verdict: 'accept', by: 'Sam' })).status, 400);
    assert.equal((await post({ target: 'defect', id: 'DEF-NOPE', verdict: 'confirm', by: 'Sam' })).status, 400);
    const ok = await post({ target: 'defect', id: c.artifacts.defects[0].id, verdict: 'confirm', by: 'Sam Lee' });
    assert.equal(ok.status, 200);
    const L = await (await fetch(`${base}/api/learning`)).json();
    assert.equal(L.counts.confirmed, 1);
    assert.equal(L.decisions.length, 1);
    assert.equal((await fetch(`${base}/api/cycles/NOPE/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  } finally { server.close(); }
});
