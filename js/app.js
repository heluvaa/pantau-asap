/* PantauAsap — orkestrasi: state, filter, fetch chain (live -> cache -> demo), refresh */
(function (global) {
  const PA = global.PA = global.PA || {};
  const cfg = () => global.PANTAU_CONFIG || {};

  const state = {
    window: '48h',
    sources: new Set((cfg().SOURCES || ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'])),
    minConf: 0,
    raw: [],            // seluruh titik hasil fetch terakhir (belum difilter)
    mode: null,         // 'live' | 'cache' | 'demo'
    fetchedAt: null,
    timer: null,
    newsBusy: false,
    lastDataHash: null
  };

  /* ---------------- helpers ---------------- */
  const $ = (id) => document.getElementById(id);

  function setStatus(kind, text) {
    const el = $('status-chip');
    el.className = 'chip chip-' + kind;
    el.textContent = text;
  }

  function filtered() {
    return state.raw.filter((p) => state.sources.has(p.source) && p.conf >= state.minConf);
  }

  function applyFilters() {
    const pts = filtered();
    PA.map.setData(pts);
    PA.renderStats(pts);
    setStatus(state.mode === 'demo' ? 'warn' : 'ok',
      state.mode === 'demo' ? `Mode demo · ${PA.n0(pts.length)} titik` : `${PA.n0(pts.length)} titik tampil`);
  }

  /* ---------------- fetch pipeline ---------------- */
  const CACHE_KEY = 'hotspots_v1';
  let reqGen = 0;

  async function loadLive() {
    return PA.firms.fetchFirms([...state.sources], state.window);
  }

  async function loadAll() {
    const my = ++reqGen;
    const stale = () => my !== reqGen;
    document.body.dataset.busyId = String(my); // test/observability hook
    $('btn-refresh').disabled = true;
    $('btn-refresh').classList.add('is-busy');
    setStatus('info', 'Mengambil data satelit…');
    PA.banner.clear('key'); PA.banner.clear('live'); PA.banner.clear('cache'); PA.banner.clear('demo');

    let result = null, liveError = null;
    try {
      result = await loadLive();
      if (stale()) return;
      state.mode = 'live';
      if (result.notes && result.notes.length) {
        PA.banner.set('live', 'warn', 'Sebagian sumber gagal dimuat:', PA.esc(result.notes.join(' · ')), 'alert');
      }
      PA.cache.set(CACHE_KEY, { at: Date.now(), points: result.points });
    } catch (e) {
      if (stale()) return;
      liveError = e;
      const cached = await PA.cache.get(CACHE_KEY);
      if (stale()) return;
      if (cached && Array.isArray(cached.points) && cached.points.length) {
        result = { points: cached.points, fetchedAt: cached.at, via: 'cache' };
        state.mode = 'cache';
        PA.banner.set('cache', 'warn', 'Data live gagal diambil — yang tampil adalah data tersimpan terakhir.',
          `Penyebab: <code>${PA.esc(String(e.message).slice(0, 160))}</code>`, 'database');
      } else if (cfg().DEMO_MODE !== false) {
        const demo = await PA.firms.fetchDemo([...state.sources], state.window);
        if (stale()) return;
        result = { points: demo.points, fetchedAt: demo.fetchedAt, via: 'demo' };
        state.mode = 'demo';
        PA.banner.set('demo', 'demo', 'Sedang menampilkan DATA DEMO (snapshot FIRMS, bukan live).',
          liveError && /MAP_KEY/i.test(liveError.message)
            ? 'Isi <code>FIRMS_MAP_KEY</code> pada <code>config.js</code> (lokal) atau env <code>FIRMS_MAP_KEY</code> di Vercel, lalu Perbarui.'
            : `Penyebab: <code>${PA.esc(String(liveError && liveError.message).slice(0, 160))}</code>`, 'info');
      } else {
        PA.banner.set('live', 'error', 'Gagal mengambil data titik api.',
          `Penyebab: <code>${PA.esc(String(e.message).slice(0, 200))}</code> Tidak ada cache lokal, dan mode demo dimatikan. Coba <strong>Perbarui</strong> lagi dalam beberapa menit.`, 'alert');
        setStatus('bad', 'Data gagal dimuat');
      }
    }
    if (stale() || !result) {
      if (!stale()) { $('btn-refresh').disabled = false; $('btn-refresh').classList.remove('is-busy'); }
      return;
    }

    state.raw = result.points;
    state.fetchedAt = result.fetchedAt || Date.now();
    $('updated-at').textContent = PA.fmtDateTimeWIB(state.fetchedAt);

    applyFilters();

    $('btn-refresh').disabled = false;
    $('btn-refresh').classList.remove('is-busy');
    document.body.dataset.busyId = '';
    scheduleNews();
  }

  /* ---------------- berita: ambil max 1x per refresh cycle, hormati throttle GDELT ---------------- */
  async function scheduleNews() {
    if (state.newsBusy) return;
    if (Date.now() - (state.newsAt || 0) < 4 * 60 * 1000) return; // hemat throttle publik GDELT
    state.newsBusy = true;
    state.newsAt = Date.now();
    try { await PA.renderNews(); }
    catch (e) { /* renderNews sudah menangani fallback internal */ }
    finally { state.newsBusy = false; }
  }

  /* ---------------- auto refresh ---------------- */
  function setupTimer() {
    const mins = Math.max(5, Number(cfg().REFRESH_MINUTES) || 60);
    $('refresh-interval').textContent = String(mins);
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      // jeda acak kecil supaya banyak tab tidak menabrak quota bersamaan
      setTimeout(loadAll, Math.random() * 60000);
    }, mins * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.fetchedAt && Date.now() - state.fetchedAt > mins * 60 * 1000) loadAll();
    });
  }

  /* ---------------- UI events ---------------- */
  function setupUI() {
    document.querySelectorAll('.chip-btn[data-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-checked') === 'true') return;
        document.querySelectorAll('.chip-btn[data-range]').forEach((b) => {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
        });
        state.window = btn.dataset.range;
        // ganti window -> butuh fetch baru (karena potong waktu berbeda)
        loadAll();
      });
    });

    document.querySelectorAll('.chip-btn[data-source]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const on = btn.classList.toggle('is-active');
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        if (on) state.sources.add(btn.dataset.source); else state.sources.delete(btn.dataset.source);
        if (!state.sources.size) { // cegah peta kosong total: aktifkan lagi yang terakhir
          btn.classList.add('is-active'); btn.setAttribute('aria-checked', 'true');
          state.sources.add(btn.dataset.source);
          PA.banner.set('key', 'warn', 'Minimal satu satelit harus dipilih.', '', 'info');
          setTimeout(() => PA.banner.clear('key'), 3500);
          return;
        }
        // toggle satelit cukup difilter dari raw TANPA fetch ulang bila mode live 48h/24h
        // (7d sudah memuat semua source terpilih saat fetch; source baru butuh fetch)
        const had = state.raw.some((p) => state.sources.has(p.source));
        if (!had) loadAll(); else applyFilters();
      });
    });

    $('sel-confidence').addEventListener('change', (e) => {
      state.minConf = Number(e.target.value) || 0;
      applyFilters();
    });

    $('btn-refresh').addEventListener('click', loadAll);
    $('year').textContent = String(new Date().getFullYear());
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    if (global.__CONFIG_MISSING || !global.PANTAU_CONFIG) {
      // config.js tidak ada (mis. deploy Vercel tanpa file, GitHub Pages belum diisi)
      // -> pakai bawaan 'auto': proxy /api/firms dicoba dulu (Vercel punya
      // serverless + env key), baru direct/demo. Banner panduan muncul lewat
      // jalur demo/cache bila keduanya gagal.
      global.PANTAU_CONFIG = global.PANTAU_CONFIG || {
        DEMO_MODE: true,
        FIRMS_MODE: 'auto',
        SOURCES: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'],
        BBOX: [105, -11, 141, 6],
        REFRESH_MINUTES: 60
      };
      console.warn('PantauAsap: config.js tidak ditemukan — memakai konfigurasi bawaan (mode auto).');
    }
    setupUI();
    setupTimer();
    try { await PA.geoLoad(); }
    catch (e) {
      PA.banner.set('geo', 'warn', 'Batas provinsi gagal dimuat — statistik per provinsi tidak tersedia.',
        PA.esc(String(e.message).slice(0, 120)), 'alert');
    }
    PA.map.init($('map'));
    await loadAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
