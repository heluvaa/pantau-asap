# PantauAsap 🔥

Dashboard pemantauan **titik api kebakaran hutan & lahan Indonesia** — live dari data satelit NASA FIRMS (VIIRS Suomi-NPP, VIIRS NOAA-20, MODIS), dengan statistik per provinsi, tren harian, dan berita terkini. Bahasa Indonesia, dark theme, mobile-first.

**Stack:** HTML + CSS + JS murni · Leaflet 1.9.4 · Supercluster · tanpa framework, tanpa build step.

## Fitur

- **Peta** Indonesia (tile CARTO dark, atribusi OpenStreetMap) dengan cluster marker. Warna = confidence (kuning rendah / oranye sedang / merah tinggi), ukuran = FRP (kekuatan panas, MW). Klik cluster untuk zoom, klik titik untuk detail: koordinat, waktu deteksi WIB, FRP, suhu kanal, satelit, provinsi.
- **Filter:** rentang waktu (24 jam / 48 jam / 7 hari), sumber satelit (3 toggle), confidence minimum.
- **Statistik:** total titik, confidence tinggi, provinsi terdampak (point-in-polygon, Kalimantan & Papua disorot), tren harian, dan **estimasi luas terdampak** dengan disclaimer eksplisit (FIRMS hanya memberi titik, bukan luas).
- **Berita terkini:** GNews.io (bila key diisi) → GDELT DOC 2.0 (tanpa key) → Google News RSS via proxy → link pencarian.
- **Fallback berlapis:** live → cache IndexedDB → dataset demo (snapshot FIRMS tereduksi, dilabel jelas).
- **Auto-refresh 60 menit** + tombol Perbarui + timestamp "data terakhir diperbarui" (WIB). Semua timestamp dalam WIB (Asia/Jakarta).

## Konfigurasi

Semua konfigurasi di `config.js` — salin dari `config.example.js`:

```js
cp config.example.js config.js
```

| Opsi | Default | Arti |
|---|---|---|
| `FIRMS_MAP_KEY` | `''` | MAP_KEY NASA FIRMS (wajib untuk mode direct/Pages) |
| `FIRMS_MODE` | `'auto'` | `auto` (proxy dulu, fallback direct) / `proxy` / `direct` |
| `FIRMS_PROXY_ENDPOINT` | `''` | Endpoint proxy (default `/api/firms`) |
| `REFRESH_MINUTES` | `60` | Interval auto-refresh |
| `GNEWS_API_KEY` | `''` | Opsional: GNews.io untuk berita |
| `SOURCES` | `[...]` | Sumber satelit yang diambil |
| `BBOX` | `[105,-11,141,6]` | Area operasi (west,south,east,north) |
| `DEMO_MODE` | `true` | Tampilkan snapshot demo bila live gagal |

> `config.js` berada di `.gitignore` — **jangan commit key**.

### Cara dapat MAP_KEY (gratis)

1. Buka https://firms.modaps.eosdis.nasa.gov/api/map_key/
2. Masukkan email → key (32 karakter hex) dikirim ke inbox.
3. Isi ke `FIRMS_MAP_KEY` (config.js) **atau** env var `FIRMS_MAP_KEY` di Vercel.
4. Kuota: 5000 transaksi / 10 menit (transaksi 7 hari dihitung lebih besar).

## Deploy

### Vercel (disarankan — key aman di server)

```bash
vercel                    # link project
vercel env add FIRMS_MAP_KEY   # paste MAP_KEY
vercel --prod
```

`api/firms.js` adalah serverless function yang mem-proxy FIRMS: MAP_KEY tinggal di server, response di-cache edge 60 menit (data satelit sendiri hanya diperbarui ±3 jam), input tervalidasi (source/bbox/day_range/date), dan menyediakan fallback Google News RSS untuk section berita.

### GitHub Pages / static hosting lain

Tidak ada build step — push folder apa adanya. Karena Pages tidak punya server, set `FIRMS_MAP_KEY` di `config.js` (mode direct, key terlihat di client) dan `FIRMS_MODE: 'direct'`. Catatan: FIRMS mengirim header `access-control-allow-origin: *` sehingga fetch langsung dari browser berfungsi; hanya saja key terekspos — gunakan hanya untuk pemakaian pribadi.

### Lokal

```bash
python3 -m http.server 8765
# buka http://localhost:8765
```

(Lewat `file://` fetch akan diblokir browser — pakai http server.)

## Catatan data

- **Sumber titik api:** NASA FIRMS NRT (`/api/area/csv`), bounding box Indonesia. `/api/country/` resmi dinonaktifkan NASA, jadi brief memakai area API.
- **Rentang 7 hari** = 2 request per satelit (limit FIRMS `day_range` = 5) yang digabung + dedupe.
- **Confidence** dinormalisasi: VIIRS (`l/n/h`) & MODIS (0–100, ambang 50/80) → 0/1/2.
- **Batas provinsi:** geoBoundaries gbOpen ADM1 (ODbL 1.0), disederhanakan ke ±1 km, 34 provinsi. Provinsi hasil pemekaran 2022 (Papua Selatan/Tengah/Pegunungan, Papua Barat Daya) belum punya batas publik — dihitung dari perkiraan kotak wilayah dan ditandai `*`.
- **Estimasi luas:** model kasar per titik `km² ≈ 0.56 + 0.09 × FRP` — bukan angka resmi; untuk angka resmi lihat KLHK/BPBD.
- **Latensi satelit:** deteksi NRT ± 3 jam setelah satelit lewat; titik bisa bertambah saat data terbit susulan.

## Struktur

```
├── index.html          # halaman tunggal
├── css/style.css       # tema dark + leaflet override
├── js/
│   ├── utils.js        # WIB time, banner, cache IndexedDB
│   ├── firms.js        # parser CSV FIRMS, mode proxy/direct/demo
│   ├── geo.js          # point-in-polygon provinsi + estimasi luas
│   ├── map.js          # Leaflet + Supercluster
│   ├── stats.js        # KPI, provinsi, tren harian
│   ├── news.js         # GNews/GDELT/RSS + fallback link
│   └── app.js          # orkestrasi, filter, auto-refresh
├── api/firms.js        # Vercel serverless proxy (key di env)
├── data/provinsi-id.json   # batas provinsi (geoBoundaries, simplified)
├── demo/               # snapshot FIRMS tereduksi (fallback) + availability
├── config.example.js
└── vercel.json
```

## Atribusi & lisensi

- Data titik api: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (NRT VIIRS/MODIS).
- Batas provinsi: [geoBoundaries](https://www.geoboundaries.org) (ODbL 1.0) — sumber OpenStreetMap/Wambacher.
- Peta dasar: © [CARTO](https://carto.com/attributions), data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Berita: GDELT Project / GNews.io / Google News (tautan ke penerbit masing-masing).

Bukan alat resmi penanggulangan bencana. Kondisi darurat: hubungi BPBD / 112.
