'use strict';

/** Which commission-driving attributes of the reservation model are varied by at least one test case, and with what result. */
function computeAttributeCoverage(dataModel, testCases, results = []) {
  if (!dataModel) return null;
  const resByKey = new Map(results.map((r) => [r.key, r]));
  const rows = dataModel.drivers.map((d) => {
    const cases = testCases.filter((t) => (t.varies || []).includes(d.name));
    const statuses = cases.map((t) => resByKey.get(t.key)?.status).filter((s) => s === 'passed' || s === 'failed');
    const status = !cases.length ? 'not exercised' : !statuses.length ? 'designed, not executed' : statuses.includes('failed') ? 'exercised - failing' : 'exercised - passing';
    return { attribute: d.name, description: d.description, cases: cases.map((t) => t.key), status };
  });
  const exercised = rows.filter((r) => r.cases.length).length;
  return {
    model: dataModel.name, file: dataModel.file, attributeCount: dataModel.attributeCount, driverCount: rows.length, exercised,
    percent: rows.length ? Math.round((exercised / rows.length) * 1000) / 10 : 0,
    rows,
  };
}

function computeCoverage(requirements, testCases, results = [], dataModel = null) {
  const resByKey = new Map(results.map((r) => [r.key, r]));
  const rows = requirements.map((req) => {
    const cases = testCases.filter((t) => t.requirementId === req.id);
    const automated = cases.filter((t) => t.automation === 'Automated');
    const executed = cases.filter((t) => ['passed', 'failed'].includes(resByKey.get(t.key)?.status));
    const failed = executed.filter((t) => resByKey.get(t.key).status === 'failed');
    let status;
    if (!cases.length) status = 'not covered';
    else if (!executed.length) status = automated.length ? 'automation test case, not executed' : 'designed only (manual)';
    else status = failed.length ? 'executed - failing' : 'executed - passing';
    return { requirementId: req.id, text: req.text, cases: cases.length, automated: automated.length, executed: executed.length, failed: failed.length, status };
  });
  const pct = (n) => (requirements.length ? Math.round((n / requirements.length) * 1000) / 10 : 0);
  return {
    rows,
    attributes: computeAttributeCoverage(dataModel, testCases, results),
    totals: {
      requirements: requirements.length,
      designed: rows.filter((r) => r.cases > 0).length,
      automated: rows.filter((r) => r.automated > 0).length,
      executed: rows.filter((r) => r.executed > 0).length,
      passing: rows.filter((r) => r.status === 'executed - passing').length,
    },
    percent: {
      designed: pct(rows.filter((r) => r.cases > 0).length),
      automated: pct(rows.filter((r) => r.automated > 0).length),
      executed: pct(rows.filter((r) => r.executed > 0).length),
      passing: pct(rows.filter((r) => r.status === 'executed - passing').length),
    },
  };
}

module.exports = { computeCoverage, computeAttributeCoverage };
