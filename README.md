# Goblin Counter

Goblin Counter is a complete Chrome Extension that detects and counts creature-word mentions on ChatGPT pages in real time.

The extension continuously scans conversations on ChatGPT, updates the total count dynamically as new messages appear, and displays the result directly on the extension badge and popup UI.

Built with plain JavaScript using Chrome Extension Manifest V3.

---

## Features

- Runs only on `https://chatgpt.com/*`
- Counts every occurrence of `"goblin"`, `"goblins"`, `"gremlin"`, `"gremlins"`, `"raccoon"`, `"raccoons"`, `"troll"`, `"trolls"`, `"ogre"`, `"ogres"`, `"pigeon"`, and `"pigeons"` case-insensitively
- Counts assistant messages with `[data-message-author-role="assistant"]`
- Falls back to scanning `document.body.innerText` if assistant message markup is unavailable
- Real-time live updates using `MutationObserver`
- Extension badge count with red badge background
- Popup UI displaying separate Goblin and Gremlin counters for both the active page and lifetime totals
- Full details page with per-term page counts, lifetime totals, matched word forms, and enabled toggles
- Stores persistent lifetime counts and message state cache in `chrome.storage.local` with double-counting protection (handling refreshes, navigations, and live streaming)
- Optional highlight toggle for every visible match
- Ignores code blocks, inputs, and textareas
- Lightweight and beginner-friendly codebase

## Folder Structure

```text
goblin-counter/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── options.html
├── options.js
├── styles.css
├── icons/
│   └── README.md
└── README.md
```

## Files

- `manifest.json` configures Manifest V3, the ChatGPT-only content script, the popup, and the background service worker.
- `content.js` scans ChatGPT assistant messages, counts tracked creature terms separately, manages message caches to prevent double-counting, highlights matches, and watches page changes with `MutationObserver`.
- `background.js` manages and persists page and lifetime counts in `chrome.storage.local` and updates the extension badge with the total active page count.
- `popup.html`, `popup.js`, and `styles.css` provide the clean popup UI, highlight toggle, and details link.
- `options.html` and `options.js` provide the full details page.
- `icons/README.md` explains how to add placeholder PNG icons later.

## Install Locally in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select this `goblin-counter` folder.
5. Open `https://chatgpt.com/` and start or open a conversation.
6. Pin the extension to see the live badge count more easily.

## Notes

- The badge shows `999+` for counts above 999 because Chrome badge text is small.
- Highlighting is enabled by default and can be turned off from the popup.
- No React, TypeScript, frameworks, or bundlers are used.
