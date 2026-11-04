// Hosted images, independent of HTTP. Files go to an ObjectStore (R2 on Workers, a volume in
// Docker) under `<random id>.<ext>`; the row records who owns them. Anyone with the link can read
// an image, which is the point: the Markdown that refers to it works on other platforms too.
import { desc, and, eq } from "drizzle-orm";
import { assets } from "../../../infra/db/schema";
import type { ObjectStore } from "../../../infra/storage";
import type { Db } from "../db";

/** Hosted images are small by design: the browser shrinks them before uploading. */
export const MAX_ASSET_EACH = 1_000_000;
export const DEFAULT_MAX_ASSETS = 10;
export const DEFAULT_MAX_BYTES = 10_000_000;

export type AssetLimits = { maxAssets: number; maxBytes: number; maxEach: number };
export type AssetInfo = {
  id: string;
  /** `<id>.<ext>`: what the public URL `/a/<file>` ends with. */
  file: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: number;
};

const TYPES = [
  { mime: "image/png", ext: "png", is: (b: Uint8Array) => starts(b, [0x89, 0x50, 0x4e, 0x47]) },
  { mime: "image/jpeg", ext: "jpg", is: (b: Uint8Array) => starts(b, [0xff, 0xd8, 0xff]) },
  { mime: "image/gif", ext: "gif", is: (b: Uint8Array) => ascii(b, 0, "GIF8") },
  {
    mime: "image/webp",
    ext: "webp",
    is: (b: Uint8Array) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"),
  },
] as const;

const starts = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

/**
 * The type is decided by the file's own bytes, never its name or the browser's claim. SVG is
 * refused on purpose: it can carry script, and these files are served from our own origin.
 */
export function detectImage(bytes: Uint8Array) {
  const t = TYPES.find((x) => x.is(bytes));
  return t ? { mime: t.mime, ext: t.ext } : null;
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256Hex(bytes: Uint8Array) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

type Row = typeof assets.$inferSelect;
const info = (r: Row): AssetInfo => ({
  id: r.id,
  file: r.storageKey,
  fileName: r.fileName,
  mimeType: r.mimeType,
  byteSize: r.byteSize,
  createdAt: r.createdAt,
});

const mine = (db: Db, userId: string) =>
  db.select().from(assets).where(eq(assets.userId, userId)).orderBy(desc(assets.createdAt));

export async function listAssets(db: Db, userId: string, limits: AssetLimits) {
  const rows = await mine(db, userId);
  return {
    assets: rows.map(info),
    usage: { count: rows.length, bytes: rows.reduce((n, r) => n + r.byteSize, 0), ...limits },
  };
}

export async function uploadAsset(
  db: Db,
  store: ObjectStore,
  userId: string,
  file: { bytes: Uint8Array; fileName: string },
  limits: AssetLimits,
  now = Date.now(),
): Promise<
  { asset: AssetInfo } | { error: "invalid_type" | "too_large" | "limit_count" | "limit_bytes" }
> {
  const kind = detectImage(file.bytes);
  if (!kind) return { error: "invalid_type" };
  if (file.bytes.length > limits.maxEach) return { error: "too_large" };

  const sha256 = await sha256Hex(file.bytes);
  const rows = await mine(db, userId);
  const same = rows.find((r) => r.sha256 === sha256);
  if (same) return { asset: info(same) }; // already stored: costs nothing
  if (rows.length >= limits.maxAssets) return { error: "limit_count" };
  if (rows.reduce((n, r) => n + r.byteSize, 0) + file.bytes.length > limits.maxBytes)
    return { error: "limit_bytes" };

  const id = hex(crypto.getRandomValues(new Uint8Array(16)));
  const key = `${id}.${kind.ext}`;
  await store.put(key, file.bytes, kind.mime);
  try {
    await db.insert(assets).values({
      id,
      userId,
      storageKey: key,
      fileName: file.fileName.replace(/[\\/]/g, "-").slice(0, 200) || "image",
      mimeType: kind.mime,
      byteSize: file.bytes.length,
      sha256,
      createdAt: now,
    });
  } catch {
    // The same picture arrived twice at once and the other upload won.
    await store.delete(key);
    const winner = (await mine(db, userId)).find((r) => r.sha256 === sha256);
    if (winner) return { asset: info(winner) };
    throw new Error("Couldn't record the upload");
  }
  return { asset: info((await mine(db, userId)).find((r) => r.id === id)!) };
}

/** Removes an image the account owns. Links to it, wherever they are, stop working. */
export async function deleteAsset(db: Db, store: ObjectStore, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.userId, userId)));
  if (!row) return false;
  await store.delete(row.storageKey);
  await db.delete(assets).where(eq(assets.id, row.id));
  return true;
}

const FILE = /^[0-9a-f]{32}\.(png|jpg|webp|gif)$/;

/** The bytes behind a public `/a/<file>` link, or null. */
export async function readPublic(db: Db, store: ObjectStore, file: string) {
  if (!FILE.test(file)) return null;
  const [row] = await db.select().from(assets).where(eq(assets.storageKey, file));
  if (!row) return null;
  const object = await store.get(file);
  return object ? { body: object.body, contentType: row.mimeType } : null;
}
