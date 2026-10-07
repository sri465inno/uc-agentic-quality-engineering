'use strict';
// Design agents, run in a fixed order:
//   requirements repository -> business rules -> test cases -> automation scripts
// All structure and decisions are deterministic; the optional model only drafts prose elsewhere.
const { DOMAINS, domainOf } = require('./domains');
const { getTestingType, inRun, suiteOf, SMOKE_SLOTS } = require('../testing-types');

const pad = (n, w = 3) => String(n).padStart(w, '0');
const clone = (x) => JSON.parse(JSON.stringify(x));

function requirementType(text, dom) {
  const c = dom.classify(text);
  if (c?.entry.type) return c.entry.type;
  return /performance|latency|response time|availability|uptime|security|accessib/i.test(text) ? 'non-functional' : 'functional';
}

function requirementTitle(text, dom) {
  const c = dom.classify(text);
  if (c) return c.entry.title;
  return text.replace(/[.]$/, '').split(/\s+/).slice(0, 7).join(' ');
}

function newRequirement(item, id, cycle) {
  const dom = domainOf(cycle);
  return {
    id,
    title: requirementTitle(item.text, dom),
    text: item.text,
    values: item.values,
    type: requirementType(item.text, dom),
    sources: item.sources,
    bucket: item.bucket,
    origins: item.origins,
    jiraKeys: [...new Set([...item.origins.filter((o) => o.source === 'jira' && o.ref && /^[A-Z]+-\d+$/.test(o.ref)).map((o) => o.ref), ...storiesOf(item.origins)])],
    resolution: item.resolution,
    version: 1,
    status: 'new',
    previous: null,
    introducedInCycle: cycle.id,
    changedInCycle: cycle.id,
  };
}

/** Agent 1 (baseline): the reviewed requirement set becomes the requirement repository. */
function requirementsAgentBaseline(reviewed, { cycle, counters }) {
  return reviewed.map((item) => {
    counters.req += 1;
    return newRequirement(item, `REQ-${pad(counters.req)}`, cycle);
  });
}

/** Agent 1 (incremental): baseline requirements carried over, enhanced ones updated, new ones added. */
function requirementsAgentIncremental(baselineReqs, delta, { cycle, counters }) {
  const dom = domainOf(cycle);
  const byId = new Map(baselineReqs.map((r) => [r.id, { ...clone(r), status: 'carried over' }]));
  const added = [];
  for (const d of delta.items) {
    if (d.classification === 'unchanged') {
      byId.get(d.baselineRequirementId).status = 'unchanged';
      d.requirementId = d.baselineRequirementId;
    } else if (d.classification === 'enhanced') {
      const old = byId.get(d.baselineRequirementId);
      byId.set(old.id, {
        ...old,
        title: requirementTitle(d.incoming.text, dom),
        text: d.incoming.text,
        values: d.incoming.values,
        type: requirementType(d.incoming.text, dom),
        sources: d.incoming.sources,
        origins: d.incoming.origins,
        jiraKeys: [...new Set([...retagged(old, d.incoming.origins), ...d.incoming.origins.filter((o) => o.source === 'jira' && /^[A-Z]+-\d+$/.test(o.ref || '')).map((o) => o.ref), ...storiesOf(d.incoming.origins)])],
        resolution: d.incoming.resolution,
        version: old.version + 1,
        status: 'enhanced',
        previous: { text: old.text, values: old.values, version: old.version, origins: old.origins },
        changedInCycle: cycle.id,
      });
      d.requirementId = old.id;
    } else {
      counters.req += 1;
      d.requirementId = `REQ-${pad(counters.req)}`;
      added.push(newRequirement(d.incoming, d.requirementId, cycle));
    }
  }
  return [...byId.values(), ...added];
}

const CHANGED = new Set(['new', 'enhanced']);

/** Which requirements need (re-)design: new, enhanced, or depending on the rule of one that changed. */
function affectedRequirementIds(requirements, dom = DOMAINS.commission) {
  const kindOf = new Map(requirements.map((r) => [r.id, dom.classify(r.text)?.entry.kind || null]));
  const changedKinds = new Set(requirements.filter((r) => CHANGED.has(r.status)).map((r) => kindOf.get(r.id)).filter(Boolean));
  const out = new Set();
  for (const r of requirements) {
    if (CHANGED.has(r.status)) { out.add(r.id); continue; }
    const entry = dom.CATALOGUE.find((e) => e.kind === kindOf.get(r.id));
    if (entry?.dependsOn?.some((k) => changedKinds.has(k))) out.add(r.id);
  }
  return out;
}

function provenanceOf(cycle, slot) {
  const input = (cycle.inputs || []).find((i) => i.slot === slot);
  return input ? input.provenance.kind : null;
}

/** Jira stories named by codebase @rule tags. */
const storiesOf = (origins) => origins.filter((o) => o.source === 'code' && o.story).map((o) => o.story);
/** A requirement's Jira keys minus the code-tag stories the incoming code re-tags (Jira-sourced keys stay). */
const retagged = (old, incoming) => {
  if (!storiesOf(incoming).length) return old.jiraKeys;
  const fromJira = new Set((old.origins || []).filter((o) => o.source === 'jira').map((o) => o.ref));
  const fromCode = new Set(storiesOf(old.origins || []));
  return old.jiraKeys.filter((k) => fromJira.has(k) || !fromCode.has(k));
};

/** Source references behind a requirement: Jira issue keys, else repository paths. */
function sourceRefs(req) {
  if (req.jiraKeys.length) return req.jiraKeys;
  return [...new Set(req.origins.filter((o) => o.ref).map((o) => o.ref))];
}

function buildRule(req, id, cycle) {
  const dom = domainOf(cycle);
  const c = dom.classify(req.text);
  return {
    id,
    requirementId: req.id,
    kind: c ? c.entry.kind : 'unclassified',
    title: c ? c.entry.title : requirementTitle(req.text, dom),
    statement: req.text,
    parameters: c ? c.params : Object.fromEntries(req.values.map((v, i) => [`value${i + 1}`, `${v.num}${v.unit ? ' ' + v.unit : ''}`])),
    executable: Boolean(c),
    quotes: req.origins.map((o) => ({ source: o.source, ref: o.ref, line: o.line || null, url: o.url || null, text: o.quote, provenance: provenanceOf(cycle, o.input) })),
  };
}

/** Folds each business rule into its requirement, so the reviewed requirement set carries its rule, values and quotes. */
function attachBusinessRules(requirements, rules) {
  const byReq = new Map(rules.map((r) => [r.requirementId, r]));
  for (const req of requirements) {
    const r = byReq.get(req.id);
    req.businessRule = r ? {
      id: r.id, kind: r.kind, title: r.title, parameters: r.parameters, executable: r.executable, status: r.status, version: r.version,
      previousParameters: r.previous ? r.previous.parameters : null,
    } : null;
  }
  return requirements;
}

function manualCase(req) {
  return {
    slot: 'manual', priority: 'Low', manual: true,
    name: `Verify: ${req.text.replace(/[.]$/, '')}`,
    objective: `Confirm the behaviour "${req.text}" (no executable template in the catalogue - manual verification).`,
    precondition: 'Access to the system under test and its operational logs.',
    steps: ['Perform the action described by the requirement', 'Observe the outcome in the system or its logs'],
    testData: 'n/a', expected: req.text,
  };
}

/** Every case the catalogue can design for a requirement, each tagged with its suite. */
function candidateSpecs(req, c, ctx) {
  if (!c) return [{ ...manualCase(req), suite: req.type === 'non-functional' ? 'nfr' : 'api' }];
  const own = c.entry.cases(c.params, ctx).map((x) => ({ ...x, suite: x.suite || (c.entry.ui ? 'ui' : c.entry.type === 'non-functional' ? 'nfr' : 'api') }));
  const extra = c.entry.extras ? c.entry.extras(c.params, ctx) : [];
  return [...own, ...extra];
}

function caseLabels(type, suite, kind, slot, automated, tt) {
  return [
    type === 'functional' ? 'functional' : 'non-functional',
    ...(tt.ids.includes('e2e') && ['ui', 'journey'].includes(suite) ? ['e2e'] : []),
    ...(tt.ids.includes('performance') && ['nfr', 'load'].includes(suite) ? ['performance'] : []),
    ...(tt.ids.includes('smoke') && SMOKE_SLOTS.has(`${kind}|${slot}`) ? ['smoke'] : []),
    ...(automated ? ['automation'] : []),
  ];
}

/**
 * The business rule behind each requirement (owned by the requirements agent), then the test design and automation agents, steered by the type of testing.
 * With `previous` (incremental), unaffected artifacts are carried over untouched and
 * affected ones are re-designed, keeping their keys and the superseded version.
 * Cases the type of testing asks for but the pack lacks are added; cases it does not run stay in the pack with inRun=false.
 */
function designAgents(requirements, { cycle, counters, previous = null, skills = {}, testingType = cycle.testingType }) {
  const dom = domainOf(cycle);
  const tt = getTestingType(testingType, dom.id);
  const { classify, MONEY_KINDS } = dom;
  const used = (agent) => (skills[agent]?.skills || []).map((x) => x.id);
  counters.caseF = counters.caseF || 0;
  counters.caseN = counters.caseN || 0;
  const affected = previous ? affectedRequirementIds(requirements, dom) : new Set(requirements.map((r) => r.id));
  const paramsByKind = new Map();
  for (const r of requirements) {
    const c = classify(r.text);
    if (c && !paramsByKind.has(c.entry.kind)) paramsByKind.set(c.entry.kind, c.params);
  }
  const ctx = { paramsOf: (kind) => paramsByKind.get(kind) };
  const prevRules = new Map((previous?.rules || []).map((x) => [x.requirementId, x]));
  const prevCases = new Map((previous?.testCases || []).map((x) => [`${x.requirementId}|${x.slot}`, x]));
  const prevScripts = new Map((previous?.scripts || []).map((x) => [x.requirementId, x]));
  const kindOfReq = (req) => classify(req.text)?.entry.kind || 'unclassified';
  const wants = (spec, kind) => inRun(tt, { suite: spec.suite, kind, slot: spec.slot });

  const rules = [];
  const testCases = [];
  const scripts = [];

  const nextKey = (req) => {
    const nf = req.type === 'non-functional';
    counters[nf ? 'caseN' : 'caseF'] += 1;
    return `TC-${nf ? 'N' : 'F'}-${pad(counters[nf ? 'caseN' : 'caseF'])}`;
  };

  const designCase = (req, c, s, ruleId, scriptFile, prev) => {
    const kind = c ? c.entry.kind : 'unclassified';
    const automated = !s.manual && Boolean(scriptFile);
    return {
      key: prev?.key || nextKey(req), requirementId: req.id, ruleId, slot: s.slot, kind, suite: s.suite,
      name: s.name, objective: s.objective, precondition: s.precondition, steps: s.steps, testData: s.testData,
      expected: s.expected, priority: s.manual ? 'Low' : (c && MONEY_KINDS.has(c.entry.kind) ? 'High' : 'Medium'), type: req.type,
      labels: caseLabels(req.type, s.suite, kind, s.slot, automated, tt),
      automation: automated ? 'Automated' : 'Not automated', scriptFile: automated ? scriptFile : null,
      issueLinks: req.jiraKeys, sourceRefs: sourceRefs(req), cycle: cycle.name, designedWith: used('testcases'), designedFor: tt.id,
      inRun: inRun(tt, { suite: s.suite, kind, slot: s.slot }),
      status: prev ? 're-designed' : 'new', version: prev ? prev.version + 1 : 1,
      previous: prev ? { name: prev.name, expected: prev.expected, testData: prev.testData, version: prev.version } : null,
      revisionNote: prev ? `v${prev.version + 1} (${cycle.id}): ${revision(prev, s)}` : null,
      ui: Boolean(s.ui ?? c?.entry.ui), varies: s.varies || [],
      code: automated ? s.code() : null,
    };
  };

  const writeScript = (req, rule, scriptFile, reqCases, prevScript) => {
    const code = renderSpec(req, reqCases, { rule, skills: used('scripts'), testingType: tt, dom });
    const changed = !prevScript || prevScript.code !== code;
    scripts.push({
      file: scriptFile, requirementId: req.id, ruleId: rule.id, designedWith: used('scripts'), covers: reqCases.map((t) => t.key), code,
      inRun: reqCases.some((t) => t.inRun),
      status: !prevScript ? 'new' : (changed ? 're-designed' : 'carried over'),
      version: !prevScript ? 1 : prevScript.version + (changed ? 1 : 0),
      previous: prevScript && changed ? { code: prevScript.code, version: prevScript.version } : null,
    });
  };

  for (const req of requirements) {
    const c = classify(req.text);
    const kind = kindOfReq(req);
    const candidates = candidateSpecs(req, c, ctx);
    if (!affected.has(req.id) && prevRules.has(req.id)) {
      const rule = { ...clone(prevRules.get(req.id)), status: 'carried over' };
      rules.push(rule);
      const kept = (previous.testCases || []).filter((t) => t.requirementId === req.id).map((tc) => ({
        ...clone(tc), status: 'carried over', labels: [...new Set([...tc.labels, 'regression'])], cycle: cycle.name,
        suite: suiteOf(tc), inRun: inRun(tt, { suite: suiteOf(tc), kind: tc.kind, slot: tc.slot }, { carried: true }),
      }));
      const have = new Set(kept.map((t) => t.slot));
      const add = candidates.filter((s) => !have.has(s.slot) && wants(s, kind) && !s.manual);
      const prevScript = prevScripts.get(req.id);
      if (!add.length) {
        testCases.push(...kept);
        if (prevScript) scripts.push({ ...clone(prevScript), status: 'carried over', inRun: kept.some((t) => t.inRun && t.automation === 'Automated') });
        continue;
      }
      const scriptFile = prevScript?.file || `${rule.id.toLowerCase()}-${c.entry.kind}.spec.js`;
      const added = add.map((s) => ({ ...designCase(req, c, s, rule.id, scriptFile, null), status: 'added' }));
      const bySlot = new Map(candidates.map((s) => [s.slot, s]));
      const keptWithCode = kept.map((t) => ({ ...t, code: t.automation === 'Automated' && bySlot.get(t.slot) ? bySlot.get(t.slot).code() : null }));
      testCases.push(...kept, ...added.map(({ code, ...rest }) => rest));
      writeScript(req, rule, scriptFile, [...keptWithCode.filter((t) => t.code), ...added], prevScript);
      continue;
    }
    const redesign = Boolean(previous && prevRules.has(req.id));
    const prevRule = prevRules.get(req.id);
    let ruleId = prevRule?.id;
    if (!ruleId) { counters.rule += 1; ruleId = `BR-${pad(counters.rule)}`; }
    const rule = { ...buildRule(req, ruleId, cycle), designedWith: used('requirements'), status: redesign ? 're-designed' : 'new', version: redesign ? prevRule.version + 1 : 1,
      previous: redesign ? { statement: prevRule.statement, parameters: prevRule.parameters, version: prevRule.version } : null };
    rules.push(rule);

    const specs = candidates.filter((s) => wants(s, kind) || prevCases.has(`${req.id}|${s.slot}`));
    const scriptFile = c && specs.some((s) => !s.manual) ? `${ruleId.toLowerCase()}-${c.entry.kind}.spec.js` : null;
    const reqCases = specs.map((s) => designCase(req, c, s, ruleId, scriptFile, prevCases.get(`${req.id}|${s.slot}`)));
    testCases.push(...reqCases.map(({ code, ...rest }) => rest));
    if (scriptFile) writeScript(req, rule, scriptFile, reqCases.filter((t) => t.code), prevScripts.get(req.id));
  }
  return { rules, testCases, scripts, affected: [...affected], selection: selectionSummary(tt, requirements, testCases, previous, dom) };
}

/** A manual test case from an AI-suggested scenario, traced to its requirement and rule like any designed case. */
function aiTestCase(req, s, { cycle, counters, rule = null, testingType = cycle.testingType }) {
  const tt = getTestingType(testingType, domainOf(cycle).id);
  const nf = req.type === 'non-functional';
  counters[nf ? 'caseN' : 'caseF'] = (counters[nf ? 'caseN' : 'caseF'] || 0) + 1;
  const suite = nf ? 'nfr' : 'api';
  return {
    key: `TC-${nf ? 'N' : 'F'}-${pad(counters[nf ? 'caseN' : 'caseF'])}`, requirementId: req.id, ruleId: rule ? rule.id : null, slot: `ai-${s.scenario}`, kind: 'unclassified', suite,
    name: s.name, objective: s.objective, precondition: 'Access to the system under test.', steps: s.steps, testData: 'n/a', expected: s.expected,
    priority: 'Low', type: req.type, labels: [...caseLabels(req.type, suite, 'unclassified', 'manual', false, tt), 'ai-suggested', s.scenario],
    automation: 'Not automated', scriptFile: null, issueLinks: req.jiraKeys, sourceRefs: sourceRefs(req), cycle: cycle.name, designedWith: [], designedFor: tt.id,
    inRun: inRun(tt, { suite, kind: 'unclassified', slot: 'manual' }), status: 'new', version: 1, previous: null, revisionNote: null, ui: false, varies: [],
    origin: 'ai', ai: { by: s.by, scenario: s.scenario, status: 'AI-suggested: review before relying on it' },
    automationNote: 'AI-suggested scenario: designed as a manual case',
  };
}

/** What the type of testing selected, reused and left out, and the gaps it leaves. */
function selectionSummary(tt, requirements, testCases, previous, dom = DOMAINS.commission) {
  const run = testCases.filter((t) => t.inRun);
  const coveredInRun = new Set(run.map((t) => t.requirementId));
  const outOfScope = requirements.filter((r) => !coveredInRun.has(r.id)).map((r) => r.id);
  const gaps = [];
  if (tt.ids.includes('performance') && !run.some((t) => ['nfr', 'load'].includes(t.suite))) {
    gaps.push({ kind: 'no-performance-target', severity: 'high',
      message: 'The inputs state no response-time target, so no performance case was designed. Add a target (e.g. "p95 within 300 ms") to the epic or the codebase README.' });
  }
  if (tt.ids.includes('e2e') && !run.some((t) => t.suite === 'ui')) {
    gaps.push({ kind: 'no-ui-requirement', severity: 'medium',
      message: dom.gaps.e2eNoUi });
  }
  if (!run.length && !tt.ids.includes('performance')) gaps.push({ kind: 'nothing-to-run', severity: 'high', message: `The inputs give ${tt.name.toLowerCase()} nothing to run.` });
  return {
    testingType: tt.id,
    name: tt.name,
    focus: tt.focus,
    approach: previous ? tt.incremental : tt.baseline,
    designed: testCases.length,
    inRun: run.length,
    automatedInRun: run.filter((t) => t.automation === 'Automated').length,
    reused: run.filter((t) => t.status === 'carried over').length,
    redesigned: run.filter((t) => t.status === 're-designed').length,
    added: run.filter((t) => ['new', 'added'].includes(t.status)).length,
    notInRun: testCases.length - run.length,
    bySuite: Object.fromEntries(['api', 'ui', 'journey', 'nfr', 'load'].map((x) => [x, run.filter((t) => t.suite === x).length])),
    outOfScope,
    gaps,
  };
}

function revision(prev, s) {
  const changed = ['name', 'expected', 'testData'].filter((f) => prev[f] !== s[f]);
  if (!changed.length) return 're-designed because a rule it depends on changed; case text unchanged';
  return changed.map((f) => `${f} was "${prev[f]}"`).join('; ');
}

function renderSpec(req, cases, { rule, skills = [], testingType = null, dom = DOMAINS.commission } = {}) {
  const tests = cases.map((tc) => `test(${JSON.stringify(`${tc.key} ${tc.name}`)}, async ({ ${tc.ui ? 'page, request' : 'request'} }, testInfo) => {
${tc.code}
});`).join('\n\n');
  const block = [
    'Generated by Agentic QE Platform - MVP (automation script agent).',
    `Business rule: ${rule.id} - ${rule.title}`,
    ...(testingType ? [`Type of testing: ${testingType.name}`] : []),
    `Statement: ${rule.statement}`,
    `Requirement: ${req.id} v${req.version}; sources: ${sourceRefs(req).join(', ')}`,
    `Covers test cases: ${cases.map((t) => `${t.key} (${t.name})`).join('; ')}`,
    ...(req.previous ? [`Superseded (v${req.previous.version}): ${req.previous.text}`] : []),
    ...(skills.length ? [`Skills applied: ${skills.join(', ')}`] : []),
  ];
  return `${block.map((l) => `// ${l}`).join('\n')}
// Self-contained: needs only @playwright/test and ${dom.id === 'hotel' ? 'the hotel service URLs (config metadata.services)' : 'a baseURL pointing at the system under test'}.
const { test, expect } = require('@playwright/test');

${dom.SPEC_PRELUDE}

${tests}
`;
}

module.exports = { requirementsAgentBaseline, requirementsAgentIncremental, designAgents, attachBusinessRules, affectedRequirementIds, renderSpec, aiTestCase, selectionSummary };
