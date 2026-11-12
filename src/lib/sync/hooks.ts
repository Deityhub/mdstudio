import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { accountStore } from "@/lib/account/store";
import { signOut } from "@/lib/account/client";
import { documentStore, indexedDbStore } from "@/lib/storage/documentStore";
import { historyStore } from "@/lib/storage/history";
import { AuthExpiredError, UnverifiedError, httpApi } from "./api";
import { type SignOutCheck, checkSignOut, leaveAccount, linkDrafts, unlinkDraft } from "./cloud";
import { createRealtime } from "../realtime/client";
import { type SyncReport, applyPushed, syncOnce } from "./engine";
import { createSyncMeta } from "./meta";
import { DEFAULT_CLOUD_LIMIT, fieldsHash } from "./protocol";
import { refreshSharesIfLoaded } from "../share/hooks";
import { createPullPolicy } from "./policy";
import { type SyncStatus, createRunner } from "./runner";

const metaFor = (userId: string) => createSyncMeta(indexedDbStore, userId);

const depsFor = (userId: string, isBusy?: (id: string) => boolean) => ({
  userId,
  store: documentStore,
  meta: metaFor(userId),
  api: httpApi,
  ...(isBusy ? { isBusy } : {}),
  // The text a newer edit replaces stays reachable in the draft's version history.
  snapshot: (doc: { id: string; title: string; content: string }) =>
    historyStore.save(doc, Date.now(), "replaced"),
  onGone: (id: string) => historyStore.clear(id),
});

// ---- Which drafts are in the cloud ---------------------------------------------------------

type CloudState = { linked: ReadonlySet<string>; limit: number };
let cloudState: CloudState = { linked: new Set(), limit: DEFAULT_CLOUD_LIMIT };
const cloudListeners = new Set<() => void>();
const setCloud = (next: Partial<CloudState>) => {
  cloudState = { ...cloudState, ...next };
  for (const l of cloudListeners) l();
};

/** Drafts in the cloud for the signed-in account, and how many it may keep. */
export const useCloud = () =>
  useSyncExternalStore(
    (l) => {
      cloudListeners.add(l);
      return () => void cloudListeners.delete(l);
    },
    () => cloudState,
    () => cloudState,
  );

async function refreshCloud(userId: string | undefined) {
  const linked = userId ? (await metaFor(userId).linked()).map((m) => m.id) : [];
  setCloud({ linked: new Set(linked) });
}

let runner: ReturnType<typeof createRunner> | null = null;
export const requestSync = (wait = 0) => runner?.request(wait);

/** Chooses drafts for the cloud; the next round uploads them. */
export async function addToCloud(userId: string, ids: string[]) {
  await linkDrafts(metaFor(userId), ids);
  await refreshCloud(userId);
  requestSync();
}

/** Takes a draft out of the cloud; it stays on this device. */
export async function removeFromCloud(userId: string, id: string) {
  await unlinkDraft(metaFor(userId), id);
  await refreshCloud(userId);
  requestSync();
}

/** Runs a round now and waits for it, so something that needs the cloud up to date can rely on it. */
export async function syncNow(userId: string) {
  // pushes only: what needs the cloud up to date is what this device wrote
  const report = await syncOnce(depsFor(userId), { pull: false });
  if (report.limit !== undefined) setCloud({ limit: report.limit });
  await refreshCloud(userId);
  return report;
}

// ---- Signing out ---------------------------------------------------------------------------

/** Saves what can be saved and reports what removing this account's drafts would cost. */
export async function prepareSignOut(userId: string) {
  let synced = true;
  try {
    await syncOnce(depsFor(userId), { pull: false });
  } catch (error) {
    if (!(error instanceof AuthExpiredError)) console.error(error);
    synced = false;
  }
  const check: SignOutCheck = await checkSignOut(documentStore, metaFor(userId), fieldsHash);
  return { synced, check };
}

/**
 * Ends the session and takes the account's drafts off this device. `keep` stays as ordinary local
 * drafts: pass "all" to keep every cloud draft (signing out without a connection).
 */
export async function completeSignOut(userId: string, keep: Set<string> | "all") {
  const meta = metaFor(userId);
  const ids = keep === "all" ? new Set((await meta.linked()).map((m) => m.id)) : keep;
  await leaveAccount(documentStore, meta, { keep: ids, onGone: (id) => historyStore.clear(id) });
  await signOut();
  runner?.stop();
  accountStore.set((a) => ({ ...a, user: null }));
  setCloud({ linked: new Set() });
}

// ---- The background round ------------------------------------------------------------------

type Handlers = {
  /** True while a draft has edits that are not saved yet; remote changes to it wait. */
  isBusy: (id: string) => boolean;
  onReport: (report: SyncReport) => void;
};

/** Keeps this browser's cloud drafts and the signed-in account in step. Inert while signed out. */
export function useSync(userId: string | undefined, handlers: Handlers): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!userId) {
      void refreshCloud(undefined);
      return;
    }
    const deps = () => depsFor(userId, (id) => latest.current.isBusy(id));
    const policy = createPullPolicy();
    const r = createRunner({
      run: async () => {
        // With the live channel up a round only pushes: other devices' changes arrive by themselves.
        const report = await syncOnce(deps(), { pull: policy.nextRoundPulls() }).catch((error) => {
          policy.owePull(); // a pull that did not happen is still owed
          throw error;
        });
        if (report.limit !== undefined) setCloud({ limit: report.limit });
        await refreshCloud(userId);
        latest.current.onReport(report);
      },
      isOffline: () => !navigator.onLine,
      onError: (error) => {
        if (error instanceof AuthExpiredError || error instanceof UnverifiedError) {
          r.stop();
          void accountStore.refresh();
        } else console.error(error);
      },
    });
    runner = r;
    void refreshCloud(userId);
    // Live updates: another device's change arrives over the socket and is applied without a
    // pull. While it is up the timer poll is off; if it drops, polling comes back by itself.
    const live = createRealtime({
      topic: "user",
      onConnected: (connected) => {
        policy.setConnected(connected);
        r.setPolling(!connected);
        // once it is up, one pull catches up on whatever came before it was ready
        if (connected) r.request(0);
      },
      onEvent: (event) => {
        if (event.t === "sync") {
          // too much or too big to send: pull
          policy.owePull();
          r.request(0);
        } else if (event.t === "shares") {
          // the account's links changed on another device
          void refreshSharesIfLoaded();
        } else if (event.t === "doc")
          void applyPushed(deps(), [event.doc])
            .then(async (report) => {
              await refreshCloud(userId);
              // the draft's History (read after each round) has a new version on the server now
              setStatus((current) => ({ ...current, at: Date.now() }));
              latest.current.onReport(report);
              // a draft with unsaved edits waits: a pull picks it up
              if (report.deferred) {
                policy.owePull();
                r.request();
              }
            })
            .catch((error) => {
              console.error(error);
              policy.owePull();
              r.request(0);
            });
      },
      // signed out elsewhere, suspended, deleted, or the session ran out: look at the account
      // again. If it is signed out this effect ends and stops the socket.
      onEnded: () => accountStore.refresh(),
    });
    const nudge = (kind: "focus" | "online") =>
      document.visibilityState === "visible" && policy.nudgeWorthIt(kind) && r.request(0);
    const onFocus = () => nudge("focus");
    const onOnline = () => nudge("online");
    const offs = [r.subscribe(() => setStatus(r.get())), documentStore.onChange(() => r.request())];
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    live.start();
    // The first round waits a moment: if the socket is ready by then, its one catch-up pull is
    // the first pull, instead of that and one more.
    r.start(1000);
    return () => {
      for (const off of offs) off();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      live.stop();
      r.stop();
      if (runner === r) runner = null;
      setStatus({ state: "idle" });
    };
  }, [userId]);

  return status;
}

export function syncLabel(status: SyncStatus): string {
  switch (status.state) {
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline, will sync";
    case "error":
      return "Sync paused";
    case "synced":
      return "Synced";
    default:
      return "";
  }
}
