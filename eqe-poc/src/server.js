'use strict';
const path = require('path');
const express = require('express');
const { Store } = require('./store');
const { Pipeline, HttpError, VERDICTS, GATES } = require('./pipeline');
const jira = require('./jira');
const metrics = require('./metrics');
const { STAGES } = require('./artifacts');
const { createDemoBooking } = require('../demo-booking/server');

function createApp({ dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'), port = Number(process.env.PORT || 3000), runs } = {}) {
  const store = new Store(dataDir);
  const pipeline = new Pipeline({ store, baseURL: process.env.TARGET_BASE_URL || `http://127.0.0.1:${port}/demo-booking/`, runs });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/demo-booking', createDemoBooking());
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(e instanceof HttpError ? e.status : 500).json({ error: e.message }));

  app.get('/api/meta', wrap(async (req, res) => res.json({ mode: jira.mode(), initiatives: jira.listInitiatives(), thresholds: metrics.THRESHOLDS, scaling: metrics.scaling(store.list()), stages: STAGES, verdicts: VERDICTS, gates: GATES, target: pipeline.baseURL })));
  app.get('/api/initiatives/:key', wrap(async (req, res) => {
    const d = await jira.loadInitiative(req.params.key);
    res.json({ mode: d.mode, initiative: { key: d.initiative.key, summary: d.initiative.summary, url: d.initiative.url }, epics: d.epics.map((e) => ({ key: e.key, summary: e.summary, url: e.url, stories: e.stories.length })) });
  }));
  app.get('/api/runs', wrap(async (req, res) => res.json(store.list().map((r) => ({ id: r.id, createdAt: r.createdAt, status: r.status, initiative: r.initiative, epics: r.epics, mode: r.mode.kind })).reverse())));
  app.get('/api/runs/:id', wrap(async (req, res) => res.json(pipeline.view(pipeline.load(req.params.id)))));
  app.post('/api/runs', wrap(async (req, res) => res.status(201).json(pipeline.view(await pipeline.create(req.body)))));
  app.post('/api/runs/:id/gates/:gate/start', wrap(async (req, res) => res.json(pipeline.view(await pipeline.startReview(req.params.id, req.params.gate, req.body)))));
  app.post('/api/runs/:id/gates/:gate/decision', wrap(async (req, res) => res.json(pipeline.view(await pipeline.decide(req.params.id, req.params.gate, req.body)))));
  app.post('/api/runs/:id/cases/:caseId/verdict', wrap(async (req, res) => res.json(pipeline.view(await pipeline.verdict(req.params.id, req.params.caseId, req.body)))));
  app.post('/api/runs/:id/golden', wrap(async (req, res) => res.json(pipeline.view(await pipeline.replaceGolden(req.params.id, req.body.set, req.body)))));
  app.post('/api/runs/:id/stage3', wrap(async (req, res) => res.status(202).json(pipeline.view(await pipeline.startStage3(req.params.id, req.body)))));
  app.get('/runs/:id/artifacts/*name', (req, res) => {
    if (!/^RUN-\d+$/.test(req.params.id)) return res.status(404).end();
    const base = path.resolve(store.artifactsDir(req.params.id));
    const file = path.resolve(base, [].concat(req.params.name).join('/'));
    if (!file.startsWith(base + path.sep)) return res.status(400).end();
    return res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });
  app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: (r) => r.setHeader('Cache-Control', 'no-cache') }));
  app.get('/{*any}', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
  return { app, store, pipeline };
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp({ port }).app.listen(port, () => console.log(`eqe-poc on http://localhost:${port} (${jira.mode().label})`));
}
