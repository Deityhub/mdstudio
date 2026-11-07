import { useSyncExternalStore } from "react";
import { accountStore } from "@/lib/account/store";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";
import { type SharedLink, shareApi } from "./api";
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS } from "./protocol";

type ShareState = {
  /** The account's live links, by the draft's own id. */
  byDraft: ReadonlyMap<string, SharedLink>;
  defaultDays: number;
  maxDays: number;
};

const EMPTY: ShareState = {
  byDraft: new Map(),
  defaultDays: DEFAULT_SHARE_DAYS,
  maxDays: MAX_SHARE_DAYS,
};
let state = EMPTY;
const listeners = new Set<() => void>();
const set = (next: ShareState) => {
  state = next;
  for (const l of listeners) l();
};

/** The signed-in account's share links and the day limits the server allows. */
export const useShares = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );

/** Reads the links from the server. Quiet on failure: the next round tries again. */
export async function refreshShares() {
  try {
    const { shares, defaultDays, maxDays } = await shareApi.list();
    set({ byDraft: new Map(shares.map((s) => [s.id, s])), defaultDays, maxDays });
  } catch (error) {
    if (error instanceof AuthExpiredError || error instanceof UnverifiedError)
      void accountStore.refresh();
    else console.error("Couldn't load share links", error);
  }
}

export const clearShares = () => {
  if (state !== EMPTY) set(EMPTY);
};

/** Puts one link into the store right after a change, or removes it when `link` is null. */
export function setShare(draftId: string, link: SharedLink | null) {
  const byDraft = new Map(state.byDraft);
  if (link) byDraft.set(draftId, link);
  else byDraft.delete(draftId);
  set({ ...state, byDraft });
}
