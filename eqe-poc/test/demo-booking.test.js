'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCriteria } = require('../apps/demo-booking/validate');
const { createApp, CONFIG } = require('../apps/demo-booking/server');

const NOW = new Date('2026-10-05T10:00:00Z');
const ok = { destination: 'Lisbon', checkIn: '2026-11-04', checkOut: '2026-11-07', rooms: 1, adults: 2, children: 0 };
const rules = (c, opts) => validateCriteria({ ...ok, ...c }, CONFIG, { now: NOW, ...opts }).map((e) => `${e.field}:${e.rule}`);

test('validation accepts valid criteria and rejects each rule with a field-level error', () => {
  assert.deepEqual(rules({}), []);
  assert.deepEqual(rules({ destination: ' ' }), ['destination:REQUIRED']);
  assert.deepEqual(rules({ checkIn: '2026-10-04', checkOut: '2026-10-07' }), ['checkIn:PAST_DATE']);
  assert.deepEqual(rules({ checkOut: '2026-11-04' }), ['checkOut:CHECKOUT_NOT_AFTER_CHECKIN']);
  assert.deepEqual(rules({ checkOut: '2026-12-05' }), ['checkOut:MAX_STAY']);
  assert.deepEqual(rules({ rooms: 5, adults: 5 }), ['rooms:ROOM_LIMIT']);
  assert.deepEqual(rules({ adults: 4 }), ['adults:OCCUPANCY_LIMIT']);
  assert.deepEqual(rules({ children: 3 }), ['children:OCCUPANCY_LIMIT']);
});

test('market rule (Venice 7 nights) applies only when market rules are on, i.e. server-side', () => {
  const venice = { destination: 'Venice', checkOut: '2026-11-14' };
  assert.deepEqual(rules(venice), ['checkOut:MARKET_MAX_STAY']);
  assert.deepEqual(rules(venice, { withMarketRules: false }), []);
});

test('search API: results, zero inventory, dependency outage, 422 field errors and idempotent request IDs', async () => {
  const logs = [];
  const server = createApp({ log: (l) => logs.push(l) }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const search = (body) => fetch(`${base}/api/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-correlation-id': 'corr-1' }, body: JSON.stringify({ ...ok, checkIn: day(30), checkOut: day(33), ...body }) });
  try {
    const lisbon = await search({ requestId: 'r1' });
    assert.equal(lisbon.status, 200);
    const body = await lisbon.json();
    assert.equal(body.resultCount, 3);
    assert.match(body.searchId, /^S-\d{4}$/);
    const replay = await (await search({ requestId: 'r1' })).json();
    assert.equal(replay.searchId, body.searchId);
    assert.equal((await (await fetch(`${base}/api/sessions`)).json()).count, 1);
    const zero = await search({ destination: 'Reykjavik' });
    assert.equal(zero.status, 200);
    assert.equal((await zero.json()).resultCount, 0);
    assert.equal((await search({ destination: 'Atlantis' })).status, 503);
    const venice = await search({ destination: 'Venice', checkOut: day(40) });
    assert.equal(venice.status, 422);
    assert.equal((await venice.json()).errors[0].rule, 'MARKET_MAX_STAY');
    assert.ok(logs.every((l) => l.correlationId === 'corr-1' && typeof l.durationMs === 'number'));
    assert.ok(logs.every((l) => !('email' in l) && !('name' in l)), 'audit log carries no guest PII fields');
  } finally { server.close(); }
});
