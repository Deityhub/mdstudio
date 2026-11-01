// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDiskStore } from "./disk";
import { isSafeKey, type ObjectStore } from "./index";
import { createR2Store, type R2BucketLike } from "./r2";

const bytes = new Uint8Array([1, 2, 3]);

function contract(name: string, make: () => Promise<ObjectStore>) {
  describe(`${name} store`, () => {
    it("round-trips an object with its content type", async () => {
      const store = await make();
      await store.put("u1/abc.png", bytes, "image/png");
      const got = await store.get("u1/abc.png");
      expect(got?.contentType).toBe("image/png");
      expect([...new Uint8Array(got!.body)]).toEqual([1, 2, 3]);
    });
    it("returns null for a missing key and deletes idempotently", async () => {
      const store = await make();
      expect(await store.get("u1/none.png")).toBeNull();
      await store.put("u1/a.png", bytes, "image/png");
      await store.delete("u1/a.png");
      await store.delete("u1/a.png");
      expect(await store.get("u1/a.png")).toBeNull();
    });
    it("refuses unsafe keys", async () => {
      const store = await make();
      for (const key of ["../x", "/etc/passwd", "a/../../b", "a//b", ""])
        await expect(store.put(key, bytes, "x/y")).rejects.toThrow(/Unsafe/);
    });
  });
}

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mdstudio-store-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

contract("disk", async () => createDiskStore(dir));

contract("R2", async () => {
  const objects = new Map<string, { data: ArrayBuffer; type: string }>();
  const bucket: R2BucketLike = {
    async put(key, body, opts) {
      const data = new Uint8Array(body as Uint8Array).buffer.slice(0) as ArrayBuffer;
      objects.set(key, { data, type: opts.httpMetadata.contentType });
    },
    async get(key) {
      const o = objects.get(key);
      return o ? { arrayBuffer: async () => o.data, httpMetadata: { contentType: o.type } } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return createR2Store(bucket);
});

describe("isSafeKey", () => {
  it("accepts nested alphanumeric keys", () => expect(isSafeKey("u1/0f3a.webp")).toBe(true));
  it("rejects traversal and odd characters", () => {
    for (const k of ["..", "a/..", "a b", "a\\b", ".hidden", "a/.b"])
      expect(isSafeKey(k)).toBe(false);
  });
});
