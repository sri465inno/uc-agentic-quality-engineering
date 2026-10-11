'use strict';
// The wider Agentic QE Platform (seven agents, many input types) and the slice of it this MVP implements.

const PLATFORM_AGENTS = [
  { no: 1, id: 'requirements', name: 'Requirements agent', produces: 'One common requirement set, story by story, for BA, PO and QE review: each requirement with its business rule, exact values, source quotes and Jira keys (versioned and traceable)' },
  { no: 2, id: 'testcases', name: 'Test design agent', produces: 'Functional and non-functional test cases (Zephyr Scale Excel export)' },
  { no: 3, id: 'testdata', name: 'Test data agent', produces: 'One data set per test case, generated from the data dictionary and checked against it' },
  { no: 4, id: 'scripts', name: 'Automation agent', produces: 'Self-contained Playwright specs that load their test data' },
  { no: 5, id: 'execution', name: 'Execution agent', produces: 'Real Playwright run results with evidence' },
  { no: 6, id: 'defects', name: 'Defect agent', produces: 'Defects raised only from real failures' },
  { no: 7, id: 'report', name: 'Reporting agent', produces: 'Cycle report, coverage and cycle comparison' },
];

// Governance helper that runs before the human review; advisory only, it does not replace one of the seven agents.
const REVIEW_AGENT = {
  id: 'review-agent', name: 'Review agent',
  produces: 'Suggestions for the reviewer: what one input adds, what is missing, what conflicts, and what the chosen type of testing still needs',
  note: 'Advisory only. The human reviewer decides every conflict and approves the requirement set.',
};

// Deterministic intake and human gates around the agents (not agents: no design decisions are delegated here).
const INTAKE_STAGES = ['ingest', 'normalise', 'review-agent', 'review', 'delta', 'merge-approval'];

const INPUT_TYPES = [
  { id: 'jira-initiative', name: 'Jira initiative', mvp: 'implemented', note: 'Business capability scope (AQPI-1)', about: 'The business capability and its goals, as written in Jira.', reads: 'Scope, objectives and the business rules stated at initiative level.', usedBy: ['requirements'] },
  { id: 'jira-epic', name: 'Jira epic (+ child stories)', mvp: 'implemented', note: 'Acceptance criteria per epic (AQPI-2 to AQPI-27; AQPI-32 + revised AQPI-23 for release 2.0)', about: 'A slice of that capability with its stories and acceptance criteria.', reads: 'Acceptance criteria and expected values for each story.', usedBy: ['requirements', 'testcases'] },
  { id: 'codebase', name: 'Codebase (GitHub branch)', mvp: 'implemented', note: 'README, TRACEABILITY, @rule config notes and the booking data dictionary', about: 'The application source for the capability.', reads: 'The rules as actually implemented, source comments and README notes.', usedBy: ['requirements', 'testdata', 'scripts'] },
  { id: 'data-model', name: 'Data model / data dictionary', mvp: 'via codebase', note: 'Read from data-dictionary/ in the codebase input; not a separate input', about: 'The fields a record carries, with types and allowed values.', reads: 'Attributes, allowed values and example data for test data.', usedBy: ['testcases', 'scripts'] },
  { id: 'confluence', name: 'Confluence / BRD / FRD documents', mvp: 'platform only', about: 'Business and functional requirement documents.', reads: 'Narrative rules, definitions and worked examples.', usedBy: ['requirements'] },
  { id: 'api-contract', name: 'API contracts (OpenAPI)', mvp: 'platform only', about: 'OpenAPI definitions of the services.', reads: 'Endpoints, request and response shapes, status codes.', usedBy: ['testcases', 'scripts'] },
  { id: 'existing-tests', name: 'Existing test suites (Zephyr / Xray)', mvp: 'platform only', about: 'Test cases the project already owns.', reads: 'Existing cases to reuse, avoid duplicating and measure coverage against.', usedBy: ['testcases', 'report'] },
  { id: 'defect-history', name: 'Defect and incident history', mvp: 'platform only', about: 'Past defects and production incidents.', reads: 'Failure patterns that raise test priority and help match repeat defects.', usedBy: ['testcases', 'defects'] },
  { id: 'ui-design', name: 'UI designs (Figma)', mvp: 'platform only', about: 'Screen designs for the user journeys.', reads: 'Screens, fields and journeys for UI test cases and scripts.', usedBy: ['testcases', 'scripts'] },
  { id: 'regulatory', name: 'Policy and contract documents (e.g. market stay policies)', mvp: 'platform only', about: 'Policies, contracts and regulations the capability must follow.', reads: 'Mandatory rules and limits that must be tested and reported.', usedBy: ['requirements', 'testcases', 'report'] },
];

const DEMO = {
  capability: 'Guest hotel booking from search to confirmation (AQPI-1)',
  system: 'Hotel booking platform: six Java 21 Spring Boot WebFlux services (search, hotel, offer, cart, reservation, notification)',
  flow1: 'AQPI-1 initiative + 7 epics (AQPI-2 to AQPI-27) with 23 stories + codebase branch demo/hotel-booking-platform (release 1.0). EQE and Functional cycles build the hotel baseline. Release 1.0 has three real defects: a 9-room search is accepted (AQPI-4), a 0.5% price change already asks for acknowledgement (AQPI-17) and a 7-character Idempotency-Key is accepted (AQPI-21).',
  flow2: 'Epic 8 AQPI-32 (stories AQPI-33 to AQPI-36) + Epic 6 AQPI-23 as revised for release 2.0 (AQPI-24 to AQPI-26, new AQPI-37) + codebase branch demo/hotel-booking-platform-v2 (release 2.0). Changed: cart hold 30 -> 20 minutes, Paris stay 21 -> 14 nights, resends 3 -> 5, ops e-mail retries 2 -> 3, confirmation states the free-cancellation deadline. New: free cancellation up to 48 hours before check-in, cancellation e-mail. Release 2.0 fixes the 9-room search defect (AQPI-4), which Flow 2 retests and certifies closed; the other two Flow 1 defects stay open. New defects in the release 2.0 requirements: a 15-night Paris stay is accepted (AQPI-34) and a 4th ops e-mail retry is accepted (AQPI-25).',
};

// Demo examples a presenter can run. The example decides the inputs; the cycle mode (baseline or
// incremental) and the type of testing are chosen separately on the Run page.
const DEMO_EXAMPLES = [
  {
    id: 'hotel', flow: 1, name: 'Hotel booking platform (AQPI)', short: 'Hotel booking',
    system: DEMO.system,
    about: 'Flow 1: AQPI-1 initiative + its 7 epics and 23 stories + the Java codebase on demo/hotel-booking-platform (release 1.0). Flow 2: Epic 8 AQPI-32 "Release 2.0" and its 4 stories + Epic 6 AQPI-23 "Confirmation and Notifications" as revised for release 2.0 (AQPI-24, AQPI-25 changed, AQPI-37 new) + demo/hotel-booking-platform-v2, added on top of the hotel baseline. Functional runs the API cases, Regression adds the privacy, security and resilience cases, End-to-end runs the guest journeys from search to the confirmation e-mail.',
    modes: ['baseline', 'incremental'],
    testingTypes: ['eqe', 'functional'],
    samples: { initiative: 'AQPI-1', epic: 'AQPI-2, AQPI-6, AQPI-10, AQPI-14, AQPI-18, AQPI-23, AQPI-27', incrementalEpic: 'AQPI-32, AQPI-23', incrementalSnapshot: 'release-2.0', baselineBranch: 'demo/hotel-booking-platform', incrementalBranch: 'demo/hotel-booking-platform-v2' },
  },
];

/** The demo example a cycle ran on, from its system under test. */
const exampleOf = (cycle) => DEMO_EXAMPLES.find((e) => e.samples.baselineBranch === cycle?.sutBuild || e.samples.incrementalBranch === cycle?.sutBuild) || null;

module.exports = { PLATFORM_AGENTS, REVIEW_AGENT, INTAKE_STAGES, INPUT_TYPES, DEMO, DEMO_EXAMPLES, exampleOf };
