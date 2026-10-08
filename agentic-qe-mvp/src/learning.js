'use strict';
// Learning memory shared by every cycle: what reviewers decided, what people accepted or rejected, and which
// defects were raised, confirmed or fixed. The next cycle applies it in code (pre-filled decisions, risk-based
// priority, suppressed suggestions) and hands it to the AI prompts as guidance. Every lesson names its source.
const { similarity } = require('./text');

const EMPTY = () => ({ decisions: [], exclusions: [], feedback: [], defects: [], updatedAt: null });
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const conflictKey = (g) => `${g.subject}|${g.options.map((o) => o.signature).sort().join('/')}`;
const similar = (a, b) => similarity(a, b) >= 0.6;
const VERDICTS = { requirement: ['accept', 'reject'], testcase: ['accept', 'reject'], script: ['accept', 'reject'], defect: ['confirm', 'not-a-defect'] };

function upsert(list, item, same) {
  const i = list.findIndex(same);
  if (i >= 0) list[i] = item; else list.push(item);
}

/** Records the human review of a requirement set: conflict choices and exclusions. */
function recordReview(memory, cycle) {
  const { reviewer: by, at, excluded = [], resolutions = {} } = cycle.review;
  for (const g of cycle.normalisation.groups) {
    const optionId = resolutions[g.id];
    if (g.bucket === 'conflict' && optionId) {
      const o = g.options.find((x) => x.optionId === optionId);
      upsert(memory.decisions, { key: conflictKey(g), subject: g.subject, chosenSignature: o.signature, chosenSources: o.sources, chosenText: o.text,
        rejected: g.options.filter((x) => x !== o).map((x) => ({ signature: x.signature, sources: x.sources })), cycleId: cycle.id, by, at }, (d) => d.key === conflictKey(g));
    }
    if (excluded.includes(g.id)) {
      const text = g.text || g.options.map((x) => x.text).join(' / ');
      upsert(memory.exclusions, { text, key: norm(text), cycleId: cycle.id, by, at, reason: cycle.review.comment || 'excluded by the reviewer' }, (e) => e.key === norm(text));
    }
  }
  memory.updatedAt = at;
}

/** Rows rejected at the merge gate count as rejected requirements. */
function recordMergeRejections(memory, cycle, rejectedIds, by) {
  const reqs = new Map((cycle.artifacts.requirements || []).map((r) => [r.id, r]));
  const at = new Date().toISOString();
  for (const id of rejectedIds) {
    const r = reqs.get(id);
    if (r) memory.feedback.push({ target: 'requirement', id, verdict: 'reject', note: 'rejected at the merge gate', by, at, cycleId: cycle.id, text: r.text, requirementText: r.text });
  }
  memory.updatedAt = at;
}

/** User feedback on an AI requirement, test case, script or a defect. Returns the recorded item. */
function recordFeedback(memory, cycle, { target, id, verdict, note = '', by }) {
  if (!VERDICTS[target]) throw new Error(`target must be one of ${Object.keys(VERDICTS).join(', ')}`);
  if (!VERDICTS[target].includes(verdict)) throw new Error(`verdict for a ${target} must be ${VERDICTS[target].join(' or ')}`);
  if (!by || !String(by).trim()) throw new Error('Your name is required: every piece of feedback is recorded against a person');
  const a = cycle.artifacts || {};
  const reqText = (rid) => (a.requirements || []).find((r) => r.id === rid)?.text || null;
  let item;
  if (target === 'requirement') {
    const r = (a.requirements || []).find((x) => x.id === id);
    if (r) item = { text: r.text, requirementText: r.text, jiraKeys: r.jiraKeys };
  } else if (target === 'testcase') {
    const t = (a.testCases || []).find((x) => x.key === id);
    if (t) item = { text: t.name, requirementText: reqText(t.requirementId), jiraKeys: t.issueLinks, origin: t.origin || 'rules' };
  } else if (target === 'script') {
    const s = [...(a.scripts || []), ...(a.aiScripts || [])].find((x) => x.file === id);
    if (s) item = { text: s.caseName || s.file, requirementText: reqText(s.requirementId), origin: s.origin || (s.caseKey ? 'ai-draft' : 'rules'), caseName: s.caseName || null, body: s.body || null, writtenBy: s.by };
  } else {
    const d = (a.defects || []).find((x) => x.id === id);
    if (d) item = { text: d.title, requirementText: d.requirementText, jiraKeys: d.jiraKeys, testCaseKey: d.testCaseKey, testCaseName: (a.testCases || []).find((t) => t.key === d.testCaseKey)?.name || null };
  }
  if (!item) throw new Error(`No ${target} ${id} in ${cycle.id}`);
  const rec = { target, id, verdict, note: String(note || '').slice(0, 500), by: String(by).trim(), at: new Date().toISOString(), cycleId: cycle.id, ...item };
  upsert(memory.feedback, rec, (f) => f.cycleId === cycle.id && f.target === target && f.id === id);
  memory.updatedAt = rec.at;
  return rec;
}

/** Defects raised and resolved in a cycle, kept per story, requirement and code area. */
function recordDefects(memory, cycle) {
  const a = cycle.artifacts;
  const kindOf = new Map((a.testCases || []).map((t) => [t.key, t.kind]));
  for (const d of [...(a.defects || []), ...(a.resolvedDefects || [])]) {
    upsert(memory.defects, { id: d.id, cycleId: cycle.id, status: d.status, movement: d.movement, testCaseKey: d.testCaseKey, requirementText: d.requirementText,
      jiraKeys: d.jiraKeys || [], kind: kindOf.get(d.testCaseKey) || null, codeArea: d.suspectedCodeArea, severity: d.severity, firstSeenCycle: d.firstSeenCycle,
      confirmation: d.confirmation ? d.confirmation.status : null }, (x) => x.id === d.id && x.cycleId === cycle.id);
  }
  memory.updatedAt = new Date().toISOString();
}

const latestDefects = (memory) => {
  const byId = new Map();
  for (const d of memory.defects) byId.set(d.id, d);
  const verdict = new Map(memory.feedback.filter((f) => f.target === 'defect').map((f) => [f.id, f.verdict]));
  return [...byId.values()].filter((d) => verdict.get(d.id) !== 'not-a-defect');
};

/** Stories and requirement statements with defect history. */
function riskOf(memory) {
  const stories = new Map();
  const reqs = [];
  for (const d of latestDefects(memory)) {
    for (const k of d.jiraKeys) {
      const s = stories.get(k) || { story: k, defects: [] };
      if (!s.defects.includes(d.id)) s.defects.push(d.id);
      stories.set(k, s);
    }
    if (d.requirementText) reqs.push({ text: d.requirementText, defect: d.id, cycleId: d.cycleId, status: d.status });
  }
  return { stories: [...stories.values()], requirements: reqs };
}

/** Pre-filled review decisions for a new normalisation, each traced to the cycle and person that made it. */
function reviewLessons(memory, normalisation) {
  const resolutions = [];
  const exclusions = [];
  for (const g of normalisation.groups) {
    if (g.bucket === 'conflict') {
      const d = memory.decisions.find((x) => x.key === conflictKey(g));
      const o = d && g.options.find((x) => x.signature === d.chosenSignature);
      if (o) resolutions.push({ groupId: g.id, optionId: o.optionId, signature: o.signature, fromCycle: d.cycleId, by: d.by, lesson: `Same conflict decided in ${d.cycleId} by ${d.by}: ${d.chosenSignature} (${d.chosenSources.join('/')})` });
    }
    const text = g.text || g.options.map((x) => x.text).join(' / ');
    const e = memory.exclusions.find((x) => x.key === norm(text));
    if (e) exclusions.push({ groupId: g.id, fromCycle: e.cycleId, by: e.by, lesson: `Excluded in ${e.cycleId} by ${e.by}: ${e.reason}` });
  }
  return { resolutions, exclusions };
}

/**
 * Applies the memory to a freshly designed test pack, in place: cases of requirements or stories with defect
 * history become High priority with risk 'defect-history'; cases a person marked "not a defect" are flagged for review.
 * Returns the lessons applied.
 */
function applyToDesign(memory, requirements, testCases) {
  const applied = [];
  const risk = riskOf(memory);
  const riskStories = new Map(risk.stories.map((s) => [s.story, s]));
  const reqRisk = (r) => risk.requirements.find((x) => similar(x.text, r.text));
  const notDefect = memory.feedback.filter((f) => f.target === 'defect' && f.verdict === 'not-a-defect');
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const seen = new Set();
  for (const t of testCases) {
    const r = reqById.get(t.requirementId);
    if (!r) continue;
    const viaReq = reqRisk(r);
    const viaStory = (r.jiraKeys || []).map((k) => riskStories.get(k)).find(Boolean);
    if (viaReq || viaStory) {
      t.priority = 'High';
      t.risk = 'defect-history';
      const why = viaReq ? `${viaReq.defect} (${viaReq.cycleId}) on this requirement` : `${viaStory.defects.join(', ')} on story ${viaStory.story}`;
      t.learned = [...(t.learned || []), `High priority: defect history - ${why}`];
      const k = `risk|${r.id}`;
      if (!seen.has(k)) { seen.add(k); applied.push({ kind: 'risk', requirementId: r.id, lesson: `${r.id} tested at High priority: defect history - ${why}` }); }
    }
    const nd = notDefect.find((f) => f.testCaseName && f.testCaseName === t.name && f.requirementText && similar(f.requirementText, r.text));
    if (nd) {
      t.learned = [...(t.learned || []), `Marked "not a defect" by ${nd.by} in ${nd.cycleId}: a failure needs QE confirmation`];
      t.needsConfirmation = `Marked "not a defect" by ${nd.by} in ${nd.cycleId}${nd.note ? `: ${nd.note}` : ''}`;
      applied.push({ kind: 'not-a-defect', testCaseKey: t.key, lesson: `${t.key} failures need QE confirmation: ${nd.by} marked its defect not a defect in ${nd.cycleId}` });
    }
  }
  return applied;
}

/** AI scripts a person accepted, for a case with this name on a similar requirement. */
function acceptedScript(memory, requirementText, caseName) {
  return [...memory.feedback].reverse().find((f) => f.target === 'script' && f.verdict === 'accept' && f.body && f.caseName === caseName && f.requirementText && similar(f.requirementText, requirementText));
}

/** AI suggestions a person already rejected (same requirement, similar name) are not offered again. */
function rejectedBefore(memory, target, requirementText, name) {
  return memory.feedback.find((f) => f.target === target && f.verdict === 'reject' && f.requirementText && similar(f.requirementText, requirementText)
    && (target === 'requirement' || similar(f.text, name)));
}

/** The lessons as prompt guidance, next to the skills. */
function guidance(memory) {
  const lines = [];
  const risk = riskOf(memory);
  if (risk.stories.length) lines.push(`Stories with defect history (design more negative and boundary cases for them): ${risk.stories.map((s) => `${s.story} (${s.defects.join(', ')})`).join('; ')}.`);
  const rej = memory.feedback.filter((f) => f.verdict === 'reject').slice(-15);
  if (rej.length) lines.push(`People rejected these suggestions; do not repeat them: ${rej.map((f) => `${f.target} "${f.text}"${f.note ? ` (${f.note})` : ''}`).join('; ')}.`);
  const acc = memory.feedback.filter((f) => f.verdict === 'accept').slice(-10);
  if (acc.length) lines.push(`People accepted these suggestions as useful; follow their style: ${acc.map((f) => `${f.target} "${f.text}"`).join('; ')}.`);
  const nd = memory.feedback.filter((f) => f.verdict === 'not-a-defect').slice(-10);
  if (nd.length) lines.push(`Failures a QE judged "not a defect" (likely test issues): ${nd.map((f) => `"${f.text}"${f.note ? ` - ${f.note}` : ''}`).join('; ')}.`);
  return lines.length ? `## What the platform learned from earlier cycles\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
}

/** Every lesson a cycle applied, flattened for reports. */
function adaptedIn(cycle) {
  const l = cycle.learned;
  if (!l) return [];
  return [
    ...l.review.resolutions.map((x) => ({ kind: 'review decision pre-filled', lesson: x.lesson })),
    ...l.review.exclusions.map((x) => ({ kind: 'exclusion pre-filled', lesson: x.lesson })),
    ...l.design.map((x) => ({ kind: { risk: 'risk-based priority', 'not-a-defect': 'needs QE confirmation', script: 'accepted AI script runs' }[x.kind] || x.kind, lesson: x.lesson })),
    ...l.suppressed.map((x) => ({ kind: 'rejected suggestion not repeated', lesson: `${x.requirementId}: ${x.lesson}` })),
    ...l.defects.map((x) => ({ kind: 'defect awaits confirmation', lesson: x.lesson })),
  ];
}

/** Summary for the Learning page and the reports. */
function summary(memory) {
  const risk = riskOf(memory);
  const count = (target, verdict) => memory.feedback.filter((f) => f.target === target && (!verdict || f.verdict === verdict)).length;
  return {
    updatedAt: memory.updatedAt,
    counts: { decisions: memory.decisions.length, exclusions: memory.exclusions.length, feedback: memory.feedback.length, defects: latestDefects(memory).length,
      rejected: memory.feedback.filter((f) => f.verdict === 'reject').length, accepted: memory.feedback.filter((f) => f.verdict === 'accept').length,
      notADefect: count('defect', 'not-a-defect'), confirmed: count('defect', 'confirm'), riskStories: risk.stories.length },
    decisions: memory.decisions, exclusions: memory.exclusions, feedback: memory.feedback, defects: latestDefects(memory), risk,
  };
}

module.exports = { EMPTY, recordReview, recordMergeRejections, recordFeedback, recordDefects, reviewLessons, applyToDesign, rejectedBefore, acceptedScript, guidance, summary, adaptedIn, riskOf, conflictKey, VERDICTS };
