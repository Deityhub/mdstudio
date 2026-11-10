import { getEnv } from "../env";
import type { Db } from "../db";
import { getLimits } from "./service";

/** What the signed-in account may use, with the server's settings applied (see catalog.ts). */
export const limitsFor = async (request: Request, db: Db, userId: string) =>
  (await getLimits(db, (name) => getEnv(request, name), userId)).values;
