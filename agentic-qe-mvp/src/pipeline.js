'use strict';
// Cycle orchestration. Flow 1 (baseline) and Flow 2 (incremental) with human gates.
const path = require('path');
const { loadInputs } = require('./inputs');
const { normalise, applyReview } = require('./normalise');
const { classifyDelta } = require('./delta');
const design = require('./agents/design');
const { executeSuite, summarise } = require('./execution');
const { raiseDefects } = require('./defects');
const { raiseDefectsInJira } = require('./connectors/jira-defects');
const { cycleJiraItems } = require('./traceability');
const { computeCoverage } = require('./coverage');
const { DEFAULT_BUILD, BUILDS, ENGINE_DIR } = require('../sut/server');
const { isHotelBranch, domainOf } = require('./agents/domains');
const { BRANCHES } = require('./connectors/codebase');

const hotelDictionary = (branch) => path.join(__dirname, '..', 'fixtures', 'github', BRANCHES[branch].dir, 'contents', 'data-dictionary', 'booking-attributes.json.json');
const decodeContents = (c) => Buffer.from(c.content.replace(/\n/g, ''), c.encoding || 'base64').toString('utf8');
const fs = require('fs');
const { buildCycleReport, collectHandovers } = require('./report');
const { compareCycles } = require('./compare');
const { testCasesExport } = require('./excel');
const { agentContext, checkHandover, selectSkills } = require('./skills');
const { producedBy } = require('./handover');
const { reviewInputs } = require('./agents/review');
const { getTestingType } = require('./testing-types');
const { testDataAgent, dataSetFile } = require('./agents/testdata');
const { AiSession } = require('./ai');
const ai = require('./agents/ai');
const learning = require('./learning');
const { extractContract, checkEndpoints } = require('./contracts');
const { checkDraft } = require('./agents/ai');

const DICTIONARY_FILE = 'inputs/data-dictionary.json';

const clone = (x) => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();

const PHASES = {
  baseline: ['ingest', 'normalise', 'review-agent', 'review', 'requirements', 'testcases', 'testdata', 'scripts', 'execution', 'defects', 'report'],
  incremental: ['ingest', 'normalise', 'review-agent', 'review', 'delta', 'requirements', 'testcases', 'testdata', 'scripts', 'merge-approval', 'execution', 'defects', 'report'],
};
const PHASE_LABEL = {
  ingest: 'Ingest inputs', normalise: 'Normalise (3-way compare)', review: 'Human review of requirement set', delta: 'Delta classification',
  requirements: 'Requirements agent (requirements with their business rules)', testcases: 'Test case agent', testdata: 'Test data agent', scripts: 'Automation script agent',
  'merge-approval': 'Human approval to merge', execution: 'Execution agent (Playwright, real run)', defects: 'Defect agent', report: 'Cycle report agent',
};

function setPhase(cycle, name, status, summary) {
  const p = cycle.phases.find((x) => x.name === name);
  if (!p) return;
  if (status === 'running') p.startedAt = now();
  if (['done', 'failed', 'skipped'].includes(status)) p.finishedAt = now();
  p.status = status;
  if (summary !== undefined) p.summary = summary;
}

/** Execution record when the type of testing leaves nothing automated to run: nothing is faked. */
function noAutomatedRun(runCases, cycle) {
  const results = runCases.map((t) => ({ key: t.key, requirementId: t.requirementId, ruleId: t.ruleId || null, name: t.name, type: t.type, scriptFile: null,
    status: 'not-run', reason: 'Manual test case - not automated, not executed', duration: 0, error: null, evidence: [] }));
  const at = now();
  return { executed: false, tool: 'Playwright not started: no automated case in this run', sut: { build: cycle.sutBuild }, startedAt: at, finishedAt: at,
    specFiles: [], results, summary: summarise(results) };
}

class Pipeline {
  constructor(store, { env = process.env, skills = [], fetchImpl = globalThis.fetch } = {}) {
    this.store = store;
    this.env = env;
    this.skills = skills;
    this.fetchImpl = fetchImpl;
    this.running = new Map();
  }

  /** Marks cycles that were mid-run when the process stopped; they can be resumed. */
  recover() {
    for (const c of this.store.listCycles()) {
      if (c.status === 'running') {
        c.status = 'interrupted';
        c.note = 'The server restarted while this cycle was running. Use Resume to re-run the remaining phases.';
        this.store.saveCycle(c);
      }
    }
  }

  /** The data dictionary the codebase input carried; the build's own copy only for cycles recorded before it was kept. */
  dictionaryOf(cycle) {
    const file = path.join(this.store.runDir(cycle.id), DICTIONARY_FILE);
    if (cycle.dataDictionary && fs.existsSync(file)) return { dictionary: JSON.parse(fs.readFileSync(file, 'utf8')), source: cycle.dataDictionary.source || 'codebase input' };
    if (isHotelBranch(cycle.sutBuild)) {
      const file = hotelDictionary(cycle.sutBuild);
      if (!fs.existsSync(file)) throw httpError(409, `Build ${cycle.sutBuild} has no data dictionary, so no test data can be generated for it.`);
      return { dictionary: JSON.parse(decodeContents(JSON.parse(fs.readFileSync(file, 'utf8')))), source: `data dictionary of build ${cycle.sutBuild}` };
    }
    if (!BUILDS[cycle.sutBuild] && cycle.sutBuild !== undefined && cycle.sutBuild !== null) {
      throw httpError(409, `Build ${cycle.sutBuild} has no data dictionary in its codebase input, so no test data can be generated for it.`);
    }
    const own = path.join(ENGINE_DIR, BUILDS[cycle.sutBuild] || BUILDS[DEFAULT_BUILD], 'data-dictionary', 'reservation-attributes.json');
    return { dictionary: JSON.parse(fs.readFileSync(own, 'utf8')), source: `data dictionary of build ${cycle.sutBuild}` };
  }

  /** Writes the test data agent's data sets where the generated specs load them (test-data/<case key>.json). */
  writeTestData(cycle, cases) {
    const dir = path.join(this.store.runDir(cycle.id), 'test-data');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const { dictionary } = this.dictionaryOf(cycle);
    const keys = new Set(cases.map((t) => t.key));
    for (const d of cycle.artifacts.testData || []) {
      if (keys.has(d.testCaseKey)) fs.writeFileSync(path.join(dir, `${d.testCaseKey}.json`), `${JSON.stringify(dataSetFile(d, dictionary), null, 2)}\n`);
    }
  }

  /** Endpoints declared by the cycle's codebase; AI-written specs may call only these. */
  contractOf(cycle) {
    const branch = cycle.inputs.find((i) => i.slot === 'codebase')?.branch || cycle.sutBuild;
    return BRANCHES[branch] ? extractContract(path.join(__dirname, '..', 'fixtures', 'github', BRANCHES[branch].dir, 'contents')) : [];
  }

  /** Puts an AI-written, code-checked spec into the executed suite for a manual case; a QE accepted it. */
  promoteScript(cycle, a, t, body, { writtenBy, by, lesson }) {
    const file = `ai-${t.key.toLowerCase()}.spec.js`;
    const code = `// AI-generated by ${writtenBy}; compiled and checked against the API contract in code; accepted by ${by}.
// Test case ${t.key} (${t.name}), requirement ${t.requirementId}. Failures need QE confirmation before they block a release.
const { test, expect } = require('@playwright/test');

${domainOf(cycle).SPEC_PRELUDE}

test(${JSON.stringify(`${t.key} ${t.name}`)}, async ({ request, page }, testInfo) => {
${body}
});
`;
    a.scripts = [...a.scripts.filter((x) => x.file !== file), { file, requirementId: t.requirementId, ruleId: t.ruleId, covers: [t.key], code, version: 1, origin: 'ai', status: 'new', inRun: t.inRun !== false, designedWith: [], acceptedBy: by, writtenBy, lesson }];
    t.automation = 'Automated';
    t.scriptFile = file;
    t.scriptOrigin = 'ai';
    t.automationNote = lesson;
    return file;
  }

  /** Scripts people accepted in earlier cycles are re-checked and run for the same case in this one. */
  promoteLearnedScripts(cycle, requirements, out) {
    const memory = this.store.getLearning();
    if (!memory.feedback.some((f) => f.target === 'script' && f.verdict === 'accept')) return [];
    const contract = this.contractOf(cycle);
    const reqText = new Map(requirements.map((r) => [r.id, r.text]));
    const applied = [];
    for (const t of out.testCases.filter((x) => x.automation !== 'Automated')) {
      const f = learning.acceptedScript(memory, reqText.get(t.requirementId), t.name);
      if (!f || checkDraft(f.body) || checkEndpoints(f.body, contract)) continue;
      const lesson = `AI script accepted by ${f.by} in ${f.cycleId}, re-checked against this codebase's API contract and run`;
      this.promoteScript(cycle, out, t, f.body, { writtenBy: f.writtenBy || 'AI', by: f.by, lesson });
      applied.push({ kind: 'script', testCaseKey: t.key, lesson: `${t.key}: ${lesson}` });
    }
    return applied;
  }

  /** The cycle's model session; its call log and reply cache persist on cycle.ai. */
  aiFor(cycle) {
    const session = new AiSession({ env: this.env, fetchImpl: this.fetchImpl, state: cycle.ai || null });
    cycle.ai = session.state;
    return session;
  }

  /** Hands an agent the bodies of the skills that target it, and records which ones it saw. */
  skillContext(cycle, agentId) {
    const ctx = agentContext(cycle.skills, agentId);
    const p = cycle.phases.find((x) => x.name === agentId);
    if (p) p.skills = ctx.skills.map((x) => x.id);
    const learned = learning.guidance(this.store.getLearning());
    return learned ? { ...ctx, guidance: [ctx.guidance, learned].filter(Boolean).join('\n\n'), learned: true } : ctx;
  }

  /** Checks what the phase actually produced against the artefacts its skills say it owes. */
  handover(cycle, agentId) {
    const p = cycle.phases.find((x) => x.name === agentId);
    const h = checkHandover(agentId, producedBy(agentId, cycle), cycle.skills);
    if (p) p.handover = h;
    return h;
  }

  async startCycle({ type = 'baseline', name, baselineId, inputs = {}, sutBuild, reviewer, skills, testingType, testingTypes }) {
    if (!['baseline', 'incremental'].includes(type)) throw httpError(400, 'type must be "baseline" or "incremental"');
    let tt;
    try { tt = getTestingType(testingTypes ?? testingType); } catch (e) { throw httpError(400, e.message, [{ field: 'testingType', message: e.message }]); }
    let activeSkills;
    try { activeSkills = selectSkills(this.skills, skills, tt.ids); } catch (e) { throw httpError(400, e.message); }
    let baseline = null;
    if (type === 'incremental') {
      baseline = this.store.getBaseline(baselineId);
      if (!baseline) throw httpError(400, 'Pick an existing approved baseline for an incremental cycle');
    }
    const slots = type === 'baseline' ? ['initiative', 'epic', 'codebase'] : ['epic', 'codebase'];
    const loaded = await loadInputs(inputs, slots, { env: this.env });
    if (!loaded.length) throw httpError(400, 'Provide at least one input');
    const id = this.store.nextId('nextCycle', 'CYC');
    const n = Number(id.slice(4));
    const codebase = loaded.find((i) => i.slot === 'codebase');
    const statements = loaded.flatMap((i) => i.statements);
    const normalisation = normalise(statements);
    const cycle = {
      id,
      name: name || `Cycle ${n} - ${type === 'baseline' ? 'Baseline' : 'Incremental'}`,
      type,
      testingType: tt.id,
      testingTypes: tt.ids,
      testingTypeName: tt.name,
      status: 'awaiting-review',
      createdAt: now(),
      createdBy: reviewer || null,
      baselineId: baseline ? baseline.id : null,
      baselineVersionAtStart: baseline ? baseline.version : null,
      sutBuild: sutBuild || codebase?.branch || DEFAULT_BUILD,
      inputs: loaded.map(({ statements: s, dictionary: _d, ...rest }) => ({ ...rest, statementCount: s.length })),
      dataDictionary: codebase?.dictionary ? { file: DICTIONARY_FILE, source: codebase.dataModel?.url || null, name: codebase.dictionary.name, version: codebase.dictionary.version, attributeCount: codebase.dictionary.attributes.length } : null,
      normalisation,
      skills: activeSkills,
      phases: PHASES[type].map((p) => ({ name: p, label: PHASE_LABEL[p], status: 'pending' })),
      approvals: [],
      artifacts: {},
    };
    if (codebase?.dictionary) {
      const file = path.join(this.store.runDir(id), DICTIONARY_FILE);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(codebase.dictionary));
    }
    setPhase(cycle, 'ingest', 'done', `${loaded.length} input(s), ${statements.length} statements`);
    const session = this.aiFor(cycle);
    const matched = await ai.aiMatchStatements(normalisation, session, { guidance: this.skillContext(cycle, 'normalise').guidance });
    cycle.normalisation = matched.normalisation;
    cycle.learned = { review: learning.reviewLessons(this.store.getLearning(), cycle.normalisation), design: [], suppressed: [], defects: [] };
    const nc = cycle.normalisation.counts;
    this.handover(cycle, 'normalise');
    setPhase(cycle, 'normalise', 'done', `${nc.agreed} agreed · ${nc['jira-only']} Jira only · ${nc['code-only']} code only · ${nc.conflict} conflicts${nc.aiMatched ? ` · ${nc.aiMatched} Jira/code pair(s) matched by AI` : ''}`);
    if (baseline) cycle.deltaPreview = this.previewDelta(cycle, {}, baseline);
    const reviewCtx = this.skillContext(cycle, 'review-agent');
    cycle.reviewAgent = reviewInputs({ normalisation: cycle.normalisation, inputs: cycle.inputs, testingType: tt.id, deltaPreview: cycle.deltaPreview || null, baseline });
    const aiFindings = await ai.aiReviewFindings(cycle.normalisation, session, { guidance: reviewCtx.guidance });
    if (aiFindings.length) {
      const ra = cycle.reviewAgent;
      ra.findings = [...ra.findings, ...aiFindings].map((f, i) => ({ ...f, id: `RA-${String(i + 1).padStart(2, '0')}` }));
      ra.counts = { ...ra.counts, ai: ra.findings.filter((f) => f.category === 'ai').length, high: ra.findings.filter((f) => f.severity === 'high').length };
    }
    this.handover(cycle, 'review-agent');
    const rc = cycle.reviewAgent.counts;
    setPhase(cycle, 'review-agent', 'done', `${rc.added} added · ${rc.missing} missing · ${rc.conflicts} conflicts${rc.ai ? ` · ${rc.ai} AI finding(s)` : ''} suggested for the reviewer`);
    setPhase(cycle, 'review', 'waiting');
    return this.store.saveCycle(cycle);
  }

  /** Delta split before anything is designed (conflicts not yet resolved are listed separately). */
  previewDelta(cycle, decisions = {}, baseline = this.store.getBaseline(cycle.baselineId)) {
    const excluded = decisions.excluded || [];
    const resolutions = decisions.resolutions || {};
    const pending = cycle.normalisation.groups.filter((g) => g.bucket === 'conflict' && !excluded.includes(g.id) && !resolutions[g.id]).map((g) => g.id);
    const reviewed = applyReview(cycle.normalisation, { excluded: [...excluded, ...pending], resolutions });
    return { ...classifyDelta(baseline.requirements, reviewed), pendingConflicts: pending };
  }

  review(cycleId, { reviewer, excluded = [], resolutions = {}, comment = '' }) {
    const cycle = this.mustGet(cycleId);
    if (cycle.status === 'awaiting-merge') {
      throw httpError(409, `The requirement set of ${cycle.id} is already approved. The step still open is the merge into baseline ${cycle.baselineId}: approve it on the merge screen.`, [{ gate: 'merge' }]);
    }
    if (cycle.status !== 'awaiting-review') throw httpError(409, `Cycle is ${cycle.status}, not awaiting review`);
    const open = cycle.normalisation.groups.filter((g) => g.bucket === 'conflict' && !excluded.includes(g.id) && !resolutions[g.id]);
    const missing = [
      ...(!reviewer || !String(reviewer).trim() ? [{ field: 'reviewer', message: 'Reviewer name is required: every approval is recorded against a person' }] : []),
      ...open.map((g) => ({ group: g.id, message: `Conflict ${g.id} needs a decision (${g.options.map((o) => `${o.sources.join('/')} says ${o.signature}`).join(', ')}): choose a value or exclude it` })),
    ];
    if (missing.length) {
      const head = open.length ? `Unresolved conflicts: ${open.map((g) => g.id).join(', ')}. ` : '';
      throw httpError(400, `${head}Cannot approve the requirement set yet: ${missing.map((m) => m.message).join('; ')}`, missing);
    }
    let reviewed;
    try {
      reviewed = applyReview(cycle.normalisation, { excluded, resolutions });
    } catch (e) {
      throw httpError(400, e.message);
    }
    cycle.review = { reviewer, at: now(), excluded, resolutions, comment };
    cycle.reviewed = reviewed;
    if (cycle.learned) {
      const lr = cycle.learned.review;
      lr.kept = lr.resolutions.filter((x) => resolutions[x.groupId] === x.optionId).length + lr.exclusions.filter((x) => excluded.includes(x.groupId)).length;
      lr.overridden = lr.resolutions.length + lr.exclusions.length - lr.kept;
    }
    const memory = this.store.getLearning();
    learning.recordReview(memory, cycle);
    this.store.saveLearning(memory);
    cycle.approvals.push({ gate: 'Requirement set review', by: reviewer, at: cycle.review.at, decision: 'approved', comment,
      detail: `${reviewed.length} requirements approved; ${excluded.length} excluded; ${Object.keys(resolutions).length} conflict(s) resolved` });
    setPhase(cycle, 'review', 'done', `Approved by ${reviewer}`);
    cycle.status = 'running';
    this.store.saveCycle(cycle);
    return this.track(cycle.id, cycle.type === 'baseline' ? this.runBaseline(cycle.id) : this.runIncrementalDesign(cycle.id));
  }

  track(id, promise) {
    const p = promise.catch((e) => {
      const c = this.store.getCycle(id);
      c.status = 'failed';
      c.error = e.message;
      const running = c.phases.find((x) => x.status === 'running');
      if (running) setPhase(c, running.name, 'failed', e.message);
      this.store.saveCycle(c);
    }).finally(() => this.running.delete(id));
    this.running.set(id, p);
    return { cycle: this.store.getCycle(id), done: p };
  }

  /**
   * The AI step of the design agents (1-4), asked once per cycle: suggestions are kept on cycle.aiDesign and applied by
   * runDesignPhases, so a re-design (rows rejected at the merge gate) re-uses them without asking the model again.
   */
  async aiDesignStep(cycle, requirements, previous) {
    const session = this.aiFor(cycle);
    if (!session.enabled) return;
    const skills = Object.fromEntries(['requirements', 'testcases', 'testdata', 'scripts'].map((a) => [a, this.skillContext(cycle, a)]));
    const probe = design.designAgents(requirements, { cycle, counters: clone(cycle.counters), previous, skills, testingType: cycle.testingType });
    design.attachBusinessRules(requirements, probe.rules);
    const only = previous ? new Set(requirements.filter((r) => ['new', 'enhanced'].includes(r.status)).map((r) => r.id)) : null;
    await ai.aiDescribeRequirements(requirements, session, { guidance: skills.requirements.guidance, only });
    const cases = await ai.aiSuggestTestCases(requirements, probe.testCases, session, { guidance: skills.testcases.guidance, only });
    const personas = await ai.aiPersonas(this.dictionaryOf(cycle).dictionary, session, { guidance: skills.testdata.guidance });
    const scripts = await ai.aiDraftScripts(probe.testCases, requirements, probe.scripts, session, { guidance: skills.scripts.guidance, dom: domainOf(cycle), only, contract: this.contractOf(cycle) });
    const textOf = new Map(requirements.map((r) => [r.id, r.text]));
    cycle.aiDesign = {
      requirements: Object.fromEntries(requirements.filter((r) => r.ai && (!only || only.has(r.id))).map((r) => [`${r.id}|${r.text}`, r.ai])),
      cases: cases.map((c) => ({ ...c, by: session.label, requirementText: textOf.get(c.requirementId) })),
      personas,
      scripts,
    };
  }

  /** Puts the AI suggestions of cycle.aiDesign on the rule-based design; a suggestion for a requirement whose text changed is dropped. */
  applyAiDesign(cycle, requirements, out) {
    const d = cycle.aiDesign;
    if (!d) return;
    for (const r of requirements) { const x = d.requirements[`${r.id}|${r.text}`]; if (x) r.ai = x; }
    const reqById = new Map(requirements.map((r) => [r.id, r]));
    const ruleByReq = new Map(out.rules.map((b) => [b.requirementId, b]));
    const extra = new Map();
    const memory = this.store.getLearning();
    const suppressed = [];
    for (const s of d.cases) {
      const req = reqById.get(s.requirementId);
      if (!req || req.text !== s.requirementText) continue;
      const was = learning.rejectedBefore(memory, 'testcase', req.text, s.name);
      if (was) { suppressed.push({ requirementId: req.id, name: s.name, lesson: `Not suggested again: ${was.by} rejected "${was.text}" in ${was.cycleId}${was.note ? ` (${was.note})` : ''}` }); continue; }
      if (!extra.has(req.id)) extra.set(req.id, []);
      extra.get(req.id).push(design.aiTestCase(req, s, { cycle, counters: cycle.counters, rule: ruleByReq.get(req.id) }));
    }
    if (extra.size) {
      const lastOf = new Map();
      out.testCases.forEach((t, i) => lastOf.set(t.requirementId, i));
      const merged = [];
      out.testCases.forEach((t, i) => { merged.push(t); if (lastOf.get(t.requirementId) === i && extra.has(t.requirementId)) { merged.push(...extra.get(t.requirementId)); extra.delete(t.requirementId); } });
      for (const xs of extra.values()) merged.push(...xs);
      out.testCases = merged;
    }
    const keys = new Set(out.testCases.map((t) => t.key));
    const drafts = (d.scripts || []).filter((x) => keys.has(x.caseKey));
    for (const x of drafts) out.testCases.find((t) => t.key === x.caseKey).aiDraft = x.file;
    out.aiScripts = drafts;
    if (cycle.learned) cycle.learned.suppressed = suppressed;
  }

  runDesignPhases(cycle, requirements, previous) {
    const counters = cycle.counters;
    const skills = Object.fromEntries(['requirements', 'testcases', 'testdata', 'scripts'].map((a) => [a, this.skillContext(cycle, a)]));
    const out = design.designAgents(requirements, { cycle, counters, previous, skills, testingType: cycle.testingType });
    design.attachBusinessRules(requirements, out.rules);
    this.applyAiDesign(cycle, requirements, out);
    if (cycle.learned) cycle.learned.design = [...learning.applyToDesign(this.store.getLearning(), requirements, out.testCases), ...this.promoteLearnedScripts(cycle, requirements, out)];
    if (cycle.aiDesign) out.selection = design.selectionSummary(getTestingType(cycle.testingType, domainOf(cycle).id), requirements, out.testCases, previous, domainOf(cycle));
    const count = (arr, st) => arr.filter((x) => x.status === st).length;
    const split = (arr) => (previous ? ` (${count(arr, 'new') + count(arr, 'added')} new · ${count(arr, 're-designed')} re-designed · ${count(arr, 'carried over')} carried over)` : '');
    const sel = out.selection;
    const scope = sel.notInRun ? ` · ${sel.inRun} in this ${sel.name.toLowerCase()} run` : '';
    const automatable = out.rules.filter((r) => r.executable).length;
    const aiNote = (n, what) => (n ? ` · ${n} ${what}` : '');
    const aiCases = out.testCases.filter((t) => t.origin === 'ai').length;
    const reqSplit = previous ? ` (${count(requirements, 'new')} new · ${count(requirements, 'enhanced')} enhanced · ${count(requirements, 'unchanged') + count(requirements, 'carried over')} unchanged)` : '';
    setPhase(cycle, 'requirements', 'done', `${requirements.length} requirements${reqSplit}, each with its business rule: ${automatable} automatable · ${out.rules.length - automatable} manual${aiNote(requirements.filter((r) => r.ai).length, 'described in plain language by AI')}`);
    setPhase(cycle, 'testcases', 'done', `${out.testCases.length} test cases${split(out.testCases)}${scope}${aiNote(aiCases, 'AI-suggested (manual)')}`);
    const dict = this.dictionaryOf(cycle);
    const td = testDataAgent(out.testCases, dict.dictionary, { previous: previous?.testData, source: dict.source, personas: cycle.aiDesign?.personas || null });
    const byCase = new Map(td.dataSets.map((d) => [d.testCaseKey, d.id]));
    for (const t of out.testCases) t.dataSet = byCase.get(t.key);
    const tds = td.summary;
    setPhase(cycle, 'testdata', 'done', `${tds.total} data sets of ${tds.dictionary.attributeCount} attributes · ${tds.conforming} conform to the data dictionary · ${tds.negative} deliberately invalid (negative tests)${tds.nonConforming ? ` · ${tds.nonConforming} do not conform` : ''}${previous ? ` (${tds.byStatus.new || 0} new · ${tds.byStatus['re-generated'] || 0} re-generated · ${tds.byStatus['carried over'] || 0} carried over)` : ''}${tds.ai ? ` · ${tds.ai.personas} AI personas` : ''}`);
    setPhase(cycle, 'scripts', 'done', `${out.scripts.length} Playwright specs${split(out.scripts)}${aiNote((out.aiScripts || []).length, 'AI draft spec(s) awaiting QE review, not executed')}`);
    cycle.artifacts = { ...cycle.artifacts, requirements, rules: out.rules, testCases: out.testCases, testData: td.dataSets, testDataSummary: tds, scripts: out.scripts, aiScripts: out.aiScripts || [], affected: out.affected, selection: out.selection };
    for (const a of ['requirements', 'testcases', 'testdata', 'scripts']) this.handover(cycle, a);
  }

  async runBaseline(cycleId) {
    const cycle = this.mustGet(cycleId);
    cycle.counters = { req: 0, rule: 0, caseF: 0, caseN: 0 };
    setPhase(cycle, 'requirements', 'running');
    const requirements = design.requirementsAgentBaseline(cycle.reviewed, { cycle, counters: cycle.counters });
    await this.aiDesignStep(cycle, requirements, null);
    this.runDesignPhases(cycle, requirements, null);
    this.store.saveCycle(cycle);
    await this.runExecutionPhases(cycle.id, { previousDefects: [] });
    const done = this.mustGet(cycleId);
    const bid = this.store.nextId('nextBaseline', 'BL');
    const baseline = {
      id: bid, name: `${done.inputs.find((i) => i.slot === 'epic')?.ref || 'Baseline'} baseline`, version: 1,
      createdAt: now(), sourceCycleId: done.id, cycles: [done.id], lastCycleId: done.id,
      requirements: done.artifacts.requirements, rules: done.artifacts.rules, testCases: done.artifacts.testCases, testData: done.artifacts.testData, scripts: done.artifacts.scripts,
      counters: done.counters,
      history: [{ version: 1, at: now(), cycleId: done.id, change: 'Baseline established', approvedBy: done.review.reviewer }],
    };
    this.store.saveBaseline(baseline);
    done.baselineId = bid;
    done.baselineVersionAfter = 1;
    done.status = 'completed';
    done.completedAt = now();
    this.store.saveCycle(done);
    await this.runReportPhase(done.id);
  }

  /** Report agent: test case export, comparison with the previous cycle (incremental), cycle report. */
  async runReportPhase(cycleId) {
    const cycle = this.mustGet(cycleId);
    setPhase(cycle, 'report', 'running');
    const ctx = this.skillContext(cycle, 'report');
    const dir = path.join(this.store.runDir(cycle.id), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const exp = await testCasesExport(cycle);
    const file = `${cycle.id}-test-cases.xlsx`;
    fs.writeFileSync(path.join(dir, file), exp.buffer);
    cycle.artifacts.exports = { ...(cycle.artifacts.exports || {}), testCases: { file: `exports/${file}`, columns: exp.columns, columnSource: exp.columnSource, rows: exp.rows, gaps: exp.gaps } };
    const prev = cycle.previousCycleId ? this.store.getCycle(cycle.previousCycleId) : null;
    if (cycle.type === 'incremental' && prev) {
      const cmp = compareCycles(prev, cycle);
      cycle.comparison = { a: cmp.a.id, b: cmp.b.id, generatedAt: cmp.generatedAt, requirements: cmp.requirements, testCases: cmp.testCases, scripts: cmp.scripts, execution: cmp.execution, defects: cmp.defects };
    }
    cycle.report = await buildCycleReport(cycle, { env: this.env, fetchImpl: this.fetchImpl, guidance: ctx.guidance, ai: this.aiFor(cycle) });
    setPhase(cycle, 'report', 'done', 'Report generated');
    const h = this.handover(cycle, 'report');
    cycle.report.handovers = collectHandovers(cycle);
    cycle.report.handoverStatus = cycle.report.handovers.some((x) => x.status === 'incomplete') ? 'incomplete' : 'complete';
    if (h.status === 'incomplete') cycle.phases.find((x) => x.name === 'report').summary += ` · hand-over incomplete (${h.missing.join(', ')})`;
    this.store.saveCycle(cycle);
  }

  async runIncrementalDesign(cycleId) {
    const cycle = this.mustGet(cycleId);
    const baseline = this.store.getBaseline(cycle.baselineId);
    setPhase(cycle, 'delta', 'running');
    this.skillContext(cycle, 'delta');
    const delta = classifyDelta(baseline.requirements, cycle.reviewed);
    cycle.delta = delta;
    this.handover(cycle, 'delta');
    setPhase(cycle, 'delta', 'done', delta.summary);
    cycle.counters = clone(baseline.counters);
    const requirements = design.requirementsAgentIncremental(baseline.requirements, delta, { cycle, counters: cycle.counters });
    await this.aiDesignStep(cycle, requirements, baseline);
    this.runDesignPhases(cycle, requirements, baseline);
    this.proposeMerge(cycle, baseline);
    setPhase(cycle, 'merge-approval', 'waiting');
    cycle.status = 'awaiting-merge';
    this.store.saveCycle(cycle);
  }

  proposeMerge(cycle, baseline) {
    const a = cycle.artifacts;
    cycle.mergeProposal = {
      baselineId: baseline.id,
      baselineVersion: baseline.version,
      requirements: a.requirements.filter((r) => ['new', 'enhanced'].includes(r.status)).map((r) => r.id),
      rules: a.rules.filter((r) => r.status !== 'carried over').map((r) => r.id),
      testCases: a.testCases.filter((t) => t.status !== 'carried over').map((t) => t.key),
      scripts: a.scripts.filter((s) => s.status !== 'carried over').map((s) => s.file),
    };
  }

  /**
   * Re-designs the addition without the rows the approver rejected: a rejected enhancement keeps the
   * baseline value, a rejected new requirement is dropped. Ids are unchanged (the id sequence is replayed).
   */
  withoutRejectedRows(cycle, baseline, rejected) {
    const items = cycle.delta.items
      .map((d) => (d.classification === 'enhanced' && rejected.includes(d.requirementId) ? { ...d, classification: 'unchanged', rejectedAtMerge: true } : d));
    cycle.counters = clone(baseline.counters);
    const requirements = design.requirementsAgentIncremental(baseline.requirements, { ...cycle.delta, items }, { cycle, counters: cycle.counters });
    this.runDesignPhases(cycle, requirements, baseline);
    const drop = new Set(rejected.filter((id) => !baseline.requirements.some((r) => r.id === id)));
    const a = cycle.artifacts;
    a.requirements = a.requirements.filter((r) => !drop.has(r.id));
    a.rules = a.rules.filter((r) => !drop.has(r.requirementId));
    a.testCases = a.testCases.filter((t) => !drop.has(t.requirementId));
    a.testData = a.testData.filter((d) => !drop.has(d.requirementId));
    a.scripts = a.scripts.filter((x) => !drop.has(x.requirementId));
    a.aiScripts = (a.aiScripts || []).filter((x) => !drop.has(x.requirementId));
    for (const x of ['requirements', 'testcases', 'testdata', 'scripts']) this.handover(cycle, x);
    this.proposeMerge(cycle, baseline);
  }

  decideMerge(cycleId, { decision, approver, comment = '', rejectedRows = [] }) {
    const cycle = this.mustGet(cycleId);
    if (cycle.status === 'awaiting-review') {
      throw httpError(409, `Approve the requirement set first: ${cycle.id} is still waiting at the review stage. The merge into baseline ${cycle.baselineId} comes after the design agents have run.`, [{ gate: 'review' }]);
    }
    if (cycle.status !== 'awaiting-merge') throw httpError(409, `Cycle is ${cycle.status}, not awaiting merge approval`);
    if (!approver || !String(approver).trim()) throw httpError(400, 'Approver name is required: every merge into the baseline is recorded against a person', [{ field: 'approver', message: 'Approver name is required' }]);
    if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'decision must be "approve" or "reject"');
    const baseline = this.store.getBaseline(cycle.baselineId);
    const at = now();
    if (decision === 'reject') {
      cycle.approvals.push({ gate: 'Merge into baseline', by: approver, at, decision: 'rejected', comment, detail: `Baseline ${baseline.id} v${baseline.version} left untouched` });
      setPhase(cycle, 'merge-approval', 'done', `Rejected by ${approver}`);
      for (const p of ['execution', 'defects', 'report']) setPhase(cycle, p, 'skipped', 'Merge rejected');
      cycle.status = 'rejected';
      this.store.saveCycle(cycle);
      return { cycle, done: Promise.resolve() };
    }
    if (baseline.version !== cycle.mergeProposal.baselineVersion) throw httpError(409, 'Baseline changed since this delta was designed; start a new incremental cycle');
    const rejected = [].concat(rejectedRows || []);
    const unknown = rejected.filter((id) => !cycle.mergeProposal.requirements.includes(id));
    if (unknown.length) throw httpError(400, `Not a row of this merge: ${unknown.join(', ')}`);
    if (rejected.length && rejected.length === cycle.mergeProposal.requirements.length) throw httpError(400, 'Every row is rejected - reject the whole merge instead');
    if (rejected.length) {
      const memory = this.store.getLearning();
      learning.recordMergeRejections(memory, cycle, rejected, approver);
      this.store.saveLearning(memory);
      cycle.rejectedRows = rejected;
      this.withoutRejectedRows(cycle, baseline, rejected);
    }
    const a = cycle.artifacts;
    const previousVersion = baseline.version;
    const merged = {
      ...baseline,
      version: baseline.version + 1,
      requirements: a.requirements, rules: a.rules, testCases: a.testCases, testData: a.testData, scripts: a.scripts,
      counters: cycle.counters,
      cycles: [...baseline.cycles, cycle.id],
      history: [...baseline.history, { version: baseline.version + 1, at, cycleId: cycle.id, change: cycle.delta.summary, approvedBy: approver }],
    };
    const lastCycle = this.store.getCycle(baseline.lastCycleId);
    const previousDefects = lastCycle?.artifacts?.defects || [];
    cycle.baselineJiraItems = lastCycle ? [...cycleJiraItems(lastCycle).values()].map(({ fromBaseline, ...x }) => x) : [];
    merged.lastCycleId = cycle.id;
    this.store.saveBaseline(merged);
    cycle.approvals.push({ gate: 'Merge into baseline', by: approver, at, decision: 'approved', comment,
      detail: `${cycle.mergeProposal.requirements.length} requirements, ${cycle.mergeProposal.testCases.length} test cases, ${cycle.mergeProposal.scripts.length} scripts merged: ${baseline.id} v${previousVersion} -> v${merged.version}${rejected.length ? `; rows rejected at the gate: ${rejected.join(', ')}` : ''}` });
    cycle.previousCycleId = baseline.lastCycleId;
    cycle.baselineVersionAfter = merged.version;
    setPhase(cycle, 'merge-approval', 'done', `Approved by ${approver}; ${baseline.id} is now v${merged.version}`);
    cycle.status = 'running';
    this.store.saveCycle(cycle);
    return this.track(cycle.id, this.finishIncremental(cycle.id, previousDefects));
  }

  async finishIncremental(cycleId, previousDefects) {
    await this.runExecutionPhases(cycleId, { previousDefects });
    const c = this.mustGet(cycleId);
    c.status = 'completed';
    c.completedAt = now();
    this.store.saveCycle(c);
    await this.runReportPhase(cycleId);
  }

  async runExecutionPhases(cycleId, { previousDefects }) {
    let cycle = this.mustGet(cycleId);
    setPhase(cycle, 'execution', 'running');
    this.skillContext(cycle, 'execution');
    this.store.saveCycle(cycle);
    const runCases = cycle.artifacts.testCases.filter((t) => t.inRun !== false);
    const runKeys = runCases.filter((t) => t.automation === 'Automated').map((t) => t.key);
    const partial = runCases.length !== cycle.artifacts.testCases.length;
    this.writeTestData(cycle, runCases);
    const execution = runKeys.length ? await executeSuite({
      scripts: cycle.artifacts.scripts.filter((x) => x.covers.some((k) => runKeys.includes(k))), testCases: runCases,
      runDir: this.store.runDir(cycle.id), sutBuild: cycle.sutBuild, keys: partial ? runKeys : null,
    }) : noAutomatedRun(runCases, cycle);
    execution.testingType = cycle.testingType;
    execution.notInRun = cycle.artifacts.testCases.length - runCases.length;
    cycle = this.mustGet(cycleId);
    const session = this.aiFor(cycle);
    await ai.aiTriageFailures(execution, cycle.artifacts.testCases, cycle.artifacts.requirements, session, { guidance: this.skillContext(cycle, 'execution').guidance });
    cycle.artifacts.execution = execution;
    this.handover(cycle, 'execution');
    const triaged = execution.results.filter((r) => r.aiTriage).length;
    const s = execution.summary;
    setPhase(cycle, 'execution', 'done', `${s.executed} executed · ${s.passed} passed · ${s.failed} failed · ${s.notRun} not run (manual)${execution.notInRun ? ` · ${execution.notInRun} kept in the pack, outside this run` : ''}${triaged ? ` · ${triaged} failure(s) triaged by AI` : ''}`);
    setPhase(cycle, 'defects', 'running');
    const defectCtx = this.skillContext(cycle, 'defects');
    const { defects, resolved, nextNo } = raiseDefects({
      execution, testCases: cycle.artifacts.testCases, requirements: cycle.artifacts.requirements, cycle,
      previousDefects, startNo: this.store.meta().nextDefect,
    });
    this.store.bumpDefectCounter(nextNo);
    const triageOf = new Map(execution.results.filter((r) => r.aiTriage).map((r) => [r.key, r.aiTriage]));
    for (const d of defects) if (triageOf.has(d.testCaseKey)) d.aiTriage = triageOf.get(d.testCaseKey);
    await ai.aiDescribeDefects(defects, cycle.artifacts.testCases, session, { guidance: defectCtx.guidance });
    const caseOf = new Map(cycle.artifacts.testCases.map((t) => [t.key, t]));
    for (const d of defects) {
      const t = caseOf.get(d.testCaseKey);
      const reason = t?.needsConfirmation || (t?.origin === 'ai' || t?.scriptOrigin === 'ai' ? 'Raised by an AI-written test: a QE confirms it is a product defect before it blocks the release or goes to Jira' : null);
      if (reason) {
        d.confirmation = { status: 'needed', reason, blocksReleaseIfConfirmed: d.blocksRelease };
        d.blocksRelease = false;
        d.releaseDecision = `Awaiting QE confirmation: ${reason}.`;
        d.jira = { status: 'not raised', reason: 'Awaiting QE confirmation' };
      }
    }
    await raiseDefectsInJira(defects.filter((d) => !d.confirmation), { cycle, env: this.env, fetchImpl: this.fetchImpl, items: cycleJiraItems(cycle) });
    cycle.artifacts.defects = defects;
    cycle.artifacts.resolvedDefects = resolved;
    if (cycle.learned) cycle.learned.defects = defects.filter((d) => d.confirmation).map((d) => ({ id: d.id, testCaseKey: d.testCaseKey, lesson: `${d.id} awaits QE confirmation: ${d.confirmation.reason}` }));
    const memory = this.store.getLearning();
    learning.recordDefects(memory, cycle);
    this.store.saveLearning(memory);
    this.handover(cycle, 'defects');
    const inJira = defects.filter((d) => d.jira && d.jira.key).length;
    setPhase(cycle, 'defects', 'done', `${defects.length} defect(s) from real failures${defects.length ? ` · ${inJira} in Jira` : ''}${resolved.length ? ` · ${resolved.length} resolved` : ''}`);
    cycle.artifacts.coverage = computeCoverage(cycle.artifacts.requirements, runCases, execution.results, cycle.inputs.find((i) => i.slot === 'codebase')?.dataModel);
    this.store.saveCycle(cycle);
  }

  /** A person's verdict on an artefact of a cycle; it is remembered for the next cycles. */
  feedback(cycleId, body = {}) {
    const cycle = this.mustGet(cycleId);
    const memory = this.store.getLearning();
    let rec;
    try { rec = learning.recordFeedback(memory, cycle, body); } catch (e) { throw httpError(400, e.message); }
    this.store.saveLearning(memory);
    cycle.feedback = [...(cycle.feedback || []).filter((f) => !(f.target === rec.target && f.id === rec.id)), rec];
    if (rec.target === 'script' && rec.verdict === 'accept' && cycle.status === 'awaiting-merge') {
      const a = cycle.artifacts;
      const draft = a.aiScripts.find((x) => x.file === rec.id);
      const t = a.testCases.find((x) => x.key === draft.caseKey);
      if (t && draft.body && t.automation !== 'Automated') {
        const file = this.promoteScript(cycle, a, t, draft.body, { writtenBy: draft.by, by: rec.by, lesson: `AI script accepted by ${rec.by} at the merge gate: runs in this cycle` });
        draft.status = `Accepted by ${rec.by}: runs as ${file}`;
        if (!cycle.mergeProposal.scripts.includes(file)) cycle.mergeProposal.scripts.push(file);
        if (!cycle.mergeProposal.testCases.includes(t.key)) cycle.mergeProposal.testCases.push(t.key);
        cycle.learned.design.push({ kind: 'script', testCaseKey: t.key, lesson: `${t.key}: AI script accepted by ${rec.by} at the merge gate and added to this run` });
      }
    } else if (rec.target === 'script') {
      const draft = cycle.artifacts.aiScripts.find((x) => x.file === rec.id);
      if (draft) draft.status = rec.verdict === 'accept' ? `Accepted by ${rec.by}: runs from the next cycle` : `Rejected by ${rec.by}`;
    }
    if (rec.target === 'defect') {
      const d = cycle.artifacts.defects.find((x) => x.id === rec.id);
      const wasBlocking = d.confirmation ? d.confirmation.blocksReleaseIfConfirmed : d.blocksRelease;
      d.confirmation = { ...(d.confirmation || {}), status: rec.verdict === 'confirm' ? 'confirmed' : 'not-a-defect', by: rec.by, at: rec.at, note: rec.note, blocksReleaseIfConfirmed: wasBlocking };
      d.blocksRelease = rec.verdict === 'confirm' ? wasBlocking : false;
      d.releaseDecision = rec.verdict === 'confirm' ? `Confirmed by ${rec.by}. ${wasBlocking ? 'Blocks the release.' : 'Does not block the release.'}` : `Marked not a defect by ${rec.by}${rec.note ? `: ${rec.note}` : ''}. Treated as a test issue in later cycles.`;
    }
    this.store.saveCycle(cycle);
    return { feedback: rec, learning: learning.summary(memory) };
  }

  resume(cycleId) {
    const cycle = this.mustGet(cycleId);
    if (cycle.status !== 'interrupted' && cycle.status !== 'failed') throw httpError(409, 'Only interrupted or failed cycles can be resumed');
    cycle.status = 'running';
    cycle.error = null;
    for (const p of cycle.phases) if (['running', 'failed'].includes(p.status)) p.status = 'pending';
    this.store.saveCycle(cycle);
    if (cycle.type === 'baseline') return this.track(cycle.id, this.runBaseline(cycle.id));
    const merged = cycle.approvals.some((a) => a.gate === 'Merge into baseline' && a.decision === 'approved');
    if (!merged) return this.track(cycle.id, this.runIncrementalDesign(cycle.id));
    const baseline = this.store.getBaseline(cycle.baselineId);
    const prevCycleId = cycle.previousCycleId || baseline.cycles[baseline.cycles.length - 2];
    return this.track(cycle.id, this.finishIncremental(cycle.id, this.store.getCycle(prevCycleId)?.artifacts?.defects || []));
  }

  mustGet(id) {
    const c = this.store.getCycle(id);
    if (!c) throw httpError(404, `Cycle ${id} not found`);
    return c;
  }

  runDir(id) { return path.join(this.store.runDir(id)); }
}

function httpError(status, message, details) {
  const e = new Error(message);
  e.status = status;
  if (details) e.details = details;
  return e;
}

module.exports = { Pipeline, PHASES, PHASE_LABEL, httpError };
