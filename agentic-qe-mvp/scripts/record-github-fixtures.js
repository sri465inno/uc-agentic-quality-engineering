'use strict';
// Records the demo branches (commission engine, hotel booking platform, hotel API endpoints) from GitHub (shallow git clone) into fixtures/github/<dir>
// in GitHub REST API shapes (branch, contents, compare), so the MVP also runs offline.
// Usage: node scripts/record-github-fixtures.js [branch ...]   (default: every known branch)
const fs = require('fs');
const path = require('path');
const { pullSnapshot, BRANCHES: CODE_BRANCHES, SOURCE } = require('../src/connectors/codebase');
const { API_BRANCHES } = require('../src/connectors/api');

const BRANCHES = { ...CODE_BRANCHES, ...API_BRANCHES };

const ROOT = path.join(__dirname, '..', 'fixtures', 'github');
const API = `https://api.github.com/repos/${SOURCE.fullName}`;
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\n') + '\n';
const write = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n'); };

async function record(branchName, config) {
  const { dir, compareWith } = config;
  const snap = await pullSnapshot(branchName, { config });
  const out = path.join(ROOT, dir);
  fs.rmSync(out, { recursive: true, force: true });
  write(path.join(out, 'branch.json'), {
    name: branchName,
    commit: { sha: snap.commit, url: `${API}/commits/${snap.commit}`, html_url: `${SOURCE.htmlUrl}/commit/${snap.commit}`, commit: { message: snap.commitMessage } },
    _links: { self: `${API}/branches/${encodeURIComponent(branchName)}`, html: `${SOURCE.htmlUrl}/tree/${branchName}` },
    protected: false,
    _recorded: { at: snap.pulledAt, with: `git clone --depth 1 --branch ${branchName} ${SOURCE.cloneUrl}` },
  });
  for (const f of snap.files) {
    write(path.join(out, 'contents', `${f.path}.json`), {
      type: 'file', encoding: 'base64', size: Buffer.byteLength(f.text), name: path.basename(f.path), path: f.path, sha: f.sha,
      url: `${API}/contents/${f.path}?ref=${encodeURIComponent(branchName)}`, html_url: `${SOURCE.htmlUrl}/blob/${snap.commit}/${f.path}`,
      download_url: `https://raw.githubusercontent.com/${SOURCE.fullName}/${snap.commit}/${f.path}`, content: b64(f.text),
    });
  }
  if (compareWith && snap.compare) {
    write(path.join(out, 'compare.json'), {
      url: `${API}/compare/${compareWith}...${branchName}`, status: 'ahead', ahead_by: 1, behind_by: 0,
      base_commit: { sha: snap.compare.base }, files: snap.compare.files.map((f) => ({ filename: f.filename, status: f.status })),
    });
  }
  console.log(`${branchName} @ ${snap.commit.slice(0, 7)}: ${snap.files.length} files -> fixtures/github/${dir}`);
}

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BRANCHES);
  for (const name of names) {
    if (!BRANCHES[name]) throw new Error(`Unknown branch "${name}" (known: ${Object.keys(BRANCHES).join(', ')})`);
    await record(name, BRANCHES[name]);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
