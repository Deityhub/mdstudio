import { useEffect, useState, useSyncExternalStore } from "react";
import { accountStore } from "../account/store";
import { indexedDbStore } from "../storage/documentStore";
import type { Session, SessionState } from "./session";

/**
 * Opens a live draft's session while `target` is set, and closes it when it changes or the page
 * goes. Yjs is loaded now, not before: people who never edit with others never download it.
 * `onStale` hands over the text this browser kept of an earlier room, which is saved in History.
 */
export function useCollabSession(
  target: { ownerId: string; draftId: string } | null,
  onStale: (text: string) => void,
): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  // a new session after the room changed under the one kept here
  const [generation, setGeneration] = useState(0);
  const ownerId = target?.ownerId;
  const draftId = target?.draftId;
  const stale = useLatest(onStale);

  useEffect(() => {
    // (a browser-only library: the server build leaves it out)
    if (import.meta.env.SSR || !ownerId || !draftId) return;
    let cancelled = false;
    let opened: Session | null = null;
    void import("./session").then(async ({ openSession }) => {
      const made = await openSession({
        ownerId,
        draftId,
        kv: indexedDbStore,
        onStale: (text) => {
          stale.current(text);
          setGeneration((g) => g + 1);
        },
        // signed out elsewhere or the session ran out: look at the account again
        onEnded: () => accountStore.refresh(),
      });
      if (cancelled) return made.destroy();
      opened = made;
      setSession(made);
    });
    return () => {
      cancelled = true;
      opened?.destroy();
      setSession(null);
    };
  }, [ownerId, draftId, generation, stale]);

  return ownerId && draftId ? session : null;
}

const NONE: SessionState = { status: "offline", peers: [], ready: false };
const noop = () => () => undefined;

/** The connection, the people in the draft, and whether its text is ready, as they change. */
export function useSessionState(session: Session | null): SessionState {
  return useSyncExternalStore(
    session ? session.subscribe : noop,
    () => session?.state ?? NONE,
    () => NONE,
  );
}

function useLatest<T>(value: T) {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}
