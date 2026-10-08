'use strict';
// File-based persistence: cycles, baselines (with version snapshots), artifacts, approvals, reports.
const fs = require('fs');
const path = require('path');
const { EMPTY } = require('./learning');

class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    for (const d of ['cycles', 'baselines', 'runs']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });
    this.metaFile = path.join(dataDir, 'meta.json');
    if (!fs.existsSync(this.metaFile)) this.writeJson(this.metaFile, { nextCycle: 1, nextBaseline: 1, nextDefect: 0 });
    this.learningFile = path.join(dataDir, 'learning.json');
  }

  getLearning() { return this.readJson(this.learningFile) || EMPTY(); }
  saveLearning(m) { this.writeJson(this.learningFile, m); return m; }

  writeJson(file, obj) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, file);
  }

  readJson(file) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  meta() { return this.readJson(this.metaFile); }

  nextId(counter, prefix) {
    const m = this.meta();
    const n = m[counter];
    m[counter] = n + 1;
    this.writeJson(this.metaFile, m);
    return `${prefix}-${n}`;
  }

  bumpDefectCounter(n) {
    const m = this.meta();
    m.nextDefect = Math.max(m.nextDefect, n);
    this.writeJson(this.metaFile, m);
  }

  cycleFile(id) { return path.join(this.dir, 'cycles', `${id}.json`); }
  saveCycle(c) { c.updatedAt = new Date().toISOString(); this.writeJson(this.cycleFile(c.id), c); return c; }
  getCycle(id) { return /^CYC-\d+$/.test(id) ? this.readJson(this.cycleFile(id)) : null; }
  listCycles() {
    return fs.readdirSync(path.join(this.dir, 'cycles')).filter((f) => /^CYC-\d+\.json$/.test(f))
      .map((f) => this.readJson(path.join(this.dir, 'cycles', f)))
      .sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)));
  }

  baselineFile(id, version) { return path.join(this.dir, 'baselines', version ? `${id}.v${version}.json` : `${id}.json`); }
  saveBaseline(b) {
    b.updatedAt = new Date().toISOString();
    this.writeJson(this.baselineFile(b.id, b.version), b);
    this.writeJson(this.baselineFile(b.id), b);
    return b;
  }
  getBaseline(id, version) { return /^BL-\d+$/.test(id) ? this.readJson(this.baselineFile(id, version)) : null; }
  listBaselines() {
    return fs.readdirSync(path.join(this.dir, 'baselines')).filter((f) => /^BL-\d+\.json$/.test(f))
      .map((f) => this.readJson(path.join(this.dir, 'baselines', f)));
  }

  runDir(cycleId) { return path.join(this.dir, 'runs', cycleId); }

  /** Deletes every cycle, baseline, run and the learning memory, and restarts the id counters. */
  reset() {
    for (const d of ['cycles', 'baselines', 'runs']) {
      fs.rmSync(path.join(this.dir, d), { recursive: true, force: true });
      fs.mkdirSync(path.join(this.dir, d), { recursive: true });
    }
    this.writeJson(this.metaFile, { nextCycle: 1, nextBaseline: 1, nextDefect: 0 });
    fs.rmSync(this.learningFile, { force: true });
  }
}

module.exports = { Store };
