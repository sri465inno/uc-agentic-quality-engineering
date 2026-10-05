'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/server');
const { tmpDir } = require('./helpers');

const EQE = path.join(__dirname, '..', '..', 'eqe-poc');

test('EQE PoC API serves Stage 1-3 artifacts and only accepts complete human gate decisions', async () => {
  const dir = tmpDir('eqe');
  for (const d of ['artifacts', 'evidence']) fs.cpSync(path.join(EQE, d), path.join(dir, d), { recursive: true });
  const { app } = createApp({ dataDir: tmpDir('eqe-data'), env: {}, eqe: { dir, rebuild: false } });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/eqe/approvals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const s = await (await fetch(`${base}/api/eqe`)).json();
    assert.deepEqual(s.stages.map((x) => x.active), [true, true, true, false, false]);
    assert.equal(s.stages[3].status, 'coming soon');
    assert.ok(s.uc1.cases.length >= 12);
    assert.equal(s.uc2.specs.length, 3);
    const html = s.files.find((f) => f.endsWith('-analysis-and-progress.html'));
    assert.match(await (await fetch(`${base}/api/eqe/file?path=${encodeURIComponent(html)}`)).text(), /Quality Engineering at Scale/);
    assert.equal((await fetch(`${base}/api/eqe/file?path=${encodeURIComponent('../package.json')}`)).status, 404);
    const bad = await post({ gate: 'UC1-GATE1', decision: 'approved', approver: 'Devin' });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).details.length, 2);
    const ok = await post({ gate: 'UC1-STAGE2-APPROVAL', decision: 'refine', approver: 'QE Lead', reviewMinutes: 18, note: 'merge TC-07/TC-10' });
    assert.equal(ok.status, 201);
    const trail = JSON.parse(fs.readFileSync(path.join(dir, 'evidence', 'governance-trail.json'), 'utf8'));
    assert.deepEqual(trail.entries.slice(-1)[0].by, 'QE Lead');
  } finally { server.close(); }
});
