const DEFAULTS = {
  enabled: true,
  trackIncognito: false,
  endpoint: 'http://127.0.0.1:8777/api/ingest',
  blockedDomains: []
};
let last = null;
let heartbeat = null;

function api() {
  return globalThis.browser || globalThis.chrome;
}

async function settings() {
  const result = await api().storage.local.get(DEFAULTS);
  return {...DEFAULTS, ...result};
}

function domainFrom(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return ''; }
}

function allowed(url, blockedDomains) {
  if (!url || /^(chrome|edge|about|file|moz-extension|chrome-extension):/.test(url)) return false;
  if (!blockedDomains || blockedDomains.length === 0) return true;
  const domain = domainFrom(url);
  return domain && !blockedDomains.some(part => part && domain.includes(part));
}

async function detectBrowserSource() {
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function' && await navigator.brave.isBrave()) {
      return 'brave';
    }
  } catch (_) {}
  if (typeof globalThis.browser !== 'undefined') {
    return 'firefox';
  }
  return 'chrome';
}

async function saveLog(event, status = 'HTTP 200 OK') {
  try {
    const timeStr = new Date().toLocaleTimeString();
    const logItem = { time: timeStr, event, status };
    const data = await api().storage.local.get({ recentLogs: [] });
    const logs = [logItem, ...(data.recentLogs || [])].slice(0, 25);
    await api().storage.local.set({ lastEvent: event, recentLogs: logs });
  } catch (_) {}
}

async function sendTab(tab, isHeartbeat = false) {
  const cfg = await settings();
  if (!cfg.enabled || !tab || !allowed(tab.url, cfg.blockedDomains)) return;
  if (tab.incognito && !cfg.trackIncognito) return;

  const domain = domainFrom(tab.url);
  if (domain === 'youtube.com') return;

  const title = (tab.title || '').slice(0, 300);
  const favIconUrl = tab.favIconUrl || '';
  const key = `${domain}|${title}|${tab.incognito ? 'incognito' : 'normal'}`;
  
  const nowTime = Date.now();
  if (!isHeartbeat && last && last.key === key && (nowTime - (last.at || 0) < 10000)) return;

  const now = new Date().toISOString();
  const source = await detectBrowserSource();
  const event = {
    source, 
    event_type: isHeartbeat ? 'heartbeat' : 'active_tab', 
    domain, 
    title, 
    favIconUrl,
    is_incognito: !!tab.incognito,
    started_at: now, 
    ended_at: now
  };
  try {
    const res = await fetch(cfg.endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(event)});
    last = {key, at: nowTime};
    saveLog(event, res.ok ? 'Sent (200 OK)' : `Failed (${res.status})`);
  } catch (err) {
    saveLog(event, 'Failed (Offline/Error)');
  }
}

async function handleYouTubePayload(payload) {
  const cfg = await settings();
  if (!cfg.enabled) return;
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify(payload)
    });
    saveLog(payload, res.ok ? 'Sent (200 OK)' : `Failed (${res.status})`);
  } catch (err) {
    saveLog(payload, 'Failed (Offline/Error)');
  }
}

function triggerHeartbeat() {
  api().tabs.query({active: true, currentWindow: true}).then(tabs => {
    if (tabs && tabs[0]) sendTab(tabs[0], true);
  }).catch(() => {});
}

api().tabs.onActivated.addListener(({tabId}) => {
  api().tabs.get(tabId).then(tab => sendTab(tab, false)).catch(() => {});
});
api().tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo && changeInfo.status === 'complete' && tab) sendTab(tab, false);
});

if (heartbeat) clearInterval(heartbeat);
heartbeat = setInterval(triggerHeartbeat, 10000);

api().runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'INGEST_YOUTUBE') {
    handleYouTubePayload(msg.payload);
    sendResponse({status: 'queued'});
  } else if (msg.type === 'YOUTUBE_EVENT' || msg.type === 'LOG_EVENT') {
    saveLog(msg.payload, msg.status || 'Sent');
    sendResponse({received: true});
  }
  return true;
});
