import { describe, expect, it, vi } from "vitest";
import { mailtrapMailer } from "./mailtrap";
import { parseFrom, providersFromEnv } from "./providers";

describe("parseFrom", () => {
  it("splits a display name from the address", () => {
    expect(parseFrom("mdstudio <noreply@deityhub.com>")).toEqual({
      name: "mdstudio",
      email: "noreply@deityhub.com",
    });
    expect(parseFrom("noreply@deityhub.com")).toEqual({ email: "noreply@deityhub.com" });
    expect(parseFrom('"mdstudio, the editor" <a@b.co>')).toEqual({
      name: "mdstudio, the editor",
      email: "a@b.co",
    });
  });
});

describe("mailtrapMailer", () => {
  it("posts to the sending API with a bearer token", async () => {
    const fetchFn = vi.fn(async () => Response.json({ success: true })) as unknown as typeof fetch;
    await mailtrapMailer(
      "tok",
      "mdstudio <hi@x.co>",
      fetchFn,
    )({ to: "a@b.co", subject: "S", text: "T" });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://send.api.mailtrap.io/api/send");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      from: { email: "hi@x.co", name: "mdstudio" },
      to: [{ email: "a@b.co" }],
      subject: "S",
      text: "T",
    });
  });

  it("reports the status without the response text or the token", async () => {
    const fetchFn = (async () => new Response("secret tok", { status: 429 })) as typeof fetch;
    const error = await mailtrapMailer(
      "tok",
      "a@b.co",
      fetchFn,
    )({ to: "x@y.co", subject: "S", text: "T" }).catch((e) => e);
    expect(error.status).toBe(429);
    expect(error.message).not.toContain("tok");
  });
});

describe("providersFromEnv", () => {
  const base = { MAIL_FROM: "a@b.co" };
  const ids = (env: Record<string, string | undefined>) =>
    providersFromEnv(env, null).map((p) => p.id);

  it("uses every provider that has its key, in the order they are registered", () => {
    expect(ids({ ...base, RESEND_API_KEY: "r", MAILTRAP_API_TOKEN: "m" })).toEqual([
      "resend",
      "mailtrap",
    ]);
    expect(ids({ ...base, MAILTRAP_API_TOKEN: "m" })).toEqual(["mailtrap"]);
    expect(ids({ ...base })).toEqual([]);
  });

  it("needs a sender address", () => {
    expect(ids({ RESEND_API_KEY: "r", MAILTRAP_API_TOKEN: "m" })).toEqual([]);
  });

  it("MAIL_PROVIDERS picks and orders them, ignoring unknown names", () => {
    const env = { ...base, RESEND_API_KEY: "r", MAILTRAP_API_TOKEN: "m" };
    expect(ids({ ...env, MAIL_PROVIDERS: "mailtrap, resend" })).toEqual(["mailtrap", "resend"]);
    expect(ids({ ...env, MAIL_PROVIDERS: "mailtrap,nope" })).toEqual(["mailtrap"]);
  });

  it("starts from each provider's free-tier limits, which the environment can change", () => {
    const [resend, mailtrap] = providersFromEnv(
      { ...base, RESEND_API_KEY: "r", MAILTRAP_API_TOKEN: "m", MAIL_MAILTRAP_DAILY: "50" },
      null,
    );
    expect(resend!.caps).toEqual({ daily: 100, monthly: 3000 });
    expect(mailtrap!.caps).toEqual({ daily: 50, monthly: 4000 });
  });

  it("adds the Node-only senders (SMTP, the outbox) when there are any, without limits", () => {
    const node = () => async () => {};
    const [smtp] = providersFromEnv({ ...base, SMTP_URL: "smtp://x" }, node);
    expect(smtp).toMatchObject({ id: "smtp", caps: { daily: Infinity, monthly: Infinity } });
    expect(providersFromEnv({ ...base, SMTP_URL: "smtp://x" }, null)).toEqual([]);
  });
});
