'use strict';
// EQE PoC (Stages 1-3) API: binds the UI to the artifacts generated in ../eqe-poc and records human gate decisions.
const fs = require('fs');
const path = require('path');
const express = require('express');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'eqe-poc');
const DECISIONS = ['approved', 'refine', 'rejected'];
const GATES = ['UC1-STAGE1-SCOPE', 'UC1-STAGE2-APPROVAL', 'UC1-GATE1', 'UC2-WEEK1-READINESS', 'UC2-CODE-REVIEW', 'UC2-GATE-SCALE'];

function eqeRouter({ dir = process.env.EQE_POC_DIR || DEFAULT_DIR, rebuild = true } = {}) {
  const r = express.Router();
  const summaryFile = () => path.join(dir, 'artifacts', 'eqe-summary.json');
  const trailFile = () => path.join(dir, 'evidence', 'governance-trail.json');
  const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const summary = () => {
    if (!fs.existsSync(summaryFile())) { const e = new Error('EQE PoC artifacts not built yet: run "npm run build:artifacts" in eqe-poc/'); e.status = 404; throw e; }
    return readJson(summaryFile());
  };
  const refresh = async () => {
    if (!rebuild) return;
    await require(path.join(dir, 'scripts', 'build-artifacts.js')).build({ root: dir });
  };

  r.get('/', (req, res) => res.json({ ...summary(), trail: readJson(trailFile()).entries, gates: GATES, decisions: DECISIONS }));

  r.get('/file', (req, res) => {
    const rel = String(req.query.path || '');
    if (!summary().files.includes(rel)) return res.status(404).json({ error: 'Not an EQE PoC artifact' });
    const abs = path.join(dir, rel);
    if (rel.endsWith('.html') && !req.query.download) return res.type('html').send(fs.readFileSync(abs));
    return res.download(abs, path.basename(abs));
  });

  /** Human gate decision. Only people make decisions here: approver name, decision and measured review minutes are required. */
  r.post('/approvals', async (req, res, next) => {
    try {
      const { gate, decision, approver, reviewMinutes, note = '' } = req.body || {};
      const problems = [];
      if (!GATES.includes(gate)) problems.push(`gate must be one of ${GATES.join(', ')}`);
      if (!DECISIONS.includes(decision)) problems.push(`decision must be one of ${DECISIONS.join(', ')}`);
      if (!String(approver || '').trim() || /^devin$/i.test(String(approver).trim())) problems.push('approver must be the named human reviewer');
      if (typeof reviewMinutes !== 'number' || !(reviewMinutes > 0) || reviewMinutes > 600) problems.push('reviewMinutes must be the measured review time in minutes (1-600)');
      if (problems.length) return res.status(400).json({ error: 'Gate decision rejected', details: problems });
      const trail = readJson(trailFile());
      const prev = trail.entries.filter((e) => e.gate === gate).slice(-1)[0];
      const entry = { id: `GT-${String(trail.entries.length + 1).padStart(3, '0')}`, at: new Date().toISOString(), useCase: gate.slice(0, 3), gate, stage: prev ? prev.stage : (gate.startsWith('UC1') ? 2 : 3), subject: prev ? prev.subject : gate, decision, by: String(approver).trim(), reviewMinutes, note: String(note).slice(0, 500) };
      trail.entries.push(entry);
      fs.writeFileSync(trailFile(), `${JSON.stringify(trail, null, 2)}\n`);
      await refresh();
      return res.status(201).json(entry);
    } catch (e) { return next(e); }
  });
  return r;
}

module.exports = { eqeRouter, GATES, DECISIONS };
