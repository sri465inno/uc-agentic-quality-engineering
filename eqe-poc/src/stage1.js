'use strict';
// Stage 1 - Cognitive Analysis: Jira initiative + epics + stories -> requirements, rules, risks, testability, gaps (BRD pack).
const { CONCEPTS } = require('../framework/ui-map');
const { tokenSet, containsPhrase } = require('./text');

const NON_UI = /\b(log|logs|logging|audit|correlation id|server-side only|api|idempot|performance|latency|throughput|p95|encrypt|retention|database|uptime)\b/i;
const AMBIGUOUS = ['clearly', 'sufficient', 'relevant', 'approved', 'supported', 'appropriate', 'configurable', 'such as', 'when data is available', 'major', 'consistently', 'quickly'];
const RISKS = [
  [/payment|card|pci|authori[sz]/i, 'High', 'Payment handling'],
  [/do not log|personal data|sensitive|pii|mask/i, 'High', 'Privacy / sensitive data'],
  [/idempot|duplicate|repeated submission|inconsistent/i, 'High', 'Data consistency on repeated actions'],
  [/inventory changes|price change|availability changes/i, 'Medium', 'Inventory / price volatility'],
  [/reject|invalid|validation|mandatory/i, 'Medium', 'Input validation'],
  [/accessib|assistive/i, 'Medium', 'Accessibility'],
  [/fail|unavailable|retry|timeout/i, 'Medium', 'Dependency failure handling'],
];

function matchConcepts(text) {
  const set = tokenSet(text);
  return CONCEPTS.filter((c) => c.triggers.some((t) => containsPhrase(set, t)));
}

function testability(text) {
  const matched = matchConcepts(text);
  if (matched.length) return { lens: 'UI', automation: 'reusable component', concepts: matched.map((c) => c.id) };
  if (NON_UI.test(text)) return { lens: 'Non-UI', automation: 'outside key-element E2E lens', concepts: [] };
  return { lens: 'UI', automation: 'no reusable component', concepts: [] };
}

function analyse(input, epicKeys) {
  const epics = input.epics.filter((e) => epicKeys.includes(e.key));
  if (!epics.length) throw new Error('Select at least one epic of the initiative');
  const requirements = []; const risks = []; const gaps = [];
  const gap = (g) => gaps.push({ id: `GAP-${String(gaps.length + 1).padStart(3, '0')}`, status: 'Open', ...g });
  for (const epic of epics) {
    for (const story of epic.stories) {
      const add = (kind, i, text) => {
        const t = testability(text);
        const id = `${story.key}-${kind}${i + 1}`;
        requirements.push({ id, epic: epic.key, story: story.key, storySummary: story.summary, kind, text, ...t, url: story.url });
        for (const word of AMBIGUOUS) {
          if (new RegExp(`\\b${word}\\b`, 'i').test(text)) gap({ category: 'Ambiguity', ref: id, story: story.key, description: `"${word}" in ${id} is not measurable as written: "${text}"`, owner: 'Product Owner', action: 'Confirm the measurable expectation before the case is approved' });
        }
        if (t.lens === 'Non-UI') gap({ category: 'Outside UI lens', ref: id, story: story.key, description: `${id} cannot be verified through key UI elements: "${text}"`, owner: 'QE lead', action: 'Route to API / observability testing (out of PoC UI scope)' });
        else if (t.automation === 'no reusable component') gap({ category: 'Framework gap', ref: id, story: story.key, description: `No reusable Page Object / journey in the demo-booking framework covers ${id}`, owner: 'Automation engineer', action: 'Designed as a manual case; add a Page Object method before automating (G5-G7 reuse first)' });
      };
      story.acceptanceCriteria.forEach((t, i) => add('AC', i, t));
      story.businessRules.forEach((t, i) => add('BR', i, t));
      if (story.logging.length) {
        requirements.push({ id: `${story.key}-LOG`, epic: epic.key, story: story.key, storySummary: story.summary, kind: 'LOG', text: `Logging and audit: ${story.logging.join('; ')}`, lens: 'Non-UI', automation: 'outside key-element E2E lens', concepts: [], url: story.url });
        gap({ category: 'Outside UI lens', ref: `${story.key}-LOG`, story: story.key, description: `Logging/audit requirements of ${story.key} (${story.logging.length} items) are not observable in the UI`, owner: 'QE lead', action: 'Verify through log inspection in a later stage (out of PoC scope)' });
      }
      if (!story.acceptanceCriteria.length) gap({ category: 'Missing acceptance criteria', ref: story.key, story: story.key, description: `${story.key} has no acceptance criteria`, owner: 'Product Owner', action: 'Add acceptance criteria' });
      const all = [story.userStory, story.description, ...story.acceptanceCriteria, ...story.businessRules, ...story.logging].join(' ');
      for (const [re, level, name] of RISKS) if (re.test(all)) risks.push({ story: story.key, level, risk: name, evidence: (all.match(re) || [''])[0] });
      for (const d of story.dependencies) if (!/none identified/i.test(d)) risks.push({ story: story.key, level: 'Medium', risk: `Dependency: ${d}`, evidence: 'Dependencies section' });
    }
  }
  const acs = requirements.filter((r) => r.kind === 'AC');
  return {
    initiative: { key: input.initiative.key, summary: input.initiative.summary, url: input.initiative.url, objective: input.initiative.sections.Objective || [], inScope: input.initiative.inScope, outOfScope: input.initiative.outOfScope },
    epics: epics.map((e) => ({ key: e.key, summary: e.summary, url: e.url, stories: e.stories.map((s) => ({ key: s.key, summary: s.summary, url: s.url, userStory: s.userStory, description: s.description, priority: s.priority, status: s.status, acceptanceCriteria: s.acceptanceCriteria.length, businessRules: s.businessRules.length })) })),
    requirements, risks, gaps,
    summary: {
      epics: epics.length, stories: epics.reduce((n, e) => n + e.stories.length, 0), acceptanceCriteria: acs.length,
      businessRules: requirements.filter((r) => r.kind === 'BR').length, uiTestable: acs.filter((r) => r.lens === 'UI').length,
      automatable: acs.filter((r) => r.automation === 'reusable component').length, gaps: gaps.length, risks: risks.length,
    },
  };
}

module.exports = { analyse, matchConcepts, testability };
