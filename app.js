(() => {
  'use strict';

  // Discord format letter -> Intl options for the preview (null = relative).
  const FORMATS = {
    R: null,
    t: { hour: 'numeric', minute: '2-digit' },
    T: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
    d: { day: '2-digit', month: '2-digit', year: 'numeric' },
    D: { day: 'numeric', month: 'long', year: 'numeric' },
    f: { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' },
    F: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  };

  // JS Date range is ±8.64e15 ms; anything outside breaks Intl formatting.
  const MAX_SEC = 8.64e12;
  const inRange = (sec) => Number.isFinite(sec) && Math.abs(sec) <= MAX_SEC;

  const $ = (id) => document.getElementById(id);
  const app = $('app'), dateEl = $('date'), timeEl = $('time'), tzEl = $('tz'), statusEl = $('status');
  const rows = [...document.querySelectorAll('#rows .row')].map((row) => ({
    key: row.querySelector('[data-copy]').dataset.copy,
    preview: row.querySelector('[data-preview]'),
    code: row.querySelector('[data-code]'),
    button: row.querySelector('[data-copy]'),
  }));
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  const state = { sec: Math.floor(Date.now() / 1000), valid: true };

  // --- timezone helpers ---------------------------------------------------
  const partsCache = new Map();
  function wallParts(ms, tz) {
    if (!partsCache.has(tz)) {
      partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    }
    const p = {};
    for (const { type, value } of partsCache.get(tz).formatToParts(new Date(ms))) p[type] = +value;
    return p;
  }

  // Offset (ms) of tz from UTC at the given instant.
  function tzOffset(ms, tz) {
    const p = wallParts(ms, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }

  // Wall-clock time in tz -> UTC instant (ms). Handles DST transitions.
  function zonedToMs(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off1 = tzOffset(guess - tzOffset(guess, tz), tz);
    const t = guess - off1;
    const off2 = tzOffset(t, tz);
    return off1 === off2 ? t : guess - off2;
  }

  function fillTimezones() {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* older browsers */ }
    zones = [...new Set([localTz, 'UTC', ...zones])];
    for (const z of zones) {
      const label = z.replace(/_/g, ' ');
      tzEl.append(new Option(z === localTz ? `${label} (you)` : label, z));
    }
    tzEl.value = localTz;
  }

  // --- rendering ----------------------------------------------------------
  function relative(sec) {
    const diff = sec - Math.floor(Date.now() / 1000);
    const abs = Math.abs(diff);
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
    for (const [unit, size] of units) {
      if (abs >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit);
    }
  }

  function setStatus(kind, text) {
    if (statusEl.dataset.kind === kind && statusEl.textContent === text) return; // avoid re-announcing
    statusEl.hidden = !kind;
    statusEl.dataset.kind = kind || '';
    statusEl.textContent = text || '';
  }

  function render() {
    const { sec, valid } = state;
    const date = new Date(sec * 1000);
    for (const r of rows) {
      const opts = FORMATS[r.key];
      r.preview.textContent = valid ? (opts ? date.toLocaleString(undefined, opts) : relative(sec)) : '—';
      r.code.textContent = valid ? `<t:${sec}:${r.key}>` : '—';
      r.button.disabled = !valid;
    }
    if (!valid) setStatus('danger', 'Enter a full date and time to get codes.');
    else setStatus(null);
  }

  function syncInputs() {
    const p = wallParts(state.sec * 1000, tzEl.value);
    dateEl.value = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
    timeEl.value = `${pad(p.hour)}:${pad(p.minute)}`;
  }

  function setSec(sec) {
    if (!inRange(sec)) return;
    state.sec = Math.trunc(sec);
    state.valid = true;
    syncInputs();
    render();
    history.replaceState(null, '', `#${state.sec}`);
  }

  function readInputs() {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateEl.value);
    const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(timeEl.value);
    state.valid = !!(dm && tm);
    if (state.valid) {
      state.sec = Math.floor(zonedToMs(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2], +(tm[3] || 0), tzEl.value) / 1000);
      history.replaceState(null, '', `#${state.sec}`);
    }
    render();
  }

  // --- copy ---------------------------------------------------------------
  async function copy(r) {
    if (!state.valid) return;
    let ok = true;
    try {
      await navigator.clipboard.writeText(`<t:${state.sec}:${r.key}>`);
    } catch {
      ok = false; // e.g. permission denied; the code stays visible to copy by hand
    }
    const btn = r.button;
    btn.dataset.state = ok ? 'ok' : 'err';
    btn.textContent = ok ? 'Copied' : 'Failed';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { delete btn.dataset.state; btn.textContent = 'Copy'; }, 1600);
  }

  // --- link hash ----------------------------------------------------------
  function secFromHash() {
    try {
      const s = decodeURIComponent(location.hash.slice(1)).trim();
      const m = /^<t:(-?\d+)(?::[tTdDfFR])?>$/.exec(s) || /^(-?\d+)$/.exec(s);
      return m ? +m[1] : NaN;
    } catch {
      return NaN; // malformed % escape
    }
  }

  // --- wiring -------------------------------------------------------------
  fillTimezones();
  for (const r of rows) r.button.addEventListener('click', () => copy(r));
  dateEl.addEventListener('input', readInputs);
  timeEl.addEventListener('input', readInputs);
  tzEl.addEventListener('change', () => { if (state.valid) syncInputs(); }); // same instant, new zone
  $('now').addEventListener('click', () => setSec(Date.now() / 1000));
  window.addEventListener('hashchange', () => { const s = secFromHash(); if (inRange(s) && s !== state.sec) setSec(s); });

  const fromHash = secFromHash();
  setSec(inRange(fromHash) ? fromHash : Date.now() / 1000);
  delete app.dataset.loading;

  // Keep the relative preview current.
  setInterval(() => { if (state.valid) render(); }, 1000);
})();
