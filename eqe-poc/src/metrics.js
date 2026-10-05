'use strict';
// PoC success criteria, measured from the run (never typed in). A value is null until the data behind it exists.
const THRESHOLDS = {
  uc1: { acCoverage: 0.8, hallucinationRate: 0.1, reviewMinutesPerEpic: 20 },
  uc2: { dataMapped: 0.85, reviewMinutesPerSpec: 25, flakeRate: 0.05, runs: 5, startCases: 3 },
};
const ratio = (a, b) => (b ? a / b : null);

function uc1(run) {
  const s1 = run.stage1; const s2 = run.stage2;
  if (!s1 || !s2) return { ready: false };
  const acs = s1.requirements.filter((r) => r.kind === 'AC');
  const verdicts = s2.verdicts || {};
  const rejectedIds = new Set(Object.entries(verdicts).filter(([, v]) => v.verdict === 'hallucinated' || v.verdict === 'incorrect').map(([k]) => k));
  const kept = s2.cases.filter((c) => !rejectedIds.has(c.id));
  const coveredAcs = acs.filter((r) => kept.some((c) => c.req === r.id));
  const reviewed = s2.cases.filter((c) => verdicts[c.id]);
  const hallucinated = s2.cases.filter((c) => (verdicts[c.id] || {}).verdict === 'hallucinated');
  const gate = (run.gates || {}).cases || {};
  const reviewMinutes = gate.minutes ?? null;
  const out = {
    ready: true,
    acTotal: acs.length, acCovered: coveredAcs.length, acCoverage: ratio(coveredAcs.length, acs.length),
    uncoveredAcs: acs.filter((r) => !coveredAcs.includes(r)).map((r) => r.id),
    casesGenerated: s2.cases.length, casesReviewed: reviewed.length, hallucinated: hallucinated.length,
    hallucinationRate: reviewed.length === s2.cases.length ? ratio(hallucinated.length, s2.cases.length) : null,
    reviewMinutesTotal: reviewMinutes, reviewMinutesPerEpic: reviewMinutes === null ? null : reviewMinutes / run.epics.length,
    golden: s2.golden || null, qeLeadApproved: gate.status === 'approved' && /qe lead/i.test(gate.role || ''),
  };
  const t = THRESHOLDS.uc1;
  out.checks = {
    acCoverage: out.acCoverage === null ? null : out.acCoverage >= t.acCoverage,
    hallucinationRate: out.hallucinationRate === null ? null : out.hallucinationRate <= t.hallucinationRate,
    reviewMinutesPerEpic: out.reviewMinutesPerEpic === null ? null : out.reviewMinutesPerEpic < t.reviewMinutesPerEpic,
    qeLeadApproved: gate.status ? out.qeLeadApproved : null,
  };
  out.passed = Object.values(out.checks).every((v) => v === true);
  return out;
}

function uc2(run) {
  const s3 = run.stage3;
  if (!s3 || !s3.cases) return { ready: false };
  const needs = s3.cases.flatMap((c) => c.dataNeeds.length ? c.dataNeeds : []);
  const mapped = needs.filter((n) => s3.playbookKeys.includes(n));
  const gate = (run.gates || {}).code || {};
  const runs = s3.runs || [];
  const tests = {};
  for (const r of runs) for (const t of r.tests) (tests[t.id] = tests[t.id] || []).push(t.status);
  const ids = Object.keys(tests);
  const flaky = ids.filter((id) => new Set(tests[id].map((s) => (s === 'passed' ? 'p' : 'f'))).size > 1);
  const alwaysFail = ids.filter((id) => tests[id].every((s) => s !== 'passed'));
  const complete = runs.length >= THRESHOLDS.uc2.runs;
  const out = {
    ready: true, specs: s3.cases.length, dataNeeds: needs.length, dataMappedCount: mapped.length,
    dataMapped: needs.length ? mapped.length / needs.length : (s3.cases.length ? 1 : null),
    runsCompleted: runs.length, runsRequired: THRESHOLDS.uc2.runs,
    perTest: ids.map((id) => ({ id, statuses: tests[id], flaky: flaky.includes(id), alwaysFail: alwaysFail.includes(id) })),
    flaky: flaky.length, alwaysFail: alwaysFail.length,
    flakeRate: complete && ids.length ? flaky.length / ids.length : null,
    passRate: runs.length ? runs.reduce((n, r) => n + r.tests.filter((t) => t.status === 'passed').length, 0) / runs.reduce((n, r) => n + r.tests.length, 0) : null,
    reviewMinutesTotal: gate.minutes ?? null, reviewMinutesPerSpec: gate.minutes == null ? null : gate.minutes / Math.max(1, s3.cases.length),
    codeApproved: gate.status === 'approved',
  };
  const t = THRESHOLDS.uc2;
  out.checks = {
    dataMapped: out.dataMapped === null ? null : out.dataMapped >= t.dataMapped,
    reviewMinutesPerSpec: out.reviewMinutesPerSpec === null ? null : out.reviewMinutesPerSpec < t.reviewMinutesPerSpec,
    flakeRate: out.flakeRate === null ? null : out.flakeRate < t.flakeRate,
    codeApproved: gate.status ? out.codeApproved : null,
  };
  out.passed = Object.values(out.checks).every((v) => v === true);
  return out;
}

/** Scaling locks: UC1 1 -> 4-6 epics and UC2 3 -> 5+ cases only after a run passed the previous gate. */
function scaling(runs) {
  const uc1Run = runs.find((r) => uc1(r).passed);
  const uc2Run = runs.find((r) => uc2(r).passed);
  return {
    uc1: { maxEpics: uc1Run ? 6 : 1, unlockedBy: uc1Run ? uc1Run.id : null },
    uc2: { maxCases: uc2Run ? 50 : THRESHOLDS.uc2.startCases, unlockedBy: uc2Run ? uc2Run.id : null },
  };
}

module.exports = { THRESHOLDS, uc1, uc2, scaling };
