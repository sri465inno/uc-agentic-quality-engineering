'use strict';
// QE lead report: the cycle written up the way a senior QE lead would, computed from the persisted cycle and its report.
const { esc, table } = require('./report');
const { jiraDefectText } = require('./connectors/jira-defects');
const { TESTING_TYPES } = require('./testing-types');

const SOURCE_TEXT = { live: 'Jira (live call)', github: 'pulled from GitHub', 'jira-export': 'Jira export on GitHub', fixture: 'recorded fixture', pasted: 'pasted by the user' };
const date = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const movementText = (defects) => Object.entries(defects.reduce((m, d) => ({ ...m, [d.movement]: (m[d.movement] || 0) + 1 }), {})).map(([k, v]) => `${v} ${k}`).join(', ');

const DEFAULT_POLICY = {
  thresholds: { blockingSeverity: ['Critical'], minPassRate: ['95'] },
  noGo: ['requirement-set-not-approved', 'blocking-defect', 'pass-rate-below-minimum', 'automated-case-not-run', 'failed-case-without-defect', 'evidence-mismatch', 'journey-failed', 'story-not-traced'],
  conditional: ['open-gap-defect', 'open-defect-below-blocking'],
  noted: ['manual-case-not-run', 'requirement-not-verified-by-this-track'],
};

/** The release-criteria skill of the cycle: the one written for its track first, then the general one, else the built-in default. */
function releasePolicy(cycle) {
  const all = (cycle.skills || []).filter((s) => s.settings && (s.settings.noGo || s.settings.conditional || s.settings.noted));
  const skill = all.find((s) => s.testingType === cycle.testingType) || all.find((s) => !s.testingType) || null;
  const set = skill ? skill.settings : DEFAULT_POLICY;
  const th = set.thresholds || {};
  return {
    source: skill ? `${skill.name} (${skill.file || skill.id})` : 'Built-in default release criteria',
    blockingSeverity: [].concat(th.blockingSeverity || DEFAULT_POLICY.thresholds.blockingSeverity),
    minPassRate: Number([].concat(th.minPassRate || DEFAULT_POLICY.thresholds.minPassRate)[0]),
    action: Object.fromEntries([...[].concat(set.noted || []).map((k) => [k, 'noted']), ...[].concat(set.conditional || []).map((k) => [k, 'conditional']), ...[].concat(set.noGo || []).map((k) => [k, 'no-go'])]),
  };
}

/** Each release parameter, computed from the stored cycle evidence: triggered items (empty when clear). */
function releaseParameters(cycle, r, policy) {
  const a = cycle.artifacts;
  const defects = a.defects || [];
  const results = (a.execution && a.execution.results) || [];
  const resultOf = new Map(results.map((x) => [x.key, x.status]));
  const inRun = (a.testCases || []).filter((t) => t.inRun !== false);
  const auto = inRun.filter((t) => t.automation === 'Automated');
  const ex = r.execution.executed ? r.execution.summary : null;
  const review = r.approvals.find((x) => x.gate === 'Requirement set review');
  const isBlocking = (d) => d.type !== 'gap' && (d.blocksRelease || policy.blockingSeverity.includes(d.severity));
  const stories = r.traceability ? r.traceability.stories : [];
  const gapStories = new Set([...defects, ...(a.resolvedDefects || [])].filter((d) => d.type === 'gap').map((d) => d.story));
  const isEqe = cycle.testingType === 'eqe';
  const P = (id, label, items, track = null) => ({ id, label, items, track });
  return [
    P('requirement-set-not-approved', 'Requirement set approved by a named reviewer', review && review.by ? [] : ['no named approval']),
    P('blocking-defect', `No open defect at ${policy.blockingSeverity.join(' / ')} severity or marked release-blocking`, defects.filter(isBlocking).map((d) => `${d.id} ${d.severity} (${(d.jiraKeys || []).join(', ')})`)),
    P('pass-rate-below-minimum', `Automation pass rate at least ${policy.minPassRate}%`, ex && ex.executed && ex.passRate < policy.minPassRate ? [`${ex.passRate}%`] : []),
    P('automated-case-not-run', 'Every automation test case in the run executed', auto.filter((t) => !['passed', 'failed'].includes(resultOf.get(t.key))).map((t) => t.key)),
    P('failed-case-without-defect', 'Every failed test case has a defect', results.filter((x) => x.status === 'failed' && !defects.some((d) => d.testCaseKey === x.key)).map((x) => x.key)),
    P('evidence-mismatch', 'Every report figure matches the stored evidence', evidenceCheck(cycle, r).filter((x) => x.status !== 'reconciled').map((x) => x.figure)),
    ...(isEqe ? [P('journey-failed', 'Every business journey passed end to end', auto.filter((t) => t.suite === 'journey' && resultOf.get(t.key) !== 'passed').map((t) => t.key), 'EQE')] : []),
    ...(!isEqe ? [P('story-not-traced', 'Every Jira story in scope traced to a test case or a gap defect', stories.filter((x) => x.level === 'story' && x.scope !== 'baseline' && !x.testCases && !gapStories.has(x.key)).map((x) => x.key), 'DQE')] : []),
    ...(cycle.gaps?.applicable === false ? [] : [P('open-gap-defect', 'No open defect for a Jira story missing from the code', defects.filter((d) => d.type === 'gap').map((d) => `${d.id} (${d.story})`))]),
    P('open-defect-below-blocking', 'No other open defect', defects.filter((d) => d.type !== 'gap' && !isBlocking(d)).map((d) => `${d.id} ${d.severity}`)),
    P('manual-case-not-run', 'Manual test cases run and recorded', inRun.filter((t) => t.automation !== 'Automated').map((t) => t.key)),
    P('requirement-not-verified-by-this-track', 'Every requirement verified by a passing test of this testing type', (r.coverage?.rows || []).filter((x) => !/passing/.test(x.status)).map((x) => x.requirementId)),
  ];
}

const ACTION_TEXT = { 'no-go': 'No-go if triggered', conditional: 'Conditional go if triggered', noted: 'Noted only', off: 'Not applied' };

function recommendation(cycle, r) {
  const policy = releasePolicy(cycle);
  const params = releaseParameters(cycle, r, policy).map((x) => {
    const action = policy.action[x.id] || 'off';
    return { ...x, action, actionText: ACTION_TEXT[action], status: x.items.length ? 'triggered' : 'clear', detail: x.items.length ? `${x.items.length}: ${x.items.slice(0, 8).join(', ')}${x.items.length > 8 ? ', …' : ''}` : 'clear' };
  });
  const criteria = { source: policy.source, blockingSeverity: policy.blockingSeverity, minPassRate: policy.minPassRate, parameters: params };
  const gap = (r.testing?.selection?.gaps || []).find((g) => g.severity === 'high');
  if (!r.execution.executed) return { decision: 'Not ready', tone: 'bad', reason: gap ? gap.message : 'The tests have not been executed yet.', conditions: gap ? [gap.message] : [], criteria };
  const hit = (action) => params.filter((x) => x.action === action && x.status === 'triggered');
  const noGo = hit('no-go');
  const cond = hit('conditional');
  const noted = hit('noted');
  const notedText = noted.length ? ` Noted, not deciding: ${noted.map((x) => `${x.label.toLowerCase()} (${x.items.length} open)`).join('; ')}.` : '';
  if (noGo.length) {
    return { decision: 'No-go', tone: 'bad', reason: `No-go criteria not met: ${noGo.map((x) => `${x.label} (${x.detail})`).join('; ')}.`,
      conditions: noGo.flatMap((x) => (x.id === 'blocking-defect'
        ? (cycle.artifacts.defects || []).filter((d) => x.items.some((i) => i.startsWith(`${d.id} `))).map((d) => `Fix ${d.id} and re-run ${d.testCaseKey}; it must pass before release.`)
        : [`${x.label}: ${x.detail}.`])), criteria };
  }
  if (cond.length) {
    return { decision: 'Conditional go', tone: 'warn', reason: `No no-go criterion is triggered; open items to accept or close: ${cond.map((x) => `${x.label.toLowerCase()} (${x.detail})`).join('; ')}.${notedText}`,
      conditions: cond.map((x) => `${x.label}: ${x.detail}.`), criteria };
  }
  return { decision: 'Go', tone: 'ok', reason: `Every no-go and conditional release criterion is clear.${notedText}`, conditions: [], criteria };
}

/** Exit criteria of the cycle's track, each met, not met or open, computed from the cycle evidence. */
function exitCriteria(cycle, r, track) {
  const a = cycle.artifacts;
  const defects = a.defects || [];
  const results = (a.execution && a.execution.results) || [];
  const resultOf = new Map(results.map((x) => [x.key, x.status]));
  const ran = (t) => ['passed', 'failed'].includes(resultOf.get(t.key));
  const review = r.approvals.find((x) => x.gate === 'Requirement set review');
  const excluded = new Set((cycle.review && cycle.review.excluded) || []);
  const gapsFound = ((cycle.gaps && cycle.gaps.findings) || []).filter((g) => (g.groupIds || []).some((id) => excluded.has(id)));
  const gapRaised = gapsFound.filter((g) => [...defects, ...(a.resolvedDefects || [])].some((d) => d.type === 'gap' && d.story === g.story));
  const failed = results.filter((x) => x.status === 'failed');
  const unraised = failed.filter((x) => !defects.some((d) => d.testCaseKey === x.key));
  const blocking = defects.filter((d) => d.type !== 'gap' && d.blocksRelease);
  const auto = (a.testCases || []).filter((t) => t.inRun !== false && t.automation === 'Automated');
  const manual = (a.testCases || []).filter((t) => t.inRun !== false && t.automation !== 'Automated').length;
  const stories = r.traceability ? r.traceability.stories : [];
  const C = (criterion, status, detail) => ({ criterion, status, detail });
  const isEqe = track && track.id === 'eqe';
  const own = isEqe
    ? (() => {
      const journeys = auto.filter((t) => t.suite === 'journey');
      const bad = journeys.filter((t) => resultOf.get(t.key) !== 'passed');
      const epics = stories.filter((x) => x.level === 'epic' && x.scope !== 'baseline');
      const parentOf = new Map(stories.map((x) => [x.key, x.parent]));
      const checks = (a.testCases || []).filter((t) => t.inRun !== false && t.suite === 'nfr');
      const crossed = new Set([...journeys.flatMap((t) => t.crosses || []), ...checks.flatMap((t) => (t.sourceRefs || []).map((k) => parentOf.get(k)))]);
      const missed = epics.filter((x) => !crossed.has(x.key));
      return [
        C('Every business journey ran and passed end to end', !journeys.length ? 'not met' : bad.length ? 'not met' : 'met', journeys.length ? `${journeys.length - bad.length} of ${journeys.length} journeys passed${bad.length ? `; not passed: ${bad.map((t) => t.key).join(', ')}` : ''}` : 'no journey in this run'),
        ...(epics.length && cycle.type !== 'incremental' ? [C('Every business capability (epic) is crossed by a journey or a quality check', missed.length ? 'not met' : 'met', missed.length ? `${epics.length - missed.length} of ${epics.length} crossed; not crossed: ${missed.map((x) => x.key).join(', ')}` : `${epics.length} of ${epics.length} crossed`)] : []),
      ];
    })()
    : (() => {
      const checks = auto.filter((t) => t.suite === 'api');
      const notRan = checks.filter((t) => !ran(t));
      const inScope = stories.filter((x) => x.level === 'story' && x.scope !== 'baseline');
      const gapStories = new Set([...defects, ...(a.resolvedDefects || [])].filter((d) => d.type === 'gap').map((d) => d.story));
      const untraced = inScope.filter((x) => !x.testCases && !gapStories.has(x.key));
      return [
        C('Every domain-rule automation test case ran', notRan.length ? 'not met' : 'met', `${checks.length - notRan.length} of ${checks.length} ran`),
        C('Every Jira story in scope is traced to a test case or a gap defect', untraced.length ? 'not met' : 'met', untraced.length ? `not traced: ${untraced.map((x) => x.key).join(', ')}` : `${inScope.length} of ${inScope.length} traced`),
      ];
    })();
  return [
    C('Requirement set approved by a named reviewer', review && review.by ? 'met' : 'not met', review ? `${review.by}: ${review.detail || review.decision}` : 'not reviewed'),
    ...(cycle.gaps?.applicable === false ? [] : [C('Every excluded gap is raised as a defect linked to its story', gapRaised.length === gapsFound.length ? 'met' : 'not met', gapsFound.length ? `${gapRaised.length} of ${gapsFound.length} raised (${gapsFound.map((g) => g.story).join(', ')})` : 'no gaps in this cycle')]),
    ...own,
    C('Every failed test case has a defect', unraised.length ? 'not met' : 'met', failed.length ? `${failed.length - unraised.length} of ${failed.length} failed test cases raised${unraised.length ? `; missing: ${unraised.map((x) => x.key).join(', ')}` : ''}` : 'no failed test case'),
    C('No open release-blocking defect', blocking.length ? 'not met' : 'met', blocking.length ? blocking.map((d) => `${d.id} (${(d.jiraKeys || []).join(', ')})`).join(', ') : 'none open'),
    C('Manual test cases run and recorded', manual ? 'open' : 'met', manual ? `${plural(manual, 'manual test case')} handed over; their results are not recorded in the platform` : 'no manual test case in this run'),
  ];
}

/** Each headline figure of the report recounted from the stored cycle evidence. */
function evidenceCheck(cycle, r) {
  const a = cycle.artifacts;
  const results = (a.execution && a.execution.results) || [];
  const ex = r.execution.executed ? r.execution.summary : null;
  const ran = results.filter((x) => ['passed', 'failed'].includes(x.status));
  const defects = a.defects || [];
  const failedKeys = new Set(results.filter((x) => x.status === 'failed').map((x) => x.key));
  const execDefects = defects.filter((d) => d.type !== 'gap');
  const row = (figure, reported, recounted, from) => ({ figure, reported, recounted, from, status: String(reported) === String(recounted) ? 'reconciled' : 'mismatch' });
  return [
    row('Test cases', r.testCases.total, (a.testCases || []).length, 'test case artifacts'),
    row('Automation scripts', r.scripts.total, (a.scripts || []).length, 'automation script files'),
    ...(ex ? [
      row('Automation test cases run', ex.executed, ran.length, 'Playwright results'),
      row('Automation test cases passed', ex.passed, ran.filter((x) => x.status === 'passed').length, 'Playwright results'),
      row('Automation test cases failed', ex.failed, ran.filter((x) => x.status === 'failed').length, 'Playwright results'),
      row('Automation test cases run with stored evidence', ex.executed, ran.filter((x) => (x.evidence || []).length).length, 'request/response and log files'),
    ] : []),
    row('Defects from failed test cases', execDefects.length, execDefects.filter((d) => failedKeys.has(d.testCaseKey)).length, 'defects backed by a failed result'),
    row('Gap defects', defects.filter((d) => d.type === 'gap').length, defects.filter((d) => d.type === 'gap' && d.story).length, 'gap defects linked to a Jira story'),
  ];
}

function buildLeadReport(cycle) {
  const r = cycle.report;
  if (!r) return null;
  const a = cycle.artifacts;
  const defects = a.defects || [];
  const fixed = a.resolvedDefects || [];
  const ex = r.execution.executed ? r.execution.summary : null;
  const n = r.normalisation;
  const rec = recommendation(cycle, r);
  const reviewApproval = r.approvals.find((x) => x.gate === 'Requirement set review');
  const mergeApproval = r.approvals.find((x) => x.gate === 'Merge into baseline');
  const conflicts = a.requirements.filter((q) => q.resolution && q.resolution.chosen && (q.changedInCycle || q.introducedInCycle || cycle.id) === cycle.id);
  const enhanced = r.requirements.list.filter((q) => q.previous);
  const manual = r.automation.notAutomated;
  const gaps = (r.coverage?.rows || []).filter((x) => !/passing/.test(x.status));
  const isInc = cycle.type === 'incremental';
  const tt = r.testing;
  const sel = tt?.selection;
  const ra = r.reviewAgent;
  const track = TESTING_TYPES.find((x) => x.id === cycle.testingType) || null;
  const signoffOwner = track && track.signoff ? { ...track.signoff, track: track.short, status: 'Awaiting sign-off', note: `The platform recommends ${rec.decision}; the ${track.signoff.owner} decides and signs off outside the platform.` } : null;

  const summary = [
    `${isInc ? 'Incremental' : 'Baseline'} cycle for <b>${esc(r.platform?.capability || cycle.name)}</b> on build <code>${esc(r.cycle.sutBuild)}</code>, ${esc(date(r.cycle.createdAt))}.`,
    ...(tt ? [`Type of testing: <b>${esc(tt.name)}</b>. ${esc(tt.focus)}${sel && sel.notInRun ? ` This run executed ${plural(sel.inRun, 'case')} of the ${sel.designed} in the pack.` : ''}`] : []),
    `We took ${plural(r.inputs.length, 'input')} (${r.inputs.map((i) => `${esc(i.label)} ${esc(i.ref)}`).join(', ')}) and produced ${plural(r.requirements.total, 'requirement')}, ${plural(r.testCases.total, 'test case')} and ${plural(r.scripts.total, 'automation script')}.`,
    ex ? `We ran ${plural(ex.executed, 'automation test case')} for real: <b>${ex.passed} passed, ${ex.failed} failed</b> (pass rate ${ex.passRate}%). ${ex.notRun ? `${plural(ex.notRun, 'manual test case')} still to be run by hand.` : ''}` : 'Tests have not been executed yet.',
    defects.length ? `${plural(defects.length, 'defect')} open from real failures (${movementText(defects)}), ${defects.filter((d) => d.blocksRelease).length} release-blocking: ${defects.map((d) => `${esc(d.id)} ${esc(d.title)} (Jira: ${esc(jiraDefectText(d))})`).join('; ')}.` : 'No defects: nothing failed.',
    ...(fixed.length ? [`<b>${plural(fixed.length, 'defect')} fixed, retested and certified closed</b>: ${fixed.map((d) => `${esc(d.id)} ${esc(d.title)} (story ${esc((d.jira && d.jira.linkedTo) || (d.jiraKeys || [])[0] || '-')}, first seen in ${esc(d.firstSeenCycle)}; ${esc(d.testCaseKey || ((d.retest && d.retest.cases) || []).join(', '))} passed on build ${esc((d.retest && d.retest.build) || r.cycle.sutBuild)})`).join('; ')}.`] : []),
    ...(isInc && r.delta ? [`Against the baseline: ${esc(r.delta.summary)}. ${r.reuse.carriedOver} of ${r.reuse.total} test cases were reused unchanged; only new and changed items were redesigned.`] : []),
  ];

  const inputs = r.inputs.map((i) => ({ label: i.label, ref: i.ref, summary: i.summary, children: i.children || [], statements: i.statements, source: SOURCE_TEXT[i.provenance] || i.provenance, files: i.files }));

  const approach = [
    `Read ${n.statements} statements from the inputs and lined them up into ${n.groups} requirement groups: ${n.agreed} agreed by every source, ${n['jira-only'] || 0} only in Jira, ${n['code-only'] || 0} only in the code, ${n.conflict || 0} in conflict.`,
    ...(ra ? [`The review agent read the inputs first and suggested ${ra.counts.added} addition(s), ${ra.counts.missing} missing piece(s) and ${ra.counts.conflicts} conflict(s) for the reviewer (${ra.counts.high} high severity). It approved nothing.`] : []),
    reviewApproval ? `${esc(reviewApproval.by)} reviewed and approved the requirement set on ${esc(date(reviewApproval.at))}${conflicts.length ? `, settling ${plural(conflicts.length, 'conflict')}: ${conflicts.map((q) => `${esc(q.title)} - kept "${esc(q.resolution.chosen.text)}" (${esc(q.resolution.chosen.sources.join('/'))}) over "${esc(q.resolution.rejected.map((x) => x.text).join('; '))}" (${esc(q.resolution.rejected.flatMap((x) => x.sources).join('/'))})`).join('; ')}` : ''}.` : 'The requirement set has not been reviewed yet.',
    ...(isInc && r.delta ? [`Compared every statement with baseline ${esc(r.cycle.baselineId)} v${esc(r.cycle.baselineVersionAtStart)}: ${esc(r.delta.summary)}.${enhanced.length ? ` Changed: ${enhanced.map((q) => `${esc(q.id)} "${esc(q.previous)}" → "${esc(q.text)}"`).join('; ')}.` : ''}`] : []),
    ...(tt ? [`${esc(tt.name)} steered the design: ${esc(tt.approach)}${sel ? ` Result: ${sel.inRun} case(s) in this run (${sel.reused} reused, ${sel.redesigned} re-designed, ${sel.added} new)${sel.notInRun ? `, ${sel.notInRun} kept in the pack outside this run` : ''}.` : ''}`] : []),
    `The requirements agent wrote ${plural(r.requirements.total, 'requirement')}, each with its business rule, exact values and source quotes (${r.rules.executable} automatable, ${r.rules.manual} manual); the agents then designed ${plural(r.testCases.total, 'test case')} (${Object.entries(r.testCases.byType).map(([k, v]) => `${v} ${k}`).join(', ')}) and generated ${plural(r.scripts.total, 'Playwright script')}.`,
    ...(mergeApproval ? [`${esc(mergeApproval.by)} ${esc(mergeApproval.decision)} the merge into the baseline on ${esc(date(mergeApproval.at))}.`] : []),
    ex ? `Ran the automation test cases with ${esc(r.execution.tool)} against ${esc(r.execution.sut.name)}; defects were raised only for tests that actually failed.` : 'Execution has not run.',
  ];

  const artifacts = [
    { name: 'Inputs and provenance', count: r.inputs.length, note: 'what was taken from each source, and where from', tab: 'inputs', file: '01-inputs/' },
    ...(ra ? [{ name: 'Review agent suggestions', count: ra.findings.length, note: `${ra.counts.added} added · ${ra.counts.missing} missing · ${ra.counts.conflicts} conflicts (advisory)`, tab: 'review-agent', file: '01-inputs/review-agent.json' }] : []),
    { name: 'Normalised requirement set', count: n.groups, note: `${n.agreed} agreed · ${n['jira-only'] || 0} Jira-only · ${n['code-only'] || 0} code-only · ${n.conflict || 0} conflicts`, tab: 'normalise', file: '01-inputs/normalisation.json' },
    ...(isInc && r.delta ? [{ name: 'Delta against baseline', count: (r.delta.unchanged || 0) + (r.delta.enhanced || 0) + (r.delta.new || 0), note: r.delta.summary, tab: 'delta', file: '01-inputs/delta-classification.json' }] : []),
    { name: 'Requirement set (with business rules)', count: r.requirements.total, note: `${Object.entries(r.requirements.byStatus).map(([k, v]) => `${v} ${k}`).join(' · ')} · ${r.rules.total} business rules with exact values and source quotes (${r.rules.executable} automatable · ${r.rules.manual} manual)`, tab: 'requirements', file: '02-requirements/' },
    { name: 'Test cases (Excel, Zephyr Scale format)', count: r.testCases.total, note: Object.entries(r.testCases.byAutomation).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · '), tab: 'testcases', file: '03-test-cases/' },
    ...(r.testData ? [{ name: 'Test data (one data set per test case)', count: r.testData.total, note: `${r.testData.conforming} conform to ${r.testData.dictionary.name} v${r.testData.dictionary.version} (${r.testData.dictionary.attributeCount} attributes) · ${r.testData.negative} negative test${r.testData.negative === 1 ? "" : "s"}${r.testData.nonConforming ? ` · ${r.testData.nonConforming} do not conform` : ''}`, tab: 'testdata', file: '04-test-data/' }] : []),
    { name: 'Automation scripts (Playwright)', count: r.scripts.total, note: Object.entries(r.scripts.byStatus).map(([k, v]) => `${v} ${k}`).join(' · '), tab: 'scripts', file: '05-automation-scripts/' },
    ...(mergeApproval ? [{ name: 'Merge approval', count: 1, note: `${mergeApproval.decision} by ${mergeApproval.by}`, tab: 'merge', file: '09-merge-approval/' }] : []),
    { name: 'Execution results and evidence', count: ex ? ex.executed : 0, note: ex ? `${ex.passed} passed · ${ex.failed} failed · ${ex.notRun} manual` : 'not executed', tab: 'execution', file: '06-execution/' },
    ...(r.traceability ? [{ name: 'Traceability matrix', count: r.traceability.rows.length, note: `${r.traceability.totals.covered} of ${r.traceability.totals.jiraItems} Jira items covered · ${r.traceability.totals.verified} verified · ${r.traceability.totals.failing} failing`, tab: 'traceability', file: '08-report/traceability.json' }] : []),
    { name: 'Defects', count: defects.length, note: `${defects.length ? defects.map((d) => `${d.id} ${d.severity} ${d.movement}`).join(' · ') : 'none open'}${fixed.length ? ` · fixed and certified: ${fixed.map((d) => d.id).join(', ')}` : ''}`, tab: 'defects', file: '07-defects/' },
    { name: 'Cycle report (HTML, Excel)', count: 1, note: 'full detail behind this summary', tab: 'report', file: '08-report/' },
  ];

  const risks = [
    ...(sel ? sel.gaps.map((g) => `${tt.name}: ${g.message}`) : []),
    ...(sel && sel.outOfScope.length ? [`${plural(sel.outOfScope.length, 'requirement')} had no case in this ${tt.name.toLowerCase()} run (${sel.outOfScope.join(', ')}); ${tt.id === 'eqe' ? 'they are domain rules that belong to the DQE track (domain certification), not to EQE business journeys' : `a ${String(tt.id).split('+').includes('smoke') ? 'passing smoke run is not a release decision' : 'wider run is needed before release'}.`}`] : []),
    ...(ra ? ra.findings.filter((f) => f.severity === 'high' && f.category === 'missing').map((f) => `Review agent (${f.id}): ${f.title}. ${f.suggestion}`) : []),
    ...defects.map((d) => `${d.id} (${d.severity}): ${d.impact || d.title}. Expected ${d.expected}, got ${d.actual}. ${d.releaseDecision || ''} Story ${(d.jira && d.jira.linkedTo) || (d.jiraKeys || []).join(', ')}; Jira: ${jiraDefectText(d)}.`),
    ...(manual.length ? [`${plural(manual.length, 'test case')} cannot be automated and ${manual.length === 1 ? 'was' : 'were'} not executed: ${manual.map((t) => `${t.key} ${t.name}`).join('; ')}. Needs a manual run before sign-off.`] : []),
    ...(gaps.length ? [`${plural(gaps.length, 'requirement')} not yet verified by a passing test: ${gaps.map((g) => `${g.requirementId} (${g.status})`).join('; ')}.`] : []),
    ...(conflicts.length ? [`${plural(conflicts.length, 'conflict')} between Jira and the code ${conflicts.length === 1 ? 'was' : 'were'} settled by the reviewer; the losing source (${[...new Set(conflicts.flatMap((q) => q.resolution.rejected.flatMap((x) => x.sources)))].join('/')}) should be corrected so they agree.`] : []),
    ...((n['jira-only'] || n['code-only']) ? [`${(n['jira-only'] || 0) + (n['code-only'] || 0)} requirement groups come from a single source only; the product owner should confirm them.`] : []),
    ...(r.handoverStatus === 'incomplete' ? ['At least one agent did not hand over every artifact its skills require; see Skills and hand-overs.'] : []),
  ];

  const nextSteps = [
    ...(rec.conditions || []),
    ...(manual.length ? [`Run ${manual.map((t) => t.key).join(', ')} manually and record the result.`] : []),
    ...(conflicts.length ? ['Update the losing source (Jira or code) so both state the reviewed value.'] : []),
    isInc ? 'Keep the updated baseline as the reference for the next release.' : 'Use this approved baseline as the reference for the next incremental cycle.',
  ];

  const kpis = [
    ...(tt ? [['Type of testing', tt.name]] : []), ['Requirements', r.requirements.total], ['Test cases', r.testCases.total], ['Automation test cases', r.automation.casesCovered],
    ['Pass rate', ex ? `${ex.passRate}%` : 'n/a'], ['Defects', defects.length], ['Requirements verified', r.coverage ? `${r.coverage.percent.passing}%` : 'n/a'],
  ];

  return {
    title: `QE lead report - ${cycle.name}`, cycleId: cycle.id, cycleType: cycle.type, preparedBy: 'Agentic QE Platform (QE lead report, computed from the cycle)',
    generatedAt: r.generatedAt, recommendation: rec, kpis, summary, inputs, approach, artifacts, risks, nextSteps,
    coverageNote: r.coverage?.attributes ? `${r.coverage.attributes.exercised} of ${r.coverage.attributes.driverCount} ${r.platform?.driversLabel || 'commission-driving attributes'} (out of ${r.coverage.attributes.attributeCount} ${r.platform?.modelLabel || 'reservation'} attributes) are varied by at least one test.` : null,
    traceability: r.traceability ? r.traceability.stories.filter((x) => x.level !== 'initiative') : [],
    signoff: r.approvals.map((x) => ({ gate: x.gate, decision: x.decision, by: x.by, at: x.at, detail: x.detail })),
    signoffOwner,
    exitCriteria: exitCriteria(cycle, r, track),
    evidenceCheck: evidenceCheck(cycle, r),
  };
}

function renderLeadHtml(L, { cycleLink = null } = {}) {
  if (!L) return '';
  const rec = L.recommendation;
  const link = (x) => (cycleLink ? `<a href="${cycleLink(x.tab)}">${esc(x.name)}</a>` : esc(x.name));
  return `<div class="lead">
<div class="lead-rec ${esc(rec.tone)}"><span class="lead-decision">${esc(rec.decision)}</span><span>${esc(rec.reason)}</span></div>
<div class="kpis">${L.kpis.map(([k, v]) => `<div class="kpi">${esc(k)}<b>${esc(v)}</b></div>`).join('')}</div>
<h3>1. Summary</h3><ul>${L.summary.map((s) => `<li>${s}</li>`).join('')}</ul>
<h3>2. Inputs taken</h3>${table(['Input', 'Reference', 'What we took from it', 'Source'], L.inputs.map((i) => [esc(i.label), esc(i.ref), `${esc(i.summary || '')}${i.summary ? '<br>' : ''}${i.children.length ? `Stories: ${esc(i.children.join(', '))}<br>` : ''}<span class="muted">${esc(i.statements)} statements</span>`, esc(i.source)]))}
<h3>3. How we ran the cycle</h3><ol>${L.approach.map((s) => `<li>${s}</li>`).join('')}</ol>
<h3>4. Artifacts produced</h3>${table(['Artifact', 'Count', 'Notes'], L.artifacts.map((x) => [link(x), esc(x.count), esc(x.note)]))}
<h3>5. Risks and open items</h3>${L.risks.length ? `<ul>${L.risks.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '<p>None.</p>'}${L.coverageNote ? `<p class="muted">${esc(L.coverageNote)}</p>` : ''}
<h3>6. Recommendation and next steps</h3><p><b>${esc(rec.decision)}.</b> ${esc(rec.reason)}</p><ul>${L.nextSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
${L.traceability && L.traceability.length ? `<h3>Traceability by story</h3>${table(['Jira item', 'Level', 'Summary', 'Requirements', 'Test cases', 'Passed', 'Failed', 'Defects', 'Status'], L.traceability.map((x) => [esc(x.key), esc(x.level), esc(x.summary || ''), esc(x.requirements), esc(x.testCases), esc(x.passed), esc(x.failed), esc(x.defects.join(', ') || '-'), esc(x.status)]))}` : ''}
<h3>7. Sign-off</h3>${L.signoffOwner ? `<p><b>${esc(L.signoffOwner.track)} sign-off owner: ${esc(L.signoffOwner.owner)}</b> (${esc(L.signoffOwner.accountability)}). ${esc(L.signoffOwner.status)}: ${esc(L.signoffOwner.note)}</p>` : ''}${table(['Gate', 'Decision', 'By', 'When', 'Detail'], L.signoff.map((x) => [esc(x.gate), esc(x.decision), esc(x.by), esc(date(x.at)), esc(x.detail || '')]))}
<h3>8. Exit criteria</h3>${table(['Exit criterion', 'Status', 'Detail'], L.exitCriteria.map((x) => [esc(x.criterion), esc(x.status), esc(x.status === 'clear' ? '-' : x.detail)]))}
<h3>9. Evidence check</h3><p class="muted small">Each figure in this report recounted from the stored cycle evidence.</p>${table(['Figure', 'In the report', 'Recounted', 'Recounted from', 'Status'], L.evidenceCheck.map((x) => [esc(x.figure), esc(x.reported), esc(x.recounted), esc(x.from), esc(x.status)]))}
${rec.criteria ? `<h3>10. Release criteria</h3><p class="muted small">${esc(rec.criteria.source)}; blocking severity ${esc(rec.criteria.blockingSeverity.join(' / '))}, minimum pass rate ${esc(rec.criteria.minPassRate)}%.</p>${table(['Release parameter', 'Applies as', 'Status', 'Detail'], rec.criteria.parameters.map((x) => [esc(x.label), esc(x.actionText), esc(x.status), esc(x.status === 'clear' ? '-' : x.detail)]))}` : ''}
<p class="muted small">${esc(L.preparedBy)} · generated ${esc(date(L.generatedAt))}. Every figure comes from the persisted cycle; nothing is estimated.</p>
</div>`;
}

const LEAD_CSS = `.lead-rec{display:flex;gap:14px;align-items:center;border-radius:8px;padding:12px 16px;margin:10px 0 14px;border:1px solid #d9e0ea;background:#f4f7fb}
.lead-rec.bad{border-color:#e7b4b0;background:#fbeeed}.lead-rec.warn{border-color:#ecd49a;background:#fdf6e6}.lead-rec.ok{border-color:#a9d7b9;background:#ecf7f0}
.lead-decision{font-weight:700;font-size:18px;white-space:nowrap}.lead h3{color:#123a73;margin-top:22px}.lead li{margin:4px 0;line-height:1.45}`;

function renderLeadPage(L) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(L.title)}</title><style>body{font-family:Segoe UI,system-ui,sans-serif;color:#1d2433;max-width:1100px;margin:24px auto;padding:0 16px}h1{color:#123a73}
table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{border:1px solid #d9e0ea;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef3fa}
.kpis{display:flex;gap:12px;flex-wrap:wrap}.kpi{background:#f4f7fb;border:1px solid #dde5f0;border-radius:8px;padding:10px 14px;min-width:120px}.kpi b{display:block;font-size:22px}.muted{color:#5b6475}.small{font-size:12px}${LEAD_CSS}</style></head>
<body><h1>${esc(L.title)}</h1><p class="muted">${esc(L.cycleId)} · ${esc(L.cycleType)} cycle</p>${renderLeadHtml(L)}</body></html>`;
}

const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const md = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(md).join(' | ')} |`)].join('\n');

function renderLeadMarkdown(L) {
  const rec = L.recommendation;
  return [`# ${L.title}`, '', `${L.cycleId} · ${L.cycleType} cycle`, '', `> **Recommendation: ${rec.decision}.** ${rec.reason}`, '',
    mdTable(L.kpis.map(([k]) => k), [L.kpis.map(([, v]) => v)]), '',
    '## 1. Summary', ...L.summary.map((s) => `- ${strip(s)}`), '',
    '## 2. Inputs taken', mdTable(['Input', 'Reference', 'What we took from it', 'Source'], L.inputs.map((i) => [i.label, i.ref, `${i.summary ? `${i.summary}; ` : ''}${i.children.length ? `stories ${i.children.join(', ')}; ` : ''}${i.statements} statements`, i.source])), '',
    '## 3. How we ran the cycle', ...L.approach.map((s, i) => `${i + 1}. ${strip(s)}`), '',
    '## 4. Artifacts produced', mdTable(['Artifact', 'Count', 'Notes', 'Folder'], L.artifacts.map((x) => [x.name, x.count, x.note, `[${x.file}](${x.file})`])), '',
    '## 5. Risks and open items', ...(L.risks.length ? L.risks.map((s) => `- ${s}`) : ['None.']), ...(L.coverageNote ? ['', `_${L.coverageNote}_`] : []), '',
    '## 6. Recommendation and next steps', `**${rec.decision}.** ${rec.reason}`, '', ...L.nextSteps.map((s) => `- ${s}`), '',
    ...(L.traceability && L.traceability.length ? ['## Traceability by story', mdTable(['Jira item', 'Level', 'Summary', 'Requirements', 'Test cases', 'Passed', 'Failed', 'Defects', 'Status'], L.traceability.map((x) => [x.key, x.level, x.summary || '', x.requirements, x.testCases, x.passed, x.failed, x.defects.join(', ') || '-', x.status])), ''] : []),
    '## 7. Sign-off', ...(L.signoffOwner ? [`**${L.signoffOwner.track} sign-off owner: ${L.signoffOwner.owner}** (${L.signoffOwner.accountability}). ${L.signoffOwner.status}: ${L.signoffOwner.note}`, ''] : []), mdTable(['Gate', 'Decision', 'By', 'When', 'Detail'], L.signoff.map((x) => [x.gate, x.decision, x.by, date(x.at), x.detail || ''])), '',
    '## 8. Exit criteria', mdTable(['Exit criterion', 'Status', 'Detail'], L.exitCriteria.map((x) => [x.criterion, x.status, x.status === 'clear' ? '-' : x.detail])), '',
    '## 9. Evidence check', mdTable(['Figure', 'In the report', 'Recounted', 'Recounted from', 'Status'], L.evidenceCheck.map((x) => [x.figure, x.reported, x.recounted, x.from, x.status])), '',
    ...(rec.criteria ? ['## 10. Release criteria', `${rec.criteria.source}; blocking severity ${rec.criteria.blockingSeverity.join(' / ')}, minimum pass rate ${rec.criteria.minPassRate}%.`, '', mdTable(['Release parameter', 'Applies as', 'Status', 'Detail'], rec.criteria.parameters.map((x) => [x.label, x.actionText, x.status, x.status === 'clear' ? '-' : x.detail])), ''] : []),
    `_${L.preparedBy} · generated ${date(L.generatedAt)}. Every figure comes from the persisted cycle; nothing is estimated._`, ''].join('\n');
}

module.exports = { buildLeadReport, renderLeadHtml, renderLeadPage, renderLeadMarkdown, LEAD_CSS };
