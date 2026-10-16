/* PantauAsap — layer data NASA FIRMS (parser CSV, mode proxy/direct, fallback) */
(function (global) {
  const PA = global.PA = global.PA || {};

  const SRC_LABEL = {
    VIIRS_SNPP_NRT: 'VIIRS Suomi-NPP',
    VIIRS_NOAA20_NRT: 'VIIRS NOAA-20',
    MODIS_NRT: 'MODIS Terra/Aqua'
  };
  PA.SRC_LABEL = SRC_LABEL;

  function cfg() { return global.PANTAU_CONFIG || {}; }

  /* ---------- CSV parser RFC-ish (FIRMS = simple comma CSV, quoted fields jarang) ---------- */
  function parseCSV(text) {
    const rows = [];
    let field = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim());
    const idx = {}; head.forEach((h, i) => { idx[h] = i; });
    const need = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp', 'satellite', 'instrument', 'daynight'];
    for (const n of need) if (!(n in idx)) return []; // header tidak cocok -> buang
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const a = rows[r];
      if (a.length < head.length - 2) continue;
      out.push({
        latitude: a[idx.latitude], longitude: a[idx.longitude], acq_date: a[idx.acq_date],
        acq_time: a[idx.acq_time], confidence: a[idx.confidence], frp: a[idx.frp],
        satellite: a[idx.satellite], instrument: a[idx.instrument], daynight: a[idx.daynight],
        brightness: a[idx.brightness] || a[idx.bright_ti4] || '',
        bright_ti5: a[idx.bright_ti5] || a[idx.bright_t31] || ''
      });
    }
    return out;
  }

  /* ---------- normalisasi baris ---------- */
  /* confidence: VIIRS = huruf (l/n/h), MODIS = angka 0-100 */
  function normConfidence(raw, isModis) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (isModis) {
      const v = parseFloat(s);
      if (isNaN(v)) return 0;
      return v > 80 ? 2 : v >= 50 ? 1 : 0;
    }
    return s === 'h' ? 2 : s === 'n' ? 1 : s === 'l' ? 0 : 1;
  }
  function confRaw(raw, isModis) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (isModis) { const v = parseFloat(s); return isNaN(v) ? null : Math.round(v); }
    return { l: 20, n: 50, h: 80 }[s] ?? null;
  }

  function normalize(raw, source) {
    const isModis = /MODIS/.test(source);
    const lat = parseFloat(raw.latitude), lon = parseFloat(raw.longitude);
    const frp = parseFloat(raw.frp);
    const bright = parseFloat(raw.brightness);
    const ti5 = parseFloat(raw.bright_ti5);
    const hhmm = parseInt(raw.acq_time, 10);
    const ms = /^\d{4}-\d{2}-\d{2}$/.test(raw.acq_date) && !isNaN(hhmm)
      ? PA.utcToMs(raw.acq_date, hhmm <= 2359 ? hhmm : 2359)
      : NaN;
    return {
      lat, lon, ms,
      date: raw.acq_date,
      conf: normConfidence(raw.confidence, isModis),
      confRaw: raw.confidence,
      confPct: confRaw(raw.confidence, isModis),
      frp: isFinite(frp) ? frp : null,
      bright: isFinite(bright) ? bright : null,
      ti5: isFinite(ti5) ? ti5 : null,
      sat: raw.satellite, instr: raw.instrument,
      dn: String(raw.daynight || '').toUpperCase() === 'D' ? 'siang' : String(raw.daynight || '').toUpperCase() === 'N' ? 'malam' : '—',
      source
    };
  }

  function dedupe(list) {
    const seen = new Set(), out = [];
    for (const p of list) {
      if (!isFinite(p.lat) || !isFinite(p.lon) || p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) continue;
      const key = `${p.source}|${p.ms}|${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }

  /* ---------- request builders ---------- */
  const API = 'https://firms.modaps.eosdis.nasa.gov/api';

  function directURL(source, bbox, dayRange, date) {
    const c = cfg();
    let u = `${API}/area/csv/${encodeURIComponent(c.FIRMS_MAP_KEY || '')}/${source}/${bbox.join(',')}/${dayRange}`;
    if (date) u += `/${date}`;
    return u;
  }

  async function fetchText(url) {
    const res = await fetch(url, { headers: { Accept: 'text/csv, text/plain, */*' } });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(body || '').slice(0, 120)}`);
    if (body && /invalid map_key|unauthorized|not available/i.test(body.slice(0, 300))) {
      throw new Error(body.slice(0, 140).trim());
    }
    return body;
  }

  /** Satu source, day_range <=5, opsional tanggal mulai */
  async function fetchWindow(source, bbox, dayRange, date, useProxy) {
    let url;
    if (useProxy) {
      const c = cfg();
      const base = (c.FIRMS_PROXY_ENDPOINT || '/api/firms');
      const qs = new URLSearchParams({ source, bbox: bbox.join(','), day_range: String(dayRange) });
      if (date) qs.set('date', date);
      url = `${base}?${qs}`;
    } else {
      url = directURL(source, bbox, dayRange, date);
    }
    const text = await fetchText(url);
    return parseCSV(text).map((r) => normalize(r, source));
  }

  /**
   * Ambil data semua source yang dipilih utk rentang window (24h/48h/7d).
   * Strategi tanggal: pakai data_availability max_date sbg anchor "hari ini".
   * 24h -> 1 req day_range 2 (today+yesterday, disaring window ts)
   * 48h -> 1 req day_range 2
   * 7d  -> 2 req: day_range 5 recent + day_range 2 dated (anchor-6d)
   * @returns {points, fetchedAt, availability, notes[]}
   */
  async function fetchFirms(selectedSources, windowKey) {
    const c = cfg();
    const bbox = c.BBOX || [105.0, -11.0, 141.0, 6.0];
    const notes = [];
    const avail = await getAvailability();
    const now = Date.now();
    const WIN = { '24h': 24 * 3600e3, '48h': 48 * 3600e3, '7d': 7 * 24 * 3600e3 };
    const cut = now - (WIN[windowKey] || WIN['48h']);

    const useProxy = await proxyAvailable();
    if (!useProxy && (c.FIRMS_MODE || 'auto') === 'proxy') {
      throw new Error('Endpoint proxy FIRMS (/api/firms) tidak tersedia di build ini.');
    }
    if (!useProxy && !(c.FIRMS_MAP_KEY || '').trim()) {
      throw new Error('MAP_KEY belum dikonfigurasi (config.js: FIRMS_MAP_KEY).');
    }

    const jobs = [];
    for (const src of selectedSources) {
      const anchorISO = avail[src] || PA.isoDateUTC(now);
      if (windowKey === '7d') {
        const early = PA.addDaysISO(anchorISO, -6);
        jobs.push(fetchWindow(src, bbox, 5, null, useProxy).catch(e => { notes.push(`${SRC_LABEL[src]}: ${e.message}`); return []; }));
        jobs.push(fetchWindow(src, bbox, 2, early, useProxy).catch(e => { notes.push(`${SRC_LABEL[src]}/${early}: ${e.message}`); return []; }));
      } else {
        jobs.push(fetchWindow(src, bbox, 2, null, useProxy).catch(e => { notes.push(`${SRC_LABEL[src]}: ${e.message}`); return []; }));
      }
    }
    const parts = await Promise.all(jobs);
    let all = parts.flat().filter((p) => p.ms >= cut);
    all = dedupe(all);
    if (!all.length && notes.length) throw new Error(notes[0]);
    return { points: all, fetchedAt: now, availability: avail, notes, via: useProxy ? 'proxy' : 'direct' };
  }

  /* ---------- availability (kapan data satelit tersedia) ---------- */
  let availCache = null, availPromise = null;
  async function getAvailability(force) {
    if (availCache && !force) return availCache;
    if (availPromise) return availPromise;
    availPromise = (async () => {
      const out = {};
      try {
        const c = cfg();
        let text;
        if (await proxyAvailable()) {
          text = await fetchText((c.FIRMS_PROXY_ENDPOINT || '/api/firms') + '?endpoint=data_availability&sensor=ALL');
        } else if ((c.FIRMS_MAP_KEY || '').trim()) {
          text = await fetchText(`${API}/data_availability/csv/${encodeURIComponent(c.FIRMS_MAP_KEY)}/ALL`);
        } else {
          text = await fetchText('demo/availability.csv').catch(() => '');
        }
        const rows = parseSimpleCSV(text, ['data_id', 'min_date', 'max_date']);
        for (const r of rows) if (r.data_id && r.max_date) out[r.data_id] = r.max_date;
      } catch (e) {
        try {
          const text = await fetchText('demo/availability.csv');
          const rows = parseSimpleCSV(text, ['data_id', 'min_date', 'max_date']);
          for (const r of rows) if (r.data_id && r.max_date) out[r.data_id] = r.max_date;
          notesPush('data_availability memakai snapshot lokal.');
        } catch (_) { /* pakai today */ }
      }
      availCache = out; availPromise = null;
      return out;
    })();
    return availPromise;
  }
  let notesPush = () => {};
  PA.__setNotesPush = (fn) => { notesPush = fn; };

  function parseSimpleCSV(text, want) {
    const rows = [];
    (text || '').split(/\r?\n/).slice(1).forEach((l) => {
      const a = l.split(',');
      if (a.length >= 3) {
        const o = {};
        want.forEach((k, i) => { o[k] = a[i]; });
        rows.push(o);
      }
    });
    return rows;
  }

  /* ---------- deteksi keberadaan proxy (Vercel fn). Diuji sekali. ---------- */
  let proxyCheck = null;
  function proxyAvailable() {
    if (proxyCheck != null) return Promise.resolve(proxyCheck);
    const c = cfg();
    if ((c.FIRMS_MODE || 'auto') === 'direct') { proxyCheck = false; return Promise.resolve(false); }
    const probe = (c.FIRMS_PROXY_ENDPOINT || '/api/firms') + '?probe=1';
    proxyCheck = fetch(probe, { headers: { Accept: 'application/json' } })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
      .then((j) => { proxyCheck = !!(j && j.ok); return proxyCheck; })
      .catch(() => { proxyCheck = false; return false; });
    return proxyCheck;
  }

  /* ---------- dataset demo (fallback tanpa key) ---------- */
  async function fetchDemo(selectedSources, windowKey) {
    const files = {
      VIIRS_SNPP_NRT: 'demo/viirs_snpp.csv',
      VIIRS_NOAA20_NRT: 'demo/viirs_noaa20.csv',
      MODIS_NRT: 'demo/modis.csv'
    };
    const jobs = selectedSources.map((s) =>
      fetchText(files[s]).then((t) => parseCSV(t).map((r) => normalize(r, s))).catch(() => []));
    let pts = (await Promise.all(jobs)).flat();
    // anchor demo = tanggal max di data
    let maxDate = '';
    for (const p of pts) if (p.date > maxDate) maxDate = p.date;
    const anchor = PA.utcToMs(maxDate, 2359);
    const WIN = { '24h': 24, '48h': 48, '7d': 168 };
    const cut = anchor - (WIN[windowKey] || 48) * 3600e3;
    pts = pts.filter((p) => p.ms >= cut);
    return { points: dedupe(pts), fetchedAt: anchor, availability: {}, notes: [], via: 'demo' };
  }

  PA.firms = { fetchFirms, fetchDemo, getAvailability, parseCSV, normalize, SRC_LABEL };
})(window);
