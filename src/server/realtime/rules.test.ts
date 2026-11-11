import { describe, expect, it } from "vitest";
import { SOCKET_CAPS, fanout, hasRoom, incoming, topicKind, type Attachment } from "./rules";

const sock = (clientId: string, expiresAt = 1000): { id: string; attachment: Attachment } => ({
  id: clientId,
  attachment: { userId: "u", clientId, expiresAt },
});

describe("topicKind and hasRoom", () => {
  it("allows few sockets on a user's topic and more on a share's", () => {
    expect(topicKind("user:abc")).toBe("user");
    expect(topicKind("share:abc")).toBe("share");
    expect(hasRoom("user:abc", SOCKET_CAPS.user - 1)).toBe(true);
    expect(hasRoom("user:abc", SOCKET_CAPS.user)).toBe(false);
    expect(hasRoom("share:abc", SOCKET_CAPS.share - 1)).toBe(true);
    expect(hasRoom("share:abc", SOCKET_CAPS.share)).toBe(false);
  });
});

describe("fanout", () => {
  it("sends to every socket except the sender's, and sorts out the expired", () => {
    const a = sock("a", 5000);
    const b = sock("b", 5000);
    const old = sock("old", 500);
    const { send, expired } = fanout([a, b, old], { exclude: "a", now: 1000 });
    expect(send).toEqual([b]);
    expect(expired).toEqual([old]);
  });

  it("sends to all when nobody is excluded, and treats the expiry instant as expired", () => {
    const edge = sock("edge", 1000);
    const { send, expired } = fanout([sock("a", 2000), edge], { now: 1000 });
    expect(send.map((s) => s.id)).toEqual(["a"]);
    expect(expired).toEqual([edge]);
  });
});

describe("incoming", () => {
  it("answers a ping and closes on anything else", () => {
    expect(incoming("ping")).toBe("ping");
    for (const bad of ["", "pong", "ping ", '{"t":"sync"}', new ArrayBuffer(4), "x".repeat(2000)])
      expect(incoming(bad)).toBe("close");
  });
});
