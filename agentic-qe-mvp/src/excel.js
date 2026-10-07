'use strict';
// Excel exports (exceljs). Test cases use Zephyr Scale-friendly column names.
const ExcelJS = require('exceljs');
const { APP_TITLE } = require('./report');

// Default column order; replaced by the order a report-targeted skill declares ("in this order ...: A, B, C.").
const DEFAULT_COLUMNS = ['Key', 'Name', 'Objective', 'Precondition', 'Test Step', 'Test Data', 'Expected Result', 'Priority', 'Type', 'Labels', 'Requirement/Issue link', 'Automation status', 'Cycle'];
const TRAILING_COLUMNS = ['Change', 'Revision note'];

const FIELD_BY_HEADER = {
  key: 'key', name: 'name', objective: 'objective', precondition: 'precondition', 'test step': 'steps', 'test steps': 'steps',
  'test data': 'testData', 'expected result': 'expected', priority: 'priority', type: 'type', labels: 'labels',
  'requirement link': 'links', 'requirement/issue link': 'links', 'issue link': 'links', 'automation status': 'automation',
  cycle: 'cycle', change: 'change', 'revision note': 'revision', version: 'version',
};
const WIDTH = { key: 11, name: 44, objective: 50, precondition: 36, steps: 52, testData: 30, expected: 40, priority: 9, type: 15, labels: 30, links: 26, automation: 16, cycle: 24, change: 14, revision: 50, version: 8 };

/** Reads an ordered column list out of a skill body: "... in this order ...: Key, Name, ..., Cycle." */
function columnsFromSkillBody(body) {
  const m = String(body || '').match(/in this order[^:]*:\s*([\s\S]*?)\.(?:\s|$)/i);
  if (!m) return null;
  const cols = m[1].split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return cols.length >= 3 && cols.every((c) => FIELD_BY_HEADER[c.toLowerCase()]) ? cols : null;
}

function exportColumns(skills = []) {
  for (const sk of skills.filter((x) => x.appliesTo.includes('report'))) {
    const cols = columnsFromSkillBody(sk.body);
    if (cols) return { headers: cols, source: `skill ${sk.id} (${sk.file})` };
  }
  return { headers: DEFAULT_COLUMNS, source: 'built-in default (no active skill declares a column order)' };
}

function columnSpec(skills) {
  const { headers, source } = exportColumns(skills);
  const all = [...headers, ...TRAILING_COLUMNS];
  return { source, headers, columns: all.map((h) => { const key = FIELD_BY_HEADER[h.toLowerCase()]; return { header: h, key, width: WIDTH[key] || 18 }; }) };
}

const TEST_CASE_COLUMNS = columnSpec([]).columns;

const FILL = {
  new: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF3E4' } },
  're-designed': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1CC' } },
  'carried over': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } },
};

function styleHeader(ws) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A73' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_TITLE;
  wb.title = APP_TITLE;
  wb.created = new Date();
  return wb;
}

function changeLabel(status, cycleType) {
  if (cycleType !== 'incremental') return 'Baseline';
  return status === 'new' ? 'New' : status === 're-designed' ? 'Changed' : 'Carried over';
}

/** A case with no expected value, no rule, or no observable outcome is not exported; it is a gap. */
function exportGap(t) {
  if (!t.expected || !String(t.expected).trim()) return 'no expected value';
  if (!t.ruleId) return 'no business rule';
  if (!t.steps || !t.steps.length) return 'no observable outcome (no steps)';
  return null;
}

function testCaseRows(cycle) {
  const reqs = new Map(cycle.artifacts.requirements.map((r) => [r.id, r]));
  return cycle.artifacts.testCases.filter((t) => !exportGap(t)).map((t) => ({
    key: t.key,
    name: t.name,
    objective: t.objective,
    precondition: t.precondition,
    steps: t.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    testData: t.testData,
    expected: t.expected,
    priority: t.priority,
    type: t.type === 'functional' ? 'Functional' : 'Non-functional',
    labels: t.labels.join(', '),
    links: [...(t.sourceRefs || reqs.get(t.requirementId)?.jiraKeys || []), t.requirementId, t.ruleId].filter(Boolean).join(', '),
    automation: t.automation,
    cycle: cycle.name,
    change: changeLabel(t.status, cycle.type),
    revision: t.revisionNote || '',
    version: t.version,
    _status: t.status,
    _prev: t.previous,
  }));
}

function addTestCaseSheet(wb, cycle) {
  const ws = wb.addWorksheet('Test Cases');
  const spec = columnSpec(cycle.skills || []);
  ws.columns = spec.columns;
  for (const r of testCaseRows(cycle)) {
    const { _status, _prev, ...values } = r;
    const row = ws.addRow(values);
    row.alignment = { wrapText: true, vertical: 'top' };
    if (cycle.type === 'incremental' && FILL[_status]) row.eachCell({ includeEmpty: true }, (c) => { c.fill = FILL[_status]; });
    if (_prev) row.getCell('expected').note = `Superseded (v${_prev.version}): ${_prev.expected}`;
  }
  styleHeader(ws);
  ws.autoFilter = { from: 'A1', to: { row: 1, column: spec.columns.length } };
  return { ws, spec };
}

function addTestDataSheet(wb, cycle) {
  const sets = cycle.artifacts.testData;
  if (!sets) return;
  const ws = wb.addWorksheet('Test Data');
  ws.columns = [
    { header: 'Data Set', key: 'id', width: 12 }, { header: 'Test Case', key: 'key', width: 12 }, { header: 'Requirement', key: 'req', width: 12 },
    { header: 'Set By Test Case', key: 'drivers', width: 48 }, { header: 'Generated From Spec', key: 'generated', width: 20 },
    { header: 'Check Against Spec', key: 'conformance', width: 18 }, { header: 'Problems', key: 'problems', width: 40 },
    { header: 'Change', key: 'status', width: 14 }, { header: 'Version', key: 'version', width: 9 },
  ];
  for (const d of sets) {
    ws.addRow({ id: d.id, key: d.testCaseKey, req: d.requirementId, drivers: d.drivers.map((x) => `${x.attribute} = ${(x.variants || [x.value]).join(' | ')}`).join('\n') || 'standard booking', generated: `${d.generated} attributes`, conformance: d.conformance, problems: d.problems.join('; '), status: d.status, version: d.version }).alignment = { wrapText: true, vertical: 'top' };
  }
  styleHeader(ws);
}

async function testCasesExport(cycle) {
  const wb = newBook();
  const { spec } = addTestCaseSheet(wb, cycle);
  addTestDataSheet(wb, cycle);
  const gaps = cycle.artifacts.testCases.map((t) => ({ key: t.key, gap: exportGap(t) })).filter((g) => g.gap);
  const info = wb.addWorksheet('About');
  info.columns = [{ header: 'Field', key: 'k', width: 26 }, { header: 'Value', key: 'v', width: 90 }];
  info.addRows([
    { k: 'Product', v: APP_TITLE },
    { k: 'Cycle', v: `${cycle.name} (${cycle.id})` },
    { k: 'Baseline', v: cycle.baselineId ? `${cycle.baselineId} v${cycle.baselineVersionAfter ?? cycle.baselineVersionAtStart ?? ''}` : 'n/a' },
    { k: 'Exported at', v: new Date().toISOString() },
    { k: 'Column order', v: `${spec.headers.join(', ')} - from ${spec.source}; then ${TRAILING_COLUMNS.join(', ')}` },
    { k: 'Change column', v: cycle.type === 'incremental' ? 'New (green) / Changed (amber, superseded expected result in cell note, revision note column) / Carried over (grey)' : 'Baseline cycle: all rows designed in this cycle' },
    { k: 'Export gaps', v: gaps.length ? gaps.map((g) => `${g.key}: ${g.gap}`).join('; ') : 'none - every case has an expected value, a rule and steps' },
    { k: 'Designed vs executed', v: 'This sheet lists designed test cases. Execution results are in the cycle report.' },
  ]);
  styleHeader(info);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, columns: spec.columns.map((c) => c.header), columnSource: spec.source, rows: cycle.artifacts.testCases.length - gaps.length, gaps };
}

async function testCasesWorkbook(cycle) {
  return (await testCasesExport(cycle)).buffer;
}

function sheetFromRows(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map(([header, key, width]) => ({ header, key, width: width || 18 }));
  rows.forEach((r) => { ws.addRow(r).alignment = { wrapText: true, vertical: 'top' }; });
  styleHeader(ws);
  return ws;
}

async function reportWorkbook(report, cycle) {
  const wb = newBook();
  const ex = report.execution;
  sheetFromRows(wb, 'Summary', [['Metric', 'k', 34], ['Value', 'v', 90]], [
    { k: 'Report', v: report.title }, { k: 'Cycle', v: `${report.cycle.name} (${report.cycle.id}, ${report.cycle.type})` },
    { k: 'Status', v: report.cycle.status }, { k: 'Baseline', v: `${report.cycle.baselineId || '-'} v${report.cycle.baselineVersionAfter ?? '-'}` },
    { k: 'SUT build', v: report.cycle.sutBuild },
    { k: 'Requirements', v: report.requirements.total }, { k: 'Delta', v: report.delta ? report.delta.summary : 'n/a (baseline)' },
    { k: 'Test cases', v: report.testCases.total }, { k: 'Test cases by type', v: JSON.stringify(report.testCases.byType) },
    { k: 'Test cases by label', v: JSON.stringify(report.testCases.byLabel) }, { k: 'Scripts', v: report.scripts.total },
    { k: 'Executed (real)', v: ex.executed ? ex.summary.executed : 0 }, { k: 'Passed', v: ex.executed ? ex.summary.passed : 0 },
    { k: 'Failed', v: ex.executed ? ex.summary.failed : 0 }, { k: 'Pass rate %', v: ex.executed ? ex.summary.passRate : 0 },
    { k: 'Execution tool', v: ex.executed ? ex.tool : 'not executed' }, { k: 'Defects', v: report.defects.open.length },
    { k: 'Coverage (passing %)', v: report.coverage ? report.coverage.percent.passing : 0 },
    { k: 'Narrative', v: report.narrative.text }, { k: 'Narrative drafted by', v: report.narrative.draftedBy },
    ...((report.narrative.risks || []).length ? [{ k: 'Risks (AI-drafted)', v: report.narrative.risks.join('\n') }] : []),
    ...(report.narrative.recommendation ? [{ k: 'Recommendation (AI-drafted)', v: report.narrative.recommendation }] : []),
    { k: 'AI mode', v: report.ai ? (report.ai.mode === 'ai' ? `${report.ai.provider} ${report.ai.model}` : 'rule-based (no model API key set)') : 'not recorded' },
  ]);
  sheetFromRows(wb, 'Inputs', [['Input', 'label', 18], ['Reference', 'ref', 40], ['Statements', 'statements', 12], ['Provenance', 'provenance', 12], ['Provenance detail', 'provenanceLabel', 80]], report.inputs);
  sheetFromRows(wb, 'Requirements', [['ID', 'id', 10], ['Jira', 'jira', 16], ['Requirement', 'text', 70], ['Type', 'type', 16], ['Source', 'source', 12], ['Business rule', 'ruleId', 10], ['Rule', 'rule', 34], ['Exact values', 'ruleValues', 40], ['Test approach', 'approach', 13], ['Status', 'status', 14], ['Version', 'version', 8], ['Superseded value', 'previous', 60], ['AI title (suggested)', 'aiTitle', 30], ['AI summary (suggested)', 'aiSummary', 60], ['AI acceptance criteria (suggested)', 'aiAcceptance', 80]], report.requirements.list);
  addTestCaseSheet(wb, cycle);
  sheetFromRows(wb, 'Execution', [['Case', 'key', 11], ['Requirement', 'requirementId', 12], ['Name', 'name', 60], ['Result', 'status', 10], ['Duration ms', 'duration', 12], ['Note', 'reason', 50], ['AI triage (suggested; result unchanged)', 'aiTriage', 60]], ex.executed ? ex.results : []);
  sheetFromRows(wb, 'Defects', [['ID', 'id', 9], ['Title', 'title', 50], ['Severity', 'severity', 9], ['Story', 'story', 11], ['Jira defect', 'jira', 40], ['Case', 'testCaseKey', 10], ['Requirement', 'requirementId', 12], ['Expected', 'expected', 14], ['Actual', 'actual', 14], ['Failing assertion', 'assertion', 50], ['Movement', 'movement', 12], ['AI triage', 'aiTriage', 14], ['AI summary (drafted)', 'aiSummary', 60], ['AI steps to reproduce', 'aiSteps', 60], ['AI likely cause', 'aiLikelyCause', 40]], report.defects.open);
  sheetFromRows(wb, 'Fixed and certified', [['ID', 'id', 9], ['Title', 'title', 50], ['Story', 'story', 11], ['Case', 'testCaseKey', 10], ['First seen', 'firstSeenCycle', 11], ['Retested in', 'resolvedInCycle', 11], ['Result', 'retestResult', 9], ['Status', 'status', 9], ['Certification', 'certification', 80]], report.defects.resolved || []);
  sheetFromRows(wb, 'Coverage', [['Requirement', 'requirementId', 12], ['Text', 'text', 70], ['Cases', 'cases', 8], ['Automated', 'automated', 10], ['Executed', 'executed', 10], ['Failed', 'failed', 8], ['Status', 'status', 24]], report.coverage ? report.coverage.rows : []);
  if (report.coverage && report.coverage.attributes) {
    sheetFromRows(wb, 'Attribute coverage', [['Attribute', 'attribute', 34], ['Description', 'description', 50], ['Varied by cases', 'casesText', 30], ['Status', 'status', 24]],
      report.coverage.attributes.rows.map((x) => ({ ...x, casesText: x.cases.join(', ') })));
  }
  if (report.traceability) {
    sheetFromRows(wb, 'Traceability by story', [['Jira item', 'key', 11], ['Level', 'level', 11], ['Scope', 'scope', 11], ['Parent', 'parent', 11], ['Summary', 'summary', 50], ['Requirements', 'requirements', 12], ['Test cases', 'testCases', 10], ['Automated', 'automated', 10], ['Passed', 'passed', 8], ['Failed', 'failed', 8], ['Defects', 'defectsText', 16], ['Status', 'status', 20]],
      report.traceability.stories.map((x) => ({ ...x, parent: x.parent || '', defectsText: x.defects.join(', ') })));
    sheetFromRows(wb, 'Traceability matrix', [['Jira', 'jira', 16], ['Requirement', 'requirementId', 12], ['Requirement text', 'requirement', 60], ['Rule', 'ruleId', 9], ['Test case', 'testCaseKey', 11], ['Name', 'testCase', 50], ['Type', 'testType', 12], ['Automation', 'automation', 11], ['Test data', 'testDataId', 11], ['Script', 'scriptFile', 40], ['Result', 'result', 14], ['Defect', 'defectsText', 10], ['Jira defect', 'jiraDefectsText', 12]],
      report.traceability.rows.map((x) => ({ ...x, jira: x.jiraKeys.join(', '), defectsText: x.defects.join(', '), jiraDefectsText: x.jiraDefects.join(', ') })));
  }
  if (report.ai) {
    sheetFromRows(wb, 'AI activity', [['Call', 'id', 9], ['Agent', 'agent', 14], ['Purpose', 'purpose', 44], ['Model', 'model', 20], ['When', 'at', 24], ['OK', 'okText', 6], ['Cached', 'cachedText', 8], ['ms', 'ms', 8], ['Accepted', 'accepted', 9], ['Rejected by code', 'rejected', 10], ['Note', 'note', 60], ['Error', 'error', 30]],
      report.ai.calls.map((c) => ({ ...c, okText: c.ok ? 'yes' : 'no', cachedText: c.cached ? 'yes' : '' })));
  }
  sheetFromRows(wb, 'Approvals', [['Gate', 'gate', 26], ['Decision', 'decision', 10], ['By', 'by', 18], ['When', 'at', 26], ['Detail', 'detail', 80]], report.approvals);
  sheetFromRows(wb, 'Skills', [['Skill id', 'id', 28], ['Name', 'name', 40], ['Description', 'description', 70], ['Seen by agents', 'agents', 40], ['File', 'file', 30]],
    (report.skills || []).map((k) => ({ ...k, agents: k.appliesTo.join(', ') })));
  sheetFromRows(wb, 'Hand-overs', [['Phase', 'label', 32], ['Skills seen', 'skills', 50], ['Hand-over', 'status', 12], ['Missing', 'missing', 30], ['Artefacts owed', 'items', 70]],
    (report.handovers || []).map((h) => ({ label: h.label, skills: h.skills.join(', '), status: h.status, missing: h.missing.join(', '), items: h.items.map((i) => `${i.key}: ${i.status}`).join('; ') })));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function compareWorkbook(c) {
  const wb = newBook();
  const art = (label, d) => ({ artifact: label, a: d.countA, b: d.countB, added: d.added.length, changed: d.changed.length, unchanged: d.unchanged.length, addedIds: d.added.join(', '), changedIds: d.changed.join(', ') });
  sheetFromRows(wb, 'Artifacts', [['Artifact', 'artifact', 14], [c.a.id, 'a', 10], [c.b.id, 'b', 10], ['Added', 'added', 8], ['Changed', 'changed', 9], ['Unchanged', 'unchanged', 10], ['Added IDs', 'addedIds', 50], ['Changed IDs', 'changedIds', 50]],
    [art('Requirements', c.requirements), art('Test cases', c.testCases), art('Scripts', c.scripts)]);
  sheetFromRows(wb, 'Changed requirements', [['ID', 'id', 10], [`Before (${c.a.id})`, 'before', 60], [`After (${c.b.id})`, 'after', 60]], c.requirements.changedDetail);
  sheetFromRows(wb, 'Execution', [['Metric', 'm', 14], [c.a.id, 'a', 10], [c.b.id, 'b', 10]], ['executed', 'passed', 'failed', 'passRate'].map((m) => ({ m, a: c.execution.a[m], b: c.execution.b[m] })));
  sheetFromRows(wb, 'Defects', [['Movement', 'm', 14], ['Defect IDs', 'ids', 60]], [
    { m: `${c.a.id} defects`, ids: c.defects.a.join(', ') }, { m: `${c.b.id} defects`, ids: c.defects.b.join(', ') },
    { m: 'new', ids: c.defects.new.join(', ') }, { m: 'still open', ids: c.defects.stillOpen.join(', ') }, { m: 'resolved', ids: c.defects.resolved.join(', ') }]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { testCasesWorkbook, testCasesExport, reportWorkbook, compareWorkbook, TEST_CASE_COLUMNS, testCaseRows, columnsFromSkillBody, exportColumns, TRAILING_COLUMNS, DEFAULT_COLUMNS };
