import { createR2Store, type R2BucketLike } from "../../../infra/storage/r2";
import type { ObjectStore } from "../../../infra/storage";
import { getEnv } from "../env";

type WithEnv = Request & { runtime?: { cloudflare?: { env?: { IMAGES?: R2BucketLike } } } };

/** Where hosted images live for this request, or null when this deployment has no storage. */
export async function getStore(request: Request): Promise<ObjectStore | null> {
  const bucket = (request as WithEnv).runtime?.cloudflare?.env?.IMAGES;
  if (bucket) return createR2Store(bucket);
  const { createStore } = await import("@/server/node-storage");
  return createStore(getEnv(request, "DATA_DIR") ?? "./data");
}
