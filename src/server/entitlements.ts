// What an account may use. Everything is free for now; this is the one place a paid plan would
// gate a feature, so the rest of the code asks here and never checks a plan itself.
import { getEnv } from "./env";
import type { PublicUser } from "./auth/service";

export type Feature = "private_links";

/**
 * Whether `user` may use `feature`. Private links are on unless the server sets
 * `PRIVATE_LINKS=off` (or `false` or `0`).
 */
export function canUse(request: Request, _user: PublicUser, feature: Feature): boolean {
  if (feature === "private_links")
    return !["off", "false", "0"].includes(getEnv(request, "PRIVATE_LINKS")?.toLowerCase() ?? "");
  return false;
}
