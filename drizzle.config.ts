import { defineConfig } from "drizzle-kit";

// `bun run db:generate` writes SQL migrations that both D1 (wrangler d1 migrations apply) and the
// Node driver (drizzle migrator) understand.
export default defineConfig({
  dialect: "sqlite",
  schema: "./infra/db/schema.ts",
  out: "./infra/migrations",
});
