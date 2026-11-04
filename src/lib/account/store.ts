// The signed-in user, shared by the account menu and sync. `null` means signed out, which is the
// normal state: nothing in the editor depends on an account.
import { useSyncExternalStore } from "react";
import { type Account, fetchAccount } from "./client";

export type AccountState = Account & {
  /** False until the server (or the offline memory) has answered, so a draft is not hidden by mistake. */
  loaded: boolean;
};
let state: AccountState = { user: null, github: false, images: false, loaded: false };
const listeners = new Set<() => void>();

export const accountStore = {
  get: () => state,
  set(next: Account | ((a: Account) => Account)) {
    state = { ...(typeof next === "function" ? next(state) : next), loaded: true };
    for (const l of listeners) l();
  },
  async refresh() {
    accountStore.set(await fetchAccount());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

export const useAccount = () =>
  useSyncExternalStore(accountStore.subscribe, accountStore.get, accountStore.get);
