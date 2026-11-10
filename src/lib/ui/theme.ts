// Light, dark or system: follows the OS until the visitor picks light or dark, then remembers it,
// and "system" goes back to following the OS. The inline init
// script applies the class before first paint so there is no flash of the wrong theme.
export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "mdstudio-theme";

export const parseTheme = (v: unknown): Theme => (v === "light" || v === "dark" ? v : "system");

export const resolveTheme = (theme: Theme, prefersDark: boolean): "light" | "dark" =>
  theme === "system" ? (prefersDark ? "dark" : "light") : theme;

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function storedTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme, prefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/** The choice a click on the theme button moves to: light, then dark, then system, then light again. */
export const nextTheme = (theme: Theme): Theme =>
  theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

const listeners = new Set<() => void>();
/** Calls `notify` whenever the choice changes (here, or in another tab). Returns how to stop. */
export function subscribeTheme(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** Applies a choice and remembers it. "system" forgets the choice, so the OS decides again. */
export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode: the choice just lasts for this page view
  }
  applyTheme(theme);
  for (const l of listeners) l();
}

/** While the choice is "system", follows the OS when it switches between light and dark. */
export function watchSystemTheme() {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (storedTheme() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Self-contained copy of applyTheme(storedTheme()) for an inline <head> script. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}")}catch(e){}var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"`;
