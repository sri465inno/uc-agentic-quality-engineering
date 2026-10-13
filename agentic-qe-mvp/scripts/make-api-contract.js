'use strict';
// Writes the API endpoints input of a hotel release: an OpenAPI 3 document per service (from their Spring
// controllers) plus the booking data dictionary, as published on the demo/hotel-api-contract(-v2) branches.
// Usage: node scripts/make-api-contract.js <code branch> <outDir>
const fs = require('fs');
const path = require('path');
const { extractContract } = require('../src/contracts');
const { BRANCHES } = require('../src/connectors/codebase');

const RELEASE = { 'demo/hotel-booking-platform': '1.0', 'demo/hotel-booking-platform-v2': '2.0' };
const decode = (c) => Buffer.from(c.content.replace(/\n/g, ''), c.encoding || 'base64').toString('utf8');

const opId = (service, method, p) => `${method.toLowerCase()}${p.replace(/\{(\w+)\}/g, 'by-$1').split(/[/-]/).filter((x) => x && x !== 'api').map((x) => x[0].toUpperCase() + x.slice(1)).join('')}`;

/** One OpenAPI 3 document per service: its endpoints, local port and path parameters. */
function openApi(codeBranch) {
  const contents = path.join(__dirname, '..', 'fixtures', 'github', BRANCHES[codeBranch].dir, 'contents');
  const release = RELEASE[codeBranch];
  const specs = {};
  for (const e of extractContract(contents)) {
    if (!specs[e.service]) {
      const yml = path.join(contents, e.service, 'src', 'main', 'resources', `${e.service}.yml.json`);
      const port = fs.existsSync(yml) ? (decode(JSON.parse(fs.readFileSync(yml, 'utf8'))).match(/^server:\s*\n\s+port:\s*(\d+)/m) || [])[1] : null;
      specs[e.service] = {
        openapi: '3.0.3',
        info: { title: e.service, version: `${release}.0`, description: `Hotel booking platform release ${release}: the endpoints ${e.service} exposes. /api/admin/* operations are internal test hooks (x-internal).` },
        servers: [{ url: `http://localhost:${port || 8080}`, description: 'local default port' }],
        paths: {},
      };
    }
    const params = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    const item = specs[e.service].paths[e.path] || (specs[e.service].paths[e.path] = {});
    item[e.method.toLowerCase()] = {
      operationId: opId(e.service, e.method, e.path), summary: `${e.method} ${e.path}`,
      ...(params.length ? { parameters: params } : {}), responses: { 200: { description: 'OK' } },
      ...(/^\/api\/admin\//.test(e.path) ? { 'x-internal': true } : {}),
    };
  }
  return specs;
}

const operations = (specs) => Object.values(specs).flatMap((s) => Object.values(s.paths).flatMap((p) => Object.values(p)));

function writeContract(codeBranch, outDir) {
  const contents = path.join(__dirname, '..', 'fixtures', 'github', BRANCHES[codeBranch].dir, 'contents');
  const dict = decode(JSON.parse(fs.readFileSync(path.join(contents, 'data-dictionary', 'booking-attributes.json.json'), 'utf8')));
  const specs = openApi(codeBranch);
  fs.mkdirSync(path.join(outDir, 'openapi'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'data-dictionary'), { recursive: true });
  for (const [service, spec] of Object.entries(specs)) fs.writeFileSync(path.join(outDir, 'openapi', `${service}.json`), `${JSON.stringify(spec, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'data-dictionary', 'booking-attributes.json'), dict.endsWith('\n') ? dict : `${dict}\n`);
  const ops = operations(specs);
  fs.writeFileSync(path.join(outDir, 'README.md'), `# Hotel booking platform API, release ${RELEASE[codeBranch]}

The API endpoints input of the Agentic QE Platform demo: what the six services expose, without their code.

- \`openapi/<service>.json\`: one OpenAPI 3 document per service, ${ops.length} operations in all (${ops.filter((o) => !o['x-internal']).length} business endpoints, ${ops.filter((o) => o['x-internal']).length} internal admin hooks).
- \`data-dictionary/booking-attributes.json\`: the booking attributes the test data is generated from.
`);
  return specs;
}

if (require.main === module) {
  const [branch, out] = process.argv.slice(2);
  if (!RELEASE[branch] || !out) { console.error('Usage: node scripts/make-api-contract.js <demo/hotel-booking-platform|demo/hotel-booking-platform-v2> <outDir>'); process.exit(1); }
  console.log(`${branch}: ${operations(writeContract(branch, path.resolve(out))).length} operations -> ${out}`);
}

module.exports = { openApi, writeContract, operations };
