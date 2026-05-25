// Content script for Goblin Counter.
// This file runs automatically on https://chatgpt.com/* pages.

const GOBLING_REGEX = /\b(goblins?|gremlins?)\b/gi;
const GOBLIN_REGEX = /\bgoblins?\b/gi;
const GREMLIN_REGEX = /\bgremlins?\b/gi;
const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"]';

let countedMessagesCache = {};
let storageLoaded = false;
let currentConversationId = "";
const HIGHLIGHT_CLASS = "gobling-counter-highlight";
const HIGHLIGHT_STYLE_ID = "gobling-counter-highlight-style";

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

function injectHighlightStyles() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background: #ffdf5d;
      color: inherit;
      border-radius: 3px;
      padding: 0 2px;
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
  const pieces = text.split(/\b(goblins?|gremlins?)\b/gi);

  pieces.forEach((piece) => {
    if (!piece) {
      return;
    }

    if (/^(goblins?|gremlins?)$/i.test(piece)) {
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
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(textNode) {
        if (isIgnoredTextNode(textNode)) {
          return NodeFilter.FILTER_REJECT;
        }

        return /\b(goblins?|gremlins?)\b/i.test(textNode.nodeValue)
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

function sendCountToBackground(pageGoblins, pageGremlins, incrementGoblins, incrementGremlins) {
  chrome.runtime.sendMessage({
    type: "GOBLING_COUNT_UPDATED",
    pageGoblins,
    pageGremlins,
    incrementGoblins,
    incrementGremlins
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
  let totalPageGoblins = 0;
  let totalPageGremlins = 0;
  let incrementGoblins = 0;
  let incrementGremlins = 0;

  roots.forEach((root, index) => {
    let key;
    if (root === document.body) {
      key = `${currentConversationId}-body`;
    } else {
      const msgId = root.getAttribute("data-message-id");
      key = msgId ? msgId : `${currentConversationId}-msg-${index}`;
    }

    const text = getReadableText(root);
    const goblins = countMatchesInText(text, GOBLIN_REGEX);
    const gremlins = countMatchesInText(text, GREMLIN_REGEX);

    totalPageGoblins += goblins;
    totalPageGremlins += gremlins;

    const prev = countedMessagesCache[key] || { goblins: 0, gremlins: 0 };
    const diffGoblins = goblins - prev.goblins;
    const diffGremlins = gremlins - prev.gremlins;

    if (diffGoblins > 0) {
      incrementGoblins += diffGoblins;
      prev.goblins = goblins;
    }
    if (diffGremlins > 0) {
      incrementGremlins += diffGremlins;
      prev.gremlins = gremlins;
    }

    // Keep state aligned if count went down (e.g. text cleared / edited)
    if (goblins < prev.goblins) {
      prev.goblins = goblins;
    }
    if (gremlins < prev.gremlins) {
      prev.gremlins = gremlins;
    }

    countedMessagesCache[key] = prev;
  });

  chrome.storage.local.set({ countedMessages: countedMessagesCache });
  sendCountToBackground(totalPageGoblins, totalPageGremlins, incrementGoblins, incrementGremlins);
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
  if (areaName !== "local" || !changes.highlightEnabled) {
    return;
  }

  highlightEnabled = Boolean(changes.highlightEnabled.newValue);
  scanPage();
});

chrome.storage.local.get({
  highlightEnabled: true,
  countedMessages: {}
}, (items) => {
  highlightEnabled = Boolean(items.highlightEnabled);
  countedMessagesCache = items.countedMessages || {};
  storageLoaded = true;
  injectHighlightStyles();
  scanPage();
  startObserver();
});
