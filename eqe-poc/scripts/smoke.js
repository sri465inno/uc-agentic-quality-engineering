'use strict';
// End-to-end API smoke: Stage 1 -> scope gate -> Stage 2 -> case review -> Stage 3 (5 runs) -> code gate.
const B = process.env.BASE || 'http://127.0.0.1:3000';
const j = async (m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.json();
  if (!r.ok) throw new Error(`${p} ${r.status} ${JSON.stringify(t)}`);
  return t;
};
(async () => {
  const lead = { actor: 'Smoke QE lead', role: 'QE lead' };
  const rev = { actor: 'Smoke automation reviewer', role: 'Automation reviewer' };
  let r = await j('POST', '/api/runs', { initiative: 'AQPI-1', epics: ['AQPI-2'] });
  const id = r.id;
  console.log(id, r.mode.kind, JSON.stringify(r.stage1.summary));
  await j('POST', `/api/runs/${id}/gates/scope/start`, lead);
  r = await j('POST', `/api/runs/${id}/gates/scope/decision`, { ...lead, decision: 'approved' });
  const g = r.stage2.golden['AQPI-2'];
  console.log('stage2', r.stage2.cases.length, 'cases; golden recall', g.recall, 'missed', g.missed.map((m) => m.id).join(','));
  await j('POST', `/api/runs/${id}/gates/cases/start`, lead);
  for (const c of r.stage2.cases) r = await j('POST', `/api/runs/${id}/cases/${c.id}/verdict`, { actor: lead.actor, verdict: 'accepted' });
  r = await j('POST', `/api/runs/${id}/gates/cases/decision`, { ...lead, decision: 'approved' });
  console.log('uc1', JSON.stringify(r.metrics.uc1.checks));
  r = await j('POST', `/api/runs/${id}/stage3`, { actor: rev.actor });
  console.log('stage3 cases', r.stage3.caseIds.join(','));
  while (r.stage3.status === 'running') { await new Promise((s) => setTimeout(s, 2000)); r = await j('GET', `/api/runs/${id}`); }
  console.log('stage3', r.stage3.status, r.stage3.runs.length, 'runs; uc2', JSON.stringify(r.metrics.uc2.checks));
  await j('POST', `/api/runs/${id}/gates/code/start`, rev);
  r = await j('POST', `/api/runs/${id}/gates/code/decision`, { ...rev, decision: 'approved' });
  console.log(r.status, JSON.stringify(r.stages));
  console.log(r.artifacts.map((a) => a.name).filter((n) => !n.includes('/')).join(' | '));
  if (r.status !== 'complete' || r.stage3.status !== 'complete') process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
