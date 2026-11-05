// The providers mdstudio can send mail through, and how each is switched on.
//
// To add one (SendGrid, Brevo, Mailjet, ...): write `<name>.ts` with a `Mailer` like resend.ts, then
// add one entry to PROVIDERS below with its id, its free-tier limits and the environment variable
// that holds its key. Nothing else changes: the chain, the limits counting and MAIL_PROVIDERS pick
// it up by id, and `MAIL_<ID>_DAILY` / `MAIL_<ID>_MONTHLY` can adjust its limits.
import type { Caps, ConfiguredProvider } from "./chain";
import { mailtrapMailer } from "./mailtrap";
import { resendMailer } from "./resend";
import type { Mailer } from "./types";

export { parseFrom } from "./mailtrap";

type Env = Record<string, string | undefined>;
export type ProviderDef = {
  id: string;
  /** What the free plan allows, per UTC day and per month. */
  caps: Caps;
  make: (env: Env, from: string) => Mailer | null;
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "resend",
    caps: { daily: 100, monthly: 3000 },
    make: (env, from) => (env["RESEND_API_KEY"] ? resendMailer(env["RESEND_API_KEY"], from) : null),
  },
  {
    id: "mailtrap",
    caps: { daily: 150, monthly: 4000 },
    make: (env, from) =>
      env["MAILTRAP_API_TOKEN"] ? mailtrapMailer(env["MAILTRAP_API_TOKEN"], from) : null,
  },
];

/** Environment variables the mail setup reads, for `getEnv` to collect. */
export const MAIL_ENV_KEYS = [
  "MAIL_FROM",
  "MAIL_PROVIDERS",
  "SMTP_URL",
  "MAIL_OUTBOX_DIR",
  ...PROVIDERS.flatMap((p) => {
    const id = p.id.toUpperCase();
    return [`MAIL_${id}_DAILY`, `MAIL_${id}_MONTHLY`];
  }),
  "RESEND_API_KEY",
  "MAILTRAP_API_TOKEN",
];

const limit = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
};

/**
 * Every provider that is configured, in the order they were registered, or the order of
 * `MAIL_PROVIDERS` when that is set. Node installs add SMTP or the file outbox, which have no
 * limits. Needs MAIL_FROM; with nothing configured the list is empty and mail is off.
 */
export function providersFromEnv(
  env: Env,
  node: ((env: Env) => Mailer | null) | null,
): ConfiguredProvider[] {
  const from = env["MAIL_FROM"];
  if (!from) return [];
  const all: ConfiguredProvider[] = [];
  for (const def of PROVIDERS) {
    const send = def.make(env, from);
    if (!send) continue;
    const id = def.id.toUpperCase();
    all.push({
      id: def.id,
      send,
      caps: {
        daily: limit(env[`MAIL_${id}_DAILY`], def.caps.daily),
        monthly: limit(env[`MAIL_${id}_MONTHLY`], def.caps.monthly),
      },
    });
  }
  if (node && (env["SMTP_URL"] || env["MAIL_OUTBOX_DIR"])) {
    const send = node(env);
    if (send)
      all.push({
        id: env["SMTP_URL"] ? "smtp" : "outbox",
        send,
        caps: { daily: Infinity, monthly: Infinity },
      });
  }
  const wanted = env["MAIL_PROVIDERS"]
    ?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted?.length) return all;
  return wanted.flatMap((id) => all.filter((p) => p.id === id));
}
