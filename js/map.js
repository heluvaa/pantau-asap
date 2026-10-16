/* PantauAsap — peta: Leaflet + Supercluster (canvas markers, cluster by zoom) */
(function (global) {
  const PA = global.PA = global.PA || {};
  const L = global.L;

  const CONF = [
    { color: '#EAB308', label: 'rendah', css: 'low' },
    { color: '#F97316', label: 'sedang', css: 'med' },
    { color: '#EF4444', label: 'tinggi', css: 'high' }
  ];
  PA.CONF = CONF;

  function radiusFor(p) {
    const frp = isFinite(p.frp) ? p.frp : 0;
    return frp >= 15 ? 9 : frp >= 5 ? 7 : 5;
  }

  function popupHTML(p) {
    const c = CONF[p.conf];
    const when = isFinite(p.ms) ? PA.fmtDateTimeWIB(p.ms) : String(p.date || '—');
    const confPct = p.confPct != null ? '≈' + p.confPct + '%' : String(p.confRaw ?? '—');
    const prov = PA.geo ? PA.geo.find(p.lat, p.lon) : null;
    const provTxt = prov ? `${prov.id}${prov.isNew ? ' (perkiraan batas)' : ''}` : 'Perairan / di luar batas provinsi';
    return `
      <div class="pop-badges">
        <span class="pop-badge b-${c.css}">Confidence ${c.label} · ${confPct}</span>
        <span class="pop-badge">${PA.esc(PA.SRC_LABEL[p.source] || p.source)}</span>
        <span class="pop-badge">${p.dn === 'siang' ? 'Deteksi siang' : p.dn === 'malam' ? 'Deteksi malam' : 'Deteksi ?'}</span>
      </div>
      <dl class="pop-grid">
        <dt>Koordinat</dt><dd>${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</dd>
        <dt>Waktu (WIB)</dt><dd>${when}</dd>
        <dt>FRP</dt><dd>${PA.n1(p.frp)} MW</dd>
        <dt>Suhu</dt><dd>${p.bright != null ? PA.n1(p.bright) + ' K' : '—'}${p.ti5 != null ? ' · ' + PA.n1(p.ti5) + ' K' : ''}</dd>
        <dt>Satelit</dt><dd>${PA.esc((p.sat || '—') + (p.instr ? ' · ' + p.instr : ''))}</dd>
        <dt>Provinsi</dt><dd>${PA.esc(provTxt)}</dd>
      </dl>
      <p class="pop-note">Titik deteksi satelit (bukan koordinat api pasti), ± 3 jam setelah satelit lewat.</p>`;
  }
  PA.mapPopup = popupHTML;

  let map = null, sc = null, layers = { cluster: null, point: null };
  let pts = [];

  function clusterIcon(props) {
    const n = props.point_count;
    const conf = Math.min(2, Math.max(0, props.confidence || 0));
    const size = n >= 800 ? 44 : n >= 250 ? 38 : n >= 60 ? 32 : 26;
    const col = CONF[conf].color;
    const label = n >= 10000 ? Math.round(n / 1000) + 'rb' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'rb' : String(n);
    const html = `<div class="cluster-icon" style="width:${size}px;height:${size}px;background:${col};color:#171310">${label}</div>`;
    return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  PA.map = {
    init(el) {
      map = L.map(el, {
        center: [-2.4, 118], zoom: 5, minZoom: 4, maxZoom: 12,
        maxBounds: [[-16, 88], [14, 152]], maxBoundsViscosity: 0.7,
        zoomControl: true, worldCopyJump: false
      });
      // OSM standard tile — tanpa API key, tanpa watermark. (CARTO basemaps
      // sejak 2026 mengembalikan placeholder "API KEY REQUIRED" tanpa key.)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · data titik api: <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener">NASA FIRMS</a>'
      }).addTo(map);

      layers.cluster = L.layerGroup().addTo(map);
      layers.point = L.layerGroup().addTo(map);

      sc = new Supercluster({
        radius: 70, maxZoom: 10, minPoints: 2,
        map: (p) => ({ confidence: p.confidence, maxFrp: p.maxFrp }),
        reduce: (acc, p) => { acc.confidence = Math.max(acc.confidence, p.confidence); acc.maxFrp = Math.max(acc.maxFrp, p.maxFrp); }
      });

      map.on('moveend zoomend', render);
      render();
    },

    setData(points) {
      pts = points || [];
      if (sc) {
        // Supercluster v8 butuh GeoJSON Point features (bukan objek polos)
        sc.load(pts.map((p, i) => ({
          type: 'Feature',
          properties: { i, confidence: p.conf, maxFrp: isFinite(p.frp) ? p.frp : 0 },
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
        })));
      }
      render();
    },

    focusBBox(bbox) {
      if (!map || !bbox) return;
      map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [28, 28], maxZoom: 8 });
    },
    resetView() { if (map) map.setView([-2.4, 118], 5); },
    invalidate() { if (map) map.invalidateSize(); }
  };

  function render() {
    if (!map || !sc || !pts.length) return;
    const z = map.getZoom();
    const b = map.getBounds().pad(0.12);
    const clusters = sc.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.round(z));
    layers.cluster.clearLayers();
    layers.point.clearLayers();
    for (const c of clusters) {
      const [lon, lat] = c.geometry.coordinates;
      if (c.properties.cluster) {
        layers.cluster.addLayer(L.marker([lat, lon], {
          icon: clusterIcon(c.properties),
          title: c.properties.point_count + ' titik api — klik untuk memperbesar'
        }).on('click', () => {
          // properties.bbox TIDAK tersedia di output Supercluster v8 (terverifikasi
          // via tes node) — hitung ulang dari children.
          try {
            const kids = sc.getChildren(c.properties.cluster_id);
            if (kids && kids.length) {
              const lats = kids.map((k) => k.geometry.coordinates[1]);
              const lons = kids.map((k) => k.geometry.coordinates[0]);
              map.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
                { padding: [40, 40], maxZoom: 10 });
            } else {
              map.setZoom(Math.min(12, map.getZoom() + 2));
            }
          } catch (e) { map.setZoom(Math.min(12, map.getZoom() + 2)); }
        }));
      } else {
        const p = pts[c.properties.i];
        if (!p) continue;
        const m = L.circleMarker([lat, lon], {
          radius: radiusFor(p),
          color: 'rgba(8,13,24,.9)', weight: 1.5,
          fillColor: CONF[p.conf].color, fillOpacity: 0.88
        });
        m.bindPopup(() => popupHTML(p), { maxWidth: 320 });
        layers.point.addLayer(m);
      }
    }
  }
})(window);
