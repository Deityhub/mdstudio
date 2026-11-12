import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE } from "./protocol";
import { tabId } from "./tab";
import { createRealtime, type SocketLike } from "./client";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(1); // no jitter: waits are exactly 1 s, 2 s, 4 s ...
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  sent: string[] = [];
  closed: number | null | undefined = undefined;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closed = code ?? null;
  }
  // what the network does
  open() {
    this.onopen?.();
  }
  say(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  drop(code = 1006) {
    this.onclose?.({ code });
  }
}

const make = (over: Partial<Parameters<typeof createRealtime>[0]> = {}) => {
  const events: unknown[] = [];
  const states: boolean[] = [];
  const rt = createRealtime({
    topic: "user",
    createSocket: (url) => new FakeSocket(url),
    onEvent: (e) => void events.push(e),
    onConnected: (c) => void states.push(c),
    ...over,
  });
  return { rt, events, states };
};
const last = () => FakeSocket.all.at(-1)!;
const connect = (rt: ReturnType<typeof make>["rt"]) => {
  rt.start();
  last().open();
  last().say({ t: "ready" });
};
beforeEach(() => (FakeSocket.all = []));

describe("realtime client", () => {
  it("opens the socket for its topic and is connected once the server says it is ready", () => {
    const { rt, states } = make();
    rt.start();
    const url = new URL(last().url);
    expect(url.pathname).toBe("/api/realtime");
    expect(Object.fromEntries(url.searchParams)).toEqual({ topic: "user", client: tabId });
    expect(url.protocol).toMatch(/^wss?:$/);
    last().open();
    expect(states).toEqual([]); // open is not enough: the server may still refuse the topic
    last().say({ t: "ready" });
    expect(states).toEqual([true]);
  });

  it("hands events to its owner, and ignores pongs, noise and a repeated ready", () => {
    const { rt, events, states } = make();
    connect(rt);
    last().say("pong");
    last().say("not json");
    last().say({ t: "ready" });
    last().say({ t: "sync" });
    last().say({ t: "mystery" });
    expect(events).toEqual([{ t: "sync" }]);
    expect(states).toEqual([true]);
  });

  it("reconnects after the connection drops, waiting longer each time, and starts over once it works", async () => {
    const { rt, states } = make();
    connect(rt);
    last().drop();
    expect(states).toEqual([true, false]);
    const sockets = () => FakeSocket.all.length;
    expect(sockets()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets()).toBe(2);
    last().drop(); // never became ready
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets()).toBe(3);
    last().open();
    last().say({ t: "ready" });
    last().drop();
    await vi.advanceTimersByTimeAsync(1000); // back to the first wait
    expect(sockets()).toBe(4);
  });

  it("never waits more than a minute", async () => {
    const { rt } = make();
    rt.start();
    for (let i = 0; i < 12; i++) {
      last().drop();
      await vi.advanceTimersByTimeAsync(60_000);
    }
    const before = FakeSocket.all.length;
    last().drop();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(FakeSocket.all.length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.all.length).toBe(before + 1);
  });

  it("waits for its owner to look at the account again before reconnecting after a session ended", async () => {
    let done!: () => void;
    const onEnded = vi.fn(() => new Promise<void>((resolve) => (done = resolve)));
    const { rt } = make({ onEnded });
    connect(rt);
    last().drop(CLOSE.sessionEnded);
    expect(onEnded).toHaveBeenCalledWith(CLOSE.sessionEnded);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1); // still waiting
    done();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stays away for a minute when the topic is full or it was told off", async () => {
    for (const code of [CLOSE.full, CLOSE.badMessage]) {
      FakeSocket.all = [];
      const { rt } = make();
      connect(rt);
      last().drop(code);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(FakeSocket.all).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeSocket.all).toHaveLength(2);
      rt.stop();
    }
  });

  it("keeps the connection alive with a ping, and reconnects when nothing comes back", async () => {
    const { rt, states } = make();
    connect(rt);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(last().sent).toEqual(["ping"]);
    last().say("pong");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeSocket.all).toHaveLength(1); // it answered
    await vi.advanceTimersByTimeAsync(15_000); // the next ping
    expect(last().sent).toEqual(["ping", "ping"]);
    await vi.advanceTimersByTimeAsync(10_000); // no answer: it is dead
    expect(states.at(-1)).toBe(false);
    expect(FakeSocket.all[0]!.closed).toBeDefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stops for good: closes the socket, does not reconnect, says nothing more", async () => {
    const { rt, events, states } = make();
    connect(rt);
    rt.stop();
    expect(last().closed).toBeDefined();
    last().say({ t: "sync" });
    last().drop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(events).toEqual([]);
    expect(states).toEqual([true, false]);
  });

  it("starting twice opens one socket, and it can start again after stopping", () => {
    const { rt } = make();
    rt.start();
    rt.start();
    expect(FakeSocket.all).toHaveLength(1);
    rt.stop();
    rt.start();
    expect(FakeSocket.all).toHaveLength(2);
  });
});
