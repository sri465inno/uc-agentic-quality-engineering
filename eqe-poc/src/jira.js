'use strict';
// Dummy Jira input, two modes: live dummy Jira (only when JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN are all set)
// or the committed export snapshot of branch demo/jira-export (recorded copy in agentic-qe-mvp/fixtures/jira).
const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', '..', 'agentic-qe-mvp', 'fixtures', 'jira');
const SNAPSHOT_SOURCE = 'https://github.com/sri465inno/uc-agentic-quality-engineering/tree/demo/jira-export/jira';

function jiraMode(env = process.env) {
  const live = env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN;
  return live
    ? { mode: 'live-dummy-jira', label: 'Dummy live Jira', site: env.JIRA_BASE_URL.replace(/\/+$/, '') }
    : { mode: 'export-snapshot', label: 'Jira export snapshot (demo/jira-export)', site: SNAPSHOT_SOURCE };
}

async function liveGet(env, urlPath, init = {}) {
  const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`${env.JIRA_BASE_URL.replace(/\/+$/, '')}${urlPath}`, { ...init, headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Dummy Jira ${urlPath} failed: HTTP ${res.status}`);
  return res.json();
}

async function getIssue(key, env = process.env) {
  if (jiraMode(env).mode === 'live-dummy-jira') return liveGet(env, `/rest/api/3/issue/${encodeURIComponent(key)}`);
  return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, `${key}.json`), 'utf8'));
}

async function getChildren(key, env = process.env) {
  if (jiraMode(env).mode === 'live-dummy-jira') {
    const r = await liveGet(env, '/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify({ jql: `parent = ${key} ORDER BY key`, fields: ['summary', 'description', 'labels', 'parent', 'issuetype', 'status'] }) });
    return r.issues || [];
  }
  const file = path.join(SNAPSHOT_DIR, `${key}.children.json`);
  if (!fs.existsSync(file)) return [];
  const list = JSON.parse(fs.readFileSync(file, 'utf8')).issues || [];
  return Promise.all(list.map((i) => getIssue(i.key, env)));
}

/** Atlassian Document Format -> plain lines, keeping headings (## ) and list items (- ). */
function adfToText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  const inner = (node.content || []).map(adfToText).join('');
  if (node.type === 'heading') return `## ${inner.trim()}\n`;
  if (node.type === 'listItem') return `- ${inner.trim()}\n`;
  if (node.type === 'paragraph') return `${inner.trim()}\n`;
  return inner;
}

/** Splits description text into { section: [bullet lines] } using the ## headings. */
function sections(text) {
  const out = {};
  let cur = '_';
  for (const line of text.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { cur = h[1].trim(); out[cur] = []; continue; }
    if (line.startsWith('- ')) (out[cur] = out[cur] || []).push(line.slice(2).trim());
  }
  return out;
}

/** The epic with its stories, acceptance criteria (<KEY>-AC<n>) and business rules (<KEY>-BR<n>) taken verbatim from Jira. */
async function loadEpic(epicKey, env = process.env) {
  const epic = await getIssue(epicKey, env);
  const children = await getChildren(epicKey, env);
  const toItem = (issue) => {
    const text = adfToText(issue.fields.description);
    const sec = sections(text);
    return {
      key: issue.key,
      summary: issue.fields.summary,
      labels: issue.fields.labels || [],
      text,
      acceptanceCriteria: (sec['Acceptance criteria'] || sec['Epic acceptance criteria'] || []).map((t, i) => ({ id: `${issue.key}-AC${i + 1}`, text: t })),
      businessRules: (sec['Business rules'] || []).map((t, i) => ({ id: `${issue.key}-BR${i + 1}`, text: t })),
      logging: sec['Logging and audit requirements'] || [],
    };
  };
  return { ...jiraMode(env), epic: toItem(epic), stories: children.map(toItem).sort((a, b) => Number(a.key.split('-')[1]) - Number(b.key.split('-')[1])) };
}

module.exports = { loadEpic, jiraMode, adfToText, sections, SNAPSHOT_DIR, SNAPSHOT_SOURCE };
