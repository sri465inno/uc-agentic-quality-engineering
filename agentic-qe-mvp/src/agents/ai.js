'use strict';
// The AI step of each agent. Every function asks the model for suggestions, checks each one in code and returns
// only what passed, labelled as AI-suggested. With the model off (or failing) each returns nothing and the
// rule-based result of the agent stands unchanged.
const { mapLimit, chunk, onlyKnownNumbers } = require('../ai');
const { checkValue } = require('./testdata');

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const strings = (a, max) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x) => clip(x.trim(), 300)) : []);
const isStoryKey = (k) => /^[A-Z][A-Z0-9]+-\d+$/.test(k || '');

/* ---------- Normalise: semantic matching of Jira-only and code-only statements of the same story ---------- */

function storyCandidates(normalisation) {
  const byId = new Map(normalisation.statements.map((s) => [s.id, s]));
  const keysOf = (g) => [...new Set(g.members.map((id) => byId.get(id)).filter(Boolean)
    .map((s) => (s.source === 'jira' ? s.origin?.ref : s.origin?.story)).filter(isStoryKey))];
  const stories = new Map();
  for (const g of normalisation.groups.filter((x) => x.bucket === 'jira-only' || x.bucket === 'code-only')) {
    for (const k of keysOf(g)) {
      if (!stories.has(k)) stories.set(k, { story: k, jira: [], code: [] });
      stories.get(k)[g.bucket === 'jira-only' ? 'jira' : 'code'].push(g);
    }
  }
  return [...stories.values()].filter((s) => s.jira.length && s.code.length);
}

function mergeGroups(j, c, match, model) {
  const jo = j.options[0];
  const co = c.options[0];
  const members = [...j.members, ...c.members];
  const all = (o) => o.members || [];
  let options;
  let valuesFrom;
  if (jo.signature === co.signature) { options = [{ ...jo, sources: ['jira', 'code'], members: [...all(jo), ...all(co)] }]; valuesFrom = 'both agree'; }
  else if (!jo.signature) { options = [{ ...co, optionId: 'O1', sources: ['code', 'jira'], members: [...all(co), ...all(jo)] }]; valuesFrom = 'code (Jira states no value)'; }
  else if (!co.signature) { options = [{ ...jo, sources: ['jira', 'code'], members: [...all(jo), ...all(co)] }]; valuesFrom = 'Jira (code states no value)'; }
  else { options = [{ ...jo, optionId: 'O1' }, { ...co, optionId: 'O2' }]; valuesFrom = 'conflict'; }
  return {
    id: j.id, bucket: options.length > 1 ? 'conflict' : 'agreed', subject: j.subject, text: options.length === 1 ? options[0].text : null,
    sources: ['code', 'jira'], options, members,
    ai: { kind: 'match', by: model, story: match.story, merged: [j.id, c.id], confidence: match.confidence, reason: match.reason, valuesFrom, jiraText: jo.text, codeText: co.text },
  };
}

/** Pairs a Jira-only and a code-only group of the same story when the model says they state the same rule; code still compares the values. */
async function aiMatchStatements(normalisation, ai, { guidance = '', minConfidence = 0.6 } = {}) {
  if (!ai.enabled) return { normalisation, matches: [] };
  const stories = storyCandidates(normalisation);
  if (!stories.length) return { normalisation, matches: [] };
  const replies = await mapLimit(chunk(stories, 6), ai.concurrency, (batch) => ai.json('normalise', 'Match Jira and code statements that state the same rule', {
    guidance,
    system: 'You compare Jira acceptance criteria with business rules found in source code, story by story.',
    prompt: `For each Jira story below, pair a Jira statement with a code statement only when both describe the same behaviour or business rule, even if the wording differs or only one of them states the exact value. Never pair statements about different behaviours. Each statement may appear in at most one pair.
Reply as {"matches":[{"story":"<story key>","jira":"<jira group id>","code":"<code group id>","confidence":0.0-1.0,"reason":"<one short sentence>"}]}. Return {"matches":[]} when nothing pairs.
${JSON.stringify(batch.map((s) => ({ story: s.story, jira: s.jira.map((g) => ({ id: g.id, text: g.text })), code: s.code.map((g) => ({ id: g.id, text: g.text })) })))}`,
    maxTokens: 1500,
  }));
  const byStory = new Map(stories.map((s) => [s.story, s]));
  const used = new Set();
  const accepted = [];
  let rejected = 0;
  for (const r of replies) {
    for (const m of (r && Array.isArray(r.matches) ? r.matches : [])) {
      const s = byStory.get(m.story);
      const j = s && s.jira.find((g) => g.id === m.jira);
      const c = s && s.code.find((g) => g.id === m.code);
      const conf = Number(m.confidence);
      if (!j || !c || used.has(j.id) || used.has(c.id) || !(conf >= minConfidence)) { rejected += 1; continue; }
      used.add(j.id); used.add(c.id);
      accepted.push({ story: m.story, j, c, confidence: Math.round(conf * 100) / 100, reason: clip(m.reason, 240) });
    }
  }
  ai.outcome('normalise', { accepted: accepted.length, rejected, note: `${accepted.length} Jira/code pair(s) matched by meaning` });
  if (!accepted.length) return { normalisation, matches: [] };
  const merged = new Map(accepted.map((m) => [m.j.id, mergeGroups(m.j, m.c, m, ai.label)]));
  const drop = new Set(accepted.map((m) => m.c.id));
  const groups = normalisation.groups.filter((g) => !drop.has(g.id)).map((g) => merged.get(g.id) || g);
  const counts = { statements: normalisation.statements.length, groups: groups.length, agreed: 0, 'jira-only': 0, 'code-only': 0, conflict: 0, aiMatched: accepted.length };
  groups.forEach((g) => { counts[g.bucket] += 1; });
  return { normalisation: { ...normalisation, groups, counts }, matches: accepted.map((m) => merged.get(m.j.id).ai) };
}

/* ---------- Review agent: quality of the requirement statements ---------- */

const ISSUES = ['ambiguous', 'untestable', 'incomplete', 'contradiction'];
const SEVERITIES = ['low', 'medium', 'high'];

async function aiReviewFindings(normalisation, ai, { guidance = '', perBatch = 8 } = {}) {
  if (!ai.enabled) return [];
  const groups = normalisation.groups;
  const textOf = (g) => g.text || g.options.map((o) => o.text).join(' / ');
  const replies = await mapLimit(chunk(groups, 50), ai.concurrency, (batch) => ai.json('review-agent', 'Flag ambiguous, untestable or incomplete requirements', {
    guidance,
    system: 'You review requirement statements the way a senior business analyst and QE lead would before test design starts.',
    prompt: `Flag at most ${perBatch} statements below that a tester could not turn into a clear pass/fail check: ambiguous wording, no measurable expected outcome, missing error or edge behaviour, or a contradiction with another statement. Skip statements that are already clear.
Reply as {"findings":[{"groupId":"<id>","issue":"${ISSUES.join('|')}","severity":"low|medium|high","title":"<short>","suggestion":"<what to ask the product owner>","suggestedWording":"<clearer statement, optional>"}]}.
${JSON.stringify(batch.map((g) => ({ id: g.id, source: g.bucket, text: textOf(g) })))}`,
    maxTokens: 2000,
  }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = [];
  let rejected = 0;
  for (const r of replies) {
    for (const f of (r && Array.isArray(r.findings) ? r.findings.slice(0, perBatch) : [])) {
      const g = byId.get(f.groupId);
      if (!g || !ISSUES.includes(f.issue) || !f.title || out.some((x) => x.groupId === g.id)) { rejected += 1; continue; }
      const wording = f.suggestedWording && onlyKnownNumbers(f.suggestedWording, textOf(g)) ? clip(f.suggestedWording, 300) : null;
      out.push({
        category: 'ai', by: 'ai', model: ai.label, issue: f.issue, severity: SEVERITIES.includes(f.severity) ? f.severity : 'low', groupId: g.id,
        title: `AI: ${clip(f.title, 120)}`, detail: textOf(g),
        suggestion: `${clip(f.suggestion, 300)}${wording ? ` Suggested wording: "${wording}"` : ''}`, sources: [],
      });
    }
  }
  ai.outcome('review-agent', { accepted: out.length, rejected, note: `${out.length} statement(s) flagged for clearer wording` });
  return out;
}

/* ---------- Requirements agent: plain-language title, summary and acceptance criteria ---------- */

async function aiDescribeRequirements(requirements, ai, { guidance = '', only = null } = {}) {
  if (!ai.enabled) return 0;
  const todo = requirements.filter((r) => (only ? only.has(r.id) : true));
  if (!todo.length) return 0;
  const factsOf = (r) => [r.text, ...(r.origins || []).map((o) => o.quote), r.businessRule ? r.businessRule.parameters : {}];
  const replies = await mapLimit(chunk(todo, 20), ai.concurrency, (batch) => ai.json('requirements', 'Describe requirements in plain language', {
    guidance,
    system: 'You turn normalised requirement statements into plain language a BA, product owner or QE can read and approve.',
    prompt: `For each requirement write a short title (max 8 words), a one-sentence summary of the functionality in business language, and 1 to 3 acceptance criteria in Given/When/Then form. Keep every number exactly as stated; add none.
Reply as {"items":[{"id":"<id>","title":"...","summary":"...","acceptance":["Given ... when ... then ..."]}]}.
${JSON.stringify(batch.map((r) => ({ id: r.id, statement: r.text, values: r.businessRule ? r.businessRule.parameters : undefined, quotes: (r.origins || []).map((o) => clip(o.quote, 200)) })))}`,
    maxTokens: 3500,
  }));
  const byId = new Map(todo.map((r) => [r.id, r]));
  let accepted = 0;
  let rejected = 0;
  for (const rep of replies) {
    for (const x of (rep && Array.isArray(rep.items) ? rep.items : [])) {
      const r = byId.get(x.id);
      const acceptance = strings(x.acceptance, 3);
      const text = [x.title, x.summary, ...acceptance].join(' ');
      if (!r || !x.title || !x.summary || !acceptance.length || !onlyKnownNumbers(text, factsOf(r))) { rejected += 1; continue; }
      r.ai = { title: clip(x.title, 90), summary: clip(x.summary, 400), acceptance, by: ai.label, status: 'AI-suggested' };
      accepted += 1;
    }
  }
  ai.outcome('requirements', { accepted, rejected, note: `${accepted} requirement(s) described in plain language${rejected ? `; ${rejected} rejected (stated a number not in the source, or incomplete)` : ''}` });
  return accepted;
}

/* ---------- Test design agent: extra scenarios the catalogue does not design ---------- */

const SCENARIOS = ['negative', 'edge', 'exploratory', 'integration'];

async function aiSuggestTestCases(requirements, testCases, ai, { guidance = '', only = null, perRequirement = 2 } = {}) {
  if (!ai.enabled) return [];
  const todo = requirements.filter((r) => (only ? only.has(r.id) : true));
  if (!todo.length) return [];
  const casesOf = new Map();
  for (const t of testCases) { if (!casesOf.has(t.requirementId)) casesOf.set(t.requirementId, []); casesOf.get(t.requirementId).push(t); }
  const replies = await mapLimit(chunk(todo, 15), ai.concurrency, (batch) => ai.json('testcases', 'Suggest test scenarios the rule-based design misses', {
    guidance,
    system: 'You are a senior test designer. You add test scenarios that existing test cases miss; you never repeat a case that already exists.',
    prompt: `For each requirement, suggest at most ${perRequirement} additional test scenarios (negative, edge, exploratory or integration) that its existing cases do not cover. Return none for a requirement that is already well covered. Base expected results only on the requirement; add no new limits.
Reply as {"cases":[{"requirementId":"<id>","scenario":"${SCENARIOS.join('|')}","name":"...","objective":"...","steps":["..."],"expected":"..."}]}.
${JSON.stringify(batch.map((r) => ({ id: r.id, requirement: r.text, existingCases: (casesOf.get(r.id) || []).map((t) => `${t.name} -> ${clip(t.expected, 160)}`) })))}`,
    maxTokens: 3500,
  }));
  const byId = new Map(todo.map((r) => [r.id, r]));
  const per = new Map();
  const out = [];
  let rejected = 0;
  for (const rep of replies) {
    for (const x of (rep && Array.isArray(rep.cases) ? rep.cases : [])) {
      const r = byId.get(x.requirementId);
      const steps = strings(x.steps, 8);
      const n = per.get(x.requirementId) || 0;
      const dup = r && (casesOf.get(r.id) || []).some((t) => t.name.toLowerCase() === String(x.name || '').toLowerCase());
      if (!r || !x.name || !x.expected || !steps.length || n >= perRequirement || dup) { rejected += 1; continue; }
      per.set(r.id, n + 1);
      out.push({ requirementId: r.id, scenario: SCENARIOS.includes(x.scenario) ? x.scenario : 'exploratory', name: clip(x.name, 140), objective: clip(x.objective || x.name, 300), steps, expected: clip(x.expected, 300) });
    }
  }
  ai.outcome('testcases', { accepted: out.length, rejected, note: `${out.length} extra scenario(s) suggested as manual cases` });
  return out;
}

/* ---------- Test data agent: realistic values for the attributes no test case sets ---------- */

const SHAPES = [
  [/^[\p{L}][\p{L} .'-]*$/u, /^[\p{L}][\p{L} .'-]{0,49}$/u],
  [/@/, /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/],
  [/^\+[0-9 ()-]{7,20}$/, /^\+[0-9 ()-]{7,20}$/],
];
/** A value must keep the character shape of the dictionary example (a name stays a name, a phone a phone). */
function sameShape(example, value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 60) return false;
  const shape = SHAPES.find(([test]) => test.test(String(example)));
  return shape ? shape[1].test(value) : false;
}

function personaAttributes(dictionary) {
  return dictionary.attributes.filter((a) => a.type === 'string' && !a.values && !a.driver && typeof a.example === 'string' && a.example && SHAPES.some(([t]) => t.test(a.example)));
}

async function aiPersonas(dictionary, ai, { guidance = '', count = 6 } = {}) {
  if (!ai.enabled || !dictionary) return null;
  const attrs = personaAttributes(dictionary);
  if (!attrs.length) return null;
  const rep = await ai.json('testdata', 'Generate realistic synthetic personas', {
    guidance,
    system: 'You generate realistic but clearly fictitious synthetic test data. Never use real people, real e-mail domains or real phone numbers.',
    prompt: `Generate ${count} diverse, international, fictitious personas. Use e-mail domains example.com, example.org or example.net, and phone numbers in international format. Each value must match the attribute description, pattern and example.
Reply as {"personas":[{${attrs.map((a) => `"${a.name}":"..."`).join(',')}}]}.
${JSON.stringify(attrs.map((a) => ({ name: a.name, description: a.description, pattern: a.pattern, example: a.example })))}`,
    maxTokens: 1500,
  });
  const personas = [];
  let rejected = 0;
  for (const p of (rep && Array.isArray(rep.personas) ? rep.personas.slice(0, count) : [])) {
    const values = {};
    for (const a of attrs) {
      const v = p && p[a.name];
      if (v === undefined) continue;
      const fictitious = !/@/.test(a.example) || /@[^@]*example\.(com|org|net)$/i.test(String(v));
      if (!checkValue(a, v) && sameShape(a.example, v) && fictitious) values[a.name] = v.trim();
      else rejected += 1;
    }
    if (Object.keys(values).length) personas.push({ id: `P${personas.length + 1}`, values });
  }
  ai.outcome('testdata', { accepted: personas.length, rejected, note: `${personas.length} persona(s) checked against the data dictionary${rejected ? `; ${rejected} value(s) rejected` : ''}` });
  return personas.length ? { by: ai.label, attributes: attrs.map((a) => a.name), personas, rejectedValues: rejected } : null;
}

/* ---------- Automation agent: draft Playwright specs for manual cases ---------- */

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const FORBIDDEN = /\brequire\s*\(|\bprocess\.|child_process|\beval\s*\(|\bFunction\s*\(|\bimport\s*\(/;

/** Compiles (never runs) the body; it must assert something and stay inside the spec helpers. */
function checkDraft(body) {
  if (typeof body !== 'string' || !body.trim()) return 'empty';
  if (FORBIDDEN.test(body)) return 'uses a forbidden API (require, process, eval, dynamic import)';
  if (!/\bexpect\s*\(/.test(body)) return 'asserts nothing';
  try { AsyncFunction('request', 'page', 'testInfo', 'expect', body); } catch (e) { return `does not compile: ${e.message}`; }
  return null;
}

async function aiDraftScripts(testCases, requirements, scripts, ai, { guidance = '', dom, limit = 6, only = null } = {}) {
  if (!ai.enabled || !dom) return [];
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const manual = testCases.filter((t) => t.automation !== 'Automated' && (only ? only.has(t.requirementId) : true) && t.inRun !== false).slice(0, limit);
  if (!manual.length || !scripts.length) return [];
  const exampleFor = (t) => {
    const keys = new Set(reqById.get(t.requirementId)?.jiraKeys || []);
    return scripts.find((s) => (reqById.get(s.requirementId)?.jiraKeys || []).some((k) => keys.has(k))) || scripts[0];
  };
  const drafts = await mapLimit(manual, ai.concurrency, async (t) => {
    const ex = exampleFor(t);
    const rep = await ai.json('scripts', 'Draft a Playwright spec for a manual test case', {
      guidance,
      system: 'You write Playwright API tests. You use only the helpers and endpoints shown in the example spec.',
      prompt: `Write the body of one Playwright test for the test case below. It runs inside: test(title, async ({ request, page }, testInfo) => { <body> }). Use only the helpers, services and endpoints that appear in the example spec, and assert the expected result with expect(). Do not use require, process or dynamic imports.
Reply as {"body":"<JavaScript statements>","assumptions":"<what you assumed, one sentence>"}.
Test case: ${JSON.stringify({ key: t.key, name: t.name, steps: t.steps, expected: t.expected, requirement: reqById.get(t.requirementId)?.text })}
Example spec (${ex.file}):
${clip(ex.code, 6000)}`,
      maxTokens: 1500,
    });
    const problem = rep ? checkDraft(rep.body) : 'no reply';
    if (problem) return { rejected: true, key: t.key, problem };
    const file = `ai-draft-${t.key.toLowerCase()}.spec.js`;
    const code = `// AI draft by ${ai.label} for ${t.key} (${t.name}), requirement ${t.requirementId}.
// Not executed by the platform: a QE reviews it and promotes it into the suite.
// Assumptions: ${clip(rep.assumptions || 'none stated', 300).replace(/\n/g, ' ')}
const { test, expect } = require('@playwright/test');

${dom.SPEC_PRELUDE}

test(${JSON.stringify(`${t.key} ${t.name}`)}, async ({ request, page }, testInfo) => {
${rep.body.trim()}
});
`;
    return { file, caseKey: t.key, requirementId: t.requirementId, code, by: ai.label, status: 'AI draft - not executed', basedOn: ex.file };
  });
  const ok = drafts.filter((d) => !d.rejected);
  ai.outcome('scripts', { accepted: ok.length, rejected: drafts.length - ok.length, note: `${ok.length} draft spec(s) compiled and kept out of the run` });
  return ok;
}

/* ---------- Execution agent: triage of real failures ---------- */

const TRIAGE = ['product defect', 'test issue', 'environment'];

async function aiTriageFailures(execution, testCases, requirements, ai, { guidance = '' } = {}) {
  const failed = (execution.results || []).filter((r) => r.status === 'failed');
  if (!ai.enabled || !failed.length) return 0;
  const caseBy = new Map(testCases.map((t) => [t.key, t]));
  const reqBy = new Map(requirements.map((r) => [r.id, r]));
  const rep = await ai.json('execution', 'Triage real test failures', {
    guidance,
    system: 'You triage automated test failures for a QE lead. The pass/fail result is final; you only explain the likely kind of failure.',
    prompt: `Classify each failure as "product defect" (the system breaks the requirement), "test issue" (the test or its data is wrong) or "environment" (service down, timeout, setup). Explain in one sentence.
Reply as {"items":[{"key":"<case key>","category":"${TRIAGE.join('|')}","confidence":0.0-1.0,"rationale":"..."}]}.
${JSON.stringify(failed.map((r) => ({ key: r.key, name: r.name, requirement: reqBy.get(r.requirementId)?.text, expected: caseBy.get(r.key)?.expected, assertion: r.error?.assertion, expectedValue: r.error?.expected, actualValue: r.error?.actual, message: clip(r.error?.message, 600) })))}`,
    maxTokens: 1500,
  });
  const byKey = new Map(failed.map((r) => [r.key, r]));
  let accepted = 0;
  let rejected = 0;
  for (const x of (rep && Array.isArray(rep.items) ? rep.items : [])) {
    const r = byKey.get(x.key);
    if (!r || !TRIAGE.includes(x.category) || r.aiTriage) { rejected += 1; continue; }
    r.aiTriage = { category: x.category, confidence: Math.round((Number(x.confidence) || 0) * 100) / 100, rationale: clip(x.rationale, 300), by: ai.label };
    accepted += 1;
  }
  ai.outcome('execution', { accepted, rejected, note: `${accepted} of ${failed.length} failure(s) triaged; results unchanged` });
  return accepted;
}

/* ---------- Defect agent: description, reproduction steps, likely cause ---------- */

async function aiDescribeDefects(defects, testCases, ai, { guidance = '' } = {}) {
  if (!ai.enabled || !defects.length) return 0;
  const caseBy = new Map(testCases.map((t) => [t.key, t]));
  const factsOf = (d) => ({ id: d.id, title: d.title, story: (d.jiraKeys || [])[0] || null, requirement: d.requirementText, expected: d.expected, actual: d.actual, assertion: d.assertion, steps: caseBy.get(d.testCaseKey)?.steps, testData: caseBy.get(d.testCaseKey)?.testData, suspectedCodeArea: d.suspectedCodeArea, triage: d.aiTriage ? d.aiTriage.category : undefined });
  const rep = await ai.json('defects', 'Write defect descriptions', {
    guidance,
    system: 'You write defect reports a developer can act on. Use only the facts given; every number must come from them.',
    prompt: `For each defect write a two-sentence summary, the steps to reproduce, the likely cause in the code area named, and the business impact.
Reply as {"items":[{"id":"<defect id>","summary":"...","stepsToReproduce":["..."],"likelyCause":"...","businessImpact":"..."}]}.
${JSON.stringify(defects.map(factsOf))}`,
    maxTokens: 2500,
  });
  const byId = new Map(defects.map((d) => [d.id, d]));
  let accepted = 0;
  let rejected = 0;
  for (const x of (rep && Array.isArray(rep.items) ? rep.items : [])) {
    const d = byId.get(x.id);
    const steps = strings(x.stepsToReproduce, 8);
    const text = [x.summary, x.likelyCause, x.businessImpact, ...steps].join(' ');
    if (!d || !x.summary || !steps.length || d.ai || !onlyKnownNumbers(text, factsOf(d))) { rejected += 1; continue; }
    d.ai = { summary: clip(x.summary, 500), stepsToReproduce: steps, likelyCause: clip(x.likelyCause, 300), businessImpact: clip(x.businessImpact, 300), by: ai.label, status: 'AI-drafted' };
    accepted += 1;
  }
  ai.outcome('defects', { accepted, rejected, note: `${accepted} defect description(s) drafted${rejected ? `; ${rejected} rejected (stated a number not in the evidence, or incomplete)` : ''}` });
  return accepted;
}

module.exports = {
  aiMatchStatements, aiReviewFindings, aiDescribeRequirements, aiSuggestTestCases, aiPersonas, aiDraftScripts, aiTriageFailures, aiDescribeDefects,
  storyCandidates, checkDraft, sameShape, personaAttributes,
};
