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

const pageTotalElement = document.getElementById("pageTotalCount");
const lifetimeTotalElement = document.getElementById("lifetimeTotalCount");
const termRowsElement = document.getElementById("termRows");
const highlightToggle = document.getElementById("detailsHighlightToggle");

let currentEnabledTerms = { ...DEFAULT_ENABLED_TERMS };

function createEmptyCounts() {
  return TRACKED_TERMS.reduce((counts, term) => {
    counts[term.id] = 0;
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
  return TRACKED_TERMS.reduce((total, term) => {
    return total + (Number(counts[term.id]) || 0);
  }, 0);
}

function formatVariants(variants) {
  return variants.join(", ");
}

function updateSummary(pageCounts, lifetimeCounts) {
  pageTotalElement.textContent = String(getTotalCount(pageCounts));
  lifetimeTotalElement.textContent = String(getTotalCount(lifetimeCounts));
}

function createTermRow(term, pageCounts, lifetimeCounts) {
  const row = document.createElement("tr");
  const labelCell = document.createElement("th");
  const variantsCell = document.createElement("td");
  const pageCell = document.createElement("td");
  const lifetimeCell = document.createElement("td");
  const enabledCell = document.createElement("td");
  const toggle = document.createElement("input");

  labelCell.scope = "row";
  labelCell.textContent = term.label;

  variantsCell.textContent = formatVariants(term.variants);
  variantsCell.className = "variants-cell";

  pageCell.textContent = String(Number(pageCounts[term.id]) || 0);
  pageCell.className = "numeric-cell";

  lifetimeCell.textContent = String(Number(lifetimeCounts[term.id]) || 0);
  lifetimeCell.className = "numeric-cell";

  toggle.type = "checkbox";
  toggle.role = "switch";
  toggle.checked = currentEnabledTerms[term.id] !== false;
  toggle.setAttribute("aria-label", `${term.label} enabled`);
  toggle.addEventListener("change", () => {
    currentEnabledTerms = {
      ...currentEnabledTerms,
      [term.id]: toggle.checked
    };
    chrome.storage.local.set({ enabledTerms: currentEnabledTerms });
  });

  enabledCell.className = "toggle-cell";
  enabledCell.appendChild(toggle);

  row.append(labelCell, variantsCell, pageCell, lifetimeCell, enabledCell);
  return row;
}

function renderDetails(items) {
  const pageCounts = normalizeCounts({
    ...items.pageCounts,
    goblins: items.pageGoblins,
    gremlins: items.pageGremlins
  });
  const lifetimeCounts = normalizeCounts({
    ...items.lifetimeCounts,
    goblins: items.lifetimeGoblins,
    gremlins: items.lifetimeGremlins
  });

  currentEnabledTerms = {
    ...DEFAULT_ENABLED_TERMS,
    ...(items.enabledTerms || {})
  };

  highlightToggle.checked = Boolean(items.highlightEnabled);
  termRowsElement.replaceChildren(
    ...TRACKED_TERMS.map((term) => createTermRow(term, pageCounts, lifetimeCounts))
  );
  updateSummary(pageCounts, lifetimeCounts);
}

chrome.storage.local.get({
  pageGoblins: 0,
  pageGremlins: 0,
  lifetimeGoblins: 0,
  lifetimeGremlins: 0,
  pageCounts: createEmptyCounts(),
  lifetimeCounts: createEmptyCounts(),
  enabledTerms: DEFAULT_ENABLED_TERMS,
  highlightEnabled: true
}, renderDetails);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  chrome.storage.local.get({
    pageGoblins: 0,
    pageGremlins: 0,
    lifetimeGoblins: 0,
    lifetimeGremlins: 0,
    pageCounts: createEmptyCounts(),
    lifetimeCounts: createEmptyCounts(),
    enabledTerms: DEFAULT_ENABLED_TERMS,
    highlightEnabled: true
  }, renderDetails);
});

highlightToggle.addEventListener("change", () => {
  chrome.storage.local.set({ highlightEnabled: highlightToggle.checked });
});
