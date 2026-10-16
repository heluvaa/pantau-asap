// PantauAsap — runtime config (dilayani static di Vercel).
// Untuk keamanan produksi, kosongkan FIRMS_MAP_KEY di sini: serverless
// function /api/firms (yang env FIRMS_MAP_KEY di Vercel Dashboard) akan
// digunakan. Isi key di sini hanya untuk pengembangan lokal / GitHub Pages
// (mode 'direct' akan dipakai).
window.PANTAU_CONFIG = {
  FIRMS_MAP_KEY: '',
  FIRMS_MODE: 'auto',
  FIRMS_PROXY_ENDPOINT: '',
  REFRESH_MINUTES: 60,
  SOURCES: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'],
  BBOX: [105.0, -11.0, 141.0, 6.0],
  DEMO_MODE: true
};
