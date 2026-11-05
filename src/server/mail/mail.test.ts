// @vitest-environment node
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fileMailer, smtpMailer } from "./node";
import { resendMailer } from "./resend";

const mail = { to: "ada@example.com", subject: "Verify", text: "Open the link" };

describe("resendMailer", () => {
  it("posts the message to Resend with the key", async () => {
    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    await resendMailer("re_key", "mdstudio <hi@x.co>", fetchFn)(mail);
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({
      from: "mdstudio <hi@x.co>",
      to: ["ada@example.com"],
      subject: "Verify",
      text: "Open the link",
    });
  });

  it("sends the HTML version too when the message has one", async () => {
    const fetchFn = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    await resendMailer("re_key", "a@b.co", fetchFn)({ ...mail, html: "<p>Open</p>" });
    const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(init.body)).toMatchObject({ text: "Open the link", html: "<p>Open</p>" });
  });

  it("throws when Resend refuses, without echoing the key", async () => {
    const fetchFn = (async () => new Response("bad", { status: 403 })) as typeof fetch;
    await expect(resendMailer("re_secret", "a@b.co", fetchFn)(mail)).rejects.toMatchObject({
      status: 403,
    });
    await expect(resendMailer("re_secret", "a@b.co", fetchFn)(mail)).rejects.toThrow(/403/);
    await expect(resendMailer("re_secret", "a@b.co", fetchFn)(mail)).rejects.not.toThrow(
      /re_secret/,
    );
  });
});

describe("node transports", () => {
  it("fileMailer writes each message as a JSON file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mdstudio-mail-"));
    await fileMailer(dir, "from@x.co")(mail);
    const [name] = await readdir(dir);
    expect(JSON.parse(await readFile(join(dir, name!), "utf8"))).toMatchObject({
      from: "from@x.co",
      ...mail,
    });
  });

  it("smtpMailer hands the message to the SMTP transport", async () => {
    const { createTransport } = await import("nodemailer");
    const sent = await (async () => {
      const transport = createTransport({ jsonTransport: true });
      const spy = vi.spyOn(transport, "sendMail");
      await smtpMailer(transport, "from@x.co")(mail);
      return spy.mock.calls[0]![0];
    })();
    expect(sent).toMatchObject({ from: "from@x.co", to: "ada@example.com", subject: "Verify" });
  });

  it("smtpMailer sends the HTML version alongside the text", async () => {
    const sendMail = vi.fn(async () => ({}));
    await smtpMailer({ sendMail } as never, "from@x.co")({ ...mail, html: "<p>Open</p>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Open the link", html: "<p>Open</p>" }),
    );
  });
});
