/* PantauAsap — proxy server-side Google News RSS (tanpa API key).
 *
 * ATURAN KERAS: artikel 100% asli & realtime dari feed Google News.
 * TIDAK ADA demo/dummy/placeholder. Bila semua feed gagal -> 502 jujur,
 * client menampilkan "Berita tidak dapat dimuat" + tombol coba lagi.
 *
 * Endpoint:
 *   GET /api/news           -> { ok, count, updatedAt, articles[] }
 *   GET /api/news?probe=1   -> { ok, mode: 'news-proxy' }
 *
 * Cache: in-memory 60 menit + header edge cache 60 menit — satu siklus
 * dengan refresh data titik api, supaya timestamp "diperbarui" kredibel.
 */

const TTL_MS = 60 * 60 * 1000;

// Feed diuji manual 2026-10-16: HTTP 200, 108 item (Kompas, detikNews, CNN, ANTARA).
const FEEDS = [
  'https://news.google.com/rss/search?q=%22kebakaran%20hutan%22&hl=id&gl=ID&ceid=ID:id',
  'https://news.google.com/rss/search?q=%22karhutla%22&hl=id&gl=ID&ceid=ID:id'
];

const UA = 'Mozilla/5.0 (compatible; PantauAsap/1.0; +https://pantau-asap.vercel.app)';

let mem = null; // { at, status, body }

function decodeEnt(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function stripCdata(s) {
  const t = String(s).trim();
  const m = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(t);
  return m ? m[1] : t;
}

function tagContent(block, tag) {
  const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i').exec(block);
  return m ? decodeEnt(stripCdata(m[1])) : '';
}

/** Parse RSS -> artikel unik (title, link, source, pubDate). */
function parseItems(xml) {
  const out = [];
  const seen = new Set();
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    let title = tagContent(b, 'title');
    const link = tagContent(b, 'link');
    const pubDate = tagContent(b, 'pubDate');
    const source = tagContent(b, 'source');
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    // judul Google News = "Judul - Penerbit"; potong sufiks bila sama dg source
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3)).trim();
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, link, source, pubDate });
  }
  return out;
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, */*' },
    signal: AbortSignal.timeout(9000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (text.length < 200 || !/<rss|<feed/i.test(text.slice(0, 400))) throw new Error('bukan feed RSS');
  const arts = parseItems(text);
  if (!arts.length) throw new Error('0 artikel');
  return arts;
}

function send(res, status, payload, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache
    ? `public, max-age=${Math.floor(TTL_MS / 1000)}, s-maxage=${Math.floor(TTL_MS / 1000)}, stale-while-revalidate=600`
    : 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.query.probe) {
    return send(res, 200, { ok: true, mode: 'news-proxy', ts: Date.now() }, false);
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed' }, false);
  }

  // cache hit -> artikel tetap asli, berasal dari feed real (maks 60 mnt)
  if (mem && Date.now() - mem.at < TTL_MS) {
    res.setHeader('X-PantauAsap-Cache', 'HIT');
    return send(res, mem.status, mem.body, mem.status === 200);
  }

  let lastErr = null;
  for (const url of FEEDS) {
    try {
      const arts = await fetchFeed(url);
      const payload = {
        ok: true,
        count: Math.min(8, arts.length),
        updatedAt: new Date().toISOString(), // saat feed diambil (dibaca client utk "Berita diperbarui")
        articles: arts.slice(0, 8)
      };
      mem = { at: Date.now(), status: 200, body: payload };
      res.setHeader('X-PantauAsap-Cache', 'MISS');
      return send(res, 200, payload, true);
    } catch (e) {
      lastErr = e;
    }
  }

  // semua sumber gagal -> jujur, TANPA data dummy
  const payload = {
    ok: false,
    error: 'Semua sumber berita (Google News RSS) gagal dijangkau: ' + String(lastErr && lastErr.message || 'unknown').slice(0, 120),
    updatedAt: new Date().toISOString()
  };
  res.setHeader('X-PantauAsap-Cache', 'MISS');
  return send(res, 502, payload, false); // jangan cache kegagalan — coba lagi harus benar-benar ulang
}
