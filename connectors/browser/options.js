const defaults = {
  enabled: true,
  trackIncognito: false,
  endpoint: 'http://127.0.0.1:8777/api/ingest',
  blockedDomains: []
};

const api = globalThis.browser || globalThis.chrome;
let currentPreviewKey = '';

async function detectBrowserName() {
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function' && await navigator.brave.isBrave()) {
      return { name: 'Brave', icon: '🦁' };
    }
  } catch (_) {}
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/')) return { name: 'Edge', icon: '🌀' };
  if (typeof globalThis.browser !== 'undefined' || ua.includes('firefox')) return { name: 'Firefox', icon: '🦊' };
  return { name: 'Chrome', icon: '🌐' };
}

async function checkAgentStatus(endpoint) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  try {
    const origin = new URL(endpoint).origin;
    const res = await fetch(origin + '/api/stats');
    if (res.ok) {
      dot.className = 'status-dot online';
      txt.textContent = 'Agent Online & Connected';
    } else {
      dot.className = 'status-dot offline';
      txt.textContent = `Agent Error (${res.status})`;
    }
  } catch (err) {
    dot.className = 'status-dot offline';
    txt.textContent = 'Agent Disconnected (Start Server)';
  }
}

function showSkeletonLoading() {
  document.getElementById('extractedType').textContent = 'Fetching Active Tab Metadata...';
  document.getElementById('extractedTitle').innerHTML = '<div class="skeleton-box" style="height:14px; width:80%;"></div>';
  document.getElementById('extractedSub').innerHTML = '<div class="skeleton-box" style="height:12px; width:50%; margin-top:4px;"></div>';
  document.getElementById('extractedThumb').src = 'data:image/svg+xml;utf8,<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="60" fill="%231a1816"/></svg>';
}

async function updateActiveTabPreview(forceSkeleton = false) {
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;
    const tab = tabs[0];
    const url = tab.url || '';
    const tabKey = `${tab.id}|${url}`;
    
    // Show skeleton loading ONLY when switching to a completely new tab/video
    const isNewTab = currentPreviewKey !== tabKey;
    if (isNewTab || forceSkeleton) {
      currentPreviewKey = tabKey;
      if (url.includes('youtube.com/watch') || url.includes('youtube.com/shorts')) {
        showSkeletonLoading();
      }
    }
    
    if (url.includes('youtube.com/watch') || url.includes('youtube.com/shorts')) {
      let directVId = '';
      if (url.includes('/shorts/')) {
        try { directVId = new URL(url).pathname.split('/')[2] || ''; } catch (_) {}
      } else {
        const match = url.match(/[?&]v=([^&]+)/);
        directVId = match ? match[1] : '';
      }

      const cleanTitle = (tab.title || '').replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/i, '').trim();

      try {
        const response = await api.tabs.sendMessage(tab.id, { type: 'GET_YOUTUBE_INFO' });
        if (response && response.video_id) {
          const typeLabel = `YouTube (${response.video_type || 'video'})`;
          if (document.getElementById('extractedType').textContent !== typeLabel) {
            document.getElementById('extractedType').textContent = typeLabel;
          }
          if (document.getElementById('extractedTitle').textContent !== response.title) {
            document.getElementById('extractedTitle').textContent = response.title || cleanTitle || 'YouTube Video';
          }
          const thumbUrl = `https://img.youtube.com/vi/${response.video_id}/mqdefault.jpg`;
          if (document.getElementById('extractedThumb').src !== thumbUrl) {
            document.getElementById('extractedThumb').src = thumbUrl;
          }
          const watchedSec = response.actual_watch_seconds || 0;
          const subText = `${response.channel || 'YouTube'} · watched: ${watchedSec}s · pos: ${response.position_seconds || 0}s`;
          if (document.getElementById('extractedSub').textContent !== subText) {
            document.getElementById('extractedSub').textContent = subText;
          }

          // Handle Description Box in Extension Popup
          const descWrap = document.getElementById('popupDescWrap');
          const descBox = document.getElementById('popupDescBox');
          if (response.description && response.description.trim()) {
            if (descWrap) descWrap.style.display = 'block';
            if (descBox) descBox.innerText = response.description.trim();
          } else if (descWrap) {
            descWrap.style.display = 'none';
          }

          // Fetch & Render Transcript inside Extension Popup
          loadPopupTranscript(response.video_id);
          return;
        }
      } catch (_) {}

      // Instant Fallback using tab.url video_id
      if (directVId) {
        const isShort = url.includes('/shorts/');
        document.getElementById('extractedType').textContent = `YouTube (${isShort ? 'short' : 'video'})`;
        document.getElementById('extractedTitle').textContent = cleanTitle || 'YouTube Video';
        const thumbUrl = `https://img.youtube.com/vi/${directVId}/mqdefault.jpg`;
        if (document.getElementById('extractedThumb').src !== thumbUrl) {
          document.getElementById('extractedThumb').src = thumbUrl;
        }
        document.getElementById('extractedSub').textContent = `youtube.com · video_id: ${directVId}`;
        loadPopupTranscript(directVId);
        return;
      }
    }

    // Standard website tab fallback
    const domain = new URL(url).hostname.replace(/^www\./, '');
    const typeLabel = `Active Tab (${domain || 'web'})`;
    document.getElementById('extractedType').textContent = typeLabel;
    document.getElementById('extractedTitle').textContent = tab.title || 'Untitled Tab';
    const favIconUrl = tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
    if (document.getElementById('extractedThumb').src !== favIconUrl) {
      document.getElementById('extractedThumb').src = favIconUrl;
    }
    document.getElementById('extractedSub').textContent = `${domain} · ${tab.incognito ? 'Incognito' : 'Standard'}`;
  } catch (_) {}
}

async function renderLogs() {
  try {
    const data = await api.storage.local.get({ recentLogs: [] });
    const recentLogs = data.recentLogs || [];

    const terminalBox = document.getElementById('terminalBox');
    if (recentLogs.length > 0) {
      terminalBox.innerHTML = recentLogs.map(item => {
        const ev = item.event || {};
        const watchedSec = ev.actual_watch_seconds !== undefined ? `${ev.actual_watch_seconds}s` : '0s';
        const eventSummary = ev.source === 'youtube' 
          ? `[YouTube] ${ev.title} (watched: ${watchedSec}, pos: ${ev.position_seconds || 0}s)`
          : `[Tab] ${ev.title} (${ev.domain})`;
        const isErr = String(item.status).includes('Failed') || String(item.status).includes('Error');
        const statusClass = isErr ? 'log-status err' : 'log-status';
        return `<div class="log-line"><span class="log-time">[${item.time}]</span> ${escapeHtml(eventSummary)} <span class="${statusClass}">${escapeHtml(item.status)}</span></div>`;
      }).join('');
    }
  } catch (_) {}
}

function clearLogs() {
  api.storage.local.set({ recentLogs: [], lastEvent: null }).then(() => {
    document.getElementById('terminalBox').innerHTML = '<div class="log-line"><span class="log-time">[System]</span> Logs cleared. Waiting for new events...</div>';
    updateActiveTabPreview(true);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  const browserInfo = await detectBrowserName();
  const badge = document.getElementById('browserBadge');
  if (badge) {
    badge.innerHTML = `<span>${browserInfo.icon} ${browserInfo.name}</span>`;
  }

  const s = { ...defaults, ...(await api.storage.local.get(defaults)) };
  document.getElementById('enabled').checked = !!s.enabled;
  document.getElementById('trackIncognito').checked = !!s.trackIncognito;

  checkAgentStatus(s.endpoint);
  updateActiveTabPreview(true);
  renderLogs();

  // Instant Tab Switch & Update Listeners
  api.tabs.onActivated?.addListener(() => {
    updateActiveTabPreview(true);
  });
  api.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
      updateActiveTabPreview(false);
    }
  });

  // Instant update on storage changes
  api.storage.onChanged?.addListener(() => {
    renderLogs();
    updateActiveTabPreview(false);
  });

  // Real-time 1s timer to update active watch time continuously
  setInterval(() => updateActiveTabPreview(false), 1000);
}

document.getElementById('save').onclick = async () => {
  const enabled = document.getElementById('enabled').checked;
  const trackIncognito = document.getElementById('trackIncognito').checked;
  const endpoint = defaults.endpoint;

  await api.storage.local.set({ enabled, trackIncognito, endpoint });

  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = '✓ Extension Settings Saved!';
  statusEl.style.color = 'var(--green)';

  checkAgentStatus(endpoint);
  setTimeout(() => { statusEl.textContent = ''; }, 2500);
};

document.getElementById('testPing').onclick = async () => {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = 'Testing connection to server...';
  statusEl.style.color = 'var(--orange)';
  await checkAgentStatus(defaults.endpoint);
  const dot = document.getElementById('statusDot');
  if (dot.classList.contains('online')) {
    statusEl.textContent = '✓ Server Connection Successful (127.0.0.1:8777)';
    statusEl.style.color = 'var(--green)';
  } else {
    statusEl.textContent = '✖ Could not connect. Run: python daylens.py dashboard';
    statusEl.style.color = 'var(--red)';
  }
  setTimeout(() => { statusEl.textContent = ''; }, 3500);
};

let popupTranscriptText = '';
let isPopupTranscriptShown = false;
let isPopupDescShown = false;
let loadedVideoId = '';

async function loadPopupTranscript(videoId) {
  if (loadedVideoId === videoId) return;
  loadedVideoId = videoId;

  const wrap = document.getElementById('popupTranscriptWrap');
  const box = document.getElementById('popupTranscriptBox');
  const statusEl = document.getElementById('popupTranscriptStatus');
  if (wrap) wrap.style.display = 'block';

  try {
    const res = await fetch(`http://127.0.0.1:8777/api/youtube/transcript?video_id=${encodeURIComponent(videoId)}`);
    const data = await res.json();
    if (data && data.full_text) {
      popupTranscriptText = data.full_text;
      if (statusEl) {
        statusEl.innerHTML = '<span style="width:5px;height:5px;border-radius:50%;background:#4ade80;display:inline-block;box-shadow:0 0 6px #4ade80;"></span> <span>Available</span>';
        statusEl.style.background = 'rgba(34, 197, 94, 0.15)';
        statusEl.style.color = '#4ade80';
      }
      let html = '';
      if (data.segments && data.segments.length > 0) {
        html = data.segments.map(s => {
          const m = Math.floor((s.start || 0) / 60);
          const sec = Math.floor((s.start || 0) % 60);
          const timeStr = `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
          return `<div style="margin-bottom:4px;"><span style="color:#c084fc; font-weight:700; font-family:monospace; margin-right:6px;">[${timeStr}]</span><span>${escapeHtml(s.text)}</span></div>`;
        }).join('');
      } else {
        html = `<div>${escapeHtml(data.full_text)}</div>`;
      }
      box.innerHTML = html;
    } else {
      if (statusEl) {
        statusEl.innerHTML = '<span style="width:5px;height:5px;border-radius:50%;background:#a1a1aa;display:inline-block;"></span> <span>Unavailable</span>';
        statusEl.style.background = 'rgba(161, 161, 170, 0.15)';
        statusEl.style.color = '#a1a1aa';
      }
      box.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:4px;">No subtitle lines available.</div>';
    }
  } catch (e) {
    if (box) box.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:4px;">Server disconnected.</div>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.getElementById('popupDescToggleBtn')?.addEventListener('click', () => {
  const box = document.getElementById('popupDescBox');
  const btn = document.getElementById('popupDescToggleBtn');
  const span = btn?.querySelector('span');
  isPopupDescShown = !isPopupDescShown;
  box.style.display = isPopupDescShown ? 'block' : 'none';
  if (span) span.innerText = isPopupDescShown ? 'Collapse' : 'Expand';
});

document.getElementById('popupToggleTranscriptBtn')?.addEventListener('click', () => {
  const box = document.getElementById('popupTranscriptBox');
  const btn = document.getElementById('popupToggleTranscriptBtn');
  const copyBtn = document.getElementById('popupCopyTranscriptBtn');
  const span = btn?.querySelector('span');
  isPopupTranscriptShown = !isPopupTranscriptShown;
  box.style.display = isPopupTranscriptShown ? 'block' : 'none';
  if (span) span.innerText = isPopupTranscriptShown ? 'Hide Transcript' : 'Show Transcript';
  if (copyBtn) copyBtn.style.display = (isPopupTranscriptShown && popupTranscriptText) ? 'inline-flex' : 'none';
});

document.getElementById('popupCopyTranscriptBtn')?.addEventListener('click', () => {
  if (!popupTranscriptText) return;
  navigator.clipboard.writeText(popupTranscriptText).then(() => {
    const btn = document.getElementById('popupCopyTranscriptBtn');
    const span = btn?.querySelector('span');
    if (span) span.innerText = 'Copied!';
    setTimeout(() => { if (span) span.innerText = 'Copy'; }, 2000);
  });
});

window.clearLogs = clearLogs;
init();
