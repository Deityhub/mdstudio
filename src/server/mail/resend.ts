import type { Mailer } from "./types";

/** Sends through Resend's HTTP API: one request, so it runs on Workers and on Node alike. */
export const resendMailer =
  (apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer =>
  async ({ to, subject, text }) => {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    // Never include the response text or the key: either could end up in logs.
    if (!res.ok) throw new Error(`Resend refused the message (${res.status})`);
  };
