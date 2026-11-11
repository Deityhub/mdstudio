import { describe, expect, it } from "vitest";
import { CLOSE } from "@/lib/realtime/protocol";
import { createHub } from "./hub";
import type { Attachment } from "./rules";

const att = (clientId: string, expiresAt = 10_000, userId = "u"): Attachment => ({
  userId,
  clientId,
  expiresAt,
});
function peer() {
  const log = { sent: [] as string[], closed: null as null | [number, string | undefined] };
  return {
    log,
    peer: {
      send: (data: string) => void log.sent.push(data),
      close: (code: number, reason?: string) => void (log.closed = [code, reason]),
    },
  };
}

describe("in-process hub", () => {
  it("delivers an event to everyone on the topic but the sender", () => {
    const hub = createHub(() => 1000);
    const [a, b, other] = [peer(), peer(), peer()];
    hub.connect("user:u", a.peer, att("a"));
    hub.connect("user:u", b.peer, att("b"));
    hub.connect("user:v", other.peer, att("c", 10_000, "v"));
    expect(hub.publish("user:u", { t: "sync" }, { exclude: "a" })).toBe(1);
    expect(a.log.sent).toEqual([]);
    expect(b.log.sent).toEqual(['{"t":"sync"}']);
    expect(other.log.sent).toEqual([]); // another topic never hears it
  });

  it("refuses a socket past the cap and counts the ones that are left", () => {
    const hub = createHub(() => 1000);
    const peers = Array.from({ length: 10 }, () => peer());
    peers.forEach((p, i) => expect(hub.connect("user:u", p.peer, att(`c${i}`)).ok).toBe(true));
    expect(hub.connect("user:u", peer().peer, att("late")).ok).toBe(false);
    expect(hub.count("user:u")).toBe(10);
  });

  it("forgets a socket that disconnects, and drops an empty topic", () => {
    const hub = createHub(() => 1000);
    const a = peer();
    const r = hub.connect("user:u", a.peer, att("a"));
    if (!r.ok) throw new Error("full");
    r.disconnect();
    expect(hub.count("user:u")).toBe(0);
    expect(hub.publish("user:u", { t: "sync" })).toBe(0);
  });

  it("closes a socket whose session has run out instead of sending to it", () => {
    let now = 1000;
    const hub = createHub(() => now);
    const a = peer();
    hub.connect("user:u", a.peer, att("a", 5000));
    now = 5000;
    expect(hub.publish("user:u", { t: "sync" })).toBe(0);
    expect(a.log.sent).toEqual([]);
    expect(a.log.closed?.[0]).toBe(CLOSE.expired);
    expect(hub.count("user:u")).toBe(0);
  });

  it("a bye is sent and then closes every socket on the topic", () => {
    const hub = createHub(() => 1000);
    const [a, b] = [peer(), peer()];
    hub.connect("user:u", a.peer, att("a"));
    hub.connect("user:u", b.peer, att("b"));
    hub.publish("user:u", { t: "bye", reason: "suspended" });
    for (const p of [a, b]) {
      expect(p.log.sent).toEqual(['{"t":"bye","reason":"suspended"}']);
      expect(p.log.closed?.[0]).toBe(CLOSE.sessionEnded);
    }
    expect(hub.count("user:u")).toBe(0);
  });

  it("keeps going when one socket throws on send", () => {
    const hub = createHub(() => 1000);
    const good = peer();
    hub.connect(
      "user:u",
      {
        send: () => {
          throw new Error("gone");
        },
        close: () => {},
      },
      att("bad"),
    );
    hub.connect("user:u", good.peer, att("good"));
    expect(hub.publish("user:u", { t: "sync" })).toBe(1);
    expect(good.log.sent).toHaveLength(1);
    expect(hub.count("user:u")).toBe(1); // the broken one was dropped
  });
});
