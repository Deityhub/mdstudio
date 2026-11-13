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
  /** Whether links limited to named people can be made here. */
  privateLinks: boolean;
  /** Whether the list has been read since sign-in. Nothing reads it in the background. */
  loaded: boolean;
};

const EMPTY: ShareState = {
  byDraft: new Map(),
  defaultDays: DEFAULT_SHARE_DAYS,
  maxDays: MAX_SHARE_DAYS,
  privateLinks: true,
  loaded: false,
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
    const { shares, defaultDays, maxDays, privateLinks = true } = await shareApi.list();
    set({
      byDraft: new Map(shares.map((s) => [s.id, s])),
      defaultDays,
      maxDays,
      privateLinks,
      loaded: true,
    });
  } catch (error) {
    if (error instanceof AuthExpiredError || error instanceof UnverifiedError)
      void accountStore.refresh();
    else {
      console.error("Couldn't load share links", error);
      if (!state.loaded) set({ ...state, loaded: true });
    }
  }
}

/** For a live event that the list changed elsewhere: reads again only if something already read it. */
export const refreshSharesIfLoaded = () => (state.loaded ? refreshShares() : Promise.resolve());

/** Reads the links once, the first time something needs them; `refreshShares` reads them again. */
export const ensureShares = () => (state.loaded ? Promise.resolve() : refreshShares());

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
