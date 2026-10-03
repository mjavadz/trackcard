/**
 * TrackCard Edge Worker
 * Serverless Music Player Card for Twitter & Web
 * Runs 100% on Cloudflare Edge (0 VPS resources)
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Health check
    if (path === '/health') {
      return jsonResponse({ status: 'ok', service: 'trackcard-edge', version: '2.0.0' }, corsHeaders);
    }

    // 2. Real-time Search API
    if (path === '/api/search') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return jsonResponse({ results: [] }, corsHeaders);
      const results = await searchYouTubeInnertube(q);
      return jsonResponse({ results }, corsHeaders);
    }

    // 3. Resolve URL (Spotify or YouTube)
    if (path === '/api/resolve') {
      const inputUrl = url.searchParams.get('url') || '';
      if (!inputUrl.trim()) {
        return jsonResponse({ error: 'URL is required' }, corsHeaders, 400);
      }
      const track = await resolveMusicUrl(inputUrl);
      return jsonResponse(track, corsHeaders);
    }

    // 4. Play Counter API
    if (path === '/api/play') {
      const id = url.searchParams.get('id') || '';
      if (!id) return jsonResponse({ error: 'Missing ID' }, corsHeaders, 400);
      const plays = await incrementPlayCount(id);
      return jsonResponse({ success: true, id, plays }, corsHeaders);
    }

    // 5. Get Track Stats
    if (path.startsWith('/api/stats/')) {
      const id = path.replace('/api/stats/', '');
      const plays = await getPlayCount(id);
      return jsonResponse({ id, plays }, corsHeaders);
    }

    // 6. Embed Player for Twitter Card (/embed/:id)
    if (path.startsWith('/embed/')) {
      const id = path.replace('/embed/', '').split('?')[0];
      return renderEmbedPlayer(id, url.origin);
    }

    // 7. Shareable Page with Twitter Player Card Meta (/t/:id)
    if (path.startsWith('/t/')) {
      const id = path.replace('/t/', '').split('?')[0];
      return renderTwitterCardPage(id, url.origin);
    }

    // 8. Main Web UI (Homepage)
    if (path === '/' || path === '') {
      return renderHomePage(url.origin);
    }

    return new Response('Not Found', { status: 404 });
  } catch (err) {
    return new Response('Internal Error: ' + err.message, { status: 500 });
  }
}

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

// ----------------------------------------------------
// Core Services: Search & Resolution
// ----------------------------------------------------

async function searchYouTubeInnertube(query) {
  const endpoint = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
  const payload = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'fa',
        gl: 'US'
      }
    },
    query: query
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return [];
    const data = await res.json();
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const results = [];

    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item?.videoRenderer;
        if (v && v.videoId) {
          const title = v.title?.runs?.map(r => r.text).join('') || 'Unknown Title';
          const artist = v.ownerText?.runs?.map(r => r.text).join('') || v.shortBylineText?.runs?.map(r => r.text).join('') || 'Artist';
          const duration = v.lengthText?.simpleText || 'Full';
          const thumbs = v.thumbnail?.thumbnails || [];
          const thumbnail = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

          results.push({
            id: v.videoId,
            title: title.replace(/\s*\(Official Video\)/gi, '').replace(/\s*\(Audio\)/gi, '').trim(),
            artist,
            duration,
            thumbnail,
            source: 'youtube'
          });

          if (results.length >= 8) break;
        }
      }
      if (results.length >= 8) break;
    }

    return results;
  } catch (e) {
    return [];
  }
}

async function resolveMusicUrl(inputUrl) {
  // 1. YouTube Link
  const ytMatch = inputUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    let title = 'YouTube Track';
    let artist = '';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        title = oembed.title || title;
        artist = oembed.author_name || artist;
        thumbnail = oembed.thumbnail_url || thumbnail;
      }
    } catch (_) {}

    return {
      id: videoId,
      title,
      artist,
      thumbnail,
      source: 'youtube',
      originalUrl: inputUrl
    };
  }

  // 2. Spotify Link
  const spMatch = inputUrl.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (spMatch) {
    const spotifyId = spMatch[1];
    let title = 'Spotify Track';
    let artist = '';
    let thumbnail = '';

    try {
      const spRes = await fetch(`https://open.spotify.com/track/${spotifyId}`, {
        headers: { 'User-Agent': 'Twitterbot/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
      });
      if (spRes.ok) {
        const html = await spRes.text();
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
        const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

        if (titleMatch) title = titleMatch[1].replace(/\s*-\s*song\s+and\s+lyrics\s+by.*$/i, '').trim();
        if (descMatch) {
          const parts = descMatch[1].split('·');
          artist = parts[0]?.trim() || '';
        }
        if (imgMatch) thumbnail = imgMatch[1];
      }
    } catch (_) {}

    // Find the full-length YouTube video equivalent
    const searchQuery = `${title} ${artist}`.trim();
    const ytResults = await searchYouTubeInnertube(searchQuery);
    const bestMatch = ytResults[0];

    const finalId = bestMatch ? bestMatch.id : '1l4uBwr1kbE';
    return {
      id: finalId,
      title: title || bestMatch?.title || 'Track',
      artist: artist || bestMatch?.artist || '',
      thumbnail: thumbnail || bestMatch?.thumbnail || `https://i.ytimg.com/vi/${finalId}/hqdefault.jpg`,
      source: 'spotify',
      originalUrl: inputUrl,
      resolvedFrom: 'spotify'
    };
  }

  throw new Error('فرمت لینک نامعتبر است. لطفاً لینک یوتیوب یا اسپاتیفای وارد کنید.');
}

// ----------------------------------------------------
// Play Counter (Edge KV / Memory)
// ----------------------------------------------------

const MEMORY_COUNTS = new Map();

async function incrementPlayCount(id) {
  try {
    if (typeof TRACKCARD_KV !== 'undefined') {
      const key = `play_${id}`;
      const cur = parseInt(await TRACKCARD_KV.get(key) || '0', 10);
      const next = cur + 1;
      await TRACKCARD_KV.put(key, next.toString());
      return next;
    }
  } catch (_) {}

  const count = (MEMORY_COUNTS.get(id) || 0) + 1;
  MEMORY_COUNTS.set(id, count);
  return count;
}

async function getPlayCount(id) {
  try {
    if (typeof TRACKCARD_KV !== 'undefined') {
      const val = await TRACKCARD_KV.get(`play_${id}`);
      return val ? parseInt(val, 10) : 0;
    }
  } catch (_) {}
  return MEMORY_COUNTS.get(id) || 0;
}

// ----------------------------------------------------
// HTML Templates & Twitter Player Cards
// ----------------------------------------------------

async function renderTwitterCardPage(id, origin) {
  let title = 'موزیک در TrackCard';
  let artist = 'هنرمند';
  let thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (oembedRes.ok) {
      const d = await oembedRes.json();
      title = d.title || title;
      artist = d.author_name || artist;
      thumbnail = d.thumbnail_url || thumbnail;
    }
  } catch (_) {}

  const plays = await getPlayCount(id);
  const shareUrl = `${origin}/t/${id}`;
  const embedUrl = `${origin}/embed/${id}`;

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(artist)} | TrackCard</title>

  <!-- Twitter Player Card Meta Tags -->
  <meta name="twitter:card" content="player">
  <meta name="twitter:site" content="@TrackCard">
  <meta name="twitter:title" content="${escapeHtml(title)} — ${escapeHtml(artist)}">
  <meta name="twitter:description" content="▶️ پخش کامل و مستقیم این قطعه در توییتر • ${plays} بار شنیده شد">
  <meta name="twitter:image" content="${thumbnail}">
  <meta name="twitter:player" content="${embedUrl}">
  <meta name="twitter:player:width" content="600">
  <meta name="twitter:player:height" content="360">

  <!-- OpenGraph -->
  <meta property="og:type" content="music.song">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(artist)} • پخش آنلاین در TrackCard">
  <meta property="og:image" content="${thumbnail}">
  <meta property="og:url" content="${shareUrl}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Vazirmatn', system-ui, sans-serif; background: #07090e; color: #f1f5f9; }
    .glass-card { background: rgba(18, 22, 34, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .accent-glow { box-shadow: 0 0 35px rgba(29, 185, 84, 0.25); }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4">
  <div class="w-full max-w-xl glass-card rounded-3xl p-6 sm:p-8 accent-glow flex flex-col items-center text-center">
    
    <!-- Branding Header -->
    <div class="flex items-center gap-2 mb-6">
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
      <span class="text-xs uppercase tracking-widest text-emerald-400 font-bold">TrackCard • Twitter Player</span>
    </div>

    <!-- Album Cover & Frame -->
    <div class="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 shadow-2xl border border-white/10 group">
      <img src="${thumbnail}" alt="Cover" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
        <a href="${embedUrl}" target="_self" class="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform">
          <svg class="w-7 h-7 fill-current translate-x-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </a>
      </div>
    </div>

    <!-- Metadata -->
    <h1 class="text-xl sm:text-2xl font-bold mb-2 text-white line-clamp-2">${escapeHtml(title)}</h1>
    <p class="text-slate-400 text-sm sm:text-base mb-4">${escapeHtml(artist)}</p>

    <!-- Stats & Badges -->
    <div class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6 text-xs text-slate-300">
      <span>🔥</span>
      <span>${plays} بار شنیده شده</span>
      <span class="text-slate-600">•</span>
      <span class="text-emerald-400">پخش کامل (Full Audio)</span>
    </div>

    <!-- Action Buttons -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title + ' 🎧\\n' + shareUrl)}" target="_blank"
         class="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 px-4 rounded-xl hover:bg-slate-200 transition-all text-sm">
        <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        اشتراک مستقیم در X
      </a>
      <button onclick="navigator.clipboard.writeText('${shareUrl}'); this.innerText='کپی شد! ✓'; setTimeout(()=>this.innerText='کپی لینک کارت', 2000)"
              class="flex items-center justify-center gap-2 bg-slate-800 text-white font-medium py-3 px-4 rounded-xl hover:bg-slate-700 transition-all text-sm border border-white/10">
        کپی لینک کارت
      </button>
    </div>

    <!-- Embed Player Container -->
    <div class="w-full mt-6 pt-6 border-t border-white/10">
      <iframe src="${embedUrl}" class="w-full aspect-video rounded-xl border border-white/10" allow="autoplay; encrypted-media"></iframe>
    </div>

  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function renderEmbedPlayer(id, origin) {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrackCard Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: system-ui, sans-serif; }
    .player-wrap { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #000; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div class="player-wrap">
    <iframe id="ytPlayer"
      src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&modestbranding=1"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen>
    </iframe>
  </div>

  <script>
    // Trigger play counter beacon
    fetch('${origin}/api/play?id=${id}', { method: 'POST' }).catch(()=>{});
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function renderHomePage(origin) {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrackCard — کارت پخش موزیک برای توییتر / X</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'Vazirmatn', system-ui, sans-serif; background: #05070a; color: #f8fafc; }
    .glass { background: rgba(15, 20, 31, 0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .glass-input { background: rgba(24, 31, 47, 0.7); border: 1px solid rgba(255, 255, 255, 0.12); }
    .glow { box-shadow: 0 0 50px -10px rgba(16, 185, 129, 0.2); }
  </style>
</head>
<body class="min-h-screen flex flex-col justify-between">

  <!-- Main Container -->
  <main class="max-w-2xl mx-auto w-full px-4 pt-12 pb-16 flex-1 flex flex-col items-center">
    
    <!-- Header -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-4">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        پخش ریل‌تایم و کامل داخل تایم‌لاین توییتر
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">TrackCard</h1>
      <p class="text-slate-400 text-sm sm:text-base max-w-md mx-auto">
        لینک اسپاتیفای/یوتیوب را وارد کنید یا نام آهنگ را جستجو کنید تا کارت پخش زنده توییتر ساخته شود.
      </p>
    </div>

    <!-- Card Box -->
    <div class="w-full glass rounded-3xl p-6 sm:p-8 glow mb-8">
      
      <!-- Search Input -->
      <div class="relative mb-4">
        <input type="text" id="searchInput"
               placeholder="جستجوی نام آهنگ، آرتیست یا پیست لینک اسپاتیفای / یوتیوب..."
               class="w-full glass-input text-white rounded-2xl py-4 pr-12 pl-4 text-sm sm:text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-500" />
        <div class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <div id="loadingSpinner" class="hidden absolute left-4 top-1/2 -translate-y-1/2">
          <div class="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>

      <!-- Real-time Results Dropdown -->
      <div id="resultsContainer" class="hidden flex flex-col gap-2 max-h-80 overflow-y-auto pr-1"></div>

      <!-- Selected Track Result Card -->
      <div id="selectedTrackCard" class="hidden mt-6 pt-6 border-t border-white/10 flex flex-col items-center text-center">
        <div class="w-full aspect-video rounded-xl overflow-hidden mb-4 border border-white/10 shadow-lg">
          <img id="cardThumb" src="" class="w-full h-full object-cover" />
        </div>
        <h3 id="cardTitle" class="text-lg font-bold text-white mb-1 line-clamp-1"></h3>
        <p id="cardArtist" class="text-sm text-slate-400 mb-4"></p>

        <!-- Ready Links -->
        <div class="w-full flex flex-col gap-2.5">
          <div class="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-slate-300">
            <span class="truncate flex-1 text-left ltr font-mono" id="shareUrlText"></span>
            <button id="copyBtn" class="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0">
              کپی لینک
            </button>
          </div>
          <a id="tweetBtn" target="_blank"
             class="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors text-sm">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            توییت مستقیم این کارت در X
          </a>
        </div>
      </div>

    </div>

    <!-- Quick Features -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-center">
      <div class="glass rounded-2xl p-4">
        <div class="text-xl mb-1">⚡️</div>
        <div class="text-sm font-semibold text-white mb-0.5">پخش ۱۰۰٪ کامل</div>
        <div class="text-xs text-slate-400">بدون محدودیت ۳۰ ثانیه‌ای</div>
      </div>
      <div class="glass rounded-2xl p-4">
        <div class="text-xl mb-1">🎯</div>
        <div class="text-sm font-semibold text-white mb-0.5">داخل خود تایم‌لاین</div>
        <div class="text-xs text-slate-400">بدون خروج به اسپاتیفای</div>
      </div>
      <div class="glass rounded-2xl p-4">
        <div class="text-xl mb-1">🔥</div>
        <div class="text-sm font-semibold text-white mb-0.5">شمارنده ریل‌تایم</div>
        <div class="text-xs text-slate-400">ثبت دقیق آمار شنوندگان</div>
      </div>
    </div>

  </main>

  <footer class="text-center py-6 text-xs text-slate-500 border-t border-white/5">
    TrackCard • Serverless Twitter Music Player
  </footer>

  <script>
    const searchInput = document.getElementById('searchInput');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultsContainer = document.getElementById('resultsContainer');
    const selectedTrackCard = document.getElementById('selectedTrackCard');
    const cardThumb = document.getElementById('cardThumb');
    const cardTitle = document.getElementById('cardTitle');
    const cardArtist = document.getElementById('cardArtist');
    const shareUrlText = document.getElementById('shareUrlText');
    const copyBtn = document.getElementById('copyBtn');
    const tweetBtn = document.getElementById('tweetBtn');

    let debounceTimer = null;

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(debounceTimer);
      if (!val) {
        resultsContainer.classList.add('hidden');
        return;
      }

      // Check if user pasted a direct URL
      if (val.startsWith('http://') || val.startsWith('https://')) {
        resolveUrl(val);
        return;
      }

      // Real-time search with debounce
      loadingSpinner.classList.remove('hidden');
      debounceTimer = setTimeout(() => {
        performSearch(val);
      }, 350);
    });

    async function performSearch(query) {
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(query));
        const data = await res.json();
        loadingSpinner.classList.add('hidden');
        renderResults(data.results || []);
      } catch (err) {
        loadingSpinner.classList.add('hidden');
      }
    }

    async function resolveUrl(url) {
      loadingSpinner.classList.remove('hidden');
      try {
        const res = await fetch('/api/resolve?url=' + encodeURIComponent(url));
        const track = await res.json();
        loadingSpinner.classList.add('hidden');
        if (track.error) {
          alert(track.error);
          return;
        }
        selectTrack(track);
      } catch (err) {
        loadingSpinner.classList.add('hidden');
        alert('خطا در تحلیل لینک');
      }
    }

    function renderResults(items) {
      resultsContainer.innerHTML = '';
      if (!items.length) {
        resultsContainer.classList.add('hidden');
        return;
      }

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/60 border border-white/5 cursor-pointer transition-all';
        row.innerHTML = '<img src="' + item.thumbnail + '" class="w-12 h-12 rounded-lg object-cover shrink-0" />' +
          '<div class="flex-1 min-w-0 text-right">' +
          '<div class="text-sm font-semibold text-white truncate">' + escapeHtml(item.title) + '</div>' +
          '<div class="text-xs text-slate-400 truncate">' + escapeHtml(item.artist) + ' • ' + item.duration + '</div>' +
          '</div>' +
          '<button class="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0">انتخاب</button>';
        row.onclick = () => selectTrack(item);
        resultsContainer.appendChild(row);
      });

      resultsContainer.classList.remove('hidden');
    }

    function selectTrack(track) {
      resultsContainer.classList.add('hidden');
      selectedTrackCard.classList.remove('hidden');
      cardThumb.src = track.thumbnail;
      cardTitle.innerText = track.title;
      cardArtist.innerText = track.artist || '';

      const shareUrl = window.location.origin + '/t/' + track.id;
      shareUrlText.innerText = shareUrl;

      copyBtn.onclick = () => {
        navigator.clipboard.writeText(shareUrl);
        copyBtn.innerText = 'کپی شد! ✓';
        setTimeout(() => copyBtn.innerText = 'کپی لینک', 2000);
      };

      tweetBtn.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(track.title + ' 🎧\\n' + shareUrl);
    }

    function escapeHtml(text) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return (text || '').replace(/[&<>"']/g, m => map[m]);
    }
  </script>

</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return (text || '').replace(/[&<>"']/g, m => map[m]);
}
