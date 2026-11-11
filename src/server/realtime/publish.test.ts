// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeHub } from "./hub";
import { publish, shareTopic, userTopic } from "./publish";

afterEach(() => vi.restoreAllMocks());

const onNode = () => new Request("http://site.test/api/sync/push");
const onWorkers = (REALTIME: unknown, waitUntil?: (p: Promise<unknown>) => void) =>
  Object.assign(new Request("http://site.test/api/sync/push"), {
    runtime: { cloudflare: { env: { REALTIME }, context: { waitUntil } } },
  });

describe("topic names", () => {
  it("name an account's topic and a share's by their ids", () => {
    expect(userTopic("u1")).toBe("user:u1");
    expect(shareTopic("s1")).toBe("share:s1");
  });
});

describe("publish", () => {
  it("on Node hands the event to the in-process hub", async () => {
    const spy = vi.spyOn(nodeHub, "publish").mockReturnValue(1);
    await publish(onNode(), "user:u1", { t: "sync" }, { exclude: "tab-1" });
    expect(spy).toHaveBeenCalledWith("user:u1", { t: "sync" }, { exclude: "tab-1" });
  });

  it("on Workers posts to the topic's Durable Object, after the response if it can wait", async () => {
    const calls: { name: string; url: string; body: unknown }[] = [];
    const namespace = {
      idFromName: (name: string) => name,
      get: (name: string) => ({
        fetch: async (url: string, init: { body: string }) => {
          calls.push({ name, url, body: JSON.parse(init.body) });
          return new Response(null);
        },
      }),
    };
    const pending: Promise<unknown>[] = [];
    await publish(
      onWorkers(namespace, (p) => void pending.push(p)),
      "share:s1",
      { t: "sync" },
    );
    await Promise.all(pending);
    expect(calls).toEqual([
      { name: "share:s1", url: "https://realtime/publish", body: { event: { t: "sync" } } },
    ]);
  });

  it("never fails the request that caused it, even when the hub is down", async () => {
    const down = {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: async () => {
          throw new Error("hub down");
        },
      }),
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(publish(onWorkers(down), "user:u", { t: "sync" })).resolves.toBeUndefined();
    vi.spyOn(nodeHub, "publish").mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(publish(onNode(), "user:u", { t: "sync" })).resolves.toBeUndefined();
  });

  it("does nothing on Workers built without the Durable Object", async () => {
    await expect(publish(onWorkers(undefined), "user:u", { t: "sync" })).resolves.toBeUndefined();
  });
});
