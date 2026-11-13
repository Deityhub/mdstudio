import { describe, expect, it } from "vitest";
import { collabInviteMail } from "./mail";

const origin = "https://md.example.com";

describe("collabInviteMail", () => {
  it("links straight to the draft, in the text and in the button", () => {
    const mail = collabInviteMail(origin, "Q3 plan", "bea@x.co", "Ada", "Kq7mXw3NpR2a");
    expect(mail.to).toBe("bea@x.co");
    expect(mail.subject).toBe("Ada invited you to edit “Q3 plan” together");
    expect(mail.text).toContain(`${origin}/c/Kq7mXw3NpR2a`);
    expect(mail.html).toContain(`href="${origin}/c/Kq7mXw3NpR2a"`);
    expect(mail.text).toContain("Sign in with this email address");
  });

  it("never carries the owner's address or id, and says nothing about whether there is an account", () => {
    const mail = collabInviteMail(origin, "Notes", "bea@x.co", "Ada", "Kq7mXw3NpR2a");
    expect(mail.text).not.toMatch(/ada@/i);
    expect(mail.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no account id
    expect(mail.text).not.toMatch(/already (have|has) an account/i);
  });
});
