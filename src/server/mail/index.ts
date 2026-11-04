import { getDb } from "../db";
import { getEnv } from "../env";
import { sendWithChain } from "./chain";
import { MAIL_ENV_KEYS, providersFromEnv } from "./providers";
import type { Mailer } from "./types";

export type { Mail, Mailer } from "./types";

/**
 * The way this server sends mail: through whichever configured provider has the most room left,
 * falling back to the next on a failure (see chain.ts). Null means no provider is configured, so
 * this server sends no mail and email confirmation stays off.
 */
export async function getMailer(request: Request): Promise<Mailer | null> {
  const env = Object.fromEntries(MAIL_ENV_KEYS.map((k) => [k, getEnv(request, k)]));
  const { createNodeMailer } = await import("@/server/node-mail");
  const providers = providersFromEnv(env, createNodeMailer);
  if (!providers.length) return null;
  return async (mail) => {
    await sendWithChain(await getDb(request), providers, mail);
  };
}
