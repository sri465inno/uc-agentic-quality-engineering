'use strict';
// Prints the epic, its stories and their verbatim ACs / business rules: node scripts/jira.js AQPI-2
const { loadEpic } = require('../src/jira');

loadEpic(process.argv[2] || 'AQPI-2').then((e) => {
  console.log(`Mode: ${e.label} (${e.site})`);
  for (const it of [e.epic, ...e.stories]) {
    console.log(`\n${it.key} ${it.summary}`);
    for (const x of [...it.acceptanceCriteria, ...it.businessRules]) console.log(`  ${x.id}: ${x.text}`);
  }
}).catch((err) => { console.error(err.message); process.exit(1); });
