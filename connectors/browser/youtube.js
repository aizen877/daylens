// DayLens YouTube metadata + watch-session content script connector.
(() => {
  let lastPosition = 0;
  let lastSent = 0;
  let videoId = '';
  let actualWatchSeconds = 0;
  let lastRealTick = 0;

  const api = globalThis.browser || globalThis.chrome;

  function getVideoId() {
    if (location.pathname.startsWith('/shorts/')) {
      const parts = location.pathname.split('/');
      return parts[2] || '';
    }
    const match = location.search.match(/[?&]v=([^&]+)/);
    return match ? match[1] : '';
  }

  function getTitle() {
    const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title, h1.ytd-video-primary-info-renderer');
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
    let t = document.title || '';
    t = t.replace(/^\(\d+\)\s*/, '');
    t = t.replace(/\s*-\s*YouTube\s*$/i, '');
    return t.trim() || 'YouTube Video';
  }

  function getChannel() {
    const el = document.querySelector('ytd-video-owner-renderer #channel-name a, #owner #channel-name a, ytd-channel-name #text a, ytd-channel-name a');
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
    return 'YouTube Channel';
  }

  function updateWatchTimeAccumulator() {
    const video = document.querySelector('video');
    const now = Date.now();
    
    // Only accumulate real watch time if video is actively playing (not paused) and tab is visible
    if (video && !video.paused && !video.ended && document.visibilityState === 'visible') {
      if (lastRealTick > 0) {
        const deltaSec = (now - lastRealTick) / 1000;
        // Cap delta to ignore seeking/skipping leaps
        if (deltaSec > 0 && deltaSec < 3.0) {
          actualWatchSeconds += deltaSec;
        }
      }
    }
    lastRealTick = now;
  }

  setInterval(updateWatchTimeAccumulator, 1000);

  function getVideoDurationSeconds() {
    const video = document.querySelector('video');
    if (video && !isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
      return Math.floor(video.duration);
    }
    const durEl = document.querySelector('.ytp-time-duration, span.ytp-time-duration');
    if (durEl && durEl.textContent.trim()) {
      const parts = durEl.textContent.trim().split(':').map(n => parseInt(n, 10));
      if (parts.every(n => !isNaN(n))) {
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
      }
    }
    return 0;
  }

  function getChannelIcon() {
    const el = document.querySelector('ytd-video-owner-renderer #avatar img, ytd-video-owner-renderer img#img, ytd-video-owner-renderer img, #owner #avatar img, #owner img#img, yt-img-shadow#avatar img, .ytd-channel-name img, #channel-header-container img');
    if (el && el.src && el.src.startsWith('http')) {
      return el.src.replace(/=s\d+-/, '=s176-');
    }
    return '';
  }

  function send(eventType, force = false) {
    const video = document.querySelector('video');
    const vId = getVideoId();
    if (!vId) return;

    // Reset accumulator when switching to a new video
    if (videoId !== vId) {
      videoId = vId;
      actualWatchSeconds = 0;
      lastRealTick = Date.now();
    }

    const now = Date.now();
    if (!force && now - lastSent < 4000) return;
    lastSent = now;
    const isShort = location.pathname.startsWith('/shorts/');
    const title = getTitle();
    const channel = getChannel();
    const channelIcon = getChannelIcon();
    const posSec = video ? Math.floor(video.currentTime || 0) : 0;
    const durSec = getVideoDurationSeconds();
    const iso = new Date().toISOString();
    const favIconUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

    function getDescription() {
      const el = document.querySelector('ytd-watch-metadata #description-inline-expander, #description .ytd-video-secondary-info-renderer, ytd-text-inline-expander#description-inline-expander, #description-text');
      if (el && el.textContent.trim()) {
        return el.textContent.trim().slice(0, 1000);
      }
      return '';
    }

    function getTags() {
      const tags = new Set();
      const metaKw = document.querySelector('meta[name="keywords"]');
      if (metaKw && metaKw.content) {
        metaKw.content.split(',').forEach(k => {
          const t = k.trim();
          if (t && t.length < 40) tags.add(t);
        });
      }
      document.querySelectorAll('a[href*="/hashtag/"]').forEach(el => {
        const t = el.textContent.trim();
        if (t && t.length < 40) tags.add(t.startsWith('#') ? t : '#' + t);
      });
      return Array.from(tags).slice(0, 10);
    }

    const payload = {
      source: 'youtube',
      event_type: eventType,
      domain: 'youtube.com',
      title: title,
      video_id: videoId,
      channel: channel,
      channel_icon: channelIcon,
      description: getDescription(),
      tags: getTags(),
      video_type: isShort ? 'short' : 'long',
      position_seconds: posSec,
      duration_seconds: durSec,
      actual_watch_seconds: Math.round(actualWatchSeconds),
      favIconUrl: favIconUrl,
      started_at: iso,
      ended_at: iso
    };

    try {
      api.runtime.sendMessage({ type: 'INGEST_YOUTUBE', payload });
    } catch (_) {}

    if (video) lastPosition = video.currentTime || 0;
  }

  function attach() {
    const video = document.querySelector('video');
    send(video && !video.paused ? 'youtube_play' : 'active_tab', false);

    if (!video || video.dataset.daylensAttached) return;
    video.dataset.daylensAttached = '1';

    // Instant payload trigger on video play, pause, or ended
    video.addEventListener('play', () => {
      lastRealTick = Date.now();
      send('youtube_play', true);
    });
    video.addEventListener('pause', () => send('youtube_pause', true));
    video.addEventListener('ended', () => send('youtube_pause', true));

    // 5-second background heartbeat during active playback
    setInterval(() => {
      if (!video.paused) {
        send('youtube_heartbeat', true);
      }
    }, 5000);
  }

  // Instant payload trigger on tab switch / visibility change or page unload
  document.addEventListener('visibilitychange', () => {
    const video = document.querySelector('video');
    if (document.visibilityState === 'hidden') {
      send('youtube_pause', true);
    } else if (video && !video.paused) {
      lastRealTick = Date.now();
      send('youtube_play', true);
    }
  });
  window.addEventListener('beforeunload', () => send('youtube_pause', true));

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_YOUTUBE_INFO') {
      const video = document.querySelector('video');
      const vId = getVideoId();
      const isShort = location.pathname.startsWith('/shorts/');
      sendResponse({
        source: 'youtube',
        domain: 'youtube.com',
        title: getTitle(),
        channel: getChannel(),
        channel_icon: getChannelIcon(),
        description: getDescription(),
        tags: getTags(),
        duration_seconds: getVideoDurationSeconds(),
        video_id: vId,
        video_type: isShort ? 'short' : 'long',
        position_seconds: video ? Math.floor(video.currentTime || 0) : 0,
        actual_watch_seconds: Math.round(actualWatchSeconds),
        favIconUrl: vId ? `https://img.youtube.com/vi/${vId}/mqdefault.jpg` : ''
      });
    }
    return true;
  });

  window.addEventListener('yt-navigate-finish', () => setTimeout(attach, 500));
  window.addEventListener('yt-page-data-updated', () => setTimeout(attach, 500));
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
  attach();
  setTimeout(attach, 1000);
  setTimeout(attach, 3000);
})();
