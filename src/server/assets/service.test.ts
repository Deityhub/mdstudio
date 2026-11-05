// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import type { ObjectStore } from "../../../infra/storage";
import type { Db } from "../db";
import {
  MAX_ASSET_EACH,
  deleteAsset,
  detectImage,
  listAssets,
  readPublic,
  uploadAsset,
} from "./service";

const png = (extra = 0) =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(1)]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const gif = new TextEncoder().encode("GIF89a....");
const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const svg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>',
);

let db: Db;
let objects: Map<string, { body: Uint8Array; contentType: string }>;
let store: ObjectStore;
const limits = { maxAssets: 3, maxBytes: 100, maxEach: MAX_ASSET_EACH };
const t0 = 1_700_000_000_000;

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
  objects = new Map();
  store = {
    put: async (k, body, contentType) =>
      void objects.set(k, { body: new Uint8Array(body), contentType }),
    get: async (k) => {
      const o = objects.get(k);
      return o ? { body: o.body.buffer as ArrayBuffer, contentType: o.contentType } : null;
    },
    delete: async (k) => void objects.delete(k),
  };
});

describe("detectImage", () => {
  it("goes by the bytes, never the name, and refuses everything else", () => {
    expect(detectImage(png())).toEqual({ mime: "image/png", ext: "png" });
    expect(detectImage(jpeg)).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(detectImage(gif)).toEqual({ mime: "image/gif", ext: "gif" });
    expect(detectImage(webp)).toEqual({ mime: "image/webp", ext: "webp" });
    expect(detectImage(svg)).toBeNull(); // SVG can carry script and is served from our origin
    expect(detectImage(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectImage(new Uint8Array())).toBeNull();
  });
});

describe("uploadAsset", () => {
  it("stores the image under an unguessable key and keeps a row", async () => {
    const r = await uploadAsset(
      db,
      store,
      "a",
      { bytes: png(), fileName: "My Pic.JPG" },
      limits,
      t0,
    );
    if ("error" in r) throw new Error(r.error);
    expect(r.asset).toMatchObject({ mimeType: "image/png", fileName: "My Pic.JPG", byteSize: 8 });
    expect(r.asset.file).toMatch(/^[0-9a-f]{32}\.png$/); // the extension follows the bytes
    expect(objects.get(r.asset.file)?.contentType).toBe("image/png");
  });

  it("refuses non-images, SVG and oversized files", async () => {
    expect(
      await uploadAsset(db, store, "a", { bytes: svg, fileName: "x.svg" }, limits, t0),
    ).toEqual({
      error: "invalid_type",
    });
    const big = png(MAX_ASSET_EACH);
    expect(
      await uploadAsset(
        db,
        store,
        "a",
        { bytes: big, fileName: "x.png" },
        { ...limits, maxBytes: 10 ** 9 },
        t0,
      ),
    ).toEqual({ error: "too_large" });
    expect(objects.size).toBe(0);
  });

  it("stores the same picture once per account", async () => {
    const first = await uploadAsset(
      db,
      store,
      "a",
      { bytes: png(), fileName: "a.png" },
      limits,
      t0,
    );
    const again = await uploadAsset(
      db,
      store,
      "a",
      { bytes: png(), fileName: "b.png" },
      limits,
      t0 + 1,
    );
    if ("error" in first || "error" in again) throw new Error("upload failed");
    expect(again.asset.id).toBe(first.asset.id);
    expect((await listAssets(db, "a", limits)).assets).toHaveLength(1);
    // another account gets its own copy
    const other = await uploadAsset(
      db,
      store,
      "b",
      { bytes: png(), fileName: "a.png" },
      limits,
      t0,
    );
    if ("error" in other) throw new Error(other.error);
    expect(other.asset.id).not.toBe(first.asset.id);
  });

  it("enforces the count and the total size per account", async () => {
    for (const n of [1, 2, 3])
      await uploadAsset(db, store, "a", { bytes: png(n), fileName: `${n}.png` }, limits, t0);
    expect(
      await uploadAsset(db, store, "a", { bytes: png(9), fileName: "4.png" }, limits, t0),
    ).toEqual({ error: "limit_count" });
    expect(
      await uploadAsset(
        db,
        store,
        "b",
        { bytes: png(200), fileName: "big.png" },
        { ...limits, maxBytes: 100 },
        t0,
      ),
    ).toEqual({ error: "limit_bytes" });
    // identical to one already stored: not a new image, so still allowed when full
    expect(
      await uploadAsset(db, store, "a", { bytes: png(1), fileName: "again.png" }, limits, t0),
    ).toMatchObject({ asset: { fileName: "1.png" } });
  });
});

describe("list, delete and public reads", () => {
  it("lists only your images with the usage, and deletes the object too", async () => {
    const r = await uploadAsset(db, store, "a", { bytes: png(), fileName: "a.png" }, limits, t0);
    await uploadAsset(db, store, "b", { bytes: jpeg, fileName: "b.jpg" }, limits, t0);
    if ("error" in r) throw new Error(r.error);
    const listed = await listAssets(db, "a", limits);
    expect(listed.assets.map((x) => x.fileName)).toEqual(["a.png"]);
    expect(listed.usage).toEqual({ count: 1, bytes: 8, ...limits });

    expect(await deleteAsset(db, store, "b", r.asset.id)).toBe(false); // not yours
    expect(objects.has(r.asset.file)).toBe(true);
    expect(await deleteAsset(db, store, "a", r.asset.id)).toBe(true);
    expect(objects.size).toBe(1);
    expect((await listAssets(db, "a", limits)).assets).toEqual([]);
  });

  it("serves a stored image publicly by its file name, and nothing else", async () => {
    const r = await uploadAsset(db, store, "a", { bytes: png(), fileName: "a.png" }, limits, t0);
    if ("error" in r) throw new Error(r.error);
    const hit = await readPublic(db, store, r.asset.file);
    expect(hit?.contentType).toBe("image/png");
    expect(new Uint8Array(hit!.body)).toEqual(png());
    for (const bad of ["../x.png", "nope.png", `${"0".repeat(32)}.png`, `${r.asset.id}.exe`, ""])
      expect(await readPublic(db, store, bad)).toBeNull();
    await deleteAsset(db, store, "a", r.asset.id);
    expect(await readPublic(db, store, r.asset.file)).toBeNull();
  });
});
