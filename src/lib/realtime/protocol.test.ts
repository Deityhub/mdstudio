import { describe, expect, it } from "vitest";
import { CLOSE, MAX_EVENT_BYTES, isClientId, parseEvent, parseTopic } from "./protocol";

describe("parseTopic", () => {
  it("knows the user's own topic and a share's topic", () => {
    expect(parseTopic("user")).toEqual({ kind: "user" });
    expect(parseTopic("share:3f2a-bc_9")).toEqual({ kind: "share", id: "3f2a-bc_9" });
  });

  it("refuses anything else, including another user's topic written out", () => {
    for (const bad of [null, "", "user:abc", "users", "share:", "share:a b", "share:../x", "doc:1"])
      expect(parseTopic(bad), String(bad)).toBeNull();
    expect(parseTopic(`share:${"a".repeat(65)}`)).toBeNull();
  });
});

describe("isClientId", () => {
  it("accepts a random token and refuses odd input", () => {
    expect(isClientId("q9Zx_aB-12345678")).toBe(true);
    for (const bad of [null, "", "short", "has space 1234", "a".repeat(65), "bad/char12345"])
      expect(isClientId(bad), String(bad)).toBe(false);
  });
});

describe("events", () => {
  it("parses the events the server sends and nothing else", () => {
    expect(parseEvent('{"t":"ready"}')).toEqual({ t: "ready" });
    expect(parseEvent('{"t":"sync"}')).toEqual({ t: "sync" });
    expect(parseEvent('{"t":"bye","reason":"suspended"}')).toEqual({
      t: "bye",
      reason: "suspended",
    });
    for (const bad of ["", "nope", '{"t":"other"}', '{"t":"bye","reason":"x"}', "[]", "null"])
      expect(parseEvent(bad), bad).toBeNull();
  });

  it("has distinct close codes in the private range, and a size cap", () => {
    const codes = Object.values(CLOSE);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toBeGreaterThanOrEqual(4000);
    expect(MAX_EVENT_BYTES).toBe(128 * 1024);
  });
});
