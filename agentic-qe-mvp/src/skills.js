'use strict';
// Skill files: markdown with YAML front matter (id, name, description, appliesTo, delivers).
// Loaded from skills/ at startup; adding a file adds a skill, no code change needed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AGENTS = {
  normalise: 'Normalise (compare the inputs)',
  'review-agent': 'Review agent (added / missing pieces)',
  delta: 'Delta classification',
  requirements: 'Requirements agent (requirements with their business rules)',
  testcases: 'Test case agent',
  testdata: 'Test data agent',
  scripts: 'Automation script agent',
  execution: 'Execution agent',
  defects: 'Defect agent',
  report: 'Cycle report agent',
};

const scalar = (v) => {
  const s = v.trim();
  if (/^".*"$|^'.*'$/.test(s)) return s.slice(1, -1);
  return s;
};
const inlineList = (v) => v.trim().replace(/^\[|\]$/g, '').split(',').map(scalar).filter(Boolean);

/** Minimal YAML subset: `key: value`, `key: [a, b]`, block lists (`- a`) and one level of nested maps. */
function parseYaml(src) {
  const out = {};
  let key = null;
  let sub = null;
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    if (indent === 0) {
      const m = line.match(/^([\w-]+):\s*(.*)$/);
      if (!m) throw new Error(`Cannot parse front matter line: ${raw}`);
      [, key] = m;
      sub = null;
      const v = m[2];
      out[key] = v === '' ? null : v.startsWith('[') ? inlineList(v) : scalar(v);
      continue;
    }
    if (!key) throw new Error(`Indented line without a parent key: ${raw}`);
    if (line.startsWith('- ')) {
      const target = sub ? out[key] : out;
      const k = sub || key;
      if (!Array.isArray(target[k])) target[k] = [];
      target[k].push(scalar(line.slice(2)));
      continue;
    }
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) throw new Error(`Cannot parse front matter line: ${raw}`);
    if (!out[key] || typeof out[key] !== 'object' || Array.isArray(out[key])) out[key] = {};
    [, sub] = m;
    out[key][sub] = m[2] === '' ? [] : m[2].startsWith('[') ? inlineList(m[2]) : [scalar(m[2])];
  }
  return out;
}

// The business rules agent was folded into the requirements agent; skills written for it still load.
const AGENT_ALIASES = { rules: 'requirements' };
const agentId = (a) => AGENT_ALIASES[a] || a;

const SKILL_FIELDS = new Set(['id', 'name', 'description', 'appliesTo', 'delivers', 'testingType']);

function parseSkill(text, file = '(inline)') {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing YAML front matter`);
  const meta = parseYaml(m[1]);
  for (const f of ['id', 'name', 'description']) if (!meta[f] || typeof meta[f] !== 'string') throw new Error(`${file}: front matter needs "${f}"`);
  const appliesTo = [...new Set([].concat(meta.appliesTo || []).map(agentId))];
  if (!appliesTo.length) throw new Error(`${file}: "appliesTo" must list at least one agent id`);
  const delivers = {};
  if (meta.delivers && typeof meta.delivers === 'object' && !Array.isArray(meta.delivers)) {
    for (const [a, keys] of Object.entries(meta.delivers)) delivers[agentId(a)] = [...new Set([...(delivers[agentId(a)] || []), ...[].concat(keys)])];
  }
  const body = m[2].trim();
  const settings = Object.fromEntries(Object.entries(meta).filter(([k]) => !SKILL_FIELDS.has(k)));
  return {
    id: meta.id, name: meta.name, description: meta.description, appliesTo, delivers, body, testingType: typeof meta.testingType === 'string' ? meta.testingType : null, settings,
    file: path.basename(file), sha256: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12),
  };
}

function loadSkills(dir) {
  const skills = [];
  const warnings = [];
  if (!fs.existsSync(dir)) return { dir, skills, warnings: [`Skills directory ${dir} not found`] };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    let s;
    try { s = parseSkill(fs.readFileSync(path.join(dir, f), 'utf8'), f); } catch (e) { warnings.push(e.message); continue; }
    if (skills.some((x) => x.id === s.id)) { warnings.push(`${f}: duplicate skill id "${s.id}" ignored`); continue; }
    for (const a of s.appliesTo) if (!AGENTS[a]) warnings.push(`${f}: appliesTo names unknown agent "${a}"`);
    for (const a of Object.keys(s.delivers)) {
      if (!AGENTS[a]) warnings.push(`${f}: delivers names unknown agent "${a}"`);
      else if (!s.appliesTo.includes(a)) warnings.push(`${f}: delivers names "${a}" which is not in appliesTo`);
    }
    skills.push(s);
  }
  return { dir, skills, warnings };
}

/** The skills whose body a given agent may see. */
const skillsFor = (active, agentId) => (active || []).filter((s) => s.appliesTo.includes(agentId));

/** Context handed to an agent: only the bodies of skills that target it. */
function agentContext(active, agentId) {
  const skills = skillsFor(active, agentId).map(({ id, name, body }) => ({ id, name, body }));
  return { agent: agentId, skills, guidance: skills.map((s) => `## Skill: ${s.name} (${s.id})\n${s.body}`).join('\n\n') };
}

/**
 * Checks what an agent actually produced against what its skills say it owes.
 * produced: { artefactKey: { value, count, allowEmpty, na } }.
 * A key that is absent, null, or empty (unless an empty list is a valid result) is an incomplete hand-over.
 */
function checkHandover(agentId, produced, active) {
  const owed = new Map();
  for (const s of active || []) {
    for (const key of (s.delivers || {})[agentId] || []) {
      if (!owed.has(key)) owed.set(key, []);
      owed.get(key).push(s.id);
    }
  }
  const items = [...owed].map(([key, skills]) => {
    const p = produced[key];
    if (p && p.na) return { key, skills, status: 'n/a', count: null, note: p.na };
    if (!p || p.value === undefined || p.value === null) return { key, skills, status: 'missing', count: 0, note: `${agentId} did not produce "${key}"` };
    const count = p.count ?? (Array.isArray(p.value) ? p.value.length : 1);
    if (!count && !p.allowEmpty) return { key, skills, status: 'empty', count: 0, note: `${agentId} produced "${key}" with nothing in it` };
    return { key, skills, status: 'delivered', count, note: p.note || null };
  });
  const bad = items.filter((i) => i.status === 'missing' || i.status === 'empty');
  return {
    agent: agentId,
    checkedAt: new Date().toISOString(),
    status: !items.length ? 'no contract' : bad.length ? 'incomplete' : 'complete',
    items,
    missing: bad.map((i) => i.key),
    produced: Object.keys(produced).filter((k) => produced[k] && (produced[k].value !== undefined && produced[k].value !== null)),
  };
}

/**
 * Snapshot persisted on a cycle so reruns and restarts use the same skill text.
 * By default every general skill is on, plus the skill written for the chosen type of testing.
 */
function selectSkills(library, ids, testingType = null) {
  const types = [].concat(testingType || []);
  if (ids === undefined || ids === null) return library.filter((s) => !s.testingType || types.includes(s.testingType)).map((s) => ({ ...s }));
  if (!Array.isArray(ids)) throw new Error('skills must be a list of skill ids');
  const unknown = ids.filter((id) => !library.some((s) => s.id === id));
  if (unknown.length) throw new Error(`Unknown skill id(s): ${unknown.join(', ')}`);
  return library.filter((s) => ids.includes(s.id)).map((s) => ({ ...s }));
}

module.exports = { AGENTS, parseYaml, parseSkill, loadSkills, skillsFor, agentContext, checkHandover, selectSkills };
