let currentRange = 'today';
let customDate = null;
let selectedCategory = 'all';
let searchQuery = '';
let timelinePage = 1;
const timelineLimit = 20;
let hasMoreActivities = false;
let rulesData = {};
let focusChartInstance = null;
let hourlyApexChartInstance = null;
let donutApexChartInstance = null;
let currentHourlyChartType = 'area'; // 'area', 'line', 'column'
let cachedHourlyData = [];
const statsResponseCache = {}; // Client-side fast memory cache

// Canvas Particles Ambient Background Animation
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const particleCount = Math.min(45, Math.floor(width / 30));

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.2
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(16, 185, 129, ${p.alpha})`;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(16, 185, 129, ${0.15 * (1 - dist / 130)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(render);
  }
  render();
}

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
    return `<i class="fa-brands fa-python text-lg text-cyan-400"></i>`;
  }
  if (name.includes('chrome')) {
    return `<i class="fa-brands fa-chrome text-lg text-emerald-400"></i>`;
  }
  if (name.includes('brave')) {
    return `<i class="fa-solid fa-shield-halved text-lg text-amber-500"></i>`;
  }
  if (name.includes('code') || name.includes('visual studio')) {
    return `<i class="fa-solid fa-code text-lg text-cyan-400"></i>`;
  }
  if (name.includes('telegram')) {
    return `<i class="fa-brands fa-telegram text-lg text-cyan-400"></i>`;
  }
  if (name.includes('word') || name.includes('office')) {
    return `<i class="fa-solid fa-file-word text-lg text-blue-500"></i>`;
  }
  if (name.includes('spotify')) {
    return `<i class="fa-brands fa-spotify text-lg text-emerald-500"></i>`;
  }
  if (name.includes('explorer')) {
    return `<i class="fa-solid fa-folder-open text-lg text-amber-500"></i>`;
  }
  if (name.includes('figma')) {
    return `<i class="fa-brands fa-figma text-lg text-purple-400"></i>`;
  }
  if (name.includes('github')) {
    return `<i class="fa-brands fa-github text-lg text-white"></i>`;
  }
  if (name.includes('slack') || name.includes('discord')) {
    return `<i class="fa-brands fa-discord text-lg text-indigo-400"></i>`;
  }
  return `<i class="fa-solid fa-window-maximize text-lg text-emerald-400"></i>`;
}

// Single source of truth for the mobile breakpoint (must match styles.css @media max-width: 1100px).
const mobileMediaQuery = window.matchMedia('(max-width: 1100px)');

function isMobileView() {
  return mobileMediaQuery.matches;
}

function toggleSidebarSlider() {
  const shell = document.getElementById('appShell');
  // On mobile the sidebar is an off-canvas drawer; the toggle opens/closes it.
  if (isMobileView()) {
    toggleMobileNav();
    return;
  }
  const isCollapsed = shell.classList.toggle('collapsed');
  const icon = document.getElementById('toggleIcon');
  if (isCollapsed) {
    icon.className = 'fa-solid fa-chevron-right text-xs';
  } else {
    icon.className = 'fa-solid fa-chevron-left text-xs';
  }
  // Sidebar width animates over 0.3s; measure the sliding tab pills once it settles.
  setTimeout(syncAllTabPills, 350);
}

function toggleMobileNav() {
  const shell = document.getElementById('appShell');
  const open = shell.classList.toggle('nav-open');
  document.body.style.overflow = open ? 'hidden' : '';
  const btn = document.querySelector('.mobile-nav-btn');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeMobileNav() {
  const shell = document.getElementById('appShell');
  shell.classList.remove('nav-open');
  document.body.style.overflow = '';
  const btn = document.querySelector('.mobile-nav-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function switchPage(pageId, el) {
  closeMobileNav();
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if(el) el.classList.add('active');

  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
  document.getElementById(`view-${pageId}`).classList.add('active');

  const headings = {
    'overview': { title: 'Overview Analytics', subtitle: 'Real-time productivity summary powered by ApexCharts.' },
    'timeline': { title: 'Timeline Feed', subtitle: 'Detailed chronological log of application window activity.' },
    'categories': { title: 'Category Rules', subtitle: 'Customize application categorization mapping.' },
    'youtube': { title: 'YouTube Intelligence', subtitle: 'Video sessions, long-form learning and watch patterns.' },
    'livescreen': { title: 'Live Desktop Screen', subtitle: 'Real-time monitor screen capture feed.' },
    'pattern': { title: 'Pattern & Vision Research', subtitle: 'Standard UI component library, ApexCharts metrics & design tokens.' },
    'settings': { title: 'Settings & Control', subtitle: 'Manage background collector status and application settings.' }
  };

  if(headings[pageId]) {
    document.getElementById('pageHeading').innerText = headings[pageId].title;
    document.getElementById('pageSubheading').innerText = headings[pageId].subtitle;
  }

  if(pageId === 'pattern') renderPatternLibrary();
  if(pageId === 'categories') renderCategoryRulesPage();
  if(pageId === 'youtube') fetchYouTubeData();
  if(pageId === 'livescreen') {
    startScreenStream();
  } else {
    stopScreenStream();
  }
}

function isYouTubeViewActive() {
  const view = document.getElementById('view-youtube');
  return !!(view && view.classList.contains('active'));
}

function updateThemeUI(mode) {
  const label = document.getElementById('themeToggleLabel');
  const iconWrap = document.getElementById('themeIconWrap');
  if (label) label.textContent = mode === 'light' ? 'White' : 'Dark';
  if (iconWrap) {
    if (mode === 'light') {
      iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    } else {
      iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  }
}

function setThemeMode(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  updateThemeUI(mode);
  
  const isLight = mode === 'light';

  if (hourlyApexChartInstance) {
    hourlyApexChartInstance.updateOptions({
      theme: { mode: isLight ? 'light' : 'dark' },
      grid: { borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)' },
      xaxis: { labels: { style: { colors: isLight ? '#475569' : '#94a3b8' } } },
      yaxis: { labels: { style: { colors: isLight ? '#64748b' : '#64748b' } } }
    }, false, false);
  }

  if (donutApexChartInstance) {
    donutApexChartInstance.updateOptions({
      stroke: { colors: [isLight ? '#ffffff' : '#0b1a12'] },
      plotOptions: {
        pie: {
          donut: {
            labels: {
              total: { color: isLight ? '#64748b' : '#64748b' },
              value: { color: isLight ? '#0f172a' : '#f0fdf4' }
            }
          }
        }
      }
    }, false, false);
  }

  if (isYouTubeViewActive()) renderYouTubeFormatSplit(currentYouTubeItems);
  setTimeout(syncAllTabPills, 50);
  try { localStorage.setItem('daylens_theme', mode); } catch(e) {}
}

function toggleThemeWithWaveFX(event) {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  const x = event ? (event.clientX || window.innerWidth / 2) : window.innerWidth / 2;
  const y = event ? (event.clientY || 40) : 40;

  if (document.startViewTransition) {
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      setThemeMode(newTheme);
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`
      ];
      document.documentElement.animate(
        {
          clipPath: newTheme === 'light' ? clipPath : clipPath.reverse()
        },
        {
          duration: 550,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: newTheme === 'light' ? '::view-transition-new(root)' : '::view-transition-old(root)'
        }
      );
    });
  } else {
    createCSSWaveRipple(x, y, newTheme, () => setThemeMode(newTheme));
  }
}

function createCSSWaveRipple(x, y, targetTheme, callback) {
  const ripple = document.createElement('div');
  const maxDim = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  ) * 2.2;

  ripple.style.cssText = `
    position: fixed;
    top: ${y}px;
    left: ${x}px;
    width: ${maxDim}px;
    height: ${maxDim}px;
    background: ${targetTheme === 'light' ? '#f4f6f8' : '#050c08'};
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    z-index: 999999;
  `;

  document.body.appendChild(ripple);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ripple.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  });

  setTimeout(() => {
    if (callback) callback();
    setTimeout(() => ripple.remove(), 100);
  }, 480);
}

function showToast(title, desc, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'ui-toast animate__animated animate__fadeInUp';
  toast.innerHTML = `
    <i class="fa-solid fa-circle-check text-emerald-400 text-base"></i>
    <div>
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-desc">${escapeHtml(desc)}</div>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function setHourlyChartType(type, el) {
  currentHourlyChartType = type;
  if (el) {
    const parent = el.closest('.ui-tabs');
    if (parent) parent.querySelectorAll('.ui-tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    updateTabPill('hourlyChartTabs', 'hourlyChartPill');
  }
  if (cachedHourlyData) {
    renderHistogram(cachedHourlyData);
  }
}

function renderPatternLibrary() {
  const container = document.getElementById('patternContainer');
  if (!container) return;

  container.innerHTML = `
    <!-- ApexCharts Productivity Vision Radar -->
    <div class="glass-card mb-6">
      <div class="section-head">
        <span><i class="fa-solid fa-chart-pie text-emerald-400 mr-2"></i> ApexCharts Productivity Radar</span>
        <span class="pill-badge cat-work">ApexCharts CDN</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div id="apexRadarContainer" style="height: 240px;"></div>

        <div>
          <div class="text-sm font-bold mb-2">Deep Focus Analysis</div>
          <div class="text-xs text-slate-400 mb-4">Real-time productivity radar mapping coding, research, utility, and entertainment breakdown.</div>
          <div class="flex flex-wrap gap-2 mb-4">
            <span class="pill-badge cat-work"><i class="fa-solid fa-code mr-1"></i> Coding: 88%</span>
            <span class="pill-badge cat-utility"><i class="fa-solid fa-book-open mr-1"></i> Research: 74%</span>
            <span class="pill-badge cat-social"><i class="fa-solid fa-comments mr-1"></i> Chat: 22%</span>
          </div>
          <button class="ui-btn ui-btn-primary" onclick="triggerConfettiFX()"><i class="fa-solid fa-sparkles mr-1"></i> Trigger Confetti FX</button>
        </div>
      </div>
    </div>

    <!-- Design Tokens & Palette Swatches -->
    <div class="glass-card mb-6">
      <div class="section-head"><i class="fa-solid fa-palette text-cyan-400 mr-2"></i> Tailwind & CSS Design Tokens</div>
      <div class="token-swatches">
        <div class="swatch-item" onclick="navigator.clipboard.writeText('#10b981'); showToast('Copied Color', '#10b981 copied!');">
          <div class="swatch-color" style="background:#10b981;"></div>
          <div class="swatch-name">Primary Emerald</div>
          <div class="swatch-hex">#10b981</div>
        </div>
        <div class="swatch-item" onclick="navigator.clipboard.writeText('#06b6d4'); showToast('Copied Color', '#06b6d4 copied!');">
          <div class="swatch-color" style="background:#06b6d4;"></div>
          <div class="swatch-name">Cyan Accent</div>
          <div class="swatch-hex">#06b6d4</div>
        </div>
        <div class="swatch-item" onclick="navigator.clipboard.writeText('#f59e0b'); showToast('Copied Color', '#f59e0b copied!');">
          <div class="swatch-color" style="background:#f59e0b;"></div>
          <div class="swatch-name">Amber Idle</div>
          <div class="swatch-hex">#f59e0b</div>
        </div>
        <div class="swatch-item" onclick="navigator.clipboard.writeText('#a855f7'); showToast('Copied Color', '#a855f7 copied!');">
          <div class="swatch-color" style="background:#a855f7;"></div>
          <div class="swatch-name">Purple Social</div>
          <div class="swatch-hex">#a855f7</div>
        </div>
      </div>
    </div>

    <!-- FontAwesome & Icon Matrix -->
    <div class="glass-card">
      <div class="section-head"><i class="fa-solid fa-icons text-amber-400 mr-2"></i> FontAwesome 6 & Lucide Icon Matrix</div>
      <div class="icon-matrix">
        <div class="icon-box" onclick="showToast('FontAwesome', 'fa-chart-pie')">
          <i class="fa-solid fa-chart-pie text-xl text-emerald-400"></i>
          <span class="icon-box-label">Chart Pie</span>
        </div>
        <div class="icon-box" onclick="showToast('FontAwesome', 'fa-clock-rotate-left')">
          <i class="fa-solid fa-clock-rotate-left text-xl text-cyan-400"></i>
          <span class="icon-box-label">Timeline</span>
        </div>
        <div class="icon-box" onclick="showToast('FontAwesome', 'fa-youtube')">
          <i class="fa-brands fa-youtube text-xl text-red-500"></i>
          <span class="icon-box-label">YouTube</span>
        </div>
        <div class="icon-box" onclick="showToast('FontAwesome', 'fa-code')">
          <i class="fa-solid fa-code text-xl text-indigo-400"></i>
          <span class="icon-box-label">Coding</span>
        </div>
        <div class="icon-box" onclick="showToast('FontAwesome', 'fa-shield-halved')">
          <i class="fa-solid fa-shield-halved text-xl text-amber-400"></i>
          <span class="icon-box-label">Brave</span>
        </div>
        <div class="icon-box" onclick="showToast('FontAwesome', 'fa-python')">
          <i class="fa-brands fa-python text-xl text-cyan-400"></i>
          <span class="icon-box-label">Python</span>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const el = document.getElementById('apexRadarContainer');
    if (el && window.ApexCharts) {
      const options = {
        chart: { type: 'radar', height: 230, background: 'transparent', toolbar: { show: false } },
        series: [{ name: 'Focus Level', data: [88, 74, 42, 25, 60] }],
        labels: ['Coding', 'Research', 'Communication', 'Entertainment', 'Utility'],
        colors: ['#10b981'],
        stroke: { width: 2 },
        fill: { opacity: 0.3 },
        markers: { size: 4, colors: ['#10b981'] },
        theme: { mode: 'dark' }
      };
      new ApexCharts(el, options).render();
    }
  }, 100);
}

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

/* ============================================================
   YOUTUBE INTELLIGENCE
   ============================================================ */

let currentYouTubeItems = [];
let currentYouTubeFilter = 'all';
let ytSearchQuery = '';
let ytSortMode = 'recent';
let ytViewMode = 'grid';
let ytFormatChartInstance = null;
let ytHasLoadedOnce = false;
let ytChromeReady = false;

/* --- Animated SVG icon set -------------------------------------------------
   Each entry is the inner markup of a 24x24 stroke icon. Parts tagged with
   a-* classes animate; motion only runs inside a tile marked .is-live or
   while an .ico-host ancestor is hovered (see styles.css).
--------------------------------------------------------------------------- */
const SVG_ICONS = {
  youtube:   `<circle class="a-wave" cx="12" cy="12" r="10.6"/><rect x="2" y="4.8" width="20" height="14.4" rx="4.6"/><path class="solid a-beat" d="M10.4 9.1 15.6 12l-5.2 2.9z"/>`,
  clock:     `<circle cx="12" cy="12" r="8.6"/><path class="pivot a-spin" d="M12 12V9"/><path class="pivot a-fast" d="M12 12h4.2"/>`,
  film:      `<rect x="2.8" y="5" width="18.4" height="14" rx="3.4"/><path class="thin a-flash" d="M2.8 9.6h18.4M2.8 14.4h18.4"/><path class="thin a-flash d1" d="M8 5v14M16 5v14"/>`,
  bolt:      `<path class="a-beat" d="M13.6 2.4 5.2 12.9h5.6l-1.2 8.7L18 11.1h-5.6z"/>`,
  tower:     `<circle class="solid a-beat" cx="12" cy="9.2" r="2.1"/><path class="a-wave" d="M8.1 5.3a5.5 5.5 0 0 0 0 7.8"/><path class="a-wave d1" d="M15.9 5.3a5.5 5.5 0 0 1 0 7.8"/><path class="a-wave d2" d="M5.4 2.6a9.3 9.3 0 0 0 0 13.2"/><path class="a-wave d3" d="M18.6 2.6a9.3 9.3 0 0 1 0 13.2"/><path d="m10.5 21.4 1.5-9.9 1.5 9.9"/>`,
  layers:    `<path class="a-float" d="m12 2.8 8.4 4.5-8.4 4.5-8.4-4.5z"/><path class="a-float d1" d="m3.6 12 8.4 4.5 8.4-4.5"/><path class="a-float d2" d="m3.6 16.5 8.4 4.5 8.4-4.5"/>`,
  pie:       `<circle cx="12" cy="12" r="8.8"/><path class="solid pivot a-spin" d="M12 3.2A8.8 8.8 0 0 1 20.8 12H12z"/>`,
  eye:       `<g class="a-blink"><path d="M2.4 12S6.1 5.6 12 5.6 21.6 12 21.6 12 17.9 18.4 12 18.4 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="3.1"/></g>`,
  crown:     `<path class="a-float" d="M3.2 17.6 5 6.9l4.4 3.6L12 4.6l2.6 5.9L19 6.9l1.8 10.7z"/><path class="thin" d="M4.4 20.6h15.2"/>`,
  refresh:   `<g class="pivot a-spin"><path d="M20.4 12a8.4 8.4 0 1 1-2.46-5.94"/><path d="M20.8 4v5.1h-5.1"/></g>`,
  trash:     `<path d="M3.6 6.4h16.8"/><path class="a-float" d="M9.2 6.4V4.2a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4v2.2"/><path d="M18.2 6.4 17.4 20a1.8 1.8 0 0 1-1.8 1.7H8.4A1.8 1.8 0 0 1 6.6 20L5.8 6.4"/><path class="thin" d="M10.4 10.8v6.2M13.6 10.8v6.2"/>`,
  grid:      `<rect class="a-float" x="3" y="3" width="7.6" height="7.6" rx="2.2"/><rect class="a-float d1" x="13.4" y="3" width="7.6" height="7.6" rx="2.2"/><rect class="a-float d2" x="3" y="13.4" width="7.6" height="7.6" rx="2.2"/><rect class="a-float d3" x="13.4" y="13.4" width="7.6" height="7.6" rx="2.2"/>`,
  list:      `<path d="M8.4 6h12.2M8.4 12h12.2M8.4 18h12.2"/><circle class="solid a-beat" cx="4" cy="6" r="1.3"/><circle class="solid a-beat d1" cx="4" cy="12" r="1.3"/><circle class="solid a-beat d2" cx="4" cy="18" r="1.3"/>`,
  search:    `<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 4.6 4.6"/>`,
  play:      `<path class="solid" d="M6.6 3.6 20.4 12 6.6 20.4z"/>`,
  captions:  `<rect x="2.4" y="5" width="19.2" height="14" rx="3.6"/><path class="thin" d="M10.2 10.4a2.6 2.6 0 1 0 0 3.4M17.4 10.4a2.6 2.6 0 1 0 0 3.4"/>`,
  signal:    `<path class="a-flash" d="M4.4 19.6v-3.4"/><path class="a-flash d1" d="M9.6 19.6v-7"/><path class="a-flash d2" d="M14.8 19.6v-10.6"/><path class="a-flash d3" d="M20 19.6V4.4"/>`,
  mobile:    `<rect x="6.4" y="2.4" width="11.2" height="19.2" rx="3"/><path class="thin a-flash" d="M10.6 18.6h2.8"/>`,
  library:   `<rect x="2.6" y="6.6" width="18.8" height="14.8" rx="3.6"/><path class="a-float" d="M5.6 6.6V4.4h12.8v2.2"/><path class="solid a-beat" d="M10.4 11.4 15.6 14l-5.2 2.6z"/>`,
  code:      `<path class="a-float" d="m8.4 8.4-4.8 3.6 4.8 3.6"/><path class="a-float d1" d="m15.6 8.4 4.8 3.6-4.8 3.6"/><path class="thin a-flash" d="m13.6 4.4-3.2 15.2"/>`,
  robot:     `<rect x="3.6" y="7.6" width="16.8" height="12.4" rx="4"/><path d="M12 7.6V4.6"/><circle class="solid a-beat" cx="12" cy="3.2" r="1.5"/><circle class="solid a-blink" cx="8.8" cy="13.4" r="1.4"/><circle class="solid a-blink d1" cx="15.2" cy="13.4" r="1.4"/>`,
  gamepad:   `<path d="M7.4 7.6h9.2a5.6 5.6 0 0 1 5.5 6.6l-.6 3.2a2.9 2.9 0 0 1-5.2 1.2l-1.4-1.9H9l-1.4 1.9a2.9 2.9 0 0 1-5.2-1.2l-.6-3.2A5.6 5.6 0 0 1 7.4 7.6Z"/><path class="thin a-flash" d="M6.6 11.6v3.2M5 13.2h3.2"/><circle class="solid a-beat" cx="16.4" cy="12.4" r="1.1"/><circle class="solid a-beat d1" cx="18.6" cy="14.6" r="1.1"/>`,
  story:     `<path class="a-float" d="M3.4 5.4a2 2 0 0 1 2-2h4.2A2.4 2.4 0 0 1 12 5.8v14a2.4 2.4 0 0 0-2.4-1.6H3.4z"/><path class="a-float d1" d="M20.6 5.4a2 2 0 0 0-2-2h-4.2A2.4 2.4 0 0 0 12 5.8v14a2.4 2.4 0 0 1 2.4-1.6h6.2z"/>`,
  shapes:    `<circle class="a-beat" cx="7.4" cy="16.6" r="4.4"/><rect class="a-float" x="12.8" y="12.4" width="8.4" height="8.4" rx="2.4"/><path class="a-float d1" d="m12 2.6 4.6 7.4H7.4z"/>`,
  inbox:     `<path class="a-float" d="M12 3.6v9.6m0 0 3.8-3.8M12 13.2 8.2 9.4"/><path d="M3.6 15.2v3.4a2.4 2.4 0 0 0 2.4 2.4h12a2.4 2.4 0 0 0 2.4-2.4v-3.4"/>`
};

// Semantic key -> icon + tint. One lookup table keeps every icon on the page
// visually consistent; topic keys must match the server's topic labels.
const YT_ICONS = {
  brand:    { name: 'youtube',  tint: 'ico-emerald' },
  clock:    { name: 'clock',    tint: 'ico-emerald' },
  long:     { name: 'film',     tint: 'ico-teal' },
  short:    { name: 'bolt',     tint: 'ico-lime' },
  channel:  { name: 'tower',    tint: 'ico-cyan' },
  topic:    { name: 'layers',   tint: 'ico-emerald' },
  split:    { name: 'pie',      tint: 'ico-teal' },
  library:  { name: 'library',  tint: 'ico-emerald' },
  eye:      { name: 'eye',      tint: 'ico-emerald' },
  crown:    { name: 'crown',    tint: 'ico-amber' },
  signal:   { name: 'signal',   tint: 'ico-emerald' },
  mobile:   { name: 'mobile',   tint: 'ico-lime' },
  captions: { name: 'captions', tint: 'ico-slate' },
  'Coding & Tech':           { name: 'code',    tint: 'ico-cyan' },
  'AI & Tools':              { name: 'robot',   tint: 'ico-emerald' },
  'Gaming & Live':           { name: 'gamepad', tint: 'ico-lime' },
  'Entertainment & Stories': { name: 'story',   tint: 'ico-teal' },
  'Other Topics':            { name: 'shapes',  tint: 'ico-slate' }
};

const YT_TOPIC_COLORS = {
  'Coding & Tech': '#2dd4bf',
  'AI & Tools': '#34d399',
  'Gaming & Live': '#a3e635',
  'Entertainment & Stories': '#4ade80',
  'Other Topics': '#94a3b8'
};

function svgIcon(name) {
  return `<svg class="aicon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SVG_ICONS[name] || SVG_ICONS.shapes}</svg>`;
}

// Icon inside its standard tile. `extra` carries state classes like is-live.
function ytIcon(key, size = 'ico-sm', extra = '') {
  const def = YT_ICONS[key] || YT_ICONS['Other Topics'];
  return `<span class="ico ${size} ${def.tint} ${extra}">${svgIcon(def.name)}</span>`;
}

// Bare glyph (no tile) — used inside buttons, chips and meta rows.
function ytGlyph(name) {
  return `<span class="ico">${svgIcon(name)}</span>`;
}

// Compact clock format for thumbnail badges: 4:07 / 1:04:07
function formatClock(secs) {
  secs = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function currentRangeLabel() {
  if (customDate) return customDate;
  return { today: 'Today', '7d': 'Last 7 Days', '30d': 'Last 30 Days', all: 'All Time' }[currentRange] || 'Today';
}

function channelAvatarUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Channel')}&background=1e293b&color=cbd5e1&bold=true&rounded=true`;
}

function renderChannelAvatar(name, iconUrl) {
  const fallback = channelAvatarUrl(name);
  const src = iconUrl ? escapeHtml(iconUrl) : fallback;
  return `<img src="${src}" class="yt-avatar" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallback}';">`;
}

function panelHead(key, title, note = '') {
  return `${ytIcon(key, 'ico-sm', 'is-live')}<span class="yt-panel-title">${escapeHtml(title)}</span>` +
         (note ? `<span class="yt-panel-note">${escapeHtml(note)}</span>` : '');
}

/* --- Static page chrome (icons that never change) --- */
function initYouTubeChrome() {
  if (ytChromeReady) return;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  set('ytHeroMark', svgIcon('youtube'));
  set('ytRefreshBtn', `${ytGlyph('refresh')}Refresh`);
  set('ytClearBtn', `${ytGlyph('trash')}Clear History`);
  set('ytSearchIcon', svgIcon('search'));

  set('ytHeadChannels', panelHead('channel', 'Top Channels', 'by watch time'));
  set('ytHeadTopics', panelHead('topic', 'Topic Breakdown', 'from titles'));
  set('ytHeadSplit', panelHead('split', 'Format Split'));
  set('ytHeadLibrary', `${panelHead('library', 'Watch Library')}<span class="yt-count" id="ytResultCount"></span>`);

  const filters = [
    { key: 'all', name: 'grid', label: 'All' },
    { key: 'long', name: 'film', label: 'Long Form' },
    { key: 'short', name: 'bolt', label: 'Shorts' }
  ];
  set('ytFilterSeg', filters.map(f =>
    `<button class="ico-host ${f.key === currentYouTubeFilter ? 'active' : ''}" onclick="filterYouTubeCategory('${f.key}', this)">${ytGlyph(f.name)}${f.label}</button>`
  ).join(''));

  set('ytViewToggle',
    `<span class="ico ico-host ${ytViewMode === 'grid' ? 'active' : ''}" id="ytViewGrid" onclick="setYouTubeView('grid')" title="Grid view">${svgIcon('grid')}</span>` +
    `<span class="ico ico-host ${ytViewMode === 'list' ? 'active' : ''}" id="ytViewList" onclick="setYouTubeView('list')" title="List view">${svgIcon('list')}</span>`
  );

  ytChromeReady = true;
}

/* --- Controls --- */
function filterYouTubeCategory(cat, el) {
  currentYouTubeFilter = cat;
  const seg = document.getElementById('ytFilterSeg');
  if (seg) seg.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');
  renderYouTubeVideoList();
}

function setYouTubeSort(mode) {
  ytSortMode = mode;
  renderYouTubeVideoList();
}

function setYouTubeView(mode) {
  ytViewMode = mode;
  const gridBtn = document.getElementById('ytViewGrid');
  const listBtn = document.getElementById('ytViewList');
  if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
  if (listBtn) listBtn.classList.toggle('active', mode === 'list');
  renderYouTubeVideoList();
}

function onYouTubeSearchChange() {
  const input = document.getElementById('ytSearchInput');
  ytSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderYouTubeVideoList();
}

async function clearYouTubeHistory() {
  if (!confirm("Clear all stored YouTube watch history? This deletes videos, sessions and transcripts and cannot be undone.")) return;
  try {
    const res = await fetch('/api/youtube/clear', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      currentYouTubeItems = [];
      ytHasLoadedOnce = false;
      const searchEl = document.getElementById('ytSearchInput');
      if (searchEl) searchEl.value = '';
      ytSearchQuery = '';
      showToast('YouTube History', 'All YouTube watch history cleared.');
      fetchYouTubeData();
    }
  } catch (e) {
    console.error("Failed to clear YouTube history", e);
  }
}

/* --- Data --- */
function showYouTubeSkeleton() {
  const kpis = document.getElementById('youtubeKpis');
  if (kpis) {
    kpis.innerHTML = Array.from({ length: 4 }, () => `
      <div class="yt-kpi" style="grid-column: auto !important; width: 100% !important;">
        <div class="skeleton-shimmer" style="height:38px; width:38px; border-radius:12px;"></div>
        <div class="skeleton-shimmer" style="height:28px; width:58%; margin-top:16px;"></div>
        <div class="skeleton-shimmer" style="height:12px; width:44%; margin-top:10px;"></div>
      </div>
    `).join('');
  }
  const videos = document.getElementById('youtubeVideos');
  if (videos) {
    videos.innerHTML = `<div class="yt-grid">${Array.from({ length: 6 }, () => `
      <div class="glass-card" style="padding:16px; border-radius:18px; display:flex; flex-direction:column; gap:10px;">
        <div class="skeleton-shimmer" style="height:140px; width:100%; border-radius:14px;"></div>
        <div class="skeleton-shimmer" style="height:14px; width:88%; margin-top:4px;"></div>
        <div class="skeleton-shimmer" style="height:11px; width:55%;"></div>
      </div>
    `).join('')}</div>`;
  }
}

async function fetchYouTubeData() {
  initYouTubeChrome();
  if (!currentYouTubeItems || !currentYouTubeItems.length) {
    showYouTubeSkeleton();
  }
  try {
    let url = `/api/youtube?range=${currentRange}`;
    if (customDate) url += `&date=${customDate}`;
    const res = await fetch(url);
    const data = await res.json();

    ytHasLoadedOnce = true;
    currentYouTubeItems = data.items || [];

    const totalSec = data.total_seconds !== undefined
      ? Math.round(data.total_seconds)
      : Math.round((data.total_minutes || 0) * 60);

    renderYouTubeHero(totalSec);
    renderYouTubeKpis(data, totalSec);
    renderYouTubeTopChannels(data.top_channels || []);
    renderYouTubeTopTopics(data.top_topics || []);
    renderYouTubeFormatSplit(currentYouTubeItems);
    renderYouTubeVideoList();
  } catch (e) {
    console.error('YouTube data failed', e);
  }
}

/* --- Sections --- */
function renderYouTubeHero(totalSec) {
  const totalEl = document.getElementById('ytHeroTotal');
  const rangeEl = document.getElementById('ytHeroRange');
  const chipsEl = document.getElementById('ytHeroChips');
  if (totalEl) totalEl.innerText = totalSec > 0 ? formatDuration(totalSec) : '0s';
  if (rangeEl) rangeEl.innerText = currentRangeLabel();
  if (!chipsEl) return;

  const items = currentYouTubeItems || [];
  const channelCount = new Set(items.map(v => v.channel).filter(c => c && c !== 'YouTube Channel')).size;
  const avgSec = items.length ? Math.round(totalSec / items.length) : 0;

  const stats = [
    { key: 'brand', val: String(items.length), label: 'videos tracked' },
    { key: 'channel', val: String(channelCount), label: 'unique channels' },
    { key: 'eye', val: formatDuration(avgSec), label: 'average per video' }
  ];

  chipsEl.innerHTML = stats.map(s => `
    <div class="yt-stat">
      ${ytIcon(s.key, 'ico-sm', 'is-live')}
      <div>
        <div class="yt-stat-val">${escapeHtml(s.val)}</div>
        <div class="yt-stat-key">${s.label}</div>
      </div>
    </div>
  `).join('');
}

function renderYouTubeKpis(data, totalSec) {
  const container = document.getElementById('youtubeKpis');
  if (!container) return;

  const items = currentYouTubeItems || [];
  const longCount = data.long_videos || 0;
  const shortCount = data.shorts || 0;
  const formatTotal = Math.max(1, longCount + shortCount);

  let longSec = 0;
  let shortSec = 0;
  items.forEach(v => {
    const sec = v.watch_seconds !== undefined ? v.watch_seconds : Math.round((v.watch_minutes || 0) * 60);
    if (v.video_type === 'short') shortSec += sec; else longSec += sec;
  });

  const channels = (data.top_channels || []).filter(c => c.channel && c.channel !== 'YouTube Channel');
  const uniqueChannels = new Set(items.map(v => v.channel).filter(c => c && c !== 'YouTube Channel')).size;

  const cards = [
    {
      key: 'clock', mod: 'hero', svg: 'clock', grad: 'linear-gradient(135deg,#059669,#34d399)',
      label: 'Total Watch Time',
      value: totalSec > 0 ? formatDuration(totalSec) : '0s',
      footIcon: 'signal', foot: `${items.length} tracked session${items.length === 1 ? '' : 's'}`,
      meter: 100, color: '#34d399'
    },
    {
      key: 'long', mod: 'long', svg: 'film', grad: 'linear-gradient(135deg,#0d9488,#2dd4bf)',
      label: 'Long Form',
      value: String(longCount),
      footIcon: 'clock', foot: `${formatDuration(longSec)} watched`,
      meter: Math.round((longCount / formatTotal) * 100), color: '#2dd4bf'
    },
    {
      key: 'short', mod: 'short', svg: 'bolt', grad: 'linear-gradient(135deg,#65a30d,#a3e635)',
      label: 'Shorts',
      value: String(shortCount),
      footIcon: 'mobile', foot: `${formatDuration(shortSec)} watched`,
      meter: Math.round((shortCount / formatTotal) * 100), color: '#a3e635'
    },
    {
      key: 'channel', mod: 'channel', svg: 'tower', grad: 'linear-gradient(135deg,#047857,#6ee7b7)',
      label: 'Channels',
      value: String(uniqueChannels),
      footIcon: 'crown', foot: channels.length ? `Top: ${channels[0].channel}` : 'No channel data yet',
      meter: uniqueChannels ? Math.min(100, uniqueChannels * 12) : 0, color: '#6ee7b7'
    }
  ];

  container.innerHTML = cards.map(c => `
    <div class="yt-kpi ico-host yt-kpi--${c.mod}" style="grid-column: auto !important; width: 100% !important;">
      <div class="yt-kpi-head">
        <span class="ico ico-md yt-kpi-tile" style="background:${c.grad};">${svgIcon(c.svg)}</span>
        <span class="yt-kpi-label">${c.label}</span>
      </div>
      <div class="yt-kpi-value">${escapeHtml(c.value)}</div>
      <div class="yt-kpi-foot">${ytGlyph(c.footIcon)}<span title="${escapeHtml(c.foot)}">${escapeHtml(c.foot)}</span></div>
      <div class="yt-meter"><span style="width:${Math.max(0, Math.min(100, c.meter))}%; background:${c.color};"></span></div>
    </div>
  `).join('');
}

function ytEmptyState(iconName, title, message) {
  return `
    <div class="yt-empty">
      <span class="ico ico-lg ico-slate is-live">${svgIcon(iconName)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderYouTubeTopChannels(channels) {
  const container = document.getElementById('youtubeTopChannels');
  if (!container) return;

  const filtered = (channels || []).filter(c => c.channel && c.channel !== 'YouTube Channel' && c.channel !== 'Unknown Channel');
  if (!filtered.length) {
    container.innerHTML = ytEmptyState('tower', 'No channels yet',
      'Channel names arrive with the browser connector once you watch a video.');
    return;
  }

  const totalSec = Math.max(1, filtered.reduce((s, c) => s + (c.watch_seconds || 0), 0));
  container.innerHTML = filtered.map((ch, idx) => {
    const rankClass = ['top-1', 'top-2', 'top-3'][idx] || '';
    const count = ch.video_count || 0;
    const secs = ch.watch_seconds || 0;
    const pct = Math.round((secs / totalSec) * 100);
    return `
      <div class="yt-row ico-host">
        <span class="yt-rank ${rankClass}">${idx + 1}</span>
        <span class="yt-avatar-wrap">${renderChannelAvatar(ch.channel, ch.channel_icon)}</span>
        <div class="yt-row-main">
          <div class="yt-row-top">
            <span class="yt-row-name" title="${escapeHtml(ch.channel)}">${escapeHtml(ch.channel)}</span>
            <span class="yt-row-val">${formatDuration(secs)}</span>
          </div>
          <div class="yt-row-sub">${count} video${count === 1 ? '' : 's'} watched · ${pct}% of time</div>
          <div class="yt-row-bar"><b style="width:${Math.max(2, pct)}%"></b></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderYouTubeTopTopics(topics) {
  const container = document.getElementById('youtubeTopTopics');
  if (!container) return;

  const list = topics || [];
  if (!list.length) {
    container.innerHTML = ytEmptyState('layers', 'No topics yet',
      'Topics are derived from video titles as you build up watch history.');
    return;
  }

  const maxSec = Math.max(...list.map(t => t.seconds), 1);
  container.innerHTML = list.map(t => {
    const pct = Math.min(100, Math.max(4, Math.round((t.seconds / maxSec) * 100)));
    const color = YT_TOPIC_COLORS[t.topic] || YT_TOPIC_COLORS['Other Topics'];
    return `
      <div class="yt-topic ico-host">
        <div class="yt-topic-head">
          ${ytIcon(t.topic, 'ico-xs')}
          <span class="yt-topic-name" title="${escapeHtml(t.topic)}">${escapeHtml(t.topic)}</span>
          <span class="yt-topic-pct">${pct}%</span>
          <span class="yt-topic-val">${formatDuration(t.seconds)}</span>
        </div>
        <div class="yt-meter"><span style="width:${pct}%; background:${color};"></span></div>
      </div>
    `;
  }).join('');
}

function renderYouTubeFormatSplit(items) {
  const container = document.getElementById('youtubeFormatSplit');
  if (!container) return;

  let longSec = 0;
  let shortSec = 0;
  (items || []).forEach(v => {
    const sec = v.watch_seconds !== undefined ? v.watch_seconds : Math.round((v.watch_minutes || 0) * 60);
    if (v.video_type === 'short') shortSec += sec; else longSec += sec;
  });

  if (ytFormatChartInstance) { ytFormatChartInstance.destroy(); ytFormatChartInstance = null; }

  if (longSec + shortSec <= 0) {
    container.innerHTML = ytEmptyState('pie', 'Nothing to split',
      'The long-form versus Shorts balance appears once watch time is recorded.');
    return;
  }

  const total = longSec + shortSec;
  const longPct = Math.round((longSec / total) * 100);

  container.innerHTML = `
    <div id="ytFormatChart" style="min-height:168px;"></div>
    <div class="yt-legend">
      <div class="yt-legend-row ico-host">
        ${ytIcon('long', 'ico-xs')}
        <span class="yt-row-name">Long Form</span>
        <span class="yt-row-val" style="color:#34d399;">${formatDuration(longSec)} · ${longPct}%</span>
      </div>
      <div class="yt-legend-row ico-host">
        ${ytIcon('short', 'ico-xs')}
        <span class="yt-row-name">Shorts</span>
        <span class="yt-row-val" style="color:#a3e635;">${formatDuration(shortSec)} · ${100 - longPct}%</span>
      </div>
    </div>
  `;

  if (!window.ApexCharts) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ytFormatChartInstance = new ApexCharts(document.getElementById('ytFormatChart'), {
    chart: { type: 'donut', height: 168, background: 'transparent', fontFamily: 'Sora, sans-serif' },
    labels: ['Long Form', 'Shorts'],
    series: [longSec, shortSec],
    colors: ['#34d399', '#a3e635'],
    stroke: { width: 0 },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: '74%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'WATCHED',
              color: '#64748b',
              fontSize: '9px',
              fontFamily: 'Outfit, sans-serif',
              formatter: () => formatDuration(total)
            },
            value: {
              show: true,
              fontSize: '15px',
              fontWeight: 800,
              color: isLight ? '#0f172a' : '#f0fdf4',
              fontFamily: 'Outfit, sans-serif',
              formatter: () => formatDuration(total)
            }
          }
        }
      }
    },
    tooltip: { theme: isLight ? 'light' : 'dark', y: { formatter: (val) => formatDuration(val) } }
  });
  ytFormatChartInstance.render();
}

const YT_THUMB_FALLBACK = "data:image/svg+xml;utf8,<svg viewBox='0 0 160 90' xmlns='http://www.w3.org/2000/svg'><rect width='160' height='90' fill='%230d1418'/><text x='80' y='49' fill='%23475569' font-family='sans-serif' font-size='9' text-anchor='middle'>No thumbnail</text></svg>";

function renderYouTubeVideoList() {
  const container = document.getElementById('youtubeVideos');
  const countEl = document.getElementById('ytResultCount');
  if (!container) return;

  // Keep the original index so the modal still resolves against currentYouTubeItems
  let items = (currentYouTubeItems || []).map((v, i) => ({ v, i }));
  const totalTracked = items.length;

  if (currentYouTubeFilter === 'long') {
    items = items.filter(x => x.v.video_type !== 'short');
  } else if (currentYouTubeFilter === 'short') {
    items = items.filter(x => x.v.video_type === 'short');
  }

  if (ytSearchQuery) {
    items = items.filter(x =>
      (x.v.title || '').toLowerCase().includes(ytSearchQuery) ||
      (x.v.channel || '').toLowerCase().includes(ytSearchQuery)
    );
  }

  const watchedOf = (v) => (v.watch_seconds !== undefined ? v.watch_seconds : Math.round((v.watch_minutes || 0) * 60));
  if (ytSortMode === 'watched') {
    items.sort((a, b) => watchedOf(b.v) - watchedOf(a.v));
  } else if (ytSortMode === 'longest') {
    items.sort((a, b) => (b.v.duration_seconds || 0) - (a.v.duration_seconds || 0));
  } else if (ytSortMode === 'title') {
    items.sort((a, b) => (a.v.title || '').localeCompare(b.v.title || ''));
  }

  if (countEl) {
    countEl.innerText = totalTracked ? `${items.length} of ${totalTracked}` : '';
  }

  if (!items.length) {
    container.innerHTML = totalTracked
      ? ytEmptyState('search', 'No matches',
          'No video matches this filter or search. Try clearing the search box or switching back to All.')
      : ytEmptyState('inbox', 'No watch history yet',
          `Nothing recorded for ${currentRangeLabel()}. Play a video with the browser connector enabled and it will show up here.`);
    return;
  }

  container.innerHTML = `
    <div class="yt-grid ${ytViewMode === 'list' ? 'is-list' : ''}">
      ${items.map(({ v, i }) => {
        const isShort = v.video_type === 'short';
        const thumbUrl = v.video_id ? `https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg` : YT_THUMB_FALLBACK;
        const watchedSec = watchedOf(v);
        const totalDurSec = v.duration_seconds > 0 ? v.duration_seconds : 0;
        const durLabel = formatClock(totalDurSec > 0 ? totalDurSec : watchedSec);

        let progressPct = 0;
        if (totalDurSec > 0) {
          const pos = v.position_seconds || watchedSec;
          progressPct = Math.min(100, Math.max(1, Math.round((pos / totalDurSec) * 100)));
        }

        const hasCaptions = v.transcript_status === 'available';
        const title = v.title || 'Untitled video';
        const channel = v.channel || 'Unknown Channel';

        return `
          <article class="yt-card ico-host" tabindex="0" role="button"
                   onclick="openVideoModal(${i})"
                   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openVideoModal(${i});}"
                   aria-label="${escapeHtml(title)}">
            <div class="yt-thumb">
              <img src="${thumbUrl}" class="yt-thumb-img" alt="" loading="lazy"
                   onerror="this.onerror=null;this.src=&quot;${YT_THUMB_FALLBACK}&quot;;">
              <span class="yt-scrim"></span>
              <span class="yt-chip yt-chip-format ${isShort ? 'is-short' : 'is-long'}">${ytGlyph(isShort ? 'bolt' : 'film')}${isShort ? 'Short' : 'Long'}</span>
              ${hasCaptions ? `<span class="yt-chip yt-chip-cc" title="Transcript available">${ytGlyph('captions')}CC</span>` : ''}
              <span class="yt-chip yt-chip-dur">${durLabel}</span>
              <span class="yt-play">${svgIcon('play')}</span>
              ${progressPct > 0 ? `<span class="yt-progress"><b style="width:${progressPct}%;"></b></span>` : ''}
            </div>

            <div class="yt-card-body">
              <h4 class="yt-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
              <div class="yt-card-channel">
                ${renderChannelAvatar(channel, v.channel_icon)}
                <span title="${escapeHtml(channel)}">${escapeHtml(channel)}</span>
              </div>
              <div class="yt-card-foot">
                <span class="yt-pill yt-pill--watched"><i class="fa-solid fa-eye"></i>${formatDuration(watchedSec)} watched</span>
                ${progressPct > 0 ? `<span class="yt-pill yt-pill--progress"><i class="fa-solid fa-fire"></i>${progressPct}%</span>` : ''}
              </div>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

let currentModalTranscriptText = '';
let isTranscriptBoxOpen = false;

async function openVideoModal(idx) {
  const v = currentYouTubeItems[idx];
  if (!v) return;
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
      return `<span style="background:rgba(6, 182, 212, 0.14); color:#06b6d4; border:1px solid rgba(6, 182, 212, 0.3); border-radius:99px; padding:3px 10px; font-size:11px; font-weight:700;">${escapeHtml(tagLabel)}</span>`;
    }).join('');
    tagsWrap.style.display = 'block';
  } else {
    tagsWrap.style.display = 'none';
  }

  const descWrap = document.getElementById('modalDescWrap');
  const descEl = document.getElementById('modalVideoDesc');
  const descText = (v.description && v.description.trim()) 
    ? v.description.trim() 
    : `Metadata captured for "${v.title || 'YouTube Video'}" by ${v.channel || 'YouTube Channel'}. Watch duration and playback position tracked automatically.`;
  if (descEl) descEl.innerText = descText;
  if (descWrap) descWrap.style.display = 'block';

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
  }

  if (overlay) overlay.classList.add('active');
}

let currentCatBreakdownData = [];
let currentCatTotalMinutes = 0;

function openCategoryModal() {
  const overlay = document.getElementById('categoryModalOverlay');
  if (!overlay) return;

  const totalSec = Math.round((currentCatTotalMinutes || 0) * 60);
  const totalTimeEl = document.getElementById('catModalTotalTime');
  if (totalTimeEl) totalTimeEl.textContent = formatDuration(totalSec);

  const countEl = document.getElementById('catModalCount');
  if (countEl) countEl.textContent = currentCatBreakdownData.length;

  const listEl = document.getElementById('catModalList');
  if (listEl) {
    const totalSecTracked = Math.round((currentCatTotalMinutes || 0) * 60);
    const denominator = totalSecTracked > 0 ? totalSecTracked : (currentCatBreakdownData.reduce((acc, c) => acc + Math.round((c.minutes || 0) * 60), 0) || 1);
    const colorList = ['#10b981', '#2dd4bf', '#a3e635', '#38bdf8', '#a78bfa', '#fbbf24', '#94a3b8'];

    let html = '';
    currentCatBreakdownData.forEach((c, idx) => {
      const sec = Math.round((c.minutes || 0) * 60);
      const pct = denominator > 0 ? Math.min(100, Math.round((sec / denominator) * 100)) : 0;
      const col = colorList[idx % colorList.length];
      const catName = c.category.charAt(0).toUpperCase() + c.category.slice(1);
      const durStr = formatDuration(sec);

      html += `
        <div style="background:var(--surface-1); border:1px solid var(--border); border-radius:12px; padding:12px 14px; transition:background 0.2s ease;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="width:10px; height:10px; border-radius:50%; background:${col}; display:inline-block; box-shadow:0 0 8px ${col};"></span>
              <span style="font-weight:800; font-size:13px; color:var(--text);">${escapeHtml(catName)}</span>
            </div>
            <div style="font-family:var(--font-mono); font-size:12px; font-weight:700; color:var(--text);">
              <span>${durStr}</span>
              <span style="color:var(--text-dim); margin-left:8px;">(${pct}%)</span>
            </div>
          </div>
          <div style="height:6px; background:var(--surface-2); border-radius:99px; overflow:hidden;">
            <div style="width:${pct}%; background:${col}; height:100%; border-radius:99px; transition:width 0.4s ease;"></div>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  overlay.classList.add('active');
}

function closeCategoryModal() {
  const overlay = document.getElementById('categoryModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeVideoModal();
    closeCategoryModal();
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
        statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block;box-shadow:0 0 6px #10b981;"></span> <span>Transcript Available</span>';
        statusEl.style.background = 'rgba(16, 185, 129, 0.15)';
        statusEl.style.color = '#10b981';
      }
      
      let html = '';
      if (data.segments && data.segments.length > 0) {
        html = data.segments.map(seg => {
          const m = Math.floor((seg.start || 0) / 60);
          const s = Math.floor((seg.start || 0) % 60);
          const timeLabel = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
          return `<div style="margin-bottom:6px;"><span style="color:#34d399; font-weight:800; font-family:var(--font-mono); margin-right:8px;">[${timeLabel}]</span><span>${escapeHtml(seg.text)}</span></div>`;
        }).join('');
      } else {
        html = `<div>${escapeHtml(data.full_text)}</div>`;
      }
      box.innerHTML = html;
    } else {
      if (statusEl) {
        statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#94a3b8;display:inline-block;"></span> <span>No Subtitles</span>';
        statusEl.style.background = 'rgba(148, 163, 184, 0.15)';
        statusEl.style.color = '#94a3b8';
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
    showToast('Transcript Copied', 'Full video transcript copied to clipboard.');
  });
}

function updateTabPill(containerId, pillId) {
  const container = document.getElementById(containerId);
  const pill = document.getElementById(pillId);
  if (!container || !pill) return;
  const activeBtn = container.querySelector('.ui-tab-btn.active');
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
  updateTabPill('hourlyChartTabs', 'hourlyChartPill');
}

function showSkeletonLoading() {
  const heroGrid = document.getElementById('heroGrid');
  if (heroGrid) {
    heroGrid.innerHTML = `
      <div class="glass-card"><div class="card-label">Total Time Tracked</div><div class="skeleton-shimmer" style="height:32px; width:65%; margin-top:8px;"></div><div class="skeleton-shimmer" style="height:12px; width:45%; margin-top:8px;"></div></div>
      <div class="glass-card"><div class="card-label">Top Category Share</div><div class="skeleton-shimmer" style="height:32px; width:55%; margin-top:8px;"></div><div class="skeleton-shimmer" style="height:12px; width:35%; margin-top:8px;"></div></div>
      <div class="glass-card"><div class="card-label">Most Used App</div><div class="skeleton-shimmer" style="height:32px; width:75%; margin-top:8px;"></div><div class="skeleton-shimmer" style="height:12px; width:50%; margin-top:8px;"></div></div>
    `;
  }
  const lbList = document.getElementById('leaderboardList');
  if (lbList) {
    lbList.innerHTML = `
      <div class="skeleton-shimmer" style="height:48px; border-radius:12px; margin-bottom:8px;"></div>
      <div class="skeleton-shimmer" style="height:48px; border-radius:12px; margin-bottom:8px;"></div>
      <div class="skeleton-shimmer" style="height:48px; border-radius:12px; margin-bottom:8px;"></div>
    `;
  }
}

function setRange(range, el) {
  currentRange = range;
  customDate = null;
  document.getElementById('customDateInput').value = '';
  if (el) {
    const parent = el.closest('.ui-tabs');
    if (parent) parent.querySelectorAll('.ui-tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    updateTabPill('rangeTabs', 'rangeTabPill');
  }

  const cacheKey = customDate ? `custom_${customDate}` : currentRange;
  if (statsResponseCache[cacheKey]) {
    applyDashboardData(statsResponseCache[cacheKey]);
  } else {
    showSkeletonLoading();
  }

  fetchDashboardData();
  if (isYouTubeViewActive()) fetchYouTubeData();
}

function onDateSelected(val) {
  if(!val) return;
  currentRange = 'custom';
  customDate = val;
  const rangeTabs = document.getElementById('rangeTabs');
  if (rangeTabs) rangeTabs.querySelectorAll('.ui-tab-btn').forEach(btn => btn.classList.remove('active'));
  showSkeletonLoading();
  fetchDashboardData();
  if (isYouTubeViewActive()) fetchYouTubeData();
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

// Smooth eased count-up for a formatted metric (rAF-driven).
function animateFormatted(el, endValue, formatter, dur = 700) {
  if (!el) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(Math.round(endValue * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function applyDashboardData(data, isSilent = false) {
  updatePauseUI(data.is_paused);

  const totalSec = Math.round(data.total_minutes * 60);
  const formattedTotalTime = formatDuration(totalSec);

  const topAppRaw = data.top_app || 'None';
  const topAppFormatted = formatAppName(topAppRaw);
  const topAppIconMarkup = renderAppIconMarkup(topAppRaw, data.top_app_icon);
  const topAppSec = Math.round(data.top_app_minutes * 60);

  const topCat = data.cat_breakdown && data.cat_breakdown.length ? data.cat_breakdown[0] : null;
  // Cap between 0 and 100%
  const catPct = topCat && data.total_minutes > 0 ? Math.min(100, Math.max(0, Math.round((topCat.minutes / data.total_minutes) * 100))) : 0;
  const appPct = data.top_app_minutes && data.total_minutes > 0 ? Math.min(100, Math.max(0, Math.round((data.top_app_minutes / data.total_minutes) * 100))) : 0;
  const rangeTag = currentRangeLabel();
  const catMeter = catPct > 0 ? `<div class="stat-meter"><span style="width:${catPct}%;"></span></div>` : '';
  const appMeter = appPct > 0 ? `<div class="stat-meter"><span style="width:${appPct}%;"></span></div>` : '';

function render3DTimeIcon() {
  return `<svg width="52" height="52" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="display:block; overflow:visible;">
    <defs>
      <linearGradient id="timeBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#34d399"/>
        <stop offset="40%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
      <radialGradient id="timeSheen" cx="30%" cy="18%" r="65%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="timeBottomShade" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#050c08" stop-opacity="0.5"/>
        <stop offset="45%" stop-color="#050c08" stop-opacity="0"/>
      </linearGradient>
      <filter id="timeGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#10b981" flood-opacity="0.45"/>
      </filter>
      <filter id="timeGlyphShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#047857" flood-opacity="0.5"/>
      </filter>
    </defs>

    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#timeBgGrad)" filter="url(#timeGlow)"/>
    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#timeSheen)"/>
    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#timeBottomShade)"/>
    <rect x="11.2" y="11.2" width="97.6" height="97.6" rx="27" fill="none" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="1.4"/>

    <g filter="url(#timeGlyphShadow)">
      <circle cx="60" cy="60" r="22" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>
      <path d="M60 45 V60 L71 67" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="60" r="3.5" fill="#FFFFFF"/>
    </g>
  </svg>`;
}

function render3DLayersIcon() {
  return `<svg width="52" height="52" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="display:block; overflow:visible;">
    <defs>
      <linearGradient id="layersBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#34d399"/>
        <stop offset="40%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
      <radialGradient id="layersSheen" cx="30%" cy="18%" r="65%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="layersBottomShade" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#050c08" stop-opacity="0.5"/>
        <stop offset="45%" stop-color="#050c08" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="layersTopFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#d1fae5"/>
      </linearGradient>
      <filter id="layersGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#10b981" flood-opacity="0.45"/>
      </filter>
      <filter id="layersGlyphShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#047857" flood-opacity="0.5"/>
      </filter>
    </defs>

    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#layersBgGrad)" filter="url(#layersGlow)"/>
    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#layersSheen)"/>
    <rect x="10" y="10" width="100" height="100" rx="28" fill="url(#layersBottomShade)"/>
    <rect x="11.2" y="11.2" width="97.6" height="97.6" rx="27" fill="none" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="1.4"/>

    <g filter="url(#layersGlyphShadow)" transform="translate(60,60) scale(0.82) translate(-60,-60)">
      <path d="M60 30 L90 46 L60 62 L30 46 Z" fill="url(#layersTopFace)"/>
      <path d="M30 60 L60 76 L90 60" fill="none" stroke="#FFFFFF" stroke-opacity="0.95" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M30 74 L60 90 L90 74" fill="none" stroke="#FFFFFF" stroke-opacity="0.65" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

  const heroGrid = document.getElementById('heroGrid');
  if (!heroGrid) return;

  if (!isSilent || !heroGrid.querySelector('.stat-card')) {
    heroGrid.innerHTML = `
      <div class="glass-card stat-card ico-host" style="--stat-glow: rgba(16,185,129,0.18);">
        <div class="stat-head">
          <span class="stat-icon stat-icon-3d">${render3DTimeIcon()}</span>
          <span class="stat-tag range-tag" style="background:rgba(16,185,129,0.16); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-weight:800;">⚡ ${escapeHtml(rangeTag)}</span>
        </div>
        <div class="card-label">Total Time Tracked</div>
        <div class="big-stat total-time-val" style="font-size: 32px; font-weight: 800; color: var(--text);">${escapeHtml(formattedTotalTime)}</div>
        <div class="stat-foot">${ytGlyph('signal')}<span class="total-mins-foot" style="color:var(--text-muted);">${data.total_minutes} mins active logged</span></div>
      </div>
      <div class="glass-card stat-card ico-host" style="--stat-glow: rgba(52,211,153,0.15);">
        <div class="stat-head">
          <span class="stat-icon stat-icon-3d">${render3DLayersIcon()}</span>
          <span class="stat-tag cat-pct-tag" style="background:rgba(16,185,129,0.16); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-weight:800;">${catPct}% share</span>
        </div>
        <div class="card-label">Top Category Share</div>
        <div class="big-stat top-cat-val" style="font-size: 26px; text-transform: capitalize;">${escapeHtml(data.top_category || 'None')}</div>
        <div class="stat-foot">${ytGlyph('pie')}<span class="top-cat-foot">${topCat ? formatDuration(Math.round(topCat.minutes * 60)) + ' total' : 'No activity yet'}</span></div>
        ${catMeter}
      </div>
      <div class="glass-card stat-card ico-host" style="--stat-glow: rgba(163,230,53,0.15);">
        <div class="stat-head">
          <span class="stat-icon stat-icon-app">${topAppIconMarkup}</span>
          <span class="stat-tag app-pct-tag" style="background:rgba(16,185,129,0.16); color:var(--primary); border:1px solid rgba(16,185,129,0.3); font-weight:800;">${appPct}% share</span>
        </div>
        <div class="card-label">Most Used App</div>
        <div class="hero-app-title stat-app-name" title="${escapeHtml(topAppFormatted)}">${escapeHtml(topAppFormatted)}</div>
        <div class="stat-foot">${ytGlyph('crown')}<span class="top-app-foot">${formatDuration(topAppSec)} active session</span></div>
        ${appMeter}
      </div>
    `;

    requestAnimationFrame(() => {
      const heroVal = heroGrid.querySelector('.total-time-val');
      if (heroVal) animateFormatted(heroVal, totalSec, formatDuration, 750);
      const catTag = heroGrid.querySelector('.cat-pct-tag');
      if (catTag && catPct > 0) animateFormatted(catTag, catPct, (v) => `${v}% share`, 700);
      const appTag = heroGrid.querySelector('.app-pct-tag');
      if (appTag && appPct > 0) animateFormatted(appTag, appPct, (v) => `${v}% share`, 700);
      heroGrid.querySelectorAll('.stat-meter > span').forEach(s => {
        const target = s.style.width;
        s.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => { s.style.width = target; }));
      });
    });
  } else {
    // In-place silent update during background polling
    const totalValEl = heroGrid.querySelector('.total-time-val');
    if (totalValEl) totalValEl.textContent = formattedTotalTime;

    const rangeTagEl = heroGrid.querySelector('.range-tag');
    if (rangeTagEl) rangeTagEl.textContent = rangeTag;

    const totalMinsFoot = heroGrid.querySelector('.total-mins-foot');
    if (totalMinsFoot) totalMinsFoot.textContent = `${data.total_minutes} mins active logged`;

    const catTag = heroGrid.querySelector('.cat-pct-tag');
    if (catTag) catTag.textContent = `${catPct}% share`;

    const topCatVal = heroGrid.querySelector('.top-cat-val');
    if (topCatVal) topCatVal.textContent = data.top_category || 'None';

    const topCatFoot = heroGrid.querySelector('.top-cat-foot');
    if (topCatFoot) topCatFoot.textContent = topCat ? formatDuration(Math.round(topCat.minutes * 60)) + ' total' : 'No activity yet';

    const appTag = heroGrid.querySelector('.app-pct-tag');
    if (appTag) appTag.textContent = `${appPct}% share`;

    const topAppVal = heroGrid.querySelector('.stat-app-name');
    if (topAppVal) {
      topAppVal.textContent = topAppFormatted;
      topAppVal.title = topAppFormatted;
    }

    const topAppIcon = heroGrid.querySelector('.stat-icon-app');
    if (topAppIcon) topAppIcon.innerHTML = topAppIconMarkup;

    const topAppFoot = heroGrid.querySelector('.top-app-foot');
    if (topAppFoot) topAppFoot.textContent = `${formatDuration(topAppSec)} active session`;

    const cards = heroGrid.querySelectorAll('.stat-card');
    if (cards.length >= 2) {
      const catSpan = cards[1].querySelector('.stat-meter > span');
      if (catSpan) catSpan.style.width = `${catPct}%`;
    }
    if (cards.length >= 3) {
      const appSpan = cards[2].querySelector('.stat-meter > span');
      if (appSpan) appSpan.style.width = `${appPct}%`;
    }
  }

  cachedHourlyData = data.hourly || [];
  renderHistogram(cachedHourlyData);
  renderCategoryDonut(data.cat_breakdown, data.total_minutes);
  renderLeaderboard(data.categories, data.total_minutes);
}

async function fetchDashboardData(isSilent = false) {
  try {
    let url = `/api/stats?range=${currentRange}`;
    if(customDate) url += `&date=${customDate}`;
    const res = await fetch(url);
    const data = await res.json();

    const cacheKey = customDate ? `custom_${customDate}` : currentRange;
    statsResponseCache[cacheKey] = data;

    applyDashboardData(data, isSilent);
    const freshness = document.getElementById('freshnessText');
    if (freshness) {
      freshness.innerText = '· updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    fetchActivities(true, isSilent);
  } catch(e) {
    console.error("Failed to load stats", e);
  }
}

function renderHistogram(dataList) {
  const container = document.getElementById('hourlyApexChart');
  if (!container || !window.ApexCharts) return;

  const isDaily = dataList && dataList.length > 0 && dataList[0].day_name !== undefined;

  const titleEl = document.getElementById('patternChartTitle');
  if (titleEl) {
    if (currentRange === '7d') {
      titleEl.innerText = 'Daily Activity Pattern (7 Days)';
    } else if (currentRange === '30d') {
      titleEl.innerText = 'Daily Activity Pattern (30 Days)';
    } else {
      titleEl.innerText = 'Hourly Activity Pattern (Today)';
    }
  }

  let categories = [];
  let values = [];

  if (isDaily) {
    categories = dataList.map(item => item.label || item.day_name);
    values = dataList.map(item => parseFloat(item.hours || 0));
  } else {
    const list = (dataList && dataList.length) ? dataList : Array.from({length: 24}, (_, i) => ({ hour: `${String(i).padStart(2, '0')}:00`, minutes: 0 }));
    categories = list.map(item => {
      const h = parseInt(item.hour || 0, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}${ampm}`;
    });
    values = list.map(item => Math.round(item.minutes || 0));
  }

  let chartType = currentHourlyChartType === 'area' ? 'area' : (currentHourlyChartType === 'line' ? 'line' : 'bar');
  let strokeConfig = { width: (chartType === 'bar') ? 0 : 3, curve: 'smooth' };
  let colors = ['#10b981'];

  let fillConfig = { opacity: 0.88 };
  if (chartType === 'area') {
    fillConfig = {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.6,
        opacityTo: 0.05,
        stops: [0, 90, 100],
        colorStops: [
          { offset: 0, color: '#10b981', opacity: 0.6 },
          { offset: 100, color: '#059669', opacity: 0.0 }
        ]
      }
    };
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  const hourlyOptions = {
    chart: {
      type: chartType,
      height: 275,
      toolbar: { show: false },
      sparkline: { enabled: false },
      background: 'transparent',
      fontFamily: 'Sora, sans-serif',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 250,
        dynamicAnimation: { enabled: true, speed: 180 }
      }
    },
    series: [{
      name: isDaily ? 'Daily Active Time' : 'Active Minutes',
      data: values
    }],
    stroke: strokeConfig,
    colors: colors,
    fill: fillConfig,
    dataLabels: {
      enabled: false
    },
    plotOptions: {
      bar: {
        columnWidth: isDaily ? '42%' : '52%',
        borderRadius: 6
      }
    },
    markers: {
      size: 0,
      colors: ['#10b981'],
      strokeColors: isLight ? '#ffffff' : '#050c08',
      strokeWidth: 2,
      hover: { size: 6 }
    },
    xaxis: {
      categories: categories,
      tickAmount: isDaily ? categories.length : 8,
      labels: {
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: true,
        style: { colors: isLight ? '#475569' : '#94a3b8', fontSize: '11px', fontFamily: 'Sora, sans-serif', fontWeight: 600 }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: {
        formatter: (val) => isDaily ? `${val.toFixed(1)}h` : `${Math.round(val)}m`,
        style: { colors: isLight ? '#64748b' : '#64748b', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace' }
      }
    },
    grid: {
      borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)',
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } }
    },
    tooltip: {
      theme: isLight ? 'light' : 'dark',
      x: { show: true },
      y: {
        formatter: (val) => isDaily ? `${val.toFixed(2)} hours active logged` : `${Math.round(val)} mins active logged`
      },
      style: { fontSize: '11px', fontFamily: 'Plus Jakarta Sans, sans-serif' }
    },
    theme: { mode: isLight ? 'light' : 'dark' }
  };

  if (!hourlyApexChartInstance) {
    container.innerHTML = '';
    hourlyApexChartInstance = new ApexCharts(container, hourlyOptions);
    hourlyApexChartInstance.render();
    requestAnimationFrame(() => {
      if (hourlyApexChartInstance && typeof hourlyApexChartInstance.windowResize === 'function') {
        hourlyApexChartInstance.windowResize();
      }
    });
  } else {
    hourlyApexChartInstance.updateOptions(hourlyOptions, false, true);
  }
}

function renderCategoryDonut(catBreakdown, totalMinutes) {
  const container = document.getElementById('donutApexChart');
  const barWrap = document.getElementById('categorySegmentBarWrap');
  const pillGrid = document.getElementById('categoryPillGrid');
  if (!container || !window.ApexCharts) return;

  const validCats = (catBreakdown && catBreakdown.length) ? catBreakdown : [];
  const labels = validCats.length ? validCats.map(c => c.category.charAt(0).toUpperCase() + c.category.slice(1)) : ['No Data'];
  const series = validCats.length ? validCats.map(c => Math.round((c.minutes || 0) * 60)) : [1];
  const colorList = ['#10b981', '#2dd4bf', '#a3e635', '#38bdf8', '#a78bfa', '#fbbf24', '#94a3b8'];

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  const donutOptions = {
    chart: {
      type: 'donut',
      height: 205,
      background: 'transparent',
      fontFamily: 'Sora, sans-serif',
      animations: { enabled: true, easing: 'easeinout', speed: 250 }
    },
    labels: labels,
    series: series,
    colors: colorList,
    stroke: { show: true, colors: [isLight ? '#ffffff' : '#0b1a12'], width: 3 },
    dataLabels: { enabled: false },
    legend: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
          background: 'transparent',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'TOTAL ACTIVE',
              color: '#64748b',
              fontSize: '9px',
              fontFamily: 'Outfit, sans-serif',
              formatter: () => {
                const totalSec = Math.round((totalMinutes || 0) * 60);
                return formatDuration(totalSec);
              }
            },
            value: {
              show: true,
              fontSize: '14px',
              fontWeight: 800,
              color: isLight ? '#0f172a' : '#f0fdf4',
              fontFamily: 'Outfit, sans-serif',
              formatter: (val) => formatDuration(val)
            }
          }
        }
      }
    },
    tooltip: {
      theme: isLight ? 'light' : 'dark',
      y: { formatter: (val) => formatDuration(val) }
    }
  };

  if (!donutApexChartInstance) {
    container.innerHTML = '';
    donutApexChartInstance = new ApexCharts(container, donutOptions);
    donutApexChartInstance.render();
    requestAnimationFrame(() => {
      if (donutApexChartInstance && typeof donutApexChartInstance.windowResize === 'function') {
        donutApexChartInstance.windowResize();
      }
    });
  } else {
    donutApexChartInstance.updateOptions(donutOptions);
  }

  // Render Multi-Segment Proportional Progress Bar
  if (barWrap) {
    const totalSec = series.reduce((a, b) => a + b, 0) || 1;
    let segmentsHtml = '<div style="display:flex; height:8px; width:100%; border-radius:99px; overflow:hidden; background:var(--surface-2); gap:2px;">';
    validCats.forEach((c, idx) => {
      const sec = Math.round((c.minutes || 0) * 60);
      const pct = Math.max(1, ((sec / totalSec) * 100).toFixed(1));
      const col = colorList[idx % colorList.length];
      segmentsHtml += `<div style="width:${pct}%; background:${col}; height:100%; transition:width 0.3s ease;" title="${escapeHtml(c.category)}: ${pct}%"></div>`;
    });
    segmentsHtml += '</div>';
    barWrap.innerHTML = segmentsHtml;
  }

  currentCatBreakdownData = validCats;
  currentCatTotalMinutes = totalMinutes;

  // Render Single Column Category List (Top 3) + View Details Button
  if (pillGrid) {
    const totalSecTracked = Math.round((totalMinutes || 0) * 60);
    const denominator = totalSecTracked > 0 ? totalSecTracked : (series.reduce((a, b) => a + b, 0) || 1);
    let pillsHtml = '';

    const top3Cats = validCats.slice(0, 3);
    top3Cats.forEach((c, idx) => {
      const sec = Math.round((c.minutes || 0) * 60);
      const pct = Math.min(100, Math.round((sec / denominator) * 100));
      const col = colorList[idx % colorList.length];
      const catName = c.category.charAt(0).toUpperCase() + c.category.slice(1);
      const durStr = formatDuration(sec);

      pillsHtml += `
        <div class="cat-pill-row">
          <div style="display:flex; align-items:center; gap:9px; min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:9px; min-width:0;">
              <span class="cat-dot" style="background:${col}; color:${col}; flex-shrink:0; width:9px; height:9px; border-radius:50%; display:inline-block;"></span>
              <span style="font-weight:700; font-size:12px; color:var(--text);" title="${escapeHtml(catName)}">${escapeHtml(catName)}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px; font-family:var(--font-mono); flex-shrink:0;">
            <b style="font-size:12px; color:var(--text);">${durStr}</b>
            <span class="stat-tag" style="font-size:10px; padding:2px 8px; background:var(--surface-2); border-radius:99px; color:var(--text-dim);">${pct}%</span>
          </div>
        </div>
      `;
    });

    if (validCats.length > 3) {
      pillsHtml += `
        <button class="cat-more-btn" onclick="openCategoryModal()">
          <span>View All ${validCats.length} Categories & Details</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      `;
    }

    pillGrid.innerHTML = pillsHtml;
  }
}

let currentLeaderboardApps = [];
let currentTotalMinutes = 0;
let leaderboardTab = 'all';

function setLeaderboardTab(tab, el) {
  leaderboardTab = tab;
  if (el) {
    const parent = el.closest('.ui-tabs');
    if (parent) parent.querySelectorAll('.ui-tab-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    updateTabPill('lbTabs', 'lbTabPill');
  }
  renderLeaderboard(currentLeaderboardApps, currentTotalMinutes);
}

function renderLeaderboard(apps, totalMinutes) {
  currentLeaderboardApps = apps || [];
  currentTotalMinutes = totalMinutes || 0;

  const container = document.getElementById('leaderboardList');
  if (!apps || apps.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); padding: 20px; text-align: center;">No activity recorded for this period.</div>`;
    return;
  }

  let filteredApps = apps;
  if (leaderboardTab === 'software') {
    filteredApps = apps.filter(a => !isWebsiteDomain(a.app, a.source));
  } else if (leaderboardTab === 'website') {
    filteredApps = apps.filter(a => isWebsiteDomain(a.app, a.source));
  }

  if (filteredApps.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); padding: 20px; text-align: center;">No ${leaderboardTab === 'website' ? 'website' : 'software'} activity recorded for this period.</div>`;
    return;
  }

  const top10Apps = filteredApps.slice(0, 10);
  const topMin = Math.max(...top10Apps.map(a => a.minutes), 1);
  const sumAppMins = filteredApps.reduce((acc, a) => acc + (a.minutes || 0), 0);
  const totalForLb = Math.max(totalMinutes, sumAppMins, 0.01);
  let html = '';

  top10Apps.forEach((appItem, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'top-1' : (rank === 2 ? 'top-2' : (rank === 3 ? 'top-3' : ''));
    const iconMarkup = renderAppIconMarkup(appItem.app, appItem.icon, appItem.source);
    const cleanName = formatAppName(appItem.app);
    
    const pctOfTop = Math.min(100, Math.max(8, Math.round((appItem.minutes / topMin) * 100)));
    const pctOfDay = totalForLb > 0 ? Math.min(100, Math.round((appItem.minutes / totalForLb) * 100)) : 0;
    const durStr = formatDuration(Math.round(appItem.minutes * 60));

    html += `
      <div class="leaderboard-item">
        <div class="rank-badge ${rankClass}">#${rank}</div>
        <div class="app-brand-icon">${iconMarkup}</div>
        <div>
          <div class="leader-app-name" title="${escapeHtml(cleanName)}">${escapeHtml(cleanName)}</div>
          <div class="leader-cat-badge">${escapeHtml(appItem.category)}</div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width: ${pctOfTop}%;"></div>
        </div>
        <div class="time-badge">${durStr}</div>
        <div class="percent-badge">${pctOfDay}% share</div>
      </div>
    `;
  });

  container.innerHTML = html;
  syncAllTabPills();
}

let lastFetchedActivitiesHash = '';

async function fetchActivities(reset = false, isSilent = false) {
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

    const hash = JSON.stringify(list.map(x => ({ id: x.id, end: x.ended_at, idle: x.idle_seconds })));
    if (isSilent && hash === lastFetchedActivitiesHash && timelinePage === 1) {
      return; // Skip DOM rewrite if activity list unchanged during silent background poll
    }
    lastFetchedActivitiesHash = hash;

    const container = document.getElementById('timelineList');
    if (!container) return;
    if (reset) {
      container.innerHTML = '';
    }

    let htmlEvents = '';
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
        idleStatusMarkup = `<span style="color:var(--primary); font-weight:700; font-size:11px;">⚡ Active</span>`;
      } else {
        idleStatusMarkup = `<span style="color:var(--amber); font-weight:700; font-size:11px;">⚠️ ${formatDuration(ev.idle_seconds)} idle</span>`;
      }

      const iconMarkup = renderAppIconMarkup(ev.app, ev.icon, ev.source);
      const cleanAppName = formatAppName(ev.app);

      htmlEvents += `
        <div class="timeline-item">
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
    });
    container.insertAdjacentHTML('beforeend', htmlEvents);

    const loadMoreWrap = document.getElementById('loadMoreWrap');
    if (loadMoreWrap) loadMoreWrap.style.display = hasMoreActivities ? 'flex' : 'none';
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

async function renderCategoryRulesPage() {
  const container = document.getElementById('rulesGrid');
  try {
    const res = await fetch('/api/categories');
    rulesData = await res.json();

    let html = '';
    for (const [cat, keywords] of Object.entries(rulesData)) {
      const kwStr = keywords.join(', ');
      html += `
        <div class="glass-card" style="padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="text-transform: capitalize; font-size: 15px; font-weight: 700; color: var(--text-primary); margin:0;">${escapeHtml(cat)}</h3>
            <span class="pill-badge cat-${cat}">${escapeHtml(cat)}</span>
          </div>
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
            App or window titles containing these keywords will automatically map to <b>${escapeHtml(cat)}</b>.
          </p>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="rule_${cat}" class="ui-input" value="${escapeHtml(kwStr)}" placeholder="comma, separated, keywords" style="flex:1; font-size:12px;">
            <button class="btn btn-primary btn-sm" onclick="saveRule('${cat}')">Save</button>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  } catch(e) {
    console.error("Failed to load rules", e);
  }
}

async function saveRule(category) {
  const input = document.getElementById(`rule_${category}`);
  if(!input) return;
  const val = input.value;
  try {
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, keywords: val })
    });
    showToast('Rules Saved', `Updated keywords for ${category}`);
    fetchDashboardData();
  } catch(e) {
    console.error("Failed to save rule", e);
  }
}

function switchPage(pageName, el, updateHash = true) {
  const pageMap = {
    overview: 'overview',
    timeline: 'timeline',
    categories: 'categories',
    youtube: 'youtube',
    livescreen: 'livescreen',
    pattern: 'pattern',
    settings: 'settings'
  };

  const targetId = pageMap[pageName] || 'overview';

  // 1. Sync URL Hash in Browser Address Bar
  if (updateHash && window.location.hash !== `#${targetId}`) {
    history.replaceState(null, '', `#${targetId}`);
  }

  // 2. Update Navigation UI active class
  document.querySelectorAll('.nav-menu .nav-item').forEach(item => item.classList.remove('active'));
  if (el) {
    el.classList.add('active');
  } else {
    const activeNav = document.querySelector(`.nav-menu .nav-item[onclick*="'${targetId}'"]`);
    if (activeNav) activeNav.classList.add('active');
  }

  // 3. Hide all page views and show target page view
  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(`view-${targetId}`);
  if (targetView) targetView.classList.add('active');

  // 4. Update topbar header title and subtitle
  const headings = {
    overview: { title: 'Overview Analytics', sub: 'Real-time productivity summary powered by ApexCharts.' },
    timeline: { title: 'Activity Timeline', sub: 'Chronological feed of all tracked window & web sessions.' },
    categories: { title: 'Category Mapping & Rules', sub: 'Keyword matching engine and category rule mappings.' },
    youtube: { title: 'YouTube Intelligence', sub: 'Video sessions, long-form learning, and watch patterns.' },
    livescreen: { title: 'Live Screen Monitor', sub: 'Real-time active window display feed.' },
    pattern: { title: 'Pattern & Vision Research', sub: 'Deep learning cluster analysis and productivity insights.' },
    settings: { title: 'System Settings', sub: 'Engine configuration and local database controls.' }
  };

  const h = headings[targetId] || headings.overview;
  const headingEl = document.getElementById('pageHeading');
  const subheadingEl = document.getElementById('pageSubheading');
  if (headingEl) headingEl.textContent = h.title;
  if (subheadingEl) subheadingEl.textContent = h.sub;

  // 5. Trigger page specific initializers
  if (targetId === 'overview') {
    fetchDashboardData();
  } else if (targetId === 'timeline') {
    fetchActivities();
  } else if (targetId === 'categories') {
    renderCategoryRules();
  } else if (targetId === 'youtube') {
    fetchYouTubeData();
  } else if (targetId === 'pattern') {
    renderPatternVision();
  }

  // 6. Store active page in sessionStorage
  try { sessionStorage.setItem('daylens_active_page', targetId); } catch(e) {}
}

window.addEventListener('hashchange', () => {
  const hashPage = window.location.hash.replace('#', '');
  if (hashPage) switchPage(hashPage, null, false);
});

function renderPatternVision() {
  const container = document.getElementById('patternContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="glass-card" style="padding:22px; margin-bottom:20px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
        <span class="stat-icon" style="background:linear-gradient(135deg,#047857,#34d399); width:40px; height:40px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; color:#fff;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </span>
        <div>
          <h3 style="font-size:17px; font-weight:800; color:var(--text); margin:0;">Productivity Pattern & Vision AI</h3>
          <span style="font-size:11px; color:var(--text-muted);">Real-time behavioral clustering and automated focus recommendations</span>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-top:16px;">
        <div style="background:var(--surface-1); border:1px solid var(--border); border-radius:14px; padding:14px;">
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:var(--text-dim);">Peak Focus Hour</div>
          <div style="font-size:22px; font-weight:800; color:var(--primary); font-family:var(--font-display); margin-top:4px;">12 PM &ndash; 4 PM</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Highest active density logged</div>
        </div>
        <div style="background:var(--surface-1); border:1px solid var(--border); border-radius:14px; padding:14px;">
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:var(--text-dim);">Context Switch Rate</div>
          <div style="font-size:22px; font-weight:800; color:var(--cyan); font-family:var(--font-display); margin-top:4px;">Low (4/hr)</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Deep work focus maintained</div>
        </div>
        <div style="background:var(--surface-1); border:1px solid var(--border); border-radius:14px; padding:14px;">
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:var(--text-dim);">Recommended Action</div>
          <div style="font-size:18px; font-weight:800; color:#a3e635; font-family:var(--font-display); margin-top:4px;">Maintain Momentum</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Optimal session length active</div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if(!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Initialize Canvas Background & Dashboard SPA Page Routing
initBgCanvas();
const savedTheme = localStorage.getItem('daylens_theme') || 'dark';
setThemeMode(savedTheme);

const initialHashPage = window.location.hash.replace('#', '');
const savedPage = initialHashPage || sessionStorage.getItem('daylens_active_page') || 'overview';
switchPage(savedPage);

setInterval(() => {
  const activeView = document.querySelector('.page-view.active');
  if (!activeView || activeView.id === 'view-overview') {
    fetchDashboardData(true);
  }
}, 5000);

window.addEventListener('resize', () => {
  if (!isMobileView()) {
    const shell = document.getElementById('appShell');
    if (shell) shell.classList.remove('nav-open');
    document.body.style.overflow = '';
  }
  syncAllTabPills();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileNav();
});

setTimeout(syncAllTabPills, 100);
setTimeout(syncAllTabPills, 500);
