'use strict';
// End-to-end traceability of a cycle: Jira item -> requirement -> business rule -> test case -> test data -> script -> result -> defect.
// EQE journeys also record the business capabilities (epics) they cross.

/** Jira items named by the cycle's inputs, with their level and parent. */
function jiraItems(inputs) {
  const items = new Map();
  for (const i of inputs || []) {
    if (i.slot !== 'initiative' && i.slot !== 'epic') continue;
    for (const h of i.hierarchy || i.ref.split(/[\s,]+/).filter(Boolean).map((key) => ({ key, summary: i.summary, children: [] }))) {
      items.set(h.key, { key: h.key, summary: h.summary, level: i.slot, parent: null });
      for (const c of h.children || []) items.set(c.key, { key: c.key, summary: c.summary, level: 'story', parent: h.key });
    }
  }
  const initiative = [...items.values()].find((x) => x.level === 'initiative');
  if (initiative) for (const x of items.values()) if (x.level === 'epic' && !x.parent) x.parent = initiative.key;
  return items;
}

/** The cycle's own Jira items plus the baseline's, which an incremental cycle re-tests through the carried pack. */
function cycleJiraItems(cycle) {
  const items = jiraItems(cycle.inputs);
  for (const x of cycle.baselineJiraItems || []) if (!items.has(x.key)) items.set(x.key, { ...x, fromBaseline: true });
  return items;
}

function computeTraceability(cycle) {
  const a = cycle.artifacts || {};
  const reqById = new Map((a.requirements || []).map((r) => [r.id, r]));
  const dataByCase = new Map((a.testData || []).map((d) => [d.testCaseKey, d]));
  const scriptByCase = new Map();
  for (const s of a.scripts || []) for (const k of s.covers || []) scriptByCase.set(k, s);
  const resultByCase = new Map(((a.execution && a.execution.results) || []).map((r) => [r.key, r]));
  const defectsByCase = new Map();
  for (const d of a.defects || []) defectsByCase.set(d.testCaseKey, [...(defectsByCase.get(d.testCaseKey) || []), d]);
  const items = cycleJiraItems(cycle);

  const rows = (a.testCases || []).map((t) => {
    const req = reqById.get(t.requirementId);
    const jira = (t.sourceRefs && t.sourceRefs.length ? t.sourceRefs : (req && req.jiraKeys) || []);
    const data = dataByCase.get(t.key);
    const script = scriptByCase.get(t.key);
    const res = resultByCase.get(t.key);
    const defects = defectsByCase.get(t.key) || [];
    return {
      jiraKeys: jira,
      jiraLevel: [...new Set(jira.map((k) => (items.get(k) || {}).level || 'issue'))].join(', '),
      requirementId: t.requirementId, requirement: req ? req.text : null, requirementStatus: req ? req.status : null,
      ruleId: t.ruleId || null,
      testCaseKey: t.key, testCase: t.name, testType: t.type, automation: t.automation, caseStatus: t.status || null,
      suite: t.suite || null, crosses: t.crosses || [],
      testDataId: data ? data.id : null,
      scriptFile: script ? script.file : (t.scriptFile || null),
      result: res ? res.status : t.inRun === false ? 'not in this run' : 'not executed',
      defects: defects.map((d) => d.id),
      jiraDefects: defects.map((d) => (d.jira && d.jira.key) || null).filter(Boolean),
    };
  });

  const referenced = new Set(rows.flatMap((r) => r.jiraKeys));
  const stories = [...items.values()].filter((it) => !it.fromBaseline || referenced.has(it.key)).map((it) => {
    const mine = rows.filter((r) => r.jiraKeys.includes(it.key));
    const reqs = new Set(mine.map((r) => r.requirementId));
    const failed = mine.filter((r) => r.result === 'failed').length;
    const passed = mine.filter((r) => r.result === 'passed').length;
    const defects = [...new Set(mine.flatMap((r) => r.defects))];
    const status = !mine.length ? 'not covered' : failed ? 'failing' : passed ? (passed === mine.filter((r) => r.automation === 'Automated' && r.result !== 'not in this run').length ? 'verified' : 'partly verified') : 'designed, not executed';
    return { key: it.key, level: it.level, parent: it.parent, summary: it.summary, scope: it.fromBaseline ? 'baseline' : 'this cycle', requirements: reqs.size, testCases: mine.length,
      automated: mine.filter((r) => r.automation === 'Automated').length, passed, failed, defects, status };
  });

  return {
    rows,
    stories,
    totals: {
      jiraItems: stories.length,
      covered: stories.filter((s) => s.testCases > 0).length,
      verified: stories.filter((s) => s.status === 'verified').length,
      failing: stories.filter((s) => s.status === 'failing').length,
      testCases: rows.length,
      withData: rows.filter((r) => r.testDataId).length,
      withScript: rows.filter((r) => r.scriptFile).length,
      executed: rows.filter((r) => r.result === 'passed' || r.result === 'failed').length,
    },
  };
}

module.exports = { computeTraceability, jiraItems, cycleJiraItems };
