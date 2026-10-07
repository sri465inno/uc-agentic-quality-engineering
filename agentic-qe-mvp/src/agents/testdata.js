'use strict';
// Test data agent: one data set per test case, generated from the data dictionary in the codebase input.
// The case fixes its drivers (commission or booking); every other attribute takes its dictionary example.
// Each value is checked against the spec; a case that deliberately breaks it (an HTTP 4xx case) is a negative test.

const clone = (x) => JSON.parse(JSON.stringify(x));

function coerce(attr, raw) {
  const v = String(raw).trim();
  if (attr.type === 'integer' || attr.type === 'decimal') return v === '' ? v : Number(v);
  if (attr.type === 'boolean') return v === 'true' ? true : v === 'false' ? false : v;
  return v;
}

/** Splits a case's test data line into dictionary attributes (drivers) and run parameters. */
function readCaseData(testData, attrs) {
  const drivers = [];
  const parameters = {};
  for (const part of String(testData || '').split(';')) {
    const m = part.match(/^\s*([\w.]+(?:\s[\w.]+)*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const attr = attrs.get(m[1]);
    if (!attr) { parameters[m[1]] = m[2]; continue; }
    const values = m[2].split(/\s*\|\s*/).map((x) => coerce(attr, x));
    drivers.push({ attribute: attr.name, value: values[0], ...(values.length > 1 ? { variants: values } : {}) });
  }
  return { drivers, parameters };
}

function specOf(attr) {
  if (attr.values) return `one of ${attr.values.join(', ')}`;
  return `${attr.type}${attr.required ? ', required' : ''}`;
}

function checkValue(attr, v) {
  if (attr.required && (v === '' || v === null || v === undefined)) return `${attr.name} is required but empty`;
  if (v === '' && !attr.required) return null;
  if (attr.values && !attr.values.includes(v)) return `${attr.name} = ${v} is not an allowed value (${attr.values.join(', ')})`;
  const min = attr.min ?? 0;
  if (attr.type === 'integer' && !(Number.isInteger(v) && v >= min)) return `${attr.name} = ${v} is not a whole number of ${min} or more`;
  if (attr.type === 'decimal' && !(Number.isFinite(v) && v >= min)) return `${attr.name} = ${v} is not an amount of ${min} or more`;
  if (attr.max !== undefined && Number(v) > attr.max) return `${attr.name} = ${v} is above the maximum of ${attr.max}`;
  if (attr.type === 'boolean' && typeof v !== 'boolean') return `${attr.name} = ${v} is not true or false`;
  if (attr.pattern && v !== '' && !new RegExp(attr.pattern).test(String(v))) return `${attr.name} = ${v} does not match the format the data dictionary specifies`;
  return null;
}

const generatedValue = (attr) => attr.example;

function buildReservation(dictionary, set) {
  const fixed = new Map(set.drivers.map((d) => [d.attribute, d.value]));
  const res = {};
  const ai = set.aiValues || {};
  for (const a of dictionary.attributes) res[a.name] = fixed.has(a.name) ? fixed.get(a.name) : a.name in ai ? ai[a.name] : generatedValue(a);
  return res;
}

function crossChecks(res) {
  const total = res['revenue.totalAmount'];
  const parts = ['revenue.taxAmount', 'revenue.resortFeeAmount', 'revenue.ancillaryAmount'].reduce((s, k) => s + (Number(res[k]) || 0), 0);
  return Number.isFinite(total) && total < parts ? [`revenue.totalAmount ${total} is less than its tax, fees and extras (${parts})`] : [];
}

const sameSet = (a, b) => JSON.stringify([a.drivers, a.parameters]) === JSON.stringify([b.drivers, b.parameters]);

/**
 * testCases: designed cases (keys, testData line, expected). dictionary: { name, version, attributes }.
 * previous: data sets of the baseline (incremental), matched by test case key.
 */
/**
 * personas (optional): AI-generated values already checked against the dictionary; each data set takes one persona's
 * values for the attributes its test case does not set. A carried-over data set keeps the values it had.
 */
function testDataAgent(testCases, dictionary, { previous = [], source = null, personas = null } = {}) {
  const attrs = new Map(dictionary.attributes.map((a) => [a.name, a]));
  const prev = new Map((previous || []).map((d) => [d.testCaseKey, d]));
  const pool = personas && personas.personas.length ? personas.personas : null;
  const dataSets = testCases.map((t, i) => {
    const { drivers, parameters } = readCaseData(t.testData, attrs);
    const pp = prev.get(t.key);
    const persona = pool ? pool[i % pool.length] : null;
    const set0 = drivers.map((d) => d.attribute);
    const aiValues = pp && pp.aiValues ? pp.aiValues
      : persona ? Object.fromEntries(Object.entries(persona.values).filter(([k]) => !set0.includes(k))) : null;
    const base = { id: t.key.replace(/^TC-/, 'TD-'), testCaseKey: t.key, requirementId: t.requirementId, drivers, parameters,
      ...(aiValues ? { aiValues, persona: pp && pp.aiValues ? pp.persona : persona.id } : {}) };
    const res = buildReservation(dictionary, { ...base, testCaseKey: t.key });
    const problems = [
      ...drivers.flatMap((d) => (d.variants || [d.value]).map((v) => checkValue(attrs.get(d.attribute), v)).filter(Boolean)),
      ...crossChecks(res),
    ];
    const negative = problems.length > 0 && /HTTP 4\d\d/.test(String(t.expected));
    const p = prev.get(t.key);
    const set = {
      ...base,
      drivers: drivers.map((d) => ({ ...d, spec: specOf(attrs.get(d.attribute)) })),
      attributeCount: Object.keys(res).length,
      generated: Object.keys(res).length - drivers.length,
      aiGenerated: aiValues ? Object.keys(aiValues).length : 0,
      conformance: !problems.length ? 'conforms' : negative ? 'negative test' : 'does not conform',
      problems,
      file: `test-data/${t.key}.json`,
    };
    const status = !p ? 'new' : sameSet(p, set) ? 'carried over' : 're-generated';
    return { ...set, status, version: !p ? 1 : p.version + (status === 'carried over' ? 0 : 1) };
  });
  const count = (f) => dataSets.filter(f).length;
  return {
    dataSets,
    summary: {
      dictionary: { name: dictionary.name, version: dictionary.version, attributeCount: dictionary.attributes.length, source },
      total: dataSets.length,
      conforming: count((d) => d.conformance === 'conforms'),
      negative: count((d) => d.conformance === 'negative test'),
      nonConforming: count((d) => d.conformance === 'does not conform'),
      byStatus: dataSets.reduce((m, d) => ({ ...m, [d.status]: (m[d.status] || 0) + 1 }), {}),
      method: `${dictionary.generationMethod || 'Commission drivers come from the test case; every other attribute takes the value the data dictionary specifies as its example.'}${pool ? ` AI (${personas.by}) supplied ${pool.length} realistic synthetic personas for ${personas.attributes.join(', ')}; every value was checked against the data dictionary before use.` : ''}`,
      ai: pool ? { by: personas.by, personas: pool.length, attributes: personas.attributes, rejectedValues: personas.rejectedValues } : null,
    },
  };
}

/** The file a generated spec loads: the full reservation plus where each value came from. */
function dataSetFile(set, dictionary) {
  return {
    dataSet: set.id, testCase: set.testCaseKey, generatedBy: 'Test data agent',
    dictionary: { name: dictionary.name, version: dictionary.version },
    drivers: clone(set.drivers), parameters: clone(set.parameters), conformance: set.conformance, problems: clone(set.problems),
    ...(set.aiValues ? { aiGenerated: { persona: set.persona, attributes: Object.keys(set.aiValues) } } : {}),
    reservation: buildReservation(dictionary, set),
  };
}

module.exports = { testDataAgent, dataSetFile, buildReservation, readCaseData, checkValue };
