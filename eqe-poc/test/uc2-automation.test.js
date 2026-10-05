'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyseAutomation, readSpecs } = require('../src/automation');
const { aggregate } = require('../scripts/flake-run');

test('UC2: every spec maps to a designed case, its traces and playbook data, via Page Objects only', () => {
  const u = analyseAutomation();
  assert.equal(u.specs.length, 3);
  for (const s of u.specs) {
    assert.ok(s.designed, s.file);
    assert.ok(s.tracesMatch, s.file);
    assert.equal(s.rawLocators.length, 0, s.file);
    assert.ok(s.pageObjects.includes('demo-booking/SearchPage'), s.file);
    assert.ok(s.data.every((d) => d.inPlaybook && d.usedBySpec), s.file);
  }
});

test('raw-locator check catches page.locator / page.getBy* in a spec (G6)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eqe-spec-'));
  fs.writeFileSync(path.join(dir, 'x.spec.ts'), "// @case TC-X  @traces A-1\nawait page.locator('#q').fill('a');\nawait search.submit();\n");
  const [s] = readSpecs(dir);
  assert.deepEqual(s.rawLocators.map((l) => l.line), [2]);
});

test('flake aggregation counts failed executions and inconsistent tests', () => {
  const run = (st) => ({ tests: [{ title: 'A', file: 'a', status: 'passed' }, { title: 'B', file: 'b', status: st }] });
  const r = aggregate([run('passed'), run('failed'), run('passed'), run('passed'), run('passed')]);
  assert.equal(r.totalExecutions, 10);
  assert.equal(r.failedExecutions, 1);
  assert.equal(r.flakeRate, 10);
  assert.deepEqual(r.inconsistentTests, ['B']);
});
