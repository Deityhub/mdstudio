import { assertSafeKey, type ObjectStore } from "./index";

// The slice of the Workers R2 binding we use, so no Workers type package is needed.
export type R2BucketLike = {
  put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    opts: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string | undefined } | undefined;
  } | null>;
  delete(key: string): Promise<void>;
};

export const createR2Store = (bucket: R2BucketLike): ObjectStore => ({
  async put(key, body, contentType) {
    assertSafeKey(key);
    await bucket.put(key, body, { httpMetadata: { contentType } });
  },
  async get(key) {
    assertSafeKey(key);
    const obj = await bucket.get(key);
    if (!obj) return null;
    return {
      body: await obj.arrayBuffer(),
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
    };
  },
  async delete(key) {
    assertSafeKey(key);
    await bucket.delete(key);
  },
});
