// One schema, two drivers. Callers get the same typed Drizzle API either way:
//   Cloudflare Workers: createD1Db(env.DB)
//   Docker / Node:      createNodeDb("/data/studio.db")   (see infra/db/node.ts)
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { schema };

// D1 binding type comes from drizzle, so no Workers type package is needed.
export type D1Binding = Parameters<typeof drizzle>[0];

export const createD1Db = (d1: D1Binding) => drizzle(d1, { schema });
