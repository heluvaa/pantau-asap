/* PantauAsap — berita terkini via proxy server-side /api/news (Google News RSS).
 *
 * ATURAN KERAS: hanya artikel 100% asli & realtime dari feed Google News.
 * Tidak ada demo/dummy/placeholder, tidak ada skeleton loading tak berujung.
 * Bila semua sumber gagal: pesan jujur + tombol coba lagi.
 */
(function (global) {
  const PA = global.PA = global.PA || {};

  async function loadNews(force) {
    const url = '/api/news' + (force ? '?r=' + Date.now() : '');
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    let j = null;
    try { j = await res.json(); } catch (_) { /* respons bukan JSON */ }
    if (!res.ok || !j || j.ok !== true || !Array.isArray(j.articles) || !j.articles.length) {
      throw new Error((j && j.error) ? String(j.error) : 'HTTP ' + res.status);
    }
    return j;
  }

  /* state gagal: jujur, tanpa data fiktif */
  function renderError(el, err) {
    el.innerHTML = `
      <p class="news-empty news-fail">Berita tidak dapat dimuat.
        <button id="btn-news-retry" class="btn btn-retry" type="button">Coba lagi</button>
      </p>
      <p class="news-reason">Penyebab: <code>${PA.esc(String(err.message || err).slice(0, 120))}</code> —
        sumber (Google News RSS via proxy server) tidak dapat dijangkau. Data titik api tetap live.</p>`;
    const btn = document.getElementById('btn-news-retry');
    if (btn) btn.addEventListener('click', () => {
      btn.disabled = true;
      (PA.retryNews || PA.renderNews)({ force: true });
    });
  }

  function renderArticles(el, arts) {
    el.innerHTML = '';
    for (const a of arts.slice(0, 8)) {
      const d = new Date(a.pubDate || Date.now());
      const when = isNaN(d.getTime()) ? '' : PA.fmtDateTimeWIB(d.getTime());
      const item = document.createElement('article');
      item.className = 'news-item';
      item.innerHTML = `
        <a class="news-link" href="${PA.esc(a.link)}" target="_blank" rel="noopener nofollow">${PA.esc(a.title)}</a>
        <div class="news-meta"><span>${PA.esc(a.source || 'sumber tidak dikenal')}</span>${when ? `<span>· ${when}</span>` : ''}</div>`;
      el.appendChild(item);
    }
  }

  /**
   * PA.renderNews({ force }) — tarik & render berita.
   * force=true dipakai tombol "Coba lagi" (bypass cache HTTP dengan query acak).
   */
  PA.renderNews = async function (opts) {
    const force = !!(opts && opts.force);
    const el = document.getElementById('news-list');
    const stamp = document.getElementById('news-updated');
    if (!el) return;
    if (stamp) stamp.textContent = 'Memuat berita…';
    try {
      const j = await loadNews(force);
      const t = Date.parse(j.updatedAt);
      if (stamp) {
        stamp.textContent = isNaN(t)
          ? 'Berita diperbarui: waktu tidak diketahui'
          : 'Berita diperbarui: ' + PA.fmtClockWIB(t);
      }
      renderArticles(el, j.articles);
    } catch (e) {
      if (stamp) stamp.textContent = 'Berita gagal dimuat — silakan coba lagi.';
      renderError(el, e);
    }
  };
})(window);
