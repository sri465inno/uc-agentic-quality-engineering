'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Store } = require('./store');
const { Pipeline } = require('./pipeline');
const { renderReportHtml, APP_TITLE } = require('./report');
const { compareCycles, renderCompareHtml } = require('./compare');
const { testCasesWorkbook, reportWorkbook, compareWorkbook } = require('./excel');
const { buildLeadReport, renderLeadHtml, renderLeadPage, renderLeadMarkdown } = require('./lead-report');
const { jiraLiveConfig, EXPORT } = require('./connectors/jira');
const { listFixtureBranches, loadCodebaseFixture, DEFAULT_BRANCH, SOURCE } = require('./connectors/codebase');
const { aiStatus } = require('./ai');
const { PW_VERSION } = require('./execution');
const { dataSetFile } = require('./agents/testdata');
const { loadSkills, parseSkill, AGENTS } = require('./skills');
const { PLATFORM_AGENTS, REVIEW_AGENT, INTAKE_STAGES, INPUT_TYPES, DEMO, DEMO_EXAMPLES, exampleOf } = require('./platform');
const { TESTING_TYPES, DEFAULT_TESTING_TYPE } = require('./testing-types');
const { FLOWS: DEMO_INPUT_FLOWS } = require('../scripts/make-demo-inputs');
const { labMeta, generateData, runLabCase } = require('./lab');
const { isHotelBranch } = require('../sut/hotel');

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function createApp({ dataDir = path.join(__dirname, '..', 'data'), env = process.env, skillsDir = path.join(__dirname, '..', 'skills'), fetchImpl = globalThis.fetch } = {}) {
  const store = new Store(dataDir);
  const uploadDir = path.join(dataDir, 'skills');
  const readSkills = () => {
    const platform = loadSkills(skillsDir);
    const uploaded = fs.existsSync(uploadDir) ? loadSkills(uploadDir) : { skills: [], warnings: [] };
    const skills = [...platform.skills.map((x) => ({ ...x, source: 'platform' }))];
    const warnings = [...platform.warnings, ...uploaded.warnings];
    for (const x of uploaded.skills) {
      if (skills.some((k) => k.id === x.id)) warnings.push(`${x.file}: uploaded skill id "${x.id}" clashes with a platform skill and is ignored`);
      else skills.push({ ...x, source: 'enterprise upload' });
    }
    return { dir: skillsDir, skills, warnings };
  };
  let skillLib = readSkills();
  for (const w of skillLib.warnings) console.warn(`[skills] ${w}`);
  const pipeline = new Pipeline(store, { env, skills: skillLib.skills, fetchImpl });
  const reloadSkills = () => { skillLib = readSkills(); pipeline.skills = skillLib.skills; };
  pipeline.recover();
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/fonts/inter', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource', 'inter'), { maxAge: '7d' }));
  app.use('/demo-inputs', express.static(path.join(__dirname, '..', 'demo-inputs'), { setHeaders: (res, file) => res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`) }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const cycle = (req) => pipeline.mustGet(req.params.id);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const download = (res, name, type, body) => {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(body);
  };
  const needReport = (c) => { if (!c.report) { const e = new Error('Report not available until the cycle has completed'); e.status = 409; throw e; } return c.report; };

  app.get('/api/meta', (req, res) => {
    const jira = jiraLiveConfig(env);
    const ai = aiStatus(env);
    res.json({
      title: APP_TITLE,
      jira: jira ? { mode: 'live', baseUrl: jira.baseUrl, defects: 'raised in Jira' } : { mode: 'fixture', defects: 'not raised in Jira', note: 'JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN not set: recorded fixtures are used; no live Jira call is made, and defects stay in the platform with their story link' },
      model: ai.mode === 'ai' ? { mode: 'model', model: ai.model } : { mode: 'demo', note: 'No model API key: deterministic demo mode (template prose)' },
      ai,
      codebase: { repo: SOURCE.fullName, url: SOURCE.htmlUrl, branches: listFixtureBranches().filter(isHotelBranch) },
      jiraExport: { repo: EXPORT.repo, branch: EXPORT.branch },
      playwright: PW_VERSION,
      skills: skillLib.skills.map(({ body, ...s }) => s),
      skillWarnings: skillLib.warnings,
      platform: { agents: PLATFORM_AGENTS, reviewAgent: REVIEW_AGENT, intakeStages: INTAKE_STAGES, inputTypes: INPUT_TYPES, demo: DEMO, examples: DEMO_EXAMPLES },
      testingTypes: TESTING_TYPES.map(({ domains, ...t }) => ({ ...t, ...domains?.hotel, agents: { ...t.agents, ...domains?.hotel?.agents } })),
      defaultTestingType: DEFAULT_TESTING_TYPE,
      samples: DEMO_EXAMPLES[0].samples,
    });
  });

  app.get('/api/demo-inputs', (req, res) => res.json(DEMO_INPUT_FLOWS.map((f) => ({
    flow: f.dir, branch: f.branch || null, files: f.files.map(([name, slot]) => ({ name, slot, url: `/demo-inputs/${f.dir}/${name}` })),
  }))));

  app.post('/api/reset', (req, res) => {
    if (pipeline.running.size) return res.status(409).json({ error: 'A cycle is still running. Wait for it to finish, then reset.' });
    store.reset();
    res.json({ cycles: 0, baselines: 0 });
  });

  app.get('/api/lab', (req, res) => res.json(labMeta()));
  app.post('/api/lab/data', (req, res) => res.json(generateData(req.body || {})));
  let labSeq = 0;
  app.post('/api/lab/run', wrap(async (req, res) => {
    labSeq += 1;
    res.json(await runLabCase(req.body || {}, store.runDir(`LAB-${Date.now()}-${labSeq}`)));
  }));

  app.get('/api/skills', (req, res) => res.json({ dir: 'skills/', skills: skillLib.skills, warnings: skillLib.warnings }));
  app.post('/api/skills', (req, res) => {
    const { text, fileName } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Send the skill as Markdown text with YAML front matter' });
    let skill;
    try { skill = parseSkill(text, fileName || 'upload.md'); } catch (e) { return res.status(400).json({ error: e.message }); }
    const unknown = [...skill.appliesTo, ...Object.keys(skill.delivers)].filter((a) => !AGENTS[a]);
    if (unknown.length) return res.status(400).json({ error: `Unknown agent id(s): ${[...new Set(unknown)].join(', ')}. Use: ${Object.keys(AGENTS).join(', ')}` });
    if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.id)) return res.status(400).json({ error: 'Skill id must be lower-case letters, digits and dashes' });
    if (skillLib.skills.some((k) => k.id === skill.id && k.source === 'platform')) return res.status(409).json({ error: `"${skill.id}" is a platform skill; give the enterprise skill its own id` });
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, `${skill.id}.md`), text);
    reloadSkills();
    const { body, ...meta } = skillLib.skills.find((k) => k.id === skill.id);
    res.status(201).json({ skill: meta, warnings: skillLib.warnings });
  });
  app.delete('/api/skills/:id', (req, res) => {
    const s = skillLib.skills.find((k) => k.id === req.params.id);
    if (!s) return res.status(404).json({ error: `Skill ${req.params.id} not found` });
    if (s.source !== 'enterprise upload') return res.status(409).json({ error: 'Only uploaded enterprise skills can be removed here' });
    fs.rmSync(path.join(uploadDir, s.file), { force: true });
    reloadSkills();
    res.json({ removed: s.id });
  });

  app.get('/api/sample-text', (req, res) => {
    if (req.query.slot === 'codebase') {
      const cb = loadCodebaseFixture(req.query.branch || DEFAULT_BRANCH);
      return res.type('text/plain').send(cb.files.map((f) => `# ${f.path}\n${f.text}`).join('\n\n'));
    }
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(req.query.key || '')) return res.status(400).json({ error: 'key required' });
    const f = path.join(__dirname, '..', 'fixtures', 'jira', `${req.query.key}.json`);
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'No fixture for that key' });
    res.type('text/plain').send(fs.readFileSync(f, 'utf8'));
  });

  app.get('/api/cycles', (req, res) => res.json(store.listCycles().map((c) => ({
    id: c.id, name: c.name, type: c.type, testingType: c.testingType || DEFAULT_TESTING_TYPE, testingTypeName: c.testingTypeName || null, status: c.status, createdAt: c.createdAt, completedAt: c.completedAt || null, baselineId: c.baselineId,
    sutBuild: c.sutBuild || null, example: exampleOf(c)?.id || null,
    summary: c.artifacts?.execution?.summary || null, delta: c.delta?.summary || c.deltaPreview?.summary || null,
  }))));
  app.get('/api/cycles/:id', (req, res) => res.json(cycle(req)));
  app.post('/api/cycles', wrap(async (req, res) => res.status(201).json(await pipeline.startCycle(req.body || {}))));
  app.post('/api/cycles/:id/delta-preview', (req, res) => {
    const c = cycle(req);
    if (c.type !== 'incremental') return res.status(400).json({ error: 'Only incremental cycles have a delta' });
    res.json(pipeline.previewDelta(c, req.body || {}));
  });
  app.post('/api/cycles/:id/review', (req, res) => res.status(202).json(pipeline.review(req.params.id, req.body || {}).cycle));
  app.post('/api/cycles/:id/merge', (req, res) => res.status(202).json(pipeline.decideMerge(req.params.id, req.body || {}).cycle));
  app.post('/api/cycles/:id/resume', (req, res) => res.status(202).json(pipeline.resume(req.params.id).cycle));

  app.get('/api/cycles/:id/export/testcases.xlsx', wrap(async (req, res) => {
    const c = cycle(req);
    if (!c.artifacts?.testCases) return res.status(409).json({ error: 'No test cases designed yet' });
    download(res, `${c.id}-${slug(c.name)}-test-cases.xlsx`, XLSX, await testCasesWorkbook(c));
  }));
  app.get('/api/cycles/:id/scripts/:file', (req, res) => {
    const s = (cycle(req).artifacts?.scripts || []).find((x) => x.file === req.params.file);
    if (!s) return res.status(404).json({ error: 'Script not found' });
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${s.file}"`);
    res.type('text/javascript').send(s.code);
  });
  app.get('/api/cycles/:id/testdata/:key.json', (req, res) => {
    const c = cycle(req);
    const d = (c.artifacts?.testData || []).find((x) => x.testCaseKey === req.params.key);
    if (!d) return res.status(404).json({ error: 'No test data for that test case' });
    res.json(dataSetFile(d, pipeline.dictionaryOf(c).dictionary));
  });
  app.get('/api/cycles/:id/evidence/:file', (req, res) => {
    if (!/^[A-Z]+-(?:[A-Z]-)?[A-Z]?\d+-\d+\.(json|png|txt)$/.test(req.params.file)) return res.status(400).json({ error: 'bad name' });
    const f = path.join(store.runDir(cycle(req).id), 'evidence', req.params.file);
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'not found' });
    res.sendFile(f);
  });
  app.get('/api/cycles/:id/playwright-report.json', (req, res) => {
    const f = path.join(store.runDir(cycle(req).id), 'playwright-report.json');
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not executed' });
    res.sendFile(f);
  });
  app.get('/api/cycles/:id/report', (req, res) => res.json(needReport(cycle(req))));
  app.get('/api/cycles/:id/report.html', (req, res) => {
    const c = cycle(req);
    const html = renderReportHtml(needReport(c));
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${c.id}-cycle-report.html"`);
    res.type('html').send(html);
  });
  app.get('/api/cycles/:id/lead-report', (req, res) => {
    const c = cycle(req);
    needReport(c);
    const lead = buildLeadReport(c);
    res.json({ lead, html: renderLeadHtml(lead, { cycleLink: (tab) => (tab === 'report' ? `#/reporting?cycle=${c.id}&view=cycle` : `#/cycle/${c.id}?tab=${tab}`) }) });
  });
  app.get('/api/cycles/:id/lead-report.html', (req, res) => {
    const c = cycle(req);
    needReport(c);
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="${c.id}-qe-lead-report.html"`);
    res.type('html').send(renderLeadPage(buildLeadReport(c)));
  });
  app.get('/api/cycles/:id/lead-report.md', (req, res) => {
    const c = cycle(req);
    needReport(c);
    download(res, `${c.id}-qe-lead-report.md`, 'text/markdown', renderLeadMarkdown(buildLeadReport(c)));
  });
  app.get('/api/cycles/:id/report.xlsx', wrap(async (req, res) => {
    const c = cycle(req);
    download(res, `${c.id}-cycle-report.xlsx`, XLSX, await reportWorkbook(needReport(c), c));
  }));

  const loadCompare = (req) => {
    const a = store.getCycle(req.query.a);
    const b = store.getCycle(req.query.b);
    if (!a || !b) { const e = new Error('Pick two cycles (?a=CYC-1&b=CYC-2)'); e.status = 400; throw e; }
    if (a.status !== 'completed' || b.status !== 'completed') { const e = new Error('Both cycles must be completed'); e.status = 409; throw e; }
    return compareCycles(a, b);
  };
  app.get('/api/compare', (req, res) => res.json(loadCompare(req)));
  app.get('/api/compare.html', (req, res) => {
    const c = loadCompare(req);
    if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="compare-${c.a.id}-vs-${c.b.id}.html"`);
    res.type('html').send(renderCompareHtml(c));
  });
  app.get('/api/compare.xlsx', wrap(async (req, res) => {
    const c = loadCompare(req);
    download(res, `compare-${c.a.id}-vs-${c.b.id}.xlsx`, XLSX, await compareWorkbook(c));
  }));

  app.get('/api/baselines', (req, res) => res.json(store.listBaselines().map((b) => ({
    id: b.id, name: b.name, version: b.version, updatedAt: b.updatedAt, cycles: b.cycles, history: b.history,
    counts: { requirements: b.requirements.length, testCases: b.testCases.length, scripts: b.scripts.length },
  }))));
  app.get('/api/baselines/:id', (req, res) => {
    const b = store.getBaseline(req.params.id, req.query.version);
    if (!b) return res.status(404).json({ error: 'Baseline not found' });
    res.json(b);
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.status || 500).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  });
  return { app, store, pipeline, skills: skillLib };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const { app } = createApp({ dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data') });
  app.listen(port, () => console.log(`${APP_TITLE} listening on http://localhost:${port}`));
}

module.exports = { createApp };
