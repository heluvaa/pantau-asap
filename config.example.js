// PantauAsap — sample konfigurasi. Salin ke `config.js` lalu isi.
// config.js TIDAK boleh di-commit (ada di .gitignore).
window.PANTAU_CONFIG = {
  // MAP_KEY NASA FIRMS (https://firms.modaps.eosdis.nasa.gov/api/map_key/).
  // Hanya dipakai oleh build lokal / GitHub Pages (mode direct).
  // Di Vercel: key disimpan sebagai env var FIRMS_MAP_KEY di Function
  // (api/firms.js) dan TIDAK diekspos ke browser.
  FIRMS_MAP_KEY: '',

  // 'auto'  : coba /api/firms (proxy) dulu, fallback ke direct mode
  // 'proxy' : hanya lewat /api/firms
  // 'direct': selalu panggil FIRMS dari browser (butuh FIRMS_MAP_KEY)
  FIRMS_MODE: 'auto',

  // Endpoint proxy. Kosong = '/api/firms' (Vercel serverless function).
  FIRMS_PROXY_ENDPOINT: '',

  // Interval auto-refresh data titik api (menit).
  REFRESH_MINUTES: 60,

  // API berita. D supporting dua bentuk:
  //  1. GDELT DOC 2.0 — tanpa key (kosongkan GNEWS_API_KEY).
  //  2. GNews.io — daftar gratis di https://gnews.io, isi key di sini.
  GNEWS_API_KEY: '',
  GNEWS_ENDPOINT: 'https://gnews.io/api/v4/search',
  GDELT_ENDPOINT: 'https://api.gdeltproject.org/api/v2/doc/doc',
  NEWS_QUERY: 'kebakaran hutan',
  NEWS_LINK_FALLBACK: 'https://news.google.com/rss/search?q=%22kebakaran+hutan%22+indonesia&hl=id&gl=ID&ceid=ID:id',

  // Sumber satelit yang diambil (FIRMS source id).
  SOURCES: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'],

  // Bounding box area operasi: west,south,east,north (Nusa Tenggara s.d. Papua).
  BBOX: [105.0, -11.0, 141.0, 6.0],

  // Tampilkan data demo (snapshot FIRMS tereduksi, tanpa API key) bila
  // konfigurasi key kosong/gagal. Berguna untuk uji coba lokal & Pages.
  DEMO_MODE: true
};
