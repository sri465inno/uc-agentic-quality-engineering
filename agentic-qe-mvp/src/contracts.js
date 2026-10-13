'use strict';
// API contract of a codebase: the endpoints its controllers and routes declare. AI-written specs may call only these.
const fs = require('fs');
const path = require('path');

const VERBS = { Get: 'GET', Post: 'POST', Put: 'PUT', Delete: 'DELETE', Patch: 'PATCH' };
const decode = (c) => Buffer.from(c.content.replace(/\n/g, ''), c.encoding || 'base64').toString('utf8');
const mappingPath = (args) => ((args || '').match(/(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"/) || [])[1] || '';
const join = (a, b) => `/${[a, b].join('/').split('/').filter(Boolean).join('/')}`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Endpoints declared by Spring controllers (@RequestMapping + @GetMapping...) and Express routes (app.get('/x')). */
function endpointsIn(file, text) {
  const out = [];
  if (file.endsWith('.java') && /@(Rest)?Controller/.test(text)) {
    const head = text.split(/\bclass\s+\w+/)[0];
    const base = mappingPath((head.match(/@RequestMapping\(([^)]*)\)/) || [])[1]);
    for (const m of text.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping(?:\(([^)]*)\))?/g)) out.push({ method: VERBS[m[1]], path: join(base, mappingPath(m[2])), file });
  }
  if (/\.(js|ts)$/.test(file)) {
    for (const m of text.matchAll(/\b(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g)) out.push({ method: m[1].toUpperCase(), path: m[2].replace(/:(\w+)/g, '{$1}'), file });
  }
  return out;
}

/** Reads a recorded codebase (GitHub contents API files) and returns its endpoints, per service. */
function extractContract(contentsDir) {
  if (!fs.existsSync(contentsDir)) return [];
  return walk(contentsDir).filter((f) => /\.(java|js|ts)\.json$/.test(f)).flatMap((f) => {
    const rel = path.relative(contentsDir, f).replace(/\.json$/, '');
    const service = rel.split(path.sep)[0];
    return endpointsIn(rel, decode(JSON.parse(fs.readFileSync(f, 'utf8')))).map((e) => ({ service, ...e, file: rel.split(path.sep).join('/') }));
  });
}

const pattern = (p) => new RegExp(`^${p.split('/').map((seg) => (/^\{.+\}$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))).join('/')}$`);

/** Every call(request, testInfo, '<service>', '<METHOD>', '<path>') in a spec body must be an endpoint of the contract; the prelude helpers are trusted. */
function checkEndpoints(body, contract) {
  const calls = [...String(body).matchAll(/\bcall\(\s*request\s*,\s*testInfo\s*,\s*['"]([\w-]+)['"]\s*,\s*['"](\w+)['"]\s*,\s*(['"`])((?:(?!\3).)*)\3/g)]
    .map((m) => ({ service: m[1], method: m[2].toUpperCase(), path: m[4].replace(/\$\{[^}]*\}/g, 'x').split('?')[0] }));
  if (!calls.length || !contract.length) return null;
  const unknown = calls.filter((c) => !contract.some((e) => e.service === c.service && e.method === c.method && pattern(e.path).test(c.path)));
  return unknown.length ? `calls endpoint(s) not in the API contract: ${unknown.map((c) => `${c.method} ${c.service}${c.path}`).join(', ')}` : null;
}

const CALL = /\bcall\(\s*request\s*,\s*testInfo\s*,\s*['"]([\w-]+)['"]\s*,\s*['"](\w+)['"]\s*,\s*(['"`])((?:(?!\3).)*)\3/g;
const callsIn = (text) => [...String(text).matchAll(CALL)].map((m) => ({ service: m[1], method: m[2].toUpperCase(), path: m[4].replace(/\$\{[^}]*\}/g, 'x').split('?')[0] }));

/** Helpers of a spec prelude (function or arrow) and the endpoints each one calls. */
function preludeHelpers(prelude) {
  const out = new Map();
  for (const chunk of String(prelude || '').split(/\n(?=(?:async\s+)?function\s|const\s)/)) {
    const name = (chunk.match(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/) || []).slice(1).find(Boolean);
    if (name && name !== 'call') { const calls = callsIn(chunk); if (calls.length) out.set(name, calls); }
  }
  return out;
}

/** Which business endpoints of the API contract the automation scripts call, directly or through a prelude helper. */
function endpointCoverage(scripts, contract, prelude) {
  const helpers = preludeHelpers(prelude);
  const business = contract.filter((e) => !e.internal);
  const rows = business.map((e) => ({ service: e.service, method: e.method, path: e.path, scripts: [], testCases: [] }));
  const unknown = [];
  for (const sc of scripts || []) {
    const body = String(sc.code || '').replace(prelude || '\u0000', '');
    const calls = [...callsIn(body), ...[...helpers].filter(([n]) => new RegExp(`\\b${n}\\(`).test(body)).flatMap(([, c]) => c)];
    for (const c of calls) {
      const row = rows.find((r) => r.service === c.service && r.method === c.method && pattern(r.path).test(c.path));
      if (row) {
        if (!row.scripts.includes(sc.file)) row.scripts.push(sc.file);
        for (const k of (sc.covers || []).map((x) => (typeof x === 'string' ? x : x.testCaseKey || x.key)).filter(Boolean)) if (!row.testCases.includes(k)) row.testCases.push(k);
      } else if (!contract.some((e) => e.service === c.service && e.method === c.method && pattern(e.path).test(c.path))) {
        const label = `${c.method} ${c.service}${c.path}`;
        if (!unknown.includes(label)) unknown.push(label);
      }
    }
  }
  const called = rows.filter((r) => r.scripts.length).length;
  return { total: rows.length, called, notCalled: rows.length - called, internal: contract.length - business.length, rows, unknownCalls: unknown };
}

module.exports = { extractContract, checkEndpoints, endpointsIn, endpointCoverage, preludeHelpers };
