'use strict';
// Project lint without extra dependencies: node --check on every JS file, a secret scan, and the G6 rule
// (no raw locators in specs; locators live in pages/<app>/ Page Objects).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readSpecs } = require('../src/automation');

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'artifacts', 'runs']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
}(root));

const problems = [];
const js = files.filter((f) => f.endsWith('.js'));
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { problems.push(`${path.relative(root, f)}: ${e.stderr.toString().split('\n')[4] || 'syntax error'}`); }
}
const SECRET = /(api[_-]?token|password|secret)\s*[:=]\s*['"][^'"\s]{8,}['"]|ATATT[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{30,}/i;
for (const f of files.filter((x) => /\.(js|ts|json|md|html)$/.test(x))) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (SECRET.test(l)) problems.push(`${path.relative(root, f)}:${i + 1}: possible hard-coded credential`); });
}
for (const s of readSpecs(path.join(root, 'tests', 'demo-booking'))) {
  for (const l of s.rawLocators) problems.push(`tests/demo-booking/${s.file}:${l.line}: raw locator in spec (G6) - move it to a Page Object`);
  if (!s.case) problems.push(`tests/demo-booking/${s.file}: missing @case tag`);
  if (!s.traces.length) problems.push(`tests/demo-booking/${s.file}: missing @traces tag`);
}
problems.forEach((p) => console.error(p));
console.log(`lint: ${js.length} JS files checked, ${files.length} files scanned, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
