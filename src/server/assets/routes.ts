import { withVerifiedUser } from "../auth/guard";
import { sameOrigin } from "../auth/http";
import { getDb } from "../db";
import { getEnv } from "../env";
import {
  type AssetInfo,
  DEFAULT_MAX_ASSETS,
  DEFAULT_MAX_BYTES,
  MAX_ASSET_EACH,
  deleteAsset,
  listAssets,
  readPublic,
  uploadAsset,
} from "./service";
import { getStore } from "./store";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
};

/** Per account: MAX_ASSETS images and MAX_ASSET_BYTES in all (10 and 10 MB unless set). */
const limitsFor = (request: Request) => ({
  maxAssets: num(getEnv(request, "MAX_ASSETS"), DEFAULT_MAX_ASSETS),
  maxBytes: num(getEnv(request, "MAX_ASSET_BYTES"), DEFAULT_MAX_BYTES),
  maxEach: MAX_ASSET_EACH,
});

/** Links are absolute, so the Markdown works wherever it is pasted. */
const origin = (request: Request) =>
  getEnv(request, "PUBLIC_URL")?.replace(/\/$/, "") ?? new URL(request.url).origin;
const withUrl = (request: Request) => (a: AssetInfo) => ({
  ...a,
  url: `${origin(request)}/a/${a.file}`,
});

export const imagesAvailable = async (request: Request) => (await getStore(request)) !== null;

const UNAVAILABLE = () => json({ error: "unavailable" }, 503);

export const uploadHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const store = await getStore(request);
    if (!store) return UNAVAILABLE();
    // Refuse before reading a body that could not be accepted anyway.
    if (Number(request.headers.get("content-length") ?? 0) > MAX_ASSET_EACH + 100_000)
      return json({ error: "too_large" }, 413);
    const file = (await request.formData().catch(() => null))?.get("file");
    if (!(file instanceof File)) return json({ error: "invalid" }, 400);
    const result = await uploadAsset(
      db,
      store,
      user.id,
      { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name },
      limitsFor(request),
    );
    if ("error" in result) {
      const status = { invalid_type: 415, too_large: 413, limit_count: 409, limit_bytes: 409 }[
        result.error
      ];
      return json({ error: result.error }, status);
    }
    return json({ asset: withUrl(request)(result.asset) });
  });

export const listHandler = (request: Request) =>
  withVerifiedUser(request, async (user, db) => {
    if (!(await imagesAvailable(request))) return UNAVAILABLE();
    const { assets, usage } = await listAssets(db, user.id, limitsFor(request));
    return json({ assets: assets.map(withUrl(request)), usage });
  });

export const deleteHandler = (request: Request, id: string) =>
  withVerifiedUser(request, async (user, db) => {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
    const store = await getStore(request);
    if (!store) return UNAVAILABLE();
    return (await deleteAsset(db, store, user.id, id))
      ? json({ ok: true })
      : json({ error: "not_found" }, 404);
  });

/** `GET /a/<file>`: public, cached for good (the name never points at different bytes). */
export async function serveHandler(request: Request, file: string) {
  const store = await getStore(request);
  const hit = store && (await readPublic(await getDb(request), store, file));
  if (!hit)
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(hit.body, {
    headers: {
      "content-type": hit.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      // Plain images only: never sniffed into something else, never allowed to run anything,
      // and embeddable from any site.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
}
