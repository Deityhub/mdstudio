// Node-only: stores objects as files under a root directory (the Docker volume). The content type
// is kept in a `.type` sidecar file so reads can send the right header.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertSafeKey, type ObjectStore } from "./index";

export const createDiskStore = (root: string): ObjectStore => {
  const path = (key: string) => {
    assertSafeKey(key);
    return join(root, key);
  };
  return {
    async put(key, body, contentType) {
      const file = path(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, new Uint8Array(body));
      await writeFile(`${file}.type`, contentType);
    },
    async get(key) {
      const file = path(key);
      try {
        const [data, type] = await Promise.all([
          readFile(file),
          readFile(`${file}.type`, "utf8").catch(() => "application/octet-stream"),
        ]);
        return {
          body: data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ) as ArrayBuffer,
          contentType: type,
        };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      const file = path(key);
      await Promise.all([rm(file, { force: true }), rm(`${file}.type`, { force: true })]);
    },
  };
};
