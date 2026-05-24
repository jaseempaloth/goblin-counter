# Gobling Counter

Gobling Counter is a Chrome Extension that detects and counts occurrences of the word "gobling" on ChatGPT pages in real time.

The extension continuously scans conversations on ChatGPT, updates the total count dynamically as new messages appear, and displays the result directly on the extension badge and popup UI.

Built with plain JavaScript using Chrome Extension Manifest V3.

---

## Features

- Counts every occurrence of `"gobling"` on ChatGPT pages
- Real-time live updates using `MutationObserver`
- Case-insensitive detection
- Extension badge count
- Popup UI with total gobling count
- Lightweight and beginner-friendly codebase
- Runs automatically on `chatgpt.com`
