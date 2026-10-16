/* PantauAsap — utilities global (namespace PA) */
(function (global) {
  const PA = global.PA = global.PA || {};

  const WIB = 'Asia/Jakarta';
  const pad = (n) => String(n).padStart(2, '0');

  PA.dateWIB = (ms) => new Date(ms);

  PA.fmtDayMonthWIB = (ms) => {
    const d = new Date(ms);
    const s = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, day: 'numeric', month: 'short' }).format(d);
    return s;
  };

  PA.fmtClockWIB = (ms) => {
    const d = new Date(ms);
    return new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) + ' WIB';
  };

  PA.fmtDateTimeWIB = (ms) => {
    const d = new Date(ms);
    const date = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    return `${date}, ${PA.fmtClockWIB(ms)}`;
  };

  /** 'YYYY-MM-DD' + HHMM (UTC) -> ms epoch */
  PA.utcToMs = (dateStr, hhmm) => {
    const p = dateStr.split('-');
    const h = Math.floor(hhmm / 100), m = hhmm % 100;
    return Date.UTC(+p[0], +p[1] - 1, +p[2], h, m);
  };

  PA.isoDateUTC = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  PA.addDaysISO = (iso, n) => {
    const p = iso.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return PA.isoDateUTC(d.getTime());
  };

  PA.daysBetweenISO = (a, b) => {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  };

  PA.n0 = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('id-ID'));
  PA.n1 = (n) => (n == null || isNaN(n) ? '—' : n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  PA.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  PA.debounce = (fn, ms) => {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  };

  PA.ICON = {
    alert: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    database: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>',
    news: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>'
  };

  /* ---------- banner sistem (error / peringatan / info) ---------- */
  const banners = new Map();
  function renderBanners() {
    const el = document.getElementById('banners');
    if (!el) return;
    el.innerHTML = '';
    for (const b of banners.values()) {
      const div = document.createElement('div');
      div.className = 'banner banner-' + b.level;
      div.setAttribute('role', b.level === 'error' ? 'alert' : 'status');
      div.innerHTML = `${PA.ICON[b.icon] || PA.ICON.info}<div><strong>${PA.esc(b.title)}</strong> ${b.body}</div>`;
      el.appendChild(div);
    }
  }
  PA.banner = {
    set(id, level, title, body, icon) { banners.set(id, { level, title, body, icon }); renderBanners(); },
    clear(id) { banners.delete(id); renderBanners(); },
    clearAll() { banners.clear(); renderBanners(); }
  };

  /* ---------- cache IndexedDB + fallback localStorage ---------- */
  const DB_NAME = 'pantauasap', STORE = 'cache';
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) return reject(new Error('no indexedDB'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  PA.cache = {
    async get(key) {
      try {
        const db = await openDB();
        return await new Promise((res, rej) => {
          const rq = db.transaction(STORE).objectStore(STORE).get(key);
          rq.onsuccess = () => res(rq.result || null);
          rq.onerror = () => rej(rq.error);
        });
      } catch (e) {
        try {
          const raw = localStorage.getItem('pa_' + key);
          return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
      }
    },
    async set(key, val) {
      try {
        const db = await openDB();
        await new Promise((res, rej) => {
          const rq = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
          rq.onsuccess = res; rq.onerror = () => rej(rq.error);
        });
      } catch (e) {
        try { localStorage.setItem('pa_' + key, JSON.stringify(val)); } catch (_) { /* quota: abaikan */ }
      }
    }
  };
})(window);
