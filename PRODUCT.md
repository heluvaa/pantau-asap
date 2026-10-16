# PRODUCT.md — PantauAsap

## Product truth
- **What:** "PantauAsap" — dashboard pemantauan titik api kebakaran hutan & lahan Indonesia, live dari data satelit NASA FIRMS (VIIRS Suomi-NPP, VIIRS NOAA-20, MODIS), plus berita terkini dan statistik per provinsi.
- **Who:** warga Indonesia (mobile-first, Telegram/dark theme), jurnalis, relawan kebencanaan, peneliti. Bukan pengguna profesional pemadam — tidak perlu术语 teknis berat.
- **Why:** kebakaran hutan marak di Kalimantan dan Papua; publik butuh pandangan cepat, jujur soal ketidakpastian data satelit, tanpa harus paham FIRMS.
- **Success looks like:**打开 situs → dalam <3 detik peta Indonesia muncul dengan titik api yang bisa diklik cluster-nya, angka Ringkasan masuk akal, filter langsung bereaksi, dan saat API mati halaman tetap berguna (pesan jelas + data cache/demo).

## Surface
- Satu halaman dashboard (mode **Operate** — visitor membaca & menyaring, bukan membeli).
- Area: peta (dominan, kiri/atas) · kolom samping: Ringkasan (KPI), Per Provinsi, Tren Harian, Berita Terkini · footer: atribusi NASA FIRMS + geospasial + disclaimer darurat.
- Filter bar di atas: Rentang 24h/48h/7d · Satelit (3 toggle) · Confidence min (select).

## Constraints & decisions (verified, not assumed)
- Stack: HTML + CSS + JS murni, tanpa framework, tanpa build step. Leaflet 1.9.4 (CDN pinned + SRI), supercluster 8.0.1 (canvas clustering). Tile: OpenStreetMap standar (gratis, tanpa key, attribution wajib).
- FIRMS `/api/country/` TIDAK tersedia → pakai `/api/area/csv/{KEY}/{SOURCE}/{BBOX}/{DAY_RANGE}` (BBOX Indonesia), DAY_RANGE maks 5 → rentang 7 hari = 2 request + dedupe.
- Confidence dinormalisasi ke 0/1/2 (VIIRS `n/l/h`; MODIS 0–100; ambang MODIS: <50/50–80/>80).
- Warna marker = confidence (rendah #EAB308 / sedang #F97316 / tinggi #EF4444) — karena 93% titik VIIRS ber-confidence `n`, jadi ukuran circle = FRP. Teks label ikut membedakan (color-not-only).
- MAP_KEY: konfigurabel di `config.js` (tidak di-commit). Produksi = Vercel serverless proxy `api/firms.js` dengan key di env `FIRMS_MAP_KEY`; local/Pages = direct mode.
- Fallback berjenjang: live → cache IndexedDB (`pa_hotspots_v1`) → dataset demo (snapshot FIRMS tereduksi, dilabeli jelas "DATA DEMO").
- Statistik provinsi: point-in-polygon atas GeoJSON geoBoundaries ADM1 (ODbL, 34 prov; 5 provinsi pemekaran 2022 tanpa batas → masuk bucket "Provinsi baru (batas belum tersedia)" via fallback wilayah), estimasi luas = model per-titik `km² ≈ 0.09 × FRP` dengan disclaimer ESTIMASI.
- Berita: Google News RSS via proxy server-side /api/news (tanpa key, artikel 100% asli; failure → pesan jujur + tombol coba lagi. DILARANG data demo/dummy).
- Bahasa Indonesia; semua timestamp WIB (Asia/Jakarta, `Intl`); auto-refresh 60 menit + tombol "Perbarui" + teks "Data terakhir diperbarui".
- Dark theme default; tidak ada light-mode toggle (YAGNI).

## Tone
Tenang, faktual, tidak sensasional. Angka selalu带上 satuan dan sumber. Ketidakpastian disebutkan eksplisit (estimasi, latensi satelit ±3 jam, data bisa terbit susulan).

## Non-goals
Tidak ada prediction model, tidak ada akun/login, tidak ada notifikasi push, tidak ada gambar satelit/thermal, tidak area burned sebenarnya dari MODIS MCD64. Tidak menyalahkan/memuji pemerintah.

## Data ethics
Hanya data terbuka NASA FIRMS / geoBoundaries / agregator berita publik. Tidak menampilkan data pribadi. Disclaimer: bukan sumber resmi penanggulangan bencana, darurat hubungi BPBD/112.

## Notes for future work
- Provider resmi Indonesia (LAPAN/BRIN, Karhutla BPBD, SIPONGI) bisa ditambahkan sebagai overlay sekunder; belum dipakai karena butuh key/scraping tidak stabil.
- Jika quota FIRMS jadi kendala publik, tambah rate-limit per IP di proxy (Vercel KV/upstash) — belum dibuat (YAGNI, quota 5000/10 mnt masih longgar).
