'use strict';
// Codebase connector (Node demo branches and the Maven/Java hotel platform). Two sources, same result shape:
//  - live: `git clone` of the demo branch from GitHub (sri465inno/uc-agentic-quality-engineering);
//  - recorded: a snapshot of the same branch stored in GitHub REST API shapes under fixtures/github/<dir>.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'github');
const SOURCE = {
  fullName: 'sri465inno/uc-agentic-quality-engineering',
  htmlUrl: 'https://github.com/sri465inno/uc-agentic-quality-engineering',
  cloneUrl: 'https://github.com/sri465inno/uc-agentic-quality-engineering.git',
};
const DICTIONARY_FILE = /^data-dictionary\/.+\.json$/;
const SNAPSHOT_FILE = (p) => p === 'README.md' || p === 'package.json' || /^src\/.+\.js$/.test(p) || DICTIONARY_FILE.test(p);
// Maven multi-module Java services: build files, main sources and configuration, journey tests and traceability notes.
const JAVA_SNAPSHOT_FILE = (p) => ['README.md', 'TRACEABILITY.md', 'pom.xml'].includes(p) || DICTIONARY_FILE.test(p)
  || /^[\w-]+\/pom\.xml$/.test(p) || /^[\w-]+\/src\/main\/java\/.+\.java$/.test(p)
  || /^[\w-]+\/src\/main\/resources\/[^/]+\.ya?ml$/.test(p) || /^journey-tests\/src\/test\/java\/.+\.java$/.test(p);
const BRANCHES = {
  'demo/commission-engine': { dir: 'commission-engine', compareWith: null, snapshot: SNAPSHOT_FILE },
  'demo/commission-engine-v2': { dir: 'commission-engine-v2', compareWith: 'demo/commission-engine', snapshot: SNAPSHOT_FILE },
  'demo/hotel-booking-platform': { dir: 'hotel-booking-platform', compareWith: null, snapshot: JAVA_SNAPSHOT_FILE },
  'demo/hotel-booking-platform-v2': { dir: 'hotel-booking-platform-v2', compareWith: 'demo/hotel-booking-platform', snapshot: JAVA_SNAPSHOT_FILE },
};
const DEFAULT_BRANCH = 'demo/commission-engine';
const BUILD_FILES = new Set(['package.json', 'pom.xml']);
const STATUS = { A: 'added', M: 'modified', D: 'removed', R: 'renamed' };

const decode = (contents) => Buffer.from(contents.content.replace(/\n/g, ''), contents.encoding || 'base64').toString('utf8');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const blobUrl = (commit, p) => `${SOURCE.htmlUrl}/blob/${commit}/${p}`;

function listFixtureBranches() {
  return Object.keys(BRANCHES);
}

function branchConfig(branchName) {
  const cfg = BRANCHES[branchName];
  if (!cfg) throw new Error(`Unknown codebase branch "${branchName}" (known: ${Object.keys(BRANCHES).join(', ')})`);
  return cfg;
}

function summariseDictionary(file) {
  const d = JSON.parse(file.text);
  const attrs = d.attributes || [];
  return {
    file: file.path, url: file.url, name: d.name, version: d.version,
    attributeCount: attrs.length, groupCount: (d.groups || []).length,
    drivers: attrs.filter((a) => a.commissionDriver || a.driver).map((a) => ({ name: a.name, type: a.type, description: a.description })),
  };
}

const xmlTag = (xml, tag) => (String(xml).replace(/<parent>[\s\S]*?<\/parent>/, '').match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1]?.trim() || null;

function mavenDescription(pom) {
  return xmlTag(pom, 'description') || xmlTag(pom, 'name');
}

/** Maven coordinates, Java release and modules of a multi-module build. */
function mavenBuild(pom, files) {
  const modules = [...String(pom).matchAll(/<module>([^<]+)<\/module>/g)].map((m) => m[1].trim());
  return {
    tool: 'maven', groupId: xmlTag(pom, 'groupId'), artifactId: xmlTag(pom, 'artifactId'), version: xmlTag(pom, 'version'),
    java: xmlTag(pom, 'java.version') || xmlTag(pom, 'maven.compiler.release'),
    springBoot: (String(pom).match(/<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)<\/version>/) || [])[1] || null,
    modules: modules.map((m) => ({ name: m, sources: files.filter((f) => f.path.startsWith(`${m}/`) && f.path.endsWith('.java')).length })),
  };
}

/** Shared shaping of a snapshot (live or recorded) into what the pipeline consumes. */
function shapeCodebase({ branch, commit, commitMessage, files, compare, provenance }) {
  const pkg = files.find((f) => f.path === 'package.json');
  const pom = files.find((f) => f.path === 'pom.xml');
  const dict = files.find((f) => DICTIONARY_FILE.test(f.path));
  return {
    repo: SOURCE.fullName, branch, commit, commitMessage,
    description: pkg ? JSON.parse(pkg.text).description : pom ? mavenDescription(pom.text) : null,
    build: pom ? mavenBuild(pom.text, files) : pkg ? { tool: 'npm', name: JSON.parse(pkg.text).name } : null,
    files: files.filter((f) => !BUILD_FILES.has(path.basename(f.path)) && !DICTIONARY_FILE.test(f.path)).map(({ path: p, url, text }) => ({ path: p, url, text })),
    dataModel: dict ? summariseDictionary(dict) : null,
    dictionary: dict ? JSON.parse(dict.text) : null,
    compare, provenance,
  };
}

/** Loads the recorded snapshot of a branch (GitHub REST API shapes: branch, contents, compare). */
function loadCodebaseFixture(branchName = DEFAULT_BRANCH) {
  const { dir: dirName } = branchConfig(branchName);
  const dir = path.join(FIXTURE_DIR, dirName);
  const branch = readJson(path.join(dir, 'branch.json'));
  const contentsDir = path.join(dir, 'contents');
  const contentFiles = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) contentFiles.push(p);
    }
  }(contentsDir));
  const contents = contentFiles.map(readJson);
  const compareFile = path.join(dir, 'compare.json');
  const compare = fs.existsSync(compareFile) ? readJson(compareFile) : null;
  const recorded = branch._recorded || {};
  return shapeCodebase({
    branch: branch.name,
    commit: branch.commit.sha,
    commitMessage: branch.commit.commit.message,
    files: contents.map((c) => ({ path: c.path, url: c.html_url, sha: c.sha, text: decode(c) })),
    compare: compare ? { status: compare.status, aheadBy: compare.ahead_by, base: compare.base_commit.sha, baseBranch: branchConfig(branchName).compareWith, files: compare.files.map((f) => ({ filename: f.filename, status: f.status })) } : null,
    provenance: {
      kind: 'fixture',
      label: `Recorded snapshot of ${SOURCE.fullName}@${branch.name} (${branch.commit.sha.slice(0, 7)})${recorded.at ? `, captured ${recorded.at.slice(0, 10)}` : ''}, stored in GitHub REST API shapes - no live GitHub call was made in this run`,
      ref: `${SOURCE.fullName}@${branch.name} (${branch.commit.sha.slice(0, 7)})`,
      files: [path.join('fixtures/github', dirName, 'branch.json'), ...contentFiles.map((f) => path.relative(path.join(__dirname, '..', '..'), f)), ...(compare ? [path.join('fixtures/github', dirName, 'compare.json')] : [])],
    },
  });
}

function git(args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args[0]} failed: ${String(stderr || err.message).trim().split('\n').slice(-2).join(' ')}`));
      else resolve(stdout);
    });
  });
}

/** Shallow `git clone` of a branch (a codebase branch, or any branch with its own `config`); returns the raw snapshot (every snapshot file with its blob sha and text). */
async function pullSnapshot(branchName = DEFAULT_BRANCH, { cloneUrl = SOURCE.cloneUrl, config } = {}) {
  const cfg = config || branchConfig(branchName);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-clone-'));
  const pulledAt = new Date().toISOString();
  try {
    await git(['clone', '--quiet', '--depth', '1', '--single-branch', '--branch', branchName, cloneUrl, tmp]);
    const commit = (await git(['rev-parse', 'HEAD'], tmp)).trim();
    const commitMessage = (await git(['log', '-1', '--format=%s'], tmp)).trim();
    const tree = (await git(['ls-tree', '-r', 'HEAD'], tmp)).trim().split('\n').map((l) => {
      const [meta, p] = l.split('\t');
      return { sha: meta.split(' ')[2], path: p };
    }).filter((f) => cfg.snapshot(f.path));
    const files = tree.map((f) => ({ ...f, url: blobUrl(commit, f.path), text: fs.readFileSync(path.join(tmp, f.path), 'utf8') }));
    let compare = null;
    if (cfg.compareWith) {
      await git(['fetch', '--quiet', '--depth', '1', 'origin', `${cfg.compareWith}:refs/remotes/origin/compare-base`], tmp);
      const base = (await git(['rev-parse', 'refs/remotes/origin/compare-base'], tmp)).trim();
      const changed = (await git(['diff', '--name-status', 'refs/remotes/origin/compare-base', 'HEAD'], tmp)).trim().split('\n').filter(Boolean)
        .map((l) => { const [s, ...rest] = l.split('\t'); return { filename: rest[rest.length - 1], status: STATUS[s[0]] || s }; });
      compare = { status: 'ahead', aheadBy: null, base, baseBranch: cfg.compareWith, files: changed };
    }
    return { branch: branchName, commit, commitMessage, files, compare, pulledAt, cloneUrl };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Pulls the branch live from GitHub (shallow `git clone`) and shapes it like the recorded snapshot. */
async function loadCodebaseLive(branchName = DEFAULT_BRANCH, opts = {}) {
  const snap = await pullSnapshot(branchName, opts);
  return shapeCodebase({
    ...snap,
    provenance: {
      kind: 'github',
      label: `Pulled live from GitHub: git clone of ${SOURCE.fullName}@${branchName} (${snap.commit.slice(0, 7)}) at ${snap.pulledAt}`,
      ref: `${SOURCE.fullName}@${branchName} (${snap.commit.slice(0, 7)})`,
      fetchedAt: snap.pulledAt,
      files: snap.files.map((f) => f.path),
    },
  });
}

module.exports = { loadCodebaseFixture, loadCodebaseLive, pullSnapshot, listFixtureBranches, shapeCodebase, summariseDictionary, SOURCE, BRANCHES, DEFAULT_BRANCH, SNAPSHOT_FILE, JAVA_SNAPSHOT_FILE };
