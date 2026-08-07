# DayLens Phase 3–6 Multi-Source Tracking Architecture Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Evolve DayLens from a Windows activity tracker into a privacy-first personal activity analytics system with a desktop collector, browser extensions, optional app connectors, and one unified local dashboard.

**Architecture:** Keep two distinct systems: (1) a Windows desktop collector/service that captures foreground app, window title, idle state, and local controls; (2) browser extensions/connectors that capture explicitly allowed tab metadata and send normalized events to the local DayLens service. All sources write to one local SQLite database through a localhost API. No keylogging, screenshots, hidden monitoring, message content collection, or password capture.

**Tech Stack:** Python 3.11, SQLite, local HTTP API, Chrome/Brave/Firefox WebExtension APIs, HTML/CSS/JS dashboard, optional AI summaries only from aggregated/redacted local data.

---

## Product model: two systems, one product

### System A — DayLens Desktop Agent

Responsibilities:

- Windows foreground app/process and window-title collection
- Idle detection
- Pause/resume control
- Local API server
- SQLite database and migrations
- Dashboard serving
- Optional startup/tray integration later
- Privacy rules and sensitive-app/domain masking

Existing implementation:

- `daylens/collector.py`
- `daylens/db.py`
- `daylens/server.py`
- `daylens/categorizer.py`
- `daylens/cli.py`
- `daylens/config.py`

### System B — DayLens Connectors

A separate directory and build target containing:

- One shared browser-extension core
- Chrome/Brave/Firefox manifests/adapters
- Optional connectors for selected desktop apps where an official/local API exists
- Local-only event POST to `http://127.0.0.1:<port>/api/ingest`
- Explicit enable/disable and per-source privacy settings

The connector does not replace the desktop agent. It enriches it with browser-level metadata.

---

## Source policy

### Allowed by default

- Application name/process name
- Window title, with masking rules
- Browser domain and page title, only while the tab is active
- YouTube title/channel/category metadata, if the user enables the YouTube source
- Event duration and idle state
- User-created category labels

### Disabled by default / never collect

- Keystrokes or keylogging
- Screenshots, webcam, microphone
- Passwords, form fields, page text, message content
- Facebook/Telegram private chat content
- Cookies, auth tokens, local storage, browsing history databases
- Incognito/private windows
- Banking, NID, government portal, password-manager, email, and other sensitive domains

### Facebook and Telegram approach

Do not scrape private messages or use session cookies. For Facebook/Telegram, only support safe metadata options:

- Browser active-domain time: `facebook.com`, `web.telegram.org`
- Optional page title/category only
- Telegram Desktop foreground-app time from System A
- Official Telegram bot/channel data only when the user explicitly connects a bot/token and has permission
- Optional user-exported data import later, never silent scraping

---

# Implementation phases

## Phase 3 — Browser connector foundation

**Objective:** Build one local ingestion contract and a browser extension that records active-tab domain/title metadata.

**Files:**

- Create: `connectors/browser/manifest.chrome.json`
- Create: `connectors/browser/manifest.firefox.json`
- Create: `connectors/browser/background.js`
- Create: `connectors/browser/content-policy.js`
- Create: `connectors/browser/options.html`
- Create: `connectors/browser/options.js`
- Create: `connectors/browser/README.md`
- Modify: `daylens/server.py`
- Modify: `daylens/db.py`
- Modify: `daylens/config.py`
- Test: `tests/test_ingest.py`

Steps:

1. Add a versioned `POST /api/ingest` endpoint accepting only normalized events.
2. Validate source, app/browser, domain, title, timestamps, and event type.
3. Reject private/incognito events and blocked domains.
4. Add an `external_events` or unified `activities` source field without breaking existing records.
5. Implement extension heartbeat only for the active tab, debounced to avoid excessive events.
6. Store domain and sanitized title; never store page body or query parameters by default.
7. Add extension options for enable/disable, source name, pause, and blocked-domain list.
8. Test malformed payloads, blocked domains, valid events, duplicate heartbeats, and pause behavior.

Verification:

```bash
python -m py_compile daylens/*.py
python -m pytest tests/test_ingest.py -q
curl -X POST http://127.0.0.1:8777/api/ingest -H 'Content-Type: application/json' -d '{...}'
```

## Phase 4 — Browser intelligence and YouTube enrichment

**Objective:** Turn browser metadata into useful, privacy-limited categories and YouTube summaries.

**Files:**

- Modify: `connectors/browser/background.js`
- Create: `connectors/browser/youtube.js`
- Modify: `daylens/categorizer.py`
- Modify: `daylens/db.py`
- Modify: `daylens/server.py`
- Modify: dashboard frontend inside `daylens/server.py`
- Test: `tests/test_browser_metadata.py`

Features:

- Domain normalization: remove `www`, strip query/fragments, preserve only hostname.
- YouTube metadata: title, channel, video/shorts type, active watch duration.
- Rule-based first classification: learning, office, news, entertainment, social, coding.
- User-editable domain/category rules through existing Category Rules page.
- “Browser activity” leaderboard and YouTube breakdown in dashboard.
- Sensitive-domain redaction before storage.
- Clear indicator that browser metadata collection is enabled.

Do not send every event to an AI model. Aggregate locally by domain/category/video session first.

## Phase 5 — Unified timeline and analytics

**Objective:** Merge desktop and browser events into a reliable timeline without double-counting.

**Files:**

- Modify: `daylens/db.py`
- Modify: `daylens/server.py`
- Create: `daylens/aggregation.py`
- Modify: dashboard frontend
- Test: `tests/test_aggregation.py`

Features:

- Source badges: Windows, Chrome, Brave, Firefox, YouTube, manual.
- Session consolidation with gap tolerance.
- Deduplication between foreground browser process and browser extension event.
- Today/7-day/30-day charts using the same date range contract.
- Focus blocks, context switches, idle time, and category share.
- Search by app/domain/title, with sensitive values already redacted.
- Export to JSON/CSV and delete-by-date controls.

Acceptance criteria:

- Browser active time does not get counted twice as both Brave time and browser-tab time.
- Pausing desktop tracking pauses connector ingestion through the same local state.
- Dashboard remains usable with 100,000+ local activity records.

## Phase 6 — Optional app connectors

**Objective:** Add safe, opt-in metadata connectors only where an official API or stable local signal exists.

Candidate sources:

- Telegram Desktop: foreground-app duration only by default.
- Discord/WhatsApp Desktop: foreground-app duration only.
- Official Telegram bot/channel connector: messages posted by a user-authorized bot only.
- Music player: track title only if the local player exposes it and the user enables it.
- IDE/project connector: active project/repository name, not source-code content.
- File/document connector: application and file extension; redact government/NID paths by default.

Explicitly exclude:

- Private chat scraping
- Browser DOM scraping of Facebook/Telegram messages
- Credential/cookie extraction
- Hidden background surveillance

Each connector must have its own enable switch, data preview, pause button, and delete controls.

## Phase 7 — AI insight layer

**Objective:** Generate useful daily/weekly insights while keeping cost and privacy under control.

Architecture:

1. Local deterministic aggregation produces a compact redacted summary.
2. Optional AI provider receives only the compact summary, never raw browsing history or titles from blocked sources.
3. Cache the summary by data hash to avoid repeated API cost.
4. Default AI off; local rule-based report remains available.
5. Model routing: cheap/free model for categorization and summaries; stronger model only for an explicitly requested deep analysis.

Outputs:

- “Where did my day go?”
- Productive/distraction blocks, clearly labeled as estimates
- Context-switch count
- Repeated browsing patterns
- Weekly changes
- User-defined goals and reminders

---

# Data model additions

Add or migrate fields/tables carefully:

```text
activities:
  id, started_at, ended_at, app, window_title, category,
  idle_seconds, source, privacy_level, metadata_json

sources:
  id, source_name, source_type, enabled, created_at, last_seen_at

privacy_rules:
  id, pattern, rule_type, action, enabled

insight_cache:
  id, period_start, period_end, data_hash, model_label, summary, created_at
```

Use parameterized SQL for every query. Keep raw event retention configurable and provide delete/export actions.

---

# UX plan

### Overview

- Total tracked time
- Top category and app/domain
- Category share donut
- Hourly activity chart
- Source health indicators

### Timeline

- Unified chronological feed
- Source filters
- Category filters
- Search
- Privacy-redaction labels
- Load more / date range

### Sources

- Each source shown as a card with enabled/paused state
- “What this source collects” explanation
- Last event timestamp
- Preview of stored data
- Delete source data

### Privacy center

- Global pause
- Per-source pause
- Sensitive-domain list
- Incognito policy
- Retention days
- Export/delete all data

### Insights

- Local-only report button
- Optional AI report button with estimated token/cost display
- Clear “estimate, not judgment” language

---

# Risks and safeguards

- **Double counting:** source IDs, event IDs, and consolidation logic.
- **Privacy leakage:** blocklist, redaction before storage, no cookies/DOM/message bodies.
- **Browser permissions:** request only `tabs`, `storage`, and host permissions required by enabled sites.
- **Server exposure:** bind only to `127.0.0.1`; reject non-local ingestion requests.
- **Data growth:** daily aggregation, retention settings, SQLite indexes.
- **AI cost:** local aggregation, caching, free/cheap model default, manual deep-analysis action.
- **Windows startup:** add later only with visible tray status and uninstall instructions.
- **User trust:** every connector must display what it collects and offer pause/delete controls.

---

# Recommended execution order

1. Finish and verify current Phase 2 UI (already substantially implemented).
2. Implement local ingestion endpoint and tests.
3. Build Chrome/Brave extension first; Firefox adapter after the shared core works.
4. Add YouTube metadata as a separate opt-in toggle.
5. Merge and deduplicate events in the dashboard.
6. Add safe desktop-app metadata connectors.
7. Add AI insights last, with local-only mode first.

This keeps the product useful after every phase and avoids building an invasive, fragile “track everything” system.
