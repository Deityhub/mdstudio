import { useEffect, useRef, useState } from "react";
import { accountStore } from "@/lib/account/store";
import { createRealtime } from "./client";
import type { RealtimeEvent } from "./protocol";

/**
 * Listens on one topic (`user`, or `share:<slug>`) while the component is mounted and `topic` is
 * not null. Returns whether the socket is subscribed, which also flips back to true after a
 * reconnect: the moment to read again whatever happened while it was down.
 */
export function useRealtime(topic: string | null, onEvent: (event: RealtimeEvent) => void) {
  const [connected, setConnected] = useState(false);
  const latest = useRef(onEvent);
  latest.current = onEvent;

  useEffect(() => {
    if (!topic) return;
    const live = createRealtime({
      topic,
      onEvent: (event) => latest.current(event),
      onConnected: setConnected,
      onEnded: () => accountStore.refresh(),
    });
    live.start();
    return () => live.stop();
  }, [topic]);

  return connected;
}
