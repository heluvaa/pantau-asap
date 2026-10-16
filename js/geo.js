/* PantauAsap — geo: point-in-polygon provinsi + estimasi luas terdampak */
(function (global) {
  const PA = global.PA = global.PA || {};

  const KEY_REGIONS = ['Kalimantan', 'Papua'];

  /* nama geoBoundaries (EN) -> nama provinsi Indonesia */
  const NAME_ID = {
    'Aceh': 'Aceh', 'Bali': 'Bali', 'Banten': 'Banten',
    'Bangka-Belitung Islands': 'Bangka Belitung',
    'Central Java': 'Jawa Tengah', 'Central Kalimantan': 'Kalimantan Tengah',
    'Central Sulawesi': 'Sulawesi Tengah', 'East Java': 'Jawa Timur',
    'East Kalimantan': 'Kalimantan Timur', 'East Nusa Tenggara': 'Nusa Tenggara Timur',
    'Gorontalo': 'Gorontalo', 'Jakarta Special Capital Region': 'DKI Jakarta',
    'Jambi': 'Jambi', 'West Java': 'Jawa Barat', 'North Maluku': 'Maluku Utara',
    'North Kalimantan': 'Kalimantan Utara', 'North Sulawesi': 'Sulawesi Utara',
    'North Sumatra': 'Sumatera Utara', 'Papua': 'Papua', 'Riau': 'Riau',
    'Riau Islands': 'Kepulauan Riau', 'South Kalimantan': 'Kalimantan Selatan',
    'South Sulawesi': 'Sulawesi Selatan', 'South Sumatra': 'Sumatera Selatan',
    'Southeast Sulawesi': 'Sulawesi Tenggara', 'Special Region of Yogyakarta': 'DI Yogyakarta',
    'West Nusa Tenggara': 'Nusa Tenggara Barat', 'West Papua': 'Papua Barat',
    'West Sulawesi': 'Sulawesi Barat', 'West Sumatra': 'Sumatera Barat', 'Maluku': 'Maluku',
    'West Kalimantan': 'Kalimantan Barat', 'Lampung': 'Lampung'
  };

  /* Provinsi pemekaran 2022 — geoBoundaries belum punya batas; bucket perkiraan
     kasar dari koordinat (dicek berurutan sebelum polygon induk). Perkiraan,
     dilabeli jujur di UI. */
  const NEW_PROV_WINNER = {
    'Papua Barat Daya': [128.9, -1.5, 132.4, 1.0],
    'Papua Pegunungan': [137.2, -5.8, 140.2, -2.0],
    'Papua Tengah': [134.6, -5.2, 137.2, -1.5],
    'Papua Selatan': [137.2, -9.5, 141.1, -5.8]
  };

  function ringBBox(r) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of r) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return [x0, y0, x1, y1];
  }

  function pipRing(r, x, y) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function inMultipolygon(polys, x, y) {
    for (const poly of polys) {           // poly = [outer, ...holes]
      if (!pipRing(poly[0], x, y)) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++) if (pipRing(poly[h], x, y)) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  }

  /** Bangun indeks provinsi dari FeatureCollection (sudah punya bbox) */
  function build(fc) {
    const provs = [];
    for (const f of fc.features) {
      const en = f.properties.name;
      const id = NAME_ID[en] || en;
      provs.push({
        id, en, isNew: false, parent: null,
        bbox: f.bbox || ringBBox(f.geometry.coordinates[0][0]),
        polys: f.geometry.coordinates,
        isKey: KEY_REGIONS.some((k) => id.includes(k) || en.includes(k))
      });
    }
    const byName = new Map(provs.map((p) => [p.id, p]));
    const winners = [];
    for (const [name, box] of Object.entries(NEW_PROV_WINNER)) {
      if (!box || byName.has(name)) continue;
      winners.push({ id: name, isNew: true, bbox: box, parent: parentOf(box, provs),
        isKey: KEY_REGIONS.some((k) => name.includes(k)) });
    }
    PA.geo = {
      count: provs.length,
      winners,
      find(lat, lon) {
        // cek bucket provinsi baru lebih dulu (lebih spesifik dari induk)
        for (const w of winners) {
          const b = w.bbox;
          if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) return w;
        }
        for (const p of provs) {
          const b = p.bbox;
          if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
          if (inMultipolygon(p.polys, lon, lat)) return p;
        }
        return null;
      },
      bboxOf(name) {
        const p = provs.find((x) => x.id === name) || winners.find((x) => x.id === name);
        return p ? p.bbox : null;
      },
      keyRegions: KEY_REGIONS
    };
    return PA.geo;
  }

  function parentOf(box, provs) {
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    for (const p of provs) {
      const b = p.bbox;
      if (cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]) return p.id;
    }
    return '—';
  }

  /**
   * Estimasi luas terdampak.
   * FIRMS TIDAK menyediakan luas — ini model kasar:
   *   footprint 1 titik ~ luasan pixel VIIRS ±0.75 km × 0.75 km, ditambah
   *   komponen sebaran panas ~ FRP (MW) yang berkorelasi ukuran fire front.
   *   area_km2 ≈ 0.56 + 0.09 × FRP  (korelasi empiris kasar; BUKAN angka resmi)
   */
  function estAreaKm2(p) {
    const base = 0.56;
    const frp = isFinite(p.frp) ? Math.max(0, p.frp) : 0;
    return base + 0.09 * frp;
  }

  PA.geoLoad = async function () {
    const res = await fetch('data/provinsi-id.json');
    if (!res.ok) throw new Error('gagal memuat data batas provinsi (HTTP ' + res.status + ')');
    return build(await res.json());
  };
  PA.estAreaKm2 = estAreaKm2;
})(window);
