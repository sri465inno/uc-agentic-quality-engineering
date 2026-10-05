'use strict';
// Golden-set comparison: Devin-generated cases vs a human-authored reference set, one-to-one by requirement and text similarity.
const fs = require('fs');
const path = require('path');
const { dice } = require('./text');

const DIR = path.join(__dirname, '..', 'golden-set');
const caseText = (c) => [c.title, c.objective, ...(c.steps || []).map((s) => `${s.action} ${s.expected}`), c.expected || ''].join(' ');

function loadGolden(epic, dir = DIR) {
  const file = path.join(dir, `${epic}.golden.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function compare(generated, golden) {
  const pairs = [];
  for (const g of golden) for (const c of generated) {
    const sim = dice(caseText(g), caseText(c));
    const sameReq = g.req === c.req;
    if ((sameReq && sim >= 0.15) || sim >= 0.45) pairs.push({ g: g.id, c: c.id, sim, sameReq });
  }
  pairs.sort((a, b) => (b.sameReq - a.sameReq) || (b.sim - a.sim));
  const usedG = new Set(); const usedC = new Set(); const matches = [];
  for (const p of pairs) if (!usedG.has(p.g) && !usedC.has(p.c)) { usedG.add(p.g); usedC.add(p.c); matches.push({ ...p, sim: Math.round(p.sim * 100) / 100 }); }
  const missed = golden.filter((g) => !usedG.has(g.id)).map((g) => ({ id: g.id, req: g.req, title: g.title }));
  const extra = generated.filter((c) => !usedC.has(c.id)).map((c) => ({ id: c.id, req: c.req, title: c.title }));
  const goldenReqs = new Set(golden.map((g) => g.req));
  const genReqs = new Set(generated.map((c) => c.req));
  return {
    goldenCount: golden.length, generatedCount: generated.length, matches, missed, extra,
    recall: golden.length ? matches.length / golden.length : null,
    precision: generated.length ? matches.length / generated.length : null,
    reqCoverageOfGolden: goldenReqs.size ? [...goldenReqs].filter((r) => genReqs.has(r)).length / goldenReqs.size : null,
  };
}

module.exports = { loadGolden, compare, DIR };
