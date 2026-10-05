'use strict';
// Writes every run deliverable as an inspectable file under data/runs/<id>/artifacts. Regenerated after each state change, so
// trackers, workbooks and the evidence pack always reflect the same run object the UI shows.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const metrics = require('./metrics');
const { scaffold } = require('./stage2');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 1000) / 10}%`);
const check = (v) => (v === true ? 'PASS' : v === false ? 'FAIL' : 'PENDING');
const STAGES = [
  ['1', 'Cognitive Analysis'], ['2', 'Intelligent Design'], ['3', 'Self-Adaptive Automation'], ['4', 'Execution & Reporting (coming soon)'], ['5', 'Continuous Learning (coming soon)'],
];

function stageStatus(run) {
  const g = run.gates || {};
  return [
    g.scope?.status === 'approved' ? 'Approved' : g.scope?.status === 'rejected' ? 'Rejected' : run.stage1 ? 'Awaiting approval' : 'Not started',
    g.cases?.status === 'approved' ? 'Approved' : g.cases?.status === 'rejected' ? 'Rejected' : run.stage2 ? 'Awaiting review' : 'Locked',
    g.code?.status === 'approved' ? 'Approved' : g.code?.status === 'rejected' ? 'Rejected' : run.stage3?.status === 'complete' ? 'Awaiting approval' : run.stage3?.status ? run.stage3.status : 'Locked',
    'Coming soon', 'Coming soon',
  ];
}

async function sheetBook(file, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'eqe-poc (Devin AI for QE)';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map(([header, key, width]) => ({ header, key, width: width || 18 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D2742' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.addRows(s.rows);
    ws.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
  }
  await wb.xlsx.writeFile(file);
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;color:#1a1d24;background:#f2efea;font-size:14px}
header{background:#0d2742;color:#fff;padding:18px 4%;border-bottom:3px solid #c9952d}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#aebfd3}
main{padding:20px 4%}h2{color:#0d2742;font-size:17px;margin:24px 0 8px}table{border-collapse:collapse;width:100%;background:#fff;margin:6px 0 14px}
th,td{border:1px solid #dcd4c8;padding:6px 8px;text-align:left;vertical-align:top}th{background:#e3ebf4}.ok{color:#1e7a4a;font-weight:600}.bad{color:#a32020;font-weight:600}.pend{color:#9a6a12;font-weight:600}
.stages{display:flex;gap:6px}.stages div{flex:1;background:#fff;border:1px solid #dcd4c8;border-top:4px solid #0d2742;padding:8px}.stages div.soon{opacity:.55;border-top-color:#b5ab9c}
code{font-family:Consolas,monospace}small{color:#5a606d}</style></head><body>${body}</body></html>`;
const cls = (v) => (v === true ? 'ok' : v === false ? 'bad' : 'pend');
const table = (cols, rows) => `<table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</table>`;

function trackerHtml(run) {
  const s1 = run.stage1; const st = stageStatus(run);
  return page(`${run.initiative} analysis and progress`, `<header><h1>${esc(s1.initiative.key)} ${esc(s1.initiative.summary)} - analysis and progress</h1>
<p>${esc(run.id)} | source: ${esc(run.mode.label)} | epics in scope: ${run.epics.map(esc).join(', ')} | generated ${esc(new Date().toISOString())}</p></header><main>
<div class="stages">${STAGES.map(([n, t], i) => `<div class="${i > 2 ? 'soon' : ''}"><b>Stage ${n}</b><br>${esc(t)}<br><small>${esc(st[i])}</small></div>`).join('')}</div>
<h2>Objective</h2><ul>${s1.initiative.objective.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
<h2>Summary</h2>${table(Object.keys(s1.summary), [Object.values(s1.summary)])}
<h2>Epics and stories</h2>${table(['Epic', 'Story', 'Summary', 'Priority', 'Status', 'ACs', 'BRs'], s1.epics.flatMap((e) => e.stories.map((s) => [`<a href="${esc(e.url)}">${esc(e.key)}</a>`, `<a href="${esc(s.url)}">${esc(s.key)}</a>`, esc(s.summary), esc(s.priority), esc(s.status), s.acceptanceCriteria, s.businessRules])))}
<h2>Requirements and testability</h2>${table(['ID', 'Kind', 'Text', 'Lens', 'Automation', 'Framework components'], s1.requirements.map((r) => [esc(r.id), r.kind, esc(r.text), r.lens, esc(r.automation), esc(r.concepts.join(', '))]))}
<h2>Risks</h2>${table(['Story', 'Level', 'Risk', 'Evidence'], s1.risks.map((r) => [esc(r.story), r.level, esc(r.risk), esc(r.evidence)]))}
<h2>Gaps</h2>${table(['ID', 'Category', 'Ref', 'Description', 'Owner', 'Action', 'Status'], s1.gaps.map((g) => [g.id, esc(g.category), esc(g.ref), esc(g.description), esc(g.owner), esc(g.action), g.status]))}
<h2>Approval gates</h2>${gatesTable(run)}</main>`);
}

function gatesTable(run) {
  return table(['Gate', 'Status', 'Reviewer', 'Role', 'Review minutes', 'Decided at', 'Comment'], Object.entries(run.gates).map(([k, g]) => [k, esc(g.status), esc(g.actor || ''), esc(g.role || ''), g.minutes ?? '', esc(g.decidedAt || ''), esc(g.comment || '')]));
}

async function writeStage1(run, dir) {
  const s1 = run.stage1;
  fs.writeFileSync(path.join(dir, `${run.initiative}-analysis-and-progress.html`), trackerHtml(run));
  await sheetBook(path.join(dir, 'Stage-1-Requirement-and-details.xlsx'), [
    { name: 'Initiative', columns: [['Field', 'f', 22], ['Value', 'v', 110]], rows: [{ f: 'Key', v: s1.initiative.key }, { f: 'Summary', v: s1.initiative.summary }, { f: 'Source', v: run.mode.label }, { f: 'Objective', v: s1.initiative.objective.join('\n') }, { f: 'In scope', v: (s1.initiative.inScope || []).join('\n') }, { f: 'Out of scope', v: (s1.initiative.outOfScope || []).join('\n') }, { f: 'Epics analysed', v: run.epics.join(', ') }] },
    { name: 'Stories', columns: [['Epic', 'epic', 10], ['Story', 'key', 10], ['Summary', 'summary', 45], ['User story', 'userStory', 70], ['Priority', 'priority', 10], ['Status', 'status', 12], ['ACs', 'acceptanceCriteria', 6], ['BRs', 'businessRules', 6]], rows: s1.epics.flatMap((e) => e.stories.map((s) => ({ epic: e.key, ...s }))) },
    { name: 'Requirements', columns: [['ID', 'id', 14], ['Epic', 'epic', 9], ['Story', 'story', 9], ['Kind', 'kind', 6], ['Requirement', 'text', 80], ['Lens', 'lens', 8], ['Automation', 'automation', 26], ['Components', 'c', 30]], rows: s1.requirements.map((r) => ({ ...r, c: r.concepts.join(', ') })) },
    { name: 'Risks', columns: [['Story', 'story', 10], ['Level', 'level', 8], ['Risk', 'risk', 50], ['Evidence', 'evidence', 40]], rows: s1.risks },
    { name: 'Gaps', columns: [['ID', 'id', 9], ['Category', 'category', 22], ['Ref', 'ref', 14], ['Description', 'description', 80], ['Owner', 'owner', 18], ['Action', 'action', 50], ['Status', 'status', 8]], rows: s1.gaps },
  ]);
  await sheetBook(path.join(dir, 'gap-register.xlsx'), [{ name: 'Gap register', columns: [['ID', 'id', 9], ['Category', 'category', 22], ['Ref', 'ref', 14], ['Story', 'story', 9], ['Description', 'description', 80], ['Owner', 'owner', 18], ['Action', 'action', 50], ['Status', 'status', 8]], rows: s1.gaps }]);
}

async function writeStage2(run, dir) {
  const s2 = run.stage2; const v = s2.verdicts || {};
  const scDir = path.join(dir, 'design-scaffolds');
  fs.rmSync(scDir, { recursive: true, force: true }); fs.mkdirSync(scDir, { recursive: true });
  for (const c of s2.cases) fs.writeFileSync(path.join(scDir, `${c.id}.spec.ts`), scaffold(c));
  const zephyr = s2.cases.flatMap((c) => c.steps.map((s, i) => ({
    name: i ? '' : `${c.id} ${c.title}`, objective: i ? '' : c.objective, pre: i ? '' : c.preconditions, prio: i ? '' : c.priority, labels: i ? '' : `${c.type};${c.journey};${c.automatable ? 'automatable' : 'manual'}`,
    cov: i ? '' : c.story, folder: i ? '' : `/${c.epic}/${c.scenario}`, step: s.action, data: s.data, expected: s.expected, review: i ? '' : (v[c.id]?.verdict || 'not reviewed'),
  })));
  const golden = Object.entries(s2.golden || {}).flatMap(([epic, g]) => [
    ...g.matches.map((m) => ({ epic, kind: 'match', golden: m.g, generated: m.c, sim: m.sim })),
    ...g.missed.map((m) => ({ epic, kind: 'missed by Devin', golden: m.id, generated: '', sim: '' })),
    ...g.extra.map((m) => ({ epic, kind: 'extra (not in golden)', golden: '', generated: m.id, sim: '' })),
  ]);
  await sheetBook(path.join(dir, 'Stage-2-Test-Scenarios-and-Test-cases.xlsx'), [
    { name: 'Scenarios', columns: [['Scenario', 'id', 14], ['Title', 'title', 60], ['Epic', 'epic', 9], ['Story', 'story', 9], ['Cases', 'c', 60]], rows: s2.scenarios.map((s) => ({ ...s, c: s.cases.join(', ') })) },
    { name: 'Zephyr import', columns: [['Name', 'name', 50], ['Objective', 'objective', 50], ['Precondition', 'pre', 40], ['Priority', 'prio', 9], ['Labels', 'labels', 28], ['Coverage (Issues)', 'cov', 12], ['Folder', 'folder', 22], ['Test Script (Step-by-Step) - Step', 'step', 60], ['Test Data', 'data', 20], ['Expected Result', 'expected', 60], ['Review', 'review', 12]], rows: zephyr },
    { name: 'Guest journeys', columns: [['Epic', 'epic', 9], ['Journey', 'name', 30], ['Stories', 's', 20], ['Cases', 'c', 50], ['Flow', 'f', 80]], rows: s2.journeys.map((j) => ({ ...j, s: j.stories.join(', '), c: j.cases.join(', '), f: j.flow.join(' -> ') })) },
    { name: 'Golden comparison', columns: [['Epic', 'epic', 9], ['Result', 'kind', 22], ['Golden case', 'golden', 12], ['Generated case', 'generated', 16], ['Similarity', 'sim', 10]], rows: golden },
  ]);
  const m = metrics.uc1(run);
  const s3 = run.stage3; const u2 = metrics.uc2(run);
  const last = Object.fromEntries((u2.perTest || []).map((t) => [t.id, t]));
  await sheetBook(path.join(dir, 'coverage-matrix.xlsx'), [{
    name: 'Coverage matrix',
    columns: [['AC', 'id', 14], ['Story', 'story', 9], ['Acceptance criterion', 'text', 70], ['Lens', 'lens', 8], ['Cases', 'cases', 30], ['Review verdicts', 'verdicts', 30], ['Automated spec', 'spec', 22], ['5-run status', 'runs', 40], ['Covered', 'covered', 9]],
    rows: run.stage1.requirements.filter((r) => r.kind === 'AC').map((r) => {
      const cs = s2.cases.filter((c) => c.req === r.id);
      const auto = cs.filter((c) => s3?.caseIds?.includes(c.id));
      return { id: r.id, story: r.story, text: r.text, lens: r.lens, cases: cs.map((c) => c.id).join(', '), verdicts: cs.map((c) => `${c.id}: ${v[c.id]?.verdict || 'pending'}`).join('\n'), spec: auto.map((c) => `${c.id}.spec.ts`).join('\n'), runs: auto.map((c) => `${c.id}: ${(last[c.id]?.statuses || []).join('/') || 'not run'}`).join('\n'), covered: m.uncoveredAcs?.includes(r.id) ? 'No' : 'Yes' };
    }),
  }]);
  fs.writeFileSync(path.join(dir, 'golden-comparison.json'), JSON.stringify(s2.golden || {}, null, 2));
}

function flakeHtml(run) {
  const u2 = metrics.uc2(run); const s3 = run.stage3;
  return page('5-run flake report', `<header><h1>Stage 3 - 5-run flake report</h1><p>${esc(run.id)} | target: ${esc(s3.baseURL)} | ${u2.runsCompleted}/${u2.runsRequired} runs | flake rate ${pct(u2.flakeRate)} (threshold &lt; 5%)</p></header><main>
${table(['Run', 'Started', 'Duration (s)', 'Exit code', 'Passed', 'Failed'], s3.runs.map((r) => [r.n, esc(r.startedAt), (r.durationMs / 1000).toFixed(1), r.exitCode, r.tests.filter((t) => t.status === 'passed').length, r.tests.filter((t) => t.status !== 'passed').length]))}
<h2>Per test</h2>${table(['Test', ...s3.runs.map((r) => `Run ${r.n}`), 'Verdict'], (u2.perTest || []).map((t) => [esc(t.id), ...t.statuses.map((s) => `<span class="${s === 'passed' ? 'ok' : 'bad'}">${esc(s)}</span>`), t.flaky ? '<span class="bad">FLAKY</span>' : t.alwaysFail ? '<span class="bad">FAILING</span>' : '<span class="ok">STABLE</span>']))}
<h2>Failures</h2>${table(['Run', 'Test', 'Error'], s3.runs.flatMap((r) => r.tests.filter((t) => t.error).map((t) => [r.n, esc(t.id), `<code>${esc(t.error)}</code>`])))}</main>`);
}

function writeStage3(run, dir) {
  const s3 = run.stage3;
  const sp = path.join(dir, 'generated-specs');
  fs.rmSync(sp, { recursive: true, force: true }); fs.mkdirSync(sp, { recursive: true });
  for (const s of s3.specs || []) fs.writeFileSync(path.join(sp, path.basename(s.file)), s.code);
  fs.writeFileSync(path.join(dir, 'test-data-mapping.json'), JSON.stringify(s3.dataMapping || [], null, 2));
  if ((s3.runs || []).length) fs.writeFileSync(path.join(dir, 'flake-report.html'), flakeHtml(run));
}

function evidenceHtml(run) {
  const u1 = metrics.uc1(run); const u2 = metrics.uc2(run);
  const row = (name, val, thr, ok) => [esc(name), esc(val), esc(thr), `<span class="${cls(ok)}">${check(ok)}</span>`];
  const goldenRows = Object.entries(u1.golden || {}).map(([e, g]) => [e, esc(g.provenance?.status || ''), g.goldenCount, g.generatedCount, g.matches.length, pct(g.recall), pct(g.precision), esc(g.missed.map((x) => x.id).join(', '))]);
  return page('Evidence pack', `<header><h1>PoC evidence pack - ${esc(run.id)}</h1><p>Initiative ${esc(run.initiative)} | epics ${run.epics.map(esc).join(', ')} | ${esc(run.mode.label)} | generated ${esc(new Date().toISOString())}</p></header><main>
<p><small>All values are computed from this run's data (review verdicts, timed gate reviews, Playwright JSON reports). PENDING means the data does not exist yet.</small></p>
<h2>UC1 - Requirements to test design (Stages 1-2)</h2>${u1.ready ? table(['Criterion', 'Measured', 'Threshold', 'Result'], [
    row('Acceptance-criteria coverage', `${u1.acCovered}/${u1.acTotal} (${pct(u1.acCoverage)})`, '>= 80%', u1.checks.acCoverage),
    row('Hallucination rate', `${u1.hallucinated}/${u1.casesGenerated} reviewed ${u1.casesReviewed} (${pct(u1.hallucinationRate)})`, '<= 10%', u1.checks.hallucinationRate),
    row('Review minutes per epic', u1.reviewMinutesPerEpic === null ? 'n/a' : u1.reviewMinutesPerEpic.toFixed(1), '< 20', u1.checks.reviewMinutesPerEpic),
    row('QE lead approval of cases', u1.qeLeadApproved ? 'approved' : 'not yet', 'approved by QE lead', u1.checks.qeLeadApproved),
  ]) : '<p>Stage 2 not reached.</p>'}
<h3>Golden-set comparison</h3>${goldenRows.length ? table(['Epic', 'Golden status', 'Golden', 'Generated', 'Matched', 'Recall', 'Precision', 'Missed'], goldenRows) : '<p>No golden set compared yet.</p>'}
<h2>UC2 - Automation (Stage 3)</h2>${u2.ready ? table(['Criterion', 'Measured', 'Threshold', 'Result'], [
    row('Test data mapped to playbook', `${u2.dataMappedCount}/${u2.dataNeeds} (${pct(u2.dataMapped)})`, '>= 85%', u2.checks.dataMapped),
    row('Review minutes per spec', u2.reviewMinutesPerSpec === null ? 'n/a' : u2.reviewMinutesPerSpec.toFixed(1), '< 25', u2.checks.reviewMinutesPerSpec),
    row('Flake rate over 5 runs', `${u2.flaky}/${u2.perTest.length} flaky, ${u2.runsCompleted}/5 runs (${pct(u2.flakeRate)})`, '< 5%', u2.checks.flakeRate),
    row('Code approved', u2.codeApproved ? 'approved' : 'not yet', 'approved', u2.checks.codeApproved),
  ]) : '<p>Stage 3 not reached.</p>'}
<h2>Approval gates</h2>${gatesTable(run)}
<h2>Governance trail</h2>${table(['At', 'Actor', 'Role', 'Action', 'Detail'], run.trail.map((t) => [esc(t.at), esc(t.actor), esc(t.role), esc(t.action), esc(t.detail)]))}
<h2>Runbook</h2><ol><li>Stage 1: load initiative ${esc(run.initiative)} (${esc(run.mode.kind)}), analyse selected epic(s), QE lead approves scope.</li><li>Stage 2: Devin designs cases; reviewer marks each case; QE lead approves (timed).</li><li>Stage 3: approved cases become Playwright specs reusing pages/demo-booking; 5 dry runs against demo-booking; automation reviewer approves code (timed).</li><li>Stages 4-5 are out of PoC scope.</li></ol></main>`);
}

async function writeAll(run, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (run.stage1) await writeStage1(run, dir);
  if (run.stage2) await writeStage2(run, dir);
  if (run.stage3) writeStage3(run, dir);
  fs.writeFileSync(path.join(dir, 'evidence-pack.html'), evidenceHtml(run));
}

function list(dir) {
  const out = [];
  (function walk(d, rel) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push({ name: r, bytes: fs.statSync(path.join(d, e.name)).size });
    }
  }(dir, ''));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { writeAll, list, stageStatus, STAGES };
