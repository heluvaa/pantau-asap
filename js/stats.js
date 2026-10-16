/* PantauAsap — statistik: KPI, per provinsi (point-in-polygon), tren harian */
(function (global) {
  const PA = global.PA = global.PA || {};

  function aggregate(points) {
    const byProv = new Map();
    let area = 0, high = 0;
    for (const p of points) {
      if (p.conf === 2) high++;
      area += PA.estAreaKm2(p);
      const prov = PA.geo ? PA.geo.find(p.lat, p.lon) : null;
      const name = prov ? prov.id : 'Di luar wilayah / perairan';
      let e = byProv.get(name);
      if (!e) { e = { name, n: 0, area: 0, isKey: !!(prov && prov.isKey), isNew: !!(prov && prov.isNew), parent: prov && prov.parent ? prov.parent : null }; byProv.set(name, e); }
      e.n++; e.area += PA.estAreaKm2(p);
    }
    // tanggal terisi dalam window (untuk tren)
    const days = new Map();
    for (const p of points) if (p.date) days.set(p.date, (days.get(p.date) || 0) + 1);
    return {
      total: points.length,
      high,
      provCount: [...byProv.keys()].filter((k) => !k.startsWith('Di luar')).length,
      area,
      provs: [...byProv.values()].sort((a, b) => b.n - a.n),
      days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    };
  }

  PA.renderStats = function (points) {
    const agg = aggregate(points);
    const q = (id) => document.getElementById(id);

    q('kpi-total').textContent = PA.n0(agg.total);
    q('kpi-high').textContent = PA.n0(agg.high);
    q('kpi-prov').textContent = PA.n0(agg.provCount);
    q('kpi-area').textContent = agg.area >= 100 ? PA.n0(agg.area) : PA.n1(agg.area);

    /* ---- provinsi ---- */
    const list = q('prov-list');
    list.innerHTML = '';
    const top = agg.provs.filter((p) => !p.name.startsWith('Di luar')).slice(0, 12);
    const outOf = agg.provs.find((p) => p.name.startsWith('Di luar'));
    const rows = outOf ? [...top, outOf] : top;
    const max = rows.length ? rows[0].n : 1;
    if (!rows.length) {
      list.innerHTML = '<p class="prov-empty">Tidak ada titik api pada filter ini.</p>';
    }
    for (const r of rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prov-row' + (r.isKey ? ' is-key' : '');
      btn.setAttribute('aria-label', `Lihat ${r.name} di peta: ${r.n} titik`);
      const label = r.name + (r.isNew ? ' *' : '');
      btn.innerHTML = `<span class="prov-name" title="${PA.esc(label)}">${PA.esc(label)}</span>
        <span class="prov-n">${PA.n0(r.n)}</span>
        <span class="prov-bar"><i style="transform:scaleX(${Math.max(0.03, (r.n / max))})"></i></span>`;
      btn.addEventListener('click', () => {
        const bb = PA.geo && PA.geo.bboxOf(r.name);
        if (bb) PA.map.focusBBox(bb); else PA.map.resetView();
      });
      list.appendChild(btn);
    }
    if (rows.some((r) => r.isNew)) {
      const note = document.createElement('p');
      note.className = 'prov-empty';
      note.style.marginTop = '6px';
      note.textContent = '* Provinsi hasil pemekaran 2022 — batas administratif belum tersedia publik, dihitung dari perkiraan wilayah.';
      list.appendChild(note);
    }

    /* ---- tren harian ---- */
    const trend = q('trend');
    trend.innerHTML = '';
    if (!agg.days.length) {
      trend.innerHTML = '<span class="trend-empty">Belum ada data tren.</span>';
      trend.removeAttribute('aria-label');
    } else {
      const dmax = Math.max(...agg.days.map((d) => d[1]));
      for (const [d, n] of agg.days) {
        const val = document.createElement('span');
        val.className = 'trend-val'; val.textContent = PA.n0(n);
        const bar = document.createElement('span');
        bar.className = 'trend-bar';
        bar.style.transform = `scaleY(${Math.max(0.05, n / dmax)})`;
        bar.title = `${d}: ${n} titik`;
        const lab = document.createElement('span');
        lab.className = 'trend-lab';
        lab.textContent = PA.fmtDayMonthWIB(PA.utcToMs(d, 1200));
        trend.append(val, bar, lab);
      }
      const peak = agg.days.reduce((a, b) => (b[1] > a[1] ? b : a));
      trend.setAttribute('aria-label',
        `Tren harian titik api: ${agg.days.length} hari, tertinggi ${peak[0]} sebanyak ${peak[1]} titik.`);
    }
    return agg;
  };
})(window);
