import { useSyncExternalStore } from "react";
import { storedTheme, subscribeTheme, type Theme } from "./theme";

/** What the visitor chose (light, dark or system), not what is showing: see `useResolvedTheme` for that. */
export const useThemeChoice = () =>
  useSyncExternalStore(subscribeTheme, storedTheme, () => "system" as Theme);
