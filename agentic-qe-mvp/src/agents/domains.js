'use strict';
// The system under test decides which catalogue designs the cases, which prelude the specs carry and
// how a failure is weighed. The commission engine and the hotel booking platform each have their own.
const commission = require('./catalogue');
const hotel = require('./hotel-catalogue');
const { extractValues } = require('../text');
const { isHotelBranch, HOTEL_BRANCH, HOTEL_BRANCH_V2 } = require('../../sut/hotel');

function classifyWith(catalogue) {
  return (text) => {
    const { values } = extractValues(text);
    for (const entry of catalogue) {
      const m = String(text).match(entry.match);
      if (m) return { entry, params: entry.params(m, values) };
    }
    return null;
  };
}

const DOMAINS = {
  commission: {
    id: 'commission',
    name: 'Aurora commission engine',
    classify: commission.classify,
    CATALOGUE: commission.CATALOGUE,
    SPEC_PRELUDE: commission.SPEC_PRELUDE,
    MONEY_KINDS: commission.MONEY_KINDS,
    JOURNEY_KINDS: commission.JOURNEY_KINDS,
    ADVISORY_KINDS: commission.ADVISORY_KINDS,
    impacts: { money: 'money moved wrongly', journey: 'a core advisor journey is blocked' },
    capability: 'Travel-advisor commission calculated from reservation attributes',
    modelLabel: 'reservation',
    driversLabel: 'commission-driving attributes',
    gaps: {
      eqe: { title: 'EQE testing was chosen but no input describes the advisor screen', suggestion: 'Add a story for the commission statement screen, so the journeys test a stated requirement.' },
      e2eNoUi: 'No input describes the advisor screen, so the journeys check the statement page the codebase ships without a stated requirement for it.',
      functional: { title: 'DQE testing was chosen but no input states a commission rule', suggestion: 'Add the commission rules with their values to the epic.' },
    },
  },
  hotel: {
    id: 'hotel',
    name: 'Hotel booking platform',
    classify: classifyWith(hotel.HOTEL_CATALOGUE),
    CATALOGUE: hotel.HOTEL_CATALOGUE,
    SPEC_PRELUDE: hotel.HOTEL_PRELUDE,
    MONEY_KINDS: new Set(hotel.HOTEL_MONEY_KINDS),
    JOURNEY_KINDS: new Set(hotel.HOTEL_JOURNEY_KINDS),
    ADVISORY_KINDS: new Set(),
    impacts: { money: 'a guest is charged or booked wrongly', journey: 'a core guest booking journey is blocked' },
    capability: 'Guest hotel booking from search to confirmation (AQPI-1)',
    modelLabel: 'booking',
    driversLabel: 'booking-driving attributes',
    gaps: {
      eqe: { title: 'EQE testing was chosen but no input describes a guest journey', suggestion: 'Add the search-to-confirmation acceptance criteria (AQPI-1) so the journeys test a stated requirement.' },
      e2eNoUi: 'The hotel services have no browser screen, so the journeys run through the service APIs; screen checks such as keyboard and focus order stay manual.',
      functional: { title: 'DQE testing was chosen but no input states a booking or price rule', suggestion: 'Add the cart, payment and reservation acceptance criteria (AQPI-17, AQPI-20, AQPI-21).' },
    },
  },
};

/** Domain of a branch name, a cycle (its SUT build) or a list of cycle inputs (the codebase input's branch). */
function domainOf(x) {
  const branch = typeof x === 'string' ? x
    : Array.isArray(x) ? x.find((i) => i.slot === 'codebase')?.branch
      : x?.sutBuild;
  return isHotelBranch(branch) ? DOMAINS.hotel : DOMAINS.commission;
}

module.exports = { DOMAINS, domainOf, isHotelBranch, HOTEL_BRANCH, HOTEL_BRANCH_V2 };
