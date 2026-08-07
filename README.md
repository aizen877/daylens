# DayLens

Privacy-first Windows activity and personal learning analytics. The project now includes the desktop collector, local SQLite dashboard, opt-in browser connector, YouTube watch tracking, and the persistent YouTube knowledge-layer foundation.

## Current capabilities

- Windows foreground app/window tracking and idle detection
- Local SQLite storage and HTML/CSS/JS dashboard at `http://127.0.0.1:8777`
- App categories, date ranges, timeline, charts, pause/resume, source badges
- Opt-in Chrome/Brave/Firefox active-tab connector
- YouTube long-form/Shorts metadata and watch-session tracking
- Persistent YouTube video, watch-session, transcript, and analysis tables

## Privacy boundaries

- No keylogging, screenshots, webcam, microphone, page body, passwords, cookies, forms, or private messages
- Browser tracking is disabled by default and can be enabled from connector options
- Data stays in local `data/daylens.db`; browser events are sent only to localhost
- User-controlled pause, source settings, and YouTube history deletion

## Run

```bash
python daylens.py init
python daylens.py dashboard --host 127.0.0.1 --port 8777
python daylens.py track --interval 5
```

Load the browser connector from `connectors/browser` using the appropriate manifest, then enable it from the Options page. Reload the extension after connector code updates.

## Tests and checks

```bash
python -m pytest -q
python -m py_compile daylens.py daylens/*.py tests/*.py
```

The current environment must have `pytest` installed to execute the test suite.
