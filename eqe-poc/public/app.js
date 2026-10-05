'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 1000) / 10}%`);
const pill = (v, t) => `<span class="pill ${v === true ? 'ok' : v === false ? 'bad' : 'warn'}">${esc(t ?? (v === true ? 'PASS' : v === false ? 'FAIL' : 'PENDING'))}</span>`;
const S = { meta: null, run: null, poll: null, tick: null };
const me = () => ({ actor: localStorage.getItem('eqe.actor') || '', role: localStorage.getItem('eqe.role') || 'QE lead' });

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
function showError(e) { const box = $('#err'); if (box) { box.textContent = e.message; box.hidden = false; window.scrollTo(0, 0); } else alert(e.message); }
const act = (fn) => async (...a) => { try { await fn(...a); } catch (e) { showError(e); } };

function identity() {
  const u = me();
  return `<div class="row"><div><label for="who">Your name (recorded on gates and verdicts)</label><input id="who" value="${esc(u.actor)}" placeholder="e.g. Priya Shah"></div>
  <div><label for="role">Your role</label><select id="role">${['QE lead', 'QE engineer', 'Automation reviewer', 'Product Owner'].map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div>`;
}
function bindIdentity() {
  const w = $('#who'); const r = $('#role');
  if (w) w.oninput = () => localStorage.setItem('eqe.actor', w.value.trim());
  if (r) r.onchange = () => localStorage.setItem('eqe.role', r.value);
}

async function runPage() {
  const m = S.meta; const max = m.scaling.uc1.maxEpics;
  $('#view').innerHTML = `<div id="err" class="err" hidden></div><h1>Start a run</h1>
  <p class="muted">Devin reads the initiative from Jira, analyses the selected epic (Stage 1), designs test cases (Stage 2) and automates approved cases against demo-booking (Stage 3). Each stage stops at a human approval gate.</p>
  <div class="card">${identity()}
  <div class="row"><div><label for="ini">Initiative</label><select id="ini">${m.initiatives.map((i) => `<option value="${esc(i.key)}">${esc(i.key)} - ${esc(i.summary)}</option>`).join('')}</select></div></div>
  <label>Epics in scope <span class="muted small">(Gate 1: ${max} epic${max > 1 ? 's' : ''} ${max > 1 ? `unlocked by ${esc(m.scaling.uc1.unlockedBy)}` : 'until a run passes the UC1 criteria'})</span></label><div id="epics" class="muted">Loading epics...</div>
  <label><input type="checkbox" id="neg"> Also derive negative cases from business rules (default: happy path / acceptance criteria only)</label>
  <p><button class="btn gold" id="go">Run Stage 1 analysis</button></p></div>`;
  bindIdentity();
  const loadEpics = act(async () => {
    const d = await api('GET', `/api/initiatives/${$('#ini').value}`);
    $('#epics').innerHTML = d.epics.map((e, i) => `<label style="font-weight:400"><input type="checkbox" name="epic" value="${esc(e.key)}" ${i === 0 ? 'checked' : ''}> <b>${esc(e.key)}</b> ${esc(e.summary)} <span class="muted small">(${e.stories} stories)</span></label>`).join('');
    $('#epics').onchange = () => { const c = [...document.querySelectorAll('[name=epic]:checked')]; document.querySelectorAll('[name=epic]').forEach((x) => { x.disabled = !x.checked && c.length >= max; }); };
    $('#epics').onchange();
  });
  $('#ini').onchange = loadEpics; await loadEpics();
  $('#go').onclick = act(async () => {
    const epics = [...document.querySelectorAll('[name=epic]:checked')].map((x) => x.value);
    if (!me().actor) throw new Error('Enter your name first');
    $('#go').disabled = true; $('#go').textContent = 'Analysing...';
    try { const r = await api('POST', '/api/runs', { initiative: $('#ini').value, epics, includeNegatives: $('#neg').checked, actor: me().actor }); location.hash = `#/runs/${r.id}/overview`; } finally { $('#go').disabled = false; }
  });
}

async function runsPage() {
  const runs = await api('GET', '/api/runs');
  $('#view').innerHTML = `<h1>Runs</h1>${runs.length ? `<table><tr><th>Run</th><th>Started</th><th>Initiative</th><th>Epics</th><th>Source</th><th>Status</th></tr>${runs.map((r) => `<tr><td><a href="#/runs/${r.id}/overview">${r.id}</a></td><td>${esc(new Date(r.createdAt).toLocaleString())}</td><td>${esc(r.initiative)}</td><td>${esc(r.epics.join(', '))}</td><td>${esc(r.mode)}</td><td>${esc(r.status)}</td></tr>`).join('')}</table>` : '<p class="muted">No runs yet. <a href="#/run">Start one</a>.</p>'}`;
}

const TABS = [['overview', 'Overview & gates'], ['stage1', 'Stage 1 analysis'], ['stage2', 'Stage 2 cases'], ['stage3', 'Stage 3 automation'], ['jira', 'By Jira item'], ['compare', 'Compare'], ['evidence', 'Evidence & artifacts']];

function stageBar(run) {
  return `<div class="stages">${S.meta.stages.map(([n, t], i) => { const s = run.stages[i]; const c = i > 2 ? 'soon' : s === 'Approved' ? 'done' : /Await/.test(s) || s === 'running' ? 'wait' : ''; return `<div class="stage ${c}"><b>Stage ${n}</b>${esc(t)}<br><span class="muted small">${esc(s)}</span></div>`; }).join('')}</div>`;
}

function gatePanel(run) {
  const order = ['scope', 'cases', 'code'];
  const key = order.find((k) => run.gates[k].status === 'pending');
  if (!key) {
    if (run.status === 'ready-for-automation') return `<div class="card gate"><h3>Stage 3 - generate and dry-run Playwright specs</h3>${run.stage3 && run.stage3.status !== 'running' ? `<p class="warn">Previous Stage 3 attempt ended as <b>${esc(run.stage3.status)}</b> (${run.stage3.runs.length}/5 runs${run.metrics.uc2.missing?.length ? `, ${run.metrics.uc2.missing.length} missing test result(s)` : ''}). Starting again replaces it.</p>` : ''}<p class="muted">Approved, automatable cases become Playwright TypeScript reusing the demo-booking Page Objects, then run 5 times against demo-booking. Gate 2 allows ${S.meta.scaling.uc2.maxCases} case(s).</p><button class="btn gold" id="s3">${run.stage3 ? 'Retry: generate specs and run 5 times' : 'Generate specs and run 5 times'}</button></div>`;
    if (run.stage3?.status === 'running') return `<div class="card gate"><h3>Stage 3 running</h3><p>${run.stage3.runs.length}/5 dry runs complete...</p></div>`;
    return `<div class="card"><b>Status:</b> ${esc(run.status)}</div>`;
  }
  const g = run.gates[key]; const u = me();
  const hint = { scope: 'Review the Stage 1 analysis (requirements, risks, gaps) and approve the scope for test design.', cases: 'Mark every case on the Stage 2 tab (accepted / incorrect / hallucinated / duplicate), then approve. A QE lead approval is a UC1 success criterion.', code: 'Review the generated specs and 5-run flake report on the Stage 3 tab, then approve the code.' }[key];
  const reviewed = key === 'cases' ? `<p>${Object.keys(run.stage2.verdicts).length}/${run.stage2.cases.length} cases reviewed.</p>` : '';
  return `<div class="card gate"><h3>Approval gate: ${esc(S.meta.gates[key])}</h3><p class="muted">${hint}</p>${reviewed}${identity()}
  ${g.startedAt ? `<p>Timed review started by <b>${esc(g.actor)}</b> at ${esc(new Date(g.startedAt).toLocaleTimeString())} - elapsed <b id="elapsed" data-start="${esc(g.startedAt)}"></b></p>
  <label for="cmt">Comment</label><input id="cmt" style="width:100%" placeholder="optional">
  <p><button class="btn" id="approve">Approve</button> <button class="btn bad" id="reject">Reject</button></p>` : `<p><button class="btn gold" id="startrev">Start timed review</button></p>`}</div>`;
}

function overview(run) {
  const u1 = run.metrics.uc1; const u2 = run.metrics.uc2; const s = run.stage1.summary;
  return `${gatePanel(run)}<div class="grid">
  <div class="card"><div class="muted small">Stories / ACs / BRs</div><div class="kpi">${s.stories} / ${s.acceptanceCriteria} / ${s.businessRules}</div></div>
  <div class="card"><div class="muted small">Gaps / risks</div><div class="kpi">${s.gaps} / ${s.risks}</div></div>
  <div class="card"><div class="muted small">AC coverage (>= 80%)</div><div class="kpi">${u1.ready ? pct(u1.acCoverage) : 'n/a'}</div>${u1.ready ? pill(u1.checks.acCoverage) : ''}</div>
  <div class="card"><div class="muted small">Hallucination rate (<= 10%)</div><div class="kpi">${u1.ready ? pct(u1.hallucinationRate) : 'n/a'}</div>${u1.ready ? pill(u1.checks.hallucinationRate) : ''}</div>
  <div class="card"><div class="muted small">Flake rate over 5 runs (< 5%)</div><div class="kpi">${u2.ready ? pct(u2.flakeRate) : 'n/a'}</div>${u2.ready ? pill(u2.checks.flakeRate) : ''}</div></div>
  <h2>Governance trail</h2><table><tr><th>At</th><th>Actor</th><th>Role</th><th>Action</th><th>Detail</th></tr>${run.trail.slice().reverse().map((t) => `<tr><td>${esc(new Date(t.at).toLocaleString())}</td><td>${esc(t.actor)}</td><td>${esc(t.role)}</td><td>${esc(t.action)}</td><td>${esc(t.detail)}</td></tr>`).join('')}</table>`;
}

function stage1(run) {
  const s = run.stage1;
  return `<h2>Requirements and testability</h2><table><tr><th>ID</th><th>Kind</th><th>Requirement</th><th>Lens</th><th>Automation</th></tr>${s.requirements.map((r) => `<tr><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.id)}</a></td><td>${r.kind}</td><td>${esc(r.text)}</td><td>${r.lens}</td><td>${esc(r.automation)}${r.concepts.length ? `<br><span class="muted small">${esc(r.concepts.join(', '))}</span>` : ''}</td></tr>`).join('')}</table>
  <h2>Risks</h2><table><tr><th>Story</th><th>Level</th><th>Risk</th><th>Evidence</th></tr>${s.risks.map((r) => `<tr><td>${esc(r.story)}</td><td>${pill(r.level === 'High' ? false : null, r.level)}</td><td>${esc(r.risk)}</td><td>${esc(r.evidence)}</td></tr>`).join('')}</table>
  <h2>Gap register</h2><table><tr><th>ID</th><th>Category</th><th>Ref</th><th>Description</th><th>Owner</th><th>Action</th></tr>${s.gaps.map((g) => `<tr><td>${g.id}</td><td>${esc(g.category)}</td><td>${esc(g.ref)}</td><td>${esc(g.description)}</td><td>${esc(g.owner)}</td><td>${esc(g.action)}</td></tr>`).join('')}</table>`;
}

function caseBlock(run, c, editable) {
  const v = run.stage2.verdicts[c.id];
  return `<details><summary>${esc(c.id)} - ${esc(c.title)} <span class="muted small">(${esc(c.req)}, ${c.type}, ${c.automatable ? 'automatable' : 'manual'})</span> ${v ? pill(v.verdict === 'accepted' ? true : false, v.verdict) : pill(null, 'not reviewed')}</summary>
  <p class="small"><b>Objective:</b> ${esc(c.objective)}<br><b>Preconditions:</b> ${esc(c.preconditions)}</p>
  <table><tr><th>#</th><th>Action</th><th>Expected</th></tr>${c.steps.map((s) => `<tr><td>${s.n}</td><td>${esc(s.action)}</td><td>${esc(s.expected)}</td></tr>`).join('')}</table>
  ${editable ? `<p>${S.meta.verdicts.map((x) => `<button class="btn sm ${x === 'accepted' ? '' : 'ghost'}" data-case="${esc(c.id)}" data-verdict="${x}">${x}</button>`).join(' ')}</p>` : ''}</details>`;
}

function stage2(run) {
  if (!run.stage2) return '<p class="muted">Stage 2 starts when the Stage 1 scope is approved.</p>';
  const editable = run.gates.cases.status === 'pending';
  return `${editable ? `<div class="card gate">Review each case. ${run.gates.cases.startedAt ? '' : 'Start the timed review on the Overview tab first so review time is measured.'} <button class="btn sm ghost" id="acceptall">Mark all unreviewed as accepted</button></div>` : ''}
  ${run.stage2.scenarios.map((s) => `<h3>${esc(s.id)} - ${esc(s.title)}</h3>${run.stage2.cases.filter((c) => c.scenario === s.id).map((c) => caseBlock(run, c, editable)).join('')}`).join('')}
  <h2>Guest journeys</h2><table><tr><th>Journey</th><th>Stories</th><th>Cases</th></tr>${run.stage2.journeys.map((j) => `<tr><td>${esc(j.name)}</td><td>${esc(j.stories.join(', '))}</td><td>${esc(j.cases.join(', '))}</td></tr>`).join('')}</table>`;
}

function stage3(run) {
  const s3 = run.stage3; const u2 = run.metrics.uc2;
  if (!s3) return '<p class="muted">Stage 3 starts after the Stage 2 cases are approved (see Overview).</p>';
  return `<p>Target: <code>${esc(s3.baseURL)}</code> | status <b>${esc(s3.status)}</b> | ${s3.runs.length}/5 runs | pass rate ${pct(u2.passRate)} | flake rate ${pct(u2.flakeRate)} | data mapped ${pct(u2.dataMapped)}</p>
  ${u2.perTest?.length ? `<table><tr><th>Test</th>${s3.runs.map((r) => `<th>Run ${r.n}</th>`).join('')}<th>Verdict</th></tr>${u2.perTest.map((t) => `<tr><td>${esc(t.id)}</td>${t.statuses.map((x) => `<td class="${x === 'passed' ? 'ok' : 'bad'}">${esc(x)}</td>`).join('')}<td>${t.flaky ? pill(false, 'FLAKY') : t.alwaysFail ? pill(false, 'FAILING') : pill(true, 'STABLE')}</td></tr>`).join('')}</table>` : ''}
  ${s3.runs.flatMap((r) => r.tests.filter((t) => t.error).map((t) => `<div class="err">Run ${r.n} ${esc(t.id)}: ${esc(t.error)}</div>`)).join('')}${s3.runs.filter((r) => r.log).map((r) => `<pre>${esc(r.log)}</pre>`).join('')}
  <h2>Test-data mapping</h2><table><tr><th>Case</th><th>Need</th><th>Playbook entry</th></tr>${s3.dataMapping.map((d) => `<tr><td>${esc(d.case)}</td><td>${esc(d.need)}</td><td>${d.playbookEntry ? `<code>${esc(JSON.stringify(d.value))}</code>` : pill(false, 'unmapped')}</td></tr>`).join('')}</table>
  <h2>Generated specs</h2>${s3.specs.map((s) => `<details><summary>${esc(s.file)}</summary><pre>${esc(s.code)}</pre></details>`).join('')}`;
}

function jiraView(run) {
  const cases = run.stage2?.cases || []; const v = run.stage2?.verdicts || {}; const auto = run.metrics.uc2.perTest || [];
  return run.stage1.epics.map((e) => `<h2><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.key)}</a> ${esc(e.summary)}</h2>${e.stories.map((s) => `<div class="card"><h3><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.key)}</a> ${esc(s.summary)} <span class="pill">${esc(s.priority)}</span></h3><p class="muted small">${esc(s.userStory)}</p>
  <table><tr><th>Requirement</th><th>Gaps</th><th>Cases</th><th>Automation (5 runs)</th></tr>${run.stage1.requirements.filter((r) => r.story === s.key).map((r) => {
    const cs = cases.filter((c) => c.req === r.id); const gaps = run.stage1.gaps.filter((g) => g.ref === r.id);
    return `<tr><td><b>${esc(r.id)}</b> ${esc(r.text)}</td><td>${gaps.map((g) => `${g.id} ${esc(g.category)}`).join('<br>')}</td><td>${cs.map((c) => `${esc(c.id)} ${v[c.id] ? pill(v[c.id].verdict === 'accepted', v[c.id].verdict) : ''}`).join('<br>') || '<span class="muted">-</span>'}</td><td>${cs.map((c) => auto.find((t) => t.id === c.id)).filter(Boolean).map((t) => `${esc(t.id)} ${t.statuses.map((x) => (x === 'passed' ? 'P' : 'F')).join('')}`).join('<br>')}</td></tr>`;
  }).join('')}</table></div>`).join('')}`).join('');
}

function compare(run) {
  if (!run.stage2) return '<p class="muted">Available after Stage 2.</p>';
  return Object.entries(run.stage2.golden).map(([epic, g]) => `<h2>${esc(epic)} - Devin vs golden set</h2>
  <div class="card ${g.provenance.status === 'human-authored' ? '' : 'gate'}">Golden set provenance: <b>${esc(g.provenance.status || 'unknown')}</b> - ${esc(g.provenance.authoredBy || '')}${g.provenance.note ? `<br><span class="muted small">${esc(g.provenance.note)}</span>` : ''}</div>
  <div class="grid"><div class="card"><div class="muted small">Golden cases matched (recall)</div><div class="kpi">${g.matches.length}/${g.goldenCount} (${pct(g.recall)})</div></div><div class="card"><div class="muted small">Devin cases matching golden (precision)</div><div class="kpi">${g.matches.length}/${g.generatedCount} (${pct(g.precision)})</div></div><div class="card"><div class="muted small">Golden requirements covered by Devin</div><div class="kpi">${pct(g.reqCoverageOfGolden)}</div></div></div>
  <table><tr><th>Golden case</th><th>Devin case</th><th>Similarity</th></tr>${g.matches.map((m) => `<tr><td>${esc(m.g)}</td><td>${esc(m.c)}</td><td>${m.sim}</td></tr>`).join('')}${g.missed.map((m) => `<tr><td>${esc(m.id)} ${esc(m.title)}</td><td class="bad">missed by Devin (${esc(m.req)})</td><td></td></tr>`).join('')}${g.extra.map((m) => `<tr><td class="warn">not in golden set</td><td>${esc(m.id)} ${esc(m.title)}</td><td></td></tr>`).join('')}</table>
  <details><summary>Replace golden set with the QE team's human-authored cases</summary>${identity()}<label for="gold-${esc(epic)}">JSON array of {"id","req","title","steps":[],"expected"}</label><textarea id="gold-${esc(epic)}">${esc(JSON.stringify(run.stage2.goldenSets[epic].cases, null, 2))}</textarea><p><button class="btn" data-golden="${esc(epic)}">Save as human-authored and recompute</button></p></details>`).join('') || '<p class="muted">No golden set found for the selected epic(s).</p>';
}

function evidence(run) {
  const u1 = run.metrics.uc1; const u2 = run.metrics.uc2;
  const row = (n, val, t, ok) => `<tr><td>${n}</td><td>${esc(val)}</td><td>${t}</td><td>${pill(ok)}</td></tr>`;
  return `<h2>PoC success criteria (computed from this run)</h2><table><tr><th>Criterion</th><th>Measured</th><th>Threshold</th><th>Result</th></tr>
  ${u1.ready ? row('UC1 AC coverage', `${u1.acCovered}/${u1.acTotal} (${pct(u1.acCoverage)})`, '>= 80%', u1.checks.acCoverage) + row('UC1 hallucination rate', `${u1.hallucinated}/${u1.casesGenerated}, ${u1.casesReviewed} reviewed (${pct(u1.hallucinationRate)})`, '<= 10%', u1.checks.hallucinationRate) + row('UC1 review minutes per epic', u1.reviewMinutesPerEpic ?? 'n/a', '< 20', u1.checks.reviewMinutesPerEpic) + row('UC1 QE lead approval', u1.qeLeadApproved ? 'yes' : 'no', 'approved by QE lead', u1.checks.qeLeadApproved) : '<tr><td colspan="4" class="muted">UC1 metrics after Stage 2</td></tr>'}
  ${u2.ready ? row('UC2 test data mapped', `${u2.dataMappedCount}/${u2.dataNeeds} (${pct(u2.dataMapped)})`, '>= 85%', u2.checks.dataMapped) + row('UC2 review minutes per spec', u2.reviewMinutesPerSpec ?? 'n/a', '< 25', u2.checks.reviewMinutesPerSpec) + row('UC2 flake rate (5 runs)', `${u2.flaky}/${u2.perTest.length} flaky, ${u2.runsCompleted}/5 runs (${pct(u2.flakeRate)})`, '< 5%', u2.checks.flakeRate) + row('UC2 code approved', u2.codeApproved ? 'yes' : 'no', 'approved', u2.checks.codeApproved) : '<tr><td colspan="4" class="muted">UC2 metrics after Stage 3</td></tr>'}</table>
  <h2>Artifacts</h2><table><tr><th>File</th><th>Size</th></tr>${run.artifacts.map((a) => `<tr><td><a href="/runs/${run.id}/artifacts/${a.name.split('/').map(encodeURIComponent).join('/')}" target="_blank">${esc(a.name)}</a></td><td>${(a.bytes / 1024).toFixed(1)} KB</td></tr>`).join('')}</table>
  <h2>Jira source</h2><p class="muted">${esc(run.mode.label)}</p>${(run.sourceFiles || []).length ? `<ul>${run.sourceFiles.map((f) => `<li><a href="${esc(f)}" target="_blank" rel="noopener">${esc(f.split('/').pop())}</a></li>`).join('')}</ul>` : ''}`;
}

async function runDetail(id, tab) {
  const run = await api('GET', `/api/runs/${id}`); S.run = run;
  const body = { overview, stage1, stage2, stage3, jira: jiraView, compare, evidence }[tab] || overview;
  $('#view').innerHTML = `<div id="err" class="err" hidden></div><h1>${esc(run.id)} - ${esc(run.stage1.initiative.key)} ${esc(run.stage1.initiative.summary)}</h1>
  <p class="muted">Epics: ${esc(run.epics.join(', '))} | status <b>${esc(run.status)}</b> | ${esc(run.mode.kind === 'live' ? 'live Jira' : 'Jira snapshot')}</p>${stageBar(run)}
  <div class="tabs">${TABS.map(([k, t]) => `<a href="#/runs/${id}/${k}" class="${k === tab ? 'active' : ''}">${t}</a>`).join('')}</div>${body(run)}`;
  bindIdentity(); bindRun(run, tab);
  clearInterval(S.poll);
  if (run.stage3?.status === 'running') S.poll = setInterval(() => { if (location.hash.startsWith(`#/runs/${id}`)) route(); else clearInterval(S.poll); }, 3000);
}

function bindRun(run, tab) {
  const id = run.id; const reload = () => runDetail(id, tab);
  const gate = ['scope', 'cases', 'code'].find((k) => run.gates[k].status === 'pending');
  const need = () => { const u = me(); if (!u.actor) throw new Error('Enter your name first'); return u; };
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = act(fn); };
  on('#startrev', async () => { await api('POST', `/api/runs/${id}/gates/${gate}/start`, need()); reload(); });
  on('#approve', async () => { await api('POST', `/api/runs/${id}/gates/${gate}/decision`, { ...need(), decision: 'approved', comment: $('#cmt').value }); reload(); });
  on('#reject', async () => { await api('POST', `/api/runs/${id}/gates/${gate}/decision`, { ...need(), decision: 'rejected', comment: $('#cmt').value }); reload(); });
  on('#s3', async () => { await api('POST', `/api/runs/${id}/stage3`, { actor: need().actor }); location.hash = `#/runs/${id}/stage3`; });
  on('#acceptall', async () => { const u = need(); for (const c of run.stage2.cases) if (!run.stage2.verdicts[c.id]) await api('POST', `/api/runs/${id}/cases/${c.id}/verdict`, { actor: u.actor, verdict: 'accepted' }); reload(); });
  document.querySelectorAll('[data-verdict]').forEach((b) => { b.onclick = act(async () => { const note = b.dataset.verdict === 'accepted' ? '' : (prompt(`Why is ${b.dataset.case} ${b.dataset.verdict}?`) || ''); await api('POST', `/api/runs/${id}/cases/${b.dataset.case}/verdict`, { actor: need().actor, verdict: b.dataset.verdict, note }); const open = b.closest('details'); reload().then(() => { const d = [...document.querySelectorAll('details summary')].find((s) => s.textContent.startsWith(b.dataset.case)); if (d && open) d.parentElement.open = false; }); }); });
  document.querySelectorAll('[data-golden]').forEach((b) => { b.onclick = act(async () => { const epic = b.dataset.golden; let cases; try { cases = JSON.parse($(`#gold-${epic}`).value); } catch { throw new Error('Golden set is not valid JSON'); } const u = need(); await api('POST', `/api/runs/${id}/golden`, { set: { epic, cases }, ...u }); reload(); }); });
  clearInterval(S.tick);
  const el = $('#elapsed');
  if (el) { const t = () => { const s = Math.floor((Date.now() - Date.parse(el.dataset.start)) / 1000); el.textContent = `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; }; t(); S.tick = setInterval(t, 1000); }
}

async function route() {
  const parts = (location.hash || '#/run').slice(2).split('/');
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === (parts[0] === 'runs' && parts[1] ? 'runs' : parts[0])));
  try {
    S.meta = await api('GET', '/api/meta');
    $('#mode').innerHTML = `Jira source: <b>${S.meta.mode.kind === 'live' ? 'LIVE (dummy)' : 'SNAPSHOT'}</b><br>${esc(S.meta.mode.label)}`;
    if (parts[0] === 'runs' && parts[1]) await runDetail(parts[1], parts[2] || 'overview');
    else if (parts[0] === 'runs') await runsPage();
    else await runPage();
  } catch (e) { $('#view').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);
route();
