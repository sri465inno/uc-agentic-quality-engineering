'use strict';
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) { this.dir = dir; this.runsDir = path.join(dir, 'runs'); fs.mkdirSync(this.runsDir, { recursive: true }); }
  runDir(id) { return path.join(this.runsDir, id); }
  artifactsDir(id) { const d = path.join(this.runDir(id), 'artifacts'); fs.mkdirSync(d, { recursive: true }); return d; }
  /** Reserves the next run ID synchronously by creating its directory, so concurrent creates never share an ID. */
  nextId() {
    let n = fs.readdirSync(this.runsDir).filter((d) => /^RUN-\d+$/.test(d)).reduce((m, d) => Math.max(m, Number(d.split('-')[1])), 0) + 1;
    for (;;) {
      try { fs.mkdirSync(this.runDir(`RUN-${n}`)); return `RUN-${n}`; } catch (e) { if (e.code !== 'EEXIST') throw e; n += 1; }
    }
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
