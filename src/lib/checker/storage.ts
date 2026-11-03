import { DEFAULT_CONFIG, parseConfig, type CheckConfig } from "./config";

const KEY = "md:check-rules";

/** The rule settings kept in this browser, or the defaults (also when storage is blocked). */
export function loadConfig(): CheckConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseConfig(JSON.parse(raw)) : structuredClone(DEFAULT_CONFIG);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(config: CheckConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // storage is full or blocked: the settings still apply until the page is closed
  }
}
