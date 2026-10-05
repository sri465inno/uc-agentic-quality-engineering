'use strict';
// demo-booking UI: search (AQPI-3/4/5), results with sort/filter (AQPI-7/8), hotel and room details (AQPI-9).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const main = $('#main');
  const state = { config: null, criteria: null, result: null, filters: { maxPrice: '', amenities: [], stars: '' }, sort: 'recommended', shown: 4, pending: false };
  const FIELDS = [
    ['destination', 'Destination', 'text', true], ['checkIn', 'Check-in', 'date', true], ['checkOut', 'Check-out', 'date', true],
    ['rooms', 'Rooms', 'number', true], ['adults', 'Adults', 'number', true], ['children', 'Children', 'number', false],
  ];
  const img = (h) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#8b7fb0"/><text x="60" y="46" font-size="12" text-anchor="middle" fill="#fff">${h.stars}★ ${h.city}</text></svg>`)}`;
  const money = (n, c) => `${c} ${n}`;

  function searchForm(c = {}, idPrefix = '') {
    return `<form class="search" novalidate aria-label="Hotel search">
      ${FIELDS.map(([k, label, type, req]) => `<div class="field${k === 'destination' ? ' wide' : ''}">
        <label for="${idPrefix}${k}">${label}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
        <input id="${idPrefix}${k}" name="${k}" type="${type}" ${type === 'number' ? 'min="0"' : ''} ${k === 'destination' ? 'list="cities" autocomplete="off"' : ''}
          ${req ? 'required aria-required="true"' : ''} aria-describedby="${idPrefix}${k}-err" value="${esc(c[k] ?? (k === 'rooms' ? 1 : k === 'adults' ? 2 : k === 'children' ? 0 : ''))}">
        <span class="err" id="${idPrefix}${k}-err"></span></div>`).join('')}
      <datalist id="cities">${state.config.cities.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="field"><button type="submit">Search hotels</button></div>
      <p class="small" style="grid-column:1/-1;margin:0;font-size:12px"><span class="req">*</span> Required field</p>
    </form>`;
  }

  // Browser-side checks: quick feedback only; the server's answer wins when they differ.
  function clientErrors(q) {
    const e = {};
    for (const [k, label, , req] of FIELDS) if (req && !String(q[k] ?? '').trim()) e[k] = `${label} is required.`;
    if (!e.checkIn && q.checkIn < state.config.today) e.checkIn = 'Check-in date cannot be in the past. Choose today or a later date.';
    if (!e.checkIn && !e.checkOut && q.checkOut <= q.checkIn) e.checkOut = 'Check-out date must be after the check-in date.';
    return e;
  }

  function showErrors(form, errors) {
    for (const [k] of FIELDS) {
      const input = form.elements[k]; const span = $(`#${input.id}-err`);
      if (errors[k]) { input.setAttribute('aria-invalid', 'true'); span.textContent = errors[k]; } else { input.removeAttribute('aria-invalid'); span.textContent = ''; }
    }
    form.parentElement.querySelector('.summary')?.remove();
    const keys = Object.keys(errors);
    if (keys.length) {
      form.insertAdjacentHTML('beforebegin', `<div class="summary" role="alert"><strong>Please correct ${keys.length} field${keys.length > 1 ? 's' : ''}:</strong><ul>${keys.map((k) => `<li>${esc(errors[k])}</li>`).join('')}</ul></div>`);
      form.elements[keys[0]].focus();
    }
  }

  function bindForm(form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (state.pending) return;
      const q = Object.fromEntries(FIELDS.map(([k]) => [k, form.elements[k].value.trim()]));
      const ce = clientErrors(q);
      if (Object.keys(ce).length) return showErrors(form, ce);
      state.pending = true; form.querySelector('button[type=submit]').disabled = true;
      try { await runSearch(q, form); } finally { state.pending = false; const b = form.querySelector('button[type=submit]'); if (b) b.disabled = false; }
    });
  }

  async function runSearch(q, form) {
    let res;
    try { res = await fetch('api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) }); } catch { res = { status: 0 }; }
    if (res.status === 422) { const body = await res.json(); return showErrors(form, body.errors); }
    state.criteria = q;
    if (res.status !== 200) { state.result = { failed: true }; location.hash = '#/results'; return render(); }
    state.result = await res.json(); state.shown = 4; state.filters = { maxPrice: '', amenities: [], stars: '' };
    location.hash = '#/results'; render();
  }

  function viewSearch() {
    main.innerHTML = `<h1>Find a hotel</h1>${searchForm(state.criteria || {})}`;
    bindForm($('form.search'));
  }

  function filtered() {
    const f = state.filters; let list = state.result.hotels.slice();
    if (f.maxPrice) list = list.filter((h) => h.price <= Number(f.maxPrice));
    if (f.stars) list = list.filter((h) => String(h.stars) === f.stars);
    for (const a of f.amenities) list = list.filter((h) => h.amenities.includes(a));
    const s = state.sort;
    if (s === 'price-asc') list.sort((a, b) => a.price - b.price);
    if (s === 'price-desc') list.sort((a, b) => b.price - a.price);
    if (s === 'rating') list.sort((a, b) => b.rating - a.rating);
    if (s === 'distance') list.sort((a, b) => a.distanceKm - b.distanceKm);
    return list;
  }

  function criteriaBar() {
    const c = state.criteria;
    return `<section class="criteria" aria-label="Your search"><span><strong>${esc(c.destination)}</strong> · ${esc(c.checkIn)} to ${esc(c.checkOut)} · ${esc(c.rooms)} room(s) · ${esc(c.adults)} adult(s)${Number(c.children) ? ` · ${esc(c.children)} child(ren)` : ''}</span>
      ${state.result && state.result.searchRef ? `<span class="fee">Search reference ${esc(state.result.searchRef)}</span>` : ''}
      <button class="ghost" type="button" id="modify">Modify search</button></section><div id="modify-panel" hidden></div>`;
  }

  function bindModify() {
    $('#modify').addEventListener('click', () => openModify());
  }
  function openModify(focus) {
    const p = $('#modify-panel'); p.hidden = false; p.innerHTML = searchForm(state.criteria, 'm-'); const form = $('form.search', p); bindForm(form);
    (form.elements[focus || 'destination']).focus();
  }

  function viewResults() {
    if (!state.result) { location.hash = '#/'; return; }
    if (state.result.failed) {
      main.innerHTML = `${criteriaBar()}<div class="notice" role="alert"><h2>We couldn't complete your search right now</h2><p>Something went wrong on our side. Your search details are kept. Please try again in a moment.</p><div class="actions"><button type="button" id="retry">Try again</button></div></div>`;
      bindModify();
      $('#retry').addEventListener('click', async (ev) => { ev.target.disabled = true; const form = document.createElement('form'); await runSearch(state.criteria, form); });
      return;
    }
    const all = state.result.hotels;
    if (!all.length) {
      main.innerHTML = `${criteriaBar()}<div class="notice" role="status"><h2>No hotels match your search</h2><p>We found no available inventory for these dates and guests in ${esc(state.criteria.destination)}. Try changing your search.</p>
        <div class="actions"><button class="ghost" type="button" data-focus="checkIn">Change dates</button><button class="ghost" type="button" data-focus="adults">Change occupancy</button><button class="ghost" type="button" data-focus="destination">Change destination</button></div></div>`;
      bindModify();
      main.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => openModify(b.dataset.focus)));
      return;
    }
    const list = filtered(); const f = state.filters; const amen = [...new Set(all.flatMap((h) => h.amenities))].sort();
    const chips = [
      f.maxPrice && ['maxPrice', `Max price ${f.maxPrice}`], f.stars && ['stars', `${f.stars} stars`], ...f.amenities.map((a) => [`amenity:${a}`, a]),
    ].filter(Boolean);
    main.innerHTML = `${criteriaBar()}
      <div class="layout"><aside aria-label="Filters">
        <fieldset><legend>Price</legend><label for="maxPrice">Maximum price per night</label><select id="maxPrice"><option value="">Any</option>${[150, 200, 250, 350].map((p) => `<option ${String(p) === f.maxPrice ? 'selected' : ''}>${p}</option>`).join('')}</select></fieldset>
        <fieldset><legend>Hotel category</legend><label for="stars">Stars</label><select id="stars"><option value="">Any</option>${[3, 4, 5].map((s) => `<option ${String(s) === f.stars ? 'selected' : ''}>${s}</option>`).join('')}</select></fieldset>
        <fieldset><legend>Amenities</legend>${amen.map((a) => `<div><label><input type="checkbox" name="amenity" value="${esc(a)}" ${f.amenities.includes(a) ? 'checked' : ''}> ${esc(a)}</label></div>`).join('')}</fieldset>
      </aside><section aria-label="Results">
        <div style="display:flex;justify-content:space-between;align-items:center"><h1 id="count">${list.length} hotel${list.length === 1 ? '' : 's'} found</h1>
        <label>Sort by <select id="sort" aria-label="Sort by">${[['recommended', 'Recommended'], ['price-asc', 'Price (low to high)'], ['price-desc', 'Price (high to low)'], ['rating', 'Guest rating'], ['distance', 'Distance']].map(([v, t]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
        ${chips.length ? `<div class="chips" aria-label="Active filters">${chips.map(([k, t]) => `<button class="chip" type="button" data-remove="${esc(k)}" aria-label="Remove filter ${esc(t)}">${esc(t)} ✕</button>`).join('')}</div>` : ''}
        ${list.length ? `<ul class="cards" style="list-style:none;padding:0;margin:0">${list.slice(0, state.shown).map((h) => `<li class="card" aria-label="${esc(h.name)}">
            <img src="${img(h)}" alt="${esc(h.name)}">
            <div><h2 style="margin:0">${esc(h.name)}</h2><div>${esc(h.location)} · ${h.stars} stars · rating ${h.rating}</div><div class="fee">${esc(h.fees)}</div></div>
            <div style="text-align:right"><div class="price">From ${money(h.price, h.currency)}</div><div class="fee">per night</div>
            ${h.available ? `<span class="badge">Available</span><div class="actions"><a href="#/hotel/${h.id}">View rooms</a></div>` : '<span class="badge sold">Sold out</span>'}</div></li>`).join('')}</ul>
          ${list.length > state.shown ? '<div class="actions"><button type="button" id="more" class="ghost">Show more hotels</button></div>' : ''}`
        : '<div class="notice" role="status"><h2>No hotels match these filters</h2><div class="actions"><button type="button" id="reset">Reset filters</button></div></div>'}
      </section></div>`;
    bindModify();
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    $('#maxPrice').addEventListener('change', (e) => { f.maxPrice = e.target.value; render(); });
    $('#stars').addEventListener('change', (e) => { f.stars = e.target.value; render(); });
    main.querySelectorAll('input[name=amenity]').forEach((c) => c.addEventListener('change', () => { f.amenities = [...main.querySelectorAll('input[name=amenity]:checked')].map((x) => x.value); render(); }));
    main.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.remove; if (k.startsWith('amenity:')) f.amenities = f.amenities.filter((a) => a !== k.slice(8)); else f[k] = ''; render();
    }));
    $('#more')?.addEventListener('click', () => { state.shown += 4; render(); });
    $('#reset')?.addEventListener('click', () => { state.filters = { maxPrice: '', amenities: [], stars: '' }; render(); });
  }

  async function viewHotel(id) {
    const h = await (await fetch(`api/hotels/${encodeURIComponent(id)}`)).json();
    main.innerHTML = `<p><a href="#/results">← Back to results</a></p><h1>${esc(h.name)}</h1><p>${esc(h.location)} · ${h.stars} stars · rating ${h.rating}</p>
      <img src="${img(h)}" alt="${esc(h.name)}" width="240" height="160"><p>${esc(h.description)}</p><p><strong>Amenities:</strong> ${h.amenities.map(esc).join(', ')}</p><p class="fee">${esc(h.fees)}</p>
      <h2>Rooms and rates</h2><div class="rooms">${h.rooms.map((r) => `<div class="room" aria-label="${esc(r.name)}"><div><strong>${esc(r.name)}</strong><div class="fee">${esc(r.cancellation)}</div></div><div><span class="price">${money(r.price, h.currency)}</span> per night <button type="button" data-room="${esc(r.id)}">Select ${esc(r.name)}</button></div></div>`).join('') || '<p>No rooms available.</p>'}</div><div id="selected"></div>`;
    main.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', () => {
      const r = h.rooms.find((x) => x.id === b.dataset.room);
      $('#selected').innerHTML = `<div class="ok" role="status">Room selected: ${esc(r.name)} at ${money(r.price, h.currency)} per night. ${esc(r.cancellation)}</div>`;
    }));
  }

  function render() {
    const h = location.hash || '#/';
    if (h.startsWith('#/results')) return viewResults();
    if (h.startsWith('#/hotel/')) return viewHotel(h.slice(8));
    return viewSearch();
  }
  window.addEventListener('hashchange', render);
  fetch('api/config').then((r) => r.json()).then((c) => { state.config = c; if (location.hash.startsWith('#/results')) location.hash = '#/'; render(); });
})();
