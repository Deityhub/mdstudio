// Object storage for hosted images: Cloudflare R2 on Workers, a mounted volume in Docker.
// Both implement ObjectStore, so callers never know which one they have.
export type StoredObject = { body: ArrayBuffer; contentType: string };

export type ObjectStore = {
  put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
};

/** Storage keys are `<userId>/<sha256>.<ext>`-style: no traversal, no absolute paths. */
export const isSafeKey = (key: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(key) && !key.includes("..");

export function assertSafeKey(key: string) {
  if (!isSafeKey(key)) throw new Error(`Unsafe storage key: ${key}`);
}
