'use strict';
// Prints the UC1 and UC2 success metrics computed from the artifacts and writes evidence/metrics.json.
const fs = require('fs');
const path = require('path');
const { analyseEpic, ROOT } = require('../src/design');
const { analyseAutomation } = require('../src/automation');

const show = (t) => `${t.met === null ? 'PENDING' : t.met ? 'MET    ' : 'NOT MET'}  ${t.metric.padEnd(30)} ${String(t.value ?? '-').padStart(9)}${t.unit}  target ${t.target}  (${t.how})`;

(async () => {
  const epic = process.argv[2] || 'AQPI-2';
  const uc1 = await analyseEpic(epic);
  const uc2 = analyseAutomation({ epic });
  const out = { generatedAt: new Date().toISOString(), jira: uc1.jira, uc1: { epic, thresholds: uc1.thresholds }, uc2: { app: uc2.app, specs: uc2.specs.length, thresholds: uc2.thresholds } };
  fs.writeFileSync(path.join(ROOT, 'evidence', 'metrics.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Jira source: ${uc1.jira.label}\n\nUC1 (${epic})`);
  uc1.thresholds.forEach((t) => console.log(`  ${show(t)}`));
  console.log(`\nUC2 (${uc2.app}, ${uc2.specs.length} specs)`);
  uc2.thresholds.forEach((t) => console.log(`  ${show(t)}`));
})().catch((e) => { console.error(e.message); process.exit(1); });
