/**
 * Theme application helpers. The tokens switch on [data-theme="dark"];
 * these helpers own setting the attribute and remembering the choice.
 * Kept framework-free so Next.js, Storybook, and the CLI can all use it.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "hirelens-theme";

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function storedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Resolve the effective theme: explicit choice, else the system's. */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Apply and persist a choice (pass null to follow the system again). */
export function setTheme(theme: Theme | null): void {
  if (theme === null) {
    window?.localStorage?.removeItem(STORAGE_KEY);
    applyTheme(systemTheme());
    return;
  }
  window?.localStorage?.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

/** Initialize the attribute as early as possible (app shell calls this). */
export function initTheme(): void {
  applyTheme(resolveTheme());
}
