(() => {
  const FORMATS = [
    { key: 't', name: 'Short time',          opts: { hour: 'numeric', minute: '2-digit' } },
    { key: 'T', name: 'Long time',           opts: { hour: 'numeric', minute: '2-digit', second: '2-digit' } },
    { key: 'd', name: 'Short date',          opts: { day: '2-digit', month: '2-digit', year: 'numeric' } },
    { key: 'D', name: 'Long date',           opts: { day: 'numeric', month: 'long', year: 'numeric' } },
    { key: 'f', name: 'Short date & time',   opts: { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' } },
    { key: 'F', name: 'Long date & time',    opts: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' } },
    { key: 'R', name: 'Relative',            opts: null },
  ];

  const $ = (id) => document.getElementById(id);
  const dateEl = $('date'), timeEl = $('time'), tzEl = $('tz'), epochEl = $('epoch');
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  let epoch = Math.floor(Date.now() / 1000); // seconds

  // --- timezone helpers ---------------------------------------------------
  const partsCache = new Map();
  function partsFormatter(tz) {
    if (!partsCache.has(tz)) {
      partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    }
    return partsCache.get(tz);
  }

  // Wall-clock fields of a UTC instant (ms) in the given timezone.
  function wallParts(ms, tz) {
    const p = {};
    for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = +value;
    return p;
  }

  // Offset (ms) of tz from UTC at the given instant.
  function tzOffset(ms, tz) {
    const p = wallParts(ms, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  // Wall-clock time in tz -> UTC instant (ms). Handles DST transitions.
  function zonedToMs(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off1 = tzOffset(guess - tzOffset(guess, tz), tz);
    const t = guess - off1;
    const off2 = tzOffset(t, tz);
    return off1 === off2 ? t : guess - off2;
  }

  const pad = (n, w = 2) => String(n).padStart(w, '0');

  // Build elements without innerHTML so no string is ever parsed as markup.
  function el(tag, { dataset, ...props } = {}) {
    const node = Object.assign(document.createElement(tag), props);
    if (dataset) Object.assign(node.dataset, dataset);
    return node;
  }

  // JS Date range is ±8.64e15 ms; anything outside breaks Intl formatting.
  const MAX_SEC = 8.64e12;
  const inRange = (sec) => Number.isFinite(sec) && Math.abs(sec) <= MAX_SEC;

  // --- timezone list ------------------------------------------------------
  function fillTimezones() {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* older browsers */ }
    if (!zones.includes('UTC')) zones.unshift('UTC');
    if (!zones.includes(localTz)) zones.unshift(localTz);
    const frag = document.createDocumentFragment();
    for (const z of zones) {
      const o = document.createElement('option');
      o.value = z;
      o.textContent = z === localTz ? `${z.replace(/_/g, ' ')} (your timezone)` : z.replace(/_/g, ' ');
      frag.appendChild(o);
    }
    tzEl.appendChild(frag);
    tzEl.value = localTz;
  }

  // --- rendering ----------------------------------------------------------
  function buildFormatRows() {
    const wrap = $('formats');
    for (const f of FORMATS) {
      const row = el('div', { className: 'fmt' });
      const preview = el('div', { className: 'preview' });
      preview.append(el('span', { dataset: { preview: f.key } }));
      row.append(
        el('div', { className: 'name', textContent: f.name }),
        preview,
        el('code', { dataset: { code: f.key } }),
        el('button', { type: 'button', textContent: 'Copy', dataset: { copy: f.key }, ariaLabel: `Copy ${f.name} code` }),
      );
      wrap.append(row);
    }
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-copy]');
      if (btn) copy(`<t:${epoch}:${btn.dataset.copy}>`, btn);
    });
  }

  function relative(sec) {
    const diff = sec - Math.floor(Date.now() / 1000);
    const abs = Math.abs(diff);
    const units = [
      ['year', 31536000], ['month', 2592000], ['day', 86400],
      ['hour', 3600], ['minute', 60], ['second', 1],
    ];
    for (const [unit, size] of units) {
      if (abs >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit);
    }
  }

  function renderPreviews() {
    const date = new Date(epoch * 1000);
    for (const f of FORMATS) {
      const text = f.opts ? date.toLocaleString(undefined, f.opts) : relative(epoch);
      document.querySelector(`[data-preview="${f.key}"]`).textContent = text;
      document.querySelector(`[data-code="${f.key}"]`).textContent = `<t:${epoch}:${f.key}>`;
    }
    epochEl.textContent = epoch;
  }

  function syncInputs() {
    const p = wallParts(epoch * 1000, tzEl.value);
    dateEl.value = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
    timeEl.value = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  }

  function setEpoch(sec, { fromInputs = false } = {}) {
    if (!inRange(sec)) return;
    epoch = Math.trunc(sec);
    if (!fromInputs) syncInputs();
    renderPreviews();
    history.replaceState(null, '', `#${epoch}`);
  }

  function readInputs() {
    const dm = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(dateEl.value);
    const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(timeEl.value);
    if (!dm || !tm) return;
    const ms = zonedToMs(+dm[1], +dm[2], +dm[3], +tm[1], +tm[2], +(tm[3] || 0), tzEl.value);
    setEpoch(ms / 1000, { fromInputs: true });
  }

  // --- copy ---------------------------------------------------------------
  async function copy(text, btn) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false; // e.g. permission denied; code stays visible to copy by hand
    }
    btn.textContent = ok ? 'Copied!' : 'Failed';
    btn.classList.toggle('copied', ok);
    btn.classList.toggle('failed', !ok);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied', 'failed'); }, 1500);
  }

  // --- parsing ------------------------------------------------------------
  function parseInput(raw) {
    const s = raw.trim();
    const code = /^<t:(-?\d+)(?::[tTdDfFR])?>$/.exec(s);
    if (code) return +code[1];
    if (/^-?\d+$/.test(s)) {
      const n = +s;
      return Math.abs(n) >= 1e11 ? Math.floor(n / 1000) : n; // accept milliseconds too
    }
    return NaN;
  }

  function loadParsed() {
    const hint = $('parseHint');
    const sec = parseInput($('parse').value);
    if (inRange(sec)) {
      setEpoch(sec);
      hint.textContent = `Loaded ${new Date(sec * 1000).toLocaleString()}.`;
      hint.classList.remove('err');
    } else {
      hint.textContent = 'Could not read that. Use digits like 1700000000 or a code like <t:1700000000:F>.';
      hint.classList.add('err');
    }
  }

  // --- wiring -------------------------------------------------------------
  fillTimezones();
  buildFormatRows();

  dateEl.addEventListener('input', readInputs);
  timeEl.addEventListener('input', readInputs);
  tzEl.addEventListener('change', syncInputs); // same instant, shown in the new zone
  $('now').addEventListener('click', () => setEpoch(Date.now() / 1000));
  document.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => setEpoch(epoch + +b.dataset.add)));
  $('parseBtn').addEventListener('click', loadParsed);
  $('parse').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadParsed(); });

  let fromHash = NaN;
  try { fromHash = parseInput(decodeURIComponent(location.hash.slice(1))); } catch { /* malformed % escape */ }
  setEpoch(inRange(fromHash) ? fromHash : Date.now() / 1000);

  // Keep the relative preview ticking.
  setInterval(() => {
    document.querySelector('[data-preview="R"]').textContent = relative(epoch);
  }, 1000);
})();
