'use strict';
// Search-criteria validation shared by the server (authoritative) and served to the browser (client hints).
const DAY = 86400000;
const toDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? Date.parse(`${s}T00:00:00Z`) : NaN);
const todayUtc = (now = new Date()) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const int = (v) => (v === '' || v === undefined || v === null ? NaN : Number(v));

/** Returns field-level errors [{ field, rule, message }]; empty when the criteria are valid. */
function validateCriteria(c, cfg, { now = new Date(), withMarketRules = true } = {}) {
  const errors = [];
  const add = (field, rule, message) => { if (!errors.some((e) => e.field === field)) errors.push({ field, rule, message }); };
  const destination = String(c.destination || '').trim();
  if (!destination) add('destination', 'REQUIRED', 'Enter a destination.');
  const ci = toDay(c.checkIn);
  const co = toDay(c.checkOut);
  if (!c.checkIn) add('checkIn', 'REQUIRED', 'Enter a check-in date.');
  else if (Number.isNaN(ci)) add('checkIn', 'FORMAT', 'Enter the check-in date as YYYY-MM-DD.');
  else if (ci < todayUtc(now)) add('checkIn', 'PAST_DATE', 'Check-in date cannot be in the past. Choose today or a later date.');
  if (!c.checkOut) add('checkOut', 'REQUIRED', 'Enter a check-out date.');
  else if (Number.isNaN(co)) add('checkOut', 'FORMAT', 'Enter the check-out date as YYYY-MM-DD.');
  else if (!Number.isNaN(ci) && co <= ci) add('checkOut', 'CHECKOUT_NOT_AFTER_CHECKIN', 'Check-out date must be after the check-in date.');
  if (!Number.isNaN(ci) && !Number.isNaN(co) && co > ci) {
    const nights = Math.round((co - ci) / DAY);
    const market = withMarketRules ? (cfg.markets || {})[destination] : null;
    const max = market && market.maxStayNights ? market.maxStayNights : cfg.maxStayNights;
    if (nights > max) add('checkOut', market ? 'MARKET_MAX_STAY' : 'MAX_STAY', `Stays in ${market ? destination : 'this search'} are limited to ${max} nights. Choose an earlier check-out date.`);
  }
  const rooms = int(c.rooms);
  const adults = int(c.adults);
  const children = c.children === '' || c.children === undefined ? 0 : int(c.children);
  if (Number.isNaN(rooms)) add('rooms', 'REQUIRED', 'Enter the number of rooms.');
  else if (!Number.isInteger(rooms) || rooms < 1 || rooms > cfg.maxRooms) add('rooms', 'ROOM_LIMIT', `Choose between 1 and ${cfg.maxRooms} rooms.`);
  if (Number.isNaN(adults)) add('adults', 'REQUIRED', 'Enter the number of adults.');
  else if (!Number.isInteger(adults) || adults < 1) add('adults', 'ADULT_MIN', 'At least 1 adult is required.');
  else if (Number.isInteger(rooms) && rooms >= 1) {
    if (adults < rooms) add('adults', 'ADULT_PER_ROOM_MIN', 'Each room needs at least 1 adult.');
    else if (adults > rooms * cfg.maxAdultsPerRoom) add('adults', 'OCCUPANCY_LIMIT', `A room holds at most ${cfg.maxAdultsPerRoom} adults. Add a room or reduce adults.`);
  }
  if (Number.isNaN(children) || !Number.isInteger(children) || children < 0) add('children', 'FORMAT', 'Enter 0 or more children.');
  else if (Number.isInteger(rooms) && rooms >= 1 && children > rooms * cfg.maxChildrenPerRoom) add('children', 'OCCUPANCY_LIMIT', `A room holds at most ${cfg.maxChildrenPerRoom} children. Add a room or reduce children.`);
  return errors;
}

module.exports = { validateCriteria };
