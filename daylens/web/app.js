/* DayLens — Emerald Redesign frontend
   Custom chart library, animated SVG icons, bento layout rendering.
   Backend API contracts unchanged. */

let currentRange = 'today';
let customDate = null;
let selectedCategory = 'all';
let searchQuery = '';
let timelinePage = 1;
const timelineLimit = 20;
let hasMoreActivities = false;
let rulesData = {};

function formatLocalTime(isoStr) {
  if (!isoStr) return '';
  try {
    let cleanIso = isoStr.replace(' ', 'T');
    if (!cleanIso.includes('Z') && !cleanIso.includes('+') && !cleanIso.includes('-')) {
      cleanIso += 'Z';
    }
    const d = new Date(cleanIso);
    if (isNaN(d.getTime())) return isoStr.substring(11, 16);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return isoStr.substring(11, 16);
  }
}

function formatLocalDate(isoStr) {
  if (!isoStr) return '';
  try {
    let cleanIso = isoStr.replace(' ', 'T');
    if (!cleanIso.includes('Z') && !cleanIso.includes('+') && !cleanIso.includes('-')) {
      cleanIso += 'Z';
    }
    const d = new Date(cleanIso);
    if (isNaN(d.getTime())) return isoStr.substring(0, 10);
    return d.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (e) {
    return isoStr.substring(0, 10);
  }
}

function isWebsiteDomain(appName, source) {
  if (source && ['chrome', 'brave', 'firefox', 'youtube'].includes(String(source).toLowerCase())) {
    return true;
  }
  const name = String(appName || '').toLowerCase().trim();
  if (name.endsWith('.exe') || name.endsWith('.root') || name === 'shellexperiencehost') return false;
  return name.includes('.') || name === 'localhost';
}

function formatAppName(appName) {
  if (!appName) return 'Unknown App';
  let name = String(appName).replace(/\.exe$/i, '').replace(/\.Root$/i, '').trim();
  const lower = name.toLowerCase();
  if (lower === 'brave') return 'Brave Browser';
  if (lower === 'chrome') return 'Google Chrome';
  if (lower === 'code') return 'VS Code';
  if (lower === 'winword') return 'Microsoft Word';
  if (lower === 'shellexperiencehost') return 'Windows Shell';
  if (lower === 'youtube.com') return 'YouTube';
  if (lower === 'facebook.com') return 'Facebook';
  if (lower === 'github.com') return 'GitHub';
  if (lower === 'x.com' || lower === 'twitter.com') return 'X (Twitter)';
  if (lower === 'google.com') return 'Google Search';
  if (lower === '127.0.0.1' || lower === 'localhost') return 'Local Dashboard (127.0.0.1)';
  return name;
}

function renderAppIconMarkup(appName, iconDataUri, source) {
  const cleanDomain = String(appName || '').toLowerCase().replace(/^www\./, '');
  const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=64`;

  if (isWebsiteDomain(appName, source)) {
    const imgSrc = (iconDataUri && (iconDataUri.startsWith('http') || iconDataUri.startsWith('data:'))) ? iconDataUri : googleFaviconUrl;
    return `<img src="${imgSrc}" alt="${escapeHtml(appName)}" style="width:24px;height:24px;border-radius:4px;object-fit:contain;" onerror="if(this.src!=='${googleFaviconUrl}'){this.src='${googleFaviconUrl}';}else{this.onerror=null;this.src='data:image/svg+xml;utf8,<svg viewBox=\\'0 0 24 24\\' xmlns=\\'http://www.w3.org/2000/svg\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'9\\' fill=\\'%2310b981\\'/></svg>';}">`;
  }
  if (iconDataUri) {
    return `<img src="${iconDataUri}" alt="${escapeHtml(appName)}">`;
  }
  return getAppIconSvg(appName);
}

function getAppIconSvg(appName) {
  const name = (appName || '').toLowerCase();
  if (name.includes('python') || name.includes('py.exe')) {
    return `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2c-4.4 0-4.8.2-4.8 2.2V6h9.6c1.1 0 2 .9 2 2v4.8c2 0 2.2-.4 2.2-4.8C21 3.6 17.6 2 12 2z" fill="#10b981"/><path d="M12 22c4.4 0 4.8-.2 4.8-2.2V18H7.2c-1.1 0-2-.9-2-2v-4.8C3.2 11.2 3 11.6 3 16c0 4.4 3.4 6 9 6z" fill="#2dd4bf"/><circle cx="9" cy="4.5" r="0.8" fill="#fff"/><circle cx="15" cy="19.5" r="0.8" fill="#fff"/></svg>`;
  }
  if (name.includes('chrome')) {
    return `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#10b981" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#38bdf8"/></svg>`;
  }
  if (name.includes('brave')) {
    return `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" fill="#10b981"/></svg>`;
  }
  if (name.includes('code') || name.includes('visual studio')) {
    return `<svg viewBox="0 0 24 24" fill="none"><path d="M17 3l4 3v12l-4 3L8 14 3 17.5 1.5 16 5 12 1.5 8 3 6.5 8 10l9-7z" fill="#38bdf8"/></svg>`;
  }
  if (name.includes('telegram')) {
    return `<svg viewBox="0 0 24 24" fill="none"><path d="M21.5 3.5L2.5 11l6 2.5 10-8.5-7.5 9.5v5.5l3.5-3.5 5.5 4 1.5-17z" fill="#38bdf8"/></svg>`;
  }
  if (name.includes('word') || name.includes('office')) {
    return `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#2563eb"/><path d="M7 7h3l2 6 2-6h3l-3.5 10h-3L7 7z" fill="#fff"/></svg>`;
  }
  if (name.includes('spotify')) {
    return `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M7 9c3.5-1 7-1 10 1M8 12.5c3-.8 6-.5 8.5 1M9 16c2.5-.5 5-.3 7 1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }
  if (name.includes('explorer')) {
    return `<svg viewBox="0 0 24 24" fill="none"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" fill="#10b981"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="6" x2="8" y2="6.01"/></svg>`;
}

function toggleSidebarSlider() {
  const shell = document.getElementById('appShell');
  const isCollapsed = shell.classList.toggle('collapsed');
  const icon = document.getElementById('toggleIcon');
  if (isCollapsed) {
    icon.innerHTML = '<polyline points="9 18 15 12 9 6"/>';
  } else {
    icon.innerHTML = '<polyline points="15 18 9 12 15 6"/>';
  }
}

function switchPage(pageId, el) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if(el) el.classList.add('active');

  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
  document.getElementById(`view-${pageId}`).classList.add('active');

  const headings = {
    'overview': { title: 'Overview Analytics', subtitle: 'Real-time productivity summary from local tracking.' },
    'timeline': { title: 'Timeline Feed', subtitle: 'Detailed chronological log of application window activity.' },
    'categories': { title: 'Category Rules', subtitle: 'Customize application categorization mapping.' },
    'youtube': { title: 'YouTube Intelligence', subtitle: 'Video sessions, long-form learning and watch patterns.' },
    'livescreen': { title: 'Live Desktop Screen', subtitle: 'Real-time monitor screen capture feed.' },
    'settings': { title: 'Settings & Control', subtitle: 'Manage background collector status and application settings.' }
  };

  if(headings[pageId]) {
    document.getElementById('pageHeading').innerText = headings[pageId].title;
    document.getElementById('pageSubheading').innerText = headings[pageId].subtitle;
  }

  if(pageId === 'categories') renderCategoryRulesPage();
  if(pageId === 'youtube') fetchYouTubeData();
  triggerStaggerEntrance();
  if(pageId === 'livescreen') {
    startScreenStream();
  } else {
    stopScreenStream();
  }
}

/* --- Live clock in the topbar --- */
function updateLiveClock() {
  const el = document.getElementById('liveClockText');
  if (!el) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  el.innerText = `${h}:${m}:${s}`;
}
updateLiveClock();
setInterval(updateLiveClock, 1000);

/* --- Ripple feedback on .btn clicks --- */
document.addEventListener('click', function (evt) {
  const btn = evt.target.closest('.btn');
  if (!btn || btn.disabled) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (evt.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (evt.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

/* --- Count-up animation (formats as h/m/s while ticking) --- */
function animateCountUp(element, targetNumber, suffix, durationMs) {
  if (!element) return;
  element.classList.add('count-up');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { element.innerText = targetNumber + suffix; return; }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(targetNumber * eased);
    element.innerText = formatCountUpDuration(val) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* Compact duration formatting for count-up ticks (keeps it short while counting) */
function formatCountUpDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* --- Pause icon morph: pause <-> play --- */
function updatePauseIconSVG(isPaused) {
  const icon = document.getElementById('pauseIcon');
  if (!icon) return;
  icon.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
  icon.style.transform = 'scale(0.5)';
  setTimeout(() => {
    if (isPaused) {
      icon.innerHTML = '<polygon points="7 5 18 12 7 19"/>';
    } else {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    }
    icon.style.transform = 'scale(1)';
  }, 130);
}

/* --- Theme icon morph: moon <-> sun --- */
function updateThemeIconSVG(theme) {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  icon.style.transition = 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1)';
  icon.style.transform = 'scale(0.4) rotate(-90deg)';
  setTimeout(() => {
    if (theme === 'dark') {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
      icon.innerHTML = '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';
    }
    icon.style.transform = 'scale(1) rotate(0deg)';
  }, 220);
}

/* --- Staggered entrance --- */
function triggerStaggerEntrance() {
  const activeView = document.querySelector('.page-view.active');
  if (!activeView) return;
  activeView.querySelectorAll('.stagger-enter').forEach(el => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  });
}

/* ==================== CHART LIBRARY (custom) ==================== */

/* Smooth monotone-ish curve through points (cardinal spline) */
function splinePath(points) {
  if (points.length < 2) return '';
  const path = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  return path.join(' ');
}

/* New mountain-area chart: animated gradient area + glowing line + hour dots */
function renderMountainChart(hourly) {
  const wrap = document.getElementById('mountainChartWrap');
  if (!wrap) return;
  if (!hourly || hourly.length === 0) {
    wrap.innerHTML = '<div class="empty-state" style="margin:14px 18px;"><svg class="svg-icon" viewBox="0 0 24 24" width="36" height="36"><path d="M3 20l6-9 4 5 4-6 4 10H3z"/></svg><div><strong style="color:var(--text); font-size:13px;">No hourly data yet</strong><br><span style="font-size:11px;">Activity distribution will appear here as sessions are recorded.</span></div></div>';
    return;
  }
  const W = 850, H = 200;
  const padX = 42, padR = 14, topPad = 18, botPad = 34;
  const maxMin = Math.max(...hourly.map(h => h.minutes), 1);
  const chartW = W - padX - padR;
  const chartH = H - topPad - botPad;

  const pts = hourly.map((h, i) => ({
    x: padX + i * (chartW / 23) + (chartW / 46),
    y: topPad + chartH - Math.max(8, (h.minutes / maxMin) * chartH)
  }));

  const linePath = splinePath(pts);
  const areaPath = linePath +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${(H - botPad).toFixed(1)}` +
    ` L ${pts[0].x.toFixed(1)} ${(H - botPad).toFixed(1)} Z`;

  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y = topPad + (chartH * i) / 4;
    const val = maxMin * (1 - i / 4);
    gridLines += `<line class="chart-grid-line" x1="${padX}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    gridLines += `<text class="chart-axis-label" x="${padX - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${Math.round(val)}m</text>`;
  }

  let axisLabels = '';
  hourly.forEach((h, i) => {
    if (i % 3 === 0) {
      const x = padX + i * (chartW / 23) + (chartW / 46);
      axisLabels += `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${(H - 12).toFixed(1)}" text-anchor="middle">${h.hour}h</text>`;
    }
  });

  let dots = '';
  hourly.forEach((h, i) => {
    const p = pts[i];
    const nextHour = (i + 1) % 24;
    const hourLabel = `${h.hour} - ${nextHour < 10 ? '0' + nextHour : nextHour}:00`;
    const durStr = formatDuration(Math.round(h.minutes * 60));
    dots += `<circle class="hour-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"
      style="animation-delay:${(0.9 + i * 0.045).toFixed(2)}s;"
      onmouseenter="showTooltip(event, '${hourLabel}', '${durStr} active')"
      onmouseleave="hideTooltip()"/>`;
  });

  wrap.innerHTML = `
    <svg class="mountain-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="emeraldFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#10b981" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#059669" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${axisLabels}
      <path class="mountain-area" d="${areaPath}"/>
      <path class="mountain-line" d="${linePath}"/>
      ${dots}
    </svg>`;
}

/* KPI sparkline (mini mountain) */
function renderSparkline(svgId, values) {
  const svg = document.getElementById(svgId);
  if (!svg || !values || values.length < 2) {
    if (svg) svg.style.display = 'none';
    return;
  }
  if (svg) svg.style.display = 'block';
  const W = 240, H = 34;
  const pad = 4;
  const maxV = Math.max(...values, 1);
  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (W - pad * 2),
    y: pad + (1 - v / maxV) * (H - pad * 2)
  }));
  const line = splinePath(pts);
  const area = line +
    ` L ${(W - pad).toFixed(1)} ${(H - pad).toFixed(1)} L ${pad.toFixed(1)} ${(H - pad).toFixed(1)} Z`;
  svg.innerHTML = `
    <path class="sparkline-fill" d="${area}" fill="#10b981"/>
    <path class="sparkline-path" d="${line}" style="stroke-dasharray:${W * 2}; stroke-dashoffset:${W * 2}; animation: sparkDraw 1.2s cubic-bezier(0.16,1,0.3,1) forwards;"/>`;
}

/* Category ring chips */
function renderCategoryRings(catBreakdown, totalMinutes) {
  const list = document.getElementById('ringChipsList');
  if (!list) return;
  if (!catBreakdown || catBreakdown.length === 0 || totalMinutes <= 0) {
    list.innerHTML = '<div class="empty-state"><strong style="color:var(--text); font-size:13px;">No categories yet</strong></div>';
    return;
  }
  const ringColors = ['#10b981', '#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24'];
  const sumCatMins = catBreakdown.reduce((acc, c) => acc + (c.minutes || 0), 0);
  const total = Math.max(totalMinutes, sumCatMins, 0.01);
  const circumference = 2 * Math.PI * 15;

  list.innerHTML = catBreakdown.slice(0, 4).map((c, i) => {
    const pct = Math.min(1, c.minutes / total);
    const durStr = formatDuration(Math.round(c.minutes * 60));
    const color = ringColors[i % ringColors.length];
    return `
      <div class="ring-chip">
        <svg class="ring-mini" viewBox="0 0 40 40">
          <circle class="ring-track" cx="20" cy="20" r="15"/>
          <circle class="ring-fill" cx="20" cy="20" r="15"
            stroke="${color}" stroke-dasharray="${(pct * 100).toFixed(1)} 100"
            style="animation-delay:${(i * 0.1).toFixed(2)}s;"/>
        </svg>
        <div class="ring-chip-name">${escapeHtml(c.category)}</div>
        <div class="ring-chip-val">${durStr}</div>
      </div>`;
  }).join('');
}

/* ==================== Donut (emerald gradient segments) ==================== */
function renderCategoryDonut(catBreakdown, totalMinutes) {
  const group = document.getElementById('donutSegmentsGroup');
  const legend = document.getElementById('donutLegend');
  if(!catBreakdown || catBreakdown.length === 0 || totalMinutes <= 0) {
    group.innerHTML = '';
    legend.innerHTML = `<div style="color: var(--text-muted); font-size: 11px;">No category share</div>`;
    return;
  }

  const colors = ['#10b981', '#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24'];
  const circumference = 2 * Math.PI * 38;
  const sumCatMins = catBreakdown.reduce((acc, c) => acc + (c.minutes || 0), 0);
  const totalForDonut = Math.max(totalMinutes, sumCatMins, 0.01);

  let accumulatedPct = 0;
  let segmentsHtml = '';
  let legendHtml = '';

  catBreakdown.forEach((c, i) => {
    const pct = Math.min(1.0, c.minutes / totalForDonut);
    const dashArray = `${pct * circumference} ${circumference}`;
    const dashOffset = -accumulatedPct * circumference;
    const color = colors[i % colors.length];

    segmentsHtml += `<circle class="donut-seg" cx="50" cy="50" r="38" stroke="${color}"
      stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
      style="animation-delay:${(0.35 + i * 0.1).toFixed(2)}s;"/>`;

    accumulatedPct += pct;

    const durStr = formatDuration(Math.round(c.minutes * 60));
    const pctStr = Math.min(100, Math.round(pct * 100)) + '%';

    legendHtml += `
      <div class="legend-item">
        <div class="legend-label">
          <div class="legend-dot" style="background: ${color}; color: ${color};"></div>
          <span>${escapeHtml(c.category)}</span>
        </div>
        <div class="legend-val">${durStr} (${pctStr})</div>
      </div>
    `;
  });

  group.innerHTML = segmentsHtml;
  legend.innerHTML = legendHtml;
}

/* ==================== Leaderboard ==================== */
function showTooltip(e, headerText, bodyText) {
  const tooltip = document.getElementById('chartTooltip');
  document.getElementById('tooltipHeader').innerText = headerText;
  document.getElementById('tooltipBody').innerText = bodyText;
  tooltip.style.left = e.clientX + 'px';
  tooltip.style.top = e.clientY + 'px';
  tooltip.classList.add('visible');
}

function hideTooltip() {
  document.getElementById('chartTooltip').classList.remove('visible');
}

let currentLeaderboardApps = [];
let currentTotalMinutes = 0;
let leaderboardTab = 'all';

function setLeaderboardTab(tab, el) {
  leaderboardTab = tab;
  if (el) {
    const parent = el.closest('.tabs');
    if (parent) parent.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    updateTabPill('lbTabs', 'lbTabPill');
  }
  renderLeaderboard(currentLeaderboardApps, currentTotalMinutes);
}

function renderLeaderboard(apps, totalMinutes) {
  currentLeaderboardApps = apps || [];
  currentTotalMinutes = totalMinutes || 0;

  const container = document.getElementById('leaderboardList');
  if (container) {
    container.classList.remove('animate-slide');
    void container.offsetWidth;
    container.classList.add('animate-slide');
  }

  if (!apps || apps.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg class="svg-icon" viewBox="0 0 24 24" width="40" height="40"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="8" x2="8" y2="8.01"/><line x1="12" y1="8" x2="12" y2="8.01"/><line x1="16" y1="8" x2="16" y2="8.01"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
      <div><strong style="color: var(--text); font-size: 14px;">No activity recorded yet</strong><br><span style="font-size: 12px;">Run <code>python daylens.py track</code> in the background to start collecting app usage.</span></div>
    </div>`;
    return;
  }

  let filteredApps = apps;
  if (leaderboardTab === 'software') {
    filteredApps = apps.filter(a => !isWebsiteDomain(a.app, a.source));
  } else if (leaderboardTab === 'website') {
    filteredApps = apps.filter(a => isWebsiteDomain(a.app, a.source));
  }

  if (filteredApps.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg class="svg-icon" viewBox="0 0 24 24" width="40" height="40"><circle cx="11" cy="11" r="8"/><line x1="16.2" y1="16.2" x2="21" y2="21"/></svg>
      <div><strong style="color: var(--text); font-size: 14px;">No ${leaderboardTab === 'website' ? 'website' : 'software'} activity</strong><br><span style="font-size: 12px;">Nothing found for this filter and period.</span></div>
    </div>`;
    return;
  }

  const topMin = Math.max(...filteredApps.map(a => a.minutes), 1);
  const sumAppMins = filteredApps.reduce((acc, a) => acc + (a.minutes || 0), 0);
  const totalForLb = Math.max(totalMinutes, sumAppMins, 0.01);
  let html = '';

  filteredApps.forEach((appItem, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'top-1' : (rank === 2 ? 'top-2' : (rank === 3 ? 'top-3' : ''));
    const iconMarkup = renderAppIconMarkup(appItem.app, appItem.icon, appItem.source);
    const cleanName = formatAppName(appItem.app);

    const pctOfTop = Math.min(100, Math.max(8, Math.round((appItem.minutes / topMin) * 100)));
    const pctOfDay = totalForLb > 0 ? Math.min(100, Math.round((appItem.minutes / totalForLb) * 100)) : 0;
    const durStr = formatDuration(Math.round(appItem.minutes * 60));

    html += `
      <div class="leaderboard-item" style="animation-delay: ${Math.min(0.35, index * 0.045)}s;">
        <div class="rank-badge ${rankClass}">#${rank}</div>
        <div class="app-brand-icon">${iconMarkup}</div>
        <div>
          <div class="leader-app-name" title="${escapeHtml(cleanName)}">${escapeHtml(cleanName)}</div>
          <div class="leader-cat-badge">${escapeHtml(appItem.category)}</div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="--fill-w:${pctOfTop}%; animation-delay: ${0.3 + index * 0.05}s;"></div>
        </div>
        <div class="time-badge">${durStr}</div>
        <div class="percent-badge">${pctOfDay}%</div>
      </div>
    `;
  });

  container.innerHTML = html;
  syncAllTabPills();
}

/* ==================== Timeline ==================== */
async function fetchActivities(reset = false) {
  if (reset) {
    timelinePage = 1;
  }
  try {
    let url = `/api/activities?range=${currentRange}&category=${selectedCategory}&page=${timelinePage}&limit=${timelineLimit}`;
    if(customDate) url += `&date=${customDate}`;
    if(searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url);
    const data = await res.json();

    const list = data.items || [];
    hasMoreActivities = data.has_more || false;

    const container = document.getElementById('timelineList');
    if (reset) {
      container.innerHTML = Array.from({length: 3}).map(() => '<div class="skeleton skeleton-item"></div>').join('');
    }

    let htmlEvents = '';
    let evIndex = 0;
    list.forEach(ev => {
      const startTimeStr = formatLocalTime(ev.started_at);
      const endTimeStr = formatLocalTime(ev.ended_at);
      const dateStr = formatLocalDate(ev.started_at);

      let durationText = '';
      if (ev.duration_minutes && ev.duration_minutes >= 0.05) {
        durationText = ` · ${formatDuration(Math.round(ev.duration_minutes * 60))}`;
      }

      let idleStatusMarkup = '';
      if (ev.idle_seconds <= 5) {
        idleStatusMarkup = `<span class="active-badge">⚡ Active</span>`;
      } else {
        idleStatusMarkup = `<span class="idle-badge">⚠️ ${formatDuration(ev.idle_seconds)} idle</span>`;
      }

      const iconMarkup = renderAppIconMarkup(ev.app, ev.icon, ev.source);
      const cleanAppName = formatAppName(ev.app);

      htmlEvents += `
        <div class="timeline-item" style="animation-delay: ${Math.min(0.4, evIndex * 0.05)}s;">
          <div>
            <div class="time-stamp">${dateStr}</div>
            <span class="time-subtext">${startTimeStr} - ${endTimeStr}${durationText}</span>
          </div>
          <div class="app-brand-icon">${iconMarkup}</div>
          <div style="min-width: 0;">
            <div class="item-title" title="${escapeHtml(cleanAppName)}">${escapeHtml(cleanAppName)}</div>
            <div class="item-subtitle">${escapeHtml(ev.window_title || 'No Window Title')}</div>
          </div>
          <div><span class="pill-badge cat-${ev.category}">${escapeHtml(ev.category)}</span></div>
          <div><span class="source-chip ${ev.source || 'collector'}">● ${escapeHtml(ev.source || 'windows')}</span></div>
          <div style="text-align: right;">${idleStatusMarkup}</div>
        </div>
      `;
      evIndex += 1;
    });
    container.insertAdjacentHTML('beforeend', htmlEvents);

    document.getElementById('loadMoreWrap').style.display = hasMoreActivities ? 'flex' : 'none';
  } catch(e) {
    console.error("Failed to fetch activities", e);
  }
}

function loadMoreActivities() {
  if(hasMoreActivities) {
    timelinePage += 1;
    fetchActivities(false);
  }
}

/* ==================== YouTube Intelligence ==================== */
let currentYouTubeItems = [];
let currentYouTubeFilter = 'all';
let ytSearchQuery = '';

function filterYouTubeCategory(cat, el) {
  currentYouTubeFilter = cat;
  document.querySelectorAll('#view-youtube .badge-filter').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  renderYouTubeVideoList();
}

function onYouTubeSearchChange() {
  const input = document.getElementById('ytSearchInput');
  ytSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderYouTubeVideoList();
}

async function clearYouTubeHistory() {
  if (!confirm("Are you sure you want to clear all YouTube watch history?")) return;
  try {
    const res = await fetch('/api/youtube/clear', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      fetchYouTubeData();
    }
  } catch (e) {
    console.error("Failed to clear YouTube history", e);
  }
}

async function fetchYouTubeData() {
  try {
    const res = await fetch(`/api/youtube?range=${currentRange}`);
    const data = await res.json();
    const totalSec = data.total_seconds !== undefined ? Math.round(data.total_seconds) : Math.round((data.total_minutes || 0) * 60);
    document.getElementById('youtubeKpis').innerHTML = `
      <div class="glass-card kpi-card-yt stagger-enter stagger-1">
        <div class="kpi-header">
          <div class="kpi-icon-wrap">
            <span class="icon-ring"></span>
            <svg class="svg-icon" viewBox="0 0 24 24" width="20" height="20">
              <rect x="2.5" y="5" width="19" height="14" rx="4.5"/>
              <polygon points="10 9.2 15 12 10 14.8 10 9.2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <span class="card-label">Total Watch Time</span>
        </div>
        <div class="big-stat count-up" style="margin-top: 8px;">${formatDuration(totalSec)}</div>
        <div class="stat-subtext">
          <svg class="svg-icon" viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="9.5"/><polyline points="12 7.5 12 12 15 13.8"/></svg>
          Active watch duration
        </div>
      </div>

      <div class="glass-card kpi-card-yt stagger-enter stagger-2">
        <div class="kpi-header">
          <div class="kpi-icon-wrap">
            <span class="icon-ring"></span>
            <svg class="svg-icon" viewBox="0 0 24 24" width="18" height="18">
              <rect x="2" y="4" width="20" height="16" rx="3"/><polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <span class="card-label">Long Form Videos</span>
        </div>
        <div class="big-stat" style="margin-top: 8px;">${data.long_videos || 0}</div>
        <div class="stat-subtext">
          <svg class="svg-icon" viewBox="0 0 24 24" width="12" height="12"><rect x="2" y="4" width="20" height="16" rx="3"/><polygon points="10 9 15 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>
          Tutorials & streams
        </div>
      </div>

      <div class="glass-card kpi-card-yt stagger-enter stagger-3">
        <div class="kpi-header">
          <div class="kpi-icon-wrap">
            <span class="icon-ring"></span>
            <svg class="svg-icon" viewBox="0 0 24 24" width="18" height="18">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <span class="card-label">Shorts Tracked</span>
        </div>
        <div class="big-stat" style="margin-top: 8px;">${data.shorts || 0}</div>
        <div class="stat-subtext">
          <svg class="svg-icon" viewBox="0 0 24 24" width="12" height="12"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          Vertical short videos
        </div>
      </div>
    `;

    renderYouTubeTopChannels(data.top_channels || []);
    renderYouTubeTopTopics(data.top_topics || [], totalSec);

    currentYouTubeItems = data.items || [];
    renderYouTubeVideoList();
  } catch (e) { console.error('YouTube data failed', e); }
}

function renderYouTubeTopChannels(channels) {
  const container = document.getElementById('youtubeTopChannels');
  if (!container) return;
  const filtered = (channels || []).filter(c => c.channel && c.channel !== 'YouTube Channel' && c.channel !== 'Unknown Channel');
  if (!filtered || !filtered.length) {
    container.innerHTML = '<div class="empty-state"><svg class="svg-icon" viewBox="0 0 24 24" width="34" height="34"><rect x="2.5" y="5" width="19" height="14" rx="4.5"/><polygon points="10 9.2 15 12 10 14.8 10 9.2"/></svg><div><strong style="color:var(--text); font-size:13px;">No channel history yet</strong><br><span style="font-size:11px;">Watch videos with the browser connector enabled to see insights here.</span></div></div>';
    return;
  }
  container.innerHTML = filtered.map((ch, idx) => {
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.channel || 'Channel')}&background=10b981&color=fff&bold=true&rounded=true`;
    const imgSrc = ch.channel_icon ? escapeHtml(ch.channel_icon) : fallbackUrl;
    const avatar = `<img src="${imgSrc}" style="width:30px;height:30px;min-width:30px;border-radius:50%;object-fit:cover;border:1px solid var(--border);" alt="${escapeHtml(ch.channel)}" onerror="this.onerror=null;this.src='${fallbackUrl}';">`;
    const durStr = formatDuration(ch.watch_seconds);
    const rankClass = idx === 0 ? 'top-1' : (idx === 1 ? 'top-2' : (idx === 2 ? 'top-3' : ''));
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-radius:12px; background:rgba(255,255,255,0.025); border:1px solid var(--border); transition:all 0.2s ease;">
        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
          <div class="rank-badge ${rankClass}" style="font-weight:800; font-size:12px; width:18px;">#${idx+1}</div>
          ${avatar}
          <div style="min-width:0;">
            <div style="font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(ch.channel)}">${escapeHtml(ch.channel)}</div>
            <div style="font-size:10px; color:var(--text-muted);">${ch.video_count} video${ch.video_count > 1 ? 's' : ''} watched</div>
          </div>
        </div>
        <div class="time-badge" style="font-size:12px; font-weight:800; color:var(--accent-bright);">${durStr}</div>
      </div>
    `;
  }).join('');
}

function renderYouTubeTopTopics(topics, totalSec) {
  const container = document.getElementById('youtubeTopTopics');
  if (!container) return;
  if (!topics || !topics.length) {
    container.innerHTML = '<div class="empty-state"><svg class="svg-icon" viewBox="0 0 24 24" width="34" height="34"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><div><strong style="color:var(--text); font-size:13px;">No topic breakdown yet</strong><br><span style="font-size:11px;">Topic categories appear after your first watch sessions are analyzed.</span></div></div>';
    return;
  }
  const maxSec = Math.max(...topics.map(t => t.seconds), 1);
  const topicIcons = {
    "Coding & Tech": `<svg class="svg-icon" viewBox="0 0 24 24" width="15" height="15"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>`,
    "Gaming & Live": `<svg class="svg-icon" viewBox="0 0 24 24" width="15" height="15"><rect x="2" y="6" width="20" height="12" rx="3"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="13" r="1" fill="currentColor" stroke="none"/></svg>`,
    "Entertainment & Stories": `<svg class="svg-icon" viewBox="0 0 24 24" width="15" height="15"><polygon points="6 3 19 12 6 21 6 3" fill="currentColor" stroke="none"/></svg>`,
    "AI & Tools": `<svg class="svg-icon" viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>`,
    "Other Topics": `<svg class="svg-icon" viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="9"/></svg>`
  };

  container.innerHTML = topics.map(t => {
    const pct = Math.min(100, Math.max(6, Math.round((t.seconds / maxSec) * 100)));
    const iconMarkup = topicIcons[t.topic] || topicIcons["Other Topics"];
    return `
      <div class="yt-topic-item">
        <div class="yt-topic-header">
          <div class="yt-topic-title">${iconMarkup} <span>${escapeHtml(t.topic)}</span></div>
          <div class="yt-topic-val">${formatDuration(t.seconds)}</div>
        </div>
        <div class="yt-topic-track">
          <div class="yt-topic-fill" style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderYouTubeVideoList() {
  const container = document.getElementById('youtubeVideos');
  if (!container) return;
  let items = currentYouTubeItems || [];
  if (currentYouTubeFilter === 'long') {
    items = items.filter(v => v.video_type !== 'short');
  } else if (currentYouTubeFilter === 'short') {
    items = items.filter(v => v.video_type === 'short');
  }

  if (ytSearchQuery) {
    items = items.filter(v =>
      (v.title || '').toLowerCase().includes(ytSearchQuery) ||
      (v.channel || '').toLowerCase().includes(ytSearchQuery)
    );
  }

  if (!items.length) {
    container.innerHTML = '<div class="empty-state" style="margin:14px 18px;"><svg class="svg-icon" viewBox="0 0 24 24" width="38" height="38"><circle cx="11" cy="11" r="8"/><line x1="16.2" y1="16.2" x2="21" y2="21"/><line x1="8" y1="11" x2="14" y2="11"/></svg><div><strong style="color:var(--text); font-size:13px;">No matching YouTube sessions</strong><br><span style="font-size:11px;">Try a different filter or search term.</span></div></div>';
    return;
  }

  container.innerHTML = `
    <div class="yt-grid">
      ${items.map((v, idx) => {
        const isShort = v.video_type === 'short';
        const thumbUrl = v.video_id ? `https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg` : 'data:image/svg+xml;utf8,<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="60" fill="%230b1410"/><text x="50" y="35" fill="%235c7c6d" font-size="10" text-anchor="middle">No Thumbnail</text></svg>';
        const watchTimeSec = v.watch_seconds !== undefined ? v.watch_seconds : Math.round((v.watch_minutes || 0) * 60);

        const totalDurSec = v.duration_seconds && v.duration_seconds > 0 ? v.duration_seconds : 0;
        const durDisplay = totalDurSec > 0 ? formatDuration(totalDurSec) : formatDuration(watchTimeSec);
        const watchedDisplay = formatDuration(watchTimeSec);

        let progressPct = 0;
        if (totalDurSec > 0) {
          const pos = v.position_seconds || watchTimeSec;
          progressPct = Math.min(100, Math.max(1, Math.round((pos / totalDurSec) * 100)));
        }

        const channelIconMarkup = v.channel_icon ?
          `<img src="${escapeHtml(v.channel_icon)}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;" alt="" onerror="this.style.display='none';">` :
          `<svg class="svg-icon" viewBox="0 0 24 24" width="14" height="14" style="margin-right:2px;"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`;

        const purposeBadge = v.analysis && v.analysis.purpose ? `<span style="font-size:10px; font-weight:800; background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.3); border-radius:99px; padding:2px 7px;">${escapeHtml(v.analysis.purpose)}</span>` : '';
        const topicBadge = v.analysis && v.analysis.primary_topic ? `<span style="font-size:10px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); border-radius:99px; padding:2px 7px;">${escapeHtml(v.analysis.primary_topic)}</span>` : '';

        return `
          <div class="yt-card" onclick="openVideoModal(${idx})" style="animation-delay:${Math.min(0.35, idx * 0.05)}s;">
            <div class="yt-thumb-wrap">
              <img src="${thumbUrl}" class="yt-thumb-img" alt="${escapeHtml(v.title)}" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg viewBox=\\'0 0 100 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'><rect width=\\'100\\' height=\\'60\\' fill=\\'%230b1410\\'/></svg>';">

              <div class="yt-brand-tag">
                <svg class="svg-icon" viewBox="0 0 24 24" width="12" height="12" style="color:#fff;"><polygon points="8 6 16 12 8 18 8 6" fill="currentColor" stroke="none"/></svg>
                <span>YouTube</span>
              </div>

              <span class="yt-badge ${isShort ? 'short' : ''}">${isShort ? 'Short' : 'Long'}</span>

              <div class="yt-play-overlay">
                <div class="yt-play-btn">
                  <svg class="svg-icon" viewBox="0 0 24 24" width="20" height="20" style="color:#03140d;"><polygon points="8 6 16 12 8 18 8 6" fill="currentColor" stroke="none"/></svg>
                </div>
              </div>

              <div class="yt-duration-badge">
                <svg class="svg-icon" viewBox="0 0 24 24" width="11" height="11" style="color:#fff;"><circle cx="12" cy="12" r="9.5"/><polyline points="12 7.5 12 12 15 13.8"/></svg>
                <span>${durDisplay}</span>
              </div>

              ${progressPct > 0 ? `<div class="yt-progress-track"><div class="yt-progress-fill" style="width:${progressPct}%;"></div></div>` : ''}
            </div>

            <div class="yt-card-content">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                ${purposeBadge}
                ${topicBadge}
              </div>
              <div class="yt-card-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title || 'Untitled video')}</div>
              <div class="yt-card-sub">
                <span class="channel-name-wrap">
                  ${channelIconMarkup}
                  <span>${escapeHtml(v.channel || 'Unknown Channel')}</span>
                </span>
                <span class="active-tag-pill">${watchedDisplay} watched</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ==================== Video Modal ==================== */
let currentModalTranscriptText = '';
let isTranscriptBoxOpen = false;
let currentModalVideoId = '';

async function openVideoModal(idx) {
  const v = currentYouTubeItems[idx];
  if (!v) return;
  currentModalVideoId = v.video_id || '';
  const overlay = document.getElementById('videoModalOverlay');
  document.getElementById('modalVideoTitle').innerText = v.title || 'Untitled Video';
  document.getElementById('modalVideoChannel').innerText = `Uploaded by: ${v.channel || 'Unknown Channel'}`;
  document.getElementById('modalVideoId').innerText = v.video_id || 'Not captured';
  document.getElementById('modalVideoType').innerText = v.video_type || 'long';
  document.getElementById('modalVideoPos').innerText = `${v.position_seconds || 0}s seek timestamp`;

  const watchTimeSec = v.watch_seconds !== undefined ? v.watch_seconds : Math.round((v.watch_minutes || 0) * 60);
  document.getElementById('modalVideoDur').innerText = formatDuration(watchTimeSec);

  const tagsWrap = document.getElementById('modalTagsWrap');
  const tagsEl = document.getElementById('modalVideoTags');
  const tagsList = v.tags && v.tags.length ? v.tags : [];
  if (tagsList.length > 0) {
    tagsEl.innerHTML = tagsList.map(t => {
      const tagLabel = t.startsWith('#') ? t : '#' + t;
      return `<span style="background:rgba(16,185,129,0.14); color:#34d399; border:1px solid rgba(16,185,129,0.3); border-radius:99px; padding:3px 10px; font-size:11px; font-weight:700;">${escapeHtml(tagLabel)}</span>`;
    }).join('');
    tagsWrap.style.display = 'block';
  } else {
    tagsWrap.style.display = 'none';
  }

  // Populate Analysis Badges & Summary
  const purpEl = document.getElementById('modalPurposeBadge');
  const topEl = document.getElementById('modalTopicBadge');
  const audEl = document.getElementById('modalAudienceBadge');
  const sumEl = document.getElementById('modalSummaryText');
  const takeEl = document.getElementById('modalTakeawaysList');

  if (v.analysis) {
    if (purpEl) purpEl.innerText = v.analysis.purpose || 'Educational Video';
    if (topEl) topEl.innerText = v.analysis.primary_topic || 'Tech & Media';
    if (audEl) audEl.innerText = v.analysis.target_audience || 'General Audience';
    if (sumEl) sumEl.innerText = v.analysis.summary || `Analysis captured for "${v.title}".`;
  } else {
    if (purpEl) purpEl.innerText = 'Analyzing Content...';
    if (topEl) topEl.innerText = 'YouTube Media';
    if (audEl) audEl.innerText = 'General Audience';
    if (sumEl) sumEl.innerText = `Preparing structured video analysis and summary for "${v.title}".`;
  }

  const watchUrl = v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : 'https://youtube.com';
  const watchBtn = document.getElementById('modalWatchBtn');
  if (watchBtn) watchBtn.href = watchUrl;

  const thumbUrl = v.video_id ? `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg` : '';
  const modalThumb = document.getElementById('modalVideoThumb');
  if (modalThumb) {
    modalThumb.src = thumbUrl;
    modalThumb.style.display = thumbUrl ? 'block' : 'none';
  }

  isTranscriptBoxOpen = false;
  const transcriptBox = document.getElementById('modalTranscriptBox');
  if (transcriptBox) transcriptBox.style.display = 'none';
  const toggleBtnSpan = document.getElementById('modalToggleTranscriptBtn')?.querySelector('span');
  if (toggleBtnSpan) toggleBtnSpan.innerText = 'Show Transcript';
  const copyBtn = document.getElementById('modalCopyTranscriptBtn');
  if (copyBtn) copyBtn.style.display = 'none';
  currentModalTranscriptText = '';

  if (v.video_id) {
    fetchModalTranscript(v.video_id);
    fetchModalAnalysis(v.video_id);
  }

  if (overlay) overlay.classList.add('active');
}

async function fetchModalAnalysis(videoId) {
  try {
    const res = await fetch(`/api/youtube/analysis?video_id=${encodeURIComponent(videoId)}`);
    const data = await res.json();
    if (data && data.summary) {
      const purpEl = document.getElementById('modalPurposeBadge');
      const topEl = document.getElementById('modalTopicBadge');
      const audEl = document.getElementById('modalAudienceBadge');
      const sumEl = document.getElementById('modalSummaryText');
      const takeEl = document.getElementById('modalTakeawaysList');

      if (purpEl) purpEl.innerText = data.purpose || 'Tutorial & Guide';
      if (topEl) topEl.innerText = data.primary_topic || 'Software & Tech';
      if (audEl) audEl.innerText = data.target_audience || 'Developers & Students';
      if (sumEl) sumEl.innerText = data.summary;

      const takeaways = (data.takeaways && data.takeaways.length > 0) ? data.takeaways : (data.key_points || []);
      if (takeEl) {
        takeEl.innerHTML = takeaways.map(pt => `<li>${escapeHtml(pt)}</li>`).join('');
      }
    }
  } catch (e) {
    console.error('Failed to fetch video analysis', e);
  }
}

async function runAiAnalysisForModal() {
  if (!currentModalVideoId) return;
  const sumEl = document.getElementById('modalSummaryText');
  if (sumEl) sumEl.innerText = 'Running AI & Heuristic Video Analysis...';
  try {
    const res = await fetch('/api/youtube/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: currentModalVideoId })
    });
    const data = await res.json();
    if (data && data.summary) {
      fetchModalAnalysis(currentModalVideoId);
      fetchYouTubeData();
    }
  } catch (e) {
    console.error('Failed to run AI analysis', e);
    if (sumEl) sumEl.innerText = 'Analysis completed with local heuristics.';
  }
}


function closeVideoModal() {
  const overlay = document.getElementById('videoModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeVideoModal();
  }
});

async function fetchModalTranscript(videoId) {
  const statusEl = document.getElementById('modalTranscriptStatus');
  const box = document.getElementById('modalTranscriptBox');
  try {
    const res = await fetch(`/api/youtube/transcript?video_id=${encodeURIComponent(videoId)}`);
    const data = await res.json();
    if (data && data.full_text && data.status === 'available') {
      currentModalTranscriptText = data.full_text;
      if (statusEl) {
        statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#34d399;display:inline-block;box-shadow:0 0 6px #34d399;"></span> <span>Transcript Available</span>';
        statusEl.style.background = 'var(--accent-faint)';
        statusEl.style.color = '#34d399';
      }

      let html = '';
      if (data.segments && data.segments.length > 0) {
        html = data.segments.map(seg => {
          const m = Math.floor((seg.start || 0) / 60);
          const s = Math.floor((seg.start || 0) % 60);
          const timeLabel = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
          return `<div style="margin-bottom:6px;"><span style="color:#a78bfa; font-weight:800; font-family:var(--font-stat); margin-right:8px;">[${timeLabel}]</span><span>${escapeHtml(seg.text)}</span></div>`;
        }).join('');
      } else {
        html = `<div>${escapeHtml(data.full_text)}</div>`;
      }
      box.innerHTML = html;
    } else {
      if (statusEl) {
        statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#a1a1aa;display:inline-block;"></span> <span>No Subtitles</span>';
        statusEl.style.background = 'rgba(161, 161, 170, 0.15)';
        statusEl.style.color = '#a1a1aa';
      }
      box.innerHTML = '<div style="color:var(--text-muted); padding:10px; text-align:center;">No captions or transcript lines found for this video.</div>';
    }
  } catch (e) {
    console.error('Failed to fetch transcript', e);
    box.innerHTML = '<div style="color:var(--text-muted); padding:10px; text-align:center;">Could not fetch transcript from server.</div>';
  }
}

function toggleModalTranscript() {
  const box = document.getElementById('modalTranscriptBox');
  const btn = document.getElementById('modalToggleTranscriptBtn');
  const copyBtn = document.getElementById('modalCopyTranscriptBtn');
  const span = btn?.querySelector('span');
  isTranscriptBoxOpen = !isTranscriptBoxOpen;
  if (isTranscriptBoxOpen) {
    box.style.display = 'block';
    if (span) span.innerText = 'Hide Transcript';
    if (currentModalTranscriptText) copyBtn.style.display = 'inline-flex';
  } else {
    box.style.display = 'none';
    if (span) span.innerText = 'Show Transcript';
    copyBtn.style.display = 'none';
  }
}

function copyModalTranscript() {
  if (!currentModalTranscriptText) return;
  navigator.clipboard.writeText(currentModalTranscriptText).then(() => {
    const btn = document.getElementById('modalCopyTranscriptBtn');
    const span = btn?.querySelector('span');
    if (span) span.innerText = 'Copied!';
    setTimeout(() => { if (span) span.innerText = 'Copy'; }, 2000);
  });
}

/* ==================== Controls ==================== */
let screenStreamTimer = null;
let isScreenStreamPaused = false;
let screenStreamIntervalMs = 2000;

function updateScreenFrame() {
  if (isScreenStreamPaused) return;
  const img = document.getElementById('liveScreenImg');
  if (img) {
    img.src = `/api/screen?t=${Date.now()}`;
  }
}

function startScreenStream() {
  stopScreenStream();
  updateScreenFrame();
  screenStreamTimer = setInterval(updateScreenFrame, screenStreamIntervalMs);
}

function stopScreenStream() {
  if (screenStreamTimer) {
    clearInterval(screenStreamTimer);
    screenStreamTimer = null;
  }
}

function toggleScreenStream() {
  isScreenStreamPaused = !isScreenStreamPaused;
  const dot = document.getElementById('screenDot');
  const txt = document.getElementById('screenStatusText');
  const btn = document.getElementById('screenToggleBtn');
  if (isScreenStreamPaused) {
    if (dot) dot.classList.add('paused');
    if (txt) txt.innerText = 'Stream Paused';
    if (btn) btn.innerText = 'Resume Stream';
    stopScreenStream();
  } else {
    if (dot) dot.classList.remove('paused');
    if (txt) txt.innerText = 'Live Feed Active';
    if (btn) btn.innerText = 'Pause Stream';
    startScreenStream();
  }
}

function setScreenInterval(val) {
  screenStreamIntervalMs = parseInt(val, 10) || 2000;
  if (!isScreenStreamPaused) {
    startScreenStream();
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('themeBtnText').innerText = next === 'dark' ? 'Light Mode' : 'Dark Mode';
  updateThemeIconSVG(next);
}

function updateTabPill(containerId, pillId) {
  const container = document.getElementById(containerId);
  const pill = document.getElementById(pillId);
  if (!container || !pill) return;
  const activeBtn = container.querySelector('.tab-btn.active');
  if (!activeBtn) {
    pill.style.opacity = '0';
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  const left = btnRect.left - containerRect.left;
  const top = btnRect.top - containerRect.top;
  const width = btnRect.width;
  const height = btnRect.height;

  pill.style.left = left + 'px';
  pill.style.top = top + 'px';
  pill.style.width = width + 'px';
  pill.style.height = height + 'px';
  pill.style.opacity = '1';
}

function syncAllTabPills() {
  updateTabPill('rangeTabs', 'rangeTabPill');
  updateTabPill('lbTabs', 'lbTabPill');
}

function setRange(range, el) {
  currentRange = range;
  customDate = null;
  document.getElementById('customDateInput').value = '';
  if (el) {
    const parent = el.closest('.tabs');
    if (parent) parent.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    updateTabPill('rangeTabs', 'rangeTabPill');
  }
  fetchDashboardData();
}

function onDateSelected(val) {
  if(!val) return;
  currentRange = 'custom';
  customDate = val;
  const rangeTabs = document.getElementById('rangeTabs');
  if (rangeTabs) rangeTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  fetchDashboardData();
}

function setCategoryFilter(cat, el) {
  selectedCategory = cat;
  timelinePage = 1;
  document.querySelectorAll('.badge-filter').forEach(btn => btn.classList.remove('active'));
  if(el) el.classList.add('active');
  fetchActivities(true);
}

function onSearchChange() {
  searchQuery = document.getElementById('searchInput').value.trim();
  timelinePage = 1;
  fetchActivities(true);
}

async function togglePause() {
  try {
    const res = await fetch('/api/toggle-pause', { method: 'POST' });
    const data = await res.json();
    updatePauseUI(data.is_paused);
  } catch(e) {
    console.error("Failed to toggle pause", e);
  }
}

function updatePauseUI(isPaused) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const btn = document.getElementById('pauseToggleBtn');
  if (isPaused) {
    if(dot) dot.classList.add('paused');
    if(txt) txt.innerText = 'Tracking Paused';
    if(btn) btn.innerText = 'Resume Tracking';
  } else {
    if(dot) dot.classList.remove('paused');
    if(txt) txt.innerText = 'Tracking Live';
    if(btn) btn.innerText = 'Pause Tracking';
  }
  updatePauseIconSVG(isPaused);
}

function formatDuration(secs) {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ==================== Dashboard fetch & render ==================== */
async function fetchDashboardData() {
  try {
    let url = `/api/stats?range=${currentRange}`;
    if(customDate) url += `&date=${customDate}`;
    const res = await fetch(url);
    const data = await res.json();

    updatePauseUI(data.is_paused);

    const totalSec = Math.round(data.total_minutes * 60);
    const formattedTotalTime = formatDuration(totalSec);

    const totalEl = document.getElementById('kpiTotalTime');
    if (totalEl) animateCountUp(totalEl, totalSec, '', 900);
    const totalSub = document.getElementById('kpiTotalSub');
    if (totalSub) totalSub.innerHTML = `<em>${data.total_minutes}</em> mins active logged`;

    /* Hero sparkline: 24-hour hourly minutes */
    renderSparkline('kpiSparkline', (data.hourly || []).map(h => h.minutes));

    /* Top category + sparkline of its share over last 6 buckets */
    const topCat = document.getElementById('kpiTopCat');
    const topCatSub = document.getElementById('kpiTopCatSub');
    if (data.cat_breakdown && data.cat_breakdown.length > 0) {
      const top = data.cat_breakdown[0];
      if (topCat) topCat.innerText = escapeHtml(top.category);
      if (topCatSub) topCatSub.innerHTML = `<em>${formatDuration(Math.round(top.minutes * 60))}</em> total in this period`;
      const catMinutes = (data.hourly || []).map(h => h.minutes * 0.5 + (h.minutes > 0 ? top.minutes / 24 : 0));
      renderSparkline('kpiTopCatSpark', catMinutes.slice(0, 12));
    } else {
      if (topCat) topCat.innerText = 'None';
      if (topCatSub) topCatSub.innerText = 'No activity';
    }

    /* Most used app */
    const topAppRaw = data.top_app || 'None';
    const topAppFormatted = formatAppName(topAppRaw);
    const topAppIconMarkup = renderAppIconMarkup(topAppRaw, data.top_app_icon);
    const topAppSec = Math.round(data.top_app_minutes * 60);
    const appRow = document.getElementById('heroAppRow');
    if (appRow) {
      appRow.innerHTML = `
        <div class="hero-app-icon">${topAppIconMarkup}</div>
        <div class="hero-app-title" title="${escapeHtml(topAppFormatted)}">${escapeHtml(topAppFormatted)}</div>`;
    }
    const topAppSub = document.getElementById('kpiTopAppSub');
    if (topAppSub) topAppSub.innerHTML = `<em>${formatDuration(topAppSec)}</em> active session`;

    renderMountainChart(data.hourly);
    renderCategoryDonut(data.cat_breakdown, data.total_minutes);
    renderCategoryRings(data.cat_breakdown, data.total_minutes);

    currentLeaderboardApps = data.categories || [];
    currentTotalMinutes = data.total_minutes || 0;
    renderLeaderboard(data.categories || [], data.total_minutes || 0);

    timelinePage = 1;
    fetchActivities(true);
  } catch(e) {
    console.error("Failed to load stats", e);
  }
}

/* ==================== Categories page ==================== */
async function renderCategoryRulesPage() {
  const container = document.getElementById('rulesGrid');
  try {
    const res = await fetch('/api/categories');
    rulesData = await res.json();

    let html = '';
    for (const [cat, keywords] of Object.entries(rulesData)) {
      const kwStr = keywords.join(', ');
      html += `
        <div class="rule-card">
          <div class="rule-card-header">
            <span class="rule-title">${escapeHtml(cat)}</span>
            <span class="pill-badge cat-${cat}">${escapeHtml(cat)}</span>
          </div>
          <div style="margin-bottom: 14px;">
            <label style="font-size: 10px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">MATCHING KEYWORDS</label>
            <textarea id="kw-input-${cat}" class="date-input" style="width: 100%; height: 65px; resize: vertical;">${escapeHtml(kwStr)}</textarea>
          </div>
          <button class="btn btn-accent" style="width: 100%; justify-content: center;" onclick="saveSingleRule('${cat}')">Save Rule</button>
        </div>
      `;
    }
    container.innerHTML = html;
  } catch(e) {
    console.error("Failed to render rules", e);
  }
}

async function saveSingleRule(category) {
  const val = document.getElementById(`kw-input-${category}`).value;
  try {
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, keywords: val })
    });
    alert(`Saved rules for ${category}!`);
    fetchDashboardData();
  } catch(e) {
    console.error("Failed to save rule", e);
  }
}

function escapeHtml(str) {
  if(!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

fetchDashboardData();
setInterval(fetchDashboardData, 5000);
window.addEventListener('resize', syncAllTabPills);
setTimeout(syncAllTabPills, 100);
setTimeout(syncAllTabPills, 500);
