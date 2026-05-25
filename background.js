// Background service worker for Goblin Counter.
// It receives counts from the content script, stores them, and updates the badge.

const BADGE_BACKGROUND_COLOR = "#d93025";

function formatBadgeCount(count) {
  // Chrome badges are tiny, so keep large counts readable.
  if (count > 999) {
    return "999+";
  }

  return String(count);
}

async function updateBadge(tabId, count) {
  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_BACKGROUND_COLOR,
    tabId
  });

  await chrome.action.setBadgeText({
    text: formatBadgeCount(count),
    tabId
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    pageGoblins: 0,
    pageGremlins: 0,
    lifetimeGoblins: 0,
    lifetimeGremlins: 0,
    countedMessages: {},
    highlightEnabled: true
  });

  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_BACKGROUND_COLOR
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GOBLING_COUNT_UPDATED") {
    return false;
  }

  const { pageGoblins = 0, pageGremlins = 0, incrementGoblins = 0, incrementGremlins = 0 } = message;
  const tabId = sender.tab && sender.tab.id;

  chrome.storage.local.get({
    lifetimeGoblins: 0,
    lifetimeGremlins: 0
  }).then((items) => {
    const nextLifetimeGoblins = (items.lifetimeGoblins || 0) + incrementGoblins;
    const nextLifetimeGremlins = (items.lifetimeGremlins || 0) + incrementGremlins;

    return chrome.storage.local.set({
      pageGoblins,
      pageGremlins,
      lifetimeGoblins: nextLifetimeGoblins,
      lifetimeGremlins: nextLifetimeGremlins
    });
  }).then(() => {
    if (typeof tabId === "number") {
      const totalPageCount = pageGoblins + pageGremlins;
      return updateBadge(tabId, totalPageCount);
    }
    return undefined;
  }).then(() => {
    sendResponse({ ok: true });
  }).catch((error) => {
    console.error("Gobling Counter failed to update:", error);
    sendResponse({ ok: false, error: error.message });
  });

  // Keep the message channel open while the async badge/storage work finishes.
  return true;
});
