'use strict';
// Review agent: reads the normalised inputs before the human review and suggests what was added, what is
// missing and what conflicts. Advisory only - it never approves, excludes or edits anything.
const { domainOf } = require('./domains');
const { getTestingType } = require('../testing-types');

const SOURCE = { jira: 'Jira', code: 'the codebase' };

function refsOf(group, byId) {
  return group.members.map((id) => byId.get(id)).filter(Boolean)
    .map((s) => ({ source: s.source, ref: s.origin?.ref || null, line: s.origin?.line || null, url: s.origin?.url || null, quote: s.quote }));
}

const groupText = (g) => g.text || g.options[0].text;

/** Attributes the catalogue would vary for the stated rules, so untouched dictionary drivers can be named. */
function variedAttributes(groups, classify) {
  const classified = groups.map((g) => classify(groupText(g))).filter(Boolean);
  const params = new Map();
  for (const c of classified) if (!params.has(c.entry.kind)) params.set(c.entry.kind, c.params);
  const ctx = { paramsOf: (kind) => params.get(kind) };
  const out = new Set();
  for (const c of classified) {
    const specs = [...c.entry.cases(c.params, ctx), ...(c.entry.extras ? c.entry.extras(c.params, ctx) : [])];
    for (const s of specs) for (const v of s.varies || []) out.add(v);
  }
  return out;
}

function reviewInputs({ normalisation, inputs = [], testingType, deltaPreview = null, baseline = null }) {
  const tt = getTestingType(testingType);
  const dom = domainOf(inputs);
  const { classify, CATALOGUE, MONEY_KINDS } = dom;
  const byId = new Map(normalisation.statements.map((s) => [s.id, s]));
  const groups = normalisation.groups;
  const findings = [];
  const add = (f) => findings.push({ id: `RA-${String(findings.length + 1).padStart(2, '0')}`, ...f });
  const kindOf = (g) => classify(groupText(g))?.entry.kind || null;
  const money = (g) => MONEY_KINDS.has(kindOf(g));

  for (const g of groups.filter((x) => x.bucket === 'conflict')) {
    const code = g.options.find((o) => o.sources.includes('code'));
    add({
      category: 'conflict', severity: money(g) ? 'high' : 'medium', groupId: g.id,
      title: `Sources disagree: ${g.options.map((o) => `${o.sources.map((s) => SOURCE[s] || s).join(' and ')} say ${o.signature}`).join(', ')}`,
      detail: g.options.map((o) => o.text).join(' / '),
      suggestion: code ? `The code implements ${code.signature} today. Choosing another value means the tests for this rule will fail until the code changes.` : 'Choose the value to test against, or exclude the rule.',
      sources: refsOf(g, byId),
    });
  }
  for (const g of groups.filter((x) => x.bucket === 'code-only')) {
    add({
      category: 'added', severity: money(g) ? 'high' : 'medium', groupId: g.id,
      title: 'In the code but in no Jira story',
      detail: g.text,
      suggestion: 'Ask the product owner to add acceptance criteria for it, or exclude it if the behaviour is unintended.',
      sources: refsOf(g, byId),
    });
  }
  for (const g of groups.filter((x) => x.ai && x.ai.kind === 'match')) {
    add({
      category: 'ai', by: 'ai', model: g.ai.by, severity: g.bucket === 'conflict' ? 'medium' : 'low', groupId: g.id,
      title: `AI matched a Jira statement and a code rule of ${g.ai.story} by meaning (confidence ${g.ai.confidence})`,
      detail: `Jira: ${g.ai.jiraText} / Code: ${g.ai.codeText}`,
      suggestion: `${g.ai.reason} Values compared in code: ${g.ai.valuesFrom}. Confirm they state the same rule; exclude the group if they do not.`,
      sources: refsOf(g, byId),
    });
  }
  for (const g of groups.filter((x) => x.bucket === 'jira-only')) {
    add({
      category: 'missing', severity: money(g) ? 'high' : 'medium', groupId: g.id,
      title: 'Asked for in Jira but not mentioned in the code',
      detail: g.text,
      suggestion: 'Tests are designed from the Jira wording; expect them to fail until it is built, or confirm with the developers where it lives.',
      sources: refsOf(g, byId),
    });
  }
  for (const g of groups.filter((x) => x.bucket !== 'conflict' && !classify(groupText(x)) && !x.options[0].values.length)) {
    add({
      category: 'missing', severity: 'low', groupId: g.id,
      title: 'No testable expected value',
      detail: g.text,
      suggestion: 'Add an example with an exact expected result (amount, status or error code); until then it can only become a manual case.',
      sources: refsOf(g, byId),
    });
  }

  const dataModel = inputs.find((i) => i.slot === 'codebase')?.dataModel;
  if (dataModel) {
    const varied = variedAttributes(groups, classify);
    const untouched = dataModel.drivers.filter((d) => !varied.has(d.name));
    if (untouched.length) {
      add({
        category: 'missing', severity: 'medium', groupId: null,
        title: `${untouched.length} of ${dataModel.drivers.length} ${dom.driversLabel} have no rule that varies them`,
        detail: untouched.map((d) => `${d.name} (${d.description})`).join('; '),
        suggestion: 'Ask for a rule or an example per attribute in the epic; until then no test changes these attributes.',
        sources: [{ source: 'code', ref: dataModel.file, line: null, url: dataModel.url || null, quote: null }],
      });
    }
  }

  const kinds = new Set(groups.map(kindOf).filter(Boolean));
  const missingFor = {
    performance: !kinds.has(dom.gaps.performanceKind) && dom.gaps.performance,
    e2e: !CATALOGUE.some((e) => (e.ui || e.journey) && kinds.has(e.kind)) && dom.gaps.e2e,
    smoke: !kinds.has(dom.gaps.smokeKind) && dom.gaps.smoke,
    functional: !groups.some((g) => classify(groupText(g)) && MONEY_KINDS.has(kindOf(g))) && dom.gaps.functional,
    regression: false,
  };
  for (const id of tt.ids) {
    const gap = missingFor[id];
    const part = getTestingType(id);
    if (gap) add({ category: 'missing', severity: 'high', groupId: null, title: gap.title, detail: `${part.name}: ${part.focus}`, suggestion: gap.suggestion, sources: [] });
  }

  if (deltaPreview && baseline) {
    const oldById = new Map(baseline.requirements.map((r) => [r.id, r]));
    for (const d of deltaPreview.items.filter((x) => x.classification !== 'unchanged')) {
      const old = d.baselineRequirementId ? oldById.get(d.baselineRequirementId) : null;
      add({
        category: 'added', severity: 'medium', groupId: d.incoming.groupId || null,
        title: d.classification === 'enhanced' ? `Changes ${d.baselineRequirementId} of baseline ${baseline.id}` : `New for baseline ${baseline.id}`,
        detail: old ? `Was: ${old.text} Now: ${d.incoming.text}` : d.incoming.text,
        suggestion: d.classification === 'enhanced' ? 'Confirm the new value; its cases will be re-designed and the old version kept in history.' : 'Confirm it belongs in this increment; new cases will be designed for it.',
        sources: (d.incoming.origins || []).map((o) => ({ source: o.source, ref: o.ref || null, line: o.line || null, url: o.url || null, quote: o.quote })),
      });
    }
  }

  const count = (c) => findings.filter((f) => f.category === c).length;
  return {
    agent: 'Review agent',
    advisory: true,
    status: 'suggestions',
    generatedAt: new Date().toISOString(),
    testingType: tt.id,
    note: 'Suggestions only. The human reviewer decides every conflict and approves the requirement set.',
    counts: { added: count('added'), missing: count('missing'), conflicts: count('conflict'), ai: count('ai'), high: findings.filter((f) => f.severity === 'high').length },
    findings,
  };
}

module.exports = { reviewInputs };
