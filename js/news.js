/* PantauAsap — berita terkini: GDELT DOC 2.0 / GNews.io, fallback link pencarian */
(function (global) {
  const PA = global.PA = global.PA || {};

  function cfg() { return global.PANTAU_CONFIG || {}; }

  /* parse RSS (Google News) -> artikel */
  function parseRSS(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const items = [...doc.querySelectorAll('item')].slice(0, 8);
    return items.map((it) => ({
      title: (it.querySelector('title') || {}).textContent || '',
      link: (it.querySelector('link') || {}).textContent || '',
      source: (it.querySelector('source') || {}).textContent || '',
      pubDate: (it.querySelector('pubDate') || {}).textContent || ''
    })).filter((a) => a.title && a.link);
  }

  function gdeltDate(sd) {
    // GDELT seendate: '20261015T093000Z' -> ISO
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(sd || ''));
    if (!m) return sd || '';
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }

  /* GDELT DOC 2.0 (tanpa key, CORS *). Rate limit publik: max 1 req/5 dtk.
     Query terverifikasi: bilingual OR (artikel lokal Indonesia ikut ke-Index). */
  async function fromGdelt() {
    const c = cfg();
    const base = c.GDELT_ENDPOINT || 'https://api.gdeltproject.org/api/v2/doc/doc';
    const urls = [
      `${base}?query=indonesia%20(fire%20OR%20wildfire%20OR%20karhutla)&mode=ArtList&maxrecords=10&format=json&timespan=2d&sort=DateDesc`,
      `${base}?query=%22kebakaran%20hutan%22&mode=ArtList&maxrecords=10&format=json&timespan=7d&sort=DateDesc`
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok || text[0] !== '{') { lastErr = new Error('GDELT: ' + text.slice(0, 60)); continue; }
        const j = JSON.parse(text);
        const arts = (j.articles || []).slice(0, 8).map((a) => ({
          title: a.title || '',
          link: a.url || '',
          source: a.domain || '',
          pubDate: gdeltDate(a.seendate)
        })).filter((a) => a.title && a.link);
        if (arts.length) return arts;
        lastErr = new Error('GDELT: 0 artikel');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('GDELT gagal');
  }

  /* GNews.io bila key diisi */
  async function fromGNews() {
    const c = cfg();
    if (!(c.GNEWS_API_KEY || '').trim()) throw new Error('GNews key kosong');
    const p = new URLSearchParams({
      q: c.NEWS_QUERY || 'kebakaran hutan indonesia',
      lang: 'id',
      country: 'id',
      max: '10',
      apiKey: c.GNEWS_API_KEY.trim(),
      sortby: 'publishedAt'
    });
    const res = await fetch(`${c.GNEWS_ENDPOINT || 'https://gnews.io/api/v4/search'}?${p}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j.articles)) throw new Error('GNews HTTP ' + res.status + (j.errors ? ': ' + j.errors[0] : ''));
    return j.articles.slice(0, 8).map((a) => ({ title: a.title, link: a.url, source: (a.source && a.source.name) || '', pubDate: a.publishedAt }));
  }

  /* fallback: link Google News (RSS server-side tidak bisa dibaca CORS dari browser) */
  function fallbackLinks(err) {
    const c = cfg();
    const el = document.getElementById('news-list');
    const msg = err ? `Berita tidak bisa dimuat (${PA.esc(String(err.message || err).slice(0, 90))}).` : 'Berita tidak tersedia.';
    el.innerHTML = `
      <p class="news-empty">${msg}<br>
        Buka pencarian langsung:
        <a href="https://news.google.com/search?q=%22kebakaran%20hutan%22%20indonesia&hl=id&gl=ID&ceid=ID:id" target="_blank" rel="noopener">Google News</a> ·
        <a href="https://www.detik.com/search?search=${encodeURIComponent(c.NEWS_QUERY || 'kebakaran hutan')}" target="_blank" rel="noopener">Detik</a> ·
        <a href="https://m.mongabay.co.id/?s=${encodeURIComponent('karhutla')}" target="_blank" rel="noopener">Mongabay</a>
      </p>`;
  }

  /* fallback lain: Google News RSS lewat proxy serverless (browser tak bisa langsung, CORS) */
  async function fromRSSViaProxy() {
    const c = cfg();
    const base = c.FIRMS_PROXY_ENDPOINT || '/api/firms';
    const res = await fetch(`${base}?endpoint=news_rss&q=${encodeURIComponent((c.NEWS_QUERY || 'kebakaran hutan') + ' indonesia')}`);
    const text = await res.text();
    if (!res.ok) throw new Error('proxy RSS HTTP ' + res.status);
    const arts = parseRSS(text);
    if (!arts || !arts.length) throw new Error('RSS kosong');
    return arts;
  }

  PA.renderNews = async function () {
    const el = document.getElementById('news-list');
    el.innerHTML = '<div class="skel" style="height:14px"></div><div class="skel" style="height:14px;width:80%"></div><div class="skel" style="height:14px;width:60%"></div>';
    let arts = null, lastErr = null;

    try { arts = await fromGNews(); } catch (e) { lastErr = e; }
    if (!arts || !arts.length) {
      try { arts = await fromGdelt(); lastErr = null; } catch (e) { lastErr = lastErr || e; }
    }
    if (!arts || !arts.length) {
      try { arts = await fromRSSViaProxy(); lastErr = null; } catch (e) { lastErr = lastErr || e; }
    }
    if (!arts || !arts.length) {
      try {
        const res = await fetch('demo/news.json');
        if (res.ok) arts = await res.json();
      } catch (_) { /* lanjut fallback link */ }
    }

    if (!arts || !arts.length) { fallbackLinks(lastErr); return; }

    el.innerHTML = '';
    for (const a of arts.slice(0, 8)) {
      const d = new Date(a.pubDate || Date.now());
      const when = isNaN(d) ? '' : PA.fmtDateTimeWIB(d.getTime());
      const item = document.createElement('article');
      item.className = 'news-item';
      item.innerHTML = `
        <a class="news-link" href="${PA.esc(a.link)}" target="_blank" rel="noopener nofollow">${PA.esc(a.title)}</a>
        <div class="news-meta"><span>${PA.esc(a.source || 'sumber tidak dikenal')}</span>${when ? `<span>· ${when}</span>` : ''}</div>`;
      el.appendChild(item);
    }
  };
})(window);
