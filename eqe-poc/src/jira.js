'use strict';
// Dummy Jira input in two modes: live (only when JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are all set) or the committed
// Jira REST v3 export snapshot (jira-export/, copied from branch demo/jira-export). Never point this at a real client Jira.
const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, '..', 'jira-export');
const SOURCE = {
  repo: 'sri465inno/uc-agentic-quality-engineering',
  exportBranch: 'demo/jira-export',
  htmlBase: 'https://github.com/sri465inno/uc-agentic-quality-engineering/blob/demo/jira-export/jira',
  snapshotSite: 'https://tcs-team-ou6drgfr.atlassian.net',
};
const FIELDS = ['summary', 'description', 'issuetype', 'status', 'priority', 'labels', 'parent', 'issuelinks'];

function liveConfig(env = process.env) {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) return null;
  return { baseUrl: JIRA_BASE_URL.replace(/\/+$/, ''), email: JIRA_EMAIL, token: JIRA_API_TOKEN };
}

function mode(env = process.env) {
  const cfg = liveConfig(env);
  return cfg
    ? { kind: 'live', label: `Dummy live Jira (${cfg.baseUrl})`, site: cfg.baseUrl }
    : { kind: 'snapshot', label: `Jira export snapshot (${SOURCE.repo}@${SOURCE.exportBranch}, committed under eqe-poc/jira-export) - no live Jira call`, site: SOURCE.snapshotSite };
}

/** Atlassian Document Format -> sections keyed by heading text, each a list of paragraph / list-item strings. */
function adfSections(doc) {
  const out = { _intro: [] };
  let cur = '_intro';
  const text = (n) => (n.text || '') + (n.content || []).map(text).join('');
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'heading') { cur = text(n).trim(); out[cur] = out[cur] || []; continue; }
      if (n.type === 'paragraph') { const t = text(n).trim(); if (t) out[cur].push(t); continue; }
      if (n.type === 'listItem') { const t = text(n).trim(); if (t) out[cur].push(t); continue; }
      walk(n.content);
    }
  };
  if (doc && typeof doc === 'object') walk(doc.content);
  else if (typeof doc === 'string') out._intro = doc.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return out;
}

function normaliseIssue(raw, site) {
  const f = raw.fields || {};
  const sections = adfSections(f.description);
  const pick = (...names) => { for (const n of names) { const k = Object.keys(sections).find((s) => s.toLowerCase() === n); if (k) return sections[k]; } return []; };
  return {
    key: raw.key, summary: f.summary || '', type: (f.issuetype || {}).name || '', status: (f.status || {}).name || '', priority: (f.priority || {}).name || 'Medium',
    labels: f.labels || [], parent: (f.parent || {}).key || null,
    links: (f.issuelinks || []).map((l) => (l.outwardIssue || l.inwardIssue || {}).key).filter(Boolean),
    url: `${site}/browse/${raw.key}`,
    userStory: pick('user story').join(' '), description: pick('description', 'objective').join(' '),
    acceptanceCriteria: pick('acceptance criteria', 'epic acceptance criteria'), businessRules: pick('business rules'),
    dependencies: pick('dependencies'), logging: pick('logging and audit requirements'),
    inScope: pick('in scope', 'scope (user stories)'), outOfScope: pick('out of scope for the initial baseline', 'out of scope'), sections,
  };
}

function readExport(key) {
  const file = path.join(EXPORT_DIR, `${key}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

async function live(cfg, fetchImpl, urlPath, body) {
  const res = await fetchImpl(`${cfg.baseUrl}${urlPath}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64')}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Dummy Jira ${urlPath} failed: HTTP ${res.status}`);
  return res.json();
}

/** Loads an initiative, its linked epics and each epic's stories. */
async function loadInitiative(key, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const m = mode(env);
  const cfg = liveConfig(env);
  const get = async (k) => {
    if (cfg) return live(cfg, fetchImpl, `/rest/api/3/issue/${k}?fields=${FIELDS.join(',')}`);
    const raw = readExport(k);
    if (!raw) throw new Error(`${k} is not in the Jira export snapshot`);
    return raw;
  };
  const children = async (k) => {
    if (cfg) return (await live(cfg, fetchImpl, '/rest/api/3/search/jql', { jql: `parent = ${k} ORDER BY key ASC`, fields: FIELDS, maxResults: 100 })).issues || [];
    return fs.readdirSync(EXPORT_DIR).filter((f) => /^[A-Z]+-\d+\.json$/.test(f)).map((f) => readExport(f.replace('.json', '')))
      .filter((r) => (r.fields.parent || {}).key === k).sort((a, b) => Number(a.key.split('-')[1]) - Number(b.key.split('-')[1]));
  };
  const initiative = normaliseIssue(await get(key), m.site);
  const epics = [];
  for (const ek of initiative.links) {
    let raw;
    try { raw = await get(ek); } catch { continue; }
    const epic = normaliseIssue(raw, m.site);
    epic.stories = (await children(ek)).map((r) => normaliseIssue(r, m.site));
    epics.push(epic);
  }
  return { mode: m, initiative, epics, loadedAt: new Date().toISOString(), files: cfg ? [] : [key, ...initiative.links].map((k) => `${SOURCE.htmlBase}/${k}.json`) };
}

function listInitiatives() {
  if (!fs.existsSync(EXPORT_DIR)) return [];
  return fs.readdirSync(EXPORT_DIR).filter((f) => /^[A-Z]+-\d+\.json$/.test(f)).map((f) => readExport(f.replace('.json', '')))
    .filter((r) => /initiative/i.test(r.fields.summary) || (r.fields.labels || []).includes('initiative')).map((r) => ({ key: r.key, summary: r.fields.summary }));
}

module.exports = { loadInitiative, listInitiatives, adfSections, normaliseIssue, mode, liveConfig, SOURCE };
