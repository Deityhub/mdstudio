import { useCallback, useEffect, useRef, useState } from "react";
import { accountStore } from "../account/store";
import { AuthExpiredError } from "../sync/api";
import { documentStore, indexedDbStore, type MdDocument } from "../storage/documentStore";
import { collabApi } from "./api";
import { type SharedItem, reconcileShared } from "./shared";

/** Not asked again sooner than this when the window is only coming back into view. */
const REFRESH_MS = 30_000;

/**
 * The drafts others invited this account to edit, read when the studio opens, when the window comes
 * back, and on request. A list that was read also settles this device's shared drafts: any that are
 * no longer on it are kept as ordinary local drafts, and `onDetached` is told which. A list that
 * could not be read (offline) changes nothing.
 */
export function useSharedWithMe(
  userId: string | undefined,
  onDetached: (docs: MdDocument[]) => void,
) {
  const [items, setItems] = useState<SharedItem[]>([]);
  const detached = useRef(onDetached);
  detached.current = onDetached;
  const lastRead = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await collabApi.shared();
      lastRead.current = Date.now();
      setItems(list);
      const gone = await reconcileShared(documentStore, indexedDbStore, userId, list);
      if (gone.length) detached.current(gone);
    } catch (error) {
      if (error instanceof AuthExpiredError) void accountStore.refresh();
      // otherwise offline or the server is down: what this device has stays as it is
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return setItems([]);
    void refresh();
    const back = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRead.current > REFRESH_MS)
        void refresh();
    };
    window.addEventListener("focus", back);
    window.addEventListener("online", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      window.removeEventListener("online", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [userId, refresh]);

  return { items, refresh };
}
