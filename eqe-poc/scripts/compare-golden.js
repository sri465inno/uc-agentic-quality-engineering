'use strict';
// Compares Devin's Stage-2 cases with the human golden set: node scripts/compare-golden.js [EPIC]
const fs = require('fs');
const path = require('path');
const { analyseEpic, ROOT } = require('../src/design');

(async () => {
  const epic = process.argv[2] || 'AQPI-2';
  const a = await analyseEpic(epic);
  const out = path.join(ROOT, 'artifacts', 'AQPI-1');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `golden-comparison-${epic}.json`), `${JSON.stringify(a.golden, null, 2)}\n`);
  if (a.golden.status !== 'compared') { console.log(a.golden.note); return; }
  console.log(`Golden recall ${a.golden.recall}% (${a.golden.matched}/${a.golden.goldenCases}); Devin-only: ${a.golden.devinOnly.join(', ') || 'none'}; missed: ${a.golden.missedRequirements.join(', ') || 'none'}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
