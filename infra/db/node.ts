// Node-only driver for the self-hosted container. Kept apart from client.ts so the Workers bundle
// never imports better-sqlite3.
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export const MIGRATIONS_DIR = resolve(import.meta.dirname, "../migrations");

/** Opens (creating if needed) a SQLite file with foreign keys on and WAL for concurrent reads. */
export function createNodeDb(file: string, migrationsFolder = MIGRATIONS_DIR) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  if (file !== ":memory:") sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return Object.assign(db, { close: () => sqlite.close() });
}
