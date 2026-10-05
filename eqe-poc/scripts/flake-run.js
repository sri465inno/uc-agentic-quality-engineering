'use strict';
// UC2 flake check: runs the Playwright suite N times (default 5) back to back against demo-booking and aggregates
// the real per-test outcomes into evidence/uc2/flake-report.json. Usage: node scripts/flake-run.js [runs]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNS_DIR = path.join(ROOT, 'evidence', 'uc2', 'runs');

function collect(suite, out = []) {
  for (const s of suite.suites || []) collect(s, out);
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const last = (t.results || []).slice(-1)[0] || {};
      out.push({ file: spec.file, title: spec.title, status: last.status || 'unknown', durationMs: last.duration || 0, error: last.error ? String(last.error.message || '').split('\n')[0].slice(0, 200) : '' });
    }
  }
  return out;
}

function aggregate(runs) {
  const byTest = new Map();
  for (const r of runs) for (const t of r.tests) {
    if (!byTest.has(t.title)) byTest.set(t.title, { title: t.title, file: t.file, outcomes: [] });
    byTest.get(t.title).outcomes.push(t.status);
  }
  const tests = [...byTest.values()].map((t) => ({ ...t, passed: t.outcomes.filter((s) => s === 'passed').length, failed: t.outcomes.filter((s) => s !== 'passed' && s !== 'skipped').length }));
  const total = tests.reduce((n, t) => n + t.outcomes.length, 0);
  const failed = tests.reduce((n, t) => n + t.failed, 0);
  return {
    tests,
    totalExecutions: total,
    failedExecutions: failed,
    flakeRate: total ? Math.round((failed / total) * 1000) / 10 : null,
    inconsistentTests: tests.filter((t) => t.passed && t.failed).map((t) => t.title),
    consistentlyFailing: tests.filter((t) => !t.passed).map((t) => t.title),
  };
}

function main() {
  const n = Number(process.argv[2] || 5);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const runs = [];
  for (let i = 1; i <= n; i += 1) {
    const report = path.join(RUNS_DIR, `tmp-run-${i}.json`);
    const started = new Date().toISOString();
    const r = spawnSync('npx', ['playwright', 'test', '--reporter=json'], { cwd: ROOT, env: { ...process.env, EQE_JSON_REPORT: report, PLAYWRIGHT_JSON_OUTPUT_NAME: report }, encoding: 'utf8' });
    const json = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : JSON.parse(r.stdout || '{}');
    const tests = collect(json);
    const run = { run: i, startedAt: started, exitCode: r.status, durationMs: json.stats ? Math.round(json.stats.duration) : null, tests };
    fs.writeFileSync(path.join(RUNS_DIR, `run-${i}.json`), `${JSON.stringify(run, null, 2)}\n`);
    fs.rmSync(report, { force: true });
    runs.push(run);
    console.log(`run ${i}/${n}: ${tests.filter((t) => t.status === 'passed').length}/${tests.length} passed (exit ${r.status})`);
  }
  const report = { generatedAt: new Date().toISOString(), environment: 'demo-booking (synthetic, local, Stage-equivalent)', browser: 'chromium', retries: 0, threshold: '< 5%', runs: runs.map(({ tests, ...r }) => r), ...aggregate(runs) };
  report.verdict = report.runs.length >= 5 && report.flakeRate < 5 ? 'within threshold' : 'refine';
  fs.writeFileSync(path.join(ROOT, 'evidence', 'uc2', 'flake-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const md = [`# UC2 five-run flake report`, '', `Generated ${report.generatedAt} · ${report.environment} · ${report.browser} · retries ${report.retries}`, '',
    `**Flake rate: ${report.flakeRate}%** (${report.failedExecutions}/${report.totalExecutions} failed executions; threshold ${report.threshold}) — ${report.verdict}`, '',
    '| Test | ' + report.runs.map((r) => `Run ${r.run}`).join(' | ') + ' |', '|---|' + report.runs.map(() => '---').join('|') + '|',
    ...report.tests.map((t) => `| ${t.title} | ${t.outcomes.join(' | ')} |`), '',
    `Inconsistent tests: ${report.inconsistentTests.join(', ') || 'none'}`, `Consistently failing: ${report.consistentlyFailing.join(', ') || 'none'}`, ''];
  fs.writeFileSync(path.join(ROOT, 'evidence', 'uc2', 'flake-report.md'), md.join('\n'));
  console.log(`flake rate ${report.flakeRate}% over ${n} runs -> ${report.verdict}`);
}

if (require.main === module) main();
module.exports = { aggregate, collect };
