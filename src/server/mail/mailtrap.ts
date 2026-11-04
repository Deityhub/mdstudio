import { type Mailer, ProviderError } from "./types";

/** "Name <a@b.co>" or "a@b.co" into the pieces Mailtrap wants. */
export function parseFrom(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? { name: m[1], email: m[2]! } : { email: (m?.[2] ?? from).trim() };
}

/** Sends through Mailtrap's transactional (Email Sending) API. */
export const mailtrapMailer =
  (token: string, from: string, fetchFn: typeof fetch = fetch): Mailer =>
  async ({ to, subject, text }) => {
    const res = await fetchFn("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ from: parseFrom(from), to: [{ email: to }], subject, text }),
    });
    if (!res.ok)
      throw new ProviderError(`Mailtrap refused the message (${res.status})`, res.status);
  };
