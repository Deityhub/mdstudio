import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { accountStore } from "@/lib/account/store";
import { signOut } from "@/lib/account/client";
import { documentStore, indexedDbStore } from "@/lib/storage/documentStore";
import { historyStore } from "@/lib/storage/history";
import { AuthExpiredError, UnverifiedError, httpApi } from "./api";
import { type SignOutCheck, checkSignOut, leaveAccount, linkDrafts, unlinkDraft } from "./cloud";
import { type SyncReport, syncOnce } from "./engine";
import { createSyncMeta } from "./meta";
import { DEFAULT_CLOUD_LIMIT, fieldsHash } from "./protocol";
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
  const report = await syncOnce(depsFor(userId));
  if (report.limit !== undefined) setCloud({ limit: report.limit });
  await refreshCloud(userId);
  return report;
}

// ---- Signing out ---------------------------------------------------------------------------

/** Saves what can be saved and reports what removing this account's drafts would cost. */
export async function prepareSignOut(userId: string) {
  let synced = true;
  try {
    await syncOnce(depsFor(userId));
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
    const r = createRunner({
      run: async () => {
        const report = await syncOnce(depsFor(userId, (id) => latest.current.isBusy(id)));
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
    const wake = () => document.visibilityState === "visible" && r.request(0);
    const offs = [r.subscribe(() => setStatus(r.get())), documentStore.onChange(() => r.request())];
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    r.start();
    return () => {
      for (const off of offs) off();
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
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
