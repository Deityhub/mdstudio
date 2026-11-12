import { join } from "node:path";
import Database from "better-sqlite3";
import type { APIRequestContext } from "@playwright/test";

export const password = "a long enough password";
export const email = (tag = "adm") =>
  `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

/** Signs an account up on the request's session and returns who it is. */
export async function signUp(request: APIRequestContext, address = email()) {
  await request.post("/api/auth/signup", { data: { email: address, password } });
  const { user } = await (await request.get("/api/auth/me")).json();
  return { address, id: user.id as string };
}

/**
 * Sets an account's role straight in the server's database, as the operator would with SQL. The
 * first account made on a server is its admin, so a spec running next to others (or first) cannot
 * count on a new account being an admin or a plain user: it sets the role it needs.
 */
function setRole(address: string, role: "admin" | "user", dir = process.env["E2E_DATA_DIR"]!) {
  const db = new Database(join(dir, "studio.db"));
  try {
    db.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, address);
  } finally {
    db.close();
  }
}

export const makeAdmin = (address: string, dir?: string) => setRole(address, "admin", dir);
/** The same on the server that sends mail. */
export const makeMailAdmin = (address: string) =>
  setRole(address, "admin", process.env["E2E_MAIL_DATA_DIR"]!);
export const makeUser = (address: string) => setRole(address, "user");
