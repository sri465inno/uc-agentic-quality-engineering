'use strict';
// demo-booking: synthetic hotel search app standing in for the client UI in the EQE PoC (Epic AQPI-2 scope only).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { validateCriteria } = require('./validate');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'validation.json'), 'utf8'));
const INVENTORY = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8'));

function createApp({ log = (line) => process.stdout.write(`${JSON.stringify(line)}\n`) } = {}) {
  const app = express();
  const sessions = new Map(); // requestId -> search session (idempotent: AQPI-5-AC3)
  let seq = 0;
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('/validate.js', (req, res) => res.type('js').send(`window.DemoValidate=(function(){const module={};${fs.readFileSync(path.join(__dirname, 'validate.js'), 'utf8')};return module.exports;})();`));
  app.get('/api/config', (req, res) => res.json({ maxRooms: CONFIG.maxRooms, maxAdultsPerRoom: CONFIG.maxAdultsPerRoom, maxChildrenPerRoom: CONFIG.maxChildrenPerRoom, maxStayNights: CONFIG.maxStayNights }));
  app.get('/api/sessions', (req, res) => res.json({ count: sessions.size }));

  app.post('/api/search', (req, res) => {
    const started = Date.now();
    const correlationId = req.get('x-correlation-id') || crypto.randomUUID();
    const c = req.body || {};
    const requestId = String(c.requestId || crypto.randomUUID());
    const audit = (status, extra) => log({ at: new Date().toISOString(), event: 'search', correlationId, destination: String(c.destination || '').slice(0, 40), checkIn: c.checkIn, checkOut: c.checkOut, rooms: c.rooms, adults: c.adults, children: c.children, status, durationMs: Date.now() - started, ...extra });
    if (sessions.has(requestId)) { const s = sessions.get(requestId); audit(200, { resultCount: s.resultCount, replay: true }); return res.json(s); }
    const errors = validateCriteria(c, CONFIG);
    if (errors.length) { audit(422, { errorCategory: 'VALIDATION', rules: errors.map((e) => e.rule) }); return res.status(422).json({ errors }); }
    const destination = String(c.destination).trim();
    if (INVENTORY.unavailableDependency.includes(destination)) { audit(503, { failureCategory: 'DEPENDENCY_UNAVAILABLE', dependency: 'availability-service' }); return res.status(503).json({ error: 'AVAILABILITY_UNAVAILABLE' }); }
    const maxPrice = c.maxPrice ? Number(c.maxPrice) : Infinity;
    const hotels = INVENTORY.hotels.filter((h) => h.destination.toLowerCase() === destination.toLowerCase() && h.pricePerNight <= maxPrice);
    seq += 1;
    const session = { searchId: `S-${String(seq).padStart(4, '0')}`, criteria: { destination, checkIn: c.checkIn, checkOut: c.checkOut, rooms: Number(c.rooms), adults: Number(c.adults), children: Number(c.children || 0), maxPrice: c.maxPrice || '' }, resultCount: hotels.length, hotels };
    sessions.set(requestId, session);
    audit(200, { resultCount: hotels.length });
    return res.json(session);
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4300);
  createApp().listen(port, '127.0.0.1', () => console.log(`demo-booking on http://127.0.0.1:${port}`));
}

module.exports = { createApp, CONFIG };
