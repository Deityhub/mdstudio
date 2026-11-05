import { type Mailer, ProviderError } from "./types";

/** Sends through Resend's HTTP API: one request, so it runs on Workers and on Node alike. */
export const resendMailer =
  (apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer =>
  async ({ to, subject, text, html }) => {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
    });
    // Never include the response text or the key: either could end up in logs.
    if (!res.ok) throw new ProviderError(`Resend refused the message (${res.status})`, res.status);
  };
