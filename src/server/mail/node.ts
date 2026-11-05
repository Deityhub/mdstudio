// Mail for self-hosted installs: any SMTP server, or a folder of JSON files for trying things out.
// Node only; Vite swaps it for a stub in the Workers build (see src/server/node-mail.stub.ts).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Transporter, createTransport } from "nodemailer";
import type { Mailer } from "./types";

export const smtpMailer =
  (transport: Pick<Transporter, "sendMail">, from: string): Mailer =>
  async ({ to, subject, text, html }) => {
    await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
  };

/** Writes each message to `<dir>/<time>-<random>.json`, so a test or a developer can read it. */
export const fileMailer =
  (dir: string, from: string): Mailer =>
  async (mail) => {
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`;
    await writeFile(join(dir, name), JSON.stringify({ from, ...mail }, null, 2));
  };

export function createNodeMailer(env: Record<string, string | undefined>): Mailer | null {
  const from = env["MAIL_FROM"];
  if (!from) return null;
  if (env["SMTP_URL"]) return smtpMailer(createTransport(env["SMTP_URL"]), from);
  if (env["MAIL_OUTBOX_DIR"]) return fileMailer(env["MAIL_OUTBOX_DIR"], from);
  return null;
}
