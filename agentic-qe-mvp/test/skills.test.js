'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createApp } = require('../src/server');
const { loadSkills, parseSkill, agentContext, checkHandover, AGENTS } = require('../src/skills');
const { producedBy } = require('../src/handover');
const { testCasesWorkbook } = require('../src/excel');
const { renderReportHtml } = require('../src/report');
const { tmpDir, baselineCycle, BASELINE_INPUTS } = require('./helpers');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const SHIPPED = ['automation-script-conventions', 'cycle-report', 'defect-reporting', 'incremental-merge', 'input-normalisation', 'input-review', 'test-case-authoring', 'test-data-generation',
  'testing-eqe', 'testing-functional', 'traceability-handover'];
/** Default selection for a cycle: every general skill plus the one for its type of testing (functional by default). */
const DEFAULT_ON = SHIPPED.filter((id) => !id.startsWith('testing-') || id === 'testing-functional');

/** A skills dir holding the shipped skills plus extra files - no code change involved. */
function skillsDirWith(extra) {
  const dir = tmpDir('skills');
  for (const f of fs.readdirSync(SKILLS_DIR)) fs.copyFileSync(path.join(SKILLS_DIR, f), path.join(dir, f));
  for (const [name, text] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

let D;
test.before(async () => {
  const skillsDir = skillsDirWith({
    'probe.md': '---\nid: probe\nname: Probe\ndescription: Only the automation script agent may see this.\nappliesTo: [scripts]\ndelivers:\n  scripts: [specs]\n---\nPROBE-SENTINEL-7f3a\n',
    'risk-register.md': '---\nid: risk-register\nname: Risk register\ndescription: Requirements agent owes a risk register.\nappliesTo: [requirements]\ndelivers:\n  requirements: [businessRules, riskRegister]\n---\nList the risks.\n',
  });
  const ctx = createApp({ dataDir: tmpDir('skills-run'), env: {}, skillsDir });
  const all = await baselineCycle(ctx.pipeline, ctx.store);
  const shipped = createApp({ dataDir: tmpDir('skills-shipped'), env: {} });
  const def = await baselineCycle(shipped.pipeline, shipped.store);
  D = { ctx, all, shipped, def };
});

test('skills/ is loaded at startup: every shipped skill parses with id, name, description, appliesTo and delivers', () => {
  const lib = loadSkills(SKILLS_DIR);
  assert.deepEqual(lib.warnings, []);
  assert.deepEqual(lib.skills.map((s) => s.id), SHIPPED);
  for (const s of lib.skills) {
    assert.ok(s.name && s.description && s.body.length > 100, s.id);
    assert.ok(s.appliesTo.length && s.appliesTo.every((a) => AGENTS[a]), `${s.id} targets known agents`);
    for (const [agent, keys] of Object.entries(s.delivers)) assert.ok(s.appliesTo.includes(agent) && keys.length, `${s.id} delivers for ${agent}`);
  }
  const inc = lib.skills.find((s) => s.id === 'incremental-merge');
  assert.deepEqual(inc.delivers, { delta: ['delta'], requirements: ['businessRules'], testcases: ['functional', 'nonFunctional'], scripts: ['specs'] });
  assert.equal(D.shipped.skills.skills.length, SHIPPED.length, 'createApp loads skills/');
  assert.deepEqual(D.ctx.skills.skills.map((s) => s.id).sort(), [...SHIPPED, 'probe', 'risk-register'].sort(), 'a new file adds a skill without a code change');
  assert.throws(() => parseSkill('no front matter'), /front matter/);
});

test('a skill body reaches only the agents named in appliesTo', () => {
  const skills = D.ctx.skills.skills;
  for (const agent of Object.keys(AGENTS)) {
    const ctx = agentContext(skills, agent);
    assert.equal(ctx.guidance.includes('PROBE-SENTINEL-7f3a'), agent === 'scripts', `probe visible to ${agent}?`);
    const expected = skills.filter((s) => s.appliesTo.includes(agent)).map((s) => s.id);
    assert.deepEqual(ctx.skills.map((s) => s.id), expected);
    for (const s of skills.filter((x) => !x.appliesTo.includes(agent))) assert.ok(!ctx.guidance.includes(s.body), `${s.id} body hidden from ${agent}`);
  }
  const c = D.all;
  const seen = Object.fromEntries(c.phases.map((p) => [p.name, p.skills || []]));
  assert.ok(seen.scripts.includes('probe'));
  for (const [phase, ids] of Object.entries(seen)) if (phase !== 'scripts') assert.ok(!ids.includes('probe'), `${phase} did not see probe`);
  assert.ok(seen.testcases.includes('test-case-authoring') && !seen.scripts.includes('test-case-authoring'));
  assert.ok(c.artifacts.scripts.every((s) => s.designedWith.includes('probe') && /Skills applied: .*probe/.test(s.code)));
  assert.ok(c.artifacts.testCases.every((t) => !t.designedWith.includes('probe')));
  assert.ok(c.artifacts.rules.every((r) => !r.designedWith.includes('probe')));
});

test('a phase that drops a declared artefact is reported as an incomplete hand-over', () => {
  const reqs = D.all.phases.find((p) => p.name === 'requirements');
  assert.equal(reqs.handover.status, 'incomplete');
  assert.deepEqual(reqs.handover.missing, ['riskRegister']);
  assert.equal(reqs.handover.items.find((i) => i.key === 'businessRules').status, 'delivered');
  assert.equal(D.all.report.handoverStatus, 'incomplete');
  assert.deepEqual(D.all.report.handovers.find((h) => h.phase === 'requirements').missing, ['riskRegister']);
  assert.match(renderReportHtml(D.all.report), /missing: riskRegister/);

  const lib = loadSkills(SKILLS_DIR).skills.filter((s) => DEFAULT_ON.includes(s.id));
  const good = checkHandover('scripts', producedBy('scripts', D.def), lib);
  assert.equal(good.status, 'complete');
  const dropped = { ...D.def, artifacts: { ...D.def.artifacts, scripts: undefined } };
  const bad = checkHandover('scripts', producedBy('scripts', dropped), lib);
  assert.equal(bad.status, 'incomplete');
  assert.deepEqual(bad.missing, ['specs']);
  const noF = { ...D.def, artifacts: { ...D.def.artifacts, testCases: D.def.artifacts.testCases.filter((t) => t.type !== 'functional') } };
  const tc = checkHandover('testcases', producedBy('testcases', noF), lib);
  assert.equal(tc.status, 'incomplete');
  assert.deepEqual(tc.missing, ['functional']);
});

test('shipped skills: every phase hand-over of a real baseline run is complete; baseline comparison is n/a, not faked', () => {
  const c = D.def;
  for (const p of c.phases.filter((x) => x.handover)) assert.notEqual(p.handover.status, 'incomplete', `${p.name}: ${p.handover.missing}`);
  assert.equal(c.phases.find((p) => p.name === 'testcases').handover.status, 'complete');
  const report = c.phases.find((p) => p.name === 'report').handover;
  assert.equal(report.items.find((i) => i.key === 'comparison').status, 'n/a');
  assert.equal(report.items.find((i) => i.key === 'testCaseExport').status, 'delivered');
  assert.equal(c.report.handoverStatus, 'complete');
});

test('skills are selectable per run and on by default for the cycle\'s type of testing; the selection is persisted on the cycle', async () => {
  assert.deepEqual(D.def.skills.map((s) => s.id), DEFAULT_ON);
  const { pipeline, store } = D.shipped;
  const one = await pipeline.startCycle({ type: 'baseline', inputs: BASELINE_INPUTS, skills: ['cycle-report'] });
  assert.deepEqual(store.getCycle(one.id).skills.map((s) => s.id), ['cycle-report']);
  assert.deepEqual(one.phases.find((p) => p.name === 'normalise').skills, []);
  assert.equal(one.phases.find((p) => p.name === 'normalise').handover.status, 'no contract');
  await assert.rejects(pipeline.startCycle({ type: 'baseline', inputs: BASELINE_INPUTS, skills: ['nope'] }), /Unknown skill/);
});

test('the cycle report surfaces the active skills', () => {
  const r = D.def.report;
  assert.deepEqual(r.skills.map((s) => s.id), DEFAULT_ON);
  assert.ok(r.skills.every((s) => s.name && s.description && s.appliesTo.length));
  const html = renderReportHtml(r);
  assert.match(html, /<h2>Active skills<\/h2>/);
  for (const s of r.skills) assert.ok(html.includes(s.name), s.name);
  assert.match(html, /Skill hand-overs/);
});

test('Excel export columns match the order written in skills/test-case-authoring.md', async () => {
  const text = fs.readFileSync(path.join(SKILLS_DIR, 'test-case-authoring.md'), 'utf8').replace(/\s+/g, ' ');
  const declared = text.match(/expects: (.*?)\. /)[1].split(', ');
  assert.deepEqual(declared, ['Key', 'Name', 'Objective', 'Precondition', 'Test Step', 'Test Data', 'Expected Result', 'Priority', 'Type', 'Labels', 'Requirement link', 'Automation status', 'Cycle']);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await testCasesWorkbook(D.def));
  const headers = wb.getWorksheet('Test Cases').getRow(1).values.slice(1);
  assert.deepEqual(headers.slice(0, declared.length), declared);
  assert.deepEqual(D.def.artifacts.exports.testCases.columns.slice(0, declared.length), declared);
  assert.ok(D.def.artifacts.testCases.every((t) => /^TC-[FN]-\d{3}$/.test(t.key) && (t.type === 'functional') === t.key.startsWith('TC-F')));
});

test('a skill written for the former business rules agent is handed to the requirements agent', () => {
  const k = parseSkill('---\nid: legacy-rules\nname: Legacy rules skill\ndescription: Written before rules merged into requirements.\nappliesTo: [rules, requirements]\ndelivers:\n  rules: [riskRegister]\n  requirements: [requirements]\n---\nBody.', 'legacy.md');
  assert.deepEqual(k.appliesTo, ['requirements']);
  assert.deepEqual(k.delivers, { requirements: ['riskRegister', 'requirements'] });
  assert.ok(!('rules' in AGENTS));
});
