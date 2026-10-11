'use strict';
// Gap analysis: a Jira story is a gap when the codebase input never mentions its key, i.e. the code
// does not implement anything the story asks for. Code-only rules and wrong values are not gaps.
const JIRA_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const TITLE = 'Asked for in Jira but not mentioned in the code';
const RECOMMENDATION = 'Exclude it from this cycle as a gap (a Minor gap defect is raised and the story is picked up again in the next release), or discuss with the developer and the product owner.';

/** Jira keys the code mentions (Javadoc, @rule tags, test names, traceability rows). */
function storyKeysIn(texts) {
  const keys = new Set();
  for (const t of texts) for (const k of String(t || '').match(JIRA_KEY) || []) keys.add(k);
  return [...keys].sort();
}

function epicOfStory(inputs) {
  const out = new Map();
  for (const i of inputs) for (const h of i.hierarchy || []) for (const c of h.children || []) out.set(c.key, { key: h.key, summary: h.summary });
  return out;
}

/** One finding per Jira story the code does not implement, with the requirement groups it owns. */
function findGaps({ normalisation, inputs = [] }) {
  const code = inputs.find((i) => i.slot === 'codebase');
  if (!code || !Array.isArray(code.storyKeys)) return [];
  const implemented = new Set(code.storyKeys);
  const epics = epicOfStory(inputs);
  const byId = new Map(normalisation.statements.map((s) => [s.id, s]));
  const stories = new Map();
  for (const s of normalisation.statements) {
    if (s.source !== 'jira' || s.origin?.kind !== 'jira-story' || !s.origin.ref || implemented.has(s.origin.ref)) continue;
    if (!stories.has(s.origin.ref)) stories.set(s.origin.ref, { summary: s.origin.summary || '', url: s.origin.url || null, statements: [], pickedUp: false });
    const st = stories.get(s.origin.ref);
    st.statements.push(s);
    if (s.origin.pickedUpFromGap) st.pickedUp = true;
  }
  return [...stories.entries()].map(([story, st], i) => {
    const ids = new Set(st.statements.map((s) => s.id));
    const groups = normalisation.groups.filter((g) => g.members.every((m) => ids.has(m) || byId.get(m)?.source !== 'jira') && g.members.some((m) => ids.has(m)) && !g.sources.includes('code'));
    const epic = epics.get(story) || null;
    return {
      id: `GAP-${String(i + 1).padStart(2, '0')}`, story, summary: st.summary, url: st.url, epic,
      severity: 'Minor', title: TITLE, recommendation: RECOMMENDATION,
      groupIds: groups.map((g) => g.id), statementCount: st.statements.length,
      statements: st.statements.map((s) => ({ id: s.id, text: s.text })),
      ...(st.pickedUp ? { pickedUpFromGap: true } : {}),
    };
  });
}

/** Raw Jira statements of the gaps a reviewer skipped, kept on the baseline for the next release. */
function skippedGapsOf(cycle, excludedStories) {
  const set = new Set(excludedStories);
  const defects = new Map([...(cycle.artifacts?.gapDefects || []), ...(cycle.artifacts?.defects || [])].filter((d) => d.type === 'gap').map((d) => [d.story, d.id]));
  return (cycle.gaps?.findings || []).filter((g) => set.has(g.story)).map((g) => {
    const raw = cycle.normalisation.statements.filter((s) => s.source === 'jira' && s.origin?.ref === g.story);
    return { story: g.story, summary: g.summary, epic: g.epic, defectId: defects.get(g.story) || null, skippedInCycle: cycle.id,
      statements: raw.map(({ id: _id, tokens: _t, signature: _s, values: _v, ...s }) => s) };
  });
}

/** Statements of earlier skipped gaps, re-entered into the next cycle as picked up from the gap. */
function pickUpStatements(skippedGaps = []) {
  return skippedGaps.flatMap((g) => g.statements.map((s) => ({ ...s, origin: { ...s.origin, pickedUpFromGap: g.skippedInCycle } })));
}

/** A Minor, non-blocking defect per excluded (or rejected) gap story. */
function gapDefects(cycle, findings, { startNo, reason }) {
  let n = startNo;
  const defects = findings.map((g) => {
    n += 1;
    return {
      id: `DEF-${String(n).padStart(3, '0')}`, type: 'gap', story: g.story,
      title: `${g.story} ${g.summary}: asked for in Jira but not implemented in the code`,
      severity: 'Minor', impact: 'requirement not implemented yet (gap); no test was run against it',
      blocksRelease: false, releaseDecision: `Does not block the release: ${reason}.`,
      status: 'Open', movement: 'new', firstSeenCycle: cycle.id, cycleId: cycle.id,
      testCaseKey: null, ruleId: null, requirementId: null, requirementText: g.statements.map((s) => s.text).join(' '),
      jiraKeys: [g.story], sourceRefs: [g.story, ...(g.epic ? [g.epic.key] : [])],
      suspectedCodeArea: `no code mentions ${g.story}`, expected: `Code implements ${g.story} (${g.statementCount} acceptance criteria)`,
      actual: `No code in ${cycle.sutBuild} mentions ${g.story}`, recommendation: g.recommendation,
      executedAt: null, occurrences: [{ cycleId: cycle.id, actual: 'gap' }], jira: null,
    };
  });
  return { defects, nextNo: n };
}

/** Closes earlier gap defects whose picked-up story now has every run case passing. */
function resolveGapDefects(previous, cycle, results) {
  const caseStories = new Map();
  const reqStories = new Map((cycle.artifacts.requirements || []).map((r) => [r.id, r.jiraKeys || []]));
  for (const t of cycle.artifacts.testCases || []) for (const k of reqStories.get(t.requirementId) || []) caseStories.set(t.key, [...(caseStories.get(t.key) || []), k]);
  const byStory = new Map();
  for (const r of results) for (const k of caseStories.get(r.key) || []) byStory.set(k, [...(byStory.get(k) || []), r]);
  const code = (cycle.inputs || []).find((i) => i.slot === 'codebase');
  const implemented = new Set((code && code.storyKeys) || []);
  const closed = [];
  const open = [];
  for (const d of previous.filter((x) => x.type === 'gap' && x.status !== 'Closed')) {
    const rs = (byStory.get(d.story) || []).filter((r) => r.status !== 'not-run');
    if (rs.length && rs.every((r) => r.status === 'passed')) {
      closed.push({ ...d, status: 'Closed', movement: 'fixed and retested', resolvedInCycle: cycle.id,
        retest: { cycleId: cycle.id, build: cycle.sutBuild || null, result: 'passed', cases: rs.map((r) => r.key) },
        certification: `${d.story} is implemented in build ${cycle.sutBuild}; ${rs.length} test(s) of the picked-up gap passed in ${cycle.id}, so ${d.id} (gap from ${d.firstSeenCycle}) is closed.` });
    } else if (!rs.length) {
      open.push({ ...d, movement: implemented.has(d.story) ? 'implemented in code, not yet verified by a test of this testing type' : 'still open', cycleId: cycle.id });
    }
  }
  return { closed, open };
}

module.exports = { findGaps, storyKeysIn, skippedGapsOf, pickUpStatements, gapDefects, resolveGapDefects, TITLE, RECOMMENDATION };
