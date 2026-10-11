'use strict';
// Cycle comparison: computed from the persisted artifacts of two cycles.
const { APP_TITLE, esc, table, kv, CSS } = require('./report');

function diffBy(listA, listB, keyFn, sameFn) {
  const a = new Map(listA.map((x) => [keyFn(x), x]));
  const b = new Map(listB.map((x) => [keyFn(x), x]));
  const out = { added: [], changed: [], unchanged: [], removed: [] };
  for (const [k, x] of b) {
    if (!a.has(k)) out.added.push(k);
    else if (sameFn(a.get(k), x)) out.unchanged.push(k);
    else out.changed.push(k);
  }
  for (const k of a.keys()) if (!b.has(k)) out.removed.push(k);
  return out;
}

function compareCycles(A, B) {
  const aa = A.artifacts;
  const bb = B.artifacts;
  const requirements = diffBy(aa.requirements, bb.requirements, (r) => r.id, (x, y) => x.text === y.text && x.version === y.version);
  const testCases = diffBy(aa.testCases, bb.testCases, (t) => t.key, (x, y) => x.version === y.version && x.name === y.name && x.expected === y.expected && x.testData === y.testData);
  const scripts = diffBy(aa.scripts, bb.scripts, (s) => s.file, (x, y) => x.code === y.code);
  const sum = (c) => c.artifacts.execution?.summary || { executed: 0, passed: 0, failed: 0, passRate: 0 };
  const aDef = aa.defects || [];
  const bDef = bb.defects || [];
  const bKeys = new Set(bDef.map((d) => d.testCaseKey));
  const reqB = new Map(bb.requirements.map((r) => [r.id, r]));
  const changedDetail = requirements.changed.map((id) => {
    const prev = aa.requirements.find((r) => r.id === id);
    return { id, before: prev.text, after: reqB.get(id).text };
  });
  return {
    title: `${APP_TITLE} - Cycle comparison`,
    generatedAt: new Date().toISOString(),
    a: { id: A.id, name: A.name, type: A.type, baselineVersion: A.baselineVersionAfter ?? null },
    b: { id: B.id, name: B.name, type: B.type, baselineVersion: B.baselineVersionAfter ?? null },
    requirements: { ...requirements, changedDetail, countA: aa.requirements.length, countB: bb.requirements.length },
    testCases: { ...testCases, countA: aa.testCases.length, countB: bb.testCases.length },
    scripts: { ...scripts, countA: aa.scripts.length, countB: bb.scripts.length },
    execution: { a: sum(A), b: sum(B), passRateDelta: Math.round((sum(B).passRate - sum(A).passRate) * 10) / 10 },
    defects: {
      a: aDef.map((d) => d.id), b: bDef.map((d) => d.id),
      new: bDef.filter((d) => d.movement === 'new').map((d) => d.id),
      stillOpen: bDef.filter((d) => aDef.some((x) => x.testCaseKey === d.testCaseKey)).map((d) => d.id),
      resolved: aDef.filter((d) => !bKeys.has(d.testCaseKey)).map((d) => d.id),
    },
  };
}

function renderCompareHtml(c) {
  const row = (label, d) => [esc(label), d.countA, d.countB, `<b>${d.added.length}</b> ${esc(d.added.join(', '))}`, `<b>${d.changed.length}</b> ${esc(d.changed.join(', '))}`, `<b>${d.unchanged.length}</b>`];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>${CSS}</style></head><body>
<h1>${esc(c.title)}</h1><p><b>${esc(c.a.name)}</b> (${esc(c.a.id)}) vs <b>${esc(c.b.name)}</b> (${esc(c.b.id)}) &middot; generated ${esc(c.generatedAt)}</p>
<h2>Artifacts</h2>${table(['Artifact', c.a.id, c.b.id, 'Added', 'Changed', 'Unchanged'], [row('Requirements', c.requirements), row('Test cases', c.testCases), row('Automation scripts', c.scripts)])}
<h2>Changed requirements</h2>${table(['ID', `Before (${c.a.id})`, `After (${c.b.id})`], c.requirements.changedDetail.map((d) => [esc(d.id), esc(d.before), esc(d.after)]))}
<h2>Execution</h2>${table(['Metric', c.a.id, c.b.id], ['executed', 'passed', 'failed', 'passRate'].map((k) => [esc(k), c.execution.a[k], c.execution.b[k]]))}<p>Pass-rate movement: <b>${c.execution.passRateDelta > 0 ? '+' : ''}${c.execution.passRateDelta} pts</b></p>
<h2>Defect movement</h2><p>${kv({ [`${c.a.id} defects`]: c.defects.a.join(', ') || 'none', [`${c.b.id} defects`]: c.defects.b.join(', ') || 'none', new: c.defects.new.join(', ') || 'none', 'still open': c.defects.stillOpen.join(', ') || 'none', resolved: c.defects.resolved.join(', ') || 'none' })}</p>
</body></html>`;
}

module.exports = { compareCycles, renderCompareHtml };
