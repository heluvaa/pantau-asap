/* PantauAsap — proxy FIRMS (Vercel Serverless Function)
 *
 * Tujuan: MAP_KEY NASA FIRMS TIDAK berada di kode client.
 * Key dibaca dari env var FIRMS_MAP_KEY (Project Settings → Environment Variables).
 *
 * Endpoint:
 *   GET /api/firms?probe=1                          -> { ok, mode }
 *   GET /api/firms?source=&bbox=&day_range[=&date=] -> text/csv (data hotspot)
 *   GET /api/firms?endpoint=data_availability       -> text/csv
 *   GET /api/firms?endpoint=news_rss&q=...          -> application/rss+xml
 *
 * Cache: in-memory per instance + header edge cache (60 menit) — data FIRMS
 * sendiri hanya diperbarui ±3 jam, jadi lebih dari itu percuma.
 */

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api';
const TTL_MS = 60 * 60 * 1000; // 60 menit, sama dengan interval refresh client

const SOURCES_ALLOWED = new Set([
  'VIIRS_SNPP_NRT', 'VIIRS_SNPP_SP',
  'VIIRS_NOAA20_NRT', 'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT',
  'MODIS_NRT', 'MODIS_SP'
]);
const BBOX_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const mem = new Map(); // key -> { at, status, type, body }

function keyOf(req) {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams;
  return ['area', q.get('source'), q.get('bbox'), q.get('day_range'), q.get('date'),
          q.get('endpoint'), q.get('sensor'), q.get('q')].join('|');
}

async function firms(path) {
  const res = await fetch(`${FIRMS_BASE}${path}`, {
    headers: { 'User-Agent': 'PantauAsap/1.0 (public fire dashboard)', Accept: 'text/csv, application/xml, */*' }
  });
  const body = await res.text();
  return { status: res.status, body, ctype: res.headers.get('content-type') || 'text/plain;charset=UTF-8' };
}

function send(res, status, type, body, cache) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache
    ? `public, max-age=${Math.floor(TTL_MS / 1000)}, s-maxage=${Math.floor(TTL_MS / 1000)}, stale-while-revalidate=600`
    : 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).send(body);
}

export default async function handler(req, res) {
  const key = process.env.FIRMS_MAP_KEY || (process.env.VERCEL ? '' : (req.query.key || ''));

  if (req.query.probe) {
    return send(res, 200, 'application/json; charset=utf-8',
      { ok: !!key, mode: key ? 'proxy' : 'no-key', ts: Date.now() }, false);
  }

  if (!key) {
    return send(res, 500, 'application/json; charset=utf-8',
      { error: 'FIRMS_MAP_KEY belum diset pada environment Vercel.' }, false);
  }
  if (req.method !== 'GET') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', false);
  }

  // ---- Google News RSS (fallback berita; browser tidak bisa fetch RSS cross-origin) ----
  if (req.query.endpoint === 'news_rss') {
    const q = String(req.query.q || 'kebakaran hutan indonesia').slice(0, 120);
    try {
      const r = await fetchExternal(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`);
      return send(res, 200, 'application/rss+xml; charset=utf-8', r, true);
    } catch (e) {
      return send(res, 502, 'text/plain; charset=utf-8', 'news upstream gagal: ' + e.message, false);
    }
  }

  // ---- cache lookup ----
  const ck = keyOf(req);
  const hit = mem.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.setHeader('X-PantauAsap-Cache', 'HIT');
    return send(res, hit.status, hit.type, hit.body, true);
  }

  let path;
  if (req.query.endpoint === 'data_availability') {
    const sensor = String(req.query.sensor || 'ALL').replace(/[^A-Z0-9_]/g, '') || 'ALL';
    path = `/data_availability/csv/${encodeURIComponent(key)}/${sensor}`;
  } else {
    const source = String(req.query.source || '');
    const bbox = String(req.query.bbox || '');
    const dr = String(req.query.day_range || '1');
    const date = req.query.date ? String(req.query.date) : '';
    if (!SOURCES_ALLOWED.has(source)) return send(res, 400, 'text/plain; charset=utf-8', 'source tidak dikenal', false);
    if (!BBOX_RE.test(bbox)) return send(res, 400, 'text/plain; charset=utf-8', 'bbox tidak valid', false);
    if (!/^[1-5]$/.test(dr)) return send(res, 400, 'text/plain; charset=utf-8', 'day_range harus 1-5', false);
    if (date && !DATE_RE.test(date)) return send(res, 400, 'text/plain; charset=utf-8', 'date tidak valid', false);
    path = `/area/csv/${encodeURIComponent(key)}/${source}/${bbox}/${dr}${date ? '/' + date : ''}`;
  }

  try {
    const upstream = await firms(path);
    const cachedish = upstream.status === 200;
    if (cachedish) {
      mem.set(ck, { at: Date.now(), status: upstream.status, type: upstream.ctype, body: upstream.body });
      if (mem.size > 24) { // hemat memori: buang entri terlama
        const oldest = [...mem.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) mem.delete(oldest[0]);
      }
    }
    res.setHeader('X-PantauAsap-Cache', 'MISS');
    // body error FIRMS kadang 200 + teks "Invalid MAP_KEY" — jangan cache itu
    const looksErr = upstream.status === 200 && /invalid map_key|unauthorized/i.test(upstream.body.slice(0, 200));
    if (looksErr) return send(res, 502, 'text/plain; charset=utf-8', 'FIRMS menolak MAP_KEY: ' + upstream.body.slice(0, 120), false);
    return send(res, upstream.status, upstream.ctype, upstream.body, cachedish);
  } catch (e) {
    return send(res, 504, 'text/plain; charset=utf-8', 'Upstream FIRMS tidak terjangkau: ' + e.message, false);
  }
}

async function fetchExternal(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PantauAsap/1.0)' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
