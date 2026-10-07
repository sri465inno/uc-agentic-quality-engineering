'use strict';
// Model client shared by every agent. The model suggests; code checks every suggestion before an agent uses it,
// and every call is recorded on the cycle (agent, purpose, model, outcome). Without a model key the agents run rule-based only.
const crypto = require('crypto');

const PROVIDERS = {
  anthropic: { label: 'Anthropic', base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
  openai: { label: 'OpenAI-compatible', base: 'https://api.openai.com/v1', model: 'gpt-4o' },
};

function aiConfig(env = process.env) {
  const common = { timeoutMs: Number(env.AI_TIMEOUT_MS) || 90000, concurrency: Math.max(1, Number(env.AI_CONCURRENCY) || 4) };
  if (env.AI_DISABLED === '1') return null;
  if (env.ANTHROPIC_API_KEY) {
    return { ...common, provider: 'anthropic', apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || PROVIDERS.anthropic.model, baseUrl: (env.ANTHROPIC_BASE_URL || PROVIDERS.anthropic.base).replace(/\/+$/, '') };
  }
  if (env.OPENAI_API_KEY) {
    return { ...common, provider: 'openai', apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || PROVIDERS.openai.model, baseUrl: (env.OPENAI_BASE_URL || PROVIDERS.openai.base).replace(/\/+$/, '') };
  }
  return null;
}

/** What the UI and reports show about the model, without the key. */
function aiStatus(env = process.env) {
  const cfg = aiConfig(env);
  if (!cfg) return { mode: 'rule-based', note: 'No model API key set (ANTHROPIC_API_KEY or OPENAI_API_KEY): every agent runs its rule-based step only.' };
  return { mode: 'ai', provider: cfg.provider, providerLabel: PROVIDERS[cfg.provider].label, model: cfg.model };
}

async function complete(cfg, req, fetchImpl) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(`model call timed out after ${cfg.timeoutMs} ms`)), cfg.timeoutMs);
  try {
    return await send(cfg, req, fetchImpl, ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function send(cfg, { system, prompt, maxTokens }, fetchImpl, signal) {
  if (cfg.provider === 'anthropic') {
    const res = await fetchImpl(`${cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json.content || []).map((c) => c.text || '').join('').trim();
  }
  const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content || '').trim();
}

/** The first JSON object in a model reply (tolerates a ```json fence or a sentence around it). */
function parseJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('reply holds no JSON object');
  return JSON.parse(s.slice(start, end + 1));
}

const BASE_SYSTEM = [
  'You are one agent of an enterprise quality engineering platform. A human reviewer sees everything you suggest, labelled as AI-suggested.',
  'Use only the facts you are given. Never invent numbers, limits, identifiers, Jira keys or file names.',
  'Reply with one JSON object only, exactly in the shape the user message asks for. No prose outside the JSON.',
].join(' ');

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next; next += 1; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * One model session per cycle. `state` lives on the cycle (cycle.ai): the call log and a cache of replies,
 * so re-running a phase (resume, merge with rejected rows) asks the model the same question only once.
 */
class AiSession {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, state = null } = {}) {
    this.cfg = aiConfig(env);
    this.fetchImpl = fetchImpl;
    const status = aiStatus(env);
    this.state = state || { ...status, calls: [], cache: {} };
    if (!this.state.calls) this.state.calls = [];
    if (!this.state.cache) this.state.cache = {};
    if (this.cfg) Object.assign(this.state, status);
  }

  get enabled() { return Boolean(this.cfg); }
  get label() { return this.cfg ? `${PROVIDERS[this.cfg.provider].label} ${this.cfg.model}` : null; }
  get concurrency() { return this.cfg ? this.cfg.concurrency : 1; }

  /** Asks for JSON; returns the parsed object, or null when the model is off, fails or replies with something unusable. */
  async json(agent, purpose, { system = '', prompt, maxTokens = 2000, guidance = '' }) {
    if (!this.cfg) return null;
    const fullSystem = [BASE_SYSTEM, system, guidance ? `House rules from the skills this agent follows:\n${guidance}` : ''].filter(Boolean).join('\n\n');
    const key = crypto.createHash('sha256').update(JSON.stringify([this.cfg.model, fullSystem, prompt])).digest('hex').slice(0, 24);
    const entry = { id: `AI-${String(this.state.calls.length + 1).padStart(3, '0')}`, agent, purpose, model: this.cfg.model, provider: this.cfg.provider, at: new Date().toISOString(), promptHash: key };
    this.state.calls.push(entry);
    if (this.state.cache[key] !== undefined) {
      Object.assign(entry, { ok: true, cached: true, ms: 0 });
      return this.state.cache[key];
    }
    const t0 = Date.now();
    try {
      const data = parseJson(await complete(this.cfg, { system: fullSystem, prompt, maxTokens }, this.fetchImpl));
      this.state.cache[key] = data;
      Object.assign(entry, { ok: true, ms: Date.now() - t0 });
      return data;
    } catch (e) {
      Object.assign(entry, { ok: false, ms: Date.now() - t0, error: e.message });
      return null;
    }
  }

  /** What code did with the suggestions of the latest call(s) for this agent. */
  outcome(agent, { accepted = 0, rejected = 0, note = '' } = {}) {
    const calls = this.state.calls.filter((c) => c.agent === agent && c.accepted === undefined);
    if (!calls.length) return;
    const last = calls[calls.length - 1];
    for (const c of calls) Object.assign(c, { accepted: 0, rejected: 0 });
    Object.assign(last, { accepted, rejected, note });
  }
}

/** Per-agent totals of the AI calls on a cycle. */
function aiSummary(state) {
  const by = {};
  for (const c of (state && state.calls) || []) {
    const s = by[c.agent] || (by[c.agent] = { agent: c.agent, calls: 0, failed: 0, accepted: 0, rejected: 0, notes: [] });
    s.calls += 1;
    if (!c.ok) s.failed += 1;
    s.accepted += c.accepted || 0;
    s.rejected += c.rejected || 0;
    if (c.note && !s.notes.includes(c.note)) s.notes.push(c.note);
  }
  return Object.values(by);
}

/** Numbers that appear in a text (10, 0.5, 48...). */
const numbersIn = (text) => new Set((String(text || '').match(/\d+(?:\.\d+)?/g) || []).map(Number));

/** True when `text` states no number absent from `allowed` (one or more source texts / values). */
function onlyKnownNumbers(text, allowed) {
  const ok = new Set();
  for (const a of [].concat(allowed)) for (const n of numbersIn(typeof a === 'string' ? a : JSON.stringify(a))) ok.add(n);
  return [...numbersIn(text)].every((n) => ok.has(n));
}

module.exports = { aiConfig, aiStatus, AiSession, aiSummary, parseJson, mapLimit, chunk, onlyKnownNumbers, numbersIn };
