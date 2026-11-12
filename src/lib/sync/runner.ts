// Schedules sync rounds: merges bursts of requests, never overlaps two rounds, retries after a
// failure and polls while the studio is open. It knows nothing about documents or the network.
export type SyncState = "idle" | "syncing" | "synced" | "offline" | "error";
export type SyncStatus = { state: SyncState; /** When the last round finished. */ at?: number };

type Options = {
  run: () => Promise<void>;
  /** Wait before a requested round, so typing does not sync on every keystroke. */
  delay?: number;
  retry?: number;
  poll?: number;
  isOffline?: () => boolean;
  onError?: (error: unknown) => void;
};

export function createRunner(opts: Options) {
  const { delay = 3000, retry = 30_000, poll = 60_000 } = opts;
  let status: SyncStatus = { state: "idle" };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let again = false;
  let stopped = false;
  let polling = true;

  const startInterval = () => {
    if (!interval && polling && !stopped) interval = setInterval(() => request(0), poll);
  };

  const set = (next: SyncStatus) => {
    status = next;
    for (const l of listeners) l();
  };

  async function cycle() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    set({ ...status, state: "syncing" });
    try {
      await opts.run();
      set({ state: "synced", at: Date.now() });
    } catch (error) {
      opts.onError?.(error);
      set({ ...status, state: opts.isOffline?.() ? "offline" : "error" });
      if (!stopped) request(retry);
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        request(0);
      }
    }
  }

  function request(wait = delay) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void cycle();
    }, wait);
  }

  return {
    get: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    request,
    /**
     * While a live connection tells this device about changes, checking on a timer is wasted
     * requests: off while it is up, back on when it drops. Rounds that are requested still run.
     */
    setPolling(on: boolean) {
      polling = on;
      if (on) startInterval();
      else {
        clearInterval(interval);
        interval = undefined;
      }
    },
    /** `wait` delays the first round, so a connection that is about to be ready can ask for it. */
    start(wait = 0) {
      stopped = false;
      request(wait);
      startInterval();
    },
    stop() {
      stopped = true;
      again = false;
      clearTimeout(timer);
      clearInterval(interval);
      timer = interval = undefined;
      set({ state: "idle" });
    },
  };
}
