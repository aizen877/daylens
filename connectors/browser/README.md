# DayLens Browser Connector v0.1

This WebExtension sends only opt-in active-tab metadata to the local DayLens agent.

## Install in Chrome/Brave

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this `connectors/browser` folder.
5. Open the extension Options page.
6. Enable tracking explicitly.

## Privacy

No page body, passwords, cookies, forms, messages, screenshots, or incognito tabs are collected. Sensitive domain fragments are blocked before the request is sent. The endpoint must remain on localhost.

Firefox uses `manifest.firefox.json`; Chrome/Brave use `manifest.chrome.json`. Rename the selected manifest to `manifest.json` before loading if the browser requires it.
