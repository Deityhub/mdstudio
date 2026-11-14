// What the search palette can find beyond drafts and pages: a page that is showing (the editor)
// adds its own commands while it is mounted. Also whether the palette is open, and a line to jump
// to once a draft opened from a text match is loaded. Module state: there is one palette.
import { useSyncExternalStore } from "react";
import type { SearchEntry } from "./rank";

const sources = new Map<string, () => SearchEntry[]>();

/** Adds a source of entries, read each time the palette searches; returns its removal. */
export function registerSearchSource(key: string, read: () => SearchEntry[]) {
  sources.set(key, read);
  return () => {
    if (sources.get(key) === read) sources.delete(key);
  };
}
export const registeredEntries = () => [...sources.values()].flatMap((read) => read());

let open = false;
const openListeners = new Set<() => void>();
export function setSearchOpen(next: boolean) {
  if (open === next) return;
  open = next;
  for (const l of openListeners) l();
}
export const useSearchOpen = () =>
  useSyncExternalStore(
    (l) => {
      openListeners.add(l);
      return () => void openListeners.delete(l);
    },
    () => open,
    () => false,
  );

let jump: { id: string; line: number } | null = null;
const jumpListeners = new Set<() => void>();
/** Asks the editor to go to a line of a draft once that draft is open. */
export function requestJump(id: string, line: number) {
  jump = { id, line };
  for (const l of jumpListeners) l();
}
/** The line asked for this draft, once: it is cleared when taken. */
export function takeJump(id: string): number | null {
  if (jump?.id !== id) return null;
  const { line } = jump;
  jump = null;
  return line;
}
export function onJump(listener: () => void) {
  jumpListeners.add(listener);
  return () => void jumpListeners.delete(listener);
}
