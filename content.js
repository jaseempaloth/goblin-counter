// Content script for Goblin Counter.
// This file runs automatically on https://chatgpt.com/* pages.

if (!globalThis.__goblingCounterLoaded) {
globalThis.__goblingCounterLoaded = true;

const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"]';
const TRACKED_TERMS = [
  { id: "goblins", label: "Goblins", variants: ["goblin", "goblins"] },
  { id: "gremlins", label: "Gremlins", variants: ["gremlin", "gremlins"] },
  { id: "raccoons", label: "Raccoons", variants: ["raccoon", "raccoons"] },
  { id: "trolls", label: "Trolls", variants: ["troll", "trolls"] },
  { id: "ogres", label: "Ogres", variants: ["ogre", "ogres"] },
  { id: "pigeons", label: "Pigeons", variants: ["pigeon", "pigeons"] }
];
const DEFAULT_ENABLED_TERMS = TRACKED_TERMS.reduce((enabledTerms, term) => {
  enabledTerms[term.id] = true;
  return enabledTerms;
}, {});

let countedMessagesCache = {};
let storageLoaded = false;
let currentConversationId = "";
const HIGHLIGHT_CLASS = "gobling-counter-highlight";
const HIGHLIGHT_STYLE_ID = "gobling-counter-highlight-style";
const THEME_STORAGE_KEY = "themePreference";
const THEME_VALUES = new Set(["system", "light", "dark"]);
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

// These areas are ignored for both counting and highlighting.
const IGNORED_CONTENT_SELECTOR = [
  "pre",
  "code",
  "textarea",
  "input",
  "select",
  "option",
  "script",
  "style",
  "noscript",
  "[contenteditable='true']"
].join(",");

const IGNORED_HIGHLIGHT_SELECTOR = [
  IGNORED_CONTENT_SELECTOR,
  `.${HIGHLIGHT_CLASS}`
].join(",");

let observer;
let scanTimer;
let highlightEnabled = true;
let enabledTerms = { ...DEFAULT_ENABLED_TERMS };
let themePreference = "system";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getEnabledTrackedTerms() {
  return TRACKED_TERMS.filter((term) => enabledTerms[term.id] !== false);
}

function createTermRegex(term) {
  const variants = term.variants.map(escapeRegExp).join("|");
  return new RegExp(`\\b(${variants})\\b`, "gi");
}

function createAnyTermRegex(flags = "gi") {
  const variants = getEnabledTrackedTerms()
    .flatMap((term) => term.variants)
    .map(escapeRegExp)
    .join("|");

  return variants ? new RegExp(`\\b(${variants})\\b`, flags) : null;
}

function createEmptyCounts() {
  return TRACKED_TERMS.reduce((counts, term) => {
    counts[term.id] = 0;
    return counts;
  }, {});
}

function normalizeThemePreference(preference) {
  return THEME_VALUES.has(preference) ? preference : "system";
}

function getResolvedTheme(preference) {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return systemThemeQuery.matches ? "dark" : "light";
}

function applyThemePreference(preference) {
  themePreference = normalizeThemePreference(preference);
  document.documentElement.dataset.goblingTheme = getResolvedTheme(themePreference);
  document.documentElement.dataset.goblingThemePreference = themePreference;
}

function injectHighlightStyles() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    :root {
      --gobling-highlight-bg: #ffe27a;
      --gobling-highlight-text: #201a00;
      --gobling-highlight-ring: rgba(166, 120, 0, 0.28);
    }

    :root[data-gobling-theme="dark"] {
      --gobling-highlight-bg: #6b5410;
      --gobling-highlight-text: #fff7c2;
      --gobling-highlight-ring: rgba(255, 226, 122, 0.28);
    }

    .${HIGHLIGHT_CLASS} {
      background: var(--gobling-highlight-bg);
      color: var(--gobling-highlight-text);
      border-radius: 3px;
      box-shadow: 0 0 0 1px var(--gobling-highlight-ring);
      padding: 0 2px;
      transition: background-color 180ms ease, color 180ms ease,
        box-shadow 180ms ease;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
  `;

  document.documentElement.appendChild(style);
}

function getScanRoots() {
  const assistantMessages = Array.from(
    document.querySelectorAll(ASSISTANT_MESSAGE_SELECTOR)
  );

  // Bonus behavior: count assistant messages only when ChatGPT exposes the role
  // selector. Fall back to the full page so the extension still works if the
  // page markup changes.
  if (assistantMessages.length > 0) {
    return assistantMessages;
  }

  return document.body ? [document.body] : [];
}

function removeIgnoredElements(clone) {
  clone.querySelectorAll(IGNORED_CONTENT_SELECTOR).forEach((element) => {
    element.remove();
  });
}

function getReadableText(root) {
  const clone = root.cloneNode(true);
  removeIgnoredElements(clone);

  // The requested implementation scans innerText. textContent is only a small
  // fallback for cloned elements that have not been rendered by the page.
  if (root === document.body) {
    return clone.innerText || document.body.innerText || clone.textContent || "";
  }

  return clone.innerText || clone.textContent || "";
}

function getConversationId() {
  const match = window.location.pathname.match(/\/c\/([a-z0-9-]+)/i);
  return match ? match[1] : "new-chat";
}

function countMatchesInText(text, regex) {
  if (!regex) {
    return 0;
  }

  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function isIgnoredTextNode(textNode) {
  const parent = textNode.parentElement;

  if (!parent) {
    return true;
  }

  return Boolean(parent.closest(IGNORED_HIGHLIGHT_SELECTOR));
}

function clearHighlights() {
  document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`).forEach((highlight) => {
    const textNode = document.createTextNode(highlight.textContent);
    const parent = highlight.parentNode;

    highlight.replaceWith(textNode);

    // normalize() joins nearby text nodes, keeping the DOM tidier after
    // repeated updates.
    if (parent) {
      parent.normalize();
    }
  });
}

function createHighlightedFragment(text) {
  const fragment = document.createDocumentFragment();
  const highlightRegex = createAnyTermRegex("gi");

  if (!highlightRegex) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const pieces = text.split(highlightRegex);

  pieces.forEach((piece) => {
    if (!piece) {
      return;
    }

    if (createAnyTermRegex("i").test(piece)) {
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.textContent = piece;
      fragment.appendChild(mark);
      return;
    }

    fragment.appendChild(document.createTextNode(piece));
  });

  return fragment;
}

function highlightRoot(root) {
  const highlightRegex = createAnyTermRegex("i");

  if (!highlightRegex) {
    return;
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(textNode) {
        if (isIgnoredTextNode(textNode)) {
          return NodeFilter.FILTER_REJECT;
        }

        return highlightRegex.test(textNode.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const matchingTextNodes = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    matchingTextNodes.push(currentNode);
    currentNode = walker.nextNode();
  }

  matchingTextNodes.forEach((textNode) => {
    textNode.replaceWith(createHighlightedFragment(textNode.nodeValue));
  });
}

function renderHighlights() {
  // Disconnect while editing the DOM so our own <mark> updates do not trigger
  // another scan loop.
  stopObserver();
  clearHighlights();

  if (highlightEnabled) {
    getScanRoots().forEach(highlightRoot);
  }

  startObserver();
}

function sendCountToBackground(pageCounts, increments) {
  chrome.runtime.sendMessage({
    type: "GOBLING_COUNT_UPDATED",
    pageCounts,
    increments,
    pageGoblins: pageCounts.goblins || 0,
    pageGremlins: pageCounts.gremlins || 0,
    incrementGoblins: increments.goblins || 0,
    incrementGremlins: increments.gremlins || 0
  });
}

function scanPage() {
  if (!document.body || !storageLoaded) {
    return;
  }

  // Detect URL change (e.g. from new-chat to a conversation id)
  const newConversationId = getConversationId();
  if (currentConversationId && currentConversationId !== newConversationId && currentConversationId === "new-chat") {
    let updated = false;
    for (const key in countedMessagesCache) {
      if (key.startsWith("new-chat-msg-") || key.startsWith("new-chat-body")) {
        const newKey = key.replace("new-chat-msg-", `${newConversationId}-msg-`)
                          .replace("new-chat-body", `${newConversationId}-body`);
        countedMessagesCache[newKey] = countedMessagesCache[key];
        delete countedMessagesCache[key];
        updated = true;
      }
    }
    if (updated) {
      chrome.storage.local.set({ countedMessages: countedMessagesCache });
    }
  }
  currentConversationId = newConversationId;

  const roots = getScanRoots();
  const pageCounts = createEmptyCounts();
  const increments = createEmptyCounts();
  const enabledTrackedTerms = getEnabledTrackedTerms();

  roots.forEach((root, index) => {
    let key;
    if (root === document.body) {
      key = `${currentConversationId}-body`;
    } else {
      const msgId = root.getAttribute("data-message-id");
      key = msgId ? msgId : `${currentConversationId}-msg-${index}`;
    }

    const text = getReadableText(root);
    const prev = countedMessagesCache[key] || createEmptyCounts();

    enabledTrackedTerms.forEach((term) => {
      const count = countMatchesInText(text, createTermRegex(term));
      pageCounts[term.id] += count;

      const previousCount = Number(prev[term.id]) || 0;
      const diff = count - previousCount;

      if (diff > 0) {
        increments[term.id] += diff;
      }

      // Keep state aligned if count went down (e.g. text cleared / edited)
      prev[term.id] = count;
    });

    countedMessagesCache[key] = prev;
  });

  chrome.storage.local.set({ countedMessages: countedMessagesCache });
  sendCountToBackground(pageCounts, increments);
  renderHighlights();
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scanPage, 250);
}

function startObserver() {
  if (observer || !document.body) {
    return;
  }

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function stopObserver() {
  if (!observer) {
    return;
  }

  observer.disconnect();
  observer = undefined;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SET_HIGHLIGHT_ENABLED") {
    highlightEnabled = Boolean(message.enabled);
    chrome.storage.local.set({ highlightEnabled });
    scanPage();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "REQUEST_GOBLING_SCAN") {
    scanPage();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  let shouldScan = false;

  if (changes.highlightEnabled) {
    highlightEnabled = Boolean(changes.highlightEnabled.newValue);
    shouldScan = true;
  }

  if (changes.enabledTerms) {
    enabledTerms = {
      ...DEFAULT_ENABLED_TERMS,
      ...(changes.enabledTerms.newValue || {})
    };
    shouldScan = true;
  }

  if (changes[THEME_STORAGE_KEY]) {
    applyThemePreference(changes[THEME_STORAGE_KEY].newValue);
  }

  if (shouldScan) {
    scanPage();
  }
});

systemThemeQuery.addEventListener("change", () => {
  if (themePreference === "system") {
    applyThemePreference(themePreference);
  }
});

chrome.storage.local.get({
  highlightEnabled: true,
  countedMessages: {},
  enabledTerms: DEFAULT_ENABLED_TERMS,
  [THEME_STORAGE_KEY]: "system"
}, (items) => {
  highlightEnabled = Boolean(items.highlightEnabled);
  enabledTerms = {
    ...DEFAULT_ENABLED_TERMS,
    ...(items.enabledTerms || {})
  };
  applyThemePreference(items[THEME_STORAGE_KEY]);
  countedMessagesCache = items.countedMessages || {};
  storageLoaded = true;
  injectHighlightStyles();
  scanPage();
  startObserver();
});
}
