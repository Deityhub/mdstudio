import type { Mail } from "../mail";
import { renderMail } from "../mail/template";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Sent to an address invited to edit a draft together: who, which draft, and where to find it. It says
 * nothing about whether the address has an account. `by` is the owner's display name, never an address.
 */
export const collabInviteMail = (origin: string, title: string, to: string, by: string): Mail => {
  const name = oneLine(title) || "a draft";
  const who = oneLine(by) || "Someone";
  return renderMail({
    to,
    subject: `${who} invited you to edit “${name}” together`.replace(/[<>]/g, ""),
    preheader: `${who} wants to write “${name}” with you on mdstudio.`,
    heading: "You're invited to edit a draft together",
    intro: [
      `${who} invited you to edit “${name}” with them on mdstudio, at the same time.`,
      "Sign in with this email address, or create an account with it, then open “Shared with you” in your library.",
    ],
    action: { label: "Open mdstudio", url: `${origin}/editor` },
    outro: [
      "Only people the owner named can open it. If you weren't expecting this, you can ignore this message.",
    ],
  });
};
