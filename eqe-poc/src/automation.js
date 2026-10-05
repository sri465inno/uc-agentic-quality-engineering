'use strict';
// UC2 measurement: case -> spec mapping, Page Object reuse, raw-locator check, test-data mapping, flake and review time.
const fs = require('fs');
const path = require('path');
const { readJson, pct, reviewMinutes, ROOT } = require('./design');

const LOCATOR_CALL = /\b(page|this\.page)\.(locator|getBy\w+|\$\$?)\(/;

function readSpecs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.spec.ts')).sort().map((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    return {
      file: f,
      case: (src.match(/@case\s+(\S+)/) || [])[1] || null,
      traces: ((src.match(/@traces\s+([^\n]+)/) || [])[1] || '').trim().split(/[\s,]+/).filter(Boolean),
      dataKeys: [...src.matchAll(/(?:searchData|playbook)\('([^']+)'\)/g)].map((m) => m[1]),
      pageObjects: [...src.matchAll(/import \{ (\w+) \} from '\.\.\/\.\.\/pages\/([\w-]+)\//g)].map((m) => `${m[2]}/${m[1]}`),
      rawLocators: src.split('\n').map((l, i) => ({ line: i + 1, text: l.trim() })).filter((l) => LOCATOR_CALL.test(l.text)),
      lines: src.split('\n').length,
    };
  });
}

function readPageObjects(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort().map((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    return { file: f, class: (src.match(/export class (\w+)/) || [])[1], methods: [...src.matchAll(/^\s+(?:async )?(\w+)\([^)]*\)(?:: [^{]+)? \{/gm)].map((m) => m[1]).filter((m) => m !== 'constructor') };
  });
}

function analyseAutomation({ root = ROOT, app = 'demo-booking', initiative = 'AQPI-1', epic = 'AQPI-2' } = {}) {
  const stage2 = readJson(path.join(root, 'design', initiative, epic, 'stage-2.json'));
  const playbook = readJson(path.join(root, 'test-data', `${app}.playbook.json`));
  const trail = readJson(path.join(root, 'evidence', 'governance-trail.json'), { entries: [] });
  const flake = readJson(path.join(root, 'evidence', 'uc2', 'flake-report.json'), null);
  const specs = readSpecs(path.join(root, 'tests', app));
  const pageObjects = readPageObjects(path.join(root, 'pages', app));
  const mapping = specs.map((s) => {
    const c = stage2.cases.find((x) => x.id === s.case);
    const needed = c ? c.data : [];
    const data = needed.map((k) => ({ key: k, inPlaybook: Object.prototype.hasOwnProperty.call(playbook.data, k), usedBySpec: s.dataKeys.includes(k) }));
    const tracesMatch = !!c && c.traces.every((t) => s.traces.includes(t.id));
    return { ...s, title: c ? c.title : '(case not found in stage-2.json)', designed: !!c, tracesMatch, data };
  });
  const dataRefs = mapping.flatMap((m) => m.data);
  const mapped = dataRefs.filter((d) => d.inPlaybook && d.usedBySpec).length;
  const review = reviewMinutes(trail, 'UC2-CODE-REVIEW');
  const approval = (trail.entries || []).filter((e) => e.gate === 'UC2-GATE-SCALE').slice(-1)[0] || null;
  const thresholds = [
    { metric: 'Test data mapped', target: '>= 85%', value: pct(mapped, dataRefs.length), unit: '%', met: dataRefs.length ? pct(mapped, dataRefs.length) >= 85 : null, how: `${mapped}/${dataRefs.length} test-data references of the automated cases resolve to playbook keys used by the spec` },
    { metric: 'Review time per spec', target: '< 25 min', value: review, unit: 'min', met: review === null ? null : review < 25, how: review === null ? 'Not yet measured: recorded by the code reviewer at gate UC2-CODE-REVIEW' : 'Recorded by the reviewer in the governance trail' },
    { metric: 'Flake over 5 runs', target: '< 5%', value: flake ? flake.flakeRate : null, unit: '%', met: flake ? flake.runs.length >= 5 && flake.flakeRate < 5 : null, how: flake ? `${flake.failedExecutions}/${flake.totalExecutions} failed executions over ${flake.runs.length} consecutive runs; ${flake.inconsistentTests.length} test(s) with inconsistent outcomes` : 'Not yet run: npm run flake' },
    { metric: 'Raw locators in specs (G6)', target: '0', value: mapping.reduce((n, m) => n + m.rawLocators.length, 0), unit: '', met: mapping.every((m) => !m.rawLocators.length), how: 'Static check: specs may only use Page Objects' },
    { metric: 'Human code approval to scale', target: 'approved', value: approval ? approval.decision : 'pending', unit: '', met: approval && approval.decision !== 'submitted' ? approval.decision === 'approved' : null, how: 'Governance trail gate UC2-GATE-SCALE' },
  ];
  return { app, epic, specs: mapping, pageObjects, playbookKeys: Object.keys(playbook.data), playbook, flake, thresholds, approvedCases: stage2.cases.length };
}

module.exports = { analyseAutomation, readSpecs, readPageObjects };
