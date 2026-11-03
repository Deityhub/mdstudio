import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRunner } from "./runner";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = (run: () => Promise<void>, extra: Record<string, unknown> = {}) =>
  createRunner({ run, delay: 1000, retry: 30_000, poll: 60_000, ...extra });

describe("runner", () => {
  it("merges a burst of requests into one run after the delay", async () => {
    const run = vi.fn(async () => {});
    const r = make(run);
    r.request();
    r.request();
    r.request();
    await vi.advanceTimersByTimeAsync(999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(run).toHaveBeenCalledTimes(1);
    expect(r.get().state).toBe("synced");
  });

  it("never overlaps runs, and runs again for a request made meanwhile", async () => {
    let release!: () => void;
    const run = vi.fn(
      () =>
        new Promise<void>((res) => {
          release = res;
        }),
    );
    const r = make(run);
    r.request(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.get().state).toBe("syncing");
    r.request(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports an error, then retries on its own", async () => {
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue();
    const onError = vi.fn();
    const r = make(run, { onError });
    r.request(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.get().state).toBe("error");
    expect(onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_001);
    expect(r.get().state).toBe("synced");
  });

  it("says offline instead of error when the network is down", async () => {
    const r = make(async () => Promise.reject(new TypeError("Failed to fetch")), {
      isOffline: () => true,
    });
    r.request(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.get().state).toBe("offline");
  });

  it("polls while started and stops cleanly", async () => {
    const run = vi.fn(async () => {});
    const r = make(run);
    r.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_010);
    expect(run).toHaveBeenCalledTimes(2);
    r.stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.get().state).toBe("idle");
  });
});
