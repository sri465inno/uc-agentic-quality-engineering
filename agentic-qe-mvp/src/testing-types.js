'use strict';
// Type of testing chosen on Run: EQE (enterprise end-to-end business flows) or DQE (domain functional: the domain rules).
// Together with the project inputs, the skills and the flow it decides which test cases the design agents
// produce and which of them the execution agent runs. The rest of the process is the same for both.
//
// Every candidate case has a suite:
//   api      a domain-rule check through the service API (DQE)
//   journey  an end-to-end business flow across the services (EQE)
//   ui       a browser check of a screen described in the inputs (EQE)
//   nfr      an enterprise quality check stated in the inputs: privacy, security, observability, resilience (EQE)
//   load     the same non-functional target under concurrent users (EQE)

const TESTING_TYPES = [
  {
    id: 'eqe', name: 'EQE testing', short: 'EQE', dimension: 'Enterprise end-to-end business flows', suites: ['journey', 'ui', 'nfr', 'load'],
    inputs: { baseline: ['initiative', 'epic'], incremental: ['epic'] },
    inputNote: 'Jira initiative, epics and stories only: EQE tests the business journeys through the running services, not their code or API contract, so there is no Jira-vs-code gap check.',
    signoff: { owner: 'EQE lead', accountability: 'Enterprise assurance: the business journeys work end to end across the services' },
    produces: { functional: true, nonFunctional: true },
    focus: 'Enterprise end-to-end business flows across the services, plus the enterprise qualities the inputs state.',
    baseline: 'Designs one end-to-end journey per business flow in the inputs plus the enterprise quality checks, and runs them across the services with the evidence of every step.',
    incremental: 'Keeps the journeys already in the baseline, re-designs the ones whose flow changed, adds journeys for new flows, then runs the business flows on the new build.',
    agents: {
      requirements: 'Groups the approved requirements by business flow (epic) so each journey traces to the stories it crosses',
      testcases: 'Business-flow journeys written from the user’s point of view, plus enterprise quality checks',
      testdata: 'One end-to-end data set per journey',
      scripts: 'Playwright specs that drive each journey step by step',
      execution: 'Runs the business flows end to end and keeps the evidence of each step',
      defects: 'Defects name the broken business flow and the step that failed',
      report: 'Business-flow readiness: which journeys work end to end and which are blocked',
    },
    domains: {
      hotel: {
        focus: "The guest's business flows across the six services (search, hotel details, offers, cart, payment, reservation, confirmation and cancellation e-mails), plus the privacy, security, observability and resilience checks (AQPI-28 to AQPI-31).",
        baseline: 'Designs one API journey per guest business flow and the enterprise quality checks, and runs them against the six hotel services, keeping every request and response as evidence. The services have no browser screen, so no screenshots are taken.',
        agents: {
          testcases: 'Guest-journey cases from search to the confirmation e-mail, plus enterprise quality checks',
          testdata: 'A search, stay and guest for each journey',
          scripts: 'Playwright API specs that call the services in journey order',
          execution: 'Runs the journeys against the six hotel services and keeps each request and response',
        },
      },
    },
  },
  {
    id: 'functional', name: 'DQE testing', short: 'DQE', dimension: 'Domain functional: rules, boundaries and invalid inputs', suites: ['api'],
    inputs: { baseline: ['initiative', 'epic', 'codebase', 'api'], incremental: ['epic', 'codebase', 'api'] },
    inputNote: 'Jira, the codebase and the API endpoints: DQE certifies the domain rules as coded, and the Jira stories missing from the code become gap defects.',
    signoff: { owner: 'DQE lead', accountability: 'Domain certification: every domain rule holds at its limits' },
    produces: { functional: true, nonFunctional: false },
    focus: 'Every domain rule and its boundaries, checked through the service API.',
    baseline: 'Designs a functional test case for every domain rule, both sides of every boundary, and runs them all.',
    incremental: 'Keeps the functional cases already in the baseline, re-designs the ones whose rule changed, adds cases for new rules, then runs the functional pack.',
    agents: {
      requirements: 'One business rule with its exact values per requirement',
      testcases: 'Functional cases for every domain rule, including both sides of each boundary',
      testdata: 'One data set per case, with the drivers either side of each boundary',
      scripts: 'API-level Playwright specs, one per business rule',
      execution: 'Runs every functional case against the build',
      defects: 'Defects name the rule, the expected value and the actual value',
      report: 'Rule coverage: which domain rules hold and which are broken',
    },
  },
];

const DEFAULT_TESTING_TYPE = 'functional';
const BY_ID = new Map(TESTING_TYPES.map((t) => [t.id, t]));

/** Id of a testing-type value: one id (a one-element list is accepted for older clients). */
function testingTypeIds(value) {
  if (value === undefined || value === null || value === '') return [DEFAULT_TESTING_TYPE];
  const list = Array.isArray(value) ? value : String(value).split('+');
  if (list.length !== 1 || !BY_ID.has(list[0])) throw new Error(`testingType must be one of: ${TESTING_TYPES.map((x) => x.id).join(', ')} (choose exactly one)`);
  return list;
}

/** A testing type with the wording of one domain (e.g. 'hotel') applied over the default wording. */
function inDomain(t, domainId) {
  const o = t.domains?.[domainId];
  return o ? { ...t, ...o, agents: { ...t.agents, ...o.agents } } : t;
}

function getTestingType(value, domainId) {
  const ids = testingTypeIds(value);
  return { ...inDomain(BY_ID.get(ids[0]), domainId), ids };
}

/** Suite of a persisted case; cases designed before suites existed fall back on their type. */
function suiteOf(tc) {
  if (tc.suite) return tc.suite;
  if (tc.ui) return 'ui';
  return tc.type === 'non-functional' ? 'nfr' : 'api';
}

/** Whether a case belongs in a run of this testing type. */
function inRun(type, { suite }) {
  return type.suites.includes(suite);
}

module.exports = { TESTING_TYPES, DEFAULT_TESTING_TYPE, getTestingType, testingTypeIds, suiteOf, inRun };
