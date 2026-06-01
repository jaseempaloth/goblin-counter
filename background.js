// Background service worker for Goblin Counter.
// It receives counts from the content script, stores them, and updates the badge.

const BADGE_BACKGROUND_COLOR = "#d93025";
const TRACKED_TERMS = [
  "goblins",
  "gremlins",
  "raccoons",
  "trolls",
  "ogres",
  "pigeons"
];
const DEFAULT_ENABLED_TERMS = TRACKED_TERMS.reduce((enabledTerms, termId) => {
  enabledTerms[termId] = true;
  return enabledTerms;
}, {});

function createEmptyCounts() {
  return TRACKED_TERMS.reduce((counts, termId) => {
    counts[termId] = 0;
    return counts;
  }, {});
}

function normalizeCounts(counts = {}) {
  return {
    ...createEmptyCounts(),
    ...counts
  };
}

function getTotalCount(counts) {
  return TRACKED_TERMS.reduce((total, termId) => {
    return total + (Number(counts[termId]) || 0);
  }, 0);
}

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
  const items = await chrome.storage.local.get({
    pageGoblins: 0,
    pageGremlins: 0,
    lifetimeGoblins: 0,
    lifetimeGremlins: 0,
    pageCounts: createEmptyCounts(),
    lifetimeCounts: createEmptyCounts(),
    enabledTerms: DEFAULT_ENABLED_TERMS,
    countedMessages: {},
    highlightEnabled: true,
    themePreference: "system"
  });

  await chrome.storage.local.set({
    pageGoblins: items.pageGoblins,
    pageGremlins: items.pageGremlins,
    lifetimeGoblins: items.lifetimeGoblins,
    lifetimeGremlins: items.lifetimeGremlins,
    pageCounts: normalizeCounts({
      ...items.pageCounts,
      goblins: items.pageGoblins,
      gremlins: items.pageGremlins
    }),
    lifetimeCounts: normalizeCounts({
      ...items.lifetimeCounts,
      goblins: items.lifetimeGoblins,
      gremlins: items.lifetimeGremlins
    }),
    enabledTerms: {
      ...DEFAULT_ENABLED_TERMS,
      ...(items.enabledTerms || {})
    },
    countedMessages: items.countedMessages,
    highlightEnabled: items.highlightEnabled,
    themePreference: ["system", "light", "dark"].includes(items.themePreference)
      ? items.themePreference
      : "system"
  });

  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_BACKGROUND_COLOR
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GOBLING_COUNT_UPDATED") {
    return false;
  }

  const pageCounts = normalizeCounts({
    goblins: message.pageGoblins || 0,
    gremlins: message.pageGremlins || 0,
    ...(message.pageCounts || {})
  });
  const increments = normalizeCounts({
    goblins: message.incrementGoblins || 0,
    gremlins: message.incrementGremlins || 0,
    ...(message.increments || {})
  });
  const tabId = sender.tab && sender.tab.id;

  chrome.storage.local.get({
    lifetimeGoblins: 0,
    lifetimeGremlins: 0,
    lifetimeCounts: createEmptyCounts()
  }).then((items) => {
    const currentLifetimeCounts = normalizeCounts({
      ...items.lifetimeCounts,
      goblins: items.lifetimeGoblins,
      gremlins: items.lifetimeGremlins
    });
    const nextLifetimeCounts = createEmptyCounts();

    TRACKED_TERMS.forEach((termId) => {
      nextLifetimeCounts[termId] =
        (Number(currentLifetimeCounts[termId]) || 0) +
        (Number(increments[termId]) || 0);
    });

    return chrome.storage.local.set({
      pageCounts,
      lifetimeCounts: nextLifetimeCounts,
      pageGoblins: pageCounts.goblins || 0,
      pageGremlins: pageCounts.gremlins || 0,
      lifetimeGoblins: nextLifetimeCounts.goblins || 0,
      lifetimeGremlins: nextLifetimeCounts.gremlins || 0
    });
  }).then(() => {
    if (typeof tabId === "number") {
      return updateBadge(tabId, getTotalCount(pageCounts));
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
