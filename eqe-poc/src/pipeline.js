'use strict';
// Orchestrates Stages 1-3 with the three human approval gates (scope, cases, code). Every state change is persisted,
// recorded in the governance trail and re-rendered into the run's artifacts.
const path = require('path');
const jira = require('./jira');
const { analyse } = require('./stage1');
const { design } = require('./stage2');
const { loadGolden, compare } = require('./golden');
const stage3 = require('./stage3');
const metrics = require('./metrics');
const artifacts = require('./artifacts');
const playbook = require('../framework/test-data/playbook.json');

const VERDICTS = ['accepted', 'incorrect', 'hallucinated', 'duplicate'];
const GATES = { scope: 'Stage 1 scope approval', cases: 'Stage 2 test-case approval', code: 'Stage 3 code approval' };
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const now = () => new Date().toISOString();

class Pipeline {
  constructor({ store, baseURL, runs = 5, env = process.env }) {
    Object.assign(this, { store, baseURL, runsRequired: runs, env });
    for (const r of store.list()) if (r.stage3?.status === 'running') { r.stage3.status = 'interrupted'; store.save(r); }
  }

  async persist(run) { this.store.save(run); await artifacts.writeAll(run, this.store.artifactsDir(run.id)); return run; }
  trail(run, actor, role, action, detail = '') { run.trail.push({ at: now(), actor: actor || 'system', role: role || 'system', action, detail }); }
  load(id) { return this.store.get(id) || fail(404, `Run ${id} not found`); }

  async create({ initiative = 'AQPI-1', epics = ['AQPI-2'], includeNegatives = false, actor = 'QE engineer' } = {}) {
    if (!Array.isArray(epics) || !epics.length) fail(400, 'Select at least one epic');
    const limit = metrics.scaling(this.store.list()).uc1.maxEpics;
    if (epics.length > limit) fail(409, `Gate 1 allows ${limit} epic(s) until a run passes the UC1 criteria`);
    const data = await jira.loadInitiative(initiative, { env: this.env });
    const unknown = epics.filter((e) => !data.epics.some((x) => x.key === e));
    if (unknown.length) fail(400, `Not epics of ${initiative}: ${unknown.join(', ')}`);
    const run = {
      id: this.store.nextId(), createdAt: now(), status: 'awaiting-scope', mode: data.mode, sourceFiles: data.files, initiative, epics,
      options: { includeNegatives: !!includeNegatives }, stage1: analyse(data, epics), stage2: null, stage3: null,
      gates: { scope: { status: 'pending' }, cases: { status: 'locked' }, code: { status: 'locked' } }, trail: [],
    };
    this.trail(run, actor, 'QE engineer', 'Run started', `${initiative} / ${epics.join(', ')} via ${data.mode.kind}`);
    this.trail(run, 'Devin', 'agent', 'Stage 1 analysis complete', `${run.stage1.summary.acceptanceCriteria} ACs, ${run.stage1.summary.gaps} gaps, ${run.stage1.summary.risks} risks`);
    return this.persist(run);
  }

  async startReview(id, gate, { actor, role } = {}) {
    const run = this.load(id); const g = run.gates[gate] || fail(404, 'Unknown gate');
    if (g.status !== 'pending') fail(409, `${GATES[gate]} is ${g.status}`);
    if (!actor) fail(400, 'Reviewer name is required');
    if (!g.startedAt) { Object.assign(g, { startedAt: now(), actor, role }); this.trail(run, actor, role, `${GATES[gate]} review started`); }
    return this.persist(run);
  }

  async decide(id, gate, { decision, actor, role, comment = '' } = {}) {
    const run = this.load(id); const g = run.gates[gate] || fail(404, 'Unknown gate');
    if (g.status !== 'pending') fail(409, `${GATES[gate]} is ${g.status}`);
    if (!['approved', 'rejected'].includes(decision)) fail(400, 'decision must be approved or rejected');
    if (!actor || !role) fail(400, 'Reviewer name and role are required');
    if (!g.startedAt) fail(409, 'Start the timed review before deciding');
    if (decision === 'approved' && gate === 'cases') {
      const missing = run.stage2.cases.filter((c) => !run.stage2.verdicts[c.id]);
      if (missing.length) fail(409, `Review every case before approving (${missing.length} without a verdict)`);
    }
    if (decision === 'approved' && gate === 'code' && run.stage3?.status !== 'complete') fail(409, 'Stage 3 dry runs are not complete');
    const minutes = Math.round(((Date.now() - Date.parse(g.startedAt)) / 60000) * 10) / 10;
    Object.assign(g, { status: decision, actor, role, comment, decidedAt: now(), minutes });
    this.trail(run, actor, role, `${GATES[gate]} ${decision}`, `${minutes} min${comment ? ` - ${comment}` : ''}`);
    if (decision === 'rejected') { run.status = `rejected-at-${gate}`; return this.persist(run); }
    if (gate === 'scope') {
      run.stage2 = { ...design(run.stage1, run.options), verdicts: {}, golden: {} };
      this.compareGolden(run);
      run.gates.cases.status = 'pending'; run.status = 'awaiting-case-review';
      this.trail(run, 'Devin', 'agent', 'Stage 2 design complete', `${run.stage2.cases.length} cases in ${run.stage2.scenarios.length} scenarios`);
    } else if (gate === 'cases') {
      run.status = 'ready-for-automation';
    } else {
      run.status = 'complete';
    }
    return this.persist(run);
  }

  compareGolden(run, overrides = {}) {
    for (const epic of run.epics) {
      const set = overrides[epic] || run.stage2.goldenSets?.[epic] || loadGolden(epic);
      if (!set) continue;
      run.stage2.goldenSets = { ...(run.stage2.goldenSets || {}), [epic]: set };
      run.stage2.golden[epic] = { provenance: set.provenance || {}, ...compare(run.stage2.cases.filter((c) => c.epic === epic), set.cases) };
    }
  }

  async replaceGolden(id, set, { actor, role } = {}) {
    const run = this.load(id);
    if (!run.stage2) fail(409, 'Stage 2 has not run');
    if (!set || !run.epics.includes(set.epic)) fail(400, `epic must be one of ${run.epics.join(', ')}`);
    if (!Array.isArray(set.cases) || !set.cases.length || set.cases.length > 100 || set.cases.some((c) => !c.id || !c.req || !c.title)) fail(400, 'cases must be a non-empty array of {id, req, title, steps?, expected?}');
    if (!actor) fail(400, 'Author name is required');
    set.provenance = { authoredBy: actor, role: role || '', status: 'human-authored', uploadedAt: now() };
    this.compareGolden(run, { [set.epic]: set });
    this.trail(run, actor, role, 'Golden set replaced', `${set.epic}: ${set.cases.length} cases`);
    return this.persist(run);
  }

  async verdict(id, caseId, { verdict, actor, note = '' } = {}) {
    const run = this.load(id);
    if (run.gates.cases.status !== 'pending') fail(409, 'Case review is not open');
    if (!run.stage2.cases.some((c) => c.id === caseId)) fail(404, `Unknown case ${caseId}`);
    if (!VERDICTS.includes(verdict)) fail(400, `verdict must be one of ${VERDICTS.join(', ')}`);
    if (!actor) fail(400, 'Reviewer name is required');
    run.stage2.verdicts[caseId] = { verdict, actor, note, at: now() };
    this.trail(run, actor, 'reviewer', `Case ${caseId} marked ${verdict}`, note);
    return this.persist(run);
  }

  async startStage3(id, { caseIds, actor = 'Automation engineer' } = {}) {
    const run = this.load(id);
    if (run.gates.cases.status !== 'approved') fail(409, 'Stage 2 cases must be approved first');
    if (run.stage3?.status === 'running') fail(409, 'Stage 3 is already running');
    if (run.gates.code.status === 'approved') fail(409, 'Code already approved');
    const eligible = run.stage2.cases.filter((c) => c.automatable && run.stage2.verdicts[c.id]?.verdict === 'accepted');
    const max = metrics.scaling(this.store.list()).uc2.maxCases;
    let chosen = Array.isArray(caseIds) && caseIds.length ? eligible.filter((c) => caseIds.includes(c.id)) : eligible.slice(0, max);
    if (Array.isArray(caseIds) && chosen.length !== caseIds.length) fail(400, 'Only accepted, automatable cases can be automated');
    if (!chosen.length) fail(409, 'No accepted automatable cases');
    if (chosen.length > max) fail(409, `Gate 2 allows ${max} case(s) until a run passes the UC2 criteria`);
    chosen = chosen.slice(0, max);
    const dir = path.join(this.store.runDir(id), 'stage3-workspace');
    const files = stage3.prepareWorkspace(dir, chosen);
    run.stage3 = {
      status: 'running', startedAt: now(), baseURL: this.baseURL, caseIds: chosen.map((c) => c.id), cases: chosen.map((c) => ({ id: c.id, req: c.req, dataNeeds: c.dataNeeds })),
      playbookKeys: Object.keys(playbook.entries), specs: chosen.map((c, i) => ({ id: c.id, file: files[i], code: stage3.specFor(c) })),
      dataMapping: chosen.flatMap((c) => c.dataNeeds.map((k) => ({ case: c.id, need: k, playbookEntry: playbook.entries[k] ? k : null, value: playbook.entries[k] || null }))),
      runs: [],
    };
    run.gates.code = { status: 'locked' }; run.status = 'automating';
    this.trail(run, actor, 'Automation engineer', 'Stage 3 started', `${chosen.length} spec(s), ${this.runsRequired} dry runs`);
    await this.persist(run);
    this.execute(id, dir).catch((e) => console.error('stage3 failed', e));
    return run;
  }

  async execute(id, dir) {
    for (let n = 1; n <= this.runsRequired; n += 1) {
      const result = await stage3.runOnce(dir, this.baseURL, n);
      const run = this.load(id); run.stage3.runs.push(result); await this.persist(run);
    }
    const run = this.load(id);
    run.stage3.status = run.stage3.runs.every((r) => r.tests.length) ? 'complete' : 'error';
    run.stage3.finishedAt = now();
    if (run.stage3.status === 'complete') { run.gates.code = { status: 'pending' }; run.status = 'awaiting-code-review'; }
    const u2 = metrics.uc2(run);
    this.trail(run, 'Devin', 'agent', `Stage 3 dry runs ${run.stage3.status}`, `pass rate ${u2.passRate === null ? 'n/a' : Math.round(u2.passRate * 100)}%, flake rate ${u2.flakeRate === null ? 'n/a' : Math.round(u2.flakeRate * 100)}%`);
    await this.persist(run);
  }

  view(run) { return { ...run, metrics: { uc1: metrics.uc1(run), uc2: metrics.uc2(run) }, stages: artifacts.stageStatus(run), artifacts: artifacts.list(this.store.artifactsDir(run.id)) }; }
}

module.exports = { Pipeline, HttpError, VERDICTS, GATES };
