'use strict';
// UC1 measurement: traceability, AC coverage, grounding (hallucination), duplicates and negatives, all computed from
// the Devin-authored Stage-1/2 design against the verbatim Jira text. Nothing here is a typed-in number.
const fs = require('fs');
const path = require('path');
const { loadEpic } = require('./jira');

const ROOT = path.join(__dirname, '..');
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

async function loadDesign(epicKey, { env = process.env, root = ROOT, initiative = 'AQPI-1' } = {}) {
  const dir = path.join(root, 'design', initiative, epicKey);
  return {
    jira: await loadEpic(epicKey, env),
    stage1: readJson(path.join(dir, 'stage-1.json')),
    stage2: readJson(path.join(dir, 'stage-2.json')),
    playbook: readJson(path.join(root, 'test-data', 'demo-booking.playbook.json')),
    trail: readJson(path.join(root, 'evidence', 'governance-trail.json'), { entries: [] }),
    golden: readJson(path.join(root, 'golden-set', `${epicKey}.golden.json`), null),
  };
}

function requirementIndex(jira) {
  const idx = new Map();
  for (const it of [jira.epic, ...jira.stories]) {
    for (const x of it.acceptanceCriteria) idx.set(x.id, { ...x, kind: 'AC', story: it.key, level: it === jira.epic ? 'epic' : 'story' });
    for (const x of it.businessRules) idx.set(x.id, { ...x, kind: 'BR', story: it.key, level: it === jira.epic ? 'epic' : 'story' });
  }
  return idx;
}

/** Every claim a case makes about the source: trace quotes and step "proves" references. */
function grounding(stage2, idx) {
  const claims = [];
  for (const c of stage2.cases) {
    const traceIds = new Set(c.traces.map((t) => t.id));
    for (const t of c.traces) {
      const req = idx.get(t.id);
      const ok = !!req && norm(req.text).includes(norm(t.quote));
      claims.push({ case: c.id, kind: 'trace', ref: t.id, quote: t.quote, grounded: ok, reason: ok ? '' : (req ? 'quote not found verbatim in Jira text' : 'requirement ID not in Jira') });
    }
    for (const [i, s] of c.steps.entries()) {
      for (const p of s.proves) {
        const ok = idx.has(p) && traceIds.has(p);
        claims.push({ case: c.id, kind: 'step', ref: p, quote: `step ${i + 1}: ${s.expected}`, grounded: ok, reason: ok ? '' : (idx.has(p) ? 'step proves an ID the case does not trace' : 'requirement ID not in Jira') });
      }
    }
    if (c.type === 'negative') {
      const ok = !!c.negativeRequestedBy && idx.has(c.negativeRequestedBy);
      claims.push({ case: c.id, kind: 'negative-request', ref: c.negativeRequestedBy || '-', quote: 'negative case requested by', grounded: ok, reason: ok ? '' : 'negative case without a source request (G3)' });
    }
  }
  const ungrounded = claims.filter((x) => !x.grounded);
  return { claims, ungrounded, rate: pct(ungrounded.length, claims.length) };
}

function coverage(stage2, idx) {
  const rows = [...idx.values()].map((r) => ({ ...r, cases: stage2.cases.filter((c) => c.traces.some((t) => t.id === r.id)).map((c) => c.id) }));
  const storyAcs = rows.filter((r) => r.kind === 'AC' && r.level === 'story');
  const storyBrs = rows.filter((r) => r.kind === 'BR' && r.level === 'story');
  return {
    rows,
    ac: { covered: storyAcs.filter((r) => r.cases.length).length, total: storyAcs.length, pct: pct(storyAcs.filter((r) => r.cases.length).length, storyAcs.length) },
    br: { covered: storyBrs.filter((r) => r.cases.length).length, total: storyBrs.length, pct: pct(storyBrs.filter((r) => r.cases.length).length, storyBrs.length) },
    uncovered: rows.filter((r) => !r.cases.length).map((r) => r.id),
  };
}

/** Duplicate candidates: same trace set; overlaps: shared trace IDs. Missing negatives: story without a negative case when negatives are requested. */
function quality(stage1, stage2, jira) {
  const key = (c) => c.traces.map((t) => t.id).sort().join('|');
  const dup = [];
  const overlap = [];
  stage2.cases.forEach((a, i) => stage2.cases.slice(i + 1).forEach((b) => {
    const shared = a.traces.map((t) => t.id).filter((id) => b.traces.some((t) => t.id === id));
    if (key(a) === key(b) && JSON.stringify(a.data) === JSON.stringify(b.data)) dup.push({ a: a.id, b: b.id, shared });
    else if (shared.length) overlap.push({ a: a.id, b: b.id, shared, note: 'Shares a requirement but differs in data/assertion; kept, flag for QE-lead review' });
  }));
  const requested = !!(stage1.scope && stage1.scope.negativesRequestedBy);
  const negatives = jira.stories.map((s) => {
    const cs = stage2.cases.filter((c) => c.story === s.key);
    return { story: s.key, positive: cs.filter((c) => c.type === 'positive').length, negative: cs.filter((c) => c.type === 'negative').length, missingNegative: requested && !cs.some((c) => c.type === 'negative') };
  });
  return { duplicates: dup, overlaps: overlap, negatives, negativesRequested: requested };
}

/** Golden-set comparison: a golden case is matched by the Devin case with the most overlapping traces (Jaccard >= 0.5). */
function compareGolden(golden, stage2, idx) {
  if (!golden || !Array.isArray(golden.cases) || !golden.cases.length) {
    return { status: 'pending-golden-set', note: 'Golden set (12-15 human-authored cases) not yet supplied by the QE lead; comparison not run.', authoredBy: golden ? golden.authoredBy : null };
  }
  const jac = (a, b) => { const A = new Set(a); const B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; return i / (new Set([...A, ...B]).size || 1); };
  const matches = golden.cases.map((g) => {
    let best = null;
    for (const c of stage2.cases) {
      const s = jac(g.traces, c.traces.map((t) => t.id));
      if (!best || s > best.score) best = { case: c.id, score: Math.round(s * 100) / 100 };
    }
    return { golden: g.id, title: g.title, traces: g.traces, match: best && best.score >= 0.5 ? best : null };
  });
  const matchedDevin = new Set(matches.filter((m) => m.match).map((m) => m.match.case));
  const goldenAcs = new Set(golden.cases.flatMap((g) => g.traces).filter((id) => idx.has(id)));
  const devinAcs = new Set(stage2.cases.flatMap((c) => c.traces.map((t) => t.id)));
  return {
    status: 'compared',
    authoredBy: golden.authoredBy,
    goldenCases: golden.cases.length,
    matched: matches.filter((m) => m.match).length,
    recall: pct(matches.filter((m) => m.match).length, golden.cases.length),
    devinOnly: stage2.cases.filter((c) => !matchedDevin.has(c.id)).map((c) => c.id),
    missedRequirements: [...goldenAcs].filter((id) => !devinAcs.has(id)),
    matches,
  };
}

function gateEntries(trail, gate) { return (trail.entries || []).filter((e) => e.gate === gate); }

function reviewMinutes(trail, gate) {
  const done = gateEntries(trail, gate).filter((e) => e.decision !== 'pending' && typeof e.reviewMinutes === 'number');
  return done.length ? done[done.length - 1].reviewMinutes : null;
}

async function analyseEpic(epicKey, opts = {}) {
  const d = await loadDesign(epicKey, opts);
  const idx = requirementIndex(d.jira);
  const g = grounding(d.stage2, idx);
  const cov = coverage(d.stage2, idx);
  const q = quality(d.stage1, d.stage2, d.jira);
  const golden = compareGolden(d.golden, d.stage2, idx);
  const review = reviewMinutes(d.trail, 'UC1-STAGE2-APPROVAL');
  const approval = gateEntries(d.trail, 'UC1-GATE1').slice(-1)[0] || null;
  const thresholds = [
    { metric: 'AC coverage', target: '>= 80%', value: cov.ac.pct, unit: '%', met: cov.ac.pct !== null && cov.ac.pct >= 80, how: `${cov.ac.covered}/${cov.ac.total} story ACs traced by at least one case (computed from Jira export + stage-2.json)` },
    { metric: 'Hallucination rate', target: '<= 10%', value: g.rate, unit: '%', met: g.rate !== null && g.rate <= 10, how: `${g.ungrounded.length}/${g.claims.length} source claims ungrounded (automated verbatim grounding check); golden-set check: ${golden.status}` },
    { metric: 'Review time per epic', target: '< 20 min', value: review, unit: 'min', met: review === null ? null : review < 20, how: review === null ? 'Not yet measured: recorded by the QE lead at the Stage-2 approval gate' : 'Recorded by the QE lead in the governance trail' },
    { metric: 'Golden-set recall', target: 'report', value: golden.recall ?? null, unit: '%', met: null, how: golden.status === 'compared' ? `${golden.matched}/${golden.goldenCases} golden cases matched` : golden.note },
    { metric: 'QE-lead approval to scale', target: 'approved', value: approval ? approval.decision : 'pending', unit: '', met: approval && approval.decision !== 'submitted' ? approval.decision === 'approved' : null, how: 'Governance trail gate UC1-GATE1' },
  ];
  return { epic: epicKey, generatedAt: new Date().toISOString(), jira: { mode: d.jira.mode, label: d.jira.label, site: d.jira.site }, ...d, index: [...idx.values()], grounding: g, coverage: cov, quality: q, golden, thresholds };
}

module.exports = { analyseEpic, loadDesign, requirementIndex, grounding, coverage, quality, compareGolden, reviewMinutes, gateEntries, pct, ROOT, readJson };
