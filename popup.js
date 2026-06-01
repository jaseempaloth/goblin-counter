// Popup script for Goblin Counter.
// It reads the latest count from chrome.storage.local and keeps the UI live.

const pageGoblinsElement = document.getElementById("pageGoblinsCount");
const pageGremlinsElement = document.getElementById("pageGremlinsCount");
const lifetimeGoblinsElement = document.getElementById("lifetimeGoblinsCount");
const lifetimeGremlinsElement = document.getElementById("lifetimeGremlinsCount");
const highlightToggle = document.getElementById("highlightToggle");
const viewDetailsButton = document.getElementById("viewDetailsButton");
const statusElement = document.getElementById("status");

function updateCounts(counts) {
  if (pageGoblinsElement) pageGoblinsElement.textContent = String(Number(counts.pageGoblins) || 0);
  if (pageGremlinsElement) pageGremlinsElement.textContent = String(Number(counts.pageGremlins) || 0);
  if (lifetimeGoblinsElement) lifetimeGoblinsElement.textContent = String(Number(counts.lifetimeGoblins) || 0);
  if (lifetimeGremlinsElement) lifetimeGremlinsElement.textContent = String(Number(counts.lifetimeGremlins) || 0);
}

function showStatus(message) {
  statusElement.textContent = message;
}

function isChatGPTTab(tab) {
  return Boolean(
    tab &&
    tab.id &&
    typeof tab.url === "string" &&
    tab.url.startsWith("https://chatgpt.com/")
  );
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0];
}

async function askContentScriptToScan() {
  const activeTab = await getActiveTab();

  if (!isChatGPTTab(activeTab)) {
    showStatus("Open a ChatGPT conversation to start counting.");
    return;
  }

  try {
    await requestScan(activeTab.id);
    showStatus("Live on this ChatGPT page.");
  } catch (_error) {
    try {
      showStatus("Starting counter on this ChatGPT page...");
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
      });
      await requestScan(activeTab.id);
      showStatus("Live on this ChatGPT page.");
    } catch (_injectError) {
      showStatus("Refresh the ChatGPT tab if the counter has not started yet.");
    }
  }
}

async function requestScan(tabId) {
  await chrome.tabs.sendMessage(tabId, {
    type: "REQUEST_GOBLING_SCAN"
  });
}

async function setHighlightEnabled(enabled) {
  await chrome.storage.local.set({ highlightEnabled: enabled });

  const activeTab = await getActiveTab();

  if (!isChatGPTTab(activeTab)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "SET_HIGHLIGHT_ENABLED",
      enabled
    });
  } catch (_error) {
    // The storage value is still saved. The content script will read it the
    // next time a ChatGPT page loads.
  }
}

chrome.storage.local.get({
  pageGoblins: 0,
  pageGremlins: 0,
  lifetimeGoblins: 0,
  lifetimeGremlins: 0,
  highlightEnabled: true
}, (items) => {
  updateCounts(items);
  highlightToggle.checked = Boolean(items.highlightEnabled);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.pageGoblins && pageGoblinsElement) {
    pageGoblinsElement.textContent = String(Number(changes.pageGoblins.newValue) || 0);
  }
  if (changes.pageGremlins && pageGremlinsElement) {
    pageGremlinsElement.textContent = String(Number(changes.pageGremlins.newValue) || 0);
  }
  if (changes.lifetimeGoblins && lifetimeGoblinsElement) {
    lifetimeGoblinsElement.textContent = String(Number(changes.lifetimeGoblins.newValue) || 0);
  }
  if (changes.lifetimeGremlins && lifetimeGremlinsElement) {
    lifetimeGremlinsElement.textContent = String(Number(changes.lifetimeGremlins.newValue) || 0);
  }

  if (changes.highlightEnabled) {
    highlightToggle.checked = Boolean(changes.highlightEnabled.newValue);
  }
});

highlightToggle.addEventListener("change", () => {
  setHighlightEnabled(highlightToggle.checked);
});

viewDetailsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

askContentScriptToScan();
