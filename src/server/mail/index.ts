import { getEnv } from "../env";
import { resendMailer } from "./resend";
import type { Mailer } from "./types";

export type { Mail, Mailer } from "./types";

const KEYS = ["RESEND_API_KEY", "MAIL_FROM", "SMTP_URL", "MAIL_OUTBOX_DIR"] as const;

/**
 * Which way mail goes out: Resend when it has a key (anywhere), else SMTP or the outbox folder on
 * Node. Needs MAIL_FROM. Null means this server sends no mail, and email verification stays off.
 */
export function pickMailer(
  env: Record<string, string | undefined>,
  node: ((env: Record<string, string | undefined>) => Mailer | null) | null,
): Mailer | null {
  const from = env["MAIL_FROM"];
  if (!from) return null;
  if (env["RESEND_API_KEY"]) return resendMailer(env["RESEND_API_KEY"], from);
  return node && (env["SMTP_URL"] || env["MAIL_OUTBOX_DIR"]) ? node(env) : null;
}

export async function getMailer(request: Request): Promise<Mailer | null> {
  const env = Object.fromEntries(KEYS.map((k) => [k, getEnv(request, k)]));
  const { createNodeMailer } = await import("@/server/node-mail");
  return pickMailer(env, createNodeMailer);
}
