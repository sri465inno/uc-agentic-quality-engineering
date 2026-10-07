'use strict';
// Reporting agent's AI step: drafts the QE-lead narrative, risks and recommendation. Every number it is given was
// computed in code, and a draft that states any other number is rejected for the template.
const { AiSession, aiConfig, onlyKnownNumbers } = require('./ai');

function modelConfig(env = process.env) {
  const cfg = aiConfig(env);
  return cfg ? { provider: cfg.provider, model: cfg.model } : null;
}

function templateNarrative(f) {
  const parts = [
    `${f.cycleName} (${f.cycleType}) worked from ${f.inputs}.`,
    `The reviewed requirement set holds ${f.requirements} requirements${f.delta ? ` (${f.delta})` : ''}.`,
    `${f.testCases} test cases are designed, ${f.automated} of them automated in ${f.scripts} Playwright scripts.`,
    f.executed ? `Execution ran ${f.executed} automated cases for real: ${f.passed} passed and ${f.failed} failed (pass rate ${f.passRate}%).` : 'The suite has not been executed yet.',
    f.defects ? `${f.defects} defect(s) were raised from real failures: ${f.defectTitles}.` : 'No defects were raised.',
  ];
  return parts.join(' ');
}

/** `guidance` is the concatenated body of the skills that target the report agent (and only those). */
async function draftNarrative(facts, { env = process.env, fetchImpl = globalThis.fetch, guidance = '', ai = new AiSession({ env, fetchImpl }) } = {}) {
  const fallback = { text: templateNarrative(facts), risks: [], recommendation: null, draftedBy: 'Deterministic template (demo mode - no model API key set)', origin: 'rule-based' };
  if (!ai.enabled) return fallback;
  const rep = await ai.json('report', 'Write the QE-lead narrative, risks and recommendation', {
    guidance,
    system: 'You are a QE lead writing the cycle summary for business and delivery stakeholders.',
    prompt: `Write a 4-sentence business summary of this QA cycle for a non-technical reader, up to 3 release risks, and a one-sentence release recommendation. Use only these facts; do not state any number that is not in them.
Reply as {"narrative":"...","risks":["..."],"recommendation":"..."}.
${JSON.stringify(facts)}`,
    maxTokens: 900,
  });
  const risks = rep && Array.isArray(rep.risks) ? rep.risks.filter((x) => typeof x === 'string' && x.trim()).slice(0, 3) : [];
  const all = rep ? [rep.narrative, rep.recommendation, ...risks].join(' ') : '';
  if (!rep || typeof rep.narrative !== 'string' || !rep.narrative.trim()) {
    ai.outcome('report', { rejected: 1, note: 'No usable narrative; template used' });
    return { ...fallback, draftedBy: 'Deterministic template (model call failed or replied without a narrative)' };
  }
  if (!onlyKnownNumbers(all, facts)) {
    ai.outcome('report', { rejected: 1, note: 'Narrative stated a number not in the computed facts; template used' });
    return { ...fallback, draftedBy: `Deterministic template (the ${ai.label} draft stated a number not in the computed facts, so it was rejected)` };
  }
  ai.outcome('report', { accepted: 1, note: 'Narrative, risks and recommendation drafted' });
  return { text: rep.narrative.trim(), risks, recommendation: typeof rep.recommendation === 'string' ? rep.recommendation.trim() : null,
    draftedBy: `AI (${ai.label}) - prose only; every figure computed in code and checked against the draft`, origin: 'ai' };
}

module.exports = { draftNarrative, modelConfig, templateNarrative };
