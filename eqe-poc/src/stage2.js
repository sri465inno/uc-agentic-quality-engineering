'use strict';
// Stage 2 - Intelligent Design: approved Stage-1 requirements -> scenarios, Zephyr-ready cases with steps and expected results,
// guest journeys and per-case *.spec.ts design scaffolds. Happy-path default (G3): only what the acceptance criteria ask for;
// business-rule negatives only when the run asks for them.
const { CONCEPTS } = require('../framework/ui-map');
const playbook = require('../framework/test-data/playbook.json');

const byId = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));
const relDate = (v) => {
  const m = /^([+-]\d+)d$/.exec(String(v));
  return m ? `today${m[1]}d` : v;
};
const fillData = (s) => String(s).replace(/\{(\w+)\.(\w+)\}/g, (all, entry, field) => {
  const e = playbook.entries[entry];
  return e && e[field] !== undefined ? relDate(e[field]) : all;
});

function withPrereqs(concept, seen = new Set()) {
  const out = [];
  for (const r of concept.requires || []) if (!seen.has(r)) { seen.add(r); out.push(...withPrereqs(byId[r], seen), byId[r]); }
  return out;
}

function design(stage1, { includeNegatives = false } = {}) {
  const cases = [];
  const counter = {};
  const nextId = (story) => { counter[story] = (counter[story] || 0) + 1; return `TC-${story}-${String(counter[story]).padStart(2, '0')}`; };
  const covered = new Set();
  const reqs = stage1.requirements.filter((r) => r.kind === 'AC' || (includeNegatives && r.kind === 'BR'));
  for (const req of reqs) {
    if (req.lens === 'Non-UI') continue;
    const matched = req.concepts.map((id) => byId[id]);
    if (req.kind === 'BR' && matched.length && matched.every((c) => covered.has(c.id))) continue;
    const checks = matched.filter((c) => c.kind === 'check');
    const groups = checks.length ? checks.map((c) => [...withPrereqs(c), c]) : matched.length ? [matched] : [];
    if (!groups.length) {
      cases.push({
        id: nextId(req.story), story: req.story, epic: req.epic, req: req.id, source: req.kind, title: `Verify ${req.text.replace(/\.$/, '').slice(0, 90)}`,
        objective: req.text, scenario: `SC-${req.story}`, scenarioTitle: req.storySummary, type: req.kind === 'BR' ? 'Negative' : 'Positive', priority: 'Medium',
        journey: 'Manual', preconditions: 'demo-booking reachable; synthetic data only', automatable: false, concepts: [], dataNeeds: ['(unmapped)'],
        steps: [{ n: 1, action: `Exercise the behaviour required by ${req.id}`, data: '', expected: req.text }],
        note: 'No reusable framework component: designed as a manual case (see gap register).',
      });
      continue;
    }
    for (const group of groups) {
      const main = group[group.length - 1];
      group.forEach((c) => covered.add(c.id));
      const steps = [];
      for (const c of group) c.steps.forEach((s, i) => {
        if (steps.length && c !== main && steps.some((x) => x.action === fillData(s.action))) return;
        if (steps.length && /^Open the demo-booking hotel search page/.test(s.action) && steps.some((x) => /^Open the demo-booking/.test(x.action))) return;
        steps.push({ n: steps.length + 1, action: fillData(s.action), data: s.data || '', expected: fillData(s.expected), ref: [c.id, i] });
      });
      const dataNeeds = [...new Set(group.flatMap((c) => c.data))];
      cases.push({
        id: nextId(req.story), story: req.story, epic: req.epic, req: req.id, source: req.kind, title: main.title, objective: req.text,
        scenario: `SC-${req.story}`, scenarioTitle: req.storySummary, type: main.polarity === 'negative' ? 'Negative' : 'Positive',
        priority: main.kind === 'journey' ? 'High' : main.polarity === 'negative' ? 'Medium' : 'High', journey: main.journey,
        preconditions: `demo-booking reachable; test data from playbook entr${dataNeeds.length === 1 ? 'y' : 'ies'} ${dataNeeds.join(', ') || '(none)'}`,
        automatable: true, concepts: group.map((c) => c.id), dataNeeds: dataNeeds.length ? dataNeeds : [], steps,
        derivedNegative: req.kind === 'BR',
      });
    }
  }
  const scenarios = [...new Map(cases.map((c) => [c.scenario, { id: c.scenario, title: c.scenarioTitle, story: c.story, epic: c.epic }])).values()]
    .map((s) => ({ ...s, cases: cases.filter((c) => c.scenario === s.id).map((c) => c.id) }));
  const journeys = [...new Set(cases.map((c) => `${c.epic}|${c.journey}`))].map((k) => {
    const [epic, name] = k.split('|');
    const list = cases.filter((c) => c.epic === epic && c.journey === name);
    return { epic, name, cases: list.map((c) => c.id), stories: [...new Set(list.map((c) => c.story))], flow: [...new Set(list.flatMap((c) => c.steps.map((s) => s.action.split(' ').slice(0, 4).join(' '))))].slice(0, 6) };
  });
  return { cases, scenarios, journeys, options: { includeNegatives } };
}

function scaffold(c) {
  const lines = [
    '// Stage 2 design scaffold - not executable; Stage 3 generates the runnable spec from the approved case.',
    "import { test } from '@playwright/test';",
    '',
    `test.describe('${c.scenario}: ${c.scenarioTitle.replace(/'/g, "\\'")}', () => {`,
    `  // Traces: ${c.epic} > ${c.story} > ${c.req} | ${c.type} | ${c.priority} | journey: ${c.journey}`,
    `  // Objective: ${c.objective}`,
    `  test.fixme('${c.id}: ${c.title.replace(/'/g, "\\'")}', async () => {`,
    ...c.steps.flatMap((s) => [`    // Step ${s.n}: ${s.action}`, `    //   Expected: ${s.expected}`]),
    '  });',
    '});',
    '',
  ];
  return lines.join('\n');
}

module.exports = { design, scaffold, fillData };
