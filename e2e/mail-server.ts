// Helpers for specs that run against the server that sends mail (see playwright.config.ts): where
// it is, how to read what it sent, and how to look like different visitors to its limits.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";

export const SITE = process.env["E2E_MAIL_URL"]!;
const MAIL_DIR = process.env["E2E_MAIL_DIR"]!;

export const password = "a long enough password";
export const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const visitor = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}-${unique()}`;
/** A header that makes the server see a new visitor (it trusts X-Forwarded-For here). */
export const asVisitor = (ip = visitor()) => ({ "x-forwarded-for": ip });

export type Sent = { to: string; subject: string; text: string };

/** Every message so far, oldest first. A file still being written is skipped until it is whole. */
export function outbox(): Sent[] {
  return readdirSync(MAIL_DIR)
    .sort()
    .flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(join(MAIL_DIR, f), "utf8")) as Sent];
      } catch {
        return [];
      }
    });
}

/** The newest message sent to an address, once it has arrived. */
export async function mailTo(address: string, subject?: RegExp): Promise<Sent> {
  let found: Sent | undefined;
  await expect
    .poll(() => {
      found = outbox()
        .filter((m) => m.to === address && (!subject || subject.test(m.subject)))
        .at(-1);
      return found !== undefined;
    })
    .toBe(true);
  return found!;
}

export const linkIn = (mail: Sent) => new URL(mail.text.match(/https?:\/\/\S+/)![0]);

/** How many messages have gone to an address so far. */
export const sentTo = (address: string, subject?: RegExp) =>
  outbox().filter((m) => m.to === address && (!subject || subject.test(m.subject))).length;

export const signUp = (request: APIRequestContext, email: string, headers = asVisitor()) =>
  request.post("/api/auth/signup", { data: { email, password }, headers });
