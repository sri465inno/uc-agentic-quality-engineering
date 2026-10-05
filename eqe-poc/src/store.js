'use strict';
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) { this.dir = dir; this.runsDir = path.join(dir, 'runs'); fs.mkdirSync(this.runsDir, { recursive: true }); }
  runDir(id) { return path.join(this.runsDir, id); }
  artifactsDir(id) { const d = path.join(this.runDir(id), 'artifacts'); fs.mkdirSync(d, { recursive: true }); return d; }
  nextId() {
    const n = this.list().reduce((m, r) => Math.max(m, Number(r.id.split('-')[1]) || 0), 0) + 1;
    return `RUN-${n}`;
  }
  save(run) { fs.mkdirSync(this.runDir(run.id), { recursive: true }); run.updatedAt = new Date().toISOString(); fs.writeFileSync(path.join(this.runDir(run.id), 'run.json'), JSON.stringify(run, null, 2)); return run; }
  get(id) {
    if (!/^RUN-\d+$/.test(id)) return null;
    const f = path.join(this.runDir(id), 'run.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  }
  list() {
    return fs.readdirSync(this.runsDir).filter((d) => /^RUN-\d+$/.test(d)).map((d) => this.get(d)).filter(Boolean)
      .sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
  }
}
module.exports = { Store };
