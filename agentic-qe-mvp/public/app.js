'use strict';
/* Agentic QE Platform - MVP - plain JS front end (hash routing, no framework). */
const TITLE = 'Agentic QE Platform - MVP';
const $view = document.getElementById('view');
let META = null;
let pollTimer = null;
const runState = { type: 'baseline', example: 'hotel', testingTypes: ['functional'], baselineId: '', inputs: {}, inputsOff: new Set(), skills: null, open: new Set() };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (text, cls) => `<span class="pill ${esc(cls || String(text).replace(/\s+/g, '-'))}">${esc(text)}</span>`;
const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '-');

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { details: (data && data.details) || null });
  return data;
}

function table(headers, rows, rowClass) {
  if (!rows.length) return '<p class="muted">None.</p>';
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${rowClass ? esc(rowClass(i)) : ''}">${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const PROV_TEXT = { live: 'live Jira call', github: 'pulled live from GitHub', 'jira-export': 'Jira export on GitHub', fixture: 'recorded fixture', pasted: 'pasted' };
const provPill = (p) => pill(PROV_TEXT[p.kind === 'github' && p.system === 'jira' ? 'jira-export' : p.kind] || p.kind, p.kind);
const artPill = (s) => pill(s, s === 'carried over' ? 'carried' : s);

/** Error box that names what is missing before an approval and links to each missing item. */
function showBlocked(el, title, problems, cycleId) {
  const items = problems.filter((p) => p.message || p.gate).map((p, i) => {
    const text = p.message || (p.gate === 'review' ? 'Open the requirement-set review and approve it first' : 'Open the merge screen and approve the merge into the baseline');
    return `<li><a href="#" data-go="${i}">${esc(text)}</a></li>`;
  });
  el.innerHTML = `<div class="banner err blocked"><b>${esc(title)}</b>${items.length ? `<ul>${items.join('')}</ul>` : ''}</div>`;
  $view.querySelectorAll('.need').forEach((n) => n.classList.remove('need'));
  const targets = problems.filter((p) => p.message || p.gate).map((p) => {
    if (p.field) return document.getElementById(p.field);
    if (p.group) return $view.querySelector(`[data-conflict="${p.group}"]`);
    return null;
  });
  targets.forEach((t) => t && t.classList.add('need'));
  el.querySelectorAll('[data-go]').forEach((a) => a.onclick = (ev) => {
    ev.preventDefault();
    const p = problems.filter((x) => x.message || x.gate)[Number(a.dataset.go)];
    if (p.gate) { location.hash = `#/cycle/${cycleId}?tab=${p.gate}`; return; }
    const t = targets[Number(a.dataset.go)];
    if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (t.focus) t.focus(); }
  });
  el.scrollIntoView({ block: 'nearest' });
}

const GATE_TEXT = { 'awaiting-review': 'approve the requirement set', 'awaiting-merge': 'approve the merge into the baseline' };
/** "Action needed" banner for every cycle stopped at a human approval. */
function pendingBanner(cycles, exceptId) {
  const waiting = cycles.filter((x) => GATE_TEXT[x.status] && x.id !== exceptId);
  if (!waiting.length) return '';
  return `<div class="banner action"><b>Action needed</b><ul>${waiting.map((x) => `<li>${esc(x.id)} · ${esc(x.name)} is waiting for you to ${GATE_TEXT[x.status]}${x.status === 'awaiting-merge' && x.baselineId ? ` ${esc(x.baselineId)}` : ''}. <a href="#/cycle/${esc(x.id)}?tab=${x.status === 'awaiting-review' ? 'review' : 'merge'}">Go to the approval</a></li>`).join('')}</ul></div>`;
}

function setTitle(sub) { document.title = sub ? `${sub} - ${TITLE}` : TITLE; }
function activeNav(route) {
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${route}` || (route === '' && a.getAttribute('href') === '#/')));
}

async function loadMeta() {
  META = await api('/api/meta');
}

function modesHtml() {
  return [
    META.jira.mode === 'live' ? pill(`Jira: live (${META.jira.baseUrl}); defects raised in Jira`, 'live') : `<span title="${esc(META.jira.note)}">${pill(`Jira: export on GitHub (${META.jiraExport.branch}) or recorded fixture; live Jira not configured, so defects are not raised in Jira`, 'github')}</span>`,
    pill(`Source: GitHub ${META.codebase.repo}`, 'github'),
    META.model.mode === 'model' ? pill(`Prose: ${META.model.model}`, 'live') : `<span title="${esc(META.model.note)}">${pill('Prose: deterministic demo mode', 'demo')}</span>`,
  ].join('');
}

/* ---------------- Home ---------------- */
const skillFitsType = (s, ids) => !s.testingType || ids.includes(s.testingType);
const selectedSkills = () => runState.skills || META.skills.filter((s) => skillFitsType(s, runState.testingTypes)).map((s) => s.id);
const ownes = (s) => Object.entries(s.delivers).map(([a, keys]) => `${a}: ${keys.join(', ')}`).join(' · ');

/** A single type of testing, or several ticked together (persisted as ids joined with "+"). */
function testingTypeOf(value, domainId) {
  const ids = String(value || META.defaultTestingType).split('+');
  const inDomain = (t) => { const o = t.domains?.[domainId]; return o ? { ...t, ...o, agents: { ...t.agents, ...o.agents } } : t; };
  const parts = META.testingTypes.filter((t) => ids.includes(t.id)).map(inDomain);
  if (!parts.length) return META.testingTypes.find((t) => t.id === META.defaultTestingType);
  if (parts.length === 1) return parts[0];
  const each = (f) => parts.map((p) => `${p.short}: ${p[f]}`).join(' ');
  const agents = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.agents)) agents[k] = agents[k] ? `${agents[k]} · ${p.short}: ${v}` : `${p.short}: ${v}`;
  return {
    id: parts.map((p) => p.id).join('+'), name: `${parts.map((p) => p.short).join(' + ')} testing`, short: parts.map((p) => p.short).join(' + '),
    focus: each('focus'), baseline: each('baseline'), incremental: each('incremental'), agents,
  };
}

/** A drop-down whose options are checkboxes. Open state survives the Run page re-rendering. */
function checkDropdown(id, summaryHtml, bodyHtml) {
  return `<details class="ms" data-ms="${id}" ${runState.open.has(id) ? 'open' : ''}><summary><span class="ms-value">${summaryHtml}</span><span class="ms-caret" aria-hidden="true">▾</span></summary><div class="ms-menu">${bodyHtml}</div></details>`;
}
function checkItem({ cls, value, checked, disabled = false, title, tag = '', sub = '', extra = '' }) {
  return `<label class="ms-item ${checked ? 'on' : ''} ${disabled ? 'off' : ''}"><input type="checkbox" class="${cls}" value="${esc(value)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><b>${esc(title)}</b>${tag}${sub ? `<span class="muted">${esc(sub)}</span>` : ''}${extra}</span></label>`;
}
const closeDropdowns = (except = null) => {
  document.querySelectorAll('details.ms[open]').forEach((d) => { if (d !== except) d.open = false; });
  runState.open = except ? new Set([except.dataset.ms]) : new Set();
};
document.addEventListener('click', (ev) => closeDropdowns(ev.target.closest ? ev.target.closest('details.ms') : null));
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDropdowns(); });
const chips = (names) => names.map((n) => `<span class="ms-chip">${esc(n)}</span>`).join('');
const skillsSummary = (n) => `${chips([`${n} of ${META.skills.length} selected`])}<span class="muted small">skills</span>`;

function skillsDropdown() {
  const on = new Set(selectedSkills());
  const item = (s) => checkItem({
    cls: 'skill-on', value: s.id, checked: on.has(s.id), title: s.name, sub: s.description,
    extra: `<span class="small muted">${s.source === 'enterprise upload' ? '<b>enterprise upload</b> · ' : ''}${s.testingType ? `for ${esc(testingTypeOf(s.testingType).name)} · ` : ''}seen by: ${esc(s.appliesTo.join(', '))} · owes: ${esc(ownes(s))}</span>`,
  });
  const general = META.skills.filter((s) => !s.testingType);
  const typed = META.skills.filter((s) => s.testingType);
  return checkDropdown('skills', skillsSummary(on.size), `<div class="ms-group">General skills</div>${general.map(item).join('')}
<div class="ms-group">Skills for a type of testing</div>${typed.map(item).join('')}
<div class="ms-foot">Platform skills are Markdown files in <code>skills/</code>; enterprise skills are uploaded below. Each skill's text goes only to the agents it names, and what each phase produced is checked against what the skill says it owes.</div>`);
}

function skillUploadBox() {
  const uploaded = META.skills.filter((s) => s.source === 'enterprise upload');
  return `<details class="card" id="skill-upload-box"><summary><b>Upload an enterprise skill</b> <span class="small muted">${uploaded.length ? `${uploaded.length} uploaded: ${esc(uploaded.map((s) => s.id).join(', '))}` : 'your organisation\'s QE standards as a Markdown skill'}</span></summary>
<p class="small">A skill is a Markdown file with YAML front matter: <code>id</code>, <code>name</code>, <code>description</code>, <code>appliesTo</code> (agent ids: ${esc(['requirements', 'rules', 'testcases', 'testdata', 'scripts', 'execution', 'defects', 'report'].join(', '))}), optional <code>testingType</code> and <code>delivers</code>. The body is the standard the named agents must follow.</p>
<div class="row"><input type="file" id="skill-file" accept=".md,text/markdown"><button class="btn secondary" id="skill-upload">Upload skill</button></div>
${uploaded.length ? `<p class="small">${uploaded.map((s) => `${pill(s.id, 'designed')} ${esc(s.name)} <button class="btn secondary small skill-remove" data-id="${esc(s.id)}">Remove</button>`).join('<br>')}</p>` : ''}
<div id="skill-msg" class="small"></div></details>`;
}

function bindSkillUpload() {
  const btn = document.getElementById('skill-upload');
  if (!btn) return;
  const msg = document.getElementById('skill-msg');
  const refresh = async () => { META = await api('/api/meta'); route(); };
  btn.onclick = async () => {
    const f = document.getElementById('skill-file').files[0];
    if (!f) { msg.innerHTML = '<span class="err">Choose a .md file first.</span>'; return; }
    try {
      const r = await api('/api/skills', { method: 'POST', body: { fileName: f.name, text: await f.text() } });
      if (runState.skills && !runState.skills.includes(r.skill.id)) runState.skills.push(r.skill.id);
      await refresh();
      const m = document.getElementById('skill-msg');
      if (m) m.innerHTML = `<span class="ok">Uploaded ${esc(r.skill.name)} (${esc(r.skill.id)}); it is now in the skills list.</span>`;
      const box = document.getElementById('skill-upload-box');
      if (box) box.open = true;
    } catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
  $view.querySelectorAll('.skill-remove').forEach((b) => b.onclick = async () => {
    await api(`/api/skills/${encodeURIComponent(b.dataset.id)}`, { method: 'DELETE' });
    if (runState.skills) runState.skills = runState.skills.filter((id) => id !== b.dataset.id);
    await refresh();
  });
}

function handoverBadge(p) {
  const h = p.handover;
  if (!h || h.status === 'no contract') return p.skills && p.skills.length ? `<br><span class="small muted">skills: ${esc(p.skills.join(', '))}</span>` : '';
  return `<br><span class="hand ${h.status === 'complete' ? 'ok' : 'bad'}" title="${esc(h.items.map((i) => `${i.key}: ${i.status}`).join('\n'))}">hand-over ${esc(h.status)}${h.status === 'complete' ? ` (${h.items.filter((i) => i.status === 'delivered').length}/${h.items.length})` : `: missing ${esc(h.missing.join(', '))}`}</span>`;
}

function skillsView(c) {
  const skills = c.skills || [];
  const phases = c.phases.filter((p) => p.handover || (p.skills && p.skills.length));
  return `<h2>Active skills (${skills.length})</h2>${skills.length ? table(['Skill', 'Description', 'Seen by agents', 'Owes', 'File'], skills.map((s) => [`<b>${esc(s.name)}</b><br><code class="small">${esc(s.id)}</code>`, esc(s.description), esc(s.appliesTo.join(', ')), esc(ownes(s)), `<span class="small">${esc(s.file)} · ${esc(s.sha256)}</span>`])) : '<p class="muted">No skills were selected for this run.</p>'}
<h2>Hand-overs per phase</h2>${table(['Phase', 'Skills seen', 'Hand-over', 'Artefacts owed'], phases.map((p) => [esc(p.label), esc((p.skills || []).join(', ') || '-'), p.handover ? `<span class="hand ${p.handover.status === 'complete' ? 'ok' : p.handover.status === 'incomplete' ? 'bad' : ''}">${esc(p.handover.status)}</span>` : '-',
    p.handover ? p.handover.items.map((i) => `${esc(i.key)}: <b>${esc(i.status)}</b>${i.count != null ? ` (${i.count})` : ''} <span class="small muted">${esc(i.skills.join(', '))}${i.note ? ` - ${esc(i.note)}` : ''}</span>`).join('<br>') : '-']))}
${skills.map((s) => `<details><summary><b>${esc(s.name)}</b> <span class="small muted">skill text</span></summary><pre class="skillbody">${esc(s.body)}</pre></details>`).join('')}`;
}

/* ---------------- rails and tiles ---------------- */
function tile({ href = '', detail = '', art = '', tag = '', big = '', corner = '', title, lines = [], extra = '', cls = '', progress = null }) {
  const attrs = href ? `href="${esc(href)}"` : `href="#" data-detail="${esc(detail)}"`;
  return `<a class="tile ${esc(cls)}" ${attrs}><div class="art ${esc(art)}">${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<span class="big">${esc(big)}</span>${corner ? `<span class="corner">${corner}</span>` : ''}</div>
${progress != null ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div>` : ''}<div class="body"><b class="t">${esc(title)}</b>${lines.join('<br>')}${extra}</div></a>`;
}
function rail(id, title, note, tiles) {
  return `<section class="rail" id="rail-${esc(id)}"><div class="rail-head"><h2>${esc(title)}</h2>${note ? `<span class="muted small">${note}</span>` : ''}</div>
<div class="rail-wrap"><button class="rail-btn prev" aria-label="Scroll left">&#8249;</button><div class="rail-track">${tiles.join('')}</div><button class="rail-btn next" aria-label="Scroll right">&#8250;</button></div><div class="rail-detail"></div></section>`;
}
function updateRails() {
  document.querySelectorAll('.rail-track').forEach((t) => {
    const w = t.parentElement;
    w.classList.toggle('can-prev', t.scrollLeft > 4);
    w.classList.toggle('can-next', t.scrollLeft + t.clientWidth < t.scrollWidth - 4);
    t.onscroll = () => { w.classList.toggle('can-prev', t.scrollLeft > 4); w.classList.toggle('can-next', t.scrollLeft + t.clientWidth < t.scrollWidth - 4); };
  });
}
new MutationObserver(updateRails).observe($view, { childList: true });
window.addEventListener('resize', updateRails);
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.rail-btn');
  if (b) { const t = b.parentElement.querySelector('.rail-track'); t.scrollBy({ left: (b.classList.contains('next') ? 1 : -1) * t.clientWidth * 0.8 }); return; }
  const x = ev.target.closest('.detail .close');
  if (x) { x.closest('.detail').remove(); document.querySelectorAll('.tile.sel[data-detail]').forEach((t) => t.classList.remove('sel')); return; }
  const d = ev.target.closest('.tile[data-detail]');
  if (!d || !HOME_DETAIL[d.dataset.detail]) return;
  ev.preventDefault();
  document.querySelectorAll('.rail-detail').forEach((el) => { el.innerHTML = ''; });
  const was = d.classList.contains('sel');
  document.querySelectorAll('.tile.sel[data-detail]').forEach((t) => t.classList.remove('sel'));
  if (was) return;
  d.classList.add('sel');
  const box = d.closest('.rail').querySelector('.rail-detail');
  box.innerHTML = `<div class="detail"><button class="close" aria-label="Close">&times;</button>${HOME_DETAIL[d.dataset.detail]}</div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

/* ---------------- Home ---------------- */
let HOME_DETAIL = {};
const PHASE_ICON = { ingest: '⇢', normalise: '≡', 'review-agent': '⚑', review: '✎', delta: 'Δ', 'merge-approval': '⊕' };
const PHASE_CAT = { ingest: 'intake', normalise: 'intake', 'review-agent': 'intake', review: 'gate', delta: 'intake', 'merge-approval': 'gate', requirements: 'design', rules: 'design', testcases: 'design', testdata: 'design', scripts: 'design', execution: 'run', defects: 'run', report: 'run' };
const agentNo = (id) => (META.platform.agents.find((g) => g.id === id) || {}).no;

const EXEC_INPUT = {
  'jira-initiative': ['Jira initiative', 'The business goal and scope.', 'Defines what the capability must achieve.'],
  'jira-epic': ['Jira epics and stories', 'The detailed requirements and acceptance criteria.', 'Tells the platform exactly what must be tested.'],
  codebase: ['Application code', 'How the system actually behaves today.', 'Shows what was really built, so gaps and mismatches surface early.'],
  'data-model': ['Data model', 'The information a record holds and its allowed values.', 'Supplies realistic test data.'],
  confluence: ['Business documents', 'Requirement documents and Confluence pages.', 'Adds rules and examples not captured in Jira.'],
  'api-contract': ['API specifications', 'How the systems talk to each other.', 'Drives tests of the services behind the screens.'],
  'existing-tests': ['Existing test suites', 'Tests the team already has.', 'Reused rather than rewritten, and shows where coverage is missing.'],
  'defect-history': ['Defect history', 'Past defects and production incidents.', 'Focuses testing where things have broken before.'],
  'ui-design': ['UI designs', 'Screen designs for the user journeys.', 'Drives tests of what the user sees and does.'],
  regulatory: ['Policies and regulations', 'Rules the business must comply with.', 'Makes sure mandatory rules are tested and reported.'],
};
const EXEC_AGENT = {
  requirements: ['Combines every input into one agreed list of requirements.', 'Everyone tests against the same approved scope.'],
  rules: ['Pulls out the business rules and the exact values behind them.', 'Every rule can be traced back to where it was stated.'],
  testcases: ['Writes the test cases, ready for the test management tool.', 'Every requirement gets a consistent, reviewable test case.'],
  testdata: ['Builds complete, realistic test data for every test case from the data specs.', 'Every test runs on valid data that can be traced to the spec, never on copied production records.'],
  scripts: ['Turns the test cases into automated tests.', 'The same tests can be re-run on every release.'],
  execution: ['Runs the automated tests for real.', 'Results are actual, not estimated.'],
  defects: ['Logs a defect only when a test really fails.', 'No noise: every defect comes with evidence.'],
  report: ['Produces the quality report and compares cycles.', 'One clear view of quality for decision makers.'],
};
const EXEC_VALUE = [
  ['»', 'Faster release sign-off', 'Requirements, tests, results and a report in one cycle.', ['One platform takes a capability from its inputs to a signed-off quality report.', 'Fewer hand-offs between business, development and QA teams.']],
  ['≡', 'Traceable for audit', 'Every test and defect links back to its requirement.', ['Each requirement shows where it came from: Jira, code or a document.', 'Each test case, result and defect links back to that requirement.']],
  ['✔', 'Real results, no surprises', 'Tests actually run; defects come only from real failures.', ['Results come from running the tests, not from estimates.', 'Every defect carries the expected and actual result as evidence.']],
  ['↻', 'Reuse across releases', 'Later releases only redo what changed.', ['Each approved cycle is kept as the baseline.', 'Unchanged tests are reused; only new and changed items are redesigned.']],
];
const FLOW_BRIEF = {
  baseline: ['Baseline: first full quality check', 'Run once for a new capability. Its approved result becomes the reference for every later release.', [
    'Bring the project\'s inputs.',
    'The platform combines them into one list of requirements and highlights any disagreements.',
    'A person resolves the disagreements and approves the list.',
    'The agents design the tests, automate them, run them and log real defects.',
    'A report shows what was tested, what passed and what failed.',
    'The approved result is saved as the baseline for future releases.'], '#/run?type=baseline', 'Start a baseline'],
  incremental: ['Incremental: update when something changes', 'Run when something changes, such as a new epic or a code release. Only the change is redone.', [
    'Pick the approved baseline and bring only what changed.',
    'The platform shows what is unchanged, what changed and what is new.',
    'Only the changes are redesigned; everything else is reused.',
    'A person approves before the baseline is updated.',
    'All tests run again, and a report compares this cycle with the last one.'], '#/run?type=incremental', 'Start an incremental update'],
};

async function viewHome() {
  setTitle();
  const P = META.platform;
  HOME_DETAIL = {};
  const valueTiles = EXEC_VALUE.map(([icon, name, line, points], i) => {
    HOME_DETAIL[`value-${i}`] = `<h2>${esc(name)}</h2><ul class="brief">${points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return tile({ detail: `value-${i}`, art: 'run', tag: 'Outcome', big: icon, title: name, lines: [esc(line)] });
  });
  const inName = (t) => (EXEC_INPUT[t.id] || [t.name])[0];
  const inputTiles = P.inputTypes.map((t) => {
    const [name, what, use] = EXEC_INPUT[t.id] || [t.name, t.about, t.reads];
    const by = P.agents.filter((g) => (t.usedBy || []).includes(g.id)).map((g) => g.name);
    HOME_DETAIL[`input-${t.id}`] = `<h2>${esc(name)}</h2><ul class="brief"><li><b>What it is:</b> ${esc(what)}</li><li><b>Why it matters:</b> ${esc(use)}</li><li><b>Used by:</b> ${esc(by.join(', '))}</li></ul>`;
    return tile({ detail: `input-${t.id}`, art: 'input', tag: 'Input', big: '⇢', title: name, lines: [esc(what)] });
  });
  const agentTiles = P.agents.map((g) => {
    const [does, value] = EXEC_AGENT[g.id] || [g.produces, ''];
    const from = P.inputTypes.filter((t) => (t.usedBy || []).includes(g.id)).map(inName);
    HOME_DETAIL[`agent-${g.id}`] = `<h2>${esc(g.name)}</h2><ul class="brief"><li><b>What it does:</b> ${esc(does)}</li><li><b>Why it matters:</b> ${esc(value)}</li><li><b>Works from:</b> ${esc([...from, ...(g.no > 1 ? ['the output of the agent before it'] : [])].join(', '))}</li></ul>`;
    return tile({ detail: `agent-${g.id}`, art: g.no <= 5 ? 'design' : 'run', tag: `Agent ${g.no}`, big: g.no, title: g.name, lines: [esc(does)] });
  });
  const flowTiles = Object.entries(FLOW_BRIEF).map(([id, [name, intro, points, href, cta]], i) => {
    HOME_DETAIL[`flow-${id}`] = `<h2>${esc(name)}</h2><p>${esc(intro)}</p><ul class="brief">${points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><a class="btn" href="${href}">${esc(cta)}</a>`;
    return tile({ detail: `flow-${id}`, art: i ? 'flow2' : 'flow1', tag: `Flow ${i + 1}`, big: i + 1, title: name, lines: [esc(intro)] });
  });
  const stats = [
    ['10+', 'Enterprise Inputs', 'Requirements, Code, APIs & Documents'],
    [String(P.agents.length), 'Specialized AI Agents', 'Collaborating Across The QE Lifecycle'],
    ['100%', 'Traceability', 'Requirements To Test Evidence'],
    ['Human', 'Governance', 'Approval For Every Critical Outcome'],
  ];
  const lifecycle = [
    ['Bring', 'Enterprise inputs', 'Jira, code, APIs, data models and business documents.'],
    ['Design', 'Agents 1–5', 'Requirements, business rules, test cases, test data and automated tests.'],
    ['Govern', 'Human approval', 'People settle disagreements and approve every baseline change.'],
    ['Validate', 'Agents 6–8', 'Real execution, evidence-backed defects and the cycle report.'],
    ['Release', 'Quality evidence', 'A traceable, release-ready report for sign-off.'],
  ];
  $view.innerHTML = `<section class="hero home-hero"><div class="eyebrow">Agentic QE Platform</div><h1>Engineering Quality at Scale with AI Agents and Human Governance</h1>
<p>Transform requirements, code, APIs, and business documents into traceable test assets, automated validation, execution intelligence, and release-ready quality evidence, while keeping humans in control of every critical decision.</p>
<div class="hero-cta"><a class="btn" href="#/run?type=baseline">&#9654; Start a baseline</a><a class="btn secondary" href="#/cycles">View cycles</a></div></section>
<section class="stats">${stats.map(([n, t, d]) => `<div class="stat"><b>${esc(n)}</b><span class="stat-t">${esc(t)}</span><span class="stat-d">${esc(d)}</span></div>`).join('')}</section>
<section class="lifecycle"><h2>How the platform works</h2><ol>${lifecycle.map(([k, t, d]) => `<li><span class="lc-k">${esc(k)}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol></section>
${rail('value', 'Why it matters', 'click an outcome for details', valueTiles)}
${rail('inputs', 'What goes in', 'click an input for details', inputTiles)}
${rail('agents', 'Who does the work', 'click an agent for details', agentTiles)}
${rail('flows', 'How it runs', 'click a flow for a short brief', flowTiles)}`;
}

function cycleTile(c) {
  const ex = c.summary;
  return tile({ href: `#/cycle/${c.id}`, art: c.type === 'baseline' ? 'flow1' : 'flow2', tag: c.type === 'baseline' ? 'Flow 1' : 'Flow 2', big: c.id.replace('CYC-', '#'), corner: `<span class="status-dot ${esc(c.status)}"></span>${esc(c.status)}`, title: c.name,
    lines: [`${c.example ? `${esc(exampleShort(c.example))} · ` : ''}${c.delta ? esc(c.delta) : `baseline ${esc(c.baselineId || '(on completion)')}`}`, ex ? `${ex.passed}/${ex.executed} passed · ${ex.passRate}%` : '<span class="muted">not executed yet</span>'], progress: ex ? ex.passRate : 0 });
}

/* ---------------- Run ---------------- */
const RUN_SLOTS = {
  baseline: [['initiative', 'Jira initiative', 'jira-initiative', 'initiative'], ['epic', 'Jira epic', 'jira-epic', 'epic'], ['codebase', 'Codebase', 'codebase', 'baselineBranch']],
  incremental: [['epic', 'New Jira epic', 'jira-epic', 'incrementalEpic'], ['codebase', 'Updated codebase', 'codebase', 'incrementalBranch']],
};
let DEMO_INPUTS = null;

/** The demo example whose inputs fill the slots: picked for a baseline, the one with an increment otherwise. */
function exampleFor(type) {
  const xs = META.platform.examples || [];
  return type === 'incremental' ? xs.find((e) => e.modes.includes('incremental')) : (xs.find((e) => e.id === runState.example) || xs[0]);
}
const exampleIdOf = (c) => c.example || (META.platform.examples || []).find((e) => e.samples.baselineBranch === c.sutBuild || e.samples.incrementalBranch === c.sutBuild)?.id || null;
const exampleShort = (id) => (META.platform.examples || []).find((e) => e.id === id)?.short || '';

function inputsDropdown(type, slots, active) {
  const inFlow = new Map(slots.map((sl) => [sl[2], sl[0]]));
  const used = new Set(active.map((sl) => sl[2]));
  const item = (t) => {
    const slot = inFlow.get(t.id);
    if (slot) return checkItem({ cls: 'input-on', value: slot, checked: used.has(t.id), title: t.name, tag: pill('in this demo', 'passed'), sub: t.about });
    const viaCode = t.id === 'data-model';
    const tag = viaCode ? pill('read from the codebase', 'carried')
      : t.mvp === 'implemented' ? pill(type === 'incremental' ? 'baseline only' : 'not used', 'pending') : pill('platform', 'pending');
    return checkItem({ cls: 'input-fixed', value: t.id, checked: viaCode && used.has('codebase'), disabled: true, title: t.name, tag, sub: t.about });
  };
  const types = META.platform.inputTypes;
  const names = types.filter((t) => used.has(t.id) || (t.id === 'data-model' && used.has('codebase'))).map((t) => t.name.replace(/ \(.*\)$/, ''));
  return checkDropdown('inputs', `${chips(names)}<span class="muted small">${names.length} of ${types.length} input types</span>`,
    `<div class="ms-group">In this demo (Flow ${type === 'baseline' ? 1 : 2})</div>${types.filter((t) => inFlow.has(t.id) || t.id === 'data-model').map(item).join('')}
<div class="ms-group">The platform also accepts</div>${types.filter((t) => !inFlow.has(t.id) && t.id !== 'data-model').map(item).join('')}`);
}

function testingTypesDropdown(type, domainId) {
  const ids = runState.testingTypes;
  const parts = META.testingTypes.filter((t) => ids.includes(t.id)).map((t) => testingTypeOf(t.id, domainId));
  const body = META.testingTypes.map((t) => checkItem({ cls: 'tt-on', value: t.id, checked: ids.includes(t.id), title: t.name, sub: testingTypeOf(t.id, domainId).focus })).join('')
    + '<div class="ms-foot">Tick more than one to combine them in a single run: the agents design, script and run the cases every ticked type needs.</div>';
  return `${checkDropdown('testing', chips(parts.map((p) => p.short)), body)}
<ul class="tt-how-list">${parts.map((p) => `<li><b>${esc(p.short)}:</b> ${esc(type === 'baseline' ? p.baseline : p.incremental)}</li>`).join('')}</ul>
<p class="hint" id="tt-msg"></p>`;
}

function readSummary(slot, label, st) {
  const where = st.mode === 'paste' ? (st.fileName ? `uploaded file ${st.fileName}` : st.text ? 'pasted text' : 'nothing pasted yet')
    : slot === 'codebase' ? `${META.codebase.repo} @ ${st.branch}` : `${st.key}${st.snapshot && st.mode !== 'jira' ? ` (${st.snapshot} snapshot)` : ''}`;
  const prov = st.mode === 'paste' ? pill('pasted', 'pasted') : st.mode === 'github' ? pill(slot === 'codebase' ? 'pulled live from GitHub' : 'Jira export on GitHub', 'github')
    : st.mode === 'jira' && META.jira.mode === 'live' ? pill('live Jira call', 'live') : pill('recorded fixture', 'fixture');
  return `<li><b>${esc(label)}</b><span class="muted small">${esc(where)}</span>${prov}</li>`;
}

function demoInputsHtml(type, ex) {
  const branch = ex.samples[type === 'baseline' ? 'baselineBranch' : 'incrementalBranch'];
  const flow = (DEMO_INPUTS || []).find((f) => f.branch === branch);
  if (!flow) return '';
  return `<ul class="downloads">${flow.files.map((f) => `<li><a href="${esc(f.url)}" download>${esc(f.name)}</a></li>`).join('')}</ul>
<p class="hint">The same Jira and codebase content the agents pull, to read or share. <a href="/demo-inputs/README.md" download>README</a></p>`;
}

async function resetDemo() {
  if (!confirm('Delete every cycle, baseline, report and defect, and start the demo from a clean slate?')) return;
  try {
    await api('/api/reset', { method: 'POST' });
    runState.type = 'baseline';
    runState.baselineId = '';
    runState.inputs = {};
    if (location.hash === '#/run?type=baseline') route();
    else location.hash = '#/run?type=baseline';
  } catch (e) { alert(e.message); }
}

async function viewRun(params) {
  setTitle('Run');
  if (params.get('type')) runState.type = params.get('type');
  const [baselines, cycles] = await Promise.all([api('/api/baselines'), api('/api/cycles')]);
  if (!DEMO_INPUTS) DEMO_INPUTS = await api('/api/demo-inputs');
  if (runState.type === 'incremental' && !baselines.some((b) => b.id === runState.baselineId)) runState.baselineId = baselines.length ? baselines[baselines.length - 1].id : '';
  const type = runState.type;
  const slots = RUN_SLOTS[type];
  const ex = exampleFor(type);
  const forType = `${type}:${ex.id}`;
  for (const [slot, , , sampleKey] of slots) {
    const def = ex.samples[sampleKey];
    const cur = runState.inputs[slot];
    if (!cur || cur.forType !== forType) runState.inputs[slot] = slot === 'codebase' ? { forType, mode: 'github', branch: def, text: '' } : { forType, mode: META.jira.mode === 'live' ? 'jira' : 'github', key: def, text: '', snapshot: type === 'incremental' ? ex.samples.incrementalSnapshot : undefined };
  }
  const exampleOption = (e) => `<label class="mode-option"><input type="radio" name="run-example" value="${esc(e.id)}" ${e.id === ex.id ? 'checked' : ''}><span><b>${esc(e.name)}</b><span class="muted">${esc(e.about)}</span></span></label>`;
  const active = slots.filter(([slot]) => !runState.inputsOff.has(`${type}:${slot}`));
  const flowNo = type === 'baseline' ? 1 : 2;
  const modeOption = (v, title, text) => `<label class="mode-option"><input type="radio" name="run-type" value="${v}" ${type === v ? 'checked' : ''}><span><b>${title}</b><span class="muted">${text}</span></span></label>`;
  const agents = META.platform.agents;
  const tt = testingTypeOf(runState.testingTypes.join('+'), ex.id);
  const ttParts = runState.testingTypes.map((id) => testingTypeOf(id, ex.id)).filter((t) => t.id);
  const ra = META.platform.reviewAgent;

  $view.innerHTML = `${pendingBanner(cycles)}<div class="run-layout">
<div class="panel">
  <div class="step-block">
    <h3><span class="step-num">1</span>Is this a new baseline, or an addition to one?</h3>
    <p class="hint">Early in a project you build the baseline. Later, as epics and code changes arrive, you add them on top and only the additions are designed.</p>
    ${modeOption('baseline', 'Flow 1 · Start a new baseline', 'Everything you bring is read, compared and designed from scratch.')}
    ${modeOption('incremental', 'Flow 2 · Add to an existing baseline', 'The baseline is carried over untouched; you review the additions and approve the merge.')}
    ${type === 'incremental' ? (baselines.length
    ? `<label class="field">Baseline to add to<select id="baseline">${baselines.map((b) => `<option value="${esc(b.id)}" ${b.id === runState.baselineId ? 'selected' : ''}>${esc(b.id)} v${b.version} - ${esc(b.name)} (${b.counts.requirements} requirements)</option>`).join('')}</select></label>`
    : '<div class="banner">No approved baseline yet. Run Flow 1 first.</div>') : ''}
    ${type === 'baseline'
    ? `<p class="hint"><b>Demo example.</b> Pick the project whose inputs fill the slots below. Flow 2 adds hotel release 2.0 (Epic 8 AQPI-32 + revised Epic 6 AQPI-23) on top of the hotel baseline, so run Flow 1 first.</p>${(META.platform.examples || []).map(exampleOption).join('')}`
    : `<p class="hint"><b>Demo example:</b> ${esc(ex.name)}. ${esc(ex.about)}</p>`}
  </div>
  <div class="step-block">
    <h3><span class="step-num">2</span>Type of testing</h3>
    <p class="hint">Steers what the agents design, script and run. The project inputs, this choice, the skills and the flow together decide the artifacts.</p>
    ${testingTypesDropdown(type, ex.id)}
  </div>
  <div class="step-block">
    <h3><span class="step-num">3</span>Choose what you are bringing</h3>
    <p class="hint">The platform accepts all of these. This demo runs Flow ${flowNo} on the ${slots.length} inputs marked "in this demo"; untick one to leave it out. The rest show what else a project can bring.</p>
    ${inputsDropdown(type, slots, active)}
    <p class="hint" id="input-msg"></p>
  </div>
  <div class="step-block">
    <h3><span class="step-num">4</span>Skills the agents must follow</h3>
    <p class="hint">Skills tune and govern each agent to your standards. The general skills are on, plus the skill for each ticked type of testing; untick any you do not want.</p>
    ${META.skillWarnings && META.skillWarnings.length ? `<div class="banner">${META.skillWarnings.map(esc).join('<br>')}</div>` : ''}
    ${skillsDropdown()}
    ${skillUploadBox()}
  </div>
  <div class="step-block">
    <h3><span class="step-num">5</span>Run the agents</h3>
    <p class="hint">The run reads and normalises the inputs, the review agent suggests what is added or missing, then it stops for your review. Nothing is designed until you approve.</p>
    <label class="field">Your name (recorded on approvals)<input type="text" id="who" value="${esc(localStorage.getItem('aqe-user') || '')}" placeholder="e.g. Priya Shah"></label>
    <div class="row"><button class="btn" id="go" ${type === 'incremental' && !baselines.length ? 'disabled' : ''}>Start Flow ${flowNo} · ${esc(ex.short)} · ${esc(tt.short)}</button></div>
    <div id="run-msg"></div>
  </div>
  <div class="step-block">
    <h3><span class="step-num small">↺</span>Clean slate</h3>
    <p class="hint">${cycles.length} cycle(s) and ${baselines.length} baseline(s) are saved. Reset removes them all so the demo starts again from Flow 1.</p>
    <button class="btn danger" id="reset" ${cycles.length || baselines.length ? '' : 'disabled'}>Reset the demo</button>
  </div>
</div>
<div class="panel wide">
  <h3 class="panel-title">Before the human review</h3>
  <div class="agent-card gate review-agent-card"><div class="agent-head"><span class="step-num small">⚑</span><b>${esc(ra.name)}</b><span class="state">advisory</span></div><p>${esc(ra.produces)}</p><p class="muted small">${esc(ra.note)}</p></div>
  <h3 class="panel-title">Agents, and what each one produces for ${esc(tt.name.toLowerCase())}</h3>
  <div class="agent-grid">${agents.map((a) => `<div class="agent-card ${a.no === 1 || (a.id === 'execution' && type === 'incremental') ? 'gate' : ''}"><div class="agent-head"><span class="step-num small">${a.no}</span><b>${esc(a.name)}</b><span class="state">pending</span></div><p>${esc(a.produces)}</p>${ttParts.filter((p) => p.agents[a.id]).map((p) => `<p class="tt-steer small"><b>${esc(p.short)}:</b> ${esc(p.agents[a.id])}</p>`).join('')}<p class="muted small">${a.no === 1 ? 'You approve the requirement set first' : a.id === 'execution' && type === 'incremental' ? 'Runs after you approve the merge into the baseline' : 'Runs after your approval'}</p></div>`).join('')}</div>
  <div class="legend"><span class="l-agent">AI agent</span><span class="l-human">Human approval before this agent</span></div>
  <h3 class="panel-title">What the agents will read</h3>
  <ul class="read-list">${active.map(([slot, label]) => readSummary(slot, label, runState.inputs[slot])).join('')}</ul>
  <h3 class="panel-title">Flow ${flowNo} test inputs</h3>
  ${demoInputsHtml(type, ex)}
</div>
</div>`;

  const rerender = () => viewRun(new URLSearchParams());
  $view.querySelectorAll('input[name=run-type]').forEach((el) => el.onchange = () => { location.hash = `#/run?type=${el.value}`; });
  $view.querySelectorAll('input[name=run-example]').forEach((el) => el.onchange = () => { runState.example = el.value; rerender(); });
  $view.querySelectorAll('details.ms').forEach((d) => d.ontoggle = () => {
    if (d.open) closeDropdowns(d);
    else runState.open.delete(d.dataset.ms);
  });
  $view.querySelectorAll('.tt-on').forEach((el) => el.onchange = () => {
    const ids = [...$view.querySelectorAll('.tt-on')].filter((x) => x.checked).map((x) => x.value);
    if (!ids.length) {
      el.checked = true;
      document.getElementById('tt-msg').textContent = 'Keep at least one type of testing ticked.';
      return;
    }
    const prev = runState.testingTypes;
    runState.testingTypes = ids;
    if (runState.skills) {
      const typedFor = (list) => META.skills.filter((x) => x.testingType && list.includes(x.testingType)).map((x) => x.id);
      const dropped = new Set(typedFor(prev.filter((id) => !ids.includes(id))));
      const added = typedFor(ids.filter((id) => !prev.includes(id)));
      runState.skills = [...runState.skills.filter((id) => !dropped.has(id)), ...added.filter((id) => !runState.skills.includes(id))];
    }
    rerender();
  });
  $view.querySelectorAll('.input-on').forEach((el) => el.onchange = () => {
    const key = `${type}:${el.value}`;
    if (!el.checked && active.length === 1) {
      el.checked = true;
      document.getElementById('input-msg').textContent = 'Keep at least one input: the agents need something to read.';
      return;
    }
    if (el.checked) runState.inputsOff.delete(key); else runState.inputsOff.add(key);
    rerender();
  });
  $view.querySelectorAll('.skill-on').forEach((el) => el.onchange = () => {
    runState.skills = [...$view.querySelectorAll('.skill-on')].filter((x) => x.checked).map((x) => x.value);
    el.closest('.ms-item').classList.toggle('on', el.checked);
    $view.querySelector('details.ms[data-ms=skills] .ms-value').innerHTML = skillsSummary(runState.skills.length);
  });
  const sel = document.getElementById('baseline');
  if (sel) sel.onchange = () => { runState.baselineId = sel.value; };
  document.getElementById('reset').onclick = resetDemo;
  bindSkillUpload();
  document.getElementById('go').onclick = async (ev) => {
    const who = document.getElementById('who').value.trim();
    localStorage.setItem('aqe-user', who);
    const inputs = {};
    for (const [slot] of active) { const { forType, fileName, ...rest } = runState.inputs[slot]; inputs[slot] = rest; }
    ev.target.disabled = true;
    document.getElementById('run-msg').innerHTML = '<div class="banner info">Ingesting, normalising and running the review agent...</div>';
    try {
      const c = await api('/api/cycles', { method: 'POST', body: { type, testingTypes: runState.testingTypes, baselineId: runState.baselineId, inputs, reviewer: who, skills: selectedSkills() } });
      location.hash = `#/cycle/${c.id}`;
    } catch (e) {
      document.getElementById('run-msg').innerHTML = `<div class="banner err">${esc(e.message)}</div>`;
      ev.target.disabled = false;
    }
  };
}

/* ---------------- Cycles ---------------- */
async function viewCycles() {
  setTitle('Cycles');
  const cycles = (await api('/api/cycles')).slice().reverse();
  const base = cycles.filter((c) => c.type === 'baseline').map(cycleTile);
  const inc = cycles.filter((c) => c.type === 'incremental').map(cycleTile);
  $view.innerHTML = `<section class="hero small-hero"><div class="eyebrow">Cycles</div><h1>Every run, by flow</h1><p>Open a cycle to browse its phases: intake and review, the design agents, then execution, defects and the report.</p><div class="row"><a class="btn" href="#/run">&#9654; Run a new cycle</a>${cycles.length ? '<button class="btn secondary" id="reset">Reset the demo</button>' : ''}</div></section>
${pendingBanner(cycles)}${cycles.length ? '' : '<p class="muted">No cycles yet.</p>'}${base.length ? rail('base', 'Flow 1 · Baseline cycles', '', base) : ''}${inc.length ? rail('inc', 'Flow 2 · Incremental cycles', '', inc) : ''}`;
  const reset = document.getElementById('reset');
  if (reset) reset.onclick = resetDemo;
}
const statusPill = (s) => pill(s, { completed: 'passed', failed: 'failed', rejected: 'failed', 'awaiting-review': 'designed', 'awaiting-merge': 'designed', running: 'enhanced', interrupted: 'failed' }[s] || 'pending');

function phaseArtifactTab(name, c) {
  return { ingest: 'inputs', normalise: 'normalise', 'review-agent': 'review-agent', review: c.status === 'awaiting-review' ? 'review' : 'normalise', delta: 'delta', requirements: 'requirements', rules: 'rules', testcases: 'testcases', testdata: 'testdata', scripts: 'scripts', 'merge-approval': 'merge', execution: 'execution', defects: 'defects', report: 'report' }[name];
}

const PHASE_GROUPS = [
  ['intake', 'Intake and review', 'deterministic code, the review agent and the human gate', ['ingest', 'normalise', 'review-agent', 'review', 'delta']],
  ['design', 'Design agents 1-5', 'requirements, rules, test cases, test data, scripts', ['requirements', 'rules', 'testcases', 'testdata', 'scripts', 'merge-approval']],
  ['run', 'Run and results · agents 6-8', 'real execution, defects from real failures, report', ['execution', 'defects', 'report']],
];
const PHASE_PROGRESS = { done: 100, running: 50, waiting: 50, failed: 100, pending: 0, skipped: 0 };

function phaseTile(c, p, tab) {
  const t = phaseArtifactTab(p.name, c);
  const no = agentNo(p.name);
  const cat = PHASE_CAT[p.name];
  return tile({ href: p.name === 'report' ? `#/reporting?cycle=${c.id}` : `#/cycle/${c.id}?tab=${t}`, art: cat, tag: no ? `Agent ${no}` : cat === 'gate' ? 'Human gate' : p.name === 'review-agent' ? 'Review agent' : 'Intake', big: no || PHASE_ICON[p.name] || '•',
    corner: `<span class="status-dot ${esc(p.status)}"></span>${esc(p.status)}`, title: p.label, lines: [p.summary ? esc(p.summary) : '<span class="muted">not run yet</span>'], extra: handoverBadge(p),
    cls: `${p.status} ${t === tab && (p.name !== 'review' || tab === 'review') ? 'sel' : ''}`, progress: PHASE_PROGRESS[p.status] ?? 0 });
}

async function viewCycle(id, params) {
  const c = await api(`/api/cycles/${id}`);
  setTitle(c.name);
  const tab = params.get('tab') || (c.status === 'awaiting-review' ? 'review' : c.status === 'awaiting-merge' ? 'merge' : c.status === 'completed' ? 'artifacts' : 'inputs');
  const present = new Set(c.phases.map((p) => p.name));
  const rails = PHASE_GROUPS.map(([gid, title, note, names]) => {
    const tiles = names.filter((n) => present.has(n)).map((n) => phaseTile(c, c.phases.find((p) => p.name === n), tab));
    if (gid === 'run') tiles.push(tile({ href: `#/cycle/${c.id}?tab=skills`, art: 'skill', tag: 'Skills', big: (c.skills || []).length, title: 'Skills and hand-overs', lines: ['Which skills each agent read and what it handed over'], cls: tab === 'skills' ? 'sel' : '' }));
    return rail(gid, title, note, tiles);
  }).join('');
  const ex0 = c.artifacts && c.artifacts.execution ? c.artifacts.execution.summary : null;
  const summaryRail = rail('summary', 'Cycle summary', 'what went in, what came out, and the QE lead report', [
    tile({ href: `#/cycle/${c.id}?tab=inputs`, art: 'input', tag: 'Inputs taken', big: c.inputs.length, title: 'Inputs taken', lines: [esc(c.inputs.map((i) => `${i.label} ${i.ref}`).join(' · '))], cls: tab === 'inputs' ? 'sel' : '' }),
    tile({ href: `#/cycle/${c.id}?tab=artifacts`, art: 'design', tag: 'Artifacts produced', big: c.phases.filter((p) => p.status === 'done').length, title: 'Artifacts produced', lines: ['Every artifact of this cycle, with links and downloads'], cls: tab === 'artifacts' ? 'sel' : '' }),
    tile({ href: `#/cycle/${c.id}?tab=traceability`, art: 'design', tag: 'Traceability', big: c.report && c.report.traceability ? c.report.traceability.totals.jiraItems : '…', title: 'Traceability matrix', lines: [c.report && c.report.traceability ? `${c.report.traceability.totals.covered} Jira items covered · ${c.report.traceability.totals.verified} verified · ${c.report.traceability.totals.failing} failing` : '<span class="muted">available when the cycle completes</span>'], cls: tab === 'traceability' ? 'sel' : '' }),
    tile({ href: `#/reporting?cycle=${c.id}`, art: 'run', tag: 'Reporting', big: c.report ? '✔' : '…', title: 'QE lead report', lines: [c.report ? `${ex0 ? `${ex0.passed}/${ex0.executed} passed · ` : ''}${(c.artifacts.defects || []).length} defect(s) · opens in Reporting` : '<span class="muted">available in Reporting when the cycle completes</span>'] }),
  ]);
  const done = c.phases.filter((p) => p.status === 'done').length;
  const ex = c.artifacts && c.artifacts.execution ? c.artifacts.execution.summary : null;
  const current = c.phases.find((p) => phaseArtifactTab(p.name, c) === tab);
  const label = tab === 'overview' ? 'QE lead report' : tab === 'artifacts' ? 'Artifacts produced' : tab === 'inputs' ? 'Inputs taken' : tab === 'skills' ? 'Skills and hand-overs' : tab === 'traceability' ? 'Traceability: Jira to defect' : tab === 'merge' ? 'Human approval to merge' : tab === 'review' ? 'Human review of requirement set' : tab === 'review-agent' ? 'Review agent suggestions' : current ? current.label : tab;
  let body = '';
  try { body = await renderCycleTab(c, tab); } catch (e) { body = `<div class="banner err">${esc(e.message)}</div>`; }
  $view.innerHTML = `<section class="hero small-hero"><div class="eyebrow">${c.type === 'baseline' ? 'Flow 1 · Baseline cycle' : 'Flow 2 · Incremental cycle'}</div>
<h1>${esc(c.name)} <span class="muted small">${esc(c.id)}</span> ${statusPill(c.status)}</h1>
<div class="facts"><div><b>${esc(testingTypeOf(c.testingType, exampleIdOf(c)).name)}</b>type of testing</div><div><b>${done}/${c.phases.length}</b>phases done</div>${c.delta ? `<div><b>${esc(c.delta.summary)}</b>delta</div>` : ''}${ex ? `<div><b>${ex.passed}/${ex.executed}</b>passed</div><div><b>${ex.passRate}%</b>pass rate</div>` : ''}${c.artifacts && c.artifacts.defects ? `<div><b>${c.artifacts.defects.length}</b>defects</div>` : ''}</div>
<div class="muted small">Baseline: ${esc(c.baselineId || '(created when this cycle completes)')}${c.baselineVersionAtStart ? ` v${c.baselineVersionAtStart} at start` : ''}${c.baselineVersionAfter ? ` → v${c.baselineVersionAfter}` : ''} · SUT build <code>${esc(c.sutBuild)}</code> · created ${fmtTime(c.createdAt)}</div></section>
${c.error ? `<div class="banner err">Failed: ${esc(c.error)} <button class="btn secondary" id="resume">Resume</button></div>` : ''}
${c.status === 'interrupted' ? `<div class="banner">This cycle was interrupted by a restart. <button class="btn secondary" id="resume">Resume</button></div>` : ''}
${c.status === 'running' ? '<div class="banner info">Agents are running... this page refreshes automatically.</div>' : ''}
${GATE_TEXT[c.status] && tab !== (c.status === 'awaiting-review' ? 'review' : 'merge') ? `<div class="banner action"><b>Action needed</b> This cycle is stopped until you ${GATE_TEXT[c.status]}${c.status === 'awaiting-merge' ? ` ${esc(c.baselineId)}` : ''}. <a href="#/cycle/${esc(c.id)}?tab=${c.status === 'awaiting-review' ? 'review' : 'merge'}">Go to the approval</a></div>` : ''}
${summaryRail}
${rails}
<section class="panel" id="detail-panel"><div class="panel-head"><h2>${esc(label)}</h2><span class="crumbs"><a href="#/cycles">Cycles</a> › <a href="#/cycle/${esc(c.id)}">${esc(c.id)}</a> › ${esc(label)}</span></div><div id="tab">${body}</div></section>`;
  const r = document.getElementById('resume');
  if (r) r.onclick = async () => { await api(`/api/cycles/${c.id}/resume`, { method: 'POST' }); route(); };
  bindCycleTab(c, tab);
  const sel = $view.querySelector('.tile.sel');
  if (sel) sel.parentElement.scrollLeft = Math.max(0, sel.offsetLeft - sel.parentElement.offsetLeft - 40);
  if (params.get('tab') && c.status !== 'running') document.getElementById('detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (c.status === 'running') pollTimer = setTimeout(route, 1500);
}

function artifactsView(c) {
  const a = c.artifacts || {};
  const dl = {
    testcases: a.testCases ? `<a href="/api/cycles/${esc(c.id)}/export/testcases.xlsx">Excel (.xlsx)</a>` : '',
    testdata: (a.testData || []).length ? `${a.testData.length} data sets (JSON)` : '',
    scripts: (a.scripts || []).length ? `${a.scripts.length} spec files` : '',
    execution: a.execution ? `<a href="/api/cycles/${esc(c.id)}/playwright-report.json" target="_blank">Playwright JSON report</a>` : '',
    report: c.report ? `<a href="/api/cycles/${esc(c.id)}/report.html" target="_blank">HTML</a> · <a href="/api/cycles/${esc(c.id)}/report.xlsx">Excel</a> · <a href="/api/cycles/${esc(c.id)}/lead-report.html" target="_blank">QE lead report</a>` : '',
  };
  const rows = c.phases.map((p) => {
    const t = phaseArtifactTab(p.name, c);
    const no = agentNo(p.name);
    return [`<a href="${p.name === 'report' ? `#/reporting?cycle=${esc(c.id)}` : `#/cycle/${esc(c.id)}?tab=${esc(t)}`}">${esc(p.label)}</a>`, no ? `Agent ${no}` : PHASE_CAT[p.name] === 'gate' ? 'Human gate' : 'Intake', `<span class="status-dot ${esc(p.status)}"></span> ${esc(p.status)}`, p.summary ? esc(p.summary) : '<span class="muted">not produced yet</span>', dl[p.name] || ''];
  });
  return `<p class="muted">Each row is one step of the cycle and what it produced. Click a step to open its artifact.</p>${table(['Step', 'Who', 'Status', 'What it produced', 'Download'], rows)}`;
}

function inputsTable(c) {
  return table(['Input', 'Reference', 'Statements', 'Provenance', 'Files / detail'], c.inputs.map((i) => [esc(i.label), `${esc(i.ref)}${i.summary ? `<br><span class="muted">${esc(i.summary)}</span>` : ''}${i.children && i.children.length ? `<br><span class="muted small">child issues: ${esc(i.children.join(', '))}</span>` : ''}`,
    `${i.statementCount}${i.dataModel ? `<br><span class="small muted">data model: ${esc(i.dataModel.attributeCount)} attributes, ${esc(i.dataModel.drivers.length)} drivers</span>` : ''}`, `${provPill(i.provenance)}<br><span class="small">${esc(i.provenance.label)}</span>`, `<span class="small">${esc((i.provenance.files || []).join(', '))}</span>${i.compare ? `<br><span class="small">compare vs ${esc(i.compare.baseBranch || (i.compare.base ? i.compare.base.slice(0, 7) : 'base'))} (${esc(i.compare.status)}): ${esc(i.compare.files.map((f) => `${f.filename} (${f.status})`).join(', '))}</span>` : ''}`]));
}

const originCell = (origins) => origins.map((o) => `<div class="quote">"${esc(o.quote)}"</div><div class="small muted">${pill(o.source, o.source === 'jira' ? 'jira-only' : 'code-only')} <a href="${esc(o.url || '#')}" target="_blank" rel="noopener">${esc(o.ref)}${o.line ? `:${o.line}` : ''}</a></div>`).join('');

function groupOrigins(c, g) {
  const byId = new Map(c.normalisation.statements.map((s) => [s.id, s]));
  return g.members.map((m) => byId.get(m)).filter(Boolean).map((s) => ({ quote: s.quote, source: s.source, ref: s.origin.ref, line: s.origin.line, url: s.origin.url }));
}

function normaliseView(c, interactive) {
  const n = c.normalisation;
  const decisions = c.review || { excluded: [], resolutions: {} };
  const byBucket = (b) => n.groups.filter((g) => g.bucket === b);
  const excl = (g) => interactive ? `<label class="small"><input type="checkbox" class="excl" data-g="${esc(g.id)}"> exclude</label>` : (decisions.excluded.includes(g.id) ? pill('excluded', 'failed') : '');
  const simple = (b) => table(['Group', 'Statement', 'Sources and quotes', ''], byBucket(b).map((g) => [esc(g.id), esc(g.text), originCell(groupOrigins(c, g)), excl(g)]));
  const conflicts = byBucket('conflict');
  return `<div class="kpis"><div class="kpi">Statements<b>${n.counts.statements}</b></div><div class="kpi">Agreed<b>${n.counts.agreed}</b></div><div class="kpi">Only Jira<b>${n.counts['jira-only']}</b></div><div class="kpi">Only code<b>${n.counts['code-only']}</b></div><div class="kpi">Conflicts<b>${n.counts.conflict}</b></div></div>
<p class="muted small">Computed in code: statements are grouped by subject (token similarity) and compared on extracted values (%, days, hours, ms, HTTP status...). Nothing here was decided by a model.</p>
<h2>Conflicting values ${pill(`${conflicts.length}`, 'conflict')}</h2>${conflicts.length ? conflicts.map((g) => `<div class="card" data-conflict="${esc(g.id)}"><b>${esc(g.id)}</b> - subject: <i>${esc(g.subject)}</i>
${table(['Choose', 'Value', 'Statement', 'Source'], g.options.map((o) => [interactive ? `<input type="radio" name="res-${esc(g.id)}" value="${esc(o.optionId)}" class="res" data-g="${esc(g.id)}">` : (decisions.resolutions[g.id] === o.optionId ? pill('chosen', 'passed') : ''),
    `<b>${esc(o.signature)}</b>`, esc(o.text), o.sources.map((s) => pill(s, s === 'jira' ? 'jira-only' : 'code-only')).join(' ')]))}
${interactive ? `<label class="small"><input type="radio" name="res-${esc(g.id)}" value="__exclude" class="res" data-g="${esc(g.id)}"> exclude this requirement</label> <span class="pill conflict res-state" data-g="${esc(g.id)}">unresolved</span>` : (decisions.excluded.includes(g.id) ? pill('excluded', 'failed') : '')}</div>`).join('') : '<p class="muted">No conflicting values.</p>'}
<h2>Only Jira has ${pill(byBucket('jira-only').length, 'jira-only')}</h2>${simple('jira-only')}
<h2>Only the code has ${pill(byBucket('code-only').length, 'code-only')}</h2>${simple('code-only')}
<h2>Agreed by Jira and code ${pill(byBucket('agreed').length, 'agreed')}</h2>${simple('agreed')}`;
}

const RA_CAT = { added: ['Added', 'enhanced'], missing: ['Missing', 'failed'], conflict: ['Conflict', 'conflict'] };
function reviewAgentView(c, { compact = false } = {}) {
  const ra = c.reviewAgent;
  if (!ra) return '<p class="muted">No review agent ran for this cycle.</p>';
  const src = (f) => f.sources.map((x) => `${esc(x.source)} ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.ref || '')}</a>` : esc(x.ref || '')}${x.line ? `:${esc(x.line)}` : ''}`).join('<br>') || '<span class="muted">-</span>';
  const rows = ra.findings.map((f) => [esc(f.id), pill(RA_CAT[f.category][0], RA_CAT[f.category][1]), esc(f.severity), `<b>${esc(f.title)}</b>${f.groupId ? ` <span class="muted small">${esc(f.groupId)}</span>` : ''}<br><span class="small">${esc(f.detail || '')}</span>`, esc(f.suggestion), src(f)]);
  const head = `<h2>${compact ? 'Review agent suggestions for you' : 'Review agent suggestions'} <span class="muted small">for ${esc(testingTypeOf(ra.testingType).name)}</span></h2>
<p class="small">${ra.counts.added} added · ${ra.counts.missing} missing · ${ra.counts.conflicts} conflicts · ${ra.counts.high} high severity. <span class="muted">${esc(ra.note)}</span></p>`;
  const body = ra.findings.length ? table(['ID', 'Kind', 'Severity', 'What it found', 'Suggestion', 'Source'], rows) : '<p class="muted">No suggestions: every input agrees and nothing is missing.</p>';
  return compact ? `<details class="card review-agent" open><summary><b>Review agent: ${ra.findings.length} suggestion(s) before you approve</b></summary>${head}${body}</details>` : `${head}${body}`;
}

function testingScope(c) {
  const sel = c.artifacts && c.artifacts.selection;
  if (!sel) return '';
  return `<div class="banner info"><b>${esc(sel.name)}</b>: ${esc(sel.focus)} ${sel.inRun} of ${sel.designed} case(s) in this run (${sel.reused} reused · ${sel.redesigned} re-designed · ${sel.added} new)${sel.notInRun ? ` · ${sel.notInRun} kept in the pack outside this run` : ''}.${sel.gaps.map((g) => `<br><b>Gap:</b> ${esc(g.message)}`).join('')}</div>`;
}

function deltaView(d, { title = 'Delta against the baseline' } = {}) {
  if (!d) return '<p class="muted">No delta yet.</p>';
  return `<h2>${esc(title)}</h2><div class="split" id="split">${esc(d.summary)}</div>
${d.pendingConflicts && d.pendingConflicts.length ? `<div class="banner">${d.pendingConflicts.length} conflict(s) still unresolved are not counted yet.</div>` : ''}
<p class="muted small">Computed in code against the baseline requirements: same subject &amp; same values = unchanged; same subject, different value = enhanced (new value wins, old kept); no matching subject = new.</p>
${table(['Class', 'Incoming statement', 'Baseline requirement', 'Superseded / matched value', 'Similarity'], d.items.map((it) => [artPill(it.classification), esc(it.incoming.text), esc(it.baselineRequirementId || '-'),
    it.classification === 'enhanced' ? `<span class="old">${esc(it.previous.text)}</span>` : it.matched ? `<span class="muted">${esc(it.matched.text)}</span>` : it.previous ? `<span class="muted">${esc(it.previous.text)}</span>` : '<span class="muted small">no baseline match</span>', it.similarity]), (i) => `row-${d.items[i].classification}`)}`;
}

async function renderCycleTab(c, tab) {
  const a = c.artifacts || {};
  const notYet = (what) => `<div class="banner info">${esc(what)} not produced yet (${esc(c.status)}).</div>`;
  switch (tab) {
    case 'inputs': return `<h2>Inputs taken</h2>${inputsTable(c)}`;
    case 'artifacts': return artifactsView(c);
    case 'overview':
    case 'report': return `<div class="banner info">The QE lead report and cycle report for ${esc(c.id)} are in <a href="#/reporting?cycle=${esc(c.id)}">Reporting</a>.</div>`;
    case 'review-agent': return reviewAgentView(c);
    case 'normalise': return `${c.review ? `<div class="banner ok">Reviewed by ${esc(c.review.reviewer)} at ${fmtTime(c.review.at)}. The reviewed set - not the raw inputs - flowed on.</div>` : ''}${normaliseView(c, false)}`;
    case 'review': {
      if (c.status !== 'awaiting-review') return `<div class="banner ok">Review complete.</div>${normaliseView(c, false)}`;
      return `<div class="banner info">Human review: settle every conflicting value (choose a value or exclude it), optionally exclude any statement, then approve the requirement set. Only the approved set flows on.</div>
${reviewAgentView(c, { compact: true })}
${c.type === 'incremental' ? `<div class="card" id="delta-box">${deltaView(c.deltaPreview, { title: 'Delta preview (before anything is designed)' })}</div>` : ''}
${normaliseView(c, true)}
<div class="card"><div class="row"><label>Reviewer <input type="text" id="reviewer" value="${esc(localStorage.getItem('aqe-user') || c.createdBy || '')}"></label>
<label>Comment <input type="text" id="comment" size="40"></label>
<button class="btn good" id="approve-review">Approve requirement set</button></div><div id="review-msg"></div></div>`;
    }
    case 'delta': return c.delta ? deltaView(c.delta) : deltaView(c.deltaPreview, { title: 'Delta preview (not yet reviewed)' });
    case 'requirements': return a.requirements ? requirementsView(c) : notYet('Requirements');
    case 'rules': return a.rules ? rulesView(c) : notYet('Business rules');
    case 'testcases': return a.testCases ? testCasesView(c) : notYet('Test cases');
    case 'testdata': return a.testData ? testDataView(c) : notYet('Test data');
    case 'scripts': return a.scripts ? scriptsView(c) : notYet('Scripts');
    case 'merge': return mergeView(c);
    case 'execution': return a.execution ? executionView(c) : `${notYet('Execution')}<p class="muted">Scripts are <b>designed</b> but have not been executed.</p>`;
    case 'defects': return a.defects ? defectsView(c) : notYet('Defects');
    case 'skills': return skillsView(c);
    case 'traceability': return c.report && c.report.traceability ? traceabilityView(c) : notYet('Traceability');
    default: return '';
  }
}

function bindCycleTab(c, tab) {
  if (tab !== 'review' || c.status !== 'awaiting-review') return;
  const conflicts = c.normalisation.groups.filter((g) => g.bucket === 'conflict');
  const collect = () => {
    const excluded = [...$view.querySelectorAll('.excl:checked')].map((e) => e.dataset.g);
    const resolutions = {};
    for (const g of conflicts) {
      const v = $view.querySelector(`input[name="res-${g.id}"]:checked`);
      if (v && v.value === '__exclude') excluded.push(g.id);
      else if (v) resolutions[g.id] = v.value;
    }
    return { excluded, resolutions };
  };
  const btn = document.getElementById('approve-review');
  const refresh = async () => {
    const d = collect();
    const open = conflicts.filter((g) => !d.resolutions[g.id] && !d.excluded.includes(g.id));
    $view.querySelectorAll('.res-state').forEach((el) => { const ok = !open.some((g) => g.id === el.dataset.g); el.textContent = ok ? 'settled' : 'unresolved'; el.className = `pill ${ok ? 'passed' : 'conflict'} res-state`; });
    $view.querySelectorAll('[data-conflict]').forEach((el) => { if (!open.some((g) => g.id === el.dataset.conflict)) el.classList.remove('need'); });
    if (c.type === 'incremental') {
      const p = await api(`/api/cycles/${c.id}/delta-preview`, { method: 'POST', body: d });
      document.getElementById('delta-box').innerHTML = deltaView(p, { title: 'Delta preview (before anything is designed)' });
    }
  };
  $view.querySelectorAll('.excl,.res').forEach((el) => el.onchange = refresh);
  refresh();
  btn.onclick = async () => {
    const reviewer = document.getElementById('reviewer').value.trim();
    const d = collect();
    const problems = [
      ...(reviewer ? [] : [{ field: 'reviewer', message: 'Enter the reviewer name: every approval is recorded against a person' }]),
      ...conflicts.filter((g) => !d.resolutions[g.id] && !d.excluded.includes(g.id)).map((g) => ({ group: g.id, message: `Conflict ${g.id} needs a decision (${g.options.map((o) => `${o.sources.join('/')} says ${o.signature}`).join(', ')}): choose a value or exclude it` })),
    ];
    const msg = document.getElementById('review-msg');
    if (problems.length) { showBlocked(msg, 'The requirement set cannot be approved yet', problems, c.id); return; }
    localStorage.setItem('aqe-user', reviewer);
    btn.disabled = true;
    try {
      await api(`/api/cycles/${c.id}/review`, { method: 'POST', body: { reviewer, comment: document.getElementById('comment').value, ...d } });
      location.hash = `#/cycle/${c.id}?tab=${c.type === 'incremental' ? 'delta' : 'requirements'}`;
    } catch (e) { showBlocked(msg, e.message, e.details || [], c.id); btn.disabled = false; }
  };
}

function requirementsView(c) {
  const reqs = c.artifacts.requirements;
  return `<h2>Requirements repository (${reqs.length})</h2>${table(['ID', 'Requirement', 'Type', 'Status', 'Superseded value', 'Sources and quotes', 'Jira'], reqs.map((r) => [esc(r.id), esc(r.text), esc(r.type), artPill(r.status || 'new'),
    r.previous ? `<span class="old">${esc(r.previous.text)}</span> <span class="small muted">v${r.previous.version}</span>` : '', originCell(r.origins), esc((r.jiraKeys || []).join(', '))]), (i) => `row-${reqs[i].status}`)}`;
}

function rulesView(c) {
  const rules = c.artifacts.rules;
  return `<h2>Business rules (${rules.length})</h2>${table(['ID', 'Req', 'Rule', 'Parameters', 'Status', 'Source quotes'], rules.map((r) => [esc(r.id), esc(r.requirementId), `<b>${esc(r.title)}</b><br>${esc(r.statement)}${r.previous ? `<br><span class="old">${esc(r.previous.statement)}</span>` : ''}`,
    `<code>${esc(JSON.stringify(r.parameters))}</code>${r.executable ? '' : '<br><span class="muted small">no executable check</span>'}`, artPill(r.status), r.quotes.map((q) => `<div class="quote">"${esc(q.text)}"</div><div class="small"><a href="${esc(q.url || '#')}" target="_blank" rel="noopener">${esc(q.ref)}${q.line ? `:${q.line}` : ''}</a> (${esc(q.source)})</div>`).join('')]), (i) => `row-${rules[i].status}`)}`;
}

function testCasesView(c) {
  const tcs = c.artifacts.testCases;
  const cnt = (f) => tcs.reduce((m, t) => { for (const k of [].concat(f(t))) m[k] = (m[k] || 0) + 1; return m; }, {});
  const kv = (o) => Object.entries(o).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(' · ');
  return `${testingScope(c)}<div class="row"><h2 style="margin:0">Test cases (${tcs.length})</h2><a class="btn" href="/api/cycles/${esc(c.id)}/export/testcases.xlsx">Download Excel (.xlsx, Zephyr Scale columns)</a></div>
<p class="small">By type: ${kv(cnt((t) => t.type))} · by label: ${kv(cnt((t) => t.labels))} · ${kv(cnt((t) => t.automation))}${c.type === 'incremental' ? ` · ${kv(cnt((t) => t.status))}` : ''}</p>
<p class="muted small">These are <b>designed</b> test cases. Execution results are on the Execution tab.${c.type === 'incremental' ? ' In the Excel export, new rows are green, changed rows amber (superseded expected result in a cell note).' : ''}</p>
${table(['Key', 'Name / objective', 'Precondition', 'Steps', 'Test data', 'Expected result', 'Priority', 'Type', 'Labels', 'Links', 'Automation', 'Status'], tcs.map((t) => [esc(t.key),
    `<b>${esc(t.name)}</b>${t.previous && t.previous.name !== t.name ? `<br><span class="old">${esc(t.previous.name)}</span>` : ''}<br><span class="small muted">${esc(t.objective)}</span>`, esc(t.precondition),
    `<ol style="margin:0;padding-left:16px">${t.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`, `<code>${esc(t.testData)}</code>`,
    `${t.previous && t.previous.expected !== t.expected ? `<span class="old">${esc(t.previous.expected)}</span><br>` : ''}<span class="${t.previous ? 'newv' : ''}">${esc(t.expected)}</span>`, esc(t.priority), esc(t.type), esc(t.labels.join(', ')),
    esc([...(t.issueLinks || []), t.requirementId].join(', ')), t.scriptFile ? `${esc(t.automation)}<br><a class="small" href="#/scripts?cycle=${esc(c.id)}&file=${esc(t.scriptFile)}">${esc(t.scriptFile)}</a>` : esc(t.automation), artPill(t.status)]), (i) => `row-${tcs[i].status}`)}`;
}

const CONFORMANCE = { conforms: ['Conforms to spec', 'passed'], 'negative test': ['Negative test (invalid on purpose)', 'enhanced'], 'does not conform': ['Does not conform', 'failed'] };
function testDataView(c) {
  const a = c.artifacts;
  const s = a.testDataSummary || {};
  const d = s.dictionary || {};
  const cases = new Map(a.testCases.map((t) => [t.key, t]));
  return `<h2>Test data (${a.testData.length} data sets)</h2>
<p class="small">Generated by the test data agent from <b>${esc(d.name)}</b> v${esc(d.version)} (${esc(d.attributeCount)} attributes) · specification: ${esc(d.source)}</p>
<p class="small">${pill(`${s.conforming} conform`, 'passed')} ${pill(`${s.negative} negative test${s.negative === 1 ? "" : "s"}`, 'enhanced')} ${s.nonConforming ? pill(`${s.nonConforming} do not conform`, 'failed') : ''}${c.type === 'incremental' ? ` · ${Object.entries(s.byStatus || {}).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(' · ')}` : ''}</p>
<p class="muted small">${esc(s.method)} Each automation script loads its case's data set and overrides only the values the case states.</p>
${table(['Data set', 'Test case', 'Set by the test case', 'Generated from the spec', 'Check against the spec', 'Status', 'Download'], a.testData.map((x) => {
    const t = cases.get(x.testCaseKey) || {};
    return [esc(x.id), `<a href="#/cycle/${esc(c.id)}?tab=testcases">${esc(x.testCaseKey)}</a><br><span class="small muted">${esc(t.name || '')}</span>`,
      x.drivers.length ? x.drivers.map((v) => `<code>${esc(v.attribute)}</code> = <b>${esc((v.variants || [v.value]).join(' | '))}</b> <span class="small muted">(${esc(v.spec)})</span>`).join('<br>') : '<span class="muted">none: standard booking</span>',
      `${x.generated} attributes${Object.keys(x.parameters).length ? `<br><span class="small muted">run settings: ${esc(Object.entries(x.parameters).map(([k, v]) => `${k}=${v}`).join('; '))}</span>` : ''}`,
      `${pill(...CONFORMANCE[x.conformance])}${x.problems.length ? `<br><span class="small">${esc(x.problems.join('; '))}</span>` : ''}`,
      artPill(x.status), `<a href="/api/cycles/${esc(c.id)}/testdata/${esc(x.testCaseKey)}.json" target="_blank">JSON</a>`];
  }))}`;
}

function codeBlock(code, highlight = []) {
  return `<pre class="code">${code.split('\n').map((l) => (highlight.includes(l) ? `<span class="hl">${esc(l)}</span>` : esc(l))).join('\n')}</pre>`;
}
function changedLines(code, prev) {
  if (!prev) return [];
  const old = new Set(prev.split('\n'));
  return code.split('\n').filter((l) => l.trim() && !old.has(l));
}

function scriptsView(c, params = new URLSearchParams()) {
  const scripts = c.artifacts.scripts;
  const file = params.get('file');
  return `<h2>Playwright scripts (${scripts.length})</h2><p class="muted small">Generated, self-contained specs against the bundled sample service. ${c.artifacts.execution ? 'These specs were <b>executed</b> by the Playwright CLI in this cycle.' : 'Designed, not yet executed.'}</p>
${scripts.map((s) => `<details class="card" ${!file || file === s.file ? 'open' : ''} id="s-${esc(s.file)}"><summary><b>${esc(s.file)}</b> · covers ${esc(s.covers.join(', '))} · ${esc(s.requirementId)} · v${s.version} ${artPill(s.status)}
<a class="small" href="/api/cycles/${esc(c.id)}/scripts/${encodeURIComponent(s.file)}?download=1">download</a></summary>
${s.previous ? `<p class="small">Re-designed from v${s.previous.version}; changed lines highlighted.</p><div class="grid2"><div><b class="small">Superseded (v${s.previous.version})</b>${codeBlock(s.previous.code, changedLines(s.previous.code, s.code))}</div><div><b class="small">New (v${s.version})</b>${codeBlock(s.code, changedLines(s.code, s.previous.code))}</div></div>` : codeBlock(s.code)}</details>`).join('')}`;
}

function mergeView(c) {
  if (c.type !== 'incremental') return '<p class="muted">Baseline cycles have no merge step.</p>';
  if (!c.mergeProposal) return '<div class="banner info">The merge review appears once the delta has been designed.</div>';
  const a = c.artifacts;
  const mp = c.mergeProposal;
  const reqs = a.requirements.filter((r) => mp.requirements.includes(r.id));
  const tcs = a.testCases.filter((t) => mp.testCases.includes(t.key));
  const scripts = a.scripts.filter((s) => mp.scripts.includes(s.file));
  const decided = c.approvals.find((p) => p.gate === 'Merge into baseline');
  const counts = (arr) => `${arr.filter((x) => x.status === 'new').length} new · ${arr.filter((x) => x.status !== 'new').length} re-designed`;
  return `${decided ? `<div class="banner ${decided.decision === 'approved' ? 'ok' : 'err'}">Merge ${esc(decided.decision)} by ${esc(decided.by)} at ${fmtTime(decided.at)}. ${esc(decided.detail)}</div>`
    : `<div class="banner info">Nothing joins baseline ${esc(mp.baselineId)} v${mp.baselineVersion} until you approve. Rejecting leaves it untouched. ${a.requirements.length - reqs.length} unchanged requirements and their artifacts are carried over and not listed.</div>`}
${c.rejectedRows && c.rejectedRows.length ? `<div class="banner">Rows rejected at the gate (kept at baseline value / not added): ${esc(c.rejectedRows.join(', '))}</div>` : ''}
<h2>Requirements to merge (${counts(reqs)})</h2>${table([...(c.status === 'awaiting-merge' ? ['Reject row'] : []), 'ID', 'Status', 'Superseded value', 'New value'], reqs.map((r) => [...(c.status === 'awaiting-merge' ? [`<input type="checkbox" class="reject-row" value="${esc(r.id)}" title="Reject this row only">`] : []), esc(r.id), artPill(r.status), r.previous ? `<span class="old">${esc(r.previous.text)}</span>` : '-', `<span class="newv">${esc(r.text)}</span>`]), (i) => `row-${reqs[i].status}`)}
<h2>Test cases to merge (${counts(tcs)})</h2>${table(['Key', 'Req', 'Status', 'Superseded', 'New'], tcs.map((t) => [esc(t.key), esc(t.requirementId), artPill(t.status),
    t.previous ? `<span class="old">${esc(t.previous.name)}<br>${esc(t.previous.expected)}</span>` : '-', `<span class="newv">${esc(t.name)}</span><br>${esc(t.expected)}`]), (i) => `row-${tcs[i].status}`)}
<h2>Scripts to merge (${counts(scripts)})</h2>${table(['File', 'Covers', 'Status', 'Superseded assertion(s)', 'New assertion(s)'], scripts.map((s) => {
    const newL = changedLines(s.code, s.previous && s.previous.code);
    const oldL = s.previous ? changedLines(s.previous.code, s.code) : [];
    return [`<a href="#/scripts?cycle=${esc(c.id)}&file=${esc(s.file)}">${esc(s.file)}</a>`, esc(s.covers.join(', ')), artPill(s.status),
      oldL.length ? `<code class="old">${oldL.map((l) => esc(l.trim())).join('<br>')}</code>` : '-', s.previous ? `<code class="newv">${newL.map((l) => esc(l.trim())).join('<br>')}</code>` : `<span class="small">new spec, ${s.code.split('\n').length} lines</span>`];
  }), (i) => `row-${scripts[i].status}`)}
${c.status === 'awaiting-merge' ? `<div class="card"><div class="row"><label>Approver <input type="text" id="approver" value="${esc(localStorage.getItem('aqe-user') || '')}"></label><label>Comment <input type="text" id="mcomment" size="40"></label>
<button class="btn good" id="merge-approve">Approve merge</button><button class="btn danger" id="merge-reject">Reject</button></div><div id="merge-msg"></div></div>` : ''}`;
}

function executionView(c) {
  const ex = c.artifacts.execution;
  const s = ex.summary;
  return `<h2>Execution ${pill('executed', 'executed')}</h2>
<div class="kpis"><div class="kpi">Test cases<b>${s.total}</b></div><div class="kpi">Executed<b>${s.executed}</b></div><div class="kpi">Passed<b>${s.passed}</b></div><div class="kpi">Failed<b>${s.failed}</b></div><div class="kpi">Not run (manual)<b>${s.notRun}</b></div><div class="kpi">Pass rate<b>${s.passRate}%</b></div><div class="kpi">Duration<b>${s.durationMs} ms</b></div></div>
<p class="small">Really executed by <b>${esc(ex.tool)}</b> against <b>${esc(ex.sut.name)}</b> (build <code>${esc(ex.sut.build)}</code>, ${esc(ex.sut.url)}) from ${fmtTime(ex.startedAt)} to ${fmtTime(ex.finishedAt)}. Exit code ${ex.exitCode}. Command: <code>${esc(ex.command)}</code>. <a href="/api/cycles/${esc(c.id)}/playwright-report.json" target="_blank">Raw Playwright JSON report</a></p>
${table(['Case', 'Req', 'Name', 'Result', 'Duration', 'Failure / note', 'Evidence'], ex.results.map((r) => [esc(r.key), esc(r.requirementId), esc(r.name), pill(r.status, r.status),
    r.duration != null ? `${r.duration} ms` : '-', r.error ? `<code>${esc(r.error.assertion || '')}</code><br>expected <b>${esc(r.error.expected)}</b>, actual <b>${esc(r.error.actual)}</b><br><span class="small muted">${esc(r.error.location || '')}</span>` : esc(r.reason || ''),
    (r.evidence || []).map((e) => `<a class="small" target="_blank" href="/api/cycles/${esc(c.id)}/evidence/${esc(e.file)}">${esc(e.name)}</a>`).join('<br>')]), (i) => `row-${ex.results[i].status}`)}`;
}

function traceabilityView(c) {
  const t = c.report.traceability;
  const res = (x) => (x === 'passed' || x === 'failed' ? pill(x, x) : `<span class="muted small">${esc(x)}</span>`);
  const jiraLink = (k) => `<a href="${esc(jiraBrowse(c, k))}" target="_blank" rel="noopener">${esc(k)}</a>`;
  return `<p class="muted">Every test case traced from the Jira item it came from to its requirement, business rule, test data, script, real result and defect. Computed from this cycle's artifacts.</p>
<div class="kpis"><div class="kpi">Jira items<b>${t.totals.jiraItems}</b></div><div class="kpi">Covered by a test<b>${t.totals.covered}</b></div><div class="kpi">Verified<b>${t.totals.verified}</b></div><div class="kpi">Failing<b>${t.totals.failing}</b></div><div class="kpi">Test cases<b>${t.totals.testCases}</b></div><div class="kpi">With test data<b>${t.totals.withData}</b></div><div class="kpi">With a script<b>${t.totals.withScript}</b></div><div class="kpi">Executed<b>${t.totals.executed}</b></div></div>
<div class="row"><a class="btn secondary" href="/api/cycles/${esc(c.id)}/report.xlsx">Download Excel (Traceability sheets)</a></div>
<h3>By Jira item (initiative, epics, stories)</h3>${t.stories.some((x) => x.scope === 'baseline') ? '<p class="muted small">Includes the baseline stories this cycle re-tested through the carried test pack, not only the incoming epics.</p>' : ''}${table(['Jira item', 'Level', 'Parent', 'Summary', 'Requirements', 'Test cases', 'Automated', 'Passed', 'Failed', 'Defects', 'Status'], t.stories.map((x) => [jiraLink(x.key), `${esc(x.level)}${x.scope === 'baseline' ? ' <span class="muted small">(baseline, re-tested)</span>' : ''}`, esc(x.parent || '-'), esc(x.summary || ''), x.requirements, x.testCases, x.automated, x.passed, x.failed, x.defects.length ? `<a href="#/cycle/${esc(c.id)}?tab=defects">${esc(x.defects.join(', '))}</a>` : '-', pill(x.status, x.status === 'verified' ? 'passed' : x.status === 'failing' ? 'failed' : 'pending')]), (i) => (t.stories[i].status === 'failing' ? 'row-failed' : ''))}
<h3>By test case</h3>${table(['Jira', 'Requirement', 'Rule', 'Test case', 'Type', 'Test data', 'Script', 'Result', 'Defect'], t.rows.map((x) => [x.jiraKeys.map(jiraLink).join(', '), `<a href="#/cycle/${esc(c.id)}?tab=requirements">${esc(x.requirementId)}</a>`, esc(x.ruleId || '-'), `<b>${esc(x.testCaseKey)}</b> ${esc(x.testCase)}`, esc(x.testType), x.testDataId ? `<a target="_blank" href="/api/cycles/${esc(c.id)}/testdata/${esc(x.testCaseKey)}.json">${esc(x.testDataId)}</a>` : '-', x.scriptFile ? `<a href="#/scripts?cycle=${esc(c.id)}&file=${esc(x.scriptFile)}">${esc(x.scriptFile)}</a>` : '-', res(x.result), x.defects.length ? `<a href="#/cycle/${esc(c.id)}?tab=defects">${esc(x.defects.join(', '))}</a>${x.jiraDefects.length ? ` (${x.jiraDefects.map(jiraLink).join(', ')})` : ''}` : '-']), (i) => (t.rows[i].result === 'failed' ? 'row-failed' : ''))}`;
}

function jiraBrowse(c, key) {
  const i = c.inputs.find((x) => (x.slot === 'initiative' || x.slot === 'epic') && x.provenance && /atlassian\.net/.test(x.provenance.label || ''));
  const m = i && i.provenance.label.match(/https:\/\/[\w.-]+atlassian\.net/);
  return m ? `${m[0]}/browse/${key}` : '#';
}

function jiraDefectLine(x) {
  const j = x.jira;
  if (j && j.key) return `<b>Jira defect:</b> <a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.key)}</a> (${esc(j.issueType || 'issue')}, ${esc(j.link || 'linked to')} ${esc(j.linkedTo)})${j.updatedInCycle ? ` · updated in ${esc(j.updatedInCycle)}` : ''}`;
  if (j && j.status === 'failed') return `<b>Jira defect:</b> <span class="err">Jira call failed: ${esc(j.reason)}</span> · linked to ${esc(j.linkedTo)} in the platform`;
  return `<b>Jira defect:</b> ${pill('not raised in Jira', 'pending')} ${j && j.linkedTo ? `linked to story <b>${esc(j.linkedTo)}</b> in the platform` : ''}<br><span class="small muted">${esc(j ? j.reason : 'Raised before Jira linking existed')}</span>${j && j.payload ? `<details><summary class="small">Jira payload ready to send</summary><pre class="code">${esc(JSON.stringify(j.payload, null, 2))}</pre></details>` : ''}`;
}

function defectsView(c) {
  const d = c.artifacts.defects;
  const res = c.artifacts.resolvedDefects || [];
  return `<h2>Defects (${d.length})</h2><p class="muted small">Raised only from test cases that actually failed in the real Playwright run of this cycle.</p>
${d.length ? d.map((x) => `<div class="card"><h3>${esc(x.id)} - ${esc(x.title)} ${pill(x.severity, 'failed')} ${pill(x.movement === 'still open' ? `still open since ${x.firstSeenCycle}` : x.movement, x.movement === 'new' ? 'failed' : 'enhanced')}</h3>
<div class="grid2"><div><b>Expected:</b> <span class="newv">${esc(x.expected)}</span><br><b>Actual:</b> <span class="old" style="text-decoration:none">${esc(x.actual)}</span><br><b>Severity:</b> ${esc(x.severity)}${x.impact ? ` (${esc(x.impact)})` : ''}<br><b>Release:</b> ${esc(x.releaseDecision || 'not assessed')}<br><b>Suspected code area:</b> <code>${esc(x.suspectedCodeArea || '-')}</code><br><b>Failing assertion:</b> <code>${esc(x.assertion)}</code> <span class="small muted">(${esc(x.location)})</span></div>
<div><b>Test case:</b> <a href="#/cycle/${esc(c.id)}?tab=testcases">${esc(x.testCaseKey)}</a> · <b>Script:</b> <a href="#/scripts?cycle=${esc(c.id)}&file=${esc(x.scriptFile)}">${esc(x.scriptFile)}</a><br><b>Requirement:</b> <a href="#/cycle/${esc(c.id)}?tab=requirements">${esc(x.requirementId)}</a> ${esc(x.requirementText)}<br><b>Rule:</b> ${esc(x.ruleId || '-')} · <b>Source:</b> ${esc((x.sourceRefs || x.jiraKeys).join(', '))} · first seen ${esc(x.firstSeenCycle)}<br>${jiraDefectLine(x)}</div></div>
<details><summary class="small">Error output and evidence</summary><pre class="code">${esc(x.errorMessage)}</pre>${x.evidence.map((e) => `<a class="small" target="_blank" href="/api/cycles/${esc(c.id)}/evidence/${esc(e.file)}">${esc(e.name)}</a>`).join(' · ')}</details></div>`).join('') : '<div class="banner ok">No test case failed, so no defects were raised.</div>'}
${res.length ? `<h3>Fixed, retested and certified (${res.length})</h3><p class="muted small">Defects open in the previous cycle whose test case was re-run against this build and passed.</p>${table(['ID', 'Title', 'Story', 'First seen', 'Retest', 'Result', 'Certification'], res.map((x) => [esc(x.id), esc(x.title), esc((x.jira && x.jira.linkedTo) || (x.jiraKeys || [])[0] || '-'), esc(x.firstSeenCycle), `${esc(x.testCaseKey)} in ${esc(x.resolvedInCycle)}${x.retest && x.retest.scriptFile ? ` · <a href="#/scripts?cycle=${esc(c.id)}&file=${esc(x.retest.scriptFile)}">${esc(x.retest.scriptFile)}</a>` : ''}`, pill(x.retest ? x.retest.result : 'passed', 'passed'), `${pill(x.status || 'Closed', 'passed')} ${esc(x.certification || '')}`]))}` : ''}`;
}

function reportView(c) {
  const r = c.report;
  return `<div class="row"><h2 style="margin:0">Cycle report</h2><a class="btn" href="/api/cycles/${esc(c.id)}/report.html" target="_blank">Open HTML</a><a class="btn secondary" href="/api/cycles/${esc(c.id)}/report.html?download=1">Download HTML</a><a class="btn secondary" href="/api/cycles/${esc(c.id)}/report.xlsx">Download Excel</a></div>
<div class="kpis" style="margin-top:10px"><div class="kpi">Requirements<b>${r.requirements.total}</b></div><div class="kpi">Test cases<b>${r.testCases.total}</b></div><div class="kpi">Scripts<b>${r.scripts.total}</b></div><div class="kpi">Executed<b>${r.execution.executed ? r.execution.summary.executed : 0}</b></div><div class="kpi">Pass rate<b>${r.execution.executed ? `${r.execution.summary.passRate}%` : 'n/a'}</b></div><div class="kpi">Defects<b>${r.defects.open.length}</b></div><div class="kpi">Coverage (passing)<b>${r.coverage ? r.coverage.percent.passing : 0}%</b></div></div>
<div class="card"><b>Summary</b><p>${esc(r.narrative.text)}</p><p class="muted small">${esc(r.narrative.draftedBy)}</p></div>
<div class="card" id="report-skills"><b>Active skills (${(r.skills || []).length})</b> · hand-over <span class="hand ${r.handoverStatus === 'complete' ? 'ok' : 'bad'}">${esc(r.handoverStatus || 'not checked')}</span>
<p class="small">${(r.skills || []).map((s) => `${pill(s.id, 'designed')} ${esc(s.name)}`).join('<br>') || 'No skills were active for this cycle.'}</p><a class="small" href="#/cycle/${esc(c.id)}?tab=skills">Hand-over detail per phase</a></div>
<iframe class="report" src="/api/cycles/${esc(c.id)}/report.html" title="Cycle report"></iframe>`;
}

/* bind merge buttons after render */
document.addEventListener('click', async (ev) => {
  const id = ev.target.id;
  if (id !== 'merge-approve' && id !== 'merge-reject') return;
  const cycleId = location.hash.match(/cycle\/([^?]+)/)[1];
  const approver = document.getElementById('approver').value.trim();
  const msg = document.getElementById('merge-msg');
  if (!approver) { showBlocked(msg, `The merge into the baseline cannot be ${id === 'merge-approve' ? 'approved' : 'rejected'} yet`, [{ field: 'approver', message: 'Enter the approver name: every merge decision is recorded against a person' }], cycleId); return; }
  localStorage.setItem('aqe-user', approver);
  ev.target.disabled = true;
  try {
    await api(`/api/cycles/${cycleId}/merge`, { method: 'POST', body: { decision: id === 'merge-approve' ? 'approve' : 'reject', approver, comment: document.getElementById('mcomment').value,
      rejectedRows: [...document.querySelectorAll('.reject-row')].filter((x) => x.checked).map((x) => x.value) } });
    location.hash = `#/cycle/${cycleId}?tab=${id === 'merge-approve' ? 'execution' : 'merge'}`;
    route();
  } catch (e) { showBlocked(msg, e.message, e.details || [], cycleId); ev.target.disabled = false; }
});

/* ---------------- per-artifact pages with a cycle picker ---------------- */
async function pickCycle(params, title, render, needs) {
  setTitle(title);
  const cycles = await api('/api/cycles');
  const eligible = cycles.filter(needs);
  let id = params.get('cycle') || (eligible.length ? eligible[eligible.length - 1].id : null);
  const picker = `<div class="row"><h1 style="margin:0">${esc(title)}</h1><label class="small">Cycle <select id="cyc">${cycles.map((c) => `<option value="${esc(c.id)}" ${c.id === id ? 'selected' : ''}>${esc(c.id)} - ${esc(c.name)} (${esc(c.status)})</option>`).join('')}</select></label></div>`;
  if (!id) { $view.innerHTML = `${picker}<p class="muted">No cycle has produced this yet. <a href="#/run">Run a cycle</a>.</p>`; return; }
  const c = await api(`/api/cycles/${id}`);
  let body;
  try { body = render(c, params); } catch (e) { body = `<div class="banner info">Not available for ${esc(c.id)} yet (${esc(c.status)}).</div>`; }
  $view.innerHTML = `${picker}<p class="small"><a href="#/cycle/${esc(c.id)}">Open ${esc(c.id)} artifacts by phase</a></p>${body}`;
  document.getElementById('cyc').onchange = (e) => { location.hash = `#/${location.hash.split('?')[0].slice(2)}?cycle=${e.target.value}`; };
  const f = params.get('file');
  if (f) { const el = document.getElementById(`s-${f}`); if (el) el.scrollIntoView(); }
}

const REPORT_VIEWS = [
  ['lead', 'QE lead report', 'Summary, inputs, approach, risks, go/no-go and sign-off'],
  ['execution', 'Execution results', 'Every test case with its real result and evidence'],
  ['defects', 'Defects', 'Raised only from real failures, with expected vs actual'],
  ['cycle', 'Full cycle report', 'Counts, coverage, approvals, skills and hand-overs'],
  ['downloads', 'Downloads', 'HTML, Markdown and Excel files for this cycle'],
];

function downloadsView(c) {
  const id = esc(c.id);
  const rows = [
    ['QE lead report', `<a href="/api/cycles/${id}/lead-report.html" target="_blank">Open</a> · <a href="/api/cycles/${id}/lead-report.html?download=1">HTML</a> · <a href="/api/cycles/${id}/lead-report.md">Markdown</a>`],
    ['Full cycle report', `<a href="/api/cycles/${id}/report.html" target="_blank">Open</a> · <a href="/api/cycles/${id}/report.html?download=1">HTML</a> · <a href="/api/cycles/${id}/report.xlsx">Excel</a>`],
    ['Test cases (Zephyr Scale)', `<a href="/api/cycles/${id}/export/testcases.xlsx">Excel (.xlsx)</a>`],
    ['Execution', `<a href="/api/cycles/${id}/playwright-report.json" target="_blank">Playwright JSON report</a>`],
  ];
  return table(['Report', 'Files'], rows);
}

async function viewReporting(params) {
  setTitle('Reporting');
  const all = await api('/api/cycles');
  const cycles = all.filter((c) => c.status === 'completed');
  const hero = pendingBanner(all) + '<section class="hero small-hero"><div class="eyebrow">Reporting</div><h1>Quality reports by cycle</h1><p>Pick a cycle to read its QE lead report, results, defects and the full cycle report, or download them.</p></section>';
  if (!cycles.length) { $view.innerHTML = `${hero}<p class="muted">No cycle has completed yet. <a href="#/run">Run a cycle</a>.</p>`; return; }
  const id = cycles.some((c) => c.id === params.get('cycle')) ? params.get('cycle') : cycles[cycles.length - 1].id;
  const view = REPORT_VIEWS.some(([v]) => v === params.get('view')) ? params.get('view') : 'lead';
  const c = await api(`/api/cycles/${id}`);
  const q = (v) => `#/reporting?cycle=${esc(id)}&view=${v}`;
  const when = (x) => new Date(x.completedAt || x.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const result = (x) => (x.summary ? `${x.summary.passed}/${x.summary.executed} passed · ${x.summary.passRate}%` : 'not executed');
  const picked = cycles.find((x) => x.id === id);
  const picker = `<section class="panel cycle-picker"><label class="field" for="rep-cycle">Cycle run</label>
<select id="rep-cycle">${cycles.slice().reverse().map((x) => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(when(x))} · ${esc(x.id)} · ${esc(x.example ? exampleShort(x.example) : '')} ${x.type} · ${esc(testingTypeOf(x.testingType).short)} · ${esc(result(x))}</option>`).join('')}</select>
<span class="muted small">${cycles.length} completed cycle(s) · run on ${esc(when(picked))}</span></section>`;
  const ex = c.artifacts.execution ? c.artifacts.execution.summary : null;
  const defects = c.artifacts.defects || [];
  const big = { lead: '✔', execution: ex ? `${ex.passRate}%` : '-', defects: defects.length, cycle: '≡', downloads: '⇩' };
  const viewTiles = REPORT_VIEWS.map(([v, name, line]) => tile({ href: q(v), art: v === 'defects' && defects.length ? 'gate' : 'run', tag: 'Report', big: big[v], title: name, lines: [esc(line)], cls: v === view ? 'sel' : '' }));
  const prev = cycles.filter((x) => x.id !== id && cycles.indexOf(x) < cycles.findIndex((y) => y.id === id)).pop();
  if (prev) viewTiles.push(tile({ href: `#/compare?a=${prev.id}&b=${id}`, art: 'flow2', tag: 'Compare', big: 'Δ', title: `Compare with ${prev.id}`, lines: ['Side by side: what changed and how results moved'] }));
  let body;
  if (view === 'lead') {
    const { html } = await api(`/api/cycles/${id}/lead-report`);
    body = `<div class="row"><a class="btn" href="/api/cycles/${esc(id)}/lead-report.html" target="_blank">Open as page</a><a class="btn secondary" href="/api/cycles/${esc(id)}/lead-report.html?download=1">Download HTML</a><a class="btn secondary" href="/api/cycles/${esc(id)}/lead-report.md">Download Markdown</a></div>${html}`;
  } else if (view === 'execution') body = ex ? executionView(c) : '<p class="muted">Not executed.</p>';
  else if (view === 'defects') body = defectsView(c);
  else if (view === 'cycle') body = reportView(c);
  else body = downloadsView(c);
  const label = REPORT_VIEWS.find(([v]) => v === view)[1];
  $view.innerHTML = `${hero}${picker}
${rail('rep-views', `${c.id} · ${c.name}`, `${c.type === 'baseline' ? 'baseline' : 'incremental'} cycle · <a href="#/cycle/${esc(id)}">open the cycle's run and artifacts</a>`, viewTiles)}
<section class="panel" id="detail-panel"><div class="panel-head"><h2>${esc(label)}</h2><span class="crumbs"><a href="#/reporting">Reporting</a> › ${esc(c.id)} › ${esc(label)}</span></div><div id="tab">${body}</div></section>`;
  $view.querySelectorAll('.tile.sel').forEach((t) => { t.parentElement.scrollLeft = Math.max(0, t.offsetLeft - t.parentElement.offsetLeft - 40); });
  document.getElementById('rep-cycle').onchange = (e) => { location.hash = `#/reporting?cycle=${e.target.value}&view=${view}`; };
  if (params.get('view')) document.getElementById('detail-panel').scrollIntoView({ block: 'start' });
}

async function viewCompare(params) {
  setTitle('Compare');
  const cycles = (await api('/api/cycles')).filter((c) => c.status === 'completed');
  if (cycles.length < 2) { $view.innerHTML = '<h1>Compare cycles</h1><p class="muted">Two completed cycles are needed (a baseline and an incremental cycle).</p>'; return; }
  const a = params.get('a') || cycles[cycles.length - 2].id;
  const b = params.get('b') || cycles[cycles.length - 1].id;
  const sel = (name, v) => `<select id="${name}">${cycles.map((c) => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.id)} - ${esc(c.name)}</option>`).join('')}</select>`;
  const cmp = await api(`/api/compare?a=${a}&b=${b}`);
  const row = (label, d) => [`<b>${esc(label)}</b>`, d.countA, d.countB, `<b>${d.added.length}</b><br><span class="small">${esc(d.added.join(', '))}</span>`, `<b>${d.changed.length}</b><br><span class="small">${esc(d.changed.join(', '))}</span>`, `<b>${d.unchanged.length}</b>`];
  const ea = cmp.execution.a;
  const eb = cmp.execution.b;
  const q = `a=${esc(a)}&b=${esc(b)}`;
  $view.innerHTML = `<div class="row"><h1 style="margin:0">Compare cycles</h1>${sel('ca', a)} vs ${sel('cb', b)}
<a class="btn secondary" href="/api/compare.html?${q}" target="_blank">Open HTML</a><a class="btn secondary" href="/api/compare.html?${q}&download=1">Download HTML</a><a class="btn secondary" href="/api/compare.xlsx?${q}">Download Excel</a></div>
<div class="grid2"><div class="card"><h3>${esc(cmp.a.id)} - ${esc(cmp.a.name)}</h3>${ea.passed}/${ea.executed} passed · pass rate <b>${ea.passRate}%</b> · defects ${esc(cmp.defects.a.join(', ') || 'none')}</div>
<div class="card"><h3>${esc(cmp.b.id)} - ${esc(cmp.b.name)}</h3>${eb.passed}/${eb.executed} passed · pass rate <b>${eb.passRate}%</b> · defects ${esc(cmp.defects.b.join(', ') || 'none')}</div></div>
<h2>Artifacts</h2>${table(['Artifact', cmp.a.id, cmp.b.id, 'Added', 'Changed', 'Unchanged'], [row('Requirements', cmp.requirements), row('Test cases', cmp.testCases), row('Scripts', cmp.scripts)])}
<h2>Changed requirements</h2>${table(['ID', `Before (${cmp.a.id})`, `After (${cmp.b.id})`], cmp.requirements.changedDetail.map((d) => [esc(d.id), `<span class="old">${esc(d.before)}</span>`, `<span class="newv">${esc(d.after)}</span>`]))}
<h2>Execution and defect movement</h2>${table(['Metric', cmp.a.id, cmp.b.id], ['executed', 'passed', 'failed', 'passRate'].map((k) => [esc(k), ea[k], eb[k]]))}
<p>Pass-rate movement: <b>${cmp.execution.passRateDelta > 0 ? '+' : ''}${cmp.execution.passRateDelta} pts</b> · new defects: <b>${esc(cmp.defects.new.join(', ') || 'none')}</b> · still open: <b>${esc(cmp.defects.stillOpen.join(', ') || 'none')}</b> · resolved: <b>${esc(cmp.defects.resolved.join(', ') || 'none')}</b></p>`;
  const go = () => { location.hash = `#/compare?a=${document.getElementById('ca').value}&b=${document.getElementById('cb').value}`; };
  document.getElementById('ca').onchange = go;
  document.getElementById('cb').onchange = go;
}

async function viewBaselines() {
  setTitle('Baselines');
  const bs = await api('/api/baselines');
  $view.innerHTML = `<h1>Baselines</h1>${bs.length ? bs.map((b) => `<div class="card"><h3>${esc(b.id)} v${b.version} - ${esc(b.name)}</h3><p>${b.counts.requirements} requirements · ${b.counts.testCases} test cases · ${b.counts.scripts} scripts · cycles ${esc(b.cycles.join(', '))}</p>
${table(['Version', 'When', 'Cycle', 'Change', 'Approved by'], b.history.map((h) => [`v${h.version}`, fmtTime(h.at), esc(h.cycleId), esc(h.change), esc(h.approvedBy)]))}</div>`).join('') : '<p class="muted">No baseline yet.</p>'}`;
}

/* ---------------- Test Lab ---------------- */
let LAB = null;
const labState = { demo: 'happy', text: null, data: null, result: null, busy: '' };

function labAgents() {
  const d = labState.data;
  const r = labState.result;
  const st = (on, bad) => (bad ? 'failed' : on ? 'done' : labState.busy ? 'running' : 'pending');
  const steps = [
    ['Test design agent', 'Reads your plain-English test case and works out the expected result from the business rules.', st(d)],
    ['Test data agent', `Builds a full ${d ? d.attributeCount : 21}-attribute booking from the hotel data dictionary that matches what you described.`, st(d)],
    ['Automation agent', 'Writes the Playwright script for the case.', st(r)],
    ['Execution agent', 'Runs the script for real against the six hotel services of the chosen release.', st(r, r && r.status === 'failed')],
    ['Defect agent', r && r.defect ? 'Raised a defect from the real failure.' : 'Raises a defect only if the run really fails.', r ? (r.defect ? 'failed' : 'done') : 'pending'],
  ];
  const label = { done: 'done', failed: 'found a problem', running: labState.busy ? 'working' : 'pending', pending: 'pending' };
  return `<div class="agent-grid">${steps.map(([n, p, s], i) => `<div class="agent-card lab-${s}"><div class="agent-head"><span class="step-num small">${i + 1}</span><b>${esc(n)}</b><span class="state">${esc(label[s])}</span></div><p>${esc(p)}</p></div>`).join('')}</div>`;
}

function labOutput() {
  const d = labState.data;
  const r = labState.result;
  let html = `<h3 class="panel-title">Agents</h3>${labAgents()}`;
  if (labState.busy) html += `<div class="banner info">${esc(labState.busy)}</div>`;
  if (d) {
    if (d.reading) {
      html += `<h3 class="panel-title">How the platform read your test</h3>
${table(['', 'Value', 'Where it came from'], d.reading.map((x) => [esc(x.label), `<b>${esc(x.value)}</b>`, x.from === 'your test' || x.from.startsWith('your test') ? pill(x.from, 'passed') : `<span class="muted">${esc(x.from)}</span>`]))}
${d.notes.length ? `<div class="banner info">${d.notes.map(esc).join('<br>')}</div>` : ''}`;
    }
    html += `<h3 class="panel-title">Test data</h3>
<p class="small">A full booking of <b>${d.attributeCount}</b> attributes built from the hotel data dictionary. The attributes below follow your test case; every other attribute keeps its dictionary example value.</p>
${d.drivers.length ? table(['Attribute', 'Value', 'Dictionary example', 'Meaning'], d.drivers.map((x) => [`<code>${esc(x.name)}</code>`, `<b>${esc(x.value)}</b>`, esc(x.example), esc(x.description)])) : '<p class="small muted">Your test uses the standard booking as it is.</p>'}
<details><summary class="small">A few of the other ${d.attributeCount - d.drivers.length} attributes</summary>${table(['Attribute', 'Value'], d.sample.map((x) => [`<code>${esc(x.name)}</code>`, esc(x.value)]))}</details>
<div class="banner info">By the release ${esc(d.byRules.release)} business rules: ${esc(d.byRules.rule)}. Expected result <b>${esc(d.byRules.expected)}</b>.</div>`;
  }
  if (r) {
    const ok = r.status === 'passed';
    const rows = r.checks.map((x) => [esc(x.label), esc(x.expected), esc(x.actual), x.match ? pill('match', 'passed') : pill('differs', 'failed')]);
    html += `<h3 class="panel-title">Result</h3>
<div class="lab-verdict ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Passed: the code works as expected' : 'Failed: the code does not work as expected'}</b><span>${esc(r.testCase.title)} · build <code>${esc(r.testCase.build)}</code> · ${r.durationMs} ms</span></div>
<div class="lab-compare"><div><span>Expected</span><b>${esc(r.expected)}</b></div><div class="${ok ? 'ok' : 'bad'}"><span>Actual</span><b>${esc(r.actual)}</b></div></div>
${table(['Response', 'Expected', 'Actual (hotel services)', ''], rows)}
${r.error && r.error.assertion ? `<p class="small">Failing assertion: <code>${esc(r.error.assertion)}</code> (${esc(r.error.location || '')})</p>` : ''}
${r.defect ? `<div class="card defect-card"><h3>Defect raised ${pill(r.defect.severity, 'failed')}</h3><p><b>${esc(r.defect.title)}</b></p>
<p>Expected <b>${esc(r.defect.expected)}</b>, actual <b>${esc(r.defect.actual)}</b>. ${esc(r.defect.cause)}.</p><ol class="small">${r.defect.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
<p class="small muted">Really executed by ${esc(r.execution.tool)} against ${esc(r.execution.sut.name)} at ${fmtTime(r.execution.finishedAt)}.</p>
<details><summary class="small">Playwright script the automation agent wrote (${esc(r.script.file)})</summary><pre class="code">${esc(r.script.code)}</pre></details>`;
  }
  if (!d && !r && !labState.busy) html += '<p class="muted">Write your test case, generate the test data, then run the test agents. The results appear here.</p>';
  return html;
}

function labProblems(el, e) {
  const list = e.details || [];
  document.getElementById('lab-text').classList.toggle('need', list.length > 0);
  el.innerHTML = `<div class="banner err blocked"><b>${esc(e.message)}</b>${list.length ? `<ul>${list.map((p) => `<li>${esc(p.message)}</li>`).join('')}</ul>` : ''}
<p class="small">For example: "${esc(LAB.demos[0].text)}"</p></div>`;
}

async function viewLab(params) {
  setTitle('Test Lab');
  if (!LAB) LAB = await api('/api/lab');
  if (params.get('demo') && LAB.demos.some((x) => x.id === params.get('demo'))) {
    if (labState.demo !== params.get('demo')) Object.assign(labState, { data: null, result: null, text: null });
    labState.demo = params.get('demo');
  }
  const demo = LAB.demos.find((x) => x.id === labState.demo);
  if (labState.text == null) labState.text = demo.text;
  $view.innerHTML = `<section class="hero small-hero"><div class="eyebrow">Test Lab</div><h1>Write a test in plain English, generate its data, run the agents</h1><p>Describe a guest booking and what should happen. The platform builds matching test data from the hotel data dictionary, runs it against the hotel booking services and shows the expected response against the actual one.</p></section>
<div class="run-layout">
<div class="panel">
  <div class="step-block">
    <h3><span class="step-num">1</span>Pick a demo</h3>
    ${LAB.demos.map((x) => `<label class="mode-option"><input type="radio" name="lab-demo" value="${esc(x.id)}" ${x.id === labState.demo ? 'checked' : ''}><span><b>${esc(x.name)}</b><span class="muted">${esc(x.summary)}</span></span></label>`).join('')}
  </div>
  <div class="step-block">
    <h3><span class="step-num">2</span>Write the test case</h3>
    <p class="hint">In plain English: the booking (destination and nights, a cancellation and how far ahead, a confirmation resend or a cart) and, if you like, what should happen. Anything you leave out comes from a standard booking on the latest release (2.0).</p>
    <label class="field">Test case<textarea id="lab-text" rows="4">${esc(labState.text)}</textarea></label>
    <details class="lab-examples"><summary class="small">More examples</summary>${LAB.examples.map((x) => `<button type="button" class="linkish lab-example">${esc(x)}</button>`).join('')}</details>
  </div>
  <div class="step-block">
    <h3><span class="step-num">3</span>Generate test data</h3>
    <p class="hint">Builds the full booking from the hotel data dictionary and works out the expected result from the rules.</p>
    <div class="row"><button class="btn secondary" id="lab-gen">Generate test data</button></div>
  </div>
  <div class="step-block">
    <h3><span class="step-num">4</span>Run the test agents</h3>
    <p class="hint">Writes the Playwright script and really runs it against the six hotel services of the chosen release.</p>
    <div class="row"><button class="btn" id="lab-run">Run the test agents</button></div>
  </div>
  <div id="lab-msg"></div>
</div>
<div class="panel wide" id="lab-out">${labOutput()}</div>
</div>`;
  const out = () => { document.getElementById('lab-out').innerHTML = labOutput(); };
  const msg = document.getElementById('lab-msg');
  $view.querySelectorAll('input[name=lab-demo]').forEach((el) => el.onchange = () => { location.hash = `#/lab?demo=${el.value}`; });
  const box = document.getElementById('lab-text');
  box.addEventListener('input', () => {
    labState.text = box.value;
    box.classList.remove('need');
    if (labState.data || labState.result) { Object.assign(labState, { data: null, result: null }); out(); }
  });
  $view.querySelectorAll('.lab-example').forEach((el) => el.onclick = () => {
    Object.assign(labState, { text: el.textContent, data: null, result: null });
    box.value = labState.text;
    box.classList.remove('need');
    msg.innerHTML = '';
    out();
  });
  const gen = async () => {
    labState.data = null;
    labState.data = await api('/api/lab/data', { method: 'POST', body: { text: labState.text } });
    return labState.data;
  };
  document.getElementById('lab-gen').onclick = async () => {
    msg.innerHTML = '';
    labState.result = null;
    try { await gen(); } catch (e) { labProblems(msg, e); }
    out();
  };
  document.getElementById('lab-run').onclick = async (ev) => {
    msg.innerHTML = '';
    ev.target.disabled = true;
    try {
      await gen();
      labState.result = null;
      labState.busy = 'The automation agent is writing the script and the execution agent is running it...';
      out();
      labState.result = await api('/api/lab/run', { method: 'POST', body: { text: labState.text } });
    } catch (e) { labProblems(msg, e); }
    labState.busy = '';
    ev.target.disabled = false;
    out();
    if (labState.result) document.getElementById('lab-out').scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
}

/* ---------------- router ---------------- */
let lastPath = null;
/* ---------- EQE PoC (Stages 1-3): Run, By Jira item, Compare, Gaps, Governance ---------- */
const EQE_TABS = [['run', 'Run'], ['jira', 'By Jira item'], ['compare', 'Compare report'], ['gaps', 'Gap register'], ['trail', 'Governance']];
const eqeBadge = (met) => (met === null || met === undefined ? pill('pending', 'pending') : met ? pill('met', 'passed') : pill('not met', 'failed'));
const eqeVal = (t) => (t.value === null || t.value === undefined ? '-' : `${esc(t.value)}${esc(t.unit)}`);
const eqeFile = (s, f) => `<a href="/api/eqe/file?path=${encodeURIComponent(f)}" target="_blank">${esc(f.split('/').pop())}</a>`;
function eqeStageBar(stages) {
  return `<ol class="eqe-stages">${stages.map((s) => `<li class="${s.active ? 'on' : 'soon'}"><span class="eqe-n">${s.n}</span><b>${esc(s.name)}</b><span class="eqe-s">${esc(s.status)}</span></li>`).join('')}</ol>`;
}
function eqeThresholds(ts) {
  return table(['Metric', 'Target', 'Value', 'Status', 'How measured'], ts.map((t) => [`<b>${esc(t.metric)}</b>`, esc(t.target), eqeVal(t), eqeBadge(t.met), `<span class="small">${esc(t.how)}</span>`]));
}
function eqeRun(s) {
  const files = s.files.filter((f) => !f.includes('/scaffolds/'));
  const scaffolds = s.files.filter((f) => f.includes('/scaffolds/'));
  const f = s.uc2.flake;
  return `<div class="grid2"><div class="card"><h3>UC1 · Initiative &rarr; approved test design</h3><p class="small">${esc(s.initiative.initiative)} ${esc(s.initiative.title || '')} · week-1 epic <b>${esc(s.epic)}</b> · ${s.uc1.cases.length} cases, ${s.uc1.scenarios.length} scenarios, ${s.uc1.journeys.length} guest journeys</p>${eqeThresholds(s.uc1.thresholds)}</div>
<div class="card"><h3>UC2 · Approved cases &rarr; Playwright automation</h3><p class="small">${s.uc2.specs.length} specs on demo-booking · Page Objects: ${esc(s.uc2.pageObjects.map((p) => p.class).join(', '))} · flake ${f ? `${esc(f.flakeRate)}% over ${f.runs.length} runs` : 'not run'}</p>${eqeThresholds(s.uc2.thresholds)}</div></div>
<h2>Artifacts</h2><div class="card">${table(['Artifact', 'Path'], files.map((x) => [eqeFile(s, x), `<code class="small">${esc(x)}</code>`]))}<p class="small">Design scaffolds (${scaffolds.length}): ${scaffolds.map((x) => eqeFile(s, x)).join(' · ')}</p></div>
<h2>Automated specs (UC2)</h2>${table(['Case', 'Title', 'Spec', 'Traces', 'Test data', 'Page Objects', 'Raw locators', '5-run outcomes'], s.uc2.specs.map((x) => [esc(x.case), esc(x.title), `<code class="small">${esc(x.spec)}</code>`, esc(x.traces.join(', ')), esc(x.data.join(', ')), esc(x.pageObjects.join(', ')), x.rawLocators, esc((x.flake || []).join(' · '))]))}`;
}
function eqeJira(s, params) {
  const key = params.get('key') || s.uc1.jiraItems[0].key;
  const items = s.uc1.jiraItems;
  const reqs = s.uc1.coverage.filter((r) => r.story === key);
  const cases = s.uc1.cases.filter((c) => c.story === key || c.traces.some((t) => reqs.some((r) => r.id === t.id)));
  const spec = (id) => s.uc2.specs.find((x) => x.case === id);
  const gaps = s.uc1.gaps.filter((g) => String(g.ref).includes(key));
  return `<div class="row">${items.map((i) => `<a class="btn ${i.key === key ? '' : 'secondary'}" href="#/eqe?tab=jira&key=${esc(i.key)}">${esc(i.key)}</a>`).join('')}</div>
<div class="card"><h3>${esc(key)} · ${esc((items.find((i) => i.key === key) || {}).summary)}</h3>
<h4>Requirements (verbatim Jira) &rarr; cases</h4>${table(['ID', 'Type', 'Requirement', 'Risk', 'Cases', 'Status'], reqs.map((r) => [esc(r.id), esc(r.kind), esc(r.text), esc(r.risk), esc(r.cases.join(', ')), pill(r.status, r.status === 'covered' ? 'passed' : 'pending')]))}
<h4>Test cases &rarr; automation</h4>${table(['Case', 'Type', 'Priority', 'Title', 'Traces (source quote)', 'Playwright spec'], cases.map((c) => [esc(c.id), esc(c.type), esc(c.priority), esc(c.title), c.traces.map((t) => `<b>${esc(t.id)}</b> <span class="small">"${esc(t.quote)}"</span>`).join('<br>'), spec(c.id) ? `<code class="small">${esc(spec(c.id).spec)}</code>` : '<span class="muted">design only</span>']))}
<h4>Gaps</h4>${table(['Gap', 'Category', 'Summary', 'Assumption', 'Owner', 'Status'], gaps.map((g) => [esc(g.id), esc(g.g), esc(g.summary), esc(g.assumption), esc(g.owner), esc(g.status)]))}</div>`;
}
function eqeCompare(s) {
  const g = s.uc1.golden;
  const q = s.uc1.quality;
  const goldenHtml = g.status === 'compared'
    ? `<p>Golden set by <b>${esc(g.authoredBy)}</b>: recall <b>${esc(g.recall)}%</b> (${g.matched}/${g.goldenCases}) · Devin-only: ${esc(g.devinOnly.join(', ') || 'none')} · missed requirements: ${esc(g.missedRequirements.join(', ') || 'none')}</p>${table(['Golden case', 'Title', 'Traces', 'Best Devin match'], g.matches.map((m) => [esc(m.golden), esc(m.title), esc(m.traces.join(', ')), m.match ? `${esc(m.match.case)} (Jaccard ${m.match.score})` : pill('no match', 'failed')]))}`
    : `<div class="banner info"><b>Golden set pending.</b> ${esc(g.note)} Add <code>eqe-poc/golden-set/${esc(s.epic)}.golden.json</code> (template in golden-set/) and rebuild.</div>`;
  return `<div class="card"><h3>Devin design vs human golden set</h3>${goldenHtml}</div>
<div class="card"><h3>Automated quality checks</h3><p>Grounding: <b>${s.uc1.grounding.ungrounded.length}</b> of ${s.uc1.grounding.claims} source claims not found verbatim in Jira.</p>
${table(['Story', 'Positive', 'Negative', 'Missing negative'], q.negatives.map((n) => [esc(n.story), n.positive, n.negative, n.missingNegative ? pill('yes', 'failed') : 'no']))}
<h4>Duplicates (${q.duplicates.length}) and overlaps for QE-lead review (${q.overlaps.length})</h4>${table(['Case A', 'Case B', 'Shared requirements', 'Note'], [...q.duplicates.map((d) => [esc(d.a), esc(d.b), esc(d.shared.join(', ')), pill('duplicate', 'failed')]), ...q.overlaps.map((o) => [esc(o.a), esc(o.b), esc(o.shared.join(', ')), `<span class="small">${esc(o.note)}</span>`])])}</div>`;
}
function eqeGaps(s) {
  return table(['Gap', 'Category', 'Reference', 'Summary', 'Working assumption', 'Owner', 'Status'], s.uc1.gaps.map((g) => [esc(g.id), esc(g.g), esc(g.ref), esc(g.summary), esc(g.assumption), esc(g.owner), esc(g.status)]));
}
function eqeTrail(s) {
  return `<div class="card"><h3>Record a gate decision (human reviewer)</h3><p class="small">Devin only submits. Decisions, reviewer names and measured review minutes come from people and feed the review-time and approval-to-scale metrics.</p>
<div class="row"><select id="eqe-gate">${s.gates.map((g) => `<option>${esc(g)}</option>`).join('')}</select><select id="eqe-decision">${s.decisions.map((d) => `<option>${esc(d)}</option>`).join('')}</select>
<input id="eqe-approver" placeholder="Reviewer name" aria-label="Reviewer name"><input id="eqe-minutes" type="number" min="1" placeholder="Review minutes" aria-label="Review minutes"><input id="eqe-note" placeholder="Note (optional)" aria-label="Note"><button class="btn" id="eqe-save">Record decision</button></div><div id="eqe-msg"></div></div>
${table(['ID', 'When', 'Gate', 'Subject', 'Decision', 'By', 'Review min', 'Note'], s.trail.map((e) => [esc(e.id), fmtTime(e.at), esc(e.gate), esc(e.subject), pill(e.decision, e.decision === 'approved' ? 'passed' : e.decision === 'submitted' ? 'pending' : 'failed'), esc(e.by), esc(e.reviewMinutes ?? '-'), esc(e.note || '')]))}`;
}
async function viewEqe(params) {
  setTitle('EQE PoC');
  const tab = params.get('tab') || 'run';
  const s = await api('/api/eqe');
  const body = { run: eqeRun, jira: eqeJira, compare: eqeCompare, gaps: eqeGaps, trail: eqeTrail }[tab] || eqeRun;
  $view.innerHTML = `<div class="row"><h1 style="margin:0">EQE PoC · Stages 1-3</h1><span class="small muted">Jira: ${esc(s.jira.label)} · synthetic app demo-booking · built ${fmtTime(s.generatedAt)}</span></div>
${eqeStageBar(s.stages)}<nav class="eqe-tabs">${EQE_TABS.map(([id, label]) => `<a href="#/eqe?tab=${id}" class="${id === tab ? 'active' : ''}">${esc(label)}</a>`).join('')}</nav>${body(s, params)}`;
  const save = document.getElementById('eqe-save');
  if (save) save.onclick = async () => {
    const v = (id) => document.getElementById(id).value;
    const msg = document.getElementById('eqe-msg');
    try {
      await api('/api/eqe/approvals', { method: 'POST', body: { gate: v('eqe-gate'), decision: v('eqe-decision'), approver: v('eqe-approver'), reviewMinutes: Number(v('eqe-minutes')), note: v('eqe-note') } });
      route();
    } catch (e) { msg.innerHTML = `<div class="banner err">${esc(e.message)}${e.details ? `<ul>${e.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>`; }
  };
}

async function route() {
  clearTimeout(pollTimer);
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  const params = new URLSearchParams(query || '');
  const parts = path.split('/');
  activeNav(parts[0] === 'cycle' ? 'cycles' : parts[0]);
  try {
    if (!META) await loadMeta();
    switch (parts[0]) {
      case '': return await viewHome();
      case 'run': return await viewRun(params);
      case 'lab': return await viewLab(params);
      case 'cycles': return await viewCycles();
      case 'cycle': return await viewCycle(parts[1], params);
      case 'testcases': return await pickCycle(params, 'Test cases', testCasesView, (c) => ['completed', 'awaiting-merge'].includes(c.status));
      case 'scripts': return await pickCycle(params, 'Scripts', scriptsView, (c) => ['completed', 'awaiting-merge'].includes(c.status));
      case 'execution': return await pickCycle(params, 'Execution', executionView, (c) => c.status === 'completed');
      case 'defects': return await pickCycle(params, 'Defects', defectsView, (c) => c.status === 'completed');
      case 'eqe': return await viewEqe(params);
      case 'reporting': return await viewReporting(params);
      case 'reports': location.hash = '#/reporting'; return undefined;
      case 'compare': return await viewCompare(params);
      case 'baselines': return await viewBaselines();
      default: $view.innerHTML = '<p>Not found.</p>';
    }
  } catch (e) {
    $view.innerHTML = `<div class="banner err">${esc(e.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);
route();
