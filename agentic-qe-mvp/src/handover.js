'use strict';
// What each agent actually produced, read from the persisted cycle, keyed by the artefact names skills declare.
const { getTestingType, suiteOf } = require('./testing-types');

const present = (v) => (v === undefined ? null : v);

const OUTPUTS = {
  normalise: (c) => {
    const g = c.normalisation?.groups;
    const by = (b) => (g ? g.filter((x) => x.bucket === b) : null);
    return {
      statements: { value: present(c.normalisation?.statements) },
      gaps: g ? { value: { jiraOnly: by('jira-only'), codeOnly: by('code-only') }, count: by('jira-only').length + by('code-only').length, allowEmpty: true } : { value: null },
      conflicts: { value: by('conflict'), allowEmpty: true },
    };
  },
  'review-agent': (c) => ({ suggestions: { value: present(c.reviewAgent?.findings), allowEmpty: true } }),
  delta: (c) => ({ delta: { value: present(c.delta?.items) } }),
  requirements: (c) => ({ requirements: { value: present(c.artifacts?.requirements) }, businessRules: { value: present(c.artifacts?.rules) } }),
  testcases: (c) => {
    const t = c.artifacts?.testCases;
    const tt = getTestingType(c.testingType);
    const run = t ? t.filter((x) => x.inRun !== false) : null;
    const of = (fn) => (run ? { value: run.filter(fn) } : { value: null });
    const skip = (what) => ({ na: `${tt.name} does not design ${what} cases` });
    return {
      testCases: { value: present(t) },
      functional: tt.produces.functional ? { value: t ? t.filter((x) => x.type === 'functional') : null } : skip('functional'),
      nonFunctional: tt.produces.nonFunctional ? { value: t ? t.filter((x) => x.type === 'non-functional') : null } : skip('non-functional'),
      reusedPack: { ...of(() => true), note: t ? `${t.filter((x) => x.status === 'carried over' && x.inRun !== false).length} carried-over case(s) re-run` : null },
      journeys: tt.id === 'eqe' ? of((x) => ['ui', 'journey'].includes(suiteOf(x))) : skip('journey'),
      ruleChecks: tt.id === 'functional' ? of((x) => suiteOf(x) === 'api') : skip('single-rule'),
    };
  },
  testdata: (c) => {
    const d = c.artifacts?.testData;
    return {
      dataSets: { value: present(d) },
      specConformance: d ? { value: d.filter((x) => x.conformance === 'does not conform'), allowEmpty: true, count: d.filter((x) => x.conformance !== 'does not conform').length, note: `${d.filter((x) => x.conformance === 'negative test').length} deliberately invalid for negative tests` } : { value: null },
    };
  },
  scripts: (c) => ({ specs: { value: present(c.artifacts?.scripts) } }),
  execution: (c) => {
    const e = c.artifacts?.execution;
    const ran = e ? e.results.filter((r) => r.status !== 'not-run') : null;
    return {
      results: { value: ran, note: e ? `${e.summary.notRun} manual case(s) handed over as not run` : null },
      screenshots: { value: ran ? ran.flatMap((r) => (r.evidence || []).filter((x) => x.contentType === 'image/png')) : null },
      timings: { value: ran ? ran.filter((r) => r.type === 'non-functional') : null },
    };
  },
  defects: (c) => ({ defects: { value: present(c.artifacts?.defects), allowEmpty: true } }),
  report: (c) => ({
    cycleReport: { value: present(c.report) },
    testCaseExport: { value: present(c.artifacts?.exports?.testCases) },
    comparison: c.type === 'baseline'
      ? { na: 'Baseline cycle - there is no previous cycle to compare against' }
      : { value: present(c.comparison) },
  }),
};

function producedBy(agentId, cycle) {
  const f = OUTPUTS[agentId];
  return f ? f(cycle) : {};
}

module.exports = { OUTPUTS, producedBy };
