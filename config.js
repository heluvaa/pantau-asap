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
  GNEWS_API_KEY: '',
  GNEWS_ENDPOINT: 'https://gnews.io/api/v4/search',
  GDELT_ENDPOINT: 'https://api.gdeltproject.org/api/v2/doc/doc',
  NEWS_QUERY: 'kebakaran hutan',
  NEWS_LINK_FALLBACK: 'https://news.google.com/rss/search?q=%22kebakaran+hutan%22+indonesia&hl=id&gl=ID&ceid=ID:id',
  SOURCES: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'],
  BBOX: [105.0, -11.0, 141.0, 6.0],
  DEMO_MODE: true
};
