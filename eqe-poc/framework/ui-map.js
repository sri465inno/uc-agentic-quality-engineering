'use strict';
// Framework snapshot for demo-booking: the reusable journeys and checks (backed by pages/demo-booking Page Objects) that Stage 2
// matches acceptance criteria against and Stage 3 turns into Playwright code. Reuse over regenerate (G5-G7): a criterion with no
// matching entry is designed as a manual case and logged in the gap register, never automated with invented locators.
// triggers: phrases from the requirement text; every content word of a trigger must appear in the criterion for it to match.
const S = (action, expected, code, data) => ({ action, expected, code, ...(data ? { data } : {}) });

const CONCEPTS = [
  {
    id: 'search.valid', title: 'Search with valid criteria returns available hotels', kind: 'journey', polarity: 'positive', journey: 'Search', data: ['validSearch'],
    triggers: ['given valid search criteria', 'submits the search', 'matching available hotels are returned', 'search by destination and stay dates'],
    steps: [
      S('Open the demo-booking hotel search page', 'The "Find a hotel" search form is displayed', ['await search.open();']),
      S('Enter destination {validSearch.destination}, check-in {validSearch.checkIn}, check-out {validSearch.checkOut}, {validSearch.rooms} room, {validSearch.adults} adults and select "Search hotels"', 'A results page lists matching available hotels with a result count', ['await search.search(data.validSearch);', 'await results.expectResultsListed();'], 'validSearch'),
    ],
  },
  {
    id: 'results.criteriaVisible', title: 'Submitted criteria stay visible and editable on results', kind: 'check', polarity: 'positive', journey: 'Search', requires: ['search.valid'], data: ['validSearch'],
    triggers: ['criteria remain visible and editable', 'visible and editable on the results page'],
    steps: [
      S('Review the search summary at the top of the results page', 'Destination {validSearch.destination} and the check-in date are shown', ['await expect(results.criteriaSummary).toContainText(data.validSearch.destination);', 'await expect(results.criteriaSummary).toContainText(data.validSearch.checkIn);']),
      S('Select "Modify search"', 'An editable search form opens pre-filled with destination {validSearch.destination}', ['await results.modifySearch.click();', 'await expect(search.destination).toHaveValue(data.validSearch.destination);', 'await expect(search.destination).toBeEditable();']),
    ],
  },
  {
    id: 'validation.pastCheckIn', title: 'Past check-in date is rejected with an actionable message', kind: 'check', polarity: 'negative', journey: 'Search validation', data: ['pastCheckIn'],
    triggers: ['past check-in dates', 'check-in date in the past'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Enter a check-in date in the past ({pastCheckIn.checkIn}) with otherwise valid criteria and select "Search hotels"', 'The search is not submitted; the Check-in field shows "Check-in date cannot be in the past. Choose today or a later date."', ['await search.search(data.pastCheckIn);', 'await search.expectFieldError(\'checkIn\', /cannot be in the past/);', 'await expect(results.countHeading).toHaveCount(0);'], 'pastCheckIn'),
    ],
  },
  {
    id: 'validation.checkOutOrder', title: 'Check-out not after check-in is rejected', kind: 'check', polarity: 'negative', journey: 'Search validation', data: ['checkOutNotAfterCheckIn'],
    triggers: ['check-out dates not after check-in', 'check-in must precede check-out'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Enter check-out equal to check-in ({checkOutNotAfterCheckIn.checkIn}) and select "Search hotels"', 'The Check-out field shows "Check-out date must be after the check-in date."', ['await search.search(data.checkOutNotAfterCheckIn);', 'await search.expectFieldError(\'checkOut\', /must be after the check-in date/);'], 'checkOutNotAfterCheckIn'),
    ],
  },
  {
    id: 'validation.missing', title: 'Missing mandatory fields are rejected', kind: 'check', polarity: 'negative', journey: 'Search validation', data: ['missingMandatory'],
    triggers: ['missing mandatory fields'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Leave destination, check-in and check-out empty and select "Search hotels"', 'An error summary lists the missing fields and Destination shows "Destination is required."', ['await search.search(data.missingMandatory);', 'await expect(search.errorSummary).toBeVisible();', 'await search.expectFieldError(\'destination\', /Destination is required/);'], 'missingMandatory'),
    ],
  },
  {
    id: 'results.noAvailability', title: 'No-availability result explains and allows criteria changes', kind: 'check', polarity: 'positive', journey: 'Search', data: ['zeroInventory'],
    triggers: ['no-availability result', 'no matching inventory was found'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Search {zeroInventory.destination} for valid dates and occupancy', 'A "No hotels match your search" message explains that no available inventory was found', ['await search.search(data.zeroInventory);', 'await expect(results.noResultsHeading).toBeVisible();', 'await expect(page.getByText(/no available inventory/)).toBeVisible();'], 'zeroInventory'),
      S('Select "Modify search"', 'The search criteria can be changed', ['await results.modifySearch.click();', 'await expect(search.destination).toBeEditable();']),
    ],
  },
  {
    id: 'results.alterCriteria', title: 'Zero results offer options to alter dates, occupancy or destination', kind: 'check', polarity: 'positive', journey: 'Search', data: ['zeroInventory'],
    triggers: ['zero results provide options to alter', 'alter dates occupancy destination'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Search {zeroInventory.destination} for valid dates and occupancy', '"Change dates", "Change occupancy" and "Change destination" options are offered', ['await search.search(data.zeroInventory);', 'await expect(results.changeButton(\'dates\')).toBeVisible();', 'await expect(results.changeButton(\'occupancy\')).toBeVisible();', 'await expect(results.changeButton(\'destination\')).toBeVisible();'], 'zeroInventory'),
      S('Select "Change dates"', 'The check-in field is focused and editable', ['await results.changeButton(\'dates\').click();', 'await expect(search.checkIn).toBeFocused();']),
    ],
  },
  {
    id: 'validation.requiredMarked', title: 'Required search fields are identified', kind: 'check', polarity: 'positive', journey: 'Search validation', data: [],
    triggers: ['required fields are clearly identified'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Inspect Destination, Check-in, Check-out, Rooms and Adults', 'Each is marked required (asterisk and required state); a "Required field" legend is shown', ['for (const f of [search.destination, search.checkIn, search.checkOut, search.rooms, search.adults]) await expect(f).toHaveAttribute(\'aria-required\', \'true\');', 'await expect(search.children).not.toHaveAttribute(\'aria-required\', \'true\');', 'await expect(page.getByText(\'Required field\')).toBeVisible();']),
    ],
  },
  {
    id: 'validation.fieldLevel', title: 'Invalid combination returns a field-level message', kind: 'check', polarity: 'negative', journey: 'Search validation', data: ['overOccupancy'],
    triggers: ['invalid combinations return field-level messages', 'occupancy must comply with configured room limits'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Enter {overOccupancy.adults} adults for {overOccupancy.rooms} room and select "Search hotels"', 'The Adults field shows "A room holds up to 4 adults. Add a room or reduce adults."', ['await search.search(data.overOccupancy);', 'await search.expectFieldError(\'adults\', /holds up to 4 adults/);'], 'overOccupancy'),
    ],
  },
  {
    id: 'validation.serverAuthoritative', title: 'Server-side validation wins over browser checks', kind: 'check', polarity: 'negative', journey: 'Search validation', data: ['overMaxStay'],
    triggers: ['server validation is authoritative', 'maximum stay length must be configurable'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Enter a stay longer than the configured maximum ({overMaxStay.checkIn} to {overMaxStay.checkOut}); the browser has no max-stay check, the server does', 'The server rejects it and Check-out shows "Stays are limited to 30 nights."', ['await search.search(data.overMaxStay);', 'await search.expectFieldError(\'checkOut\', /limited to 30 nights/);', 'await expect(results.countHeading).toHaveCount(0);'], 'overMaxStay'),
    ],
  },
  {
    id: 'validation.accessibleMessages', title: 'Validation messages are exposed to assistive technology', kind: 'check', polarity: 'negative', journey: 'Search validation', data: ['missingMandatory'],
    triggers: ['validation messages are accessible to assistive technology'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Submit the form with mandatory fields empty', 'An alert (role=alert) announces the errors; each invalid field is marked invalid and described by its message', ['await search.search(data.missingMandatory);', 'await expect(search.errorSummary).toBeVisible();', 'await expect(search.destination).toHaveAttribute(\'aria-invalid\', \'true\');', 'await expect(search.destination).toHaveAccessibleDescription(/required/);'], 'missingMandatory'),
    ],
  },
  {
    id: 'search.technicalFailure', title: 'Technical failure shows a non-technical message and retry', kind: 'check', polarity: 'negative', journey: 'Search', data: ['serviceOutage'],
    triggers: ['technical failures display a non-technical message', 'retry option'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Search {serviceOutage.destination} (the availability service is simulated as down)', 'A plain-language "We couldn\'t complete your search right now" message is shown with no technical codes', ['await search.search(data.serviceOutage);', 'await expect(results.failureHeading).toBeVisible();', 'await expect(page.getByText(/503|exception|stack/i)).toHaveCount(0);'], 'serviceOutage'),
      S('Select "Try again"', 'The search is retried and the guest stays on a clear message', ['await results.retry.click();', 'await expect(results.failureHeading).toBeVisible();']),
    ],
  },
  {
    id: 'search.repeatSubmit', title: 'Repeated submission does not create inconsistent sessions', kind: 'check', polarity: 'positive', journey: 'Search', data: ['validSearch'],
    triggers: ['repeated submission does not create inconsistent sessions'],
    steps: [
      S('Open the demo-booking hotel search page', 'The search form is displayed', ['await search.open();']),
      S('Enter valid criteria and double-click "Search hotels"', 'Exactly one result set with one search reference is shown', ['await search.fill(data.validSearch);', 'await search.submit.dblclick();', 'await results.expectResultsListed();', 'await expect(results.criteriaSummary.getByText(/Search reference S-\\d+/)).toHaveCount(1);', 'await expect(results.countHeading).toHaveCount(1);'], 'validSearch'),
    ],
  },
  {
    id: 'results.cardContent', title: 'Each result shows name, location, image, price, currency and availability', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: ['bookableHotel'],
    triggers: ['each result shows hotel name location', 'starting price currency and availability indicator'],
    steps: [
      S('Review the {bookableHotel.name} result card', 'Name, location, image, "From EUR" starting price and an "Available" indicator are shown', ['const card = results.card(data.bookableHotel.name);', 'await expect(card.getByRole(\'heading\', { name: data.bookableHotel.name })).toBeVisible();', 'await expect(card.getByRole(\'img\')).toBeVisible();', 'await expect(card.getByText(/^From EUR \\d+/)).toBeVisible();', 'await expect(card.getByText(\'Available\')).toBeVisible();', 'await expect(card.getByText(/Paris/).first()).toBeVisible();']),
    ],
  },
  {
    id: 'results.feesDisclosed', title: 'Mandatory fees are disclosed on results', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: ['bookableHotel'],
    triggers: ['mandatory fees or pricing qualifications are clearly disclosed'],
    steps: [
      S('Review the {bookableHotel.name} result card', 'The card discloses the city tax payable at the hotel', ['await expect(results.card(data.bookableHotel.name).getByText(/City tax .* payable at the hotel/)).toBeVisible();']),
    ],
  },
  {
    id: 'results.unavailableNotBookable', title: 'Unavailable hotels are not offered as bookable', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: ['soldOutHotel'],
    triggers: ['unavailable hotels are not presented as immediately bookable'],
    steps: [
      S('Show all results and review the {soldOutHotel.name} card', 'It is marked "Sold out" and has no "View rooms" action', ['await results.showMore.click();', 'const card = results.card(data.soldOutHotel.name);', 'await expect(card.getByText(\'Sold out\')).toBeVisible();', 'await expect(card.getByRole(\'link\', { name: \'View rooms\' })).toHaveCount(0);']),
    ],
  },
  {
    id: 'results.pagination', title: 'Results load progressively', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: [],
    triggers: ['results support pagination or progressive loading'],
    steps: [
      S('Count the result cards, then select "Show more hotels"', 'The first 4 hotels are shown, then the remaining hotel is loaded', ['await expect(results.hotelCards).toHaveCount(4);', 'await results.showMore.click();', 'await expect(results.hotelCards).toHaveCount(5);']),
    ],
  },
  {
    id: 'results.filter', title: 'Guest filters results by price', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: ['filterMaxPrice'],
    triggers: ['apply supported filters such as price range amenities hotel category'],
    steps: [
      S('Set "Maximum price per night" to {filterMaxPrice.maxPrice}', 'Only hotels priced at or below {filterMaxPrice.maxPrice} remain', ['await results.maxPrice.selectOption(data.filterMaxPrice.maxPrice);', 'await expect(results.countHeading).toBeVisible();', 'for (const p of await results.prices()) expect(p).toBeLessThanOrEqual(Number(data.filterMaxPrice.maxPrice));']),
    ],
  },
  {
    id: 'results.sort', title: 'Guest sorts results by price', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: [],
    triggers: ['sort using approved options'],
    steps: [
      S('Choose "Price (low to high)" in "Sort by"', 'Hotels are listed in ascending starting price', ['await results.sortBy.selectOption(\'price-asc\');', 'const prices = await results.prices();', 'expect(prices).toEqual([...prices].sort((a, b) => a - b));']),
    ],
  },
  {
    id: 'results.filterChips', title: 'Selected filters are visible and removable', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: ['filterAmenity'],
    triggers: ['selected criteria are visible and removable'],
    steps: [
      S('Tick amenity {filterAmenity.amenity}', 'A removable "{filterAmenity.amenity}" filter chip is shown', ['await results.amenity(data.filterAmenity.amenity).check();', 'await expect(results.activeFilters.getByRole(\'button\', { name: `Remove filter ${data.filterAmenity.amenity}` })).toBeVisible();']),
      S('Remove the chip', 'The filter is cleared and no active filters remain', ['await results.activeFilters.getByRole(\'button\', { name: `Remove filter ${data.filterAmenity.amenity}` }).click();', 'await expect(results.activeFilters).toHaveCount(0);']),
    ],
  },
  {
    id: 'results.filterReset', title: 'Zero results after filtering offer a reset', kind: 'check', polarity: 'positive', journey: 'Results', requires: ['search.valid'], data: ['filterNoMatch'],
    triggers: ['zero results after filtering offer a reset option'],
    steps: [
      S('Set maximum price {filterNoMatch.maxPrice} and tick {filterNoMatch.amenity}', '"No hotels match these filters" is shown with "Reset filters"', ['await results.maxPrice.selectOption(data.filterNoMatch.maxPrice);', 'await results.amenity(data.filterNoMatch.amenity).check();', 'await expect(results.resetFilters).toBeVisible();']),
      S('Select "Reset filters"', 'The full result list returns', ['await results.resetFilters.click();', 'await results.expectResultsListed();']),
    ],
  },
  {
    id: 'hotel.details', title: 'Hotel and room details are displayed', kind: 'check', polarity: 'positive', journey: 'Hotel details', requires: ['search.valid'], data: ['bookableHotel'],
    triggers: ['hotel description images location amenities room options pricing'],
    steps: [
      S('Select "View rooms" on {bookableHotel.name}', 'Description, image, amenities, room options with prices and cancellation terms are shown', ['await results.card(data.bookableHotel.name).getByRole(\'link\', { name: \'View rooms\' }).click();', 'await expect(page.getByRole(\'heading\', { name: data.bookableHotel.name })).toBeVisible();', 'await expect(page.getByText(/Amenities:/)).toBeVisible();', 'await expect(hotel.roomsHeading).toBeVisible();', 'await expect(page.getByText(/cancellation/i).first()).toBeVisible();']),
    ],
  },
  {
    id: 'hotel.selectRoom', title: 'Guest selects a valid room and rate', kind: 'check', polarity: 'positive', journey: 'Hotel details', requires: ['search.valid'], data: ['bookableHotel'],
    triggers: ['guest can select a valid room and rate plan'],
    steps: [
      S('Open {bookableHotel.name} and select room {bookableHotel.room}', 'A "Room selected" confirmation shows the room, price and cancellation terms', ['await results.card(data.bookableHotel.name).getByRole(\'link\', { name: \'View rooms\' }).click();', 'await hotel.selectRoom(data.bookableHotel.room).click();', 'await expect(hotel.selection).toContainText(data.bookableHotel.room);']),
    ],
  },
  {
    id: 'hotel.rateConditions', title: 'Rate conditions and cancellation terms are shown before selection', kind: 'check', polarity: 'positive', journey: 'Hotel details', requires: ['search.valid'], data: ['bookableHotel'],
    triggers: ['rate conditions and cancellation terms must be shown before selection'],
    steps: [
      S('Open {bookableHotel.name} without selecting a room', 'Each room shows its cancellation terms before any selection', ['await results.card(data.bookableHotel.name).getByRole(\'link\', { name: \'View rooms\' }).click();', 'await expect(hotel.selection).toHaveCount(0);', 'await expect(page.getByLabel(data.bookableHotel.room).getByText(/cancellation/i)).toBeVisible();']),
    ],
  },
];

module.exports = { CONCEPTS, APP: 'demo-booking', PAGE_OBJECTS: ['SearchPage', 'ResultsPage', 'HotelPage'] };
