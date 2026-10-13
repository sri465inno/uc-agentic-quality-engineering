'use strict';
// API endpoints connector: the OpenAPI documents of the hotel services (one per service) plus the booking data
// dictionary, published without the code on demo/hotel-api-contract (release 1.0) and demo/hotel-api-contract-v2 (2.0).
// Two sources, same result shape: live (`git clone` of the branch) or the recorded snapshot under fixtures/github/<dir>.
const fs = require('fs');
const path = require('path');
const { pullSnapshot, summariseDictionary, SOURCE } = require('./codebase');

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'fixtures', 'github');
const API_FILE = (p) => p === 'README.md' || /^openapi\/[\w-]+\.json$/.test(p) || /^data-dictionary\/.+\.json$/.test(p);
const API_BRANCHES = {
  'demo/hotel-api-contract': { dir: 'hotel-api-contract', build: 'demo/hotel-booking-platform', release: '1.0', compareWith: null, snapshot: API_FILE },
  'demo/hotel-api-contract-v2': { dir: 'hotel-api-contract-v2', build: 'demo/hotel-booking-platform-v2', release: '2.0', compareWith: null, snapshot: API_FILE },
};
const DEFAULT_API_BRANCH = 'demo/hotel-api-contract';
const VERBS = ['get', 'post', 'put', 'delete', 'patch'];
const decode = (c) => Buffer.from(c.content.replace(/\n/g, ''), c.encoding || 'base64').toString('utf8');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function apiConfig(branch) {
  const cfg = API_BRANCHES[branch];
  if (!cfg) throw new Error(`Unknown API endpoints branch "${branch}" (known: ${Object.keys(API_BRANCHES).join(', ')})`);
  return cfg;
}

/** Operations of OpenAPI documents; the service is the document title. */
function endpointsOf(docs) {
  return docs.flatMap(({ doc, file }) => Object.entries(doc.paths || {}).flatMap(([p, item]) => VERBS.filter((v) => item[v]).map((v) => ({
    service: doc.info?.title || 'api', method: v.toUpperCase(), path: p, operationId: item[v].operationId || null, internal: Boolean(item[v]['x-internal']), file,
  }))));
}

function shapeApi({ branch, commit, files, provenance }) {
  const cfg = branch ? API_BRANCHES[branch] : null;
  const docs = files.filter((f) => /^openapi\/.+\.json$/.test(f.path)).map((f) => ({ doc: JSON.parse(f.text), file: f.path, url: f.url }));
  const dict = files.find((f) => /^data-dictionary\/.+\.json$/.test(f.path));
  const endpoints = endpointsOf(docs);
  return {
    repo: SOURCE.fullName, branch, commit, build: cfg?.build || null, release: cfg?.release || null,
    services: docs.map((d) => ({ name: d.doc.info?.title, version: d.doc.info?.version, file: d.file, url: d.url, server: d.doc.servers?.[0]?.url || null })),
    endpoints, dataModel: dict ? summariseDictionary(dict) : null, dictionary: dict ? JSON.parse(dict.text) : null, provenance,
  };
}

function loadApiFixture(branch = DEFAULT_API_BRANCH) {
  const { dir } = apiConfig(branch);
  const root = path.join(FIXTURE_DIR, dir);
  const meta = readJson(path.join(root, 'branch.json'));
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) { const c = readJson(p); files.push({ path: c.path, url: c.html_url, text: decode(c) }); }
    }
  }(path.join(root, 'contents')));
  const sha = meta.commit.sha;
  return shapeApi({ branch, commit: sha, files, provenance: {
    kind: 'fixture', ref: `${SOURCE.fullName}@${branch} (${sha.slice(0, 7)})`,
    label: `Recorded snapshot of ${SOURCE.fullName}@${branch} (${sha.slice(0, 7)})${meta._recorded?.at ? `, captured ${meta._recorded.at.slice(0, 10)}` : ''} - no live GitHub call`,
  } });
}

async function loadApiLive(branch = DEFAULT_API_BRANCH, opts = {}) {
  const snap = await pullSnapshot(branch, { ...opts, config: apiConfig(branch) });
  return shapeApi({ ...snap, provenance: {
    kind: 'github', ref: `${SOURCE.fullName}@${branch} (${snap.commit.slice(0, 7)})`, fetchedAt: snap.pulledAt,
    label: `Pulled live from GitHub: git clone of ${SOURCE.fullName}@${branch} (${snap.commit.slice(0, 7)}) at ${snap.pulledAt}`,
  } });
}

/** Pasted OpenAPI: one document, a list of documents, or { "<service>": document }. */
function parsePastedApi(text) {
  let v;
  try { v = JSON.parse(text); } catch { throw new Error('API endpoints must be pasted as OpenAPI JSON'); }
  const docs = v.openapi || v.swagger ? [v] : Array.isArray(v) ? v : Object.entries(v).map(([name, d]) => ({ ...d, info: { title: name, ...d.info } }));
  return shapeApi({ branch: null, commit: null, files: docs.map((d, i) => ({ path: `openapi/pasted-${i + 1}.json`, text: JSON.stringify(d) })),
    provenance: { kind: 'pasted', label: 'Pasted by the user (not fetched from any system)' } });
}

module.exports = { loadApiFixture, loadApiLive, parsePastedApi, endpointsOf, API_BRANCHES, DEFAULT_API_BRANCH, API_FILE };
