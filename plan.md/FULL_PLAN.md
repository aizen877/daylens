# DayLens Full Product Plan

**Project:** DayLens — privacy-first personal activity, learning, and life analytics system  
**Workspace:** `C:\Users\Windos 11-510\Desktop\daylens-mvp`  
**Last updated:** 2026-08-06  
**Current implementation stage:** Desktop tracking + dashboard + browser/YouTube tracking + YouTube knowledge-layer foundation

> This is the master product plan. It is intentionally separate from `.hermes/plans/`, which contains implementation-specific plans.

---

## 1. Product vision

DayLens will help the user understand where computer and daily-life time goes, while turning watched educational content into a searchable personal learning memory.

The product will have multiple collectors/connectors but one user-facing product:

```text
Windows Agent
Chrome / Brave / Firefox Connector
YouTube Intelligence
Optional App Connectors
Optional Mobile / Location Companion
                 ↓
          Local DayLens API
                 ↓
           One SQLite database
                 ↓
          One unified dashboard
                 ↓
       Analytics, learning memory, AI insights
```

**Important:** Separate systems/connectors do not mean separate dashboards. Everything must appear in the same DayLens dashboard and unified timeline.

---

## 2. Core architecture

### System A — Windows Desktop Agent

Responsibilities:

- Foreground application/process tracking
- Active window title tracking
- Idle detection
- Pause/resume control
- Local HTTP API
- SQLite database and migrations
- Dashboard server
- Future visible tray/startup integration
- Local privacy controls

Likely files:

- `daylens/collector.py`
- `daylens/db.py`
- `daylens/server.py`
- `daylens/categorizer.py`
- `daylens/cli.py`
- `daylens/config.py`

### System B — DayLens Connectors

Responsibilities:

- Browser active-tab metadata
- YouTube video/session metadata
- Optional safe app metadata
- Local-only POST to `http://127.0.0.1:8777/api/ingest`
- Per-source enable/pause controls

Current connector directory:

- `connectors/browser/background.js`
- `connectors/browser/youtube.js`
- `connectors/browser/options.html`
- `connectors/browser/options.js`
- `connectors/browser/manifest.chrome.json`
- `connectors/browser/manifest.firefox.json`

### One product rule

Collectors may be separate, but the user sees:

- One dashboard
- One timeline
- One database
- One privacy center
- One export/delete system

---

## 3. Privacy and safety policy

### Never collect

- Keystrokes/keylogging
- Passwords or form fields
- Cookies, auth tokens, local storage
- Page body or arbitrary DOM content
- Facebook/Telegram private messages
- Screenshots by default
- Webcam or microphone
- Hidden surveillance data
- Browser history databases
- Private data from government/NID/financial pages without explicit user control

### Allowed only through explicit user settings

- Browser active domain and title
- YouTube title/channel/description/transcript
- Incognito tracking
- User-defined blocked domains
- Optional screen preview, only if visibly enabled
- AI analysis of selected local content

### Default behavior

- Browser connector disabled until enabled by the user
- Incognito tracking disabled
- Server binds to `127.0.0.1` only
- No cloud sync
- AI optional/off by default
- Raw data stored locally
- Transcript and AI results deletable

The user explicitly does **not** want a default blocked-domain list. Therefore, the default blocked list stays empty; blocked domains remain user-configurable.

---

## 4. Phase status overview

| Phase | Name | Status |
|---|---|---|
| 1 | Desktop foundation | Complete |
| 2 | Dashboard/UI/UX | Complete and continuing polish |
| 3A | Browser connector foundation | Complete prototype |
| 3B | YouTube session tracking | Complete prototype |
| 3C | Transcript fetcher + status pipeline | Implemented by Antigravity; verify/integrate |
| 3D | YouTube AI analysis | Next major implementation |
| 3E | YouTube knowledge dashboard | Partially started; finish after analysis layer |
| 4 | Unified analytics and double-count protection | Pending |
| 5 | Optional safe app connectors | Pending |
| 6 | AI daily/weekly life insights | Pending |
| 7 | Mobile/location companion | Future |
| 8 | Packaging, startup, tray, backup | Future |

---

# Phase 1 — Desktop foundation ✅

## Goal

Collect basic Windows activity locally and reliably.

## Implemented

- Active process/application
- Window title
- Idle seconds
- Configurable polling interval
- SQLite `activities` table
- Local report
- Category rules
- Pause/resume state
- Local dashboard/API

## Acceptance criteria

- Tracker runs on Windows
- Data remains local
- Ctrl+C stops the collector cleanly
- No screenshots or keylogging
- Existing database is not reset during upgrades

## Remaining hardening

- Persist pause state across server restarts
- Add graceful session closure on shutdown
- Add SQLite indexes for large datasets
- Add retention policy
- Add a visible tray/status process later

---

# Phase 2 — Dashboard and UI/UX ✅

## Goal

Create one polished premium dashboard for all sources.

## Implemented UI

- Dark glassmorphism design
- Orange/cyan/purple glow accents
- Light/dark theme
- Sidebar navigation
- Overview analytics
- Timeline Feed
- Category Rules
- Settings & Control
- YouTube Intelligence page
- 24-hour activity chart
- Category breakdown
- Software leaderboard
- Source badges
- Search and filters
- Date ranges
- Pause/resume control
- YouTube cards/modal/filtering

## Dashboard navigation target

```text
Overview
Timeline
Apps & Websites
YouTube Intelligence
Focus & Productivity
Insights
Sources
Privacy Center
Settings
```

Some pages can be introduced gradually; do not fill them with fake metrics.

## Next UI polish

- Add source health cards
- Show connector enabled/paused state
- Add transcript status badges
- Add summary/key-points modal
- Add source-specific delete controls
- Remove or gate `/api/screen` behind explicit opt-in
- Keep dashboard responsive and fast with large datasets

---

# Phase 3A — Browser connector foundation ✅

## Goal

Capture active browser tab metadata through an opt-in extension.

## Implemented

- Chrome/Brave/Firefox manifests
- Active tab event collection
- Domain normalization
- Page title
- Favicon metadata
- Local `/api/ingest`
- Source field in activities
- Configurable blocked-domain list
- Local endpoint configuration
- Source badges in timeline

## Must verify/harden

- Remove duplicate/conflicting manifest workflow
- Make `manifest.json` a clean usable default or document exact build step
- Confirm old browser storage cannot silently re-enable tracking
- Ensure all non-local ingestion requests are rejected
- Test browser-extension reload after code changes
- Confirm browser events respect DayLens pause state

---

# Phase 3B — YouTube session tracking ✅ prototype

## Goal

Track YouTube video sessions without reading page content or private data.

## Implemented

- `youtube.js` content script
- Watch page and Shorts matching
- Video ID
- Title
- Channel
- Long-form vs Shorts
- Play/pause/ended events
- Position seconds
- Heartbeat
- Actual watch seconds fields
- YouTube dashboard endpoint
- Long/Short filters
- Top channels/topics based on metadata
- Duration/avatar fallbacks

## Required hardening

- Pause must stop watch time accurately
- Tab switch must close/finish the active session
- Browser close/crash must not create huge duration
- Heartbeats must not inflate watch seconds
- Same video in separate sessions must remain distinguishable
- Different video IDs must never merge
- Total dashboard time must not double count Brave + YouTube

---

# Phase 3C — Transcript fetcher + status pipeline 🔄

## User note

The user reports that this step was implemented through Antigravity IDE. Do not reimplement blindly. First inspect, test, and integrate the existing work.

## Goal

Fetch available YouTube captions/transcripts locally and maintain reliable status.

## Required statuses

```text
unknown
pending
fetching
available
unavailable
failed
```

## Required data

- Video ID
- Transcript language
- Automatic/manual type
- Timestamp segments
- Full text or summary-only mode
- Retrieved time
- Error code/message without leaking secrets

## Required behavior

1. Select a YouTube video from the dashboard or after a configured watch threshold.
2. Check whether captions are available.
3. Fetch transcript using a local/free method.
4. Normalize timestamp segments.
5. Store in `youtube_transcripts`.
6. Update `youtube_videos.transcript_status`.
7. Retry transient failures with a bounded retry count.
8. Mark unavailable rather than crashing when captions do not exist.
9. Allow delete transcript.
10. Never require cookies or login-token extraction.

## Verification tasks before moving on

- Inspect the Antigravity-created files and routes.
- Run the fetcher against a known public video with Bangla captions.
- Test a video with unavailable captions.
- Test a long transcript and chunk limits.
- Confirm transcript is local in SQLite/files and not automatically uploaded.
- Confirm delete removes transcript and status resets.
- Confirm API returns status without returning raw transcript unless requested.

## Acceptance criteria

- One real public video returns `available` with non-empty text/segments.
- Unavailable captions return `unavailable`, not a traceback.
- Repeated fetch is cached/idempotent.
- Transcript belongs to the correct video ID.
- No cookies, tokens, page body, or private data are collected.

---

# Phase 3D — YouTube AI analysis ⬜ next major step

## Goal

Turn verified title/description/transcript into structured personal learning metadata.

## Input priority

```text
Transcript > title + description > title only
```

## Local-first pipeline

```text
Transcript
   ↓
Clean and redact locally
   ↓
Chunk if necessary
   ↓
Create compact analysis prompt
   ↓
Free/cheap model
   ↓
Validate JSON
   ↓
Save to youtube_analyses
```

## Required JSON output

```json
{
  "primary_topic": "",
  "subtopics": [],
  "summary": "",
  "key_points": [],
  "chapters": [],
  "keywords": [],
  "entities": [],
  "learning_label": "learning|entertainment|mixed|other",
  "confidence": 0.0,
  "claims_needing_verification": []
}
```

## Rules

- AI must not invent details absent from source.
- Creator claims must be marked as claims/unverified where relevant.
- Fallback rule-based classification must work without AI.
- Cache by transcript/title data hash.
- Do not send every heartbeat or raw activity event to AI.
- User can request deep analysis manually.
- Free model first; paid/strong model only for explicit deep analysis.

## Example labels

- coding
- AI/tools
- education
- business
- news
- gaming
- entertainment
- religion
- sports
- other

---

# Phase 3E — YouTube knowledge dashboard ⬜

## Goal

Make each watched video a searchable learning item.

## Video card

- Thumbnail
- Title
- Channel
- Watch duration
- Video duration
- Progress
- Long/Short badge
- Transcript available badge
- Topic label
- Analysis status
- Learning label

## Detail view

- Summary
- Chapters
- Key points
- Keywords/entities
- Transcript status
- Transcript preview
- Open on YouTube
- Analyze button
- Delete transcript
- Delete analysis
- User notes
- Action items

## Future learning fields

- Bookmark
- Rating
- Notes
- Takeaways
- Review schedule
- Knowledge status: unread/started/completed/reviewed
- Related video IDs
- Topic IDs

---

# Phase 4 — Unified analytics and double-count protection ⬜

## Goal

Merge all sources into one reliable timeline without inflating time.

## Required work

- Create `daylens/aggregation.py`
- Normalize source event IDs
- Session consolidation with gap tolerance
- Browser foreground vs active-tab deduplication
- YouTube detail nested under browser time
- Focus blocks
- Context-switch count
- Idle time
- Category share
- Today/7-day/30-day comparison
- Search and source filters
- JSON/CSV export
- Delete by date/source

## Acceptance criteria

If one hour is spent on YouTube in Brave:

```text
Brave detail: 1 hour
YouTube detail: 1 hour
Unified active total: 1 hour, not 2 hours
```

Dashboard must remain usable with 100,000+ local activity records.

---

# Phase 5 — Optional safe app connectors ⬜

All connectors must be opt-in and show what they collect.

## Candidate sources

### Telegram

- Telegram Desktop foreground duration
- Telegram Web active-domain duration
- Official bot/channel data only with user authorization

Never private-message scraping.

### Facebook

- Active-domain time
- Limited page title/category if enabled

Never private messages, cookies, or account scraping.

### WhatsApp/Discord

- Foreground app time
- Web domain time
- No message content

### IDE/project

- Active IDE
- Project/repository name
- Coding session

Never upload source code.

### Music

- Music player foreground time
- Track title only where a safe official/local signal exists

### Documents

- Application and file extension
- Optional document category
- Redact government/NID paths by default if the user later enables that protection

Each connector requires:

- Enable switch
- Pause button
- Preview of collected data
- Last event time
- Delete source data

---

# Phase 6 — AI life insights ⬜

## Goal

Generate daily/weekly insights from compact local aggregates.

## Outputs

- “Where did my day go?”
- Productive/distraction blocks, clearly labeled estimates
- Context-switch analysis
- Repeated browsing patterns
- Best working hours
- Weekly changes
- User goals and reminders
- Learning time and topic trends
- Watched-but-not-reviewed learning queue

## Privacy/cost architecture

```text
Raw events
   ↓
Local deterministic aggregation
   ↓
Sensitive data removal
   ↓
Compact summary
   ↓
Optional AI
   ↓
Hash-based cache
```

Default AI off; rule-based reports must remain available.

---

# Phase 7 — Mobile/location companion ⬜ future

Only after the desktop/browser system is stable.

- Mobile activity companion
- Opt-in location timeline
- Home/office/market detection
- Travel/walking time
- PC + phone combined day report
- Location pause and delete
- Controlled/local sync

No hidden tracking.

---

# Phase 8 — Packaging and reliability ⬜ future

- One-click Windows launcher
- Visible tray icon
- Start/stop/pause controls
- Optional Windows startup with clear uninstall
- Database backup/export
- Data retention settings
- Migration versioning
- Crash logging without private content
- Local health/status page
- Extension installation helper

---

## 5. Current database target

### Existing/core

```text
activities
category_rules
app_icons
```

### YouTube knowledge layer

```text
youtube_videos
youtube_watch_sessions
youtube_transcripts
youtube_analyses
```

### Future

```text
sources
privacy_rules
insight_cache
user_notes
learning_topics
```

All SQL must be parameterized. Migrations must preserve existing user data. Add indexes after measuring real data size.

---

## 6. Current immediate execution order

1. Inspect and verify Antigravity's transcript fetcher implementation.
2. Run syntax checks and real transcript tests.
3. Fix only transcript integration bugs.
4. Add/complete transcript API and delete/status behavior.
5. Build the rule-based analysis fallback.
6. Build the free-model structured AI analysis agent.
7. Add summary/key-points/chapter UI.
8. Harden YouTube sessions and double-counting.
9. Add unified aggregation.
10. Add optional app connectors.
11. Add daily/weekly AI life insights.
12. Add mobile/location only at the end.

---

## 7. Quality gates for every phase

Before marking a phase complete:

- Inspect actual files
- Run Python compile checks
- Run JavaScript syntax checks
- Validate manifests
- Run pytest if available
- Run direct smoke tests if pytest is unavailable
- Run one real end-to-end API test
- Check database row counts and data shape
- Audit privacy/security changes
- Do not claim tests passed if a dependency prevented execution
- Do not delete production data during tests

---

## 8. Definition of done for final DayLens

DayLens is complete when:

- Desktop, browser, YouTube, and optional connectors share one local data model.
- Dashboard shows a reliable unified timeline.
- Time is not double-counted.
- YouTube videos can be transcripted, summarized, tagged, and searched locally.
- Daily/weekly insights are useful but clearly labeled as estimates.
- User can pause, inspect, export, and delete every source.
- No spyware behavior exists.
- AI is optional, privacy-aware, cached, and cost-controlled.
- Existing user data survives upgrades.
