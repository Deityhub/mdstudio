// Self-hosted driver. Vite aliases this module to node-driver.stub.ts for the Workers build,
// so better-sqlite3 never reaches the Worker bundle.
import { resolve } from "node:path";
import { createNodeDb as open } from "../../infra/db/node";

// The bundle sits in .output/, so find migrations from the working directory (/app in Docker).
export const createNodeDb = (file: string) =>
  open(file, process.env["MIGRATIONS_DIR"] ?? resolve(process.cwd(), "infra/migrations"));
