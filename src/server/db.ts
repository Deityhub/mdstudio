// One database handle for both deployments: D1 on Cloudflare (binding `DB`), better-sqlite3 in
// Docker (file in DATA_DIR). Callers always `await` queries; the Node driver is synchronous, which
// `await` hides, so the handle is typed as the async D1 flavour.
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { createD1Db, type D1Binding, type schema } from "../../infra/db/client";

export type Db = BaseSQLiteDatabase<"async", unknown, typeof schema>;

type Source = {
  d1?: D1Binding | undefined;
  dataDir?: string | undefined;
  loadNode?: () => Promise<{ createNodeDb: (file: string) => unknown }>;
};

const nodeDbs = new Map<string, Db>();

export async function openDb({ d1, dataDir, loadNode }: Source): Promise<Db> {
  if (d1) return createD1Db(d1) as unknown as Db;
  const file = `${dataDir ?? "./data"}/studio.db`;
  let db = nodeDbs.get(file);
  if (!db) {
    const { createNodeDb } = await (loadNode ?? (() => import("@/server/node-driver")))();
    db = createNodeDb(file) as Db;
    nodeDbs.set(file, db);
  }
  return db;
}

type CloudflareRequest = Request & { runtime?: { cloudflare?: { env?: { DB?: D1Binding } } } };

/** The database for the current request. */
export function getDb(request: Request) {
  return openDb({
    d1: (request as CloudflareRequest).runtime?.cloudflare?.env?.DB,
    dataDir: process.env["DATA_DIR"],
  });
}
