// Light/dark theme: follows the OS until the visitor picks one, then remembers it. The inline init
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

/** Flips what the visitor currently sees and remembers it. Returns the new theme. */
export function toggleTheme(): "light" | "dark" {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // private mode: the choice just lasts for this page view
  }
  applyTheme(next);
  return next;
}

/** Self-contained copy of applyTheme(storedTheme()) for an inline <head> script. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}")}catch(e){}var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"`;
