import { describe, expect, it } from "vitest";
import { renderMail } from "./template";

const base = {
  to: "ada@example.com",
  subject: "Confirm your email",
  preheader: "One click and you are in",
  heading: "Confirm your email",
  intro: ["Confirm your address to use the cloud."],
  action: { label: "Confirm email", url: "https://mdstudio.example/api/auth/verify?token=abc_-1" },
  outro: ["The link works once."],
};

describe("renderMail", () => {
  it("keeps the recipient and subject, and gives a plain-text version with the link", () => {
    const mail = renderMail(base);
    expect(mail.to).toBe("ada@example.com");
    expect(mail.subject).toBe("Confirm your email");
    expect(mail.text).toContain("Confirm your address to use the cloud.");
    expect(mail.text).toContain("https://mdstudio.example/api/auth/verify?token=abc_-1");
    expect(mail.text).toContain("The link works once.");
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });

  it("builds an HTML page with a button, the link spelled out, and the brand", () => {
    const html = renderMail(base).html!;
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('href="https://mdstudio.example/api/auth/verify?token=abc_-1"');
    expect(html).toContain("Confirm email");
    expect(html).toContain("<span");
    expect(html).toContain("studio");
    // the link is also written out, for clients that hide buttons
    expect(
      html.match(/https:\/\/mdstudio\.example\/api\/auth\/verify\?token=abc_-1/g)!.length,
    ).toBe(2);
  });

  it("hides the preheader, answers dark mode, and loads nothing remote", () => {
    const html = renderMail(base).html!;
    expect(html).toContain("One click and you are in");
    expect(html).toContain("display:none");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain('name="color-scheme"');
    expect(html).not.toMatch(/<img|<link|@import|url\(/i);
    expect(html).not.toContain("<script");
  });

  it("escapes anything it was given, so an address or label can't inject markup", () => {
    const html = renderMail({
      ...base,
      heading: '<b>Hi</b> & "you"',
      intro: ["<script>alert(1)</script>"],
      action: { label: "<i>Go</i>", url: 'https://x.example/?a=1&b="2"' },
    }).html!;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Hi</b>");
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;you&quot;");
    expect(html).toContain("&lt;i&gt;Go&lt;/i&gt;");
    expect(html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
  });
});
