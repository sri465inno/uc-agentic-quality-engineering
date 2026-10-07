'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { createApp } = require('../src/server');
const { aiConfig, aiStatus, AiSession, parseJson, onlyKnownNumbers } = require('../src/ai');
const { aiMatchStatements, aiPersonas, checkDraft } = require('../src/agents/ai');
const { testDataAgent, dataSetFile } = require('../src/agents/testdata');
const { applyReview } = require('../src/normalise');
const { reportWorkbook } = require('../src/excel');
const { BASELINE_INPUTS, HOTEL_INPUTS, baselineCycle, tmpDir } = require('./helpers');

const KEY = 'sk-test-secret-key';
const ENV = { ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: 'mock-model' };
const lastJson = (prompt) => JSON.parse(prompt.trim().split('\n').reverse().find((l) => /^[[{]/.test(l.trim())));

/** A stand-in model: answers each agent's prompt with plausible JSON, plus a few suggestions code must reject. */
function mockModel() {
  let drafts = 0;
  return ({ system, prompt }) => {
    if (/pair a Jira statement with a code statement/.test(prompt)) {
      const matches = [];
      for (const s of lastJson(prompt)) {
        const j = s.jira.find((g) => /expiration/i.test(g.text));
        const c = s.code.find((g) => /expires/i.test(g.text));
        if (j && c) matches.push({ story: s.story, jira: j.id, code: c.id, confidence: 0.9, reason: 'Both describe when the cart expires.' });
      }
      matches.push({ story: 'NOPE-1', jira: 'G0', code: 'G0', confidence: 0.99, reason: 'invented ids' });
      return { matches };
    }
    if (/Flag at most/.test(prompt)) {
      const [g] = lastJson(prompt);
      return { findings: [{ groupId: g.id, issue: 'ambiguous', severity: 'medium', title: 'Unclear outcome', suggestion: 'Ask for the exact expected result.' }, { groupId: g.id, issue: 'made-up', title: 'x' }] };
    }
    if (/short title \(max 8 words\)/.test(prompt)) {
      return { items: lastJson(prompt).map((r, i) => ({ id: r.id, title: `Rule ${r.id}`, summary: i === 0 ? 'Applies a limit of 999 units.' : r.statement, acceptance: [`Given a booking, when it is checked, then ${r.statement}`] })) };
    }
    if (/additional test scenarios/.test(prompt)) {
      return { cases: lastJson(prompt).map((r) => ({ requirementId: r.id, scenario: 'negative', name: `Reject malformed input for ${r.id}`, objective: 'Malformed input is refused', steps: ['Send a malformed request'], expected: 'The request is refused' })) };
    }
    if (/fictitious personas/.test(prompt)) {
      return { personas: [{ 'guest.firstName': 'Amara', 'guest.lastName': 'Okafor', 'guest.phone': '+44 20 7946 0958' }, { 'guest.firstName': 'R2D2', 'guest.lastName': 'Silva', 'guest.phone': 'call me' }] };
    }
    if (/Write the body of one Playwright test/.test(prompt)) {
      drafts += 1;
      return drafts === 1 ? { body: 'const r = await request.get(`${BASE}/health`);\nexpect(r.status()).toBe(200);', assumptions: 'health endpoint' } : { body: "require('fs').readFileSync('/etc/passwd');" };
    }
    if (/Classify each failure/.test(prompt)) {
      return { items: lastJson(prompt).map((r) => ({ key: r.key, category: 'product defect', confidence: 0.8, rationale: 'The service returns a different value than the requirement states.' })) };
    }
    if (/For each defect write/.test(prompt)) {
      return { items: lastJson(prompt).map((d) => ({ id: d.id, summary: `Expected ${d.expected} but got ${d.actual}.`, stepsToReproduce: ['Run the failing case', `Compare with ${d.expected}`], likelyCause: 'Rule not applied', businessImpact: 'Wrong amount' })) };
    }
    if (/QE lead writing the cycle summary/.test(system)) {
      const f = lastJson(prompt);
      return { narrative: `The cycle ran ${f.executed} automated cases and ${f.failed} failed.`, risks: ['An open defect affects a business rule.'], recommendation: 'Fix the open defect before release.' };
    }
    return {};
  };
}

function anthropicFetch(model, log = []) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    log.push({ url, headers: opts.headers, body });
    const reply = model({ system: body.system, prompt: body.messages[0].content });
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(reply)}\n\`\`\`` }] }) };
  };
}

test('model configuration: rule-based without a key, Anthropic or OpenAI-compatible with one, never exposes the key', () => {
  assert.equal(aiConfig({}), null);
  assert.equal(aiStatus({}).mode, 'rule-based');
  assert.equal(aiConfig({ ...ENV, AI_DISABLED: '1' }), null);
  const a = aiStatus(ENV);
  assert.deepEqual([a.mode, a.provider, a.model], ['ai', 'anthropic', 'mock-model']);
  assert.ok(!JSON.stringify(a).includes(KEY));
  const o = aiConfig({ OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'http://llm.local/v1/' });
  assert.deepEqual([o.provider, o.model, o.baseUrl], ['openai', 'gpt-4o', 'http://llm.local/v1']);
});

test('replies are parsed as JSON inside fences or prose; anything else is unusable', () => {
  assert.deepEqual(parseJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJson('no json here'));
  assert.equal(onlyKnownNumbers('limit 30 minutes', ['A cart expires after 30 minutes']), true);
  assert.equal(onlyKnownNumbers('limit 20 minutes', ['A cart expires after 30 minutes']), false);
});

test('AiSession logs every call, caches repeats, and returns null on HTTP errors, invalid JSON and timeouts', async () => {
  let n = 0;
  const ok = new AiSession({ env: ENV, fetchImpl: anthropicFetch(() => { n += 1; return { x: 1 }; }) });
  assert.deepEqual(await ok.json('requirements', 'p', { prompt: 'q' }), { x: 1 });
  assert.deepEqual(await ok.json('requirements', 'p', { prompt: 'q' }), { x: 1 });
  assert.equal(n, 1, 'second identical prompt is served from the cache');
  assert.deepEqual(ok.state.calls.map((c) => [c.ok, !!c.cached]), [[true, false], [true, true]]);
  ok.outcome('requirements', { accepted: 2, rejected: 1, note: 'n' });
  assert.equal(ok.state.calls[1].accepted, 2);
  assert.ok(!JSON.stringify(ok.state).includes(KEY));

  const http = new AiSession({ env: ENV, fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(await http.json('report', 'p', { prompt: 'q' }), null);
  assert.match(http.state.calls[0].error, /HTTP 500/);

  const junk = new AiSession({ env: ENV, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ text: 'not json' }] }) }) });
  assert.equal(await junk.json('report', 'p', { prompt: 'q' }), null);

  const slow = new AiSession({ env: { ...ENV, AI_TIMEOUT_MS: '30' }, fetchImpl: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timed out')))) });
  assert.equal(await slow.json('report', 'p', { prompt: 'q' }), null);
  assert.equal(slow.state.calls[0].ok, false);

  const off = new AiSession({ env: {}, fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal(off.enabled, false);
  assert.equal(await off.json('report', 'p', { prompt: 'q' }), null);
});

test('AI pairs AQPI-15 cart expiry by meaning; code keeps the value, the reviewer can still exclude it', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('ai-hotel'), env: ENV, fetchImpl: anthropicFetch(mockModel()) });
  const c = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS });
  const g = c.normalisation.groups.find((x) => x.ai && x.ai.story === 'AQPI-15');
  assert.ok(g, 'AQPI-15 Jira and code statements are matched');
  assert.equal(g.bucket, 'agreed');
  assert.deepEqual(g.sources, ['code', 'jira']);
  assert.match(g.options[0].signature, /30/);
  assert.equal(g.ai.valuesFrom, 'code (Jira states no value)');
  assert.ok(c.normalisation.counts.aiMatched >= 1);
  assert.ok(!c.normalisation.groups.some((x) => x.id === g.ai.merged[1]), 'the code-only group is folded in');
  const norm = c.ai.calls.find((x) => x.agent === 'normalise');
  assert.ok(norm.rejected >= 1, 'the invented pair is rejected');
  const ra = c.reviewAgent;
  assert.ok(ra.findings.some((f) => f.category === 'ai' && f.groupId === g.id && /by meaning/.test(f.title)));
  assert.ok(ra.findings.some((f) => f.category === 'ai' && f.issue === 'ambiguous'));
  assert.equal(ra.findings.filter((f) => f.issue === 'made-up').length, 0);
  assert.equal(ra.counts.ai, ra.findings.filter((f) => f.category === 'ai').length);
  assert.equal(c.status, 'awaiting-review', 'AI never approves');
  const kept = applyReview(c.normalisation, { excluded: [g.id], resolutions: {} });
  assert.ok(!kept.some((r) => r.groupId === g.id), 'a human exclusion removes the AI match');
});

test('an AI match whose values differ stays a conflict; low confidence is rejected', async () => {
  const st = (id, source, text) => ({ id, source, text, origin: source === 'jira' ? { ref: 'XY-1' } : { story: 'XY-1' } });
  const opt = (s, sig) => ({ optionId: 'O1', signature: sig, values: [], text: s.text, sources: [s.source], members: [s.id] });
  const a = st('S1', 'jira', 'Hold the cart for 20 minutes');
  const b = st('S2', 'code', 'Cart TTL is 30 minutes');
  const d = st('S3', 'code', 'Unrelated rule');
  const n = { statements: [a, b, d], groups: [
    { id: 'G1', bucket: 'jira-only', subject: 'hold cart', text: a.text, sources: ['jira'], options: [opt(a, '20 minutes')], members: ['S1'] },
    { id: 'G2', bucket: 'code-only', subject: 'cart ttl', text: b.text, sources: ['code'], options: [opt(b, '30 minutes')], members: ['S2'] },
    { id: 'G3', bucket: 'code-only', subject: 'unrelated', text: d.text, sources: ['code'], options: [opt(d, '')], members: ['S3'] },
  ], counts: {} };
  const model = () => ({ matches: [{ story: 'XY-1', jira: 'G1', code: 'G2', confidence: 0.8, reason: 'same hold' }, { story: 'XY-1', jira: 'G1', code: 'G3', confidence: 0.3, reason: 'weak' }] });
  const ai = new AiSession({ env: ENV, fetchImpl: anthropicFetch(model) });
  const out = await aiMatchStatements(n, ai);
  const g = out.normalisation.groups.find((x) => x.id === 'G1');
  assert.equal(g.bucket, 'conflict');
  assert.deepEqual(g.options.map((o) => o.signature), ['20 minutes', '30 minutes']);
  assert.ok(out.normalisation.groups.some((x) => x.id === 'G3'), 'low-confidence pair not merged');
  assert.equal(ai.state.calls[0].rejected, 1);
});

test('AI personas are checked against the data dictionary before any data set uses them', async () => {
  const { pipeline } = createApp({ dataDir: tmpDir('ai-td'), env: {} });
  const c = await pipeline.startCycle({ type: 'baseline', inputs: HOTEL_INPUTS });
  const { dictionary } = pipeline.dictionaryOf(c);
  const ai = new AiSession({ env: ENV, fetchImpl: anthropicFetch(mockModel()) });
  const p = await aiPersonas(dictionary, ai);
  assert.deepEqual(p.personas[0].values, { 'guest.firstName': 'Amara', 'guest.lastName': 'Okafor', 'guest.phone': '+44 20 7946 0958' });
  assert.deepEqual(p.personas[1].values, { 'guest.lastName': 'Silva' }, 'invalid name and phone are rejected');
  assert.equal(p.rejectedValues, 2);
  const td = testDataAgent([{ key: 'TC-F-001', requirementId: 'REQ-001', testData: 'n/a' }], dictionary, { personas: p });
  const set = td.dataSets[0];
  assert.equal(set.conformance, 'conforms');
  assert.equal(set.persona, 'P1');
  const file = dataSetFile(set, dictionary);
  assert.equal(file.reservation['guest.firstName'], 'Amara');
  assert.deepEqual(file.aiGenerated, { persona: 'P1', attributes: ['guest.firstName', 'guest.lastName', 'guest.phone'] });
  assert.ok(td.summary.ai && td.summary.ai.personas === 2);
});

test('AI draft specs must compile, assert and stay inside the spec helpers', () => {
  assert.equal(checkDraft('const r = await request.get("/x");\nexpect(r.status()).toBe(200);'), null);
  assert.match(checkDraft("require('child_process')"), /forbidden/);
  assert.match(checkDraft('process.exit(1); expect(1).toBe(1);'), /forbidden/);
  assert.match(checkDraft('const x = 1;'), /asserts nothing/);
  assert.match(checkDraft('expect(1).toBe(1'), /does not compile/);
});

test('with AI on, every agent adds labelled suggestions while execution truth and defect rules stay unchanged', async () => {
  const plain = createApp({ dataDir: tmpDir('ai-off'), env: {} });
  const off = await baselineCycle(plain.pipeline, plain.store);
  const log = [];
  const withAi = createApp({ dataDir: tmpDir('ai-on'), env: ENV, fetchImpl: anthropicFetch(mockModel(), log) });
  const on = await baselineCycle(withAi.pipeline, withAi.store);
  assert.equal(on.status, 'completed');
  assert.ok(log.every((l) => l.headers['x-api-key'] === KEY && /\/v1\/messages$/.test(l.url)));
  assert.ok(!JSON.stringify(on).includes(KEY), 'the key is never stored on the cycle');

  const a = on.artifacts;
  assert.equal(a.requirements.length, off.artifacts.requirements.length);
  const described = a.requirements.filter((r) => r.ai);
  assert.ok(described.length > 0 && described.length < a.requirements.length, 'the description with an invented number is rejected');
  assert.ok(described.every((r) => !/999/.test(r.ai.summary)));

  const aiCases = a.testCases.filter((t) => t.origin === 'ai');
  assert.equal(aiCases.length, a.testCases.length - off.artifacts.testCases.length);
  assert.ok(aiCases.length > 0 && aiCases.every((t) => t.automation === 'Not automated' && t.labels.includes('ai-suggested') && t.requirementId));
  assert.ok(aiCases.every((t) => a.execution.results.find((r) => r.key === t.key).status === 'not-run'));

  assert.equal(a.aiScripts.length, 1, 'only the draft that passes the code checks is kept');
  assert.ok(!a.scripts.some((s) => s.file === a.aiScripts[0].file), 'drafts never join the executed suite');

  const runOf = (c) => Object.fromEntries(c.artifacts.execution.results.filter((r) => r.status !== 'not-run').map((r) => [r.key, r.status]));
  assert.deepEqual(runOf(on), runOf(off), 'pass/fail comes only from the real run');
  assert.deepEqual(a.execution.summary.executed, off.artifacts.execution.summary.executed);
  assert.equal(a.execution.summary.failed, off.artifacts.execution.summary.failed);
  const failed = a.execution.results.filter((r) => r.status === 'failed');
  assert.ok(failed.every((r) => r.aiTriage && r.aiTriage.category === 'product defect'));

  assert.equal(a.defects.length, off.artifacts.defects.length, 'defects only from real failures');
  const d = a.defects[0];
  const d0 = off.artifacts.defects[0];
  assert.deepEqual([d.expected, d.actual, d.severity, d.testCaseKey], [d0.expected, d0.actual, d0.severity, d0.testCaseKey]);
  assert.ok(d.ai && d.ai.stepsToReproduce.length && d.aiTriage);

  const r = on.report;
  assert.equal(r.narrative.origin, 'ai');
  assert.match(r.narrative.draftedBy, /AI \(Anthropic mock-model\)/);
  assert.equal(r.narrative.risks.length, 1);
  assert.equal(r.execution.summary.passRate, off.report.execution.summary.passRate);
  assert.equal(r.ai.mode, 'ai');
  assert.ok(r.ai.suggestions.requirementsDescribed > 0 && r.ai.suggestions.testCases > 0 && r.ai.suggestions.defectsDescribed === 1);
  for (const agent of ['review-agent', 'requirements', 'testcases', 'scripts', 'execution', 'defects', 'report']) {
    assert.ok(r.ai.agents.some((g) => g.agent === agent), `${agent} ran its AI step`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await reportWorkbook(r, on));
  assert.ok(wb.getWorksheet('AI activity').rowCount > 1);
  assert.equal(wb.getWorksheet('Requirements').getRow(1).getCell(13).value, 'AI title (suggested)');
});

test('when the model fails, every agent falls back to its rule-based result', async () => {
  const plain = createApp({ dataDir: tmpDir('ai-off2'), env: {} });
  const off = await baselineCycle(plain.pipeline, plain.store);
  const broken = createApp({ dataDir: tmpDir('ai-broken'), env: ENV, fetchImpl: async () => ({ ok: false, status: 503 }) });
  const c = await baselineCycle(broken.pipeline, broken.store);
  assert.equal(c.status, 'completed');
  assert.equal(c.artifacts.testCases.length, off.artifacts.testCases.length);
  assert.ok(!c.artifacts.requirements.some((r) => r.ai));
  assert.equal(c.artifacts.defects.length, off.artifacts.defects.length);
  assert.equal(c.report.narrative.origin, 'rule-based');
  assert.match(c.report.narrative.draftedBy, /model call failed/);
  assert.ok(c.ai.calls.length > 0 && c.ai.calls.every((x) => x.ok === false));
});
