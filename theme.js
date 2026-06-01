const THEME_STORAGE_KEY = "themePreference";
const THEME_VALUES = new Set(["system", "light", "dark"]);
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

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
  const normalizedPreference = normalizeThemePreference(preference);
  const resolvedTheme = getResolvedTheme(normalizedPreference);

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = normalizedPreference;
  document.documentElement.style.colorScheme = resolvedTheme;

  window.dispatchEvent(new CustomEvent("gobling-theme-change", {
    detail: {
      preference: normalizedPreference,
      theme: resolvedTheme
    }
  }));

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const isDark = resolvedTheme === "dark";
    const nextTheme = isDark ? "light" : "dark";

    button.classList.toggle("is-dark", isDark);
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    button.title = `Switch to ${nextTheme} mode`;
  });
}

async function loadThemePreference() {
  const items = await chrome.storage.local.get({
    [THEME_STORAGE_KEY]: "system"
  });
  const preference = normalizeThemePreference(items[THEME_STORAGE_KEY]);

  applyThemePreference(preference);
  return preference;
}

async function setThemePreference(preference) {
  const normalizedPreference = normalizeThemePreference(preference);

  applyThemePreference(normalizedPreference);
  await chrome.storage.local.set({
    [THEME_STORAGE_KEY]: normalizedPreference
  });
}

systemThemeQuery.addEventListener("change", () => {
  const preference = document.documentElement.dataset.themePreference || "system";

  if (preference === "system") {
    applyThemePreference(preference);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[THEME_STORAGE_KEY]) {
    return;
  }

  applyThemePreference(changes[THEME_STORAGE_KEY].newValue);
});

window.GoblingTheme = {
  load: loadThemePreference,
  set: setThemePreference
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-toggle]");

  if (!button) {
    return;
  }

  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  setThemePreference(nextTheme);
});

loadThemePreference();
