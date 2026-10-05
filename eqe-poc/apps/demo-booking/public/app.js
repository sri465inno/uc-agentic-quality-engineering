'use strict';
// demo-booking front end: client validation hints, search, results / no availability / technical failure.
(function main() {
  const $ = (id) => document.getElementById(id);
  const form = $('search');
  const outcome = $('outcome');
  const FIELDS = ['destination', 'checkIn', 'checkOut', 'rooms', 'adults', 'children'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let config = null;
  let inFlight = false;
  let retries = 0;
  let lastRequest = { key: null, id: null };

  const criteria = () => Object.fromEntries(new FormData(form).entries());
  function clearErrors() {
    for (const f of FIELDS) { $(f).removeAttribute('aria-invalid'); $(f).removeAttribute('aria-describedby'); $(`${f}-error`).textContent = ''; }
    $('error-summary').hidden = true;
    $('error-summary').innerHTML = '';
  }
  function showErrors(errors) {
    clearErrors();
    for (const e of errors) {
      const input = $(e.field);
      if (!input) continue;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${e.field}-error`);
      $(`${e.field}-error`).textContent = e.message;
    }
    $('error-summary').innerHTML = `<b>Please correct ${errors.length === 1 ? 'this field' : `these ${errors.length} fields`}:</b><ul>${errors.map((e) => `<li><a href="#${e.field}">${esc(e.message)}</a></li>`).join('')}</ul>`;
    $('error-summary').hidden = false;
    $(errors[0].field).focus();
  }
  function renderResults(s) {
    const c = s.criteria;
    const summary = `<p class="muted" data-testid="criteria-summary">${esc(c.destination)} · ${esc(c.checkIn)} to ${esc(c.checkOut)} · ${c.rooms} room(s), ${c.adults} adult(s), ${c.children} child(ren)${c.maxPrice ? ` · up to ${esc(c.maxPrice)} per night` : ''} · Search reference ${esc(s.searchId)}</p>
<p class="muted">Your search criteria stay in the form above. Change any field and search again.</p>`;
    if (!s.resultCount) {
      outcome.innerHTML = `<section class="card" aria-labelledby="results-title"><h2 id="results-title">No hotels found</h2>${summary}
<p>We found no matching inventory for these criteria. Try changing your search:</p>
<div role="group" aria-label="Change your search"><button type="button" class="link" data-focus="checkIn">Change dates</button><button type="button" class="link" data-focus="adults">Change occupancy</button><button type="button" class="link" data-focus="destination">Change destination</button><button type="button" class="link" data-focus="maxPrice">Change filters</button></div></section>`;
      outcome.querySelectorAll('[data-focus]').forEach((b) => { b.onclick = () => $(b.dataset.focus).focus(); });
      return;
    }
    outcome.innerHTML = `<section class="card" aria-labelledby="results-title"><h2 id="results-title">${s.resultCount} hotel${s.resultCount === 1 ? '' : 's'} available in ${esc(c.destination)}</h2>${summary}
<ul class="hotels" aria-label="Available hotels">${s.hotels.map((h) => `<li><article aria-label="${esc(h.name)}"><h3>${esc(h.name)}</h3><div class="muted">${'★'.repeat(h.stars)} · ${esc(h.destination)}</div><div><b>${h.pricePerNight}</b> per night</div></article></li>`).join('')}</ul></section>`;
  }
  function renderFailure() {
    outcome.innerHTML = `<section class="fail" role="alert" aria-labelledby="fail-title"><h2 id="fail-title">We couldn't complete your search</h2><p>Something went wrong on our side. Your criteria are kept — please try again in a moment.</p><button type="button" id="retry">Try again</button></section>`;
    $('retry').onclick = () => { retries += 1; submit(); };
  }
  async function submit() {
    if (inFlight) return;
    const c = criteria();
    const clientErrors = window.DemoValidate.validateCriteria(c, config, { withMarketRules: false });
    if (clientErrors.length) { showErrors(clientErrors); outcome.innerHTML = ''; return; }
    clearErrors();
    const key = JSON.stringify(c);
    if (lastRequest.key !== key) lastRequest = { key, id: crypto.randomUUID() };
    inFlight = true;
    $('submit').disabled = true;
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Retry-Count': String(retries) }, body: JSON.stringify({ ...c, requestId: lastRequest.id }) });
      if (res.status === 422) { showErrors((await res.json()).errors); outcome.innerHTML = ''; return; }
      if (!res.ok) { renderFailure(); return; }
      retries = 0;
      renderResults(await res.json());
      $('results-title').focus?.();
    } catch {
      renderFailure();
    } finally {
      inFlight = false;
      $('submit').disabled = false;
    }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  fetch('/api/config').then((r) => r.json()).then((c) => { config = c; });
}());
