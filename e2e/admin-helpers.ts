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
 * Makes an account an admin straight in the server's database, as the operator would with SQL: the
 * first account made is the admin, which a spec running next to others cannot count on.
 */
export function makeAdmin(address: string) {
  const db = new Database(join(process.env["E2E_DATA_DIR"]!, "studio.db"));
  try {
    db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(address);
  } finally {
    db.close();
  }
}
