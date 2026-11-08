import { describe, expect, it } from "vitest";
import { commentMail, inviteMail } from "./mail";

const origin = "https://mdstudio.example";

describe("inviteMail", () => {
  it("tells the person where to go, and to use this address", () => {
    const mail = inviteMail(origin, "abc123abc123", "Q3 plan", "bea@x.co");
    expect(mail.to).toBe("bea@x.co");
    expect(mail.subject).toMatch(/invited/i);
    expect(mail.text).toContain("https://mdstudio.example/s/abc123abc123");
    expect(mail.text).toContain("Q3 plan");
    expect(mail.text).toMatch(/this email address/i);
    expect(mail.html).toContain('href="https://mdstudio.example/s/abc123abc123"');
  });

  it("escapes a title that tries to inject markup", () => {
    const mail = inviteMail(origin, "s", '<img src=x onerror="alert(1)">', "a@b.co");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.subject).not.toMatch(/[<>]/);
  });
});

describe("commentMail", () => {
  it("names the document and the author, and never quotes the comment", () => {
    const mail = commentMail(origin, "abc123abc123", "Q3 plan", "Bea", "ada@x.co");
    expect(mail.to).toBe("ada@x.co");
    expect(mail.text).toContain("Bea");
    expect(mail.text).toContain("Q3 plan");
    expect(mail.text).toContain("https://mdstudio.example/s/abc123abc123");
  });
});
