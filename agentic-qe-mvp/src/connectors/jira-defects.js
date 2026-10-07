'use strict';
// Raises platform defects in Jira, each linked to the story behind the failing test case.
const { jiraLiveConfig, liveRequest } = require('./jira');

const NOT_CONFIGURED = 'Jira write is not configured (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN): the defect is kept in the platform with its story link and a ready Jira payload';

const adf = (lines) => ({ type: 'doc', version: 1, content: lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: String(t) }] })) });
const label = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The Jira item a defect belongs to: the most specific level (story, then epic, then initiative), this cycle's items before the baseline's. */
function storyOf(defect, items = new Map()) {
  const keys = defect.jiraKeys && defect.jiraKeys.length ? defect.jiraKeys : defect.sourceRefs || [];
  for (const fromBaseline of [false, true]) {
    for (const level of ['story', 'epic', 'initiative']) {
      const k = keys.find((x) => (items.get(x) || {}).level === level && Boolean((items.get(x) || {}).fromBaseline) === fromBaseline);
      if (k) return k;
    }
  }
  return keys[0] || null;
}

function defectFields(d, { cycle, story }) {
  return {
    project: { key: story.split('-')[0] },
    summary: `[${d.id}] ${d.title}`.slice(0, 250),
    labels: ['agentic-qe', 'defect', label(`severity-${d.severity}`), label(cycle.id)],
    description: adf([
      `Raised by the Agentic QE Platform from a real failure in cycle ${cycle.id} (${cycle.name}).`,
      `Story: ${story}. Requirement ${d.requirementId}: ${d.requirementText || '-'}`,
      `Business rule: ${d.ruleId || '-'}. Test case: ${d.testCaseKey}. Script: ${d.scriptFile || '-'}.`,
      `Expected: ${d.expected}. Actual: ${d.actual}.`,
      `Failing assertion: ${d.assertion} (${d.location || '-'})`,
      `Severity: ${d.severity} - ${d.impact || ''}. ${d.releaseDecision || ''}`,
      `Suspected code area: ${d.suspectedCodeArea || '-'}. Executed at ${d.executedAt}.`,
      ...(d.aiTriage ? [`AI triage (${d.aiTriage.by}): ${d.aiTriage.category} - ${d.aiTriage.rationale}`] : []),
      ...(d.ai ? [
        `AI-drafted summary (${d.ai.by}, review before triage): ${d.ai.summary}`,
        `Steps to reproduce: ${d.ai.stepsToReproduce.map((x, i) => `${i + 1}. ${x}`).join(' ')}`,
        `Likely cause (AI): ${d.ai.likelyCause || '-'}. Business impact (AI): ${d.ai.businessImpact || '-'}`,
      ] : []),
    ]),
  };
}

/** Bug if the project has one, else the env override, else a sub-task of the story, else Task. */
async function pickIssueType(cfg, fetchImpl, project, env) {
  const meta = await liveRequest(cfg, fetchImpl, 'GET', `/rest/api/3/issue/createmeta/${project}/issuetypes`);
  const types = meta.issueTypes || meta.values || [];
  const byName = (n) => types.find((t) => t.name.toLowerCase() === String(n).toLowerCase());
  const t = (env.JIRA_DEFECT_ISSUE_TYPE && byName(env.JIRA_DEFECT_ISSUE_TYPE)) || byName('Bug') || byName('Defect') || types.find((x) => x.subtask) || byName('Task');
  if (!t) throw new Error(`Project ${project} has no issue type that can hold a defect`);
  return { name: t.name, id: t.id, subtask: !!t.subtask };
}

async function raiseDefectsInJira(defects, { cycle, env = process.env, fetchImpl = globalThis.fetch, items } = {}) {
  const cfg = jiraLiveConfig(env);
  for (const d of defects) {
    const story = storyOf(d, items);
    if (!story) { d.jira = { status: 'not raised', reason: 'The failing test case has no Jira item to link to' }; continue; }
    if (d.jira && d.jira.key) {
      if (!cfg) { d.jira = { ...d.jira, status: 'raised', note: `Still open in ${cycle.id}; Jira not configured, so no comment was added` }; continue; }
      try {
        await liveRequest(cfg, fetchImpl, 'POST', `/rest/api/3/issue/${d.jira.key}/comment`, { body: adf([`Still failing in cycle ${cycle.id}: expected ${d.expected}, actual ${d.actual} (${d.testCaseKey}).`]) });
        d.jira = { ...d.jira, status: 'raised', updatedInCycle: cycle.id };
      } catch (e) { d.jira = { ...d.jira, lastError: e.message }; }
      continue;
    }
    const fields = defectFields(d, { cycle, story });
    if (!cfg) { d.jira = { status: 'not raised', reason: NOT_CONFIGURED, linkedTo: story, payload: { fields, link: { type: 'Relates', to: story } } }; continue; }
    try {
      const type = await pickIssueType(cfg, fetchImpl, fields.project.key, env);
      const body = { fields: { ...fields, issuetype: { id: type.id }, ...(type.subtask ? { parent: { key: story } } : {}) } };
      const created = await liveRequest(cfg, fetchImpl, 'POST', '/rest/api/3/issue', body);
      if (!type.subtask) {
        await liveRequest(cfg, fetchImpl, 'POST', '/rest/api/3/issueLink', { type: { name: 'Relates' }, inwardIssue: { key: created.key }, outwardIssue: { key: story } });
      }
      d.jira = { status: 'raised', key: created.key, url: `${cfg.baseUrl}/browse/${created.key}`, issueType: type.name, linkedTo: story,
        link: type.subtask ? 'sub-task of' : 'relates to', raisedAt: new Date().toISOString(), cycleId: cycle.id };
    } catch (e) {
      d.jira = { status: 'failed', reason: e.message, linkedTo: story, payload: { fields, link: { type: 'Relates', to: story } } };
    }
  }
  return defects;
}

/** One line for reports and the UI. */
function jiraDefectText(d) {
  const j = d.jira;
  if (!j) return 'not raised in Jira';
  if (j.key) return `${j.key} (${j.issueType || 'issue'}, ${j.link || 'linked to'} ${j.linkedTo})`;
  if (j.status === 'failed') return `Jira call failed: ${j.reason}`;
  return `not raised in Jira${j.linkedTo ? `; linked to ${j.linkedTo} in the platform` : ''}`;
}

module.exports = { raiseDefectsInJira, storyOf, defectFields, jiraDefectText, NOT_CONFIGURED };
