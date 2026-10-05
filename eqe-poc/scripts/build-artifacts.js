'use strict';
// Generates the UC1/UC2 artifact pack from design/, tests/, test-data/ and evidence/ (nothing typed in by hand):
//   artifacts/AQPI-1/AQPI-1-analysis-and-progress.html
//   artifacts/AQPI-1/<EPIC>/Stage - 1 Requirement & details.xlsx, Stage - 2 Test Scenarios & Test cases.xlsx
//   artifacts/AQPI-1/<EPIC>/scaffolds/<CASE>.spec.ts, coverage-matrix.csv, gap-register.csv, metrics.json
//   evidence/uc2/coverage-matrix.csv, evidence/uc2/automation-metrics.json, artifacts/eqe-summary.json (UI)
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { analyseEpic, ROOT, readJson } = require('../src/design');
const { analyseAutomation } = require('../src/automation');

const INITIATIVE = 'AQPI-1';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csvCell = (v) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows, cols) => `${[cols.map((c) => c.header).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(','))].join('\n')}\n`;
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };

function sheet(wb, name, cols, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(cols.map((c) => [c.key, Array.isArray(r[c.key]) ? r[c.key].join('\n') : r[c.key] ?? '']))));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  ws.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: 'top', wrapText: true }; }));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

function stageStatus(trail, gates) {
  const es = (trail.entries || []).filter((e) => gates.includes(e.gate));
  if (!es.length) return 'not started';
  const last = es[es.length - 1].decision;
  return last === 'approved' ? 'approved' : last === 'submitted' ? 'awaiting HITL review' : last;
}

function coverageRows(a) {
  const risk = new Map((a.stage1.requirements || []).map((r) => [r.id, r]));
  return a.coverage.rows.map((r) => ({ id: r.id, level: r.level, story: r.story, kind: r.kind, text: r.text, risk: (risk.get(r.id) || {}).risk || '', rationale: (risk.get(r.id) || {}).rationale || '', cases: r.cases, status: r.cases.length ? 'covered' : (a.stage1.gaps.find((g) => String(g.ref).includes(r.id)) ? 'gap logged' : (r.level === 'epic' ? 'process/epic criterion' : 'not covered')) }));
}

async function stage1Xlsx(a, file) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Devin (EQE PoC)';
  sheet(wb, 'Requirements', [
    { header: 'Requirement ID', key: 'id', width: 16 }, { header: 'Level', key: 'level', width: 8 }, { header: 'Jira key', key: 'story', width: 10 }, { header: 'Type', key: 'kind', width: 6 },
    { header: 'Requirement (verbatim Jira)', key: 'text', width: 70 }, { header: 'Risk', key: 'risk', width: 8 }, { header: 'Risk rationale', key: 'rationale', width: 40 }, { header: 'Traced by cases', key: 'cases', width: 18 }, { header: 'Status', key: 'status', width: 16 },
  ], coverageRows(a));
  sheet(wb, 'Jira items', [{ header: 'Key', key: 'key', width: 10 }, { header: 'Summary', key: 'summary', width: 50 }, { header: 'Labels', key: 'labels', width: 30 }, { header: 'ACs', key: 'acs', width: 6 }, { header: 'BRs', key: 'brs', width: 6 }],
    [a.jira.epic, ...a.jira.stories].map((i) => ({ key: i.key, summary: i.summary, labels: i.labels, acs: i.acceptanceCriteria.length, brs: i.businessRules.length })));
  sheet(wb, 'Epic criteria', [{ header: 'ID', key: 'id', width: 14 }, { header: 'Criterion (verbatim)', key: 'text', width: 60 }, { header: 'Treatment', key: 'treatment', width: 60 }],
    a.stage1.epicCriteria.map((e) => ({ ...e, text: (a.index.find((x) => x.id === e.id) || {}).text })));
  sheet(wb, 'Gap register', [{ header: 'Gap', key: 'id', width: 8 }, { header: 'Category', key: 'g', width: 9 }, { header: 'Reference', key: 'ref', width: 22 }, { header: 'Summary', key: 'summary', width: 60 }, { header: 'Working assumption', key: 'assumption', width: 50 }, { header: 'Owner', key: 'owner', width: 14 }, { header: 'Status', key: 'status', width: 10 }], a.stage1.gaps);
  sheet(wb, 'Scope & sources', [{ header: 'Item', key: 'k', width: 24 }, { header: 'Value', key: 'v', width: 90 }], [
    { k: 'Initiative / epic', v: `${a.stage1.initiative} / ${a.stage1.epic}` }, { k: 'Jira source', v: `${a.jira.label} (${a.jira.mode})` },
    { k: 'In scope', v: a.stage1.scope.inScope }, { k: 'Lens', v: a.stage1.scope.lens }, { k: 'Negatives requested by', v: `${a.stage1.scope.negativesRequestedBy.id}: "${a.stage1.scope.negativesRequestedBy.quote}"` },
    { k: 'Out of scope', v: a.stage1.scope.outOfScope }, ...a.stage1.sources.map((s) => ({ k: `Source: ${s.kind}`, v: s.keys.length ? s.keys : s.note })), { k: 'Workflow', v: a.stage1.workflow }, { k: 'Author', v: a.stage1.author },
  ]);
  await wb.xlsx.writeFile(file);
}

async function stage2Xlsx(a, file) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Devin (EQE PoC)';
  const s2 = a.stage2;
  sheet(wb, 'Scenarios', [{ header: 'Scenario', key: 'id', width: 8 }, { header: 'Title', key: 'title', width: 60 }, { header: 'Stories', key: 'stories', width: 18 }, { header: 'Cases', key: 'cases', width: 50 }],
    s2.scenarios.map((s) => ({ ...s, cases: s2.cases.filter((c) => c.scenario === s.id).map((c) => c.id) })));
  sheet(wb, 'Test cases (Zephyr)', [
    { header: 'Key', key: 'id', width: 14 }, { header: 'Name', key: 'title', width: 50 }, { header: 'Objective', key: 'objective', width: 50 }, { header: 'Precondition', key: 'preconditions', width: 36 },
    { header: 'Priority', key: 'priority', width: 9 }, { header: 'Component', key: 'component', width: 20 }, { header: 'Labels', key: 'labels', width: 22 }, { header: 'Coverage (issue links)', key: 'traceIds', width: 18 },
    { header: 'Source quote', key: 'quotes', width: 60 }, { header: 'Test data (playbook keys)', key: 'data', width: 26 }, { header: 'Scenario', key: 'scenario', width: 9 },
  ], s2.cases.map((c) => ({ ...c, component: s2.component, labels: [c.type, c.story, a.epic], traceIds: c.traces.map((t) => t.id), quotes: c.traces.map((t) => `${t.id}: "${t.quote}"`) })));
  sheet(wb, 'Test steps', [{ header: 'Key', key: 'case', width: 14 }, { header: 'Step', key: 'n', width: 6 }, { header: 'Action', key: 'action', width: 50 }, { header: 'Test data', key: 'data', width: 24 }, { header: 'Expected result', key: 'expected', width: 60 }, { header: 'Proves', key: 'proves', width: 16 }],
    s2.cases.flatMap((c) => c.steps.map((s, i) => ({ case: c.id, n: i + 1, ...s }))));
  sheet(wb, 'Guest journeys', [{ header: 'Journey', key: 'id', width: 8 }, { header: 'Title', key: 'title', width: 30 }, { header: 'Narrative', key: 'narrative', width: 80 }, { header: 'Cases', key: 'cases', width: 30 }], s2.journeys);
  sheet(wb, 'Coverage matrix', [{ header: 'Requirement', key: 'id', width: 16 }, { header: 'Type', key: 'kind', width: 6 }, { header: 'Requirement (verbatim)', key: 'text', width: 70 }, { header: 'Cases', key: 'cases', width: 30 }, { header: 'Status', key: 'status', width: 18 }], coverageRows(a));
  sheet(wb, 'Review flags', [{ header: 'Flag', key: 'flag', width: 14 }, { header: 'Cases', key: 'cases', width: 30 }, { header: 'Detail', key: 'detail', width: 80 }], [
    ...a.quality.duplicates.map((d) => ({ flag: 'duplicate', cases: [d.a, d.b], detail: `Same traces and data: ${d.shared.join(', ')}` })),
    ...a.quality.overlaps.map((o) => ({ flag: 'overlap', cases: [o.a, o.b], detail: `${o.shared.join(', ')} - ${o.note}` })),
    ...a.quality.negatives.filter((n) => n.missingNegative).map((n) => ({ flag: 'missing negative', cases: [n.story], detail: 'Negatives requested but none designed' })),
    ...a.grounding.ungrounded.map((g) => ({ flag: 'ungrounded', cases: [g.case], detail: `${g.ref}: ${g.reason}` })),
  ]);
  sheet(wb, 'Golden comparison', [{ header: 'Item', key: 'k', width: 24 }, { header: 'Value', key: 'v', width: 90 }], a.golden.status === 'compared'
    ? [{ k: 'Authored by', v: a.golden.authoredBy }, { k: 'Recall', v: `${a.golden.recall}% (${a.golden.matched}/${a.golden.goldenCases})` }, { k: 'Devin-only cases', v: a.golden.devinOnly }, { k: 'Missed requirements', v: a.golden.missedRequirements }, ...a.golden.matches.map((m) => ({ k: m.golden, v: m.match ? `${m.match.case} (Jaccard ${m.match.score})` : 'no match' }))]
    : [{ k: 'Status', v: a.golden.status }, { k: 'Note', v: a.golden.note }]);
  await wb.xlsx.writeFile(file);
}

function scaffold(c, epic) {
  const lines = [
    `// Stage-2 design scaffold for ${c.id} (not automation). Stage 3 implements approved cases in tests/demo-booking/.`,
    `// @case ${c.id}  @traces ${c.traces.map((t) => t.id).join(' ')}  @epic ${epic}  @type ${c.type}  @priority ${c.priority}`,
    "import { test } from '@playwright/test';",
    '',
    `test.fixme(${JSON.stringify(`${c.id} ${c.title}`)}, async () => {`,
    ...c.traces.map((t) => `  // Trace ${t.id}: "${t.quote}"`),
    ...c.preconditions.map((p) => `  // Precondition: ${p}`),
    `  // Test data (playbook): ${c.data.join(', ') || 'none'}`,
    ...c.steps.flatMap((s, i) => [`  // Step ${i + 1}: ${s.action}${s.data ? ` [data: ${s.data}]` : ''}`, `  //   Expect: ${s.expected}${s.proves.length ? ` (proves ${s.proves.join(', ')})` : ''}`]),
    '});',
    '',
  ];
  return lines.join('\n');
}

const badge = (met) => (met === null ? '<span class="b pend">pending</span>' : met ? '<span class="b ok">met</span>' : '<span class="b bad">not met</span>');
const table = (cols, rows) => `<table><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[2] ? r[c[1]] : esc(Array.isArray(r[c[1]]) ? r[c[1]].join(', ') : r[c[1]])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

function trackerHtml(a, u, summary) {
  const stages = summary.stages.map((s) => `<li class="st ${s.active ? '' : 'soon'}"><b>${s.n}. ${esc(s.name)}</b><span>${esc(s.status)}</span></li>`).join('');
  const thr = (ts) => table([['Metric', 'metric'], ['Target', 'target'], ['Value', 'v'], ['Status', 'm', true], ['How measured', 'how']], ts.map((t) => ({ ...t, v: t.value === null || t.value === undefined ? '-' : `${t.value}${t.unit}`, m: badge(t.met) })));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${INITIATIVE} analysis and progress</title><style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;color:#1b2430;background:#f5f7fa}header{background:#1f3a5f;color:#fff;padding:18px 28px}header h1{margin:0;font-size:22px}header p{margin:4px 0 0;opacity:.85}
main{padding:20px 28px;max-width:1300px}section{background:#fff;border:1px solid #dde3ea;border-radius:8px;padding:14px 18px;margin:0 0 16px}h2{font-size:17px;margin:0 0 10px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #e6eaef;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef2f6}
ol.stages{display:flex;gap:8px;list-style:none;padding:0;margin:0}.st{flex:1;border:1px solid #9fb3c8;border-radius:6px;padding:8px;background:#e8f0f8}.st span{display:block;font-size:12px;color:#40576f}.st.soon{opacity:.55;background:#f0f0f0;border-style:dashed}
.b{padding:2px 8px;border-radius:10px;font-size:12px}.ok{background:#d8f3dc;color:#1b5e20}.bad{background:#fde2e1;color:#8a1c1c}.pend{background:#fff3cd;color:#7a5a00}.note{font-size:12px;color:#5b6b7b}
</style></head><body><header><h1>Quality Engineering at Scale</h1><p>Intelligent by design. Governed by people.</p></header><main>
<section><h2>${esc(INITIATIVE)} &middot; ${esc(a.jira.epic.summary)} (${esc(a.epic)})</h2><p class="note">Generated ${esc(summary.generatedAt)} from ${esc(a.jira.label)}. Workflow: ${esc(a.stage1.workflow)}. Synthetic app: demo-booking. Stages 4-5 are out of PoC scope.</p><ol class="stages">${stages}</ol></section>
<section><h2>UC1 success metrics</h2>${thr(a.thresholds)}</section>
<section><h2>UC2 success metrics</h2>${thr(u.thresholds)}</section>
<section><h2>Coverage matrix (requirement &rarr; cases)</h2>${table([['ID', 'id'], ['Type', 'kind'], ['Requirement (verbatim Jira)', 'text'], ['Risk', 'risk'], ['Cases', 'cases'], ['Status', 'status']], coverageRows(a))}</section>
<section><h2>Test cases (${a.stage2.cases.length})</h2>${table([['Key', 'id'], ['Type', 'type'], ['Priority', 'priority'], ['Title', 'title'], ['Traces', 't'], ['Automated', 'auto']], a.stage2.cases.map((c) => ({ ...c, t: c.traces.map((x) => x.id), auto: u.specs.some((s) => s.case === c.id) ? 'yes (UC2)' : '-' })))}</section>
<section><h2>Gap register</h2>${table([['Gap', 'id'], ['Category', 'g'], ['Ref', 'ref'], ['Summary', 'summary'], ['Assumption', 'assumption'], ['Owner', 'owner'], ['Status', 'status']], a.stage1.gaps)}</section>
<section><h2>UC2 automation (${u.specs.length} specs)</h2>${table([['Case', 'case'], ['Spec', 'file'], ['Traces', 'traces'], ['Playbook data', 'dataKeys'], ['Page Objects', 'pageObjects'], ['Raw locators', 'raw']], u.specs.map((s) => ({ ...s, raw: s.rawLocators.length })))}
<p class="note">Flake: ${u.flake ? `${esc(u.flake.flakeRate)}% over ${u.flake.runs.length} runs (${esc(u.flake.verdict)})` : 'not yet run'}</p></section>
<section><h2>Governance trail (human-in-the-loop)</h2>${table([['ID', 'id'], ['Gate', 'gate'], ['Subject', 'subject'], ['Decision', 'decision'], ['By', 'by'], ['Review min', 'reviewMinutes']], a.trail.entries)}</section>
</main></body></html>
`;
}

async function build({ epic = 'AQPI-2', root = ROOT } = {}) {
  const a = await analyseEpic(epic, { root });
  const u = analyseAutomation({ root, epic });
  const out = path.join(root, 'artifacts', INITIATIVE);
  const epicDir = path.join(out, epic);
  fs.mkdirSync(path.join(epicDir, 'scaffolds'), { recursive: true });
  for (const f of fs.readdirSync(path.join(epicDir, 'scaffolds'))) fs.rmSync(path.join(epicDir, 'scaffolds', f));
  const files = [];
  const s1 = path.join(epicDir, 'Stage - 1 Requirement & details.xlsx');
  const s2 = path.join(epicDir, 'Stage - 2 Test Scenarios & Test cases.xlsx');
  await stage1Xlsx(a, s1);
  await stage2Xlsx(a, s2);
  files.push(s1, s2);
  for (const c of a.stage2.cases) files.push(write(path.join(epicDir, 'scaffolds', `${c.id}.spec.ts`), scaffold(c, epic)));
  const cov = coverageRows(a);
  files.push(write(path.join(epicDir, 'coverage-matrix.csv'), csv(cov, [{ header: 'Requirement', key: 'id' }, { header: 'Level', key: 'level' }, { header: 'Jira key', key: 'story' }, { header: 'Type', key: 'kind' }, { header: 'Requirement', key: 'text' }, { header: 'Risk', key: 'risk' }, { header: 'Cases', key: 'cases' }, { header: 'Status', key: 'status' }])));
  files.push(write(path.join(epicDir, 'gap-register.csv'), csv(a.stage1.gaps, ['id', 'g', 'ref', 'summary', 'assumption', 'owner', 'status'].map((k) => ({ header: k, key: k })))));
  const uc1Metrics = { epic, generatedAt: a.generatedAt, jira: a.jira, thresholds: a.thresholds, coverage: { ac: a.coverage.ac, br: a.coverage.br, uncovered: a.coverage.uncovered }, grounding: { claims: a.grounding.claims.length, ungrounded: a.grounding.ungrounded }, quality: a.quality, golden: a.golden };
  files.push(write(path.join(epicDir, 'metrics.json'), `${JSON.stringify(uc1Metrics, null, 2)}\n`));
  const uc2Cov = u.specs.map((s) => ({ case: s.case, title: s.title, spec: `tests/${u.app}/${s.file}`, traces: s.traces, tracesMatch: s.tracesMatch, data: s.data.map((d) => `${d.key}${d.inPlaybook && d.usedBySpec ? '' : ' (UNMAPPED)'}`), pageObjects: s.pageObjects, rawLocators: s.rawLocators.length, flake: u.flake ? (u.flake.tests.find((t) => t.title.startsWith(s.case)) || {}).outcomes : '' }));
  files.push(write(path.join(root, 'evidence', 'uc2', 'coverage-matrix.csv'), csv(uc2Cov, ['case', 'title', 'spec', 'traces', 'tracesMatch', 'data', 'pageObjects', 'rawLocators', 'flake'].map((k) => ({ header: k, key: k })))));
  files.push(write(path.join(root, 'evidence', 'uc2', 'automation-metrics.json'), `${JSON.stringify({ generatedAt: a.generatedAt, app: u.app, thresholds: u.thresholds, specs: uc2Cov, pageObjects: u.pageObjects }, null, 2)}\n`));
  const trail = a.trail;
  const summary = {
    generatedAt: a.generatedAt,
    initiative: readJson(path.join(root, 'design', INITIATIVE, 'initiative.json')),
    epic, jira: a.jira,
    stages: [
      { n: 1, name: 'Cognitive Analysis', active: true, status: stageStatus(trail, ['UC1-STAGE1-SCOPE']) },
      { n: 2, name: 'Intelligent Design', active: true, status: stageStatus(trail, ['UC1-STAGE2-APPROVAL', 'UC1-GATE1']) },
      { n: 3, name: 'Self-Adaptive Automation', active: true, status: stageStatus(trail, ['UC2-WEEK1-READINESS', 'UC2-CODE-REVIEW', 'UC2-GATE-SCALE']) },
      { n: 4, name: 'Orchestrated Execution', active: false, status: 'coming soon' },
      { n: 5, name: 'Insight Reporting', active: false, status: 'coming soon' },
    ],
    uc1: { thresholds: a.thresholds, coverage: cov, gaps: a.stage1.gaps, cases: a.stage2.cases, scenarios: a.stage2.scenarios, journeys: a.stage2.journeys, jiraItems: [a.jira.epic, ...a.jira.stories].map((i) => ({ key: i.key, summary: i.summary })), golden: a.golden, quality: a.quality, grounding: { claims: a.grounding.claims.length, ungrounded: a.grounding.ungrounded } },
    uc2: { thresholds: u.thresholds, specs: uc2Cov, pageObjects: u.pageObjects, flake: u.flake },
    trail: trail.entries,
    files: [],
  };
  const html = path.join(out, `${INITIATIVE}-analysis-and-progress.html`);
  files.push(write(html, trackerHtml(a, u, summary)));
  summary.files = [...files, path.join(root, 'artifacts', 'eqe-summary.json')].map((f) => path.relative(root, f));
  write(path.join(root, 'artifacts', 'eqe-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  build({ epic: process.argv[2] || 'AQPI-2' }).then((s) => { console.log(`${s.files.length} artifacts written:\n  ${s.files.join('\n  ')}`); }).catch((e) => { console.error(e.stack); process.exit(1); });
}
module.exports = { build, scaffold, coverageRows, csv };
