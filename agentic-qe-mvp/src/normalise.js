'use strict';
// Normalisation: the Jira initiative and epics, plus the codebase when the testing type reads it (DQE), -> one requirement set.
// Pure, deterministic code: no model involvement.
const { describe, jaccard, SAME_SUBJECT_THRESHOLD } = require('./text');

function assignIds(statements) {
  const n = { jira: 0, code: 0 };
  return statements.map((s) => {
    n[s.source] += 1;
    return { ...s, id: s.id || `${s.source === 'jira' ? 'J' : 'C'}${n[s.source]}`, ...describe(s.text) };
  });
}

/**
 * Groups statements that talk about the same subject and classifies each group:
 *  agreed     - Jira and code say the same thing
 *  jira-only  - only Jira states it
 *  code-only  - only the code states it
 *  conflict   - same subject, different values (left unresolved for a human)
 */
function normalise(rawStatements) {
  const statements = assignIds(rawStatements);
  const clusters = [];
  for (const s of statements) {
    let best = null;
    let bestScore = 0;
    for (const c of clusters) {
      const score = jaccard(s.tokens, c.tokens);
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (best && bestScore >= SAME_SUBJECT_THRESHOLD) best.members.push(s);
    else clusters.push({ tokens: s.tokens, members: [s] });
  }

  const groups = clusters.map((c, i) => {
    const bySig = new Map();
    for (const m of c.members) {
      if (!bySig.has(m.signature)) bySig.set(m.signature, []);
      bySig.get(m.signature).push(m);
    }
    const options = [...bySig.entries()].map(([signature, members], j) => ({
      optionId: `O${j + 1}`,
      signature,
      values: members[0].values,
      text: (members.find((m) => m.source === 'jira') || members[0]).text,
      sources: [...new Set(members.map((m) => m.source))],
      members: members.map((m) => m.id),
    }));
    const sources = [...new Set(c.members.map((m) => m.source))].sort();
    let bucket;
    if (options.length > 1) bucket = 'conflict';
    else if (sources.length === 2) bucket = 'agreed';
    else bucket = sources[0] === 'jira' ? 'jira-only' : 'code-only';
    return { id: `G${i + 1}`, bucket, subject: c.tokens.join(' '), text: options.length === 1 ? options[0].text : null, sources, options, members: c.members.map((m) => m.id) };
  });

  const counts = { statements: statements.length, groups: groups.length, agreed: 0, 'jira-only': 0, 'code-only': 0, conflict: 0 };
  groups.forEach((g) => { counts[g.bucket] += 1; });
  return { statements, groups, counts };
}

/**
 * Applies the human review. Every conflict must be resolved (or the group excluded)
 * before a reviewed set exists. The reviewed set - not the raw inputs - flows on.
 */
function applyReview(normalisation, { excluded = [], resolutions = {} } = {}) {
  const byId = new Map(normalisation.statements.map((s) => [s.id, s]));
  const unresolved = normalisation.groups.filter((g) => g.bucket === 'conflict' && !excluded.includes(g.id) && !resolutions[g.id]);
  if (unresolved.length) {
    const err = new Error(`Unresolved conflicts: ${unresolved.map((g) => g.id).join(', ')}`);
    err.code = 'UNRESOLVED_CONFLICTS';
    throw err;
  }
  return normalisation.groups.filter((g) => !excluded.includes(g.id)).map((g) => {
    const chosen = g.bucket === 'conflict' ? g.options.find((o) => o.optionId === resolutions[g.id]) : g.options[0];
    if (!chosen) throw new Error(`Unknown option ${resolutions[g.id]} for ${g.id}`);
    const members = g.members.map((id) => byId.get(id));
    return {
      groupId: g.id,
      bucket: g.bucket,
      text: chosen.text,
      values: chosen.values,
      signature: chosen.signature,
      sources: g.sources,
      origins: members.map((m) => ({ statementId: m.id, source: m.source, input: m.input, ...m.origin, quote: m.quote })),
      resolution: g.bucket === 'conflict'
        ? { chosen: { optionId: chosen.optionId, text: chosen.text, sources: chosen.sources },
          rejected: g.options.filter((o) => o !== chosen).map((o) => ({ optionId: o.optionId, text: o.text, sources: o.sources })) }
        : null,
    };
  });
}

module.exports = { normalise, applyReview };
