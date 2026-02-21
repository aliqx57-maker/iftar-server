const http  = require('http');
const https = require('https');

const PORT      = process.env.PORT || 3000;
const MANAR_URL = 'https://almanar.com.lb/salat';

let cache = { h: null, m: null, ts: 0 };
const CACHE_TTL = 30 * 60 * 1000;

function parseManarTime(html) {
  const patterns = [
    /المغرب[\s\S]{0,20}?(\d{1,2}):(\d{2})/,
    /Maghrib[\s\S]{0,20}?(\d{1,2}):(\d{2})/i,
    /"maghrib"\s*:\s*"(\d{1,2}):(\d{2})"/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const h = parseInt(m[1], 10);
      const mn = parseInt(m[2], 10);
      if (h >= 15 && h <= 20 && mn >= 0 && mn <= 59) return { h, m: mn };
    }
  }
  return null;
}

function fetchManar() {
  return new Promise((resolve, reject) => {
    const req = https.get(MANAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html',
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const result = parseManarTime(data);
        result ? resolve(result) : reject(new Error('parse_failed'));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.url === '/maghrib') {
    const now = Date.now();
    if (cache.h !== null && (now - cache.ts) < CACHE_TTL) {
      return res.end(JSON.stringify({ ok: true, h: cache.h, m: cache.m, source: 'cache' }));
    }
    try {
      const result = await fetchManar();
      cache = { h: result.h, m: result.m, ts: now };
      console.log(`✓ المغرب ${result.h}:${String(result.m).padStart(2,'0')}`);
      res.end(JSON.stringify({ ok: true, h: result.h, m: result.m, source: 'manar' }));
    } catch (e) {
      console.error(`✗ ${e.message}`);
      if (cache.h !== null) {
        return res.end(JSON.stringify({ ok: true, h: cache.h, m: cache.m, source: 'cache_fallback' }));
      }
      res.statusCode = 502;
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`🌙 السيرفر شغّال على البورت ${PORT}`);
  fetchManar().then(r => { cache = { ...r, ts: Date.now() }; }).catch(() => {});
});
