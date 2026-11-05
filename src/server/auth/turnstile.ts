/** Checks a Cloudflare Turnstile token. Anything but a clear "success" counts as a failure. */
export async function verifyTurnstile(
  secret: string,
  token: unknown,
  ip: string,
  fetchFn: typeof fetch = fetch,
) {
  if (typeof token !== "string" || !token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") form.set("remoteip", ip);
  try {
    const res = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    return res.ok && ((await res.json()) as { success?: unknown }).success === true;
  } catch {
    return false;
  }
}
