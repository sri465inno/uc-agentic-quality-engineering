'use strict';
// Loads the inputs of a run into statements with honest provenance.
const { loadJiraIssue } = require('./connectors/jira');
const { loadCodebaseFixture, loadCodebaseLive, DEFAULT_BRANCH, BRANCHES } = require('./connectors/codebase');
const x = require('./extract');
const { storyKeysIn } = require('./gaps');
const { loadApiFixture, loadApiLive, parsePastedApi, DEFAULT_API_BRANCH } = require('./connectors/api');

const SLOT_LABEL = { initiative: 'Jira initiative', epic: 'Jira epic', codebase: 'Codebase', api: 'API endpoints' };

async function loadInput(slot, spec, opts = {}) {
  if (!spec || spec.mode === 'none') return null;
  if (slot === 'codebase') {
    if (spec.mode === 'paste') {
      const statements = x.statementsFromPastedCodebase(spec.text, { input: slot });
      return { slot, label: SLOT_LABEL[slot], mode: 'paste', ref: 'pasted README / source notes', statements,
        provenance: { kind: 'pasted', label: 'Pasted by the user (not fetched from any system)' }, branch: BRANCHES[spec.branch] ? spec.branch : null, storyKeys: storyKeysIn([spec.text]) };
    }
    const branch = spec.branch || DEFAULT_BRANCH;
    const cb = spec.mode === 'github' ? await loadCodebaseLive(branch, { cloneUrl: opts.cloneUrl }) : loadCodebaseFixture(branch);
    return { slot, label: SLOT_LABEL[slot], mode: spec.mode === 'github' ? 'github' : 'sample', ref: cb.provenance.ref, statements: x.statementsFromCodebase(cb, { input: slot }),
      provenance: cb.provenance, branch: cb.branch, repo: cb.repo, commit: cb.commit, compare: cb.compare, description: cb.description, dataModel: cb.dataModel, dictionary: cb.dictionary, storyKeys: storyKeysIn(cb.files.map((f) => f.text)) };
  }
  if (slot === 'api') {
    const api = spec.mode === 'paste' ? parsePastedApi(spec.text)
      : spec.mode === 'github' ? await loadApiLive(spec.branch || DEFAULT_API_BRANCH, { cloneUrl: opts.cloneUrl }) : loadApiFixture(spec.branch || DEFAULT_API_BRANCH);
    const business = api.endpoints.filter((e) => !e.internal).length;
    return { slot, label: SLOT_LABEL[slot], mode: spec.mode === 'paste' ? 'paste' : spec.mode === 'github' ? 'github' : 'sample', ref: api.provenance.ref || 'pasted OpenAPI',
      summary: `${api.endpoints.length} endpoints of ${api.services.length} services (${business} business, ${api.endpoints.length - business} internal)${api.release ? `, release ${api.release}` : ''}`,
      statements: [], provenance: api.provenance, branch: api.branch, build: api.build, release: api.release, repo: api.repo, commit: api.commit,
      services: api.services, endpoints: api.endpoints, dataModel: api.dataModel, dictionary: api.dictionary };
  }
  if (spec.mode === 'paste') {
    const statements = x.statementsFromPastedJira(spec.text, { input: slot });
    return { slot, label: SLOT_LABEL[slot], mode: 'paste', ref: `pasted ${SLOT_LABEL[slot]}`, statements,
      provenance: { kind: 'pasted', label: 'Pasted by the user (not fetched from any system)' } };
  }
  const keys = String(spec.key || '').split(/[\s,]+/).filter(Boolean);
  const all = [];
  for (const key of keys.length ? keys : [spec.key]) {
    all.push(await loadJiraIssue(key, { withChildren: slot === 'epic', source: spec.mode === 'github' ? 'github' : 'jira', snapshot: spec.snapshot || undefined, ...opts }));
  }
  const statements = all.flatMap((loaded) => [loaded.issue, ...loaded.children].flatMap((iss) => x.statementsFromIssue(iss, { baseUrl: loaded.baseUrl, input: slot })));
  const [first] = all;
  return { slot, label: SLOT_LABEL[slot], mode: spec.mode === 'github' ? 'github' : 'jira', ref: all.map((l) => l.issue.key).join(', '),
    summary: all.length > 1 ? `${all.length} epics: ${all.map((l) => l.issue.fields.summary).join('; ')}` : first.issue.fields.summary,
    children: all.flatMap((l) => l.children.map((c) => c.key)),
    hierarchy: all.map((l) => ({ key: l.issue.key, summary: l.issue.fields.summary, children: l.children.map((c) => ({ key: c.key, summary: c.fields.summary })) })),
    statements, provenance: first.provenance };
}

async function loadInputs(specs, slots, opts) {
  const out = [];
  for (const slot of slots) {
    const loaded = await loadInput(slot, specs[slot], opts);
    if (loaded) out.push(loaded);
  }
  return out;
}

module.exports = { loadInputs, loadInput, SLOT_LABEL };
