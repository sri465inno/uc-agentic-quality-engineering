'use strict';
// demo-booking: a synthetic hotel booking UI that stands in for the client UI under test (no real client app, no real data).
// Mounted by the PoC server at /demo-booking, or run on its own with `npm run demo-booking`.
const path = require('path');
const express = require('express');
const { CITIES, HOTELS, RULES } = require('./data');

let searchSeq = 0;
const iso = (d) => d.toISOString().slice(0, 10);
const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/** Server-side validation: authoritative over the browser checks (AQPI-4). */
function validate(q, rules = RULES) {
  const errors = {};
  const need = (k, label) => { if (q[k] === undefined || q[k] === null || String(q[k]).trim() === '') errors[k] = `${label} is required.`; };
  need('destination', 'Destination'); need('checkIn', 'Check-in date'); need('checkOut', 'Check-out date');
  need('rooms', 'Rooms'); need('adults', 'Adults');
  const ci = q.checkIn ? new Date(`${q.checkIn}T00:00:00Z`) : null;
  const co = q.checkOut ? new Date(`${q.checkOut}T00:00:00Z`) : null;
  if (ci && !errors.checkIn && ci < today()) errors.checkIn = 'Check-in date cannot be in the past. Choose today or a later date.';
  if (ci && co && !errors.checkOut && co <= ci) errors.checkOut = 'Check-out date must be after the check-in date.';
  if (ci && co && co > ci && (co - ci) / 864e5 > rules.maxStayNights) errors.checkOut = `Stays are limited to ${rules.maxStayNights} nights. Choose an earlier check-out date.`;
  const rooms = Number(q.rooms); const adults = Number(q.adults); const children = Number(q.children || 0);
  if (!errors.rooms && (!Number.isInteger(rooms) || rooms < 1 || rooms > rules.maxRooms)) errors.rooms = `Choose between 1 and ${rules.maxRooms} rooms.`;
  if (!errors.adults && (!Number.isInteger(adults) || adults < 1)) errors.adults = 'At least 1 adult is required.';
  if (!errors.rooms && !errors.adults && adults > rooms * rules.maxAdultsPerRoom) errors.adults = `A room holds up to ${rules.maxAdultsPerRoom} adults. Add a room or reduce adults.`;
  if (!errors.rooms && adults < rooms && !errors.adults) errors.adults = 'Each room needs at least 1 adult.';
  if (!errors.rooms && children > rooms * rules.maxChildrenPerRoom) errors.children = `A room holds up to ${rules.maxChildrenPerRoom} children. Add a room or reduce children.`;
  return errors;
}

function createDemoBooking() {
  const app = express.Router();
  app.use(express.json());
  app.get('/api/config', (req, res) => res.json({ rules: RULES, cities: CITIES.map((c) => c.name), today: iso(today()) }));
  app.post('/api/search', (req, res) => {
    const q = req.body || {};
    const errors = validate(q);
    if (Object.keys(errors).length) return res.status(422).json({ errors });
    const city = CITIES.find((c) => c.name.toLowerCase() === String(q.destination).trim().toLowerCase());
    if (city && city.outage) return res.status(503).json({ failure: 'availability-service-unavailable' });
    searchSeq += 1;
    const hotels = city ? HOTELS.filter((h) => h.city === city.name) : [];
    res.json({ searchRef: `S-${String(searchSeq).padStart(5, '0')}`, criteria: q, hotels });
  });
  app.get('/api/hotels/:id', (req, res) => {
    const h = HOTELS.find((x) => x.id === req.params.id);
    if (!h) return res.status(404).json({ error: 'not found' });
    res.json(h);
  });
  app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (r) => r.setHeader('Cache-Control', 'no-cache') }));
  return app;
}

module.exports = { createDemoBooking, validate };

if (require.main === module) {
  const app = express();
  app.use('/demo-booking', createDemoBooking());
  app.get('/', (req, res) => res.redirect('/demo-booking/'));
  const port = Number(process.env.PORT || 3200);
  app.listen(port, () => console.log(`demo-booking listening on http://localhost:${port}/demo-booking/`));
}
